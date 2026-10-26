-- 080_bank_statement_reconciliation.sql
-- Phase 3B: Shift-End Bank Statement Matching & UPI/Card Reconciliation

-- 1. Preset column mapping profiles for banks / UPI aggregators
CREATE TABLE IF NOT EXISTS statement_import_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_name TEXT NOT NULL UNIQUE,
  bank_name TEXT NOT NULL,
  date_col TEXT NOT NULL,
  credit_col TEXT NOT NULL,
  debit_col TEXT,
  ref_col TEXT NOT NULL,
  narration_col TEXT,
  payer_vpa_col TEXT,
  payer_name_col TEXT,
  date_format TEXT NOT NULL DEFAULT 'auto',
  amount_in_paise INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Statement file imports (tracked by sha256 file hash for idempotency)
CREATE TABLE IF NOT EXISTS statement_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  profile_id INTEGER REFERENCES statement_import_profiles(id) ON DELETE SET NULL,
  shift_date TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  total_credit_paise INTEGER NOT NULL DEFAULT 0,
  total_debit_paise INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Individual transactions parsed from the statement
CREATE TABLE IF NOT EXISTS statement_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES statement_imports(id) ON DELETE CASCADE,
  row_fingerprint TEXT NOT NULL UNIQUE,
  txn_time TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'credit',
  ref_no TEXT,
  narration TEXT,
  payer_vpa TEXT,
  payer_name TEXT,
  status TEXT NOT NULL DEFAULT 'unmatched',
  match_rule TEXT,
  matched_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  matched_payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  matched_at TEXT,
  matched_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stmt_txns_time ON statement_transactions(txn_time);
CREATE INDEX IF NOT EXISTS idx_stmt_txns_ref ON statement_transactions(ref_no);
CREATE INDEX IF NOT EXISTS idx_stmt_txns_status ON statement_transactions(status);
CREATE INDEX IF NOT EXISTS idx_stmt_txns_invoice ON statement_transactions(matched_invoice_id);

-- 4. Audit trail of manual matching actions, overrides, and 'not a sale' marks
CREATE TABLE IF NOT EXISTS statement_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER REFERENCES statement_transactions(id) ON DELETE CASCADE,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Pre-seed default statement import profiles
INSERT OR IGNORE INTO statement_import_profiles (id, profile_name, bank_name, date_col, credit_col, debit_col, ref_col, narration_col, payer_vpa_col, payer_name_col, is_default)
VALUES 
  (1, 'PhonePe Merchant CSV', 'PhonePe', 'Transaction Date', 'Amount', 'Debit', 'UTR / Transaction ID', 'Description', 'Payer VPA', 'Payer Name', 1),
  (2, 'Paytm Business CSV', 'Paytm', 'Date & Time', 'Amount', 'Debit', 'Bank Reference No.', 'Narration', 'Customer VPA', 'Customer Name', 0),
  (3, 'Google Pay Business CSV', 'Google Pay', 'Time', 'Amount (INR)', 'Debit', 'UPI Transaction ID', 'Description', 'Payer VPA', 'Payer Name', 0),
  (4, 'Standard Bank Statement (HDFC/ICICI/SBI)', 'Generic Bank', 'Txn Date', 'Credit', 'Debit', 'Ref No./Cheque No.', 'Narration', 'VPA', 'Payer Name', 0);
