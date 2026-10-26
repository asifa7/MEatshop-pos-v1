const { db } = require('../dist-electron/src/core/backend/db.js');
const { migrationEngine } = require('../dist-electron/src/core/backend/migrations.js');

console.log('Running migration engine...');
migrationEngine.run();
console.log('Migration engine run completed.');

const lastMigration = db.prepare('SELECT name, applied_at FROM migrations ORDER BY id DESC LIMIT 5').all();
console.log('Latest migrations in DB:', lastMigration);

const stockMovementsCount = db.prepare('SELECT COUNT(*) as count FROM stock_movements').get();
console.log('stock_movements row count:', stockMovementsCount);

const productModes = db.prepare('SELECT stock_mode, COUNT(*) as count FROM products GROUP BY stock_mode').all();
console.log('Product stock modes count:', productModes);

const quaisEgg = db.prepare("SELECT id, product_code, name, is_processed_cut, stock_mode, is_inventory_tracked FROM products WHERE product_code = '25'").get();
console.log('Quais egg in products:', quaisEgg);

process.exit(0);
