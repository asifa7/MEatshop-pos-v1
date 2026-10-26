import { db } from '../../../../core/backend/db';
import { roundMoney } from '../../../../core/shared/math';
import type { AccountingLedgerEntry, EnterpriseAuditLog } from '../../../../core/types/enterprise_types';

export interface PostDoubleEntryInput {
  date?: string;
  referenceId?: string | null;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amountPaise: number;
  partyType?: 'Customer' | 'Supplier' | 'Employee' | 'Other' | null;
  partyId?: number | null;
  partyName?: string | null;
  createdBy?: number | null;
  voucherGroupId?: string | null;
  sourceModule?: string | null;
}

export interface ExtendedLedgerEntry extends AccountingLedgerEntry {
  voucher_group_id?: string | null;
  party_type?: string | null;
  party_id?: number | null;
  party_name?: string | null;
  source_module?: string | null;
  running_balance_paise?: number;
}

export interface TrialBalanceRow {
  account_type: string;
  debit_paise: number;
  credit_paise: number;
  net_paise: number; // positive = Debit balance, negative = Credit balance
  balance_type: 'Dr' | 'Cr' | 'Nil';
  entry_count: number;
}

export interface UnbalancedVoucherGroup {
  voucher_group_id: string;
  date: string;
  reference_id: string | null;
  description: string;
  debit_paise: number;
  credit_paise: number;
  difference_paise: number;
  entry_count: number;
}

export interface LedgerHealthSummary {
  isBalanced: boolean;
  totalDebitPaise: number;
  totalCreditPaise: number;
  differencePaise: number;
  totalEntries: number;
  totalVoucherGroups: number;
  unbalancedGroups: UnbalancedVoucherGroup[];
}

export interface PartySummaryRow {
  key: string;
  party_type: string;
  party_id: number | null;
  party_name: string;
  debit_paise: number;
  credit_paise: number;
  net_paise: number;
  balance_type: 'Receivable (Dr)' | 'Payable (Cr)' | 'Settled';
  entry_count: number;
}

export interface LedgerFilterOptions {
  mode?: 'bundle' | 'entries';
  action?: 'auto_balance' | 'backfill';
  view?: 'day_book' | 'cash_book' | 'bank_book' | 'party_ledger' | 'trial_balance' | 'ledger_health' | 'audit_logs';
  startDate?: string;
  endDate?: string;
  accountFilter?: string;
  partyFilter?: string;
  searchQuery?: string;
}

export interface LedgerBundleResponse {
  entries: ExtendedLedgerEntry[];
  cashBook: ExtendedLedgerEntry[];
  bankBook: ExtendedLedgerEntry[];
  partyLedger: ExtendedLedgerEntry[];
  parties: PartySummaryRow[];
  trialBalance: {
    rows: TrialBalanceRow[];
    grandTotalDebitPaise: number;
    grandTotalCreditPaise: number;
    isBalanced: boolean;
  };
  health: LedgerHealthSummary;
  accounts: string[];
  autoBalanceResult?: { fixedGroups: number; fixedAmountPaise: number };
}

export class LedgerService {
  private schemaInitialized = false;

  private ensureSchema(): void {
    if (this.schemaInitialized) return;
    try {
      const cols = db.prepare(`PRAGMA table_info(accounting_daily_ledger)`).all() as { name: string }[];
      const colNames = new Set(cols.map((c) => c.name));

      const addCol = (name: string, def: string) => {
        if (!colNames.has(name)) {
          try {
            db.prepare(`ALTER TABLE accounting_daily_ledger ADD COLUMN ${name} ${def}`).run();
          } catch {
            // Ignore if already added concurrently
          }
        }
      };

      addCol('voucher_group_id', 'TEXT');
      addCol('party_type', 'TEXT');
      addCol('party_id', 'INTEGER');
      addCol('party_name', 'TEXT');
      addCol('source_module', 'TEXT');
      addCol('is_auto_balanced', 'INTEGER DEFAULT 0');

      db.prepare(`CREATE INDEX IF NOT EXISTS idx_adl_voucher_group ON accounting_daily_ledger(voucher_group_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_adl_date ON accounting_daily_ledger(date)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_adl_ref ON accounting_daily_ledger(reference_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_adl_account ON accounting_daily_ledger(account_type)`).run();

      this.schemaInitialized = true;
    } catch (err) {
      console.error('LedgerService.ensureSchema error:', err);
    }
  }

