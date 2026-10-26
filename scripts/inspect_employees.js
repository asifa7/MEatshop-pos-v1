const Database = require('better-sqlite3');
const db = new Database('dev.db');
console.log('Employees columns:', db.prepare('PRAGMA table_info(employees)').all().map(c => c.name));
console.log('Employees data:', db.prepare('SELECT * FROM employees LIMIT 5').all());
console.log('Expense categories:', db.prepare('SELECT * FROM expense_categories').all());
db.close();
