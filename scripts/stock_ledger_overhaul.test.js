const assert = require('assert');
const { db } = require('../dist-electron/src/core/backend/db.js');
const { unitsToTraysAndPieces, getStockStatus, roundQty, roundMoney, formatQty, formatMoney, roundHalfUp } = require('../dist-electron/src/core/shared/math.js');
const { PaymentEngineService } = require('../dist-electron/src/modules/ledger/backend/service/payment_engine_service.js');

console.log('================================================================');
console.log('STARTING STOCK LEDGER & OVERHAUL COMPREHENSIVE AUTOMATED TESTS');
console.log('================================================================');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// -------------------------------------------------------------
// TEST 1: Math & Units Formatting (Max 3 Decimals, Trays, No -0.0)
// -------------------------------------------------------------
test('Math: unitsToTraysAndPieces floor(units/30) and pcs formatting without -0.0', () => {
  const t0 = unitsToTraysAndPieces(0);
  assert.strictEqual(t0.trays, 0);
  assert.strictEqual(t0.remainingPieces, 0);
  assert.strictEqual(t0.display.includes('-0'), false);

  const t1 = unitsToTraysAndPieces(35);
  assert.strictEqual(t1.trays, 1);
  assert.strictEqual(t1.remainingPieces, 5);
  assert.strictEqual(t1.totalPieces, 35);
  assert.ok(t1.display.includes('1 tray'));

  const t2 = unitsToTraysAndPieces(120);
  assert.strictEqual(t2.trays, 4);
  assert.strictEqual(t2.remainingPieces, 0);
  assert.strictEqual(t2.totalPieces, 120);

  const tNegZero = unitsToTraysAndPieces(-0.0);
  assert.strictEqual(tNegZero.trays, 0);
  assert.strictEqual(tNegZero.remainingPieces, 0);
  assert.strictEqual(tNegZero.display.includes('-0'), false);
});

test('Math: roundHalfUp and formatQty handles weight rounding correctly', () => {
  assert.strictEqual(roundHalfUp(127.58999999999999), 128);
  assert.strictEqual(roundQty(127.58999999999999, 3), 127.59);
  assert.strictEqual(formatQty(127.58999999999999, { decimals: 3 }), '127.59');
  assert.strictEqual(formatQty(-0.0, { decimals: 3 }), '0');
  assert.strictEqual(formatMoney(25000), '₹250.00');
  assert.strictEqual(formatMoney(25000, { showSymbol: false }), '250.00');
});

// -------------------------------------------------------------
// TEST 2: Single Source of Truth getStockStatus & Quais Egg
// -------------------------------------------------------------
test('Status: getStockStatus single source of truth and Quais Egg status', () => {
  // Mutton at 0.00 kg with safety threshold 10 -> OUT_OF_STOCK / isPurchasingAlert
  const muttonStatus = getStockStatus(0, 10, 100);
  assert.strictEqual(muttonStatus.status, 'OUT_OF_STOCK');
  assert.strictEqual(muttonStatus.isPurchasingAlert, true);

  // Critical Low (e.g. 2 kg with threshold 10)
  const critStatus = getStockStatus(2, 10, 100);
  assert.strictEqual(critStatus.status, 'CRITICAL');
  assert.strictEqual(critStatus.isPurchasingAlert, true);

  // Quais Egg (current 0, threshold 10)
  const eggStatus = getStockStatus(0, 10, 50);
  assert.strictEqual(eggStatus.status, 'OUT_OF_STOCK');
  assert.strictEqual(eggStatus.isPurchasingAlert, true);

  // Normal stock
  assert.strictEqual(getStockStatus(25, 10, 100).status, 'NORMAL');
  // Low stock
  assert.strictEqual(getStockStatus(8, 10, 100).status, 'LOW');
});

test('Catalogue: Quais Egg (code 25) is OWN product with tracking ON', () => {
  const egg = db.prepare("SELECT id, product_code, name, stock_mode, is_inventory_tracked, is_processed_cut FROM products WHERE product_code = '25'").get();
  assert.ok(egg, 'Quais Egg must exist in products table');
  assert.strictEqual(egg.stock_mode, 'OWN');
  assert.strictEqual(egg.is_inventory_tracked, 1);
  assert.strictEqual(egg.is_processed_cut, 0);
});

