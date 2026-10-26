const Database = require('better-sqlite3');
const db = new Database('dev.db');

console.log('--- Database Verification Summary ---');
console.log('Total Migrations in migrations table:', db.prepare('SELECT count(*) as c FROM migrations').get().c);
console.log('Latest Migration:', db.prepare('SELECT id, name, applied_at FROM migrations ORDER BY id DESC LIMIT 1').get());
console.log('Statement Import Profiles:', db.prepare('SELECT id, profile_name, bank_name, is_default FROM statement_import_profiles').all());
console.log('Reconciliation Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'statement_%'").all().map(r => r.name));
console.log('Total Customers:', db.prepare('SELECT count(*) as c FROM customers').get().c);
console.log('Total Invoices:', db.prepare('SELECT count(*) as c FROM invoices').get().c);
console.log('Total Invoices Flagged as Test:', db.prepare('SELECT count(*) as c FROM invoices WHERE is_test = 1').get().c);
db.close();

