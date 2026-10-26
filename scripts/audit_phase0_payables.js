const { db } = require('../dist-electron/src/core/backend/db.js');

console.log('--- 1. TABLE SCHEMAS ---');
const tables = [
  'purchase_invoices',
  'payments_receipts',
  'payment_allocations',
  'supplier_payments',
  'supplier_payment_allocations',
  'supplier_ledger',
  'suppliers'
];

for (const t of tables) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t);
  console.log(`\n### ${t} ###`);
  console.log(row ? row.sql : 'NOT FOUND');
}

console.log('\n--- 2. BILLS FOR rahul AND Prime Meat Wholesalers Ltd ---');
const bills = db.prepare(`
  SELECT 
    pi.id,
    pi.supplier_id,
    COALESCE(s.name, s.company_name) as supplier_name,
    COALESCE(pi.supplier_invoice_number, pi.purchase_ref_number, pi.invoice_number) as bill_no,
    pi.invoice_date,
    pi.due_date,
    pi.expected_payment_date,
    pi.total_amount_paise,
    pi.paid_amount_paise,
    pi.outstanding_amount_paise,
    pi.payment_status,
    pi.status
  FROM purchase_invoices pi
  LEFT JOIN suppliers s ON s.id = pi.supplier_id
  WHERE LOWER(s.name) LIKE '%rahul%' OR LOWER(s.company_name) LIKE '%rahul%'
     OR LOWER(s.name) LIKE '%prime meat%' OR LOWER(s.company_name) LIKE '%prime meat%'
  ORDER BY pi.supplier_id, pi.invoice_date ASC, pi.id ASC
`).all();

console.log(JSON.stringify(bills, null, 2));

console.log('\n--- 3. SUM OF BALANCES PER SUPPLIER ---');
const sums = db.prepare(`
  SELECT 
    s.id as supplier_id,
    COALESCE(s.name, s.company_name) as supplier_name,
    COUNT(pi.id) as bill_count,
    SUM(pi.total_amount_paise) as sum_total_paise,
    SUM(COALESCE(pi.paid_amount_paise, 0)) as sum_paid_paise,
    SUM(COALESCE(pi.outstanding_amount_paise, pi.total_amount_paise - COALESCE(pi.paid_amount_paise, 0))) as sum_outstanding_paise
  FROM purchase_invoices pi
  LEFT JOIN suppliers s ON s.id = pi.supplier_id
  WHERE LOWER(s.name) LIKE '%rahul%' OR LOWER(s.company_name) LIKE '%rahul%'
     OR LOWER(s.name) LIKE '%prime meat%' OR LOWER(s.company_name) LIKE '%prime meat%'
  GROUP BY s.id
`).all();

console.log(JSON.stringify(sums, null, 2));

console.log('\n--- 4. SUPPLIERS TABLE BALANCES ---');
const suppRows = db.prepare(`
  SELECT id, name, company_name, opening_balance_paise, outstanding_balance_paise
  FROM suppliers
  WHERE LOWER(name) LIKE '%rahul%' OR LOWER(company_name) LIKE '%rahul%'
     OR LOWER(name) LIKE '%prime meat%' OR LOWER(company_name) LIKE '%prime meat%'
`).all();
console.log(JSON.stringify(suppRows, null, 2));

console.log('\n--- 5. PAYMENTS & ALLOCATIONS IN DB ---');
const prRows = db.prepare(`SELECT * FROM payments_receipts`).all();
console.log('payments_receipts count:', prRows.length);
console.log('payments_receipts:', prRows);

const paRows = db.prepare(`SELECT * FROM payment_allocations`).all();
console.log('payment_allocations count:', paRows.length);
console.log('payment_allocations:', paRows);

const spRows = db.prepare(`SELECT * FROM supplier_payments`).all();
console.log('supplier_payments count:', spRows.length);
console.log('supplier_payments:', spRows);

const spaRows = db.prepare(`SELECT * FROM supplier_payment_allocations`).all();
console.log('supplier_payment_allocations count:', spaRows.length);
console.log('supplier_payment_allocations:', spaRows);

process.exit(0);
