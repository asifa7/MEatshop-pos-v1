const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '../dev.db');
const db = new Database(dbPath);

console.log('================================================================');
console.log('PHASE 0 AUDIT SCRIPT - EXECUTING LIVE DATABASE QUERIES');
console.log('DB Path:', dbPath);
console.log('================================================================\n');

// 1. Check schemas of all relevant tables
const targetTables = [
  'products',
  'product_variants',
  'stock_ledger',
  'inventory_ledger',
  'stock_transactions',
  'stock_adjustments',
  'stock_batches',
  'batch_depletions',
  'pending_stock_events',
  'invoices',
  'invoice_items',
  'purchases',
  'purchase_invoices',
  'purchase_invoice_items',
  'purchase_orders',
  'purchase_order_items',
  'supplier_ledger',
  'supplier_payments',
  'payments_receipts',
  'suppliers',
  'live_animal_yield_configs',
  'live_animal_yield_ratios',
  'live_animal_processing_batches'
];

console.log('=== 1. TABLE SCHEMAS ===');
for (const tbl of targetTables) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(tbl);
  if (row) {
    console.log(`\n--- TABLE: ${tbl} ---`);
    console.log(row.sql);
  } else {
    console.log(`\n--- TABLE: ${tbl} (DOES NOT EXIST) ---`);
  }
}

// 2. Active products with columns tracked, linked-to, category
console.log('\n\n=== 2. ACTIVE PRODUCTS (Tracked, Linked-To, Category) ===');
const activeProducts = db.prepare(`
  SELECT 
    p.id as product_id,
    p.name as product_name,
    p.product_code,
    p.category,
    p.unit_type as product_unit_type,
    p.is_inventory_tracked,
    pv.id as variant_id,
    pv.variant_name,
    pv.parent_variant_id,
    pv.unit_type as variant_unit_type,
    pv.is_processed_cut,
    pv.track_in_inventory
  FROM products p
  JOIN product_variants pv ON pv.product_id = p.id
  WHERE p.is_active = 1 AND pv.is_active = 1
  ORDER BY p.id ASC, pv.id ASC
`).all();
console.table(activeProducts);

// 3. Products NOT tracked and have no link
console.log('\n\n=== 3. PRODUCTS NOT TRACKED AND HAVE NO LINK ===');
const untrackedUnlinked = db.prepare(`
  SELECT 
    p.id as product_id,
    p.name as product_name,
    p.product_code,
    p.category,
    p.is_inventory_tracked,
    pv.id as variant_id,
    pv.variant_name,
    pv.parent_variant_id,
    pv.track_in_inventory,
    pv.is_processed_cut
  FROM products p
  JOIN product_variants pv ON pv.product_id = p.id
  WHERE p.is_active = 1 AND pv.is_active = 1
    AND (COALESCE(p.is_inventory_tracked, 1) = 0 OR COALESCE(pv.track_in_inventory, 1) = 0)
    AND pv.parent_variant_id IS NULL
`).all();
console.table(untrackedUnlinked);

// 4. Rows in pending_stock_events
console.log('\n\n=== 4. ROWS IN pending_stock_events ===');
const pendingEvents = db.prepare(`SELECT * FROM pending_stock_events`).all();
console.log(`Count: ${pendingEvents.length}`);
console.table(pendingEvents);

// 5. Inspect QUAIS EGG (code 25), EGG, and FREE EGG
console.log('\n\n=== 5. INVESTIGATION OF QUAIS EGG vs EGG vs FREE EGG ===');
const eggItems = db.prepare(`
  SELECT 
    p.id as product_id,
    p.name as product_name,
    p.product_code,
    p.category,
    p.unit_type as product_unit_type,
    p.is_inventory_tracked,
    pv.id as variant_id,
    pv.variant_name,
    pv.parent_variant_id,
    pv.is_processed_cut,
    pv.track_in_inventory,
    sl.quantity_grams,
    sl.quantity_units,
    sl.quantity_count,
    sl.safety_threshold_grams,
    sl.safety_threshold_units
  FROM products p
  JOIN product_variants pv ON pv.product_id = p.id
  LEFT JOIN stock_ledger sl ON sl.product_variant_id = pv.id
  WHERE p.name LIKE '%EGG%' OR p.product_code = '25' OR pv.product_code = '25'
`).all();
console.table(eggItems);

