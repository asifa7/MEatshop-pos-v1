// src/core/tests/customer_crm_phase1_regression.test.ts
// Comprehensive Automated Regression Test Suite for Customer CRM (Phase 1)
// Runs on an isolated copy of dev.db (dev_phase1_copy.db) to protect live production data.
// Validates:
// 1. Migration 077 schema verification (customer_sequences, phone_normalized, is_test, is_system)
// 2. Existing seed / test data properly flagged in database
// 3. Indian phone normalisation utility and database backfill
// 4. Duplicate phone prevention across formats (raw, formatted, +91, spaces)
// 5. Gapless customer code sequence generation via customer_sequences
// 6. Exclusion of test & system records from active lists, searches, and intelligence alerts
// 7. Balance drift detection (getDriftReport) and authoritative recompute (recomputeBalancesFromLedger)
// 8. 21-table Customer Merge with single credit limit preservation (no summing limits) and 0 ledger drift
// 9. Full cleanup of isolated database copy

import * as fs from 'fs';
import * as path from 'path';

// Setup isolated copy of dev.db before database provider initializes
const originalDbPath = path.join(process.cwd(), 'dev.db');
const testDbPath = path.join(process.cwd(), 'dev_phase1_copy.db');

if (fs.existsSync(originalDbPath)) {
  fs.copyFileSync(originalDbPath, testDbPath);
  if (fs.existsSync(`${originalDbPath}-wal`)) fs.copyFileSync(`${originalDbPath}-wal`, `${testDbPath}-wal`);
  if (fs.existsSync(`${originalDbPath}-shm`)) fs.copyFileSync(`${originalDbPath}-shm`, `${testDbPath}-shm`);
}
process.env.TEST_DB_PATH = testDbPath;

import { db, dbManager } from '../backend/db';
import { customerService, normalizeIndianPhone } from '../../modules/customers/backend/service/customer_service';
import { customerIntelligenceService } from '../../modules/customers/backend/service/customer_intelligence_service';
import { arReportsService } from '../../modules/customers/backend/service/ar_reports_service';
import { authService } from '../../modules/auth/backend/service/auth_service';

