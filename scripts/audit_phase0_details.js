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

console.log('\n--- 2. ALL BILLS FOR rahul AND Prime Meat Wholesalers Ltd ---');
const bills = db.prepare(`
  SELECT 
    pi.id,
    pi.supplier_id,
    s.name as supplier_name,
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
  JOIN suppliers s ON s.id = pi.supplier_id
  WHERE LOWER(s.name) LIKE '%rahul%' OR LOWER(s.company_name) LIKE '%rahul%'
     OR LOWER(s.name) LIKE '%prime meat%' OR LOWER(s.company_name) LIKE '%prime meat%'
  ORDER BY pi.supplier_id, pi.invoice_date ASC, pi.id ASC
`).all();

console.table(bills.map(b => ({
  id: b.id,
  supplier: b.supplier_name,
  bill_no: b.bill_no,
  date: b.invoice_date,
  total_paise: b.total_amount_paise,
  total_rs: (b.total_amount_paise / 100).toFixed(2),
  paid_paise: b.paid_amount_paise,
  paid_rs: (b.paid_amount_paise / 100).toFixed(2),
  bal_paise: b.outstanding_amount_paise,
  bal_rs: (b.outstanding_amount_paise / 100).toFixed(2),
  due_date: b.due_date,
  exp_date: b.expected_payment_date,
  status: b.payment_status
})));

console.log('\n--- 3. SUM OF BALANCES ---');
const sums = db.prepare(`
  SELECT 
    s.id as supplier_id,
    s.name as supplier_name,
    COUNT(pi.id) as bill_count,
    SUM(pi.total_amount_paise) as total_paise,
    SUM(pi.total_amount_paise) / 100.0 as total_rs,
    SUM(COALESCE(pi.paid_amount_paise, 0)) as paid_paise,
    SUM(COALESCE(pi.paid_amount_paise, 0)) / 100.0 as paid_rs,
    SUM(COALESCE(pi.outstanding_amount_paise, pi.total_amount_paise - COALESCE(pi.paid_amount_paise, 0))) as bal_paise,
    SUM(COALESCE(pi.outstanding_amount_paise, pi.total_amount_paise - COALESCE(pi.paid_amount_paise, 0))) / 100.0 as bal_rs
  FROM purchase_invoices pi
  JOIN suppliers s ON s.id = pi.supplier_id
  WHERE LOWER(s.name) LIKE '%rahul%' OR LOWER(s.company_name) LIKE '%rahul%'
     OR LOWER(s.name) LIKE '%prime meat%' OR LOWER(s.company_name) LIKE '%prime meat%'
  GROUP BY s.id
`).all();
console.table(sums);

console.log('\n--- 4. SUPPLIERS TABLE RECORDS ---');
const supps = db.prepare(`
  SELECT id, name, company_name, opening_balance_paise, outstanding_balance_paise,
         outstanding_balance_paise / 100.0 as outstanding_rs
  FROM suppliers
  WHERE LOWER(name) LIKE '%rahul%' OR LOWER(company_name) LIKE '%rahul%'
     OR LOWER(name) LIKE '%prime meat%' OR LOWER(company_name) LIKE '%prime meat%'
`).all();
console.table(supps);

process.exit(0);