  /**
   * Posts a balanced double-entry pair (Debit line + Credit line) into accounting_daily_ledger
   * with a shared voucher_group_id.
   */
  public postDoubleEntry(input: PostDoubleEntryInput): { voucherGroupId: string; debitEntryId: number; creditEntryId: number } {
    this.ensureSchema();

    const amountPaise = Math.round(roundMoney(Number(input.amountPaise) || 0));
    if (amountPaise <= 0) {
      return { voucherGroupId: input.voucherGroupId || '', debitEntryId: 0, creditEntryId: 0 };
    }

    const entryDate = (input.date || new Date().toISOString().split('T')[0]).slice(0, 10);
    const voucherGroupId =
      input.voucherGroupId ||
      `VCH-${entryDate.replace(/-/g, '')}-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const refId = input.referenceId || voucherGroupId;
    const createdBy = input.createdBy ?? 1;
    const partyType = input.partyType || null;
    const partyId = input.partyId ?? null;
    const partyName = input.partyName || null;
    const sourceModule = input.sourceModule || 'LEDGER';

    const insertStmt = db.prepare(`
      INSERT INTO accounting_daily_ledger (
        date, account_type, reference_id, description,
        debit_paise, credit_paise, created_by,
        voucher_group_id, party_type, party_id, party_name, source_module
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const debitRes = insertStmt.run(
      entryDate,
      input.debitAccount,
      refId,
      input.description,
      amountPaise,
      0,
      createdBy,
      voucherGroupId,
      partyType,
      partyId,
      partyName,
      sourceModule
    );

    const creditRes = insertStmt.run(
      entryDate,
      input.creditAccount,
      refId,
      input.description,
      0,
      amountPaise,
      createdBy,
      voucherGroupId,
      partyType,
      partyId,
      partyName,
      sourceModule
    );

    return {
      voucherGroupId,
      debitEntryId: Number(debitRes.lastInsertRowid),
      creditEntryId: Number(creditRes.lastInsertRowid),
    };
  }

  /**
   * Synchronizes and backfills double-entry rows from existing completed sales (invoices),
   * purchases (purchase_invoices), expenses (expenses), and supplier/customer settlements
   * (payments_receipts & supplier_payments) so the books are complete and balanced.
   */
  public syncAndBackfillLedger(): void {
    this.ensureSchema();

    const tx = db.transaction(() => {
      // 1. Remove any ledger entries tied to VOIDED sales invoices if any exist
      const voidInvoices = db
        .prepare(`SELECT invoice_number FROM invoices WHERE status = 'void' AND invoice_number IS NOT NULL`)
        .all() as { invoice_number: string }[];
      if (voidInvoices.length > 0) {
        const delStmt = db.prepare(`DELETE FROM accounting_daily_ledger WHERE reference_id = ?`);
        for (const v of voidInvoices) {
          delStmt.run(v.invoice_number);
        }
      }

      // 2. Pair existing legacy rows that have null voucher_group_id
      const ungrouped = db
        .prepare(`SELECT id, date, account_type, reference_id, description, debit_paise, credit_paise FROM accounting_daily_ledger WHERE voucher_group_id IS NULL ORDER BY id ASC`)
        .all() as ExtendedLedgerEntry[];

      if (ungrouped.length > 0) {
        const updateGroupStmt = db.prepare(`UPDATE accounting_daily_ledger SET voucher_group_id = ?, source_module = COALESCE(source_module, 'LEGACY') WHERE id = ?`);
        const byRef = new Map<string, ExtendedLedgerEntry[]>();
        for (const row of ungrouped) {
          const key = row.reference_id ? `REF:${row.reference_id}` : `ROW:${row.id}`;
          const list = byRef.get(key) || [];
          list.push(row);
          byRef.set(key, list);
        }

        for (const [key, rows] of byRef.entries()) {
          const groupId = key.startsWith('REF:')
            ? `VCH-${key.slice(4).replace(/[^a-zA-Z0-9_-]/g, '')}`
            : `VCH-LEGACY-${rows[0].id}`;
          for (const r of rows) {
            updateGroupStmt.run(groupId, r.id);
          }
        }
      }

      // Fix EXP-1 legacy Cash account_type if EXP-1 in expenses was actually UPI/Bank
      try {
        db.prepare(`
          UPDATE accounting_daily_ledger
          SET account_type = 'Bank', party_type = 'Other', party_name = 'kaif'
          WHERE reference_id = 'EXP-1' AND account_type = 'Cash' AND credit_paise = 20000000
            AND EXISTS (SELECT 1 FROM expenses WHERE id = 1 AND UPPER(payment_method) IN ('UPI', 'BANK', 'CARD'))
        `).run();
        db.prepare(`
          UPDATE accounting_daily_ledger
          SET party_type = 'Other', party_name = 'kaif'
          WHERE reference_id = 'EXP-1' AND account_type = 'Expense'
        `).run();
      } catch {
        // ignore
      }

      // Track existing voucher_group_ids and reference_ids to avoid duplicates
      const existingGroups = new Set<string>(
        (db.prepare(`SELECT DISTINCT voucher_group_id FROM accounting_daily_ledger WHERE voucher_group_id IS NOT NULL`).all() as { voucher_group_id: string }[]).map(
          (r) => r.voucher_group_id
        )
      );
      const existingRefs = new Set<string>(
        (db.prepare(`SELECT DISTINCT reference_id FROM accounting_daily_ledger WHERE reference_id IS NOT NULL`).all() as { reference_id: string }[]).map(
          (r) => r.reference_id
        )
      );

      // 3. Backfill completed Sales Invoices (status = 'completed')
      const completedInvoices = db
        .prepare(`
          SELECT
            i.id,
            i.invoice_number,
            COALESCE(SUBSTR(i.invoice_date, 1, 10), SUBSTR(i.created_at, 1, 10), DATE('now')) AS inv_date,
            COALESCE(NULLIF(i.total_amount_paise, 0), i.total_paise, 0) AS total_paise,
            i.customer_id,
            c.name AS customer_name,
            i.created_by
          FROM invoices i
          LEFT JOIN customers c ON c.id = i.customer_id
          WHERE i.status = 'completed'
            AND COALESCE(NULLIF(i.total_amount_paise, 0), i.total_paise, 0) > 0
          ORDER BY i.id ASC
        `)
        .all() as {
          id: number;
          invoice_number: string;
          inv_date: string;
          total_paise: number;
          customer_id: number | null;
          customer_name: string | null;
          created_by: number | null;
        }[];

      const getInvoicePaymentsStmt = db.prepare(`
        SELECT method, SUM(amount_paise) AS paid_paise
        FROM payments
        WHERE invoice_id = ? AND amount_paise > 0
        GROUP BY method
      `);

      for (const inv of completedInvoices) {
        const refId = inv.invoice_number || `INV-${inv.id}`;
        const vchId = `VCH-SALE-${inv.id}`;
        if (existingGroups.has(vchId) || existingRefs.has(refId)) continue;

        const payments = getInvoicePaymentsStmt.all(inv.id) as { method: string; paid_paise: number }[];
        let recordedPaise = 0;

        for (const p of payments) {
          const amt = Math.min(p.paid_paise, inv.total_paise - recordedPaise);
          if (amt <= 0) continue;
          const m = (p.method || 'cash').toLowerCase();
          const debitAccount =
            m === 'cash'
              ? 'Cash'
              : m === 'credit' || m === 'khata'
              ? 'Customer'
              : 'Bank';

          this.postDoubleEntry({
            date: inv.inv_date,
            referenceId: refId,
            description: `POS Sale ${refId}${inv.customer_name ? ` - ${inv.customer_name}` : ''} (${m.toUpperCase()})`,
            debitAccount,
            creditAccount: 'Sales',
            amountPaise: amt,
            partyType: inv.customer_id ? 'Customer' : null,
            partyId: inv.customer_id,
            partyName: inv.customer_name || (inv.customer_id ? `Customer #${inv.customer_id}` : 'Walk-in Customer'),
            createdBy: inv.created_by || 1,
            voucherGroupId: `${vchId}-${m.toUpperCase()}`,
            sourceModule: 'POS_SALE',
          });
          recordedPaise += amt;
        }

        const remainder = inv.total_paise - recordedPaise;
        if (remainder > 0) {
          // If no payment rows or partial payment, check if customer credit or default cash
          const debitAccount = inv.customer_id ? 'Customer' : 'Cash';
          this.postDoubleEntry({
            date: inv.inv_date,
            referenceId: refId,
            description: `POS Sale ${refId}${inv.customer_name ? ` - ${inv.customer_name}` : ''}`,
            debitAccount,
            creditAccount: 'Sales',
            amountPaise: remainder,
            partyType: inv.customer_id ? 'Customer' : null,
            partyId: inv.customer_id,
            partyName: inv.customer_name || 'Walk-in Customer',
            createdBy: inv.created_by || 1,
            voucherGroupId: vchId,
            sourceModule: 'POS_SALE',
          });
        }

        existingGroups.add(vchId);
        existingRefs.add(refId);
      }

      // 4. Backfill Purchase Invoices (purchase_invoices)
      const purchases = db
        .prepare(`
          SELECT
            pi.id,
            pi.invoice_number,
            COALESCE(SUBSTR(pi.invoice_date, 1, 10), SUBSTR(pi.created_at, 1, 10), DATE('now')) AS pur_date,
            pi.total_amount_paise,
            pi.paid_amount_paise,
            pi.payment_status,
            pi.supplier_id,
            s.name AS supplier_name,
            pi.created_by
          FROM purchase_invoices pi
          LEFT JOIN suppliers s ON s.id = pi.supplier_id
          WHERE pi.total_amount_paise > 0
          ORDER BY pi.id ASC
        `)
        .all() as {
          id: number;
          invoice_number: string;
          pur_date: string;
          total_amount_paise: number;
          paid_amount_paise: number;
          payment_status: string;
          supplier_id: number;
          supplier_name: string | null;
          created_by: number | null;
        }[];

      for (const pur of purchases) {
        const refId = pur.invoice_number || `PUR-${pur.id}`;
        const vchId = `VCH-PUR-${pur.id}`;
        if (!existingGroups.has(vchId) && !existingRefs.has(refId)) {
          this.postDoubleEntry({
            date: pur.pur_date,
            referenceId: refId,
            description: `Purchase Bill ${refId} from ${pur.supplier_name || `Supplier #${pur.supplier_id}`}`,
            debitAccount: 'Purchase',
            creditAccount: 'Supplier',
            amountPaise: pur.total_amount_paise,
            partyType: 'Supplier',
            partyId: pur.supplier_id,
            partyName: pur.supplier_name || `Supplier #${pur.supplier_id}`,
            createdBy: pur.created_by || 1,
            voucherGroupId: vchId,
            sourceModule: 'PURCHASE',
          });
          existingGroups.add(vchId);
          existingRefs.add(refId);
        }
      }

      // 5. Backfill Supplier Payments (supplier_payments table from procurement)
      const suppPayments = db
        .prepare(`
          SELECT
            sp.id,
            sp.supplier_id,
            s.name AS supplier_name,
            COALESCE(SUBSTR(sp.payment_date, 1, 10), SUBSTR(sp.created_at, 1, 10), DATE('now')) AS pay_date,
            sp.amount_paise,
            sp.payment_method,
            sp.reference_number,
            sp.notes,
            sp.created_by
          FROM supplier_payments sp
          LEFT JOIN suppliers s ON s.id = sp.supplier_id
          WHERE sp.amount_paise > 0
          ORDER BY sp.id ASC
        `)
        .all() as {
          id: number;
          supplier_id: number;
          supplier_name: string | null;
          pay_date: string;
          amount_paise: number;
          payment_method: string;
          reference_number: string | null;
          notes: string | null;
          created_by: number | null;
        }[];

      for (const sp of suppPayments) {
        const vchId = `VCH-SPAY-${sp.id}`;
        const refId = sp.reference_number || `SPAY-${sp.id}`;
        if (existingGroups.has(vchId) || existingRefs.has(refId)) continue;

        const m = (sp.payment_method || 'cash').toLowerCase();
        const creditAccount = m === 'cash' ? 'Cash' : 'Bank';

        this.postDoubleEntry({
          date: sp.pay_date,
          referenceId: refId,
          description: sp.notes || `Supplier Payment to ${sp.supplier_name || `Supplier #${sp.supplier_id}`} (${m.toUpperCase()})`,
          debitAccount: 'Supplier',
          creditAccount,
          amountPaise: sp.amount_paise,
          partyType: 'Supplier',
          partyId: sp.supplier_id,
          partyName: sp.supplier_name || `Supplier #${sp.supplier_id}`,
          createdBy: sp.created_by || 1,
          voucherGroupId: vchId,
          sourceModule: 'SUPPLIER_PAYMENT',
        });
        existingGroups.add(vchId);
        existingRefs.add(refId);
      }

      // 6. Backfill Payments & Receipts Vouchers (payments_receipts table)
      const vouchers = db
        .prepare(`
          SELECT
            pr.id,
            COALESCE(pr.voucher_number, 'VCH-' || pr.id) AS voucher_no,
            UPPER(COALESCE(pr.direction, 'payment')) AS voucher_type,
            COALESCE(SUBSTR(pr.payment_date, 1, 10), SUBSTR(pr.created_at, 1, 10), DATE('now')) AS vch_date,
            UPPER(COALESCE(pr.party_type, 'other')) AS party_type,
            pr.party_id,
            pr.party_name,
            pr.amount_paise,
            COALESCE(pr.payment_method, 'CASH') AS payment_mode,
            pr.narration,
            pr.is_reversed,
            pr.reversed_payment_id,
            pr.created_by
          FROM payments_receipts pr
          WHERE pr.amount_paise > 0
            AND COALESCE(pr.is_reversed, 0) = 0
            AND pr.reversed_payment_id IS NULL
          ORDER BY pr.id ASC
        `)
        .all() as {
          id: number;
          voucher_no: string;
          voucher_type: string;
          vch_date: string;
          party_type: string | null;
          party_id: number | null;
          party_name: string | null;
          amount_paise: number;
          payment_mode: string;
          narration: string | null;
          is_reversed: number;
          reversed_payment_id: number | null;
          created_by: number | null;
        }[];

      for (const v of vouchers) {
        const vchId = `VCH-PR-${v.id}`;
        const refId = v.voucher_no || `PR-${v.id}`;
        if (existingGroups.has(vchId) || existingRefs.has(refId)) continue;

        const modeAcc = (v.payment_mode || 'CASH').toUpperCase() === 'CASH' ? 'Cash' : 'Bank';
        let debitAcc = 'Supplier';
        let creditAcc = modeAcc;

        if (v.voucher_type === 'RECEIPT') {
          debitAcc = modeAcc;
          creditAcc = v.party_type === 'CUSTOMER' ? 'Customer' : 'Sales';
        } else if (v.voucher_type === 'PAYMENT') {
          debitAcc = v.party_type === 'SUPPLIER' ? 'Supplier' : 'Expense';
          creditAcc = modeAcc;
        } else if (v.voucher_type === 'CONTRA') {
          debitAcc = modeAcc === 'Cash' ? 'Bank' : 'Cash';
          creditAcc = modeAcc;
        }

        this.postDoubleEntry({
          date: v.vch_date,
          referenceId: refId,
          description: v.narration || `${v.voucher_type} Voucher ${refId}${v.party_name ? ` - ${v.party_name}` : ''}`,
          debitAccount: debitAcc,
          creditAccount: creditAcc,
          amountPaise: v.amount_paise,
          partyType: v.party_type === 'SUPPLIER' ? 'Supplier' : v.party_type === 'CUSTOMER' ? 'Customer' : 'Other',
          partyId: v.party_id,
          partyName: v.party_name,
          createdBy: v.created_by || 1,
          voucherGroupId: vchId,
          sourceModule: 'PAYMENT_ENGINE',
        });

        existingGroups.add(vchId);
        existingRefs.add(refId);
      }

      // 7. Backfill Expenses (expenses table)
      const expenses = db
        .prepare(`
          SELECT
            e.id,
            e.vendor_name,
            e.amount_paise,
            e.payment_method,
            COALESCE(SUBSTR(e.expense_date, 1, 10), SUBSTR(e.created_at, 1, 10), DATE('now')) AS exp_date,
            e.notes,
            e.created_by
          FROM expenses e
          WHERE COALESCE(e.is_active, 1) = 1
            AND e.deleted_at IS NULL
            AND e.amount_paise > 0
          ORDER BY e.id ASC
        `)
        .all() as {
          id: number;
          vendor_name: string | null;
          amount_paise: number;
          payment_method: string | null;
          exp_date: string;
          notes: string | null;
          created_by: number | null;
        }[];

      for (const exp of expenses) {
        const refId = `EXP-${exp.id}`;
        const vchId = `VCH-EXP-${exp.id}`;
        if (existingGroups.has(vchId) || existingRefs.has(refId)) continue;

        const m = (exp.payment_method || 'Cash').toUpperCase();
        const creditAccount = m === 'CASH' ? 'Cash' : 'Bank';

        this.postDoubleEntry({
          date: exp.exp_date,
          referenceId: refId,
          description: `Expense: ${exp.notes || exp.vendor_name || `Expense #${exp.id}`}`,
          debitAccount: 'Expense',
          creditAccount,
          amountPaise: exp.amount_paise,
          partyType: 'Other',
          partyId: null,
          partyName: exp.vendor_name || 'Operational Vendor',
          createdBy: exp.created_by || 1,
          voucherGroupId: vchId,
          sourceModule: 'EXPENSE',
        });

        existingGroups.add(vchId);
        existingRefs.add(refId);
      }
    });

    tx();
  }

  /**
   * Computes Ledger Health: checks whether Total Debits == Total Credits and lists any unbalanced voucher groups.
   */
  public getLedgerHealth(startDate?: string, endDate?: string): LedgerHealthSummary {
    this.ensureSchema();
    this.syncAndBackfillLedger();

    const params: any[] = [];
    let dateClause = '';
    if (startDate) {
      dateClause += ` AND date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      dateClause += ` AND date <= ?`;
      params.push(endDate);
    }

    const totals = db
      .prepare(`
        SELECT
          COALESCE(SUM(debit_paise), 0) AS total_debit,
          COALESCE(SUM(credit_paise), 0) AS total_credit,
          COUNT(*) AS total_entries,
          COUNT(DISTINCT COALESCE(voucher_group_id, 'ROW-' || id)) AS total_groups
        FROM accounting_daily_ledger
        WHERE 1=1 ${dateClause}
      `)
      .get(...params) as {
        total_debit: number;
        total_credit: number;
        total_entries: number;
        total_groups: number;
      };

    const unbalancedGroups = db
      .prepare(`
        SELECT
          COALESCE(voucher_group_id, 'ROW-' || id) AS voucher_group_id,
          MIN(date) AS date,
          MAX(reference_id) AS reference_id,
          MAX(description) AS description,
          COALESCE(SUM(debit_paise), 0) AS debit_paise,
          COALESCE(SUM(credit_paise), 0) AS credit_paise,
          COALESCE(SUM(debit_paise), 0) - COALESCE(SUM(credit_paise), 0) AS difference_paise,
          COUNT(*) AS entry_count
        FROM accounting_daily_ledger
        WHERE 1=1 ${dateClause}
        GROUP BY COALESCE(voucher_group_id, 'ROW-' || id)
        HAVING COALESCE(SUM(debit_paise), 0) != COALESCE(SUM(credit_paise), 0)
        ORDER BY MIN(date) DESC
      `)
      .all(...params) as UnbalancedVoucherGroup[];

    const totalDebitPaise = Number(totals?.total_debit || 0);
    const totalCreditPaise = Number(totals?.total_credit || 0);
    const differencePaise = totalDebitPaise - totalCreditPaise;

    return {
      isBalanced: differencePaise === 0 && unbalancedGroups.length === 0,
      totalDebitPaise,
      totalCreditPaise,
      differencePaise,
      totalEntries: Number(totals?.total_entries || 0),
      totalVoucherGroups: Number(totals?.total_groups || 0),
      unbalancedGroups,
    };
  }

  /**
   * 1-Click Auto-Balance / Reconcile for any unbalanced voucher groups in accounting_daily_ledger.
   */
  public autoBalanceLedger(): { fixedGroups: number; fixedAmountPaise: number } {
    this.ensureSchema();
    const health = this.getLedgerHealth();
    if (health.unbalancedGroups.length === 0) {
      return { fixedGroups: 0, fixedAmountPaise: 0 };
    }

    let fixedGroups = 0;
    let fixedAmountPaise = 0;

    const tx = db.transaction(() => {
      const insertStmt = db.prepare(`
        INSERT INTO accounting_daily_ledger (
          date, account_type, reference_id, description,
          debit_paise, credit_paise, created_by,
          voucher_group_id, source_module, is_auto_balanced
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 'AUTO_RECONCILE', 1)
      `);

      for (const grp of health.unbalancedGroups) {
        const diff = grp.difference_paise; // debit - credit
        if (diff === 0) continue;

        const isNeedCredit = diff > 0;
        const absDiff = Math.abs(diff);
        // Infer contra account from description or default to Cash / Capital
        const descLower = (grp.description || '').toLowerCase();
        let contraAccount = 'Cash';
        if (descLower.includes('upi') || descLower.includes('bank')) {
          contraAccount = 'Bank';
        } else if (descLower.includes('purchase') && isNeedCredit) {
          contraAccount = 'Supplier';
        } else if (descLower.includes('sale') && !isNeedCredit) {
          contraAccount = 'Cash';
        }

        insertStmt.run(
          grp.date || new Date().toISOString().split('T')[0],
          contraAccount,
          grp.reference_id || grp.voucher_group_id,
          `${grp.description} (Auto-Balanced Contra Entry)`,
          isNeedCredit ? 0 : absDiff,
          isNeedCredit ? absDiff : 0,
          grp.voucher_group_id
        );

        fixedGroups++;
        fixedAmountPaise += absDiff;
      }
    });

    tx();
    return { fixedGroups, fixedAmountPaise };
  }

  /**
   * Computes Trial Balance across all accounts for the given date range.
   */
  public getTrialBalance(startDate?: string, endDate?: string): {
    rows: TrialBalanceRow[];
    grandTotalDebitPaise: number;
    grandTotalCreditPaise: number;
    isBalanced: boolean;
  } {
    this.ensureSchema();
    const params: any[] = [];
    let dateClause = '';
    if (startDate) {
      dateClause += ` AND date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      dateClause += ` AND date <= ?`;
      params.push(endDate);
    }

    const rawRows = db
      .prepare(`
        SELECT
          account_type,
          COALESCE(SUM(debit_paise), 0) AS debit_paise,
          COALESCE(SUM(credit_paise), 0) AS credit_paise,
          COUNT(*) AS entry_count
        FROM accounting_daily_ledger
        WHERE 1=1 ${dateClause}
        GROUP BY account_type
        ORDER BY account_type ASC
      `)
      .all(...params) as {
        account_type: string;
        debit_paise: number;
        credit_paise: number;
        entry_count: number;
      }[];

    let grandTotalDebitPaise = 0;
    let grandTotalCreditPaise = 0;

    const rows: TrialBalanceRow[] = rawRows.map((r) => {
      const dr = Number(r.debit_paise || 0);
      const cr = Number(r.credit_paise || 0);
      const net = dr - cr;
      grandTotalDebitPaise += dr;
      grandTotalCreditPaise += cr;
      return {
        account_type: r.account_type,
        debit_paise: dr,
        credit_paise: cr,
        net_paise: net,
        balance_type: net > 0 ? 'Dr' : net < 0 ? 'Cr' : 'Nil',
        entry_count: Number(r.entry_count || 0),
      };
    });

    return {
      rows,
      grandTotalDebitPaise,
      grandTotalCreditPaise,
      isBalanced: grandTotalDebitPaise === grandTotalCreditPaise,
    };
  }

  /**
   * Builds the full multi-view bundle for EnterpriseLedgerView (Day Book, Cash Book, Bank Book,
   * Party Ledger, Trial Balance, Ledger Health).
   */
  public getBundle(filters: LedgerFilterOptions = {}): LedgerBundleResponse {
    this.ensureSchema();
    this.syncAndBackfillLedger();

    let autoBalanceResult: { fixedGroups: number; fixedAmountPaise: number } | undefined;
    if (filters.action === 'auto_balance') {
      autoBalanceResult = this.autoBalanceLedger();
    }

    const startDate = filters.startDate?.trim() || undefined;
    const endDate = filters.endDate?.trim() || undefined;
    const accountFilter = filters.accountFilter && filters.accountFilter !== 'All' ? filters.accountFilter : undefined;
    const partyFilter = filters.partyFilter && filters.partyFilter !== 'All' ? filters.partyFilter : undefined;
    const search = filters.searchQuery?.trim().toLowerCase() || '';

    const params: any[] = [];
    let whereSql = `WHERE 1=1`;
    if (startDate) {
      whereSql += ` AND date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      whereSql += ` AND date <= ?`;
      params.push(endDate);
    }

    // Fetch all chronological entries in date range so we can compute exact running balances
    const chronological = db
      .prepare(`
        SELECT
          id, date, account_type, reference_id, description,
          debit_paise, credit_paise, created_by, created_at,
          voucher_group_id, party_type, party_id, party_name, source_module
        FROM accounting_daily_ledger
        ${whereSql}
        ORDER BY date ASC, id ASC
      `)
      .all(...params) as ExtendedLedgerEntry[];

    // Compute Cash Book (account_type = 'Cash') with running balance (Debit - Credit)
    let cashRunning = 0;
    const cashBookChrono: ExtendedLedgerEntry[] = [];
    for (const row of chronological) {
      if (row.account_type === 'Cash') {
        cashRunning += (row.debit_paise || 0) - (row.credit_paise || 0);
        cashBookChrono.push({ ...row, running_balance_paise: cashRunning });
      }
    }

    // Compute Bank Book (account_type = 'Bank') with running balance (Debit - Credit)
    let bankRunning = 0;
    const bankBookChrono: ExtendedLedgerEntry[] = [];
    for (const row of chronological) {
      if (row.account_type === 'Bank') {
        bankRunning += (row.debit_paise || 0) - (row.credit_paise || 0);
        bankBookChrono.push({ ...row, running_balance_paise: bankRunning });
      }
    }

    // Compute Party Ledger (account_type IN ('Customer', 'Supplier') or party_name present on party accounts)
    const partyRunningMap = new Map<string, number>();
    const partySummaryMap = new Map<string, PartySummaryRow>();
    const partyLedgerChrono: ExtendedLedgerEntry[] = [];

    for (const row of chronological) {
      if (row.account_type === 'Supplier' || row.account_type === 'Customer') {
        const pType = row.party_type || row.account_type;
        const pName = row.party_name || (row.account_type === 'Supplier' ? 'General Supplier' : 'Walk-in / Customer');
        const key = `${pType}:${row.party_id || pName}`;

        const prevBal = partyRunningMap.get(key) || 0;
        // Positive = Receivable (Debit), Negative = Payable (Credit)
        const nextBal = prevBal + (row.debit_paise || 0) - (row.credit_paise || 0);
        partyRunningMap.set(key, nextBal);

        const existingParty = partySummaryMap.get(key) || {
          key,
          party_type: pType,
          party_id: row.party_id ?? null,
          party_name: pName,
          debit_paise: 0,
          credit_paise: 0,
          net_paise: 0,
          balance_type: 'Settled' as const,
          entry_count: 0,
        };
        existingParty.debit_paise += row.debit_paise || 0;
        existingParty.credit_paise += row.credit_paise || 0;
        existingParty.net_paise = existingParty.debit_paise - existingParty.credit_paise;
        existingParty.balance_type =
          existingParty.net_paise > 0
            ? 'Receivable (Dr)'
            : existingParty.net_paise < 0
            ? 'Payable (Cr)'
            : 'Settled';
        existingParty.entry_count += 1;
        partySummaryMap.set(key, existingParty);

        partyLedgerChrono.push({
          ...row,
          party_type: pType,
          party_name: pName,
          running_balance_paise: nextBal,
        });
      }
    }

    const matchesSearchAndParty = (row: ExtendedLedgerEntry) => {
      if (accountFilter && row.account_type !== accountFilter) return false;
      if (partyFilter) {
        const pName = row.party_name || '';
        const pKey = `${row.party_type || row.account_type}:${row.party_id || pName}`;
        if (pKey !== partyFilter && pName !== partyFilter) return false;
      }
      if (search) {
        const hay = `${row.description || ''} ${row.reference_id || ''} ${row.account_type || ''} ${row.party_name || ''} ${row.voucher_group_id || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    };

    const matchesBookSearch = (row: ExtendedLedgerEntry) => {
      if (partyFilter) {
        const pName = row.party_name || '';
        const pKey = `${row.party_type || row.account_type}:${row.party_id || pName}`;
        if (pKey !== partyFilter && pName !== partyFilter) return false;
      }
      if (search) {
        const hay = `${row.description || ''} ${row.reference_id || ''} ${row.account_type || ''} ${row.party_name || ''} ${row.voucher_group_id || ''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    };

    const entriesDesc = [...chronological].reverse().filter(matchesSearchAndParty);
    const cashBookDesc = [...cashBookChrono].reverse().filter(matchesBookSearch);
    const bankBookDesc = [...bankBookChrono].reverse().filter(matchesBookSearch);
    const partyLedgerDesc = [...partyLedgerChrono].reverse().filter(matchesBookSearch);

    const trialBalance = this.getTrialBalance(startDate, endDate);
    const health = this.getLedgerHealth(startDate, endDate);

    const distinctAccounts = Array.from(
      new Set(['Cash', 'Bank', 'Sales', 'Purchase', 'Expense', 'Supplier', 'Customer', ...chronological.map((r) => r.account_type)])
    );

    return {
      entries: entriesDesc,
      cashBook: cashBookDesc,
      bankBook: bankBookDesc,
      partyLedger: partyLedgerDesc,
      parties: Array.from(partySummaryMap.values()).sort((a, b) => Math.abs(b.net_paise) - Math.abs(a.net_paise)),
      trialBalance,
      health,
      accounts: distinctAccounts,
      autoBalanceResult,
    };
  }

  /**
   * Backward-compatible getAccountingEntries:
   * - If called with a string or undefined, returns AccountingLedgerEntry[].
   * - If called with a LedgerFilterOptions object (e.g. `{ mode: 'bundle', ... }`), returns LedgerBundleResponse.
   */
  public getAccountingEntries(accountTypeOrOptions?: string | LedgerFilterOptions): any {
    this.ensureSchema();
    this.syncAndBackfillLedger();

    if (accountTypeOrOptions && typeof accountTypeOrOptions === 'object') {
      return this.getBundle(accountTypeOrOptions);
    }

    const accountType = typeof accountTypeOrOptions === 'string' ? accountTypeOrOptions : undefined;
    if (accountType && accountType !== 'All') {
      return db
        .prepare('SELECT * FROM accounting_daily_ledger WHERE account_type = ? ORDER BY date DESC, id DESC LIMIT 2000')
        .all(accountType) as AccountingLedgerEntry[];
    }
    return db
      .prepare('SELECT * FROM accounting_daily_ledger ORDER BY date DESC, id DESC LIMIT 2000')
      .all() as AccountingLedgerEntry[];
  }

  public getAuditLogs(): EnterpriseAuditLog[] {
    return db.prepare('SELECT * FROM enterprise_audit_logs ORDER BY id DESC LIMIT 500').all() as EnterpriseAuditLog[];
  }
}

export const ledgerService = new LedgerService();