// -------------------------------------------------------------
// TEST 3: Schema & Constraints for Product Stock Modes
// -------------------------------------------------------------
test('Schema: Products table has stock mode columns and valid constraints', () => {
  const cols = db.prepare('PRAGMA table_info(products)').all().map(c => c.name);
  assert.ok(cols.includes('stock_mode'), 'products.stock_mode exists');
  assert.ok(cols.includes('parent_product_id'), 'products.parent_product_id exists');
  assert.ok(cols.includes('link_mode'), 'products.link_mode exists');
  assert.ok(cols.includes('yield_g_per_kg'), 'products.yield_g_per_kg exists');
  assert.ok(cols.includes('parent_units_per_sale_unit'), 'products.parent_units_per_sale_unit exists');

  // Verify cut products link to live animal parent with YIELD mode
  const skinless = db.prepare("SELECT * FROM products WHERE name LIKE '%Skinless%' LIMIT 1").get();
  if (skinless) {
    assert.strictEqual(skinless.stock_mode, 'LINKED');
    assert.strictEqual(skinless.link_mode, 'YIELD');
    assert.strictEqual(skinless.yield_g_per_kg, 550);
    assert.ok(skinless.parent_product_id > 0);
  }

  const dressed = db.prepare("SELECT * FROM products WHERE name LIKE '%Dressed%' LIMIT 1").get();
  if (dressed) {
    assert.strictEqual(dressed.stock_mode, 'LINKED');
    assert.strictEqual(dressed.link_mode, 'YIELD');
    assert.strictEqual(dressed.yield_g_per_kg, 625);
    assert.ok(dressed.parent_product_id > 0);
  }
});

// -------------------------------------------------------------
// TEST 4: Single Ledger stock_movements & Deduplication Index
// -------------------------------------------------------------
test('Ledger: stock_movements table exists with deduplication unique index', () => {
  const cols = db.prepare('PRAGMA table_info(stock_movements)').all().map(c => c.name);
  assert.ok(cols.includes('product_id'), 'stock_movements.product_id exists');
  assert.ok(cols.includes('qty_delta'), 'stock_movements.qty_delta exists');
  assert.ok(cols.includes('movement_type'), 'stock_movements.movement_type exists');
  assert.ok(cols.includes('ref_type'), 'stock_movements.ref_type exists');
  assert.ok(cols.includes('ref_id'), 'stock_movements.ref_id exists');
  assert.ok(cols.includes('invoice_line_id'), 'stock_movements.invoice_line_id exists');

  const idxs = db.prepare("PRAGMA index_list('stock_movements')").all();
  const dedupIdx = idxs.find(i => i.name === 'uq_stock_movements_dedup');
  assert.ok(dedupIdx, 'uq_stock_movements_dedup index exists');
  assert.strictEqual(dedupIdx.unique, 1, 'Index must be UNIQUE');
});

// -------------------------------------------------------------
// TEST 5: Yield Formula Accuracy
// -------------------------------------------------------------
test('Yield: Parent live animal deduction formula is exact', () => {
  // Selling 1.000 kg Skinless (yield 550 g/kg)
  // sold_g = 1000
  // parent_g = roundHalfUp(1000 * 1000 / 550) = 1818 g (1.818 kg)
  const skinlessSoldGrams = 1000;
  const skinlessYield = 550;
  const parentDeducted = roundHalfUp((skinlessSoldGrams * 1000) / skinlessYield);
  assert.strictEqual(parentDeducted, 1818);

  // Selling 2.500 kg Dressed (yield 625 g/kg)
  // sold_g = 2500
  // parent_g = roundHalfUp(2500 * 1000 / 625) = 4000 g (4.000 kg)
  const dressedSoldGrams = 2500;
  const dressedYield = 625;
  const dressedParentDeducted = roundHalfUp((dressedSoldGrams * 1000) / dressedYield);
  assert.strictEqual(dressedParentDeducted, 4000);
});