// Test PurchasingSuggestionsPanel logic on eggItems
console.log('\nTesting PurchasingSuggestionsPanel criteria on egg items:');
for (const s of eggItems) {
  const isMutton =
    (s.product_name || '').toLowerCase().includes('mutton') ||
    (s.category || '').toLowerCase().includes('mutton');

  const step1_tracked = !(s.track_in_inventory === 0 || s.is_inventory_tracked === 0);
  const step2_processedCut = !(s.is_processed_cut === 1 && !isMutton);
  
  const isWeight = s.product_unit_type === 'weight' || s.product_unit_type === 'live_dual';
  const currentRaw = isWeight ? ((s.quantity_grams ?? 0) / 1000) : (s.quantity_units ?? 0);
  const defaultThreshold = isWeight ? 5 : 10;
  const thresholdRaw = isWeight
    ? ((s.safety_threshold_grams && s.safety_threshold_grams > 0 ? s.safety_threshold_grams : defaultThreshold * 1000) / 1000)
    : (s.safety_threshold_units && s.safety_threshold_units > 0 ? s.safety_threshold_units : defaultThreshold);
  const step3_belowThreshold = currentRaw <= thresholdRaw || currentRaw <= 0;

  console.log(`Product: "${s.product_name}" (Code ${s.product_code}):`, {
    is_processed_cut: s.is_processed_cut,
    track_in_inventory: s.track_in_inventory,
    is_inventory_tracked: s.is_inventory_tracked,
    passes_tracked_check: step1_tracked,
    passes_processed_cut_check: step2_processedCut,
    current_qty: currentRaw,
    threshold: thresholdRaw,
    passes_threshold_check: step3_belowThreshold,
    INCLUDED_IN_REMINDER: step1_tracked && step2_processedCut && step3_belowThreshold
  });
}

// 6. Float quantities investigation
console.log('\n\n=== 6. FLOAT QUANTITIES INVESTIGATION (127.58999999999999 pcs, -0.0 trays) ===');
const floatRowsStockLedger = db.prepare(`
  SELECT id, product_variant_id, quantity_grams, quantity_units, quantity_count 
  FROM stock_ledger 
  WHERE (quantity_units != ROUND(quantity_units) AND quantity_units IS NOT NULL)
     OR (quantity_grams != ROUND(quantity_grams) AND quantity_grams IS NOT NULL)
     OR (quantity_count != ROUND(quantity_count) AND quantity_count IS NOT NULL)
`).all();
console.log('Float rows in stock_ledger:', floatRowsStockLedger);

const sampleStockLedger = db.prepare(`
  SELECT sl.*, p.name, p.unit_type, p.category 
  FROM stock_ledger sl 
  JOIN product_variants pv ON sl.product_variant_id = pv.id
  JOIN products p ON pv.product_id = p.id
  LIMIT 20
`).all();
console.table(sampleStockLedger);

// Check inventory_ledger for non-integer entries
const floatInvLedger = db.prepare(`
  SELECT id, product_variant_id, action_type, quantity_grams, quantity_units 
  FROM inventory_ledger 
  WHERE (quantity_units != ROUND(quantity_units) AND quantity_units IS NOT NULL)
     OR (quantity_grams != ROUND(quantity_grams) AND quantity_grams IS NOT NULL)
  LIMIT 20
`).all();
console.log('Float entries in inventory_ledger:', floatInvLedger);

// 7. Purchases vs Payments Outstanding (Rs 76,170 vs Rs 0)
console.log('\n\n=== 7. PURCHASES OUTSTANDING (Rs 76,170) vs PAYMENTS (Rs 0) ===');
const purchasesTableRows = db.prepare(`SELECT count(*) as count FROM purchases`).get();
console.log('Count in legacy purchases table:', purchasesTableRows);

const purchaseInvoicesRows = db.prepare(`
  SELECT 
    pi.id,
    pi.invoice_number,
    pi.supplier_invoice_number,
    pi.supplier_id,
    s.name as supplier_name,
    s.company_name,
    pi.total_amount_paise,
    pi.paid_amount_paise,
    pi.outstanding_amount_paise,
    pi.payment_status,
    pi.status
  FROM purchase_invoices pi
  LEFT JOIN suppliers s ON pi.supplier_id = s.id
`).all();
console.log('purchase_invoices rows:');
console.table(purchaseInvoicesRows);

const sumPurchasesOutstanding = db.prepare(`
  SELECT 
    SUM(total_amount_paise) as sum_total,
    SUM(paid_amount_paise) as sum_paid,
    SUM(outstanding_amount_paise) as sum_outstanding
  FROM purchase_invoices
`).get();
console.log('Sum in purchase_invoices:', sumPurchasesOutstanding);

// Check supplier ledger & payments tables
console.log('\nSupplier ledger summary:');
try {
  const suppLedger = db.prepare(`SELECT count(*) as count FROM supplier_ledger`).get();
  console.log('supplier_ledger count:', suppLedger);
  const sampleSuppLedger = db.prepare(`SELECT * FROM supplier_ledger LIMIT 5`).all();
  console.table(sampleSuppLedger);
} catch (e) {
  console.log('supplier_ledger error:', e.message);
}

console.log('\nSupplier payments / payments_receipts:');
try {
  const pmtReceipts = db.prepare(`SELECT count(*) as count FROM payments_receipts`).get();
  console.log('payments_receipts count:', pmtReceipts);
} catch (e) {
  console.log('payments_receipts error:', e.message);
}

try {
  const suppPmts = db.prepare(`SELECT count(*) as count FROM supplier_payments`).get();
  console.log('supplier_payments count:', suppPmts);
} catch (e) {
  console.log('supplier_payments error:', e.message);
}

console.log('\n================================================================');
console.log('PHASE 0 AUDIT COMPLETE');
console.log('================================================================');
