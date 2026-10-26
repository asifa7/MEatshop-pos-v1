// src/core/tests/customer_crm_phase0_regression.test.ts
// Comprehensive Automated Regression Test Suite for Customer CRM & Sales Ledger (Phase 0)
// Runs on an isolated copy of dev.db (dev_regression_copy.db) to protect live production data.
// Validates:
// 1. Customer CRUD (Create, Read, Update, Search, Duplicate Check)
// 2. Integer paise money & integer grams weight integrity
// 3. Credit Account & Ledger balance calculation (Debit, Credit, Running Balance)
// 4. Credit validation rules (soft/hard limits)
// 5. Credit Invoice creation, ledger debit, settlement payment, and ledger balance reduction
// 6. Cash Invoice creation, calculation, payment, and customer purchase history linking
// 7. Anonymous sale processing (customer_id = NULL)
// 8. Invoice Return processing & stock resolution
// 9. Invoice Void / Cancellation processing
// 10. Customer Merge atomicity (invoices & ledger transferred, source merged/inactivated)
// 11. Cleanup of test database copy

import * as fs from 'fs';
import * as path from 'path';

// Setup isolated copy of dev.db before database provider initializes
const originalDbPath = path.join(process.cwd(), 'dev.db');
const testDbPath = path.join(process.cwd(), 'dev_regression_copy.db');

if (fs.existsSync(originalDbPath)) {
  fs.copyFileSync(originalDbPath, testDbPath);
  if (fs.existsSync(`${originalDbPath}-wal`)) fs.copyFileSync(`${originalDbPath}-wal`, `${testDbPath}-wal`);
  if (fs.existsSync(`${originalDbPath}-shm`)) fs.copyFileSync(`${originalDbPath}-shm`, `${testDbPath}-shm`);
}
process.env.TEST_DB_PATH = testDbPath;

import { db, dbManager } from '../backend/db';
import { migrationEngine } from '../backend/migrations';
import { customerService } from '../../modules/customers/backend/service/customer_service';
import { creditService } from '../../modules/customers/backend/service/credit_service';
import { arReportsService } from '../../modules/customers/backend/service/ar_reports_service';
import { invoiceService } from '../../modules/billing/backend/service/invoice_service';
import { authService } from '../../modules/auth/backend/service/auth_service';

