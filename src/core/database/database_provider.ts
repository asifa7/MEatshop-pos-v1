import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { IConfigService, configService } from '../config/config_service';
import { logger } from '../backend/logger';
import { DatabaseError } from '../backend/errors';

export interface IDatabaseProvider {
  getRawConnection(): Database.Database;
  transaction<T>(fn: () => T): T;
  close(): void;
  reopen(): Database.Database;
  onCloseOrReopen?(listener: () => void): () => void;
}

export class DatabaseProvider implements IDatabaseProvider {
  private dbInstance: Database.Database | null = null;
  private closeOrReopenListeners: Array<() => void> = [];

  constructor(private configServiceInstance: IConfigService = configService) {
    // Lazy initialization on first access to ensure Electron runtime paths and environment are ready
  }

  public onCloseOrReopen(listener: () => void): () => void {
    this.closeOrReopenListeners.push(listener);
    return () => {
      this.closeOrReopenListeners = this.closeOrReopenListeners.filter(l => l !== listener);
    };
  }

  private notifyCloseOrReopen(): void {
    for (const listener of this.closeOrReopenListeners) {
      try {
        listener();
      } catch (e) {
        logger.error('Error in onCloseOrReopen listener', e);
      }
    }
  }

  private initialize() {
    try {
      const config = this.configServiceInstance.get();
      const dbPath = process.env.TEST_DB_PATH || config.dbPath || path.join(process.cwd(), 'dev.db');
      const dbDir = path.dirname(dbPath);

      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        logger.info('Created database directory', { directory: dbDir });
      }

      logger.info('Connecting to SQLite Database', { path: dbPath });
      
      this.dbInstance = new Database(dbPath);

      this.dbInstance.pragma('journal_mode = WAL');
      this.dbInstance.pragma('synchronous = NORMAL');
      this.dbInstance.pragma('foreign_keys = ON');
      this.dbInstance.pragma('temp_store = MEMORY');
      this.dbInstance.pragma('cache_size = -2000');
      this.dbInstance.pragma('busy_timeout = 5000');

      logger.info('Database connection initialized successfully with optimized pragmas.');
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      logger.error(`Failed to initialize database connection: ${errMsg}`, err);
      throw new DatabaseError(`Failed to initialize database connection: ${errMsg}`, err);
    }
  }

  public getRawConnection(): Database.Database {
    if (!this.dbInstance || !this.dbInstance.open) {
      this.initialize();
    }
    return this.dbInstance!;
  }

  public transaction<T>(fn: () => T): T {
    const conn = this.getRawConnection();
    if (conn.inTransaction) {
      return fn();
    }
    try {
      return conn.transaction(fn)();
    } catch (err: any) {
      const detailMsg = err?.message ? `: ${err.message}` : '';
      logger.error('Transaction failed' + detailMsg, err);
      throw new DatabaseError(`Transaction failed${detailMsg}`, err);
    }
  }

  public getDbPath(): string {
    const config = this.configServiceInstance.get();
    return config.dbPath || path.join(process.cwd(), 'dev.db');
  }

  public reopen(): Database.Database {
    this.close();
    const conn = this.getRawConnection();
    this.notifyCloseOrReopen();
    return conn;
  }

  public close() {
    this.notifyCloseOrReopen();
    if (this.dbInstance) {
      try {
        try {
          this.dbInstance.pragma('wal_checkpoint(TRUNCATE)');
        } catch {}
        this.dbInstance.close();
        logger.info('Database connection closed.');
      } catch (err) {
        logger.error('Error closing database connection', err);
      } finally {
        this.dbInstance = null;
      }
    }
  }
}

export const databaseProvider = new DatabaseProvider();
