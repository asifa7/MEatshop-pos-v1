const Database = require('better-sqlite3');
const db = new Database('dev.db');
console.log('daily_market_prices columns:', db.prepare('PRAGMA table_info(daily_market_prices)').all().map(c => c.name));
console.log('Tables matching market:', db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%market%'").all());
console.log('Catalogue product variants:', db.prepare('SELECT id, product_id, variant_name, current_rate_paise_per_unit FROM product_variants LIMIT 10').all());
db.close();