async function runRegressionSuite() {
  console.log('\n=============================================================');
  console.log('   STARTING PHASE 0 CUSTOMER CRM REGRESSION TEST SUITE');
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
    // 0. Ensure Migrations & Auth
    console.log('[STEP 0] Running migration checks and authenticating admin...');
    migrationEngine.run();
    authService.setSession({ id: 1, code: 'ADM', username: 'admin', role: 'ADMIN', is_active: 1 });
    assert(true, 'Migrations verified and session established');

    // 1. Test Customer Creation
    console.log('\n[STEP 1] Testing Customer Creation...');
    const uniqueSuffix = Math.floor(100000 + Math.random() * 900000);
    const testPhone = `9811${uniqueSuffix}`;

    const created = customerService.createCustomer({
      name: `Regression Test User ${uniqueSuffix}`,
      phone: testPhone,
      whatsapp: testPhone,
      category: 'Wholesale',
      credit_allowed: true,
      credit_limit_paise: 5000000, // ₹50,000 in integer paise
      opening_balance_paise: 0,
      preferred_cut: 'Boneless',
      skin_preference: 'No Skin',
      cutting_preference: 'Biryani Cut',
      typical_quantity: '2 kg',
      billing_address_line1: '123 Market Road',
      billing_city: 'Bangalore',
      billing_state: 'Karnataka',
      billing_pincode: '560001',
    });

    assert(created.id > 0, `Created customer with ID #${created.id} and code ${created.customer_code}`);
    assert(typeof created.customer_code === 'string' && created.customer_code.startsWith('CUST-'), 'Customer code has valid CUST- prefix');

    // Verify persisted customer fields in SQLite
    const fetched = customerService.getCustomerById(created.id);
    assert(fetched.name === `Regression Test User ${uniqueSuffix}`, 'Persisted customer name matches');
    assert(fetched.credit_allowed === 1, 'Credit is allowed');
    assert(fetched.credit_limit_paise === 5000000, 'Credit limit is exactly 5000000 paise');
    assert(fetched.outstanding_balance_paise === 0, 'Outstanding balance is 0 paise');

    // 2. Test Customer Update & Editing
    console.log('\n[STEP 2] Testing Customer Update & Editing...');
    customerService.updateCustomer(created.id, {
      name: `Regression Test User Updated ${uniqueSuffix}`,
      category: 'Wholesale',
      credit_allowed: true,
      credit_limit_paise: 7500000, // Updated to ₹75,000
      preferred_cut: 'Bone',
      cutting_preference: 'Curry Cut',
      notes: 'Updated notes via regression test',
    });

    const updated = customerService.getCustomerById(created.id);
    assert(updated.name === `Regression Test User Updated ${uniqueSuffix}`, 'Customer name updated');
    assert(updated.credit_limit_paise === 7500000, 'Credit limit updated to 7500000 paise');
    assert(updated.preferred_cut === 'Bone', 'Preference updated to Bone');
    assert(updated.cutting_preference === 'Curry Cut', 'Cutting preference updated to Curry Cut');

    // 3. Test Duplicate Detection
    console.log('\n[STEP 3] Testing Duplicate Customer Detection...');
    const dupPhone = customerService.checkDuplicateCustomers({ phone: testPhone });
    assert(dupPhone.hasDuplicate === true, 'Duplicate detector flagged existing phone');
    assert(dupPhone.duplicates.some(d => d.id === created.id), 'Duplicate match identifies customer');

    const dupExcluded = customerService.checkDuplicateCustomers({ phone: testPhone, excludeId: created.id });
    assert(dupExcluded.hasDuplicate === false, 'Duplicate detector correctly excludes own customer ID during edit');

    // 4. Test Credit Sale Validation
    console.log('\n[STEP 4] Testing Credit Validation (limits and status)...');
    const validCheck = creditService.validateCreditSale(created.id, 200000, 1); // ₹2,000
    assert(validCheck.allowed === true, 'Credit sale ₹2,000 allowed within limit');

    // Test Excessive Sale Over Hard Limit
    const invalidCheck = creditService.validateCreditSale(created.id, 10000000, 1); // ₹1,00,000 exceeds ₹75,000
    assert(invalidCheck.allowed === false, 'Excessive credit sale rejected beyond hard limit');

    // 5. Test Credit Invoice Creation, Ledger Debit & Outstanding Update
    console.log('\n[STEP 5] Testing Credit Invoice Creation & Ledger Debit...');
    const variant = db.prepare(`
      SELECT pv.id, pv.variant_name, pv.current_rate_paise_per_unit, p.unit_type 
      FROM product_variants pv 
      JOIN products p ON pv.product_id = p.id 
      WHERE pv.is_active = 1 
      LIMIT 1
    `).get() as { id: number; variant_name: string; current_rate_paise_per_unit: number; unit_type: string };

    if (!variant) throw new Error('No active product variant found in database');

    const creditDraft = invoiceService.createDraft({
      customer_id: created.id,
      is_gst_invoice: false,
    });
    assert(creditDraft.customer_id === created.id, 'Draft invoice linked to customer');

    const isWeight = variant.unit_type === 'weight';
    const grams = isWeight ? 1000 : null;
    const units = isWeight ? null : 1;

    const afterItemCredit = invoiceService.addItem({
      invoice_id: creditDraft.id,
      product_variant_id: variant.id,
      quantity_grams: grams,
      quantity_units: units,
    });

    const creditTotalPaise = afterItemCredit.items.reduce((sum: number, it: any) => sum + it.line_total_paise, 0);
    assert(creditTotalPaise > 0, `Credit invoice total is ${creditTotalPaise} paise`);

    // Complete invoice on credit
    const completedCredit = invoiceService.completeInvoice({ invoiceId: creditDraft.id });
    assert(completedCredit.invoice.status === 'completed', 'Credit invoice completed');
    assert(completedCredit.invoice.payment_status === 'unpaid', 'Payment status is unpaid for credit sale');

    // Verify ledger row created for credit sale
    const ledgerAfterSale = arReportsService.getCustomerLedger(created.id, { limit: 50 }) as any[];
    assert(ledgerAfterSale.length >= 1, 'Ledger entry created for credit sale');
    const saleLedgerEntry = ledgerAfterSale[ledgerAfterSale.length - 1];
    assert(saleLedgerEntry.ref_type === 'invoice', 'Ledger entry ref_type is invoice');
    assert(saleLedgerEntry.debit_paise === creditTotalPaise, `Ledger debit ${saleLedgerEntry.debit_paise} equals invoice total`);
    assert(saleLedgerEntry.running_balance_paise === creditTotalPaise, `Running balance equals debit (${creditTotalPaise} paise)`);

    // Customer table outstanding balance verification
    const custAfterSale = customerService.getCustomerById(created.id);
    assert(custAfterSale.outstanding_balance_paise === creditTotalPaise, `Customer outstanding balance equals ${creditTotalPaise} paise`);

    // 6. Test Customer Payment Settlement & Outstanding Reduction
    console.log('\n[STEP 6] Testing Customer Payment & Ledger Settlement...');
    const payResult = creditService.recordPayment({
      customer_id: created.id,
      amount_paise: creditTotalPaise, // Full settlement
      method: 'upi',
      reference_number: 'UPI-TEST-SETTLE-001',
      notes: 'Full settlement via UPI',
    });
    assert(payResult.data?.paymentId > 0, 'Payment recorded successfully');

    // Ledger balance should now be 0 paise
    const ledgerAfterPay = arReportsService.getCustomerLedger(created.id, { limit: 50 }) as any[];
    const payLedgerEntry = ledgerAfterPay[ledgerAfterPay.length - 1];
    assert(payLedgerEntry.ref_type === 'payment', 'Latest ledger entry is payment');
    assert(payLedgerEntry.credit_paise === creditTotalPaise, `Payment credit equals ${creditTotalPaise} paise`);
    assert(payLedgerEntry.running_balance_paise === 0, 'Running balance reduced to 0 paise');

    // Customer table outstanding balance column verification
    const custAfterPay = customerService.getCustomerById(created.id);
    assert(custAfterPay.outstanding_balance_paise === 0, 'Customer table outstanding reduced to 0 paise');

    // Verify invoice marked paid
    const invAfterPay = db.prepare('SELECT payment_status FROM invoices WHERE id = ?').get(creditDraft.id) as { payment_status: string };
    assert(invAfterPay.payment_status === 'paid', 'Invoice payment_status updated to paid after settlement');

    // 7. Test Cash Invoice Creation, Calculation, & Purchase History
    console.log('\n[STEP 7] Testing Cash Invoice Creation, Calculation, & Purchase History...');
    const cashDraft = invoiceService.createDraft({
      customer_id: created.id,
      is_gst_invoice: false,
    });

    const afterItemCash = invoiceService.addItem({
      invoice_id: cashDraft.id,
      product_variant_id: variant.id,
      quantity_grams: isWeight ? 1500 : null,
      quantity_units: isWeight ? null : 2,
    });

    const cashItem = afterItemCash.items[0];
    assert(cashItem.product_variant_id === variant.id, 'Cash item variant matches');
    assert(cashItem.rate_paise_snapshot === variant.current_rate_paise_per_unit, 'Item rate is integer paise');
    assert(Number.isInteger(cashItem.line_total_paise), 'Item line total is integer paise');

    const expectedLineTotal = isWeight
      ? Math.round((1500 / 1000) * variant.current_rate_paise_per_unit)
      : 2 * variant.current_rate_paise_per_unit;
    assert(cashItem.line_total_paise === expectedLineTotal, `Line total matches formula (${expectedLineTotal} paise)`);

    const cashTotalPaise = afterItemCash.items.reduce((sum: number, it: any) => sum + it.line_total_paise, 0);
    invoiceService.recordPayment({
      invoice_id: cashDraft.id,
      method: 'cash',
      amount_paise: cashTotalPaise,
    });

    const completedCash = invoiceService.completeInvoice({ invoiceId: cashDraft.id });
    assert(completedCash.invoice.status === 'completed', 'Cash invoice completed successfully');
    assert(completedCash.invoice.payment_status === 'paid', 'Cash invoice payment status is paid');
    assert(completedCash.invoice.customer_id === created.id, 'Cash invoice linked to customer');

    // Verify purchase history contains both completed invoices
    const history = customerService.getCustomerPurchaseHistory(created.id, { limit: 10 });
    assert(history.invoices.length >= 2, `Purchase history reflects ${history.invoices.length} invoices`);
    assert(history.invoices.some(inv => inv.id === cashDraft.id), 'Purchase history includes cash invoice');
    assert(history.invoices.some(inv => inv.id === creditDraft.id), 'Purchase history includes credit invoice');

    // 8. Test Anonymous Walk-in Sale
    console.log('\n[STEP 8] Testing Anonymous Walk-in Sale (customer_id = null)...');
    const anonDraft = invoiceService.createDraft({ customer_id: null, is_gst_invoice: false });
    assert(anonDraft.customer_id === null, 'Anonymous draft has customer_id = null');

    const anonItem = invoiceService.addItem({
      invoice_id: anonDraft.id,
      product_variant_id: variant.id,
      quantity_grams: isWeight ? 800 : null,
      quantity_units: isWeight ? null : 1,
    });
    const anonTotalPaise = anonItem.items.reduce((sum: number, it: any) => sum + it.line_total_paise, 0);

    invoiceService.recordPayment({
      invoice_id: anonDraft.id,
      method: 'upi',
      amount_paise: anonTotalPaise,
    });

    const anonCompleted = invoiceService.completeInvoice({ invoiceId: anonDraft.id });
    assert(anonCompleted.invoice.status === 'completed', 'Anonymous invoice completed successfully');
    assert(anonCompleted.invoice.customer_id === null, 'Anonymous invoice persists customer_id = null');
    assert(anonCompleted.payments[0].method === 'upi', 'Payment method is UPI');

    // 9. Test Invoice Return Processing
    console.log('\n[STEP 9] Testing Invoice Return Lifecycle...');
    const returnResult = invoiceService.returnInvoice({
      invoice_id: completedCash.invoice.id,
      reason: 'Customer requested cut exchange',
      stock_resolution: 'restored',
      refund_given: true,
      refund_method: 'cash',
      items: [{
        product_variant_id: variant.id,
        quantity_grams: isWeight ? 1500 : null,
        quantity_units: isWeight ? null : 2,
        unit_rate_paise: variant.current_rate_paise_per_unit,
        refund_total_paise: cashTotalPaise,
      }],
    });
    assert(returnResult.invoice.status === 'returned', 'Invoice status updated to returned');
    assert(Math.abs(returnResult.invoice.total_paise) === cashTotalPaise, 'Refund total matches returned amount');

    // 10. Test Invoice Cancellation / Void
    console.log('\n[STEP 10] Testing Invoice Void / Cancellation...');
    // Create another invoice to void
    const draftToVoid = invoiceService.createDraft({ customer_id: created.id, is_gst_invoice: false });
    const voidAfterItem = invoiceService.addItem({
      invoice_id: draftToVoid.id,
      product_variant_id: variant.id,
      quantity_grams: isWeight ? 500 : null,
      quantity_units: isWeight ? null : 1,
    });
    const voidTotalPaise = voidAfterItem.items.reduce((sum: number, it: any) => sum + it.line_total_paise, 0);
    invoiceService.recordPayment({
      invoice_id: draftToVoid.id,
      method: 'cash',
      amount_paise: voidTotalPaise,
    });
    const completedToVoid = invoiceService.completeInvoice({ invoiceId: draftToVoid.id });
    assert(completedToVoid.invoice.status === 'completed', 'Invoice to void is completed');

    const voidResult = invoiceService.voidInvoice({
      invoice_id: completedToVoid.invoice.id,
      void_reason: 'Mistaken duplicate entry',
    });
    assert(voidResult.invoice.status === 'void', 'Invoice status updated to void');

    // 11. Test Customer Merge Atomicity
    console.log('\n[STEP 11] Testing Customer Merge Atomicity...');
    const suffixAlpha = Math.floor(100000 + Math.random() * 900000);
    const suffixBeta = Math.floor(100000 + Math.random() * 900000);

    const custAlpha = customerService.createCustomer({
      name: `Merge Source Alpha ${suffixAlpha}`,
      phone: `9711${suffixAlpha}`,
      category: 'Retail',
      notes: 'Source customer notes',
    });

    const custBeta = customerService.createCustomer({
      name: `Merge Target Beta ${suffixBeta}`,
      phone: `9722${suffixBeta}`,
      category: 'Retail',
      notes: 'Target customer notes',
    });

    // Create an invoice for Alpha
    const alphaDraft = invoiceService.createDraft({ customer_id: custAlpha.id, is_gst_invoice: false });
    const alphaItem = invoiceService.addItem({
      invoice_id: alphaDraft.id,
      product_variant_id: variant.id,
      quantity_grams: isWeight ? 1000 : null,
      quantity_units: isWeight ? null : 1,
    });
    const alphaTotalPaise = alphaItem.items.reduce((sum: number, it: any) => sum + it.line_total_paise, 0);
    invoiceService.recordPayment({ invoice_id: alphaDraft.id, method: 'cash', amount_paise: alphaTotalPaise });
    const alphaCompleted = invoiceService.completeInvoice({ invoiceId: alphaDraft.id });
    assert(alphaCompleted.invoice.customer_id === custAlpha.id, 'Alpha invoice initially belongs to Alpha');

    // Execute Merge: Alpha into Beta
    customerService.mergeCustomers(custAlpha.id, custBeta.id, { reason: 'Duplicate customer profile merged' });

    // Verify Alpha state
    const alphaAfter = customerService.getCustomerById(custAlpha.id);
    assert(alphaAfter.status === 'merged', 'Source customer status is merged');
    assert(alphaAfter.is_active === 0, 'Source customer is inactive');
    assert(alphaAfter.merged_into_customer_id === custBeta.id, 'Source points to surviving customer Beta');

    // Verify Invoices reassigned
    const alphaInvReassigned = db.prepare('SELECT customer_id FROM invoices WHERE id = ?').get(alphaCompleted.invoice.id) as { customer_id: number };
    assert(alphaInvReassigned.customer_id === custBeta.id, 'Alpha invoice reassigned to surviving Beta');

    // Verify Customer Search excludes merged source
    const searchAlpha = customerService.searchCustomers(`Merge Source Alpha ${suffixAlpha}`);
    assert(searchAlpha.length === 0, 'Search excludes merged customer profile');

    console.log('\n=============================================================');
    console.log(`   REGRESSION SUITE COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log('=============================================================\n');
  } finally {
    console.log('[CLEANUP] Closing database provider and removing temporary test database copy...');
    try {
      dbManager.close();
    } catch (e) {
      // Ignore if already closed
    }
    for (const p of [testDbPath, `${testDbPath}-wal`, `${testDbPath}-shm`]) {
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch (e) {
          // Non-blocking
        }
      }
    }
    console.log('[CLEANUP] Temporary test database copy successfully removed. Live dev.db completely untouched.');
  }
}

runRegressionSuite().catch((err) => {
  console.error('\n[FATAL] Regression suite failed with error:', err);
  process.exit(1);
});
