const Database = require('better-sqlite3');
const db = new Database('dev.db');
console.log('market_price_sources columns:', db.prepare('PRAGMA table_info(market_price_sources)').all().map(c => c.name));
console.log('market_price_fetch_logs columns:', db.prepare('PRAGMA table_info(market_price_fetch_logs)').all().map(c => c.name));
console.log('market_price_sources data:', db.prepare('SELECT * FROM market_price_sources').all());
db.close();