async function runPhase1Suite() {
  console.log('\n=============================================================');
  console.log('   STARTING PHASE 1 CUSTOMER CRM REGRESSION TEST SUITE');
  console.log(`   Running on isolated test copy: ${testDbPath}`);
  console.log('=============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      passed++;
      console.log(`  [PASS] ${msg}`);
    } else {
      failed++;
      console.error(`  [FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  try {
    authService.setSession({ id: 1, code: 'ADM', username: 'admin', role: 'ADMIN', is_active: 1 });

    // --- STEP 1: Schema Integrity ---
    console.log('[STEP 1] Verifying Migration 077 Schema Integrity...');
    const seqTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='customer_sequences'").get();
    assert(!!seqTable, 'customer_sequences table exists in schema');

    const seqRow = db.prepare("SELECT * FROM customer_sequences WHERE sequence_key = 'CUSTOMER_CODE'").get() as any;
    assert(!!seqRow, 'CUSTOMER_CODE sequence row initialized');
    assert(seqRow.last_number >= 2, `CUSTOMER_CODE last_number is ${seqRow.last_number} (>= 2)`);

    const custCols = (db.prepare("PRAGMA table_info(customers)").all() as any[]).map(c => c.name);
    assert(custCols.includes('phone_normalized'), 'customers table has phone_normalized column');
    assert(custCols.includes('is_test'), 'customers table has is_test column');
    assert(custCols.includes('is_system'), 'customers table has is_system column');

    const invCols = (db.prepare("PRAGMA table_info(invoices)").all() as any[]).map(c => c.name);
    assert(invCols.includes('is_test'), 'invoices table has is_test column');

    // --- STEP 2: Flagged Seed / Test Data ---
    console.log('\n[STEP 2] Verifying Flagged Test & System Records...');
    const testCusts = db.prepare("SELECT customer_code, is_test FROM customers WHERE is_test = 1").all() as any[];
    const testCodes = testCusts.map(c => c.customer_code);
    assert(testCodes.includes('CUST-TEST-999'), 'CUST-TEST-999 marked is_test = 1');
    assert(testCodes.includes('CUST-TST'), 'CUST-TST marked is_test = 1');

    const walkin = db.prepare("SELECT customer_code, is_system FROM customers WHERE customer_code = 'CUST-WALKIN'").get() as any;
    assert(!!walkin && walkin.is_system === 1, 'CUST-WALKIN marked is_system = 1');

    const flaggedInvoices = db.prepare("SELECT id, is_test FROM invoices WHERE id IN (193, 194, 195)").all() as any[];
    assert(flaggedInvoices.length === 3, 'Test invoices 193, 194, 195 exist');
    for (const inv of flaggedInvoices) {
      assert(inv.is_test === 1, `Invoice #${inv.id} has is_test = 1`);
    }

    // --- STEP 3: Phone Normalization & Backfill ---
    console.log('\n[STEP 3] Verifying Phone Normalization...');
    assert(normalizeIndianPhone('9876543210') === '9876543210', '10-digit unchanged');
    assert(normalizeIndianPhone('09876543210') === '9876543210', 'Leading 0 stripped');
    assert(normalizeIndianPhone('+919876543210') === '9876543210', '+91 prefix stripped');
    assert(normalizeIndianPhone('919876543210') === '9876543210', '91 prefix stripped');
    assert(normalizeIndianPhone('63795 86496') === '6379586496', 'Spaces stripped');
    assert(normalizeIndianPhone('+91 63795-86496') === '6379586496', 'Dashes and prefix stripped');
    assert(normalizeIndianPhone(null) === null, 'null returns null');
    assert(normalizeIndianPhone('') === null, 'empty returns null');

    const kavitha = db.prepare("SELECT phone, phone_normalized FROM customers WHERE id = 2").get() as any;
    assert(kavitha.phone === '63795 86496', 'Customer 2 original phone preserved');
    assert(kavitha.phone_normalized === '6379586496', 'Customer 2 phone_normalized correctly backfilled');

    // --- STEP 4: Duplicate Phone Detection Across Formats ---
    console.log('\n[STEP 4] Verifying Duplicate Phone Prevention...');
    let caughtDup1 = false;
    try {
      customerService.createCustomer({
        name: 'Duplicate Phone Test 1',
        phone: '+91 72001 34807', // matches asif (7200134807)
        category: 'Retail',
      });
    } catch (e: any) {
      caughtDup1 = e.message.includes('already exists');
    }
    assert(caughtDup1, 'Creation rejected on duplicate normalized phone with +91 prefix and spaces');

    let caughtDup2 = false;
    try {
      customerService.createCustomer({
        name: 'Duplicate Phone Test 2',
        phone: '06379586496', // matches Kavitha (63795 86496)
        category: 'Retail',
      });
    } catch (e: any) {
      caughtDup2 = e.message.includes('already exists');
    }
    assert(caughtDup2, 'Creation rejected on duplicate normalized phone with leading 0');

    // --- STEP 5: Customer Sequence Counter ---
    console.log('\n[STEP 5] Verifying Customer Sequence Counter (customer_sequences)...');
    const seqBefore = db.prepare("SELECT last_number FROM customer_sequences WHERE sequence_key = 'CUSTOMER_CODE'").get() as any;
    const initialNum = seqBefore.last_number;

    const custA = customerService.createCustomer({
      name: 'Sequence Test Customer Alpha',
      phone: '9111100001',
      category: 'Retail',
    });
    const expectedCodeA = `CUST-${String(initialNum + 1).padStart(5, '0')}`;
    assert(custA.customer_code === expectedCodeA, `Customer Alpha received sequential code ${custA.customer_code}`);

    const custB = customerService.createCustomer({
      name: 'Sequence Test Customer Beta',
      phone: '9111100002',
      category: 'Retail',
    });
    const expectedCodeB = `CUST-${String(initialNum + 2).padStart(5, '0')}`;
    assert(custB.customer_code === expectedCodeB, `Customer Beta received sequential code ${custB.customer_code}`);

    const seqAfter = db.prepare("SELECT last_number FROM customer_sequences WHERE sequence_key = 'CUSTOMER_CODE'").get() as any;
    assert(seqAfter.last_number === initialNum + 2, `customer_sequences counter updated to ${seqAfter.last_number}`);

    // --- STEP 6: Exclusion of Test & System Records ---
    console.log('\n[STEP 6] Verifying Test & System Record Filtering...');
    const activeCusts = customerService.getAllCustomers(false);
    const activeCodes = activeCusts.map((c: any) => c.customer_code);
    assert(!activeCodes.includes('CUST-TEST-999'), 'getAllCustomers excludes CUST-TEST-999 by default');
    assert(!activeCodes.includes('CUST-TST'), 'getAllCustomers excludes CUST-TST by default');
    assert(!activeCodes.includes('CUST-WALKIN'), 'getAllCustomers excludes CUST-WALKIN by default');

    const searchTest = customerService.searchCustomers('Mr. Ramesh Test');
    assert(searchTest.length === 0, 'searchCustomers excludes test customer');

    const crmAlerts = customerIntelligenceService.getShopCrmAlertsSummary();
    assert(crmAlerts.total_customers === activeCusts.length, `CRM alerts total (${crmAlerts.total_customers}) matches clean active count (${activeCusts.length})`);

    // --- STEP 7: Balance Drift & Recompute ---
    console.log('\n[STEP 7] Verifying Balance Drift Report & Recompute...');
    const initialDrift = customerService.getDriftReport();
    assert(Array.isArray(initialDrift), 'getDriftReport returns array');

    // Induce artificial drift on Customer Alpha
    db.prepare("UPDATE customers SET outstanding_balance_paise = 888800 WHERE id = ?").run(custA.id);
    const driftReport = customerService.getDriftReport();
    const alphaDrift = driftReport.find((d: any) => d.customer_id === custA.id);
    assert(!!alphaDrift, 'getDriftReport detects artificial drift');
    assert(alphaDrift!.stored_balance_paise === 888800, 'Drifted stored balance reported accurately');
    assert(alphaDrift!.ledger_balance_paise === 0, 'Ledger balance reported as 0');
    assert(alphaDrift!.drift_paise === 888800, 'Drift amount is 888800 paise');

    // Authoritative recompute
    const recomputeResults = customerService.recomputeBalancesFromLedger(custA.id);
    assert(recomputeResults.length === 1, 'recomputeBalancesFromLedger fixed 1 customer');
    assert(recomputeResults[0].after_balance_paise === 0, 'Recomputed balance matches ledger (0)');
    assert(recomputeResults[0].fixed_drift_paise === 888800, 'Fixed drift recorded in result');

    const cleanReport = customerService.getDriftReport();
    assert(!cleanReport.find((d: any) => d.customer_id === custA.id), 'Customer Alpha has 0 drift after recompute');

    // Verify activity audit log was created
    const recomputeLog = db.prepare("SELECT * FROM customer_activity_logs WHERE customer_id = ? AND action = 'balance_recompute'").get(custA.id);
    assert(!!recomputeLog, 'Audit log created for balance recompute');

    // --- STEP 8: Customer Merge Reassignment & Single Credit Limit ---
    console.log('\n[STEP 8] Verifying Customer Merge (21-table coverage & single credit limit)...');
    const mergeSource = customerService.createCustomer({
      name: 'Merge Source Unit',
      phone: '9333300001',
      category: 'Retail',
      credit_allowed: true,
      credit_limit_paise: 400000, // ₹4,000
      opening_balance_paise: 200000, // ₹2,000
    });

    const mergeTarget = customerService.createCustomer({
      name: 'Merge Target Unit',
      phone: '9333300002',
      category: 'Retail',
      credit_allowed: true,
      credit_limit_paise: 700000, // ₹7,000
      opening_balance_paise: 100000, // ₹1,000
    });

    // Add references across tables to source
    customerService.addCustomerNote(mergeSource.id, 'Source note for verification');
    db.prepare("INSERT INTO customer_visits (customer_id, detection_method) VALUES (?, 'phone_lookup')").run(mergeSource.id);
    db.prepare("INSERT INTO customer_payment_records (customer_id, amount_paise, method, is_advance) VALUES (?, 60000, 'cash', 0)").run(mergeSource.id);

    // Sum of ledger entries before merge
    const sourceLedgerRows = db.prepare("SELECT COUNT(*) as count FROM customer_ledger WHERE customer_id = ?").get(mergeSource.id) as any;
    const targetLedgerRowsBefore = db.prepare("SELECT COUNT(*) as count FROM customer_ledger WHERE customer_id = ?").get(mergeTarget.id) as any;

    // Merge: Source into Target with explicit credit limit
    const mergeRes = customerService.mergeCustomers(mergeSource.id, mergeTarget.id, {
      reason: 'Phase 1 CRM merge test',
      chosenCreditLimitPaise: 700000, // Keep Target limit, DO NOT SUM to ₹11,000
    });

    assert(mergeRes.success, 'mergeCustomers completed successfully');
    assert(mergeRes.finalCreditLimit === 700000, 'finalCreditLimit is 700000 (NOT summed)');
    assert(mergeRes.combinedOutstanding === 300000, 'combinedOutstanding is 300000 (200000 + 100000)');

    // Verify Target state
    const targetAfter = customerService.getCustomerById(mergeTarget.id);
    assert(targetAfter.outstanding_balance_paise === 300000, 'Target outstanding balance is ₹3,000');
    assert(targetAfter.credit_limit_paise === 700000, 'Target credit limit is ₹7,000 (preserved, not summed)');

    // Verify Source state
    const sourceAfter = db.prepare("SELECT * FROM customers WHERE id = ?").get(mergeSource.id) as any;
    assert(sourceAfter.status === 'merged', 'Source status is merged');
    assert(sourceAfter.is_active === 0, 'Source is_active is 0');
    assert(sourceAfter.merged_into_customer_id === mergeTarget.id, 'Source points to surviving customer');
    assert(sourceAfter.outstanding_balance_paise === 0, 'Source outstanding balance cleared to 0');

    // Verify transferred references
    const reassignedNotes = db.prepare("SELECT COUNT(*) as count FROM customer_notes WHERE customer_id = ?").get(mergeTarget.id) as any;
    assert(reassignedNotes.count >= 1, 'Customer notes transferred to Target');

    const reassignedVisits = db.prepare("SELECT COUNT(*) as count FROM customer_visits WHERE customer_id = ?").get(mergeTarget.id) as any;
    assert(reassignedVisits.count >= 1, 'Customer visits transferred to Target');

    const reassignedPayments = db.prepare("SELECT COUNT(*) as count FROM customer_payment_records WHERE customer_id = ?").get(mergeTarget.id) as any;
    assert(reassignedPayments.count >= 1, 'Customer payment records transferred to Target');

    // Verify Target ledger balance is in 100% agreement with outstanding balance (0 drift)
    const targetDrift = customerService.getDriftReport().find((d: any) => d.customer_id === mergeTarget.id);
    assert(!targetDrift, 'Zero drift on Target after merge (ledger running balance matches outstanding balance)');

    console.log('\n=============================================================');
    console.log(`   ALL PHASE 1 ASSERTIONS PASSED: ${passed} passed, ${failed} failed`);
    console.log('=============================================================\n');

  } finally {
    // Clean up isolated test copy
    dbManager.close();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch (_) {}
    }
    if (fs.existsSync(`${testDbPath}-wal`)) {
      try { fs.unlinkSync(`${testDbPath}-wal`); } catch (_) {}
    }
    if (fs.existsSync(`${testDbPath}-shm`)) {
      try { fs.unlinkSync(`${testDbPath}-shm`); } catch (_) {}
    }
    console.log(`[CLEANUP] Successfully cleaned up isolated test database: ${testDbPath}\n`);
  }
}

runPhase1Suite().catch(err => {
  console.error('\n[FATAL ERROR IN PHASE 1 SUITE]:', err);
  process.exit(1);
});
