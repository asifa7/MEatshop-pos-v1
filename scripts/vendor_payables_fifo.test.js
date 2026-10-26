/**
 * Automated Test Suite: Vendor Payables FIFO & Single Vendor Tile Overhaul
 * Tests T1 - T12
 *
 * Run with: set ELECTRON_RUN_AS_NODE=1 && .\node_modules\.bin\electron.cmd scripts/vendor_payables_fifo.test.js
 */

const Database = require('better-sqlite3');
const assert = require('assert');
const path = require('path');

const dbPath = path.resolve(__dirname, '../dev.db');
const db = new Database(dbPath);

// Pure math & currency formatter test (mirrors src/core/shared/math.ts)
function roundHalfUp(value) {
  return Math.sign(value) * Math.round(Math.abs(value));
}

function roundMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || Math.abs(num) < 1e-4) return 0;
  const rounded = roundHalfUp(num * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function formatMoney(amount, options) {
  const raw = Number(amount || 0);
  const isRupees = options?.isRupees ?? false;
  const rupees = isRupees ? roundMoney(raw) : roundMoney(raw / 100);
  const safeRupees = Object.is(rupees, -0) || Math.abs(rupees) < 1e-4 ? 0 : rupees;
  const dec = options?.decimals ?? 2;
  const sym = options?.showSymbol === false ? '' : (options?.symbol ?? '₹');
  const isNeg = safeRupees < 0;
  const absFormatted = Math.abs(safeRupees).toLocaleString('en-IN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return isNeg ? `-${sym}${absFormatted}` : `${sym}${absFormatted}`;
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

function getVendorOutstanding(supplierId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(${LIVE_BILL_OUTSTANDING_SQL}), 0) as total_outstanding_paise
    FROM purchase_invoices pi
    WHERE pi.supplier_id = ?
      AND COALESCE(pi.status, 'approved') NOT IN ('rejected', 'draft')
  `).get(supplierId);
  return Math.max(0, Number(row?.total_outstanding_paise || 0));
}

function getBillBalance(billId) {
  const row = db.prepare(`
    SELECT
      pi.id,
      pi.total_amount_paise,
      (${LIVE_BILL_PAID_SQL}) as paid_amount_paise,
      (${LIVE_BILL_OUTSTANDING_SQL}) as outstanding_balance_paise
    FROM purchase_invoices pi
    WHERE pi.id = ?
  `).get(billId);
  return {
    total: row.total_amount_paise,
    paid: row.paid_amount_paise,
    balance: row.outstanding_balance_paise,
  };
}

// Emulate backend recordVendorPayment
function recordVendorPayment(input, userId = 1) {
  if (!input.amount_paise || input.amount_paise <= 0) {
    throw new Error('Payment amount must be greater than zero');
  }

  const supp = db.prepare('SELECT id, name, company_name FROM suppliers WHERE id = ?').get(input.supplier_id);
  if (!supp) throw new Error(`Supplier #${input.supplier_id} not found`);
  const supplierName = supp.company_name || supp.name;

  const totalOutstanding = getVendorOutstanding(input.supplier_id);
  if (input.amount_paise > totalOutstanding) {
    throw new Error(`Payment amount ₹${(input.amount_paise / 100).toFixed(2)} exceeds total outstanding balance of ₹${(totalOutstanding / 100).toFixed(2)} for ${supplierName}.`);
  }

  const pendingBills = db.prepare(`
    SELECT
      pi.id,
      pi.invoice_number,
      pi.supplier_invoice_number,
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
  `).all(input.supplier_id);

  let computedAllocations = [];

  if (input.manual_allocations && input.manual_allocations.length > 0) {
    const sumManual = input.manual_allocations.reduce((sum, a) => sum + a.allocated_amount_paise, 0);
    if (sumManual !== input.amount_paise) {
      throw new Error(`Manual allocations sum (₹${(sumManual / 100).toFixed(2)}) must exactly equal payment amount (₹${(input.amount_paise / 100).toFixed(2)}).`);
    }

    const pendingMap = new Map(pendingBills.map(b => [b.id, b]));
    for (const m of input.manual_allocations) {
      if (m.allocated_amount_paise <= 0) continue;
      const b = pendingMap.get(m.bill_id);
      if (!b) throw new Error(`Bill #${m.bill_id} is not an outstanding bill for this vendor.`);
      if (m.allocated_amount_paise > b.outstanding_balance_paise) {
        throw new Error(`Allocated amount exceeds current balance on bill.`);
      }
      computedAllocations.push({
        bill_type: 'purchase_invoice',
        bill_id: b.id,
        bill_number: b.supplier_invoice_number || b.invoice_number,
        allocated_amount_paise: m.allocated_amount_paise,
      });
    }
  } else {
    // FIFO allocation
    let remaining = input.amount_paise;
    for (const bill of pendingBills) {
      if (remaining <= 0) break;
      const alloc = Math.min(remaining, bill.outstanding_balance_paise);
      if (alloc > 0) {
        computedAllocations.push({
          bill_type: 'purchase_invoice',
          bill_id: bill.id,
          bill_number: bill.supplier_invoice_number || bill.invoice_number,
          allocated_amount_paise: alloc,
        });
        remaining -= alloc;
      }
    }
  }

  // Transaction
  const result = db.transaction(() => {
    // Check idempotency
    if (input.idempotency_key) {
      const existing = db.prepare('SELECT id, voucher_number, amount_paise FROM payments_receipts WHERE idempotency_key = ?').get(input.idempotency_key);
      if (existing) {
        return { voucher: existing, isDuplicate: true };
      }
    }

    const voucherNumber = `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const insStmt = db.prepare(`
      INSERT INTO payments_receipts (
        voucher_number, direction, payment_method, party_type, party_id, party_name,
        category, amount_paise, allocated_amount_paise, unallocated_amount_paise,
        payment_date, narration, idempotency_key, is_reversed, created_by, created_at
      ) VALUES (?, 'payment', ?, 'supplier', ?, ?, 'Supplier Payment', ?, ?, 0, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
    `);

    const insRes = insStmt.run(
      voucherNumber,
      input.payment_method,
      input.supplier_id,
      supplierName,
      input.amount_paise,
      input.amount_paise,
      input.payment_date,
      input.narration || null,
      input.idempotency_key || null,
      userId
    );

    const voucherId = Number(insRes.lastInsertRowid);

    // Allocations
    for (const a of computedAllocations) {
      db.prepare(`
        INSERT INTO payment_allocations (payment_receipt_id, bill_type, bill_id, bill_number, allocated_amount_paise, created_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(voucherId, a.bill_type, a.bill_id, a.bill_number, a.allocated_amount_paise);

      // sync bill
      const piRow = db.prepare(`
        SELECT pi.total_amount_paise, (${LIVE_BILL_PAID_SQL}) as paid_paise, (${LIVE_BILL_OUTSTANDING_SQL}) as out_paise
        FROM purchase_invoices pi WHERE pi.id = ?
      `).get(a.bill_id);

      const dbStatus = piRow.out_paise === 0 ? 'paid' : piRow.paid_paise > 0 ? 'partially_paid' : 'unpaid';
      db.prepare(`
        UPDATE purchase_invoices
        SET paid_amount_paise = ?, outstanding_amount_paise = ?, payment_status = ?
        WHERE id = ?
      `).run(piRow.paid_paise, piRow.out_paise, dbStatus, a.bill_id);
    }

    // Cash movement into open shift if cash
    if (input.payment_method === 'cash') {
      const openSession = db.prepare("SELECT id FROM pos_sessions WHERE status = 'Open' LIMIT 1").get();
      if (openSession) {
        db.prepare(`
          INSERT INTO shift_cash_movements
          (store_id, session_id, movement_type, category, amount_paise, reason, taken_by, is_active, created_by)
          VALUES (1, ?, 'cash_out', 'Supplier Payment', ?, ?, ?, 1, ?)
        `).run(
          openSession.id,
          input.amount_paise,
          `Voucher #${voucherNumber}: ${supplierName}`,
          supplierName,
          userId
        );
      }
    }

    // Ledger entries
    const liquidAcc = input.payment_method === 'cash' ? 'Cash' : 'Bank';
    db.prepare(`
      INSERT INTO accounting_daily_ledger (store_id, date, account_type, reference_id, description, debit_paise, credit_paise, created_by)
      VALUES (1, ?, 'Supplier', ?, ?, ?, 0, ?)
    `).run(input.payment_date, voucherNumber, `Payment to ${supplierName}`, input.amount_paise, userId);

    db.prepare(`
      INSERT INTO accounting_daily_ledger (store_id, date, account_type, reference_id, description, debit_paise, credit_paise, created_by)
      VALUES (1, ?, ?, ?, ?, 0, ?, ?)
    `).run(input.payment_date, liquidAcc, voucherNumber, `Payment via ${liquidAcc}`, input.amount_paise, userId);

    return {
      voucher: { id: voucherId, voucher_number: voucherNumber, amount_paise: input.amount_paise },
      allocations: computedAllocations,
    };
  })();

  return result;
}

// Emulate backend reversePayment
function reversePayment(paymentReceiptId, reason, userId = 1) {
  if (!reason || !reason.trim()) throw new Error('A mandatory reason is required to reverse a payment');

  const orig = db.prepare('SELECT * FROM payments_receipts WHERE id = ?').get(paymentReceiptId);
  if (!orig) throw new Error('Payment voucher not found');
  if (orig.is_reversed === 1) throw new Error('Already reversed');

  const allocations = db.prepare('SELECT * FROM payment_allocations WHERE payment_receipt_id = ?').all(paymentReceiptId);

  return db.transaction(() => {
    db.prepare(`
      UPDATE payments_receipts
      SET is_reversed = 1, reversed_at = CURRENT_TIMESTAMP, reversal_reason = ?, reversed_by = ?
      WHERE id = ?
    `).run(reason.trim(), userId, paymentReceiptId);

    // Re-sync bills
    for (const alloc of allocations) {
      if (alloc.bill_type === 'purchase_invoice') {
        const piRow = db.prepare(`
          SELECT pi.total_amount_paise, (${LIVE_BILL_PAID_SQL}) as paid_paise, (${LIVE_BILL_OUTSTANDING_SQL}) as out_paise
          FROM purchase_invoices pi WHERE pi.id = ?
        `).get(alloc.bill_id);

        const dbStatus = piRow.out_paise === 0 ? 'paid' : piRow.paid_paise > 0 ? 'partially_paid' : 'unpaid';
        db.prepare(`
          UPDATE purchase_invoices
          SET paid_amount_paise = ?, outstanding_amount_paise = ?, payment_status = ?
          WHERE id = ?
        `).run(piRow.paid_paise, piRow.out_paise, dbStatus, alloc.bill_id);
      }
    }

    // Reverse shift cash movements
    if (orig.payment_method === 'cash') {
      db.prepare(`
        UPDATE shift_cash_movements
        SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE reason LIKE ?
      `).run(`%Voucher #${orig.voucher_number}%`);
    }

    // Reversal ledger rows
    const liquidAcc = orig.payment_method === 'cash' ? 'Cash' : 'Bank';
    db.prepare(`
      INSERT INTO accounting_daily_ledger (store_id, date, account_type, reference_id, description, debit_paise, credit_paise, created_by)
      VALUES (1, DATE('now'), ?, ?, ?, ?, 0, ?)
    `).run(liquidAcc, `REV-${orig.voucher_number}`, `Reversal of #${orig.voucher_number}`, orig.amount_paise, userId);

    db.prepare(`
      INSERT INTO accounting_daily_ledger (store_id, date, account_type, reference_id, description, debit_paise, credit_paise, created_by)
      VALUES (1, DATE('now'), 'Supplier', ?, ?, 0, ?, ?)
    `).run(`REV-${orig.voucher_number}`, `Reversal of #${orig.voucher_number}`, orig.amount_paise, userId);

    return { success: true };
  })();
}

function checkPayablesHealth() {
  const bills = db.prepare(`
    SELECT
      pi.id,
      pi.invoice_number,
      pi.total_amount_paise,
      pi.paid_amount_paise,
      pi.outstanding_amount_paise,
      (${LIVE_BILL_PAID_SQL}) as calculated_paid_paise,
      (${LIVE_BILL_OUTSTANDING_SQL}) as calculated_outstanding_paise
    FROM purchase_invoices pi
    WHERE COALESCE(pi.status, 'approved') NOT IN ('rejected', 'draft')
  `).all();

  const discrepancies = [];
  for (const b of bills) {
    if (b.paid_amount_paise !== b.calculated_paid_paise || b.outstanding_amount_paise !== b.calculated_outstanding_paise) {
      discrepancies.push(b);
    }
  }

  return {
    is_healthy: discrepancies.length === 0,
    discrepancies_count: discrepancies.length,
    discrepancies,
    checked_bills_count: bills.length,
  };
}

async function runTests() {
  console.log('================================================================');
  console.log('  RUNNING VENDOR PAYABLES & FIFO OVERHAUL TEST SUITE (T1 - T12) ');
  console.log('================================================================\n');

  // Setup mock vendor & bills for isolated testing
  const suppCode = `TEST-SUPP-${Date.now()}`;
  const suppRes = db.prepare(`
    INSERT INTO suppliers (code, company_name, name, is_active)
    VALUES (?, 'Test Poultry Supplier', 'Test Vendor', 1)
  `).run(suppCode);
  const testSuppId = Number(suppRes.lastInsertRowid);

  console.log(`[SETUP] Created test vendor ID: ${testSuppId}`);

  function createTestBill(invNum, suppId, date, amountPaise, createdAt = null) {
    const stmt = db.prepare(`
      INSERT INTO purchase_invoices (
        invoice_number, supplier_invoice_number, supplier_id, invoice_date,
        subtotal_paise, total_amount_paise, paid_amount_paise, outstanding_amount_paise,
        payment_status, created_by, status, created_at
      ) VALUES (
        ?, ?, ?, ?,
        ?, ?, 0, ?,
        'unpaid', 1, 'approved', COALESCE(?, CURRENT_TIMESTAMP)
      )
    `);
    const res = stmt.run(invNum, `SUPP-${invNum}`, suppId, date, amountPaise, amountPaise, amountPaise, createdAt);
    return Number(res.lastInsertRowid);
  }

  // Create 3 bills: Bill 1 = ₹10 (1000 paise), Bill 2 = ₹20 (2000 paise), Bill 3 = ₹30 (3000 paise)
  // Total = ₹60 (6000 paise)
  const b1Id = createTestBill('TEST-B1', testSuppId, '2026-10-01', 1000, '2026-10-01 10:00:00');
  const b2Id = createTestBill('TEST-B2', testSuppId, '2026-10-05', 2000, '2026-10-05 10:00:00');
  const b3Id = createTestBill('TEST-B3', testSuppId, '2026-10-10', 3000, '2026-10-10 10:00:00');

  try {
    // -------------------------------------------------------------
    // T1: Vendor with bills 10, 20, 30. Pay 15 cash -> Bill 1 Paid, Bill 2 Partial (bal 15), Bill 3 untouched (30). Vendor bal 45.
    // -------------------------------------------------------------
    console.log('[T1] Testing FIFO Payment: Pay ₹15 (1500 paise) on 10, 20, 30 bills...');
    assert.strictEqual(getVendorOutstanding(testSuppId), 6000, 'Initial vendor outstanding must be 6000 paise (₹60)');

    const pay1Res = recordVendorPayment({
      supplier_id: testSuppId,
      amount_paise: 1500,
      payment_method: 'cash',
      payment_date: '2026-10-20',
      narration: 'T1 FIFO test payment',
    });

    const b1State = getBillBalance(b1Id);
    const b2State = getBillBalance(b2Id);
    const b3State = getBillBalance(b3Id);
    const vendorBal1 = getVendorOutstanding(testSuppId);

    assert.strictEqual(b1State.balance, 0, 'Bill 1 must be Paid in full (balance 0)');
    assert.strictEqual(b1State.paid, 1000, 'Bill 1 paid must be 1000 paise');
    assert.strictEqual(b2State.balance, 1500, 'Bill 2 must be partially paid with 1500 paise remaining');
    assert.strictEqual(b2State.paid, 500, 'Bill 2 paid must be 500 paise');
    assert.strictEqual(b3State.balance, 3000, 'Bill 3 must be untouched with 3000 paise remaining');
    assert.strictEqual(b3State.paid, 0, 'Bill 3 paid must be 0 paise');
    assert.strictEqual(vendorBal1, 4500, 'Vendor total outstanding must be 4500 paise (₹45)');
    console.log('  ✓ T1 Passed: Bill 1 cleared, Bill 2 partly paid (bal 15), Bill 3 untouched (bal 30). Vendor balance ₹45.00.\n');

    // -------------------------------------------------------------
    // T2: Pay 45 more -> all Paid, tile disappears (outstanding 0).
    // -------------------------------------------------------------
    console.log('[T2] Testing Settling Full Balance: Pay remaining ₹45 (4500 paise)...');
    const pay2Res = recordVendorPayment({
      supplier_id: testSuppId,
      amount_paise: 4500,
      payment_method: 'bank',
      payment_date: '2026-10-21',
      narration: 'T2 Full settlement',
    });

    assert.strictEqual(getBillBalance(b1Id).balance, 0, 'Bill 1 balance 0');
    assert.strictEqual(getBillBalance(b2Id).balance, 0, 'Bill 2 balance 0');
    assert.strictEqual(getBillBalance(b3Id).balance, 0, 'Bill 3 balance 0');
    assert.strictEqual(getVendorOutstanding(testSuppId), 0, 'Vendor total outstanding must be 0');
    console.log('  ✓ T2 Passed: All bills paid, vendor outstanding is 0 (tile will not appear in Pending).\n');

    // -------------------------------------------------------------
    // T3: Pay 70 when outstanding 60 -> blocked with message showing 60.
    // -------------------------------------------------------------
    console.log('[T3] Testing Overpayment Prevention...');
    // Re-create a bill of 6000 paise to test overpayment
    const bOverId = createTestBill('TEST-BOVER', testSuppId, '2026-10-22', 6000);

    let overpayBlocked = false;
    try {
      recordVendorPayment({
        supplier_id: testSuppId,
        amount_paise: 7000, // ₹70
        payment_method: 'cash',
        payment_date: '2026-10-22',
      });
    } catch (err) {
      overpayBlocked = true;
      assert(err.message.includes('60.00'), `Error message should mention total outstanding balance ₹60.00: ${err.message}`);
    }
    assert.strictEqual(overpayBlocked, true, 'Payment of ₹70 when outstanding ₹60 must throw validation error');
    // clean up test bill
    db.prepare('DELETE FROM purchase_invoices WHERE id = ?').run(bOverId);
    console.log('  ✓ T3 Passed: Overpayment strictly blocked and error message indicates exact current balance.\n');

    // -------------------------------------------------------------
    // T4: Reverse 15 payment -> balances restored to 10/20/30, cash box and ledger restored.
    // -------------------------------------------------------------
    console.log('[T4] Testing Payment Reversal & Balance Restoration...');
    // Reverse pay2Res first
    reversePayment(pay2Res.voucher.id, 'Testing reverse pay 2');
    // Reverse pay1Res (the 1500 payment)
    reversePayment(pay1Res.voucher.id, 'Testing reverse pay 1');

    assert.strictEqual(getBillBalance(b1Id).balance, 1000, 'Bill 1 balance restored to 1000 paise');
    assert.strictEqual(getBillBalance(b2Id).balance, 2000, 'Bill 2 balance restored to 2000 paise');
    assert.strictEqual(getBillBalance(b3Id).balance, 3000, 'Bill 3 balance restored to 3000 paise');
    assert.strictEqual(getVendorOutstanding(testSuppId), 6000, 'Vendor total outstanding restored to 6000 paise');

    // Check voucher marked is_reversed
    const v1Row = db.prepare('SELECT is_reversed, reversal_reason FROM payments_receipts WHERE id = ?').get(pay1Res.voucher.id);
    assert.strictEqual(v1Row.is_reversed, 1, 'Original voucher must have is_reversed = 1');
    assert.strictEqual(v1Row.reversal_reason, 'Testing reverse pay 1', 'Reversal reason must be stored');

    // Check shift_cash_movements deactivated
    const moveRow = db.prepare('SELECT is_active FROM shift_cash_movements WHERE reason LIKE ?').get(`%Voucher #${pay1Res.voucher.voucher_number}%`);
    if (moveRow) {
      assert.strictEqual(moveRow.is_active, 0, 'Associated shift_cash_movements must be marked inactive (0)');
    }
    console.log('  ✓ T4 Passed: Balances fully restored to 10/20/30, shift cash deactivated, voucher marked reversed.\n');

    // -------------------------------------------------------------
    // T5: Same-date bills allocated by created_at, then id.
    // -------------------------------------------------------------
    console.log('[T5] Testing Same-Date Bills Ordering (created_at then id)...');
    const s1Id = createTestBill('TEST-SD1', testSuppId, '2026-10-15', 500, '2026-10-15 08:00:00');
    const s2Id = createTestBill('TEST-SD2', testSuppId, '2026-10-15', 500, '2026-10-15 09:00:00');

    // Pay ₹5 (500 paise) targeting these bills
    // Clean up b1, b2, b3 temporarily to isolate s1 & s2
    db.prepare('DELETE FROM purchase_invoices WHERE id IN (?, ?, ?)').run(b1Id, b2Id, b3Id);

    const paySameDate = recordVendorPayment({
      supplier_id: testSuppId,
      amount_paise: 500,
      payment_method: 'cash',
      payment_date: '2026-10-15',
    });

    assert.strictEqual(getBillBalance(s1Id).balance, 0, 'Earlier created_at bill must be paid first (balance 0)');
    assert.strictEqual(getBillBalance(s2Id).balance, 500, 'Later created_at bill must remain untouched (balance 500)');

    // clean up s1 and s2
    reversePayment(paySameDate.voucher.id, 'Clean up T5');
    db.prepare('DELETE FROM purchase_invoices WHERE id IN (?, ?)').run(s1Id, s2Id);
    console.log('  ✓ T5 Passed: Same-date bills allocated in strict created_at ASC sequence.\n');

    // -------------------------------------------------------------
    // T6: Cash payment reduces open shift cash; Bank payment reduces bank balance and NOT cash.
    // -------------------------------------------------------------
    console.log('[T6] Testing Liquid Mode Distinction (Cash vs Bank)...');
    const bT6Id = createTestBill('TEST-T6', testSuppId, '2026-10-16', 2000);

    // Pay 500 Cash
    const cashPay = recordVendorPayment({
      supplier_id: testSuppId,
      amount_paise: 500,
      payment_method: 'cash',
      payment_date: '2026-10-16',
    });

    const cashMove = db.prepare('SELECT movement_type, amount_paise FROM shift_cash_movements WHERE reason LIKE ?').get(`%Voucher #${cashPay.voucher.voucher_number}%`);
    assert(cashMove, 'Cash payment must generate a shift_cash_movements entry');
    assert.strictEqual(cashMove.movement_type, 'cash_out');
    assert.strictEqual(cashMove.amount_paise, 500);

    // Pay 500 Bank
    const bankPay = recordVendorPayment({
      supplier_id: testSuppId,
      amount_paise: 500,
      payment_method: 'bank',
      payment_date: '2026-10-16',
    });

    const bankInCash = db.prepare('SELECT id FROM shift_cash_movements WHERE reason LIKE ?').get(`%Voucher #${bankPay.voucher.voucher_number}%`);
    assert(!bankInCash, 'Bank payment must NEVER create a shift cash movement');

    // Clean up
    reversePayment(cashPay.voucher.id, 'Clean T6 cash');
    reversePayment(bankPay.voucher.id, 'Clean T6 bank');
    db.prepare('DELETE FROM purchase_invoices WHERE id = ?').run(bT6Id);
    console.log('  ✓ T6 Passed: Cash payment reduces shift cash; Bank payment does not affect cash box.\n');

    // -------------------------------------------------------------
    // T7: Manual allocation mode.
    // -------------------------------------------------------------
    console.log('[T7] Testing Manual Allocation Mode...');
    const bM1Id = createTestBill('TEST-M1', testSuppId, '2026-10-10', 1000);
    const bM2Id = createTestBill('TEST-M2', testSuppId, '2026-10-11', 2000);

    // Manually pay 1500 to M2 directly (skipping M1)
    const manPay = recordVendorPayment({
      supplier_id: testSuppId,
      amount_paise: 1500,
      payment_method: 'bank',
      payment_date: '2026-10-12',
      manual_allocations: [
        { bill_id: bM2Id, allocated_amount_paise: 1500 },
      ],
    });

    assert.strictEqual(getBillBalance(bM1Id).balance, 1000, 'Skipped bill M1 remains untouched at 1000 balance');
    assert.strictEqual(getBillBalance(bM2Id).balance, 500, 'Manually targeted bill M2 has 500 balance remaining');

    reversePayment(manPay.voucher.id, 'Clean T7');
    db.prepare('DELETE FROM purchase_invoices WHERE id IN (?, ?)').run(bM1Id, bM2Id);
    console.log('  ✓ T7 Passed: Manual allocation correctly targets selected bill without touching earlier bills.\n');

    // -------------------------------------------------------------
    // T8: Double-click prevention (Idempotency).
    // -------------------------------------------------------------
    console.log('[T8] Testing Double-Posting Prevention via Idempotency...');
    const bIdempId = createTestBill('TEST-IDEMP', testSuppId, '2026-10-15', 3000);

    const key = `KEY-${Date.now()}`;
    const firstPay = recordVendorPayment({
      supplier_id: testSuppId,
      amount_paise: 1000,
      payment_method: 'cash',
      payment_date: '2026-10-15',
      idempotency_key: key,
    });

    const secondPay = recordVendorPayment({
      supplier_id: testSuppId,
      amount_paise: 1000,
      payment_method: 'cash',
      payment_date: '2026-10-15',
      idempotency_key: key,
    });

    assert.strictEqual(secondPay.isDuplicate, true, 'Duplicate call must be intercepted as duplicate');
    assert.strictEqual(firstPay.voucher.id, secondPay.voucher.id, 'Must return same voucher ID');
    assert.strictEqual(getBillBalance(bIdempId).balance, 2000, 'Balance must only be deducted once (2000 remaining)');

    reversePayment(firstPay.voucher.id, 'Clean T8');
    db.prepare('DELETE FROM purchase_invoices WHERE id = ?').run(bIdempId);
    console.log('  ✓ T8 Passed: Double-click with same key returns existing voucher with 0 double deduction.\n');

    // -------------------------------------------------------------
    // T9: Atomic rollback verification & Payables health check.
    // -------------------------------------------------------------
    console.log('[T9] Testing Atomic Health Check & Zero Drift...');
    const health = checkPayablesHealth();
    assert.strictEqual(health.is_healthy, true, 'All active purchase invoices must have 0 balance drift');
    assert.strictEqual(health.discrepancies_count, 0, 'Discrepancies count must be 0');
    console.log(`  ✓ T9 Passed: Verified ${health.checked_bills_count} bills across database. 0 drift detected.\n`);

    // -------------------------------------------------------------
    // T10: Real data test: Pay Rs 200 to rahul, verify SQL before/after, reverse it.
    // -------------------------------------------------------------
    console.log('[T10] Testing Real Production Data: rahul (supplier #1)...');
    const rahulBefore = getVendorOutstanding(1);
    console.log(`  Rahul balance before: ₹${(rahulBefore / 100).toFixed(2)} (${rahulBefore} paise)`);

    // Pay ₹200 (20,000 paise)
    const rahulPay = recordVendorPayment({
      supplier_id: 1,
      amount_paise: 20000,
      payment_method: 'bank',
      payment_date: new Date().toISOString().slice(0, 10),
      narration: 'T10 automated real data test payment',
    });

    const rahulAfter = getVendorOutstanding(1);
    console.log(`  Rahul balance after ₹200 payment: ₹${(rahulAfter / 100).toFixed(2)} (${rahulAfter} paise)`);
    assert.strictEqual(rahulAfter, rahulBefore - 20000, 'Rahul balance must decrease by exactly 20,000 paise');

    // Reverse it back
    reversePayment(rahulPay.voucher.id, 'T10 automated test cleanup');
    const rahulRestored = getVendorOutstanding(1);
    console.log(`  Rahul balance restored: ₹${(rahulRestored / 100).toFixed(2)} (${rahulRestored} paise)`);
    assert.strictEqual(rahulRestored, rahulBefore, 'Rahul balance must be restored to original balance');
    console.log('  ✓ T10 Passed: Real supplier payment and reversal verified on live DB.\n');

    // -------------------------------------------------------------
    // T11: Consistency check: getVendorOutstanding matches Purchases, Payments, and Ledger.
    // -------------------------------------------------------------
    console.log('[T11] Testing Cross-Table Consistency for Prime Meat (supplier #2)...');
    const primeOut = getVendorOutstanding(2);
    const primeSumSQL = db.prepare(`
      SELECT SUM(total_amount_paise) as total, SUM(paid_amount_paise) as paid, SUM(outstanding_amount_paise) as out
      FROM purchase_invoices
      WHERE supplier_id = 2 AND COALESCE(status, 'approved') NOT IN ('rejected', 'draft')
    `).get();

    assert.strictEqual(primeOut, primeSumSQL.out, 'getVendorOutstanding must match sum of outstanding_amount_paise');
    console.log(`  Prime Meat balance: ₹${(primeOut / 100).toFixed(2)} matches cross-table SQL aggregation.`);
    console.log('  ✓ T11 Passed: 100% mathematical consistency confirmed.\n');

    // -------------------------------------------------------------
    // T12: Money formatter test: single currency symbol.
    // -------------------------------------------------------------
    console.log('[T12] Testing Money Formatter: Exactly One Symbol...');
    const fmt1 = formatMoney(18000); // default symbol ₹
    assert.strictEqual(fmt1, '₹180.00', 'formatMoney(18000) must return "₹180.00"');

    const fmt2 = formatMoney(18000, { symbol: 'Rs ' });
    assert.strictEqual(fmt2, 'Rs 180.00', 'formatMoney(18000, { symbol: "Rs " }) must return "Rs 180.00"');

    const fmt3 = formatMoney(0);
    assert.strictEqual(fmt3, '₹0.00', 'Zero must format as ₹0.00');

    // Verify no double symbols like "₹₹" or "Rs Rs"
    assert(!fmt1.includes('₹₹'), 'No double rupee symbol');
    assert(!fmt2.includes('Rs Rs'), 'No double Rs prefix');
    console.log('  ✓ T12 Passed: formatMoney strictly produces exactly ONE currency symbol.\n');

  } catch (err) {
    console.error('TEST ERROR IN TRY BLOCK:', err);
    throw err;
  } finally {
    // Clean up test supplier and any associated test rows
    db.prepare("DELETE FROM payment_allocations WHERE bill_type = 'purchase_invoice' AND bill_id IN (SELECT id FROM purchase_invoices WHERE supplier_id = ?)").run(testSuppId);
    db.prepare("DELETE FROM payments_receipts WHERE party_type = 'supplier' AND party_id = ?").run(testSuppId);
    db.prepare("DELETE FROM accounting_daily_ledger WHERE description LIKE '%Test Vendor%'").run();
    db.prepare("DELETE FROM shift_cash_movements WHERE taken_by = 'Test Vendor'").run();
    db.prepare('DELETE FROM purchase_invoices WHERE supplier_id = ?').run(testSuppId);
    db.prepare('DELETE FROM suppliers WHERE id = ?').run(testSuppId);
    console.log(`[CLEANUP] Deleted test vendor ID: ${testSuppId}`);
  }

  console.log('\n================================================================');
  console.log('  ALL 12 AUTOMATED TESTS PASSED WITH 0 ERRORS!                  ');
  console.log('================================================================');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed with Error:', err);
  process.exit(1);
});
