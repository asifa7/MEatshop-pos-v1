const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(process.cwd(), 'dev.db');
const backupDir = path.join(process.cwd(), 'db_backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

// 1. Copy dev.db
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const dbBackupPath = path.join(backupDir, `dev_pre_migration_083_${timestamp}.db`);
fs.copyFileSync(dbPath, dbBackupPath);
console.log('dev.db backed up to:', dbBackupPath);

// 2. Dump schema
const db = new Database(dbPath);
const tables = db.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name").all();
const schemaSql = tables.map(t => t.sql + ';\n').join('\n');
const schemaBackupPath = path.join(backupDir, `schema_backup_${timestamp}.sql`);
fs.writeFileSync(schemaBackupPath, schemaSql, 'utf8');
console.log('Schema dumped to:', schemaBackupPath);
db.close();
process.exit(0);
