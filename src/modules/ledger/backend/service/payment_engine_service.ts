import { db } from '../../../../core/backend/db';
import { ValidationError, NotFoundError } from '../../../../core/backend/errors';
import { auditLogger, logger } from '../../../../core/backend/logger';
import { ledgerService } from './ledger_service';

export interface PaymentReceiptInput {
  direction: 'payment' | 'receipt';
  payment_method: 'cash' | 'bank' | 'upi' | 'card';
  party_type?: 'supplier' | 'customer' | 'other';
  party_id?: number | null;
  party_name?: string | null;
  category?: string | null;
  amount_paise: number;
  payment_date: string;
  narration?: string | null;
  reference_number?: string | null;
  idempotency_key?: string | null;
  allocations?: Array<{
    bill_type: 'purchase_invoice' | 'sale_invoice';
    bill_id: number;
    bill_number: string;
    allocated_amount_paise: number;
  }>;
}

export interface ContraEntryInput {
  from_account: 'cash' | 'bank';
  to_account: 'cash' | 'bank';
  amount_paise: number;
  entry_date: string;
  narration?: string | null;
}

const LIVE_BILL_PAID_SQL = `
  MIN(
    pi.total_amount_paise,
    COALESCE((
      SELECT SUM(pa.allocated_amount_paise)
      FROM payment_allocations pa
      JOIN payments_receipts pr ON pr.id = pa.payment_receipt_id
      WHERE pa.bill_type = 'purchase_invoice'
        AND pa.bill_id = pi.id
        AND COALESCE(pr.is_reversed, 0) = 0
        AND pr.reversed_payment_id IS NULL
    ), 0) + COALESCE((
      SELECT SUM(spa.allocated_amount_paise)
      FROM supplier_payment_allocations spa
      WHERE spa.purchase_invoice_id = pi.id
    ), 0) + CASE
      WHEN NOT EXISTS (SELECT 1 FROM payment_allocations pa WHERE pa.bill_type = 'purchase_invoice' AND pa.bill_id = pi.id)
       AND NOT EXISTS (SELECT 1 FROM supplier_payment_allocations spa WHERE spa.purchase_invoice_id = pi.id)
      THEN COALESCE(pi.paid_amount_paise, 0)
      ELSE 0
    END
  )
`;

const LIVE_BILL_OUTSTANDING_SQL = `
  MAX(0, pi.total_amount_paise - (${LIVE_BILL_PAID_SQL}))
`;

export class PaymentEngineService {
  constructor() {
    this.ensureSchemaColumns();
  }

  /**
   * Safe runtime schema self-healing for reversals, idempotency, and purchase_invoices columns
   */
  private ensureSchemaColumns() {
    try {
      const prCols = db.prepare('PRAGMA table_info(payments_receipts)').all() as any[];
      const prColNames = new Set(prCols.map((c) => c.name));
      if (!prColNames.has('idempotency_key')) {
        db.exec('ALTER TABLE payments_receipts ADD COLUMN idempotency_key TEXT;');
      }
      if (!prColNames.has('is_reversed')) {
        db.exec('ALTER TABLE payments_receipts ADD COLUMN is_reversed INTEGER NOT NULL DEFAULT 0;');
      }
      if (!prColNames.has('reversed_at')) {
        db.exec('ALTER TABLE payments_receipts ADD COLUMN reversed_at DATETIME;');
      }
      if (!prColNames.has('reversal_reason')) {
        db.exec('ALTER TABLE payments_receipts ADD COLUMN reversal_reason TEXT;');
      }
      if (!prColNames.has('reversed_by')) {
        db.exec('ALTER TABLE payments_receipts ADD COLUMN reversed_by INTEGER;');
      }
      if (!prColNames.has('reversed_payment_id')) {
        db.exec('ALTER TABLE payments_receipts ADD COLUMN reversed_payment_id INTEGER;');
      }
      if (!prColNames.has('reference_number')) {
        db.exec('ALTER TABLE payments_receipts ADD COLUMN reference_number TEXT;');
      }
      db.exec(
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_rec_idempotency ON payments_receipts(idempotency_key) WHERE idempotency_key IS NOT NULL;'
      );
    } catch {
      // Safe fallback
    }

    try {
      const piCols = db.prepare('PRAGMA table_info(purchase_invoices)').all() as any[];
      const piColNames = new Set(piCols.map((c) => c.name));
      if (!piColNames.has('due_date')) {
        db.exec('ALTER TABLE purchase_invoices ADD COLUMN due_date TEXT;');
      }
      if (!piColNames.has('updated_at')) {
        db.exec('ALTER TABLE purchase_invoices ADD COLUMN updated_at DATETIME;');
      }
    } catch {
      // Safe fallback
    }

    try {
      db.prepare("INSERT INTO system_settings (key, value) VALUES ('supplier_credit_days', '0') ON CONFLICT(key) DO NOTHING;").run();
    } catch {
      // Safe fallback
    }
  }