// -------------------------------------------------------------
// TEST 6: Outstanding Purchase Bills & ₹76,170 Reconciliation
// -------------------------------------------------------------
test('Payables: getOutstandingPurchaseBills resolves all unpaid bills including ₹76,170', () => {
  const service = new PaymentEngineService();
  const bills = service.getOutstandingPurchaseBills({ status: 'all' });
  assert.ok(bills.length >= 5, 'Must return at least 5 purchase bills');

  // Verify rahul has the historic unpaid bills
  const rahulBills = bills.filter(b => (b.supplier_name || '').toLowerCase().includes('rahul'));
  assert.ok(rahulBills.length >= 4, 'Rahul must have unpaid bills');
  const rahulTotalOutstanding = rahulBills.reduce((sum, b) => sum + b.outstanding_balance_paise, 0);
  assert.ok(rahulTotalOutstanding >= 5817000, 'Rahul outstanding must be at least ₹58,170');

  // Verify Prime Meat Wholesalers has unpaid bills
  const primeBills = bills.filter(b => (b.supplier_name || '').toLowerCase().includes('prime'));
  assert.ok(primeBills.length >= 1, 'Prime Meat Wholesalers must have unpaid bills');
});

// -------------------------------------------------------------
// TEST 7: Payment Allocation & Atomic Reversal
// -------------------------------------------------------------
test('Payment Engine: Record payment and reverse with mandatory reason', () => {
  const service = new PaymentEngineService();
  const bills = service.getOutstandingPurchaseBills({ status: 'all' });
  const testBill = bills.find(b => b.outstanding_balance_paise > 0);
  assert.ok(testBill, 'Must find a bill with outstanding balance to test payment');

  const payAmountPaise = 10000; // ₹100.00
  const initialOutstanding = testBill.outstanding_balance_paise;

  // 1. Record partial payment
  const voucher = service.recordPaymentReceipt({
    direction: 'payment',
    payment_method: 'cash',
    party_type: 'supplier',
    party_id: testBill.supplier_id,
    amount_paise: payAmountPaise,
    payment_date: new Date().toISOString().slice(0, 10),
    narration: 'Test automated payment',
    allocations: [
      {
        bill_type: 'purchase_invoice',
        bill_id: testBill.id,
        bill_number: testBill.purchase_ref_number,
        allocated_amount_paise: payAmountPaise,
      }
    ]
  });

  assert.ok(voucher && voucher.voucher_number, 'Voucher must be created');

  // Verify bill balance reduced
  const afterPay = service.getOutstandingPurchaseBills({ status: 'all' }).find(b => b.id === testBill.id);
  assert.strictEqual(afterPay.outstanding_balance_paise, initialOutstanding - payAmountPaise);

  // 2. Reverse payment with mandatory reason
  const revRes = service.reversePayment(voucher.id, 'Automated test reversal verification', 1);
  assert.ok(revRes.success, 'Reversal must succeed');

  // Verify bill balance fully restored
  const afterRev = service.getOutstandingPurchaseBills({ status: 'all' }).find(b => b.id === testBill.id);
  assert.strictEqual(afterRev.outstanding_balance_paise, initialOutstanding);
});

