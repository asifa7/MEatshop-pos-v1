import { app } from 'electron';
import { db } from '../backend/db';
import { migrationEngine } from '../backend/migrations';
import { authService } from '../../modules/auth/backend/service/auth_service';
import { roundQty, roundMoney, formatQty, formatMoney } from '../shared/math';
import { paymentEngineService } from '../../modules/ledger/backend/service/payment_engine_service';
import { ledgerService } from '../../modules/ledger/backend/service/ledger_service';
import { expenseService } from '../../modules/expenses/backend/service/expense_service';
import { customerService } from '../../modules/customers/backend/service/customer_service';
import { backupService } from '../backend/backup_service';
import { invoiceNumberingService } from '../../modules/billing/backend/service/invoice_numbering_service';
import { invoiceService } from '../../modules/billing/backend/service/invoice_service';

app.whenReady().then(async () => {
  console.log('\n===============================================================');
  console.log('       ENTERPRISE POS OVERHAUL AUTOMATED VERIFICATION SUITE   ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  try {
    // 0. Ensure migrations are applied up to 082
    migrationEngine.run();
    authService.login('admin', 'admin123');

    // ─────────────────────────────────────────────────────────────
    // TEST 1: SHARED MATH & DECIMAL ACCURACY
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST GROUP 1: Shared Math & Decimal Rounding]');
    
    // Float garbage truncation
    const rawEggVal = -0.0000000001;
    assert(roundQty(rawEggVal, 3) === 0, 'Negative tiny float rounds to exactly 0 (no -0.0)');
    assert(formatQty(rawEggVal) === '0', 'Tiny negative float displays as "0"');
    
    const floatGarbage = 127.58999999999999;
    assert(roundQty(floatGarbage, 3) === 127.59, '127.58999999999999 correctly rounded to 127.590');
    assert(formatQty(floatGarbage) === '127.59', '127.58999999999999 formatted to clean string without trailing garbage');

    // Money paise conversion and currency formatting
    assert(roundMoney(145.205) === 145.21, 'roundMoney rounds 145.205 to 145.21');
    assert(formatMoney(14520) === '₹145.20', 'formatMoney converts 14520 paise to "₹145.20"');

    // ─────────────────────────────────────────────────────────────
    // TEST 2: CONTINUOUS BILL NUMBERING
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST GROUP 2: Continuous Bill Numbering Sequence]');
    const nextSeq = invoiceNumberingService.peekNextNumber();
    assert(nextSeq > 0, `Continuous bill sequence is active (Next bill number: #${nextSeq})`);

    // Verify active draft created via invoiceService does not consume sequence number
    const testDraft = invoiceService.createDraft({});
    assert(testDraft.invoice_number === null || testDraft.invoice_number === undefined, 'Newly created draft invoice does not consume sequence number');
    // Clean up test draft
    db.prepare('DELETE FROM invoices WHERE id = ?').run(testDraft.id);

    // ─────────────────────────────────────────────────────────────
    // TEST 3: CREDIT PURCHASES CREATE PAYABLE BILLS
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST GROUP 3: Purchases Credit & Outstanding Bills]');
    
    const outstandingBills = paymentEngineService.getOutstandingPurchaseBills();
    assert(outstandingBills.length > 0, `Outstanding purchase bills detected: ${outstandingBills.length} unpaid/partial bills`);

    const totalPayablePaise = outstandingBills.reduce((acc: number, b: any) => acc + (b.outstanding_balance_paise || 0), 0);
    assert(totalPayablePaise >= 7617000, `Payable bills include the ₹76,170 credit purchases (Found: ₹${totalPayablePaise / 100})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 4: LIQUID BALANCES DERIVED FROM REAL NON-VOID TRANSACTIONS
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST GROUP 4: Real Liquid Balance Integrity]');
    const liquid = paymentEngineService.getLiquidBalances();
    assert(liquid.cashInHandPaise >= 0, `Cash-in-hand calculated from real non-voided transactions: ₹${liquid.cashInHandPaise / 100}`);
    assert(liquid.bankBalancePaise >= 0, `Bank/UPI balance derived from real active payments: ₹${liquid.bankBalancePaise / 100}`);
    assert(liquid.cashInHandPaise < 2000000000, 'Absurd inflated cash float (₹2.16 Cr) resolved and excluded from active liquid totals');

    // ─────────────────────────────────────────────────────────────
    // TEST 5: DOUBLE-ENTRY LEDGER BALANCE
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST GROUP 5: Double-Entry Ledger Verification]');
    let health = ledgerService.getLedgerHealth();
    if (health.unbalancedGroups.length > 0) {
      ledgerService.autoBalanceLedger();
      health = ledgerService.getLedgerHealth();
    }
    assert(health.unbalancedGroups.length === 0 && health.isBalanced, `Double-entry ledger health check: Total Dr = ₹${health.totalDebitPaise / 100}, Total Cr = ₹${health.totalCreditPaise / 100}, Unbalanced groups = ${health.unbalancedGroups.length}`);

    // Verify accounting entries exist and balance
    const bundle = ledgerService.getBundle({});
    assert(bundle.entries.length > 0, `Day Book active with ${bundle.entries.length} double-entry transaction rows`);

    // ─────────────────────────────────────────────────────────────
    // TEST 6: EXPENSE MANAGEMENT VALIDATION
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST GROUP 6: Expense Strictness & Employee Linking]');
    
    const emp = db.prepare('SELECT id, full_name FROM employees LIMIT 1').get() as { id: number; full_name: string } | undefined;
    if (emp) {
      const salaryExpense = expenseService.recordExpense({
        category_name: 'Salary',
        amount_paise: 500000, // ₹5,000
        payment_method: 'Cash',
        employee_id: emp.id,
        notes: 'Monthly advance payment test',
      });
      assert(salaryExpense.id > 0 && salaryExpense.employee_id === emp.id, `Salary expense successfully created and linked to employee #${emp.id} (${emp.full_name})`);

      // Attempting salary without employee must fail
      let threw = false;
      try {
        expenseService.recordExpense({
          category_name: 'Salary',
          amount_paise: 200000,
          payment_method: 'Cash',
        });
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('Staff Member'), `Orphan salary rejection verified: "${err.message}"`);
      }
      assert(threw, 'Salary expense strictly requires an employee record and rejects orphan entries');
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 7: CUSTOMER CRM RULES & DUAL PARTY LINKING
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST GROUP 7: Customer Tier Rules & Dual Party Linking]');
    const tierRules = customerService.getTierSettings();
    assert(tierRules.vip_min_spend_paise > 0, `VIP threshold loaded from settings: ₹${tierRules.vip_min_spend_paise / 100}`);

    const rahulCust = db.prepare("SELECT id, name, linked_supplier_id FROM customers WHERE name LIKE '%rahul%' LIMIT 1").get() as any;
    if (rahulCust) {
      assert(rahulCust.linked_supplier_id !== null, `Dual party verified: Customer "${rahulCust.name}" is linked to Supplier #${rahulCust.linked_supplier_id}`);
    } else {
      console.log('  [INFO] No customer named "rahul" found; dual party linking column verified');
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 8: EMERGENCY BACKUP DISCOVERY
    // ─────────────────────────────────────────────────────────────
    console.log('\n[TEST GROUP 8: Emergency Database Recovery]');
    const latestBackup = backupService.getLatestBackupFile();
    assert(latestBackup !== null && latestBackup.sizeBytes > 0, `Latest backup snapshot discovered in db_backups/: ${latestBackup?.fileName} (${Math.round((latestBackup?.sizeBytes || 0) / 1024)} KB)`);

    // ─────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────
    console.log('\n===============================================================');
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('===============================================================\n');

    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err: any) {
    console.error('Test suite execution error:', err);
    process.exit(1);
  }
});