  /**
   * Generate sequential voucher number
   */
  private generateVoucherNumber(direction: 'payment' | 'receipt' | 'contra', dateStr: string): string {
    const cleanDate = dateStr.replace(/[^0-9]/g, '').slice(0, 8);
    const prefix = direction === 'payment' ? 'PAY' : direction === 'receipt' ? 'REC' : 'CNT';

    const table = direction === 'contra' ? 'contra_entries' : 'payments_receipts';
    const countRow = db
      .prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE date(created_at) = date('now') OR voucher_number LIKE ?`)
      .get(`${prefix}-${cleanDate}-%`) as { cnt: number };
    const seq = String((countRow?.cnt || 0) + 1).padStart(3, '0');
    return `${prefix}-${cleanDate}-${seq}`;
  }

  /**
   * Helper to recompute and persist a purchase invoice's paid_amount_paise, outstanding_amount_paise, and payment_status
   */
  private syncPurchaseInvoiceBalance(billId: number): void {
    const pi = db
      .prepare(
        `
        SELECT
          pi.id,
          pi.total_amount_paise,
          COALESCE((
            SELECT SUM(pa.allocated_amount_paise)
            FROM payment_allocations pa
            JOIN payments_receipts pr ON pr.id = pa.payment_receipt_id
            WHERE pa.bill_type = 'purchase_invoice'
              AND pa.bill_id = pi.id
              AND COALESCE(pr.is_reversed, 0) = 0
              AND pr.reversed_payment_id IS NULL
          ), 0) AS pr_paid_paise,
          COALESCE((
            SELECT SUM(spa.allocated_amount_paise)
            FROM supplier_payment_allocations spa
            WHERE spa.purchase_invoice_id = pi.id
          ), 0) AS sp_paid_paise
        FROM purchase_invoices pi
        WHERE pi.id = ?
      `
      )
      .get(billId) as { id: number; total_amount_paise: number; pr_paid_paise: number; sp_paid_paise: number } | undefined;

    if (!pi) return;

    const activePaidPaise = Math.min(pi.total_amount_paise, (pi.pr_paid_paise || 0) + (pi.sp_paid_paise || 0));
    const outstandingPaise = Math.max(0, pi.total_amount_paise - activePaidPaise);
    const dbStatus: 'paid' | 'partially_paid' | 'unpaid' =
      outstandingPaise === 0 ? 'paid' : activePaidPaise > 0 ? 'partially_paid' : 'unpaid';

    db.prepare(
      `
      UPDATE purchase_invoices
      SET paid_amount_paise = ?,
          outstanding_amount_paise = ?,
          payment_status = ?
      WHERE id = ?
    `
    ).run(activePaidPaise, outstandingPaise, dbStatus, billId);
  }

  /**
   * Helper to append a row to supplier_ledger and re-sync suppliers.outstanding_balance_paise
   */
  private appendSupplierLedgerAndSync(params: {
    supplierId: number;
    entryDate: string;
    refType: 'payment' | 'adjustment';
    refId: number;
    description: string;
    debitPaise: number;
    creditPaise: number;
  }): void {
    const lastRow = db
      .prepare(
        `SELECT running_balance_paise FROM supplier_ledger WHERE supplier_id = ? ORDER BY id DESC LIMIT 1`
      )
      .get(params.supplierId) as { running_balance_paise: number } | undefined;

    const suppRow = db
      .prepare(`SELECT opening_balance_paise, outstanding_balance_paise FROM suppliers WHERE id = ?`)
      .get(params.supplierId) as { opening_balance_paise?: number; outstanding_balance_paise?: number } | undefined;

    const baseBalance =
      lastRow?.running_balance_paise !== undefined
        ? Number(lastRow.running_balance_paise)
        : Number(suppRow?.outstanding_balance_paise ?? suppRow?.opening_balance_paise ?? 0);

    const nextRunningBalance = baseBalance + (params.creditPaise || 0) - (params.debitPaise || 0);

    db.prepare(
      `
      INSERT INTO supplier_ledger (
        supplier_id, entry_date, ref_type, ref_id, description,
        debit_paise, credit_paise, running_balance_paise, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', CURRENT_TIMESTAMP)
    `
    ).run(
      params.supplierId,
      params.entryDate,
      params.refType,
      params.refId,
      params.description,
      params.debitPaise || 0,
      params.creditPaise || 0,
      nextRunningBalance
    );

    db.prepare(
      `
      UPDATE suppliers
      SET outstanding_balance_paise = COALESCE(opening_balance_paise, 0) + COALESCE((
          SELECT SUM(credit_paise) - SUM(debit_paise)
          FROM supplier_ledger
          WHERE supplier_ledger.supplier_id = suppliers.id
            AND COALESCE(supplier_ledger.status, 'approved') != 'rejected'
      ), 0)
      WHERE id = ?
    `
    ).run(params.supplierId);
  }

  /**
   * Alias for recordPaymentReceipt
   */
  public recordPaymentOrReceipt(input: PaymentReceiptInput, userId: number) {
    return this.recordPaymentReceipt(input, userId);
  }

  /**
   * Record a Payment (money out) or Receipt (money in) with bill allocations.
   * Updates purchase_invoices, supplier_ledger, suppliers.outstanding_balance_paise,
   * store_cash_box, and accounting_daily_ledger (balanced Debit/Credit) in a single transaction.
   */
  public recordPaymentReceipt(input: PaymentReceiptInput, userId: number) {
    this.ensureSchemaColumns();

    if (!input.amount_paise || input.amount_paise <= 0) {
      throw new ValidationError('Amount must be greater than zero');
    }
    if (!input.payment_date) {
      throw new ValidationError('Payment date is required');
    }
    if (!input.payment_method) {
      throw new ValidationError('Payment mode is required');
    }

    // 1. Idempotency Check
    if (input.idempotency_key) {
      const existing = db
        .prepare('SELECT id FROM payments_receipts WHERE idempotency_key = ?')
        .get(input.idempotency_key) as any;
      if (existing) {
        logger.info(
          `Idempotent duplicate request intercepted for key: ${input.idempotency_key}. Returning existing voucher #${existing.id}`
        );
        return this.getVoucher(existing.id);
      }
    }

    const allocations = input.allocations || [];
    const totalAllocatedPaise = allocations.reduce((sum, a) => sum + a.allocated_amount_paise, 0);

    if (totalAllocatedPaise > input.amount_paise) {
      throw new ValidationError(
        `Allocated amount (₹${(totalAllocatedPaise / 100).toFixed(2)}) cannot exceed total payment amount (₹${(
          input.amount_paise / 100
        ).toFixed(2)})`
      );
    }

    // 2. Hard Validation: Check each allocated bill's live outstanding balance
    for (const alloc of allocations) {
      if (alloc.allocated_amount_paise <= 0) continue;

      if (alloc.bill_type === 'purchase_invoice') {
        const pi = db
          .prepare(
            `
          SELECT
            pi.id,
            pi.total_amount_paise,
            (${LIVE_BILL_PAID_SQL}) as paid_paise,
            (${LIVE_BILL_OUTSTANDING_SQL}) as live_outstanding_paise
          FROM purchase_invoices pi
          WHERE pi.id = ?
        `
          )
          .get(alloc.bill_id) as any;

        if (!pi) throw new NotFoundError(`Purchase invoice #${alloc.bill_id} not found`);

        const liveOutstandingPaise = Math.max(0, Number(pi.live_outstanding_paise || 0));
        if (alloc.allocated_amount_paise > liveOutstandingPaise) {
          throw new ValidationError(
            `Payment amount ₹${(alloc.allocated_amount_paise / 100).toFixed(
              2
            )} exceeds the current outstanding balance of ₹${(liveOutstandingPaise / 100).toFixed(2)} for Bill ${
              alloc.bill_number
            }.`
          );
        }
      }
    }

    const unallocatedPaise = input.amount_paise - totalAllocatedPaise;

    const fn = db.transaction(() => {
      const voucherNumber = this.generateVoucherNumber(input.direction, input.payment_date);

      let partyName = input.party_name || null;
      if (input.party_type === 'supplier' && input.party_id && !partyName) {
        const supp = db.prepare('SELECT company_name, name FROM suppliers WHERE id = ?').get(input.party_id) as any;
        if (supp) partyName = supp.company_name || supp.name;
      } else if (input.party_type === 'customer' && input.party_id && !partyName) {
        const cust = db.prepare('SELECT name FROM customers WHERE id = ?').get(input.party_id) as any;
        if (cust) partyName = cust.name;
      }

      const narrationText =
        [input.narration?.trim(), input.reference_number ? `Ref: ${input.reference_number.trim()}` : null]
          .filter(Boolean)
          .join(' | ') || null;

      // 1. Insert master voucher row into payments_receipts
      const stmt = db.prepare(`
        INSERT INTO payments_receipts (
          voucher_number, direction, payment_method, party_type, party_id, party_name,
          category, amount_paise, allocated_amount_paise, unallocated_amount_paise,
          payment_date, narration, idempotency_key, is_reversed, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
      `);

      const res = stmt.run(
        voucherNumber,
        input.direction,
        input.payment_method,
        input.party_type || 'other',
        input.party_id || null,
        partyName,
        input.category?.trim() || null,
        input.amount_paise,
        totalAllocatedPaise,
        unallocatedPaise,
        input.payment_date,
        narrationText,
        input.idempotency_key || null,
        userId
      );

      const voucherId = Number(res.lastInsertRowid);

      // 2. Insert bill allocations & update bill outstanding balances
      for (const alloc of allocations) {
        if (alloc.allocated_amount_paise <= 0) continue;

        db.prepare(`
          INSERT INTO payment_allocations (
            payment_receipt_id, bill_type, bill_id, bill_number, allocated_amount_paise, created_at
          ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).run(voucherId, alloc.bill_type, alloc.bill_id, alloc.bill_number, alloc.allocated_amount_paise);

        if (alloc.bill_type === 'purchase_invoice') {
          this.syncPurchaseInvoiceBalance(alloc.bill_id);
        } else if (alloc.bill_type === 'sale_invoice') {
          db.prepare(`
            INSERT INTO payments (invoice_id, method, amount_paise, reference_number, received_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).run(alloc.bill_id, input.payment_method, alloc.allocated_amount_paise, voucherNumber);

          const inv = db
            .prepare(
              `
            SELECT total_paise, (SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE invoice_id = invoices.id) as total_paid
            FROM invoices WHERE id = ?
          `
            )
            .get(alloc.bill_id) as any;
          if (inv) {
            const newStatus = inv.total_paid >= inv.total_paise ? 'paid' : 'partial';
            db.prepare('UPDATE invoices SET payment_status = ? WHERE id = ?').run(newStatus, alloc.bill_id);
          }
        }
      }

      // 3. Update Supplier Running Balance & real supplier_ledger table
      if (input.party_type === 'supplier' && input.party_id) {
        if (input.direction === 'payment') {
          this.appendSupplierLedgerAndSync({
            supplierId: input.party_id,
            entryDate: input.payment_date,
            refType: 'payment',
            refId: voucherId,
            description: `Payment Voucher #${voucherNumber} (${input.payment_method.toUpperCase()})${
              narrationText ? ' - ' + narrationText : ''
            }`,
            debitPaise: input.amount_paise,
            creditPaise: 0,
          });
        }
      }

      // 4. Update Customer Credit Ledger if customer receipt
      if (input.party_type === 'customer' && input.party_id) {
        if (input.direction === 'receipt') {
          try {
            db.prepare(`
              UPDATE customers
              SET current_credit_paise = MAX(0, COALESCE(current_credit_paise, 0) - ?)
              WHERE id = ?
            `).run(input.amount_paise, input.party_id);
          } catch {
            // Safe fallback
          }

          try {
            db.prepare(`
              INSERT INTO customer_credit_ledger (
                customer_id, transaction_type, amount_paise, reference_type, reference_id, notes, created_by, created_at
              ) VALUES (?, 'payment', ?, 'payment_voucher', ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
              input.party_id,
              input.amount_paise,
              voucherId,
              `Receipt Voucher #${voucherNumber} (${input.payment_method.toUpperCase()})`,
              userId
            );
          } catch {
            // Safe fallback
          }
        }
      }

      // 5. Update store_cash_box if payment_method === 'cash'
      if (input.payment_method === 'cash') {
        try {
          const entryType = input.direction === 'receipt' ? 'cash_in' : 'cash_out';
          const cat = input.direction === 'receipt' ? 'Voucher Receipt' : 'Voucher Payment';
          db.prepare(`
            INSERT INTO store_cash_box (
              entry_type, category, amount_paise, description, reference_id, recorded_by, is_active, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
          `).run(
            entryType,
            cat,
            input.amount_paise,
            `${input.direction === 'payment' ? 'Payment' : 'Receipt'} Voucher #${voucherNumber}${
              partyName ? ` (${partyName})` : ''
            }`,
            voucherNumber,
            userId
          );

          // Also sync with open POS session in shift_cash_movements if active
          const openSession = db.prepare("SELECT id FROM pos_sessions WHERE status = 'Open' LIMIT 1").get() as { id: number } | undefined;
          if (openSession) {
            const moveType = input.direction === 'receipt' ? 'cash_in' : 'cash_out';
            db.prepare(`
              INSERT INTO shift_cash_movements
              (store_id, session_id, movement_type, category, amount_paise, reason, added_by, taken_by, is_active, created_by)
              VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            `).run(
              openSession.id,
              moveType,
              'Supplier Payment',
              input.amount_paise,
              `Voucher #${voucherNumber}: ${partyName || ''}`,
              input.direction === 'receipt' ? partyName : null,
              input.direction === 'payment' ? partyName : null,
              userId
            );
          }
        } catch {
          // Safe fallback
        }
      }

      // 6. Post balanced Double-Entry rows to accounting_daily_ledger
      const liquidAccount = input.payment_method === 'cash' ? 'Cash' : 'Bank';
      const debitAccount =
        input.direction === 'payment'
          ? input.party_type === 'supplier'
            ? 'Supplier'
            : 'Expense'
          : liquidAccount;
      const creditAccount =
        input.direction === 'payment'
          ? liquidAccount
          : input.party_type === 'customer'
          ? 'Customer'
          : 'Sales';

      ledgerService.postDoubleEntry({
        date: input.payment_date,
        referenceId: voucherNumber,
        description: `${input.direction === 'payment' ? 'Payment' : 'Receipt'} Voucher #${voucherNumber}${
          partyName ? ` - ${partyName}` : ''
        }${narrationText ? ` (${narrationText})` : ''}`,
        debitAccount,
        creditAccount,
        amountPaise: input.amount_paise,
        partyType:
          input.party_type === 'supplier'
            ? 'Supplier'
            : input.party_type === 'customer'
            ? 'Customer'
            : 'Other',
        partyId: input.party_id || null,
        partyName: partyName || input.category || null,
        createdBy: userId,
        voucherGroupId: `VCH-PR-${voucherId}`,
        sourceModule: 'PAYMENT_ENGINE',
      });

      auditLogger.log(userId, 'PAYMENT_RECEIPT_RECORDED', {
        voucherId,
        voucherNumber,
        direction: input.direction,
        amountPaise: input.amount_paise,
        partyName,
        method: input.payment_method,
      });

      return this.getVoucher(voucherId);
    });

    return fn();
  }

  /**
   * Reverse a recorded payment/receipt voucher with an immutable linked reversal entry.
   * Restores bill outstanding balances, supplier_ledger, store_cash_box, and accounting_daily_ledger.
   */
  public reversePayment(paymentReceiptId: number, reason: string, userId: number) {
    this.ensureSchemaColumns();

    if (!reason || !reason.trim()) {
      throw new ValidationError('A mandatory reason is required to reverse a payment');
    }

    const orig = db.prepare('SELECT * FROM payments_receipts WHERE id = ?').get(paymentReceiptId) as any;
    if (!orig) throw new NotFoundError(`Payment voucher #${paymentReceiptId} not found`);
    if (orig.is_reversed === 1) {
      throw new ValidationError(`Payment voucher #${orig.voucher_number} is already reversed`);
    }
    if (orig.reversed_payment_id) {
      throw new ValidationError(`Cannot reverse a reversal entry`);
    }

    const allocations = db
      .prepare('SELECT * FROM payment_allocations WHERE payment_receipt_id = ?')
      .all(paymentReceiptId) as any[];

    const fn = db.transaction(() => {
      // 1. Mark original payment as reversed
      db.prepare(`
        UPDATE payments_receipts
        SET is_reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversal_reason = ?, reversed_by = ?
        WHERE id = ?
      `).run(reason.trim(), userId, paymentReceiptId);

      // 2. Insert linked reversal record (marked with reversed_payment_id = paymentReceiptId)
      const revVoucherNumber = `REV-${orig.voucher_number}`;
      const revStmt = db.prepare(`
        INSERT INTO payments_receipts (
          voucher_number, direction, payment_method, party_type, party_id, party_name,
          category, amount_paise, allocated_amount_paise, unallocated_amount_paise,
          payment_date, narration, is_reversed, reversed_at, reversal_reason, reversed_payment_id, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE('now'), ?, 0, CURRENT_TIMESTAMP, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

      const revRes = revStmt.run(
        revVoucherNumber,
        orig.direction,
        orig.payment_method,
        orig.party_type,
        orig.party_id,
        orig.party_name,
        orig.category,
        orig.amount_paise,
        orig.allocated_amount_paise,
        orig.unallocated_amount_paise,
        `Reversal of Voucher #${orig.voucher_number}: ${reason.trim()}`,
        reason.trim(),
        paymentReceiptId,
        userId
      );

      const revVoucherId = Number(revRes.lastInsertRowid);

      // 3. Re-sync bill balances (since orig.is_reversed is now 1, its allocations are automatically excluded)
      for (const alloc of allocations) {
        if (alloc.bill_type === 'purchase_invoice') {
          this.syncPurchaseInvoiceBalance(alloc.bill_id);
        } else if (alloc.bill_type === 'sale_invoice') {
          db.prepare('DELETE FROM payments WHERE invoice_id = ? AND reference_number = ?').run(
            alloc.bill_id,
            orig.voucher_number
          );
          const inv = db
            .prepare(
              `
            SELECT total_paise, (SELECT COALESCE(SUM(amount_paise), 0) FROM payments WHERE invoice_id = invoices.id) as total_paid
            FROM invoices WHERE id = ?
          `
            )
            .get(alloc.bill_id) as any;
          if (inv) {
            const newStatus = inv.total_paid >= inv.total_paise ? 'paid' : inv.total_paid > 0 ? 'partial' : 'unpaid';
            db.prepare('UPDATE invoices SET payment_status = ? WHERE id = ?').run(newStatus, alloc.bill_id);
          }
        }
      }

      // 4. Restore Supplier Profile Balance & real supplier_ledger
      if (orig.party_type === 'supplier' && orig.party_id) {
        if (orig.direction === 'payment') {
          this.appendSupplierLedgerAndSync({
            supplierId: orig.party_id,
            entryDate: new Date().toISOString().slice(0, 10),
            refType: 'adjustment',
            refId: revVoucherId,
            description: `Reversal of Payment Voucher #${orig.voucher_number} - Reason: ${reason.trim()}`,
            debitPaise: 0,
            creditPaise: orig.amount_paise,
          });
        }
      }

      // 5. Restore Customer Credit Balance
      if (orig.party_type === 'customer' && orig.party_id) {
        if (orig.direction === 'receipt') {
          try {
            db.prepare(`
              UPDATE customers
              SET current_credit_paise = COALESCE(current_credit_paise, 0) + ?
              WHERE id = ?
            `).run(orig.amount_paise, orig.party_id);
          } catch {
            // Safe fallback
          }

          try {
            db.prepare(`
              INSERT INTO customer_credit_ledger (
                customer_id, transaction_type, amount_paise, reference_type, reference_id, notes, created_by, created_at
              ) VALUES (?, 'adjustment', ?, 'reversal', ?, ?, ?, CURRENT_TIMESTAMP)
            `).run(
              orig.party_id,
              orig.amount_paise,
              revVoucherId,
              `Reversal of Receipt Voucher #${orig.voucher_number} - ${reason.trim()}`,
              userId
            );
          } catch {
            // Safe fallback
          }
        }
      }

      // 6. Reverse store_cash_box if cash
      if (orig.payment_method === 'cash') {
        try {
          db.prepare(`UPDATE store_cash_box SET is_active = 0 WHERE reference_id = ?`).run(orig.voucher_number);
          db.prepare(`
            UPDATE shift_cash_movements
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE reason LIKE ?
          `).run(`%Voucher #${orig.voucher_number}%`);
        } catch {
          // Safe fallback
        }
      }

      // 7. Post reversing Double-Entry rows to accounting_daily_ledger
      const liquidAccount = orig.payment_method === 'cash' ? 'Cash' : 'Bank';
      const origDebitAccount =
        orig.direction === 'payment'
          ? orig.party_type === 'supplier'
            ? 'Supplier'
            : 'Expense'
          : liquidAccount;
      const origCreditAccount =
        orig.direction === 'payment'
          ? liquidAccount
          : orig.party_type === 'customer'
          ? 'Customer'
          : 'Sales';

      ledgerService.postDoubleEntry({
        date: new Date().toISOString().slice(0, 10),
        referenceId: revVoucherNumber,
        description: `Reversal of #${orig.voucher_number}: ${reason.trim()}`,
        debitAccount: origCreditAccount,
        creditAccount: origDebitAccount,
        amountPaise: orig.amount_paise,
        partyType:
          orig.party_type === 'supplier'
            ? 'Supplier'
            : orig.party_type === 'customer'
            ? 'Customer'
            : 'Other',
        partyId: orig.party_id || null,
        partyName: orig.party_name || orig.category || null,
        createdBy: userId,
        voucherGroupId: `VCH-REV-${revVoucherId}`,
        sourceModule: 'PAYMENT_REVERSAL',
      });

      auditLogger.log(userId, 'PAYMENT_REVERSED', {
        originalVoucherId: paymentReceiptId,
        originalVoucherNumber: orig.voucher_number,
        reversalVoucherNumber: revVoucherNumber,
        reason: reason.trim(),
        amountPaise: orig.amount_paise,
      });

      return {
        success: true,
        message: `Voucher #${orig.voucher_number} has been reversed successfully. Reversal entry #${revVoucherNumber} created.`,
        reversalVoucherId: revVoucherId,
        reversalVoucherNumber: revVoucherNumber,
      };
    });

    return fn();
  }

  /**
   * Get all Purchase Bills with live calculated balances and filters
   */
  public getOutstandingPurchaseBills(filters?: {
    status?: 'outstanding' | 'paid' | 'unpaid' | 'partial' | 'all';
    supplierId?: number;
    search?: string;
    sortBy?: 'due_date' | 'total_amount' | 'outstanding' | 'supplier';
    sortOrder?: 'asc' | 'desc';
  }) {
    this.ensureSchemaColumns();

    let sql = `
      SELECT
        pi.id,
        pi.invoice_number,
        pi.supplier_invoice_number,
        pi.purchase_ref_number,
        pi.supplier_id,
        COALESCE(s.name, s.company_name, 'Supplier #' || pi.supplier_id) as supplier_name,
        COALESCE(s.company_name, s.name, 'Supplier #' || pi.supplier_id) as supplier_company,
        pi.invoice_date,
        COALESCE(pi.due_date, pi.expected_payment_date) as due_date,
        pi.total_amount_paise,
        (${LIVE_BILL_PAID_SQL}) as paid_amount_paise,
        (${LIVE_BILL_OUTSTANDING_SQL}) as outstanding_balance_paise,
        CASE
          WHEN COALESCE(pi.due_date, pi.expected_payment_date) IS NOT NULL
          THEN MAX(0, CAST((julianday('now') - julianday(COALESCE(pi.due_date, pi.expected_payment_date))) AS INTEGER))
          ELSE 0
        END as days_overdue,
        pi.status as invoice_status,
        (
          CASE
            WHEN (${LIVE_BILL_OUTSTANDING_SQL}) <= 0 THEN 'paid'
            WHEN (${LIVE_BILL_PAID_SQL}) > 0 THEN 'partial'
            ELSE 'unpaid'
          END
        ) as computed_payment_status
      FROM purchase_invoices pi
      LEFT JOIN suppliers s ON s.id = pi.supplier_id
      WHERE COALESCE(pi.status, 'approved') NOT IN ('rejected', 'draft')
    `;

    const params: any[] = [];

    if (filters?.supplierId) {
      sql += ' AND pi.supplier_id = ?';
      params.push(filters.supplierId);
    }

    if (filters?.search && filters.search.trim()) {
      const q = `%${filters.search.trim()}%`;
      sql +=
        ' AND (pi.supplier_invoice_number LIKE ? OR pi.invoice_number LIKE ? OR pi.purchase_ref_number LIKE ? OR s.name LIKE ? OR s.company_name LIKE ?)';
      params.push(q, q, q, q, q);
    }

    const statusFilter = filters?.status || 'outstanding';
    if (statusFilter === 'outstanding') {
      sql += ` AND (${LIVE_BILL_OUTSTANDING_SQL}) > 0`;
    } else if (statusFilter === 'paid') {
      sql += ` AND (${LIVE_BILL_OUTSTANDING_SQL}) <= 0`;
    } else if (statusFilter === 'unpaid') {
      sql += ` AND (${LIVE_BILL_OUTSTANDING_SQL}) > 0 AND (${LIVE_BILL_PAID_SQL}) = 0`;
    } else if (statusFilter === 'partial') {
      sql += ` AND (${LIVE_BILL_OUTSTANDING_SQL}) > 0 AND (${LIVE_BILL_PAID_SQL}) > 0`;
    }

    const sortOrder = filters?.sortOrder === 'desc' ? 'DESC' : 'ASC';
    if (filters?.sortBy === 'total_amount') {
      sql += ` ORDER BY pi.total_amount_paise ${sortOrder}, pi.id DESC`;
    } else if (filters?.sortBy === 'outstanding') {
      sql += ` ORDER BY outstanding_balance_paise ${sortOrder}, pi.id DESC`;
    } else if (filters?.sortBy === 'supplier') {
      sql += ` ORDER BY COALESCE(s.company_name, s.name) ${sortOrder}, pi.id DESC`;
    } else {
      sql += ` ORDER BY COALESCE(pi.due_date, pi.expected_payment_date, pi.invoice_date) ${sortOrder}, pi.id DESC`;
    }

    return db.prepare(sql).all(...params);
  }

  /**
   * Get full payment history for a specific bill (Purchase or Sale)
   */
  public getBillPaymentHistory(billType: 'purchase_invoice' | 'sale_invoice', billId: number) {
    const allocations = db
      .prepare(
        `
      SELECT
        pa.id as allocation_id,
        pa.allocated_amount_paise,
        pa.created_at as allocated_at,
        pr.id as voucher_id,
        pr.voucher_number,
        pr.payment_method,
        pr.payment_date,
        pr.direction,
        pr.narration,
        pr.is_reversed,
        pr.reversed_at,
        pr.reversal_reason,
        pr.reversed_payment_id,
        u.full_name as created_by_name
      FROM payment_allocations pa
      JOIN payments_receipts pr ON pr.id = pa.payment_receipt_id
      LEFT JOIN users u ON u.id = pr.created_by
      WHERE pa.bill_type = ? AND pa.bill_id = ?
      ORDER BY pr.payment_date DESC, pr.id DESC
    `
      )
      .all(billType, billId) as any[];

    if (billType === 'purchase_invoice') {
      const suppAllocs = db
        .prepare(
          `
        SELECT
          spa.id as allocation_id,
          spa.allocated_amount_paise,
          sp.created_at as allocated_at,
          sp.id as voucher_id,
          COALESCE(sp.reference_number, 'SPAY-' || sp.id) as voucher_number,
          sp.payment_method,
          sp.payment_date,
          'payment' as direction,
          sp.notes as narration,
          0 as is_reversed,
          NULL as reversed_at,
          NULL as reversal_reason,
          NULL as reversed_payment_id,
          u.full_name as created_by_name
        FROM supplier_payment_allocations spa
        JOIN supplier_payments sp ON sp.id = spa.supplier_payment_id
        LEFT JOIN users u ON u.id = sp.created_by
        WHERE spa.purchase_invoice_id = ?
        ORDER BY sp.payment_date DESC, sp.id DESC
      `
        )
        .all(billId) as any[];
      allocations.push(...suppAllocs);
    }

    const totalPaidPaise = allocations
      .filter((a) => a.is_reversed === 0 && !a.reversed_payment_id)
      .reduce((sum, a) => sum + a.allocated_amount_paise, 0);

    return {
      allocations,
      totalPaidPaise,
    };
  }

  /**
   * Get open unpaid/partially paid bills for a supplier or customer
   */
  public getOpenBills(partyType: 'supplier' | 'customer', partyId: number) {
    this.ensureSchemaColumns();
    if (!partyId) return [];

    if (partyType === 'supplier') {
      const rows = db
        .prepare(
          `
        SELECT
          pi.id,
          pi.invoice_number,
          pi.supplier_invoice_number,
          pi.purchase_ref_number,
          pi.invoice_date,
          COALESCE(pi.due_date, pi.expected_payment_date) as due_date,
          pi.total_amount_paise,
          (${LIVE_BILL_PAID_SQL}) as paid_amount_paise,
          (${LIVE_BILL_OUTSTANDING_SQL}) as outstanding_balance_paise,
          CASE
            WHEN COALESCE(pi.due_date, pi.expected_payment_date) IS NOT NULL
            THEN MAX(0, CAST((julianday('now') - julianday(COALESCE(pi.due_date, pi.expected_payment_date))) AS INTEGER))
            ELSE 0
          END as days_overdue
        FROM purchase_invoices pi
        WHERE pi.supplier_id = ?
          AND COALESCE(pi.status, 'approved') NOT IN ('rejected', 'draft')
          AND (${LIVE_BILL_OUTSTANDING_SQL}) > 0
        ORDER BY COALESCE(pi.due_date, pi.expected_payment_date, pi.invoice_date) ASC, pi.id ASC
      `
        )
        .all(partyId) as any[];

      return rows.map((r) => ({
        ...r,
        bill_type: 'purchase_invoice',
        bill_number: r.supplier_invoice_number || r.purchase_ref_number || r.invoice_number,
      }));
    } else {
      const rows = db
        .prepare(
          `
        SELECT
          i.id,
          i.invoice_number,
          i.completed_at as invoice_date,
          i.total_paise as total_amount_paise,
          COALESCE((SELECT SUM(amount_paise) FROM payments WHERE invoice_id = i.id), 0) as paid_amount_paise,
          (i.total_paise - COALESCE((SELECT SUM(amount_paise) FROM payments WHERE invoice_id = i.id), 0)) as outstanding_balance_paise
        FROM invoices i
        WHERE i.customer_id = ?
          AND i.status = 'completed'
          AND (i.payment_status != 'paid' OR i.total_paise > COALESCE((SELECT SUM(amount_paise) FROM payments WHERE invoice_id = i.id), 0))
        ORDER BY i.completed_at ASC, i.id ASC
      `
        )
        .all(partyId) as any[];

      return rows.map((r) => ({
        ...r,
        bill_type: 'sale_invoice',
        bill_number: r.invoice_number || `INV-${r.id}`,
      }));
    }
  }

  /**
   * Record Contra Entry (Cash ⇄ Bank transfer)
   */
  public recordContraEntry(input: ContraEntryInput, userId: number) {
    if (!input.amount_paise || input.amount_paise <= 0) {
      throw new ValidationError('Amount must be greater than zero');
    }
    if (input.from_account === input.to_account) {
      throw new ValidationError('Source and destination accounts must be different');
    }

    const voucherNumber = this.generateVoucherNumber('contra', input.entry_date);

    db.prepare(`
      INSERT INTO contra_entries (
        voucher_number, from_account, to_account, amount_paise, entry_date, narration, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      voucherNumber,
      input.from_account,
      input.to_account,
      input.amount_paise,
      input.entry_date,
      input.narration?.trim() || null,
      userId
    );

    const debitAcc = input.to_account === 'cash' ? 'Cash' : 'Bank';
    const creditAcc = input.from_account === 'cash' ? 'Cash' : 'Bank';
    ledgerService.postDoubleEntry({
      date: input.entry_date,
      referenceId: voucherNumber,
      description: `Contra Transfer (${input.from_account.toUpperCase()} → ${input.to_account.toUpperCase()})${
        input.narration ? ': ' + input.narration : ''
      }`,
      debitAccount: debitAcc,
      creditAccount: creditAcc,
      amountPaise: input.amount_paise,
      createdBy: userId,
      voucherGroupId: `VCH-CNT-${voucherNumber}`,
      sourceModule: 'CONTRA',
    });

    auditLogger.log(userId, 'CONTRA_TRANSFER_RECORDED', {
      voucherNumber,
      fromAccount: input.from_account,
      toAccount: input.to_account,
      amountPaise: input.amount_paise,
    });

    return { success: true, voucherNumber };
  }

  /**
   * Alias for getBalances
   */
  public getLiquidBalances() {
    return this.getBalances();
  }

  /**
   * Derive Cash-in-hand and Bank/UPI balances from real active transactions only
   * (ignoring voided invoices and inactive cashbox rows).
   */
  public getBalances() {
    this.ensureSchemaColumns();

    // 1. Payments & Receipts (excluding reversed vouchers)
    const payRec = db
      .prepare(
        `
      SELECT
        LOWER(payment_method) as payment_method,
        direction,
        COALESCE(SUM(amount_paise), 0) as total_paise
      FROM payments_receipts
      WHERE COALESCE(is_reversed, 0) = 0 AND reversed_payment_id IS NULL
      GROUP BY LOWER(payment_method), direction
    `
      )
      .all() as any[];

    let cashInPaise = 0;
    let cashOutPaise = 0;
    let bankInPaise = 0;
    let bankOutPaise = 0;

    for (const r of payRec) {
      if (r.payment_method === 'cash') {
        if (r.direction === 'receipt') cashInPaise += Number(r.total_paise || 0);
        else cashOutPaise += Number(r.total_paise || 0);
      } else {
        if (r.direction === 'receipt') bankInPaise += Number(r.total_paise || 0);
        else bankOutPaise += Number(r.total_paise || 0);
      }
    }

    // 2. Direct POS Cash Sales (strictly completed invoices only, ignoring voided/draft/returned)
    const posCashSales =
      (
        db
          .prepare(
            `
      SELECT COALESCE(SUM(p.amount_paise), 0) as total_cash_sales
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      WHERE LOWER(p.method) = 'cash' AND i.status = 'completed'
    `
          )
          .get() as any
      )?.total_cash_sales || 0;

    // 3. Direct POS UPI / Card / Bank Sales (strictly completed invoices only)
    const posBankSales =
      (
        db
          .prepare(
            `
      SELECT COALESCE(SUM(p.amount_paise), 0) as total_bank_sales
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      WHERE LOWER(p.method) IN ('upi', 'card', 'bank') AND i.status = 'completed'
    `
          )
          .get() as any
      )?.total_bank_sales || 0;

    // 4. Direct Supplier Payments from Procurement (supplier_payments table)
    const suppPayRows = db
      .prepare(
        `
      SELECT LOWER(payment_method) as method, COALESCE(SUM(amount_paise), 0) as total_paise
      FROM supplier_payments
      GROUP BY LOWER(payment_method)
    `
      )
      .all() as { method: string; total_paise: number }[];

    for (const sp of suppPayRows) {
      if (sp.method === 'cash') {
        cashOutPaise += Number(sp.total_paise || 0);
      } else {
        bankOutPaise += Number(sp.total_paise || 0);
      }
    }

    // 5. Active Store Cash Box manual entries (is_active = 1, excluding entries already counted via sales/vouchers/supplier_payments)
    try {
      const cbRows = db
        .prepare(
          `
        SELECT entry_type, COALESCE(SUM(amount_paise), 0) as total_paise
        FROM store_cash_box
        WHERE COALESCE(is_active, 1) = 1
          AND COALESCE(category, '') NOT IN ('Sale', 'POS Sale', 'Supplier Payment', 'Voucher Payment', 'Voucher Receipt')
        GROUP BY entry_type
      `
        )
        .all() as { entry_type: string; total_paise: number }[];
      for (const cb of cbRows) {
        if (cb.entry_type === 'cash_in') cashInPaise += Number(cb.total_paise || 0);
        else if (cb.entry_type === 'cash_out') cashOutPaise += Number(cb.total_paise || 0);
      }
    } catch {
      // Safe fallback
    }

    // 6. Contra Transfers
    const contraTransfers = db
      .prepare(
        `
      SELECT from_account, to_account, COALESCE(SUM(amount_paise), 0) as total_paise
      FROM contra_entries
      GROUP BY from_account, to_account
    `
      )
      .all() as any[];

    let cashToBankPaise = 0;
    let bankToCashPaise = 0;

    for (const c of contraTransfers) {
      if (c.from_account === 'cash' && c.to_account === 'bank') {
        cashToBankPaise += Number(c.total_paise || 0);
      } else if (c.from_account === 'bank' && c.to_account === 'cash') {
        bankToCashPaise += Number(c.total_paise || 0);
      }
    }

    const totalCashInHandPaise = (posCashSales + cashInPaise + bankToCashPaise) - (cashOutPaise + cashToBankPaise);
    const totalBankBalancePaise = (posBankSales + bankInPaise + cashToBankPaise) - (bankOutPaise + bankToCashPaise);

    return {
      cashInHandPaise: totalCashInHandPaise,
      bankBalancePaise: totalBankBalancePaise,
      totalLiquidFundsPaise: totalCashInHandPaise + totalBankBalancePaise,
      posCashSalesPaise: posCashSales,
      posBankSalesPaise: posBankSales,
    };
  }

  /**
   * Get single voucher details by ID
   */
  public getVoucher(id: number) {
    const voucher = db
      .prepare(
        `
      SELECT pr.*, u.full_name as created_by_name
      FROM payments_receipts pr
      LEFT JOIN users u ON u.id = pr.created_by
      WHERE pr.id = ?
    `
      )
      .get(id) as any;

    if (!voucher) throw new NotFoundError('Voucher not found');

    voucher.allocations = db
      .prepare(
        `
      SELECT * FROM payment_allocations WHERE payment_receipt_id = ?
    `
      )
      .all(id);

    return voucher;
  }

  /**
   * Get Payment & Receipt Register
   */
  public getRegister(filters: {
    startDate?: string;
    endDate?: string;
    direction?: string;
    paymentMethod?: string;
    partyType?: string;
    partyId?: number;
    search?: string;
    includeReversals?: boolean;
    limit?: number;
    offset?: number;
  }) {
    this.ensureSchemaColumns();

    let sql = `
      SELECT pr.*, u.full_name as created_by_name,
        (SELECT COUNT(*) FROM payment_allocations pa WHERE pa.payment_receipt_id = pr.id) as allocation_count
      FROM payments_receipts pr
      LEFT JOIN users u ON u.id = pr.created_by
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters.startDate) {
      sql += ' AND date(pr.payment_date) >= date(?)';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ' AND date(pr.payment_date) <= date(?)';
      params.push(filters.endDate);
    }
    if (filters.direction && filters.direction !== 'all') {
      sql += ' AND pr.direction = ?';
      params.push(filters.direction);
    }
    if (filters.paymentMethod && filters.paymentMethod !== 'all') {
      sql += ' AND pr.payment_method = ?';
      params.push(filters.paymentMethod);
    }
    if (filters.partyType && filters.partyType !== 'all') {
      sql += ' AND pr.party_type = ?';
      params.push(filters.partyType);
    }
    if (filters.partyId) {
      sql += ' AND pr.party_id = ?';
      params.push(filters.partyId);
    }
    if (filters.search) {
      sql +=
        ' AND (pr.voucher_number LIKE ? OR pr.party_name LIKE ? OR pr.narration LIKE ? OR pr.category LIKE ?)';
      const s = `%${filters.search}%`;
      params.push(s, s, s, s);
    }

    sql += ' ORDER BY pr.payment_date DESC, pr.id DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
      if (filters.offset) {
        sql += ' OFFSET ?';
        params.push(filters.offset);
      }
    }

    const vouchers = db.prepare(sql).all(...params) as any[];

    let totalPaymentsPaise = 0;
    let totalReceiptsPaise = 0;

    for (const v of vouchers) {
      if (v.is_reversed === 0 && !v.reversed_payment_id) {
        if (v.direction === 'payment') totalPaymentsPaise += v.amount_paise;
        else totalReceiptsPaise += v.amount_paise;
      }
    }

    return {
      vouchers,
      summary: {
        totalPaymentsPaise,
        totalReceiptsPaise,
        netCashFlowPaise: totalReceiptsPaise - totalPaymentsPaise,
        count: vouchers.length,
      },
    };
  }

  /**
   * Get outstanding/due purchase invoices list
   */
  public getDuePurchasesList(filters?: { supplierId?: number; startDate?: string; endDate?: string }) {
    return this.getOutstandingPurchaseBills({
      status: 'outstanding',
      supplierId: filters?.supplierId,
    });
  }

  /**
   * Single source of truth returning integer paise for a vendor's total outstanding balance.
   */
  public getVendorOutstanding(supplierId: number): number {
    this.ensureSchemaColumns();
    const row = db
      .prepare(
        `
      SELECT COALESCE(SUM(${LIVE_BILL_OUTSTANDING_SQL}), 0) as total_outstanding_paise
      FROM purchase_invoices pi
      WHERE pi.supplier_id = ?
        AND COALESCE(pi.status, 'approved') NOT IN ('rejected', 'draft')
    `
      )
      .get(supplierId) as { total_outstanding_paise: number } | undefined;
    return Math.max(0, Number(row?.total_outstanding_paise || 0));
  }

  /**
   * Get the global supplier credit days setting (default: 0 = disabled)
   */
  public getSupplierCreditDays(): number {
    try {
      const row = db
        .prepare("SELECT value FROM system_settings WHERE key = 'supplier_credit_days'")
        .get() as { value: string } | undefined;
      return row ? parseInt(row.value, 10) || 0 : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Update the global supplier credit days setting
   */
  public updateSupplierCreditDays(days: number): { success: boolean; credit_days: number } {
    const val = Math.max(0, Math.floor(Number(days) || 0));
    db.prepare(`
      INSERT INTO system_settings (key, value)
      VALUES ('supplier_credit_days', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(String(val));
    return { success: true, credit_days: val };
  }

  /**
   * Aggregates purchase payables strictly by vendor (ONE record per vendor).
   * Calculates live balances, oldest pending bill age in days, last payment, and bills list.
   * Sorts vendor tiles with oldest pending bill first.
   */
  public getVendorPayablesSummary(filters?: { search?: string }) {
    this.ensureSchemaColumns();
    const creditDays = this.getSupplierCreditDays();

    // Query all suppliers who have purchase bills (or suppliers with active status)
    const sql = `
      SELECT
        s.id as supplier_id,
        COALESCE(s.name, s.company_name, 'Supplier #' || s.id) as supplier_name,
        COALESCE(s.company_name, s.name, 'Supplier #' || s.id) as supplier_company,
        s.phone,
        s.mobile_phone,
        COALESCE(SUM(${LIVE_BILL_OUTSTANDING_SQL}), 0) as total_outstanding_paise,
        COALESCE(SUM(pi.total_amount_paise), 0) as total_purchased_paise,
        COUNT(CASE WHEN (${LIVE_BILL_OUTSTANDING_SQL}) > 0 THEN 1 END) as pending_bills_count,
        COUNT(pi.id) as total_bills_count
      FROM suppliers s
      JOIN purchase_invoices pi ON pi.supplier_id = s.id AND COALESCE(pi.status, 'approved') NOT IN ('rejected', 'draft')
      GROUP BY s.id
    `;

    const rawVendors = db.prepare(sql).all() as any[];

    // For each vendor, fetch bills and last payment info
    const vendorsList = rawVendors.map((v) => {
      const bills = db.prepare(`
        SELECT
          pi.id,
          pi.invoice_number,
          pi.supplier_invoice_number,
          pi.purchase_ref_number,
          pi.supplier_id,
          pi.invoice_date,
          pi.created_at,
          pi.total_amount_paise,
          (${LIVE_BILL_PAID_SQL}) as paid_amount_paise,
          (${LIVE_BILL_OUTSTANDING_SQL}) as outstanding_balance_paise,
          CAST(MAX(0, julianday('now') - julianday(pi.invoice_date)) AS INTEGER) as days_old,
          (
            CASE
              WHEN (${LIVE_BILL_OUTSTANDING_SQL}) <= 0 THEN 'paid'
              WHEN (${LIVE_BILL_PAID_SQL}) > 0 THEN 'partial'
              ELSE 'unpaid'
            END
          ) as computed_payment_status
        FROM purchase_invoices pi
        WHERE pi.supplier_id = ?
          AND COALESCE(pi.status, 'approved') NOT IN ('rejected', 'draft')
        ORDER BY pi.invoice_date ASC, pi.created_at ASC, pi.id ASC
      `).all(v.supplier_id) as any[];

      const pendingBills = bills.filter((b) => b.outstanding_balance_paise > 0);
      const oldestPendingBill = pendingBills.length > 0 ? pendingBills[0] : null;

      // Fetch last payment
      const lastPayment = db.prepare(`
        SELECT payment_date, amount_paise
        FROM (
          SELECT payment_date, amount_paise, created_at, id
          FROM payments_receipts
          WHERE party_type = 'supplier' AND party_id = ? AND COALESCE(is_reversed, 0) = 0 AND reversed_payment_id IS NULL
          UNION ALL
          SELECT pr.payment_date, pa.allocated_amount_paise as amount_paise, pr.created_at, pr.id
          FROM payment_allocations pa
          JOIN payments_receipts pr ON pr.id = pa.payment_receipt_id
          JOIN purchase_invoices pi ON pi.id = pa.bill_id
          WHERE pa.bill_type = 'purchase_invoice' AND pi.supplier_id = ? AND COALESCE(pr.is_reversed, 0) = 0 AND pr.reversed_payment_id IS NULL
        )
        ORDER BY payment_date DESC, id DESC
        LIMIT 1
      `).get(v.supplier_id, v.supplier_id) as { payment_date: string; amount_paise: number } | undefined;

      const oldestBillDays = oldestPendingBill ? Math.max(0, oldestPendingBill.days_old) : 0;
      const isOverdue = creditDays > 0 && oldestBillDays > creditDays;

      return {
        supplier_id: v.supplier_id,
        supplier_name: v.supplier_name,
        supplier_company: v.supplier_company,
        phone: v.phone || v.mobile_phone || null,
        total_outstanding_paise: Number(v.total_outstanding_paise || 0),
        total_purchased_paise: Number(v.total_purchased_paise || 0),
        pending_bills_count: Number(v.pending_bills_count || 0),
        total_bills_count: Number(v.total_bills_count || 0),
        oldest_bill_date: oldestPendingBill ? oldestPendingBill.invoice_date : null,
        oldest_bill_days: oldestBillDays,
        last_payment_date: lastPayment?.payment_date || null,
        last_payment_amount_paise: lastPayment?.amount_paise ? Number(lastPayment.amount_paise) : null,
        credit_days: creditDays,
        is_overdue: isOverdue,
        bills,
      };
    });

    // Filter by search if provided
    let filteredVendors = vendorsList;
    if (filters?.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      filteredVendors = filteredVendors.filter(
        (v) =>
          v.supplier_name.toLowerCase().includes(q) ||
          v.supplier_company.toLowerCase().includes(q) ||
          (v.phone && v.phone.toLowerCase().includes(q)) ||
          v.bills.some((b: any) =>
            (b.supplier_invoice_number || b.invoice_number || '').toLowerCase().includes(q)
          )
      );
    }

    // Pending vendors: only vendors with total_outstanding_paise > 0
    const pendingVendors = filteredVendors.filter((v) => v.total_outstanding_paise > 0);

    // Sort tiles by oldest pending bill first (oldest_bill_days DESC, then total_outstanding DESC)
    pendingVendors.sort((a, b) => {
      if (b.oldest_bill_days !== a.oldest_bill_days) {
        return b.oldest_bill_days - a.oldest_bill_days;
      }
      return b.total_outstanding_paise - a.total_outstanding_paise;
    });

    // Top of page stats
    const allPending = vendorsList.filter((v) => v.total_outstanding_paise > 0);
    const totalPayablePaise = allPending.reduce((sum, v) => sum + v.total_outstanding_paise, 0);
    const vendorsCount = allPending.length;
    const pendingBillsCount = allPending.reduce((sum, v) => sum + v.pending_bills_count, 0);

    return {
      summary: {
        total_payable_paise: totalPayablePaise,
        vendors_count: vendorsCount,
        pending_bills_count: pendingBillsCount,
        supplier_credit_days: creditDays,
      },
      vendors: pendingVendors,
      all_vendors: filteredVendors,
    };
  }

  /**
   * Cashier pays any amount to a vendor.
   * By default, automatically allocates to bills in strict FIFO order (oldest bill first).
   * Atomically posts payment voucher, allocations, bill balances, cash/bank movement, and ledger.
   */
  public recordVendorPayment(
    input: {
      supplier_id: number;
      amount_paise: number;
      payment_method: 'cash' | 'bank' | 'upi' | 'card';
      payment_date: string;
      reference_number?: string | null;
      narration?: string | null;
      idempotency_key?: string | null;
      manual_allocations?: Array<{
        bill_id: number;
        allocated_amount_paise: number;
      }>;
    },
    userId: number
  ) {
    this.ensureSchemaColumns();

    if (!input.amount_paise || input.amount_paise <= 0) {
      throw new ValidationError('Payment amount must be greater than zero');
    }
    if (!input.payment_date) {
      throw new ValidationError('Payment date is required');
    }

    const supp = db
      .prepare('SELECT id, name, company_name FROM suppliers WHERE id = ?')
      .get(input.supplier_id) as any;
    if (!supp) throw new NotFoundError(`Supplier #${input.supplier_id} not found`);
    const supplierName = supp.company_name || supp.name;

    const totalOutstanding = this.getVendorOutstanding(input.supplier_id);
    if (input.amount_paise > totalOutstanding) {
      throw new ValidationError(
        `Payment amount ₹${(input.amount_paise / 100).toFixed(
          2
        )} exceeds total outstanding balance of ₹${(totalOutstanding / 100).toFixed(2)} for ${supplierName}.`
      );
    }

    // Fetch pending bills for this supplier in strict FIFO order:
    // invoice_date ASC, created_at ASC, id ASC
    const pendingBills = db
      .prepare(
        `
      SELECT
        pi.id,
        pi.invoice_number,
        pi.supplier_invoice_number,
        pi.purchase_ref_number,
        pi.invoice_date,
        pi.created_at,
        pi.total_amount_paise,
        (${LIVE_BILL_PAID_SQL}) as paid_amount_paise,
        (${LIVE_BILL_OUTSTANDING_SQL}) as outstanding_balance_paise
      FROM purchase_invoices pi
      WHERE pi.supplier_id = ?
        AND COALESCE(pi.status, 'approved') NOT IN ('rejected', 'draft')
        AND (${LIVE_BILL_OUTSTANDING_SQL}) > 0
      ORDER BY pi.invoice_date ASC, pi.created_at ASC, pi.id ASC
    `
      )
      .all(input.supplier_id) as any[];

    let computedAllocations: Array<{
      bill_type: 'purchase_invoice';
      bill_id: number;
      bill_number: string;
      allocated_amount_paise: number;
    }> = [];

    if (input.manual_allocations && input.manual_allocations.length > 0) {
      const sumManual = input.manual_allocations.reduce((sum, a) => sum + a.allocated_amount_paise, 0);
      if (sumManual !== input.amount_paise) {
        throw new ValidationError(
          `Manual allocations sum (₹${(sumManual / 100).toFixed(2)}) must exactly equal payment amount (₹${(
            input.amount_paise / 100
          ).toFixed(2)}).`
        );
      }

      const pendingMap = new Map<number, any>(pendingBills.map((b) => [b.id, b]));
      for (const m of input.manual_allocations) {
        if (m.allocated_amount_paise <= 0) continue;
        const b = pendingMap.get(m.bill_id);
        if (!b) throw new ValidationError(`Bill #${m.bill_id} is not an outstanding bill for this vendor.`);
        if (m.allocated_amount_paise > b.outstanding_balance_paise) {
          throw new ValidationError(
            `Allocated amount ₹${(m.allocated_amount_paise / 100).toFixed(
              2
            )} exceeds current balance of ₹${(b.outstanding_balance_paise / 100).toFixed(2)} on bill ${
              b.supplier_invoice_number || b.invoice_number
            }.`
          );
        }
        computedAllocations.push({
          bill_type: 'purchase_invoice',
          bill_id: b.id,
          bill_number: b.supplier_invoice_number || b.purchase_ref_number || b.invoice_number,
          allocated_amount_paise: m.allocated_amount_paise,
        });
      }
    } else {
      // Automatic FIFO allocation: oldest bill first
      let remaining = input.amount_paise;
      for (const bill of pendingBills) {
        if (remaining <= 0) break;
        const alloc = Math.min(remaining, bill.outstanding_balance_paise);
        if (alloc > 0) {
          computedAllocations.push({
            bill_type: 'purchase_invoice',
            bill_id: bill.id,
            bill_number: bill.supplier_invoice_number || bill.purchase_ref_number || bill.invoice_number,
            allocated_amount_paise: alloc,
          });
          remaining -= alloc;
        }
      }
    }

    // Call recordPaymentReceipt in ONE transaction
    const voucher = this.recordPaymentReceipt(
      {
        direction: 'payment',
        payment_method: input.payment_method,
        party_type: 'supplier',
        party_id: input.supplier_id,
        party_name: supplierName,
        category: 'Supplier Payment',
        amount_paise: input.amount_paise,
        payment_date: input.payment_date,
        reference_number: input.reference_number,
        narration: input.narration,
        idempotency_key: input.idempotency_key,
        allocations: computedAllocations,
      },
      userId
    );

    // Calculate outcomes
    let clearedCount = 0;
    let partialCount = 0;
    for (const alloc of computedAllocations) {
      const origBill = pendingBills.find((b) => b.id === alloc.bill_id);
      if (origBill) {
        if (alloc.allocated_amount_paise >= origBill.outstanding_balance_paise) {
          clearedCount++;
        } else {
          partialCount++;
        }
      }
    }

    const remainingBalancePaise = Math.max(0, totalOutstanding - input.amount_paise);
    const amountFormatted = `₹${(input.amount_paise / 100).toFixed(2)}`;
    const remainingFormatted = `₹${(remainingBalancePaise / 100).toFixed(2)}`;

    let outcomeText = '';
    if (clearedCount > 0 && partialCount > 0) {
      outcomeText = `${clearedCount} bill${clearedCount > 1 ? 's' : ''} cleared, ${partialCount} partly paid`;
    } else if (clearedCount > 0) {
      outcomeText = `${clearedCount} bill${clearedCount > 1 ? 's' : ''} cleared`;
    } else if (partialCount > 0) {
      outcomeText = `${partialCount} bill partly paid`;
    } else {
      outcomeText = 'No bills cleared';
    }

    const message = `${amountFormatted} paid to ${supplierName}. ${outcomeText}. Balance ${remainingFormatted}.`;

    return {
      voucher,
      cleared_bills_count: clearedCount,
      partial_bills_count: partialCount,
      remaining_balance_paise: remainingBalancePaise,
      allocations: computedAllocations,
      message,
    };
  }

  /**
   * Payables Health Check: Verifies stored purchase bill balances against
   * the sum of real non-reversed allocations. Reports differences with optional auto-repair.
   */
  public checkPayablesHealth(options?: { autoRepair?: boolean }) {
    this.ensureSchemaColumns();

    const bills = db
      .prepare(
        `
      SELECT
        pi.id,
        pi.invoice_number,
        pi.supplier_invoice_number,
        pi.supplier_id,
        pi.total_amount_paise,
        pi.paid_amount_paise,
        pi.outstanding_amount_paise,
        (${LIVE_BILL_PAID_SQL}) as calculated_paid_paise,
        (${LIVE_BILL_OUTSTANDING_SQL}) as calculated_outstanding_paise
      FROM purchase_invoices pi
      WHERE COALESCE(pi.status, 'approved') NOT IN ('rejected', 'draft')
    `
      )
      .all() as any[];

    const discrepancies: any[] = [];

    for (const b of bills) {
      const storedPaid = Number(b.paid_amount_paise || 0);
      const calcPaid = Number(b.calculated_paid_paise || 0);
      const storedOut = Number(b.outstanding_amount_paise || 0);
      const calcOut = Number(b.calculated_outstanding_paise || 0);

      const hasDiff = storedPaid !== calcPaid || storedOut !== calcOut;
      if (hasDiff) {
        discrepancies.push({
          bill_id: b.id,
          invoice_number: b.supplier_invoice_number || b.invoice_number,
          total_amount_paise: b.total_amount_paise,
          stored_paid_paise: storedPaid,
          calculated_paid_paise: calcPaid,
          stored_outstanding_paise: storedOut,
          calculated_outstanding_paise: calcOut,
          difference_paise: Math.abs(storedOut - calcOut),
        });

        if (options?.autoRepair) {
          this.syncPurchaseInvoiceBalance(b.id);
        }
      }
    }

    return {
      is_healthy: discrepancies.length === 0,
      checked_bills_count: bills.length,
      discrepancies_count: discrepancies.length,
      discrepancies,
    };
  }
}

export const paymentEngineService = new PaymentEngineService();