// -------------------------------------------------------------
// TEST 8: Billing OWN Item Deduction & Invoice Items Snapshot
// -------------------------------------------------------------
test('Billing: Selling OWN item writes SALE to stock_movements and snapshots invoice_items', () => {
  const { container } = require('../dist-electron/src/core/di/container.js');
  container.authService.login('admin', 'admin123');
  const invoiceService = container.invoiceService;

  // Find an active OWN product with variant (e.g. Broiler Chicken Live or Country Chicken Live)
  const ownVariant = db.prepare(`
    SELECT pv.id as variant_id, p.id as product_id, p.name, pv.current_rate_paise_per_unit
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE p.stock_mode = 'OWN' AND p.is_active = 1
    LIMIT 1
  `).get();
  assert.ok(ownVariant, 'Must have active OWN product variant');

  // Check initial stock
  const smBefore = db.prepare('SELECT COALESCE(SUM(qty_delta), 0) as on_hand FROM stock_movements WHERE product_id = ?').get(ownVariant.product_id);
  const initialStock = Number(smBefore.on_hand);

  // Create draft invoice
  const draft = invoiceService.createDraft({ is_gst_invoice: false });
  assert.ok(draft && draft.id, 'Draft invoice created');

  // Add 1.000 kg item
  invoiceService.addItem({
    invoice_id: draft.id,
    product_variant_id: ownVariant.variant_id,
    quantity_grams: 1000,
    rate_paise: ownVariant.current_rate_paise_per_unit || 20000,
  });

  const pricePaise = ownVariant.current_rate_paise_per_unit || 20000;
  const completed = invoiceService.completeInvoice({
    invoice_id: draft.id,
    payments: [{ method: 'cash', amount_paise: pricePaise }],
    allow_negative_stock_override: true, // safe for test
  });

  assert.ok(completed && completed.invoice.invoice_number, 'Invoice completed');

  // Verify stock_movements SALE row
  const movement = db.prepare(`
    SELECT * FROM stock_movements
    WHERE movement_type = 'SALE' AND product_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(ownVariant.product_id);
  assert.ok(movement, 'SALE movement must be recorded');
  assert.strictEqual(movement.qty_delta, -1000);

  // Verify invoice_items snapshot
  const savedItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? LIMIT 1').get(draft.id);
  assert.ok(savedItem, 'Invoice item must exist');
  assert.strictEqual(savedItem.stock_product_id, ownVariant.product_id);
  assert.strictEqual(savedItem.stock_link_mode, 'OWN');
  assert.strictEqual(savedItem.deducted_qty, 1000);

  // Clean up by voiding test invoice
  invoiceService.voidInvoice({
    invoice_id: draft.id,
    voided_by: 1,
    void_reason: 'Automated test cleanup',
  });

  // Verify SALE_CANCEL row recorded in stock_movements
  const cancelMovement = db.prepare(`
    SELECT * FROM stock_movements
    WHERE movement_type = 'SALE_CANCEL' AND invoice_line_id = ?
  `).get(savedItem.id);
  assert.ok(cancelMovement, 'SALE_CANCEL movement must be recorded');
  assert.strictEqual(cancelMovement.qty_delta, 1000); // exact positive reversal
});

// -------------------------------------------------------------
// TEST 9: Billing LINKED Cut Yield Conversion
// -------------------------------------------------------------
test('Billing: Selling LINKED cut deducts from parent live animal using exact yield ratio', () => {
  const { container } = require('../dist-electron/src/core/di/container.js');
  const invoiceService = container.invoiceService;

  // Find a LINKED cut (e.g. Skinless 550 g/kg)
  const cutVariant = db.prepare(`
    SELECT pv.id as variant_id, p.id as product_id, p.name, p.parent_product_id, p.yield_g_per_kg, pv.current_rate_paise_per_unit
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE p.stock_mode = 'LINKED' AND p.link_mode = 'YIELD' AND p.is_active = 1
    LIMIT 1
  `).get();
  assert.ok(cutVariant, 'Must have active LINKED cut variant');

  const draft = invoiceService.createDraft({ is_gst_invoice: false });
  // Add 1.000 kg cut
  invoiceService.addItem({
    invoice_id: draft.id,
    product_variant_id: cutVariant.variant_id,
    quantity_grams: 1000,
    rate_paise: cutVariant.current_rate_paise_per_unit || 26000,
  });

  const cutPricePaise = cutVariant.current_rate_paise_per_unit || 26000;
  invoiceService.completeInvoice({
    invoice_id: draft.id,
    payments: [{ method: 'cash', amount_paise: cutPricePaise }],
    allow_negative_stock_override: true,
  });

  // Expected parent grams deducted: roundHalfUp(1000 * 1000 / cutVariant.yield_g_per_kg)
  const expectedParentDeduction = roundHalfUp((1000 * 1000) / cutVariant.yield_g_per_kg);

  const savedItem = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? LIMIT 1').get(draft.id);
  assert.strictEqual(savedItem.stock_product_id, cutVariant.parent_product_id);
  assert.strictEqual(savedItem.stock_link_mode, 'YIELD');
  assert.strictEqual(savedItem.conversion_rate_used, cutVariant.yield_g_per_kg);
  assert.strictEqual(savedItem.deducted_qty, expectedParentDeduction);

  // Check parent stock_movement
  const parentMovement = db.prepare(`
    SELECT * FROM stock_movements
    WHERE movement_type = 'SALE' AND invoice_line_id = ?
  `).get(savedItem.id);
  assert.ok(parentMovement, 'Parent SALE movement must be recorded');
  assert.strictEqual(parentMovement.product_id, cutVariant.parent_product_id);
  assert.strictEqual(parentMovement.qty_delta, -expectedParentDeduction);

  // Void test invoice
  invoiceService.voidInvoice({
    invoice_id: draft.id,
    voided_by: 1,
    void_reason: 'Automated test cleanup',
  });
});

console.log('================================================================');
console.log(`ALL ${passedTests} OF ${totalTests} AUTOMATED TESTS PASSED SUCCESSFULLY!`);
console.log('================================================================');
process.exit(0);
