-- Migration 077: Customer Identity & Seed Data Sanitisation
-- Scope:
-- 1. Dedicated customer_sequences table for gapless, concurrency-safe customer code generation
-- 2. Normalised phone numbers on customers (phone_normalized) with index
-- 3. is_test and is_system flags on customers
-- 4. is_test flag on invoices
-- 5. Safe backfill for existing records without deleting any data

-- 1. Dedicated sequence table for customer codes
CREATE TABLE IF NOT EXISTS customer_sequences (
  sequence_key TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial customer code sequence from existing highest sequential CUST-XXXXX
INSERT OR IGNORE INTO customer_sequences (sequence_key, last_number)
SELECT 'CUSTOMER_CODE', COALESCE(
  (
    SELECT MAX(CAST(SUBSTR(customer_code, 6) AS INTEGER))
    FROM customers
    WHERE customer_code LIKE 'CUST-0%'
  ),
  0
);

-- 2. Add phone_normalized, is_test, and is_system columns to customers
ALTER TABLE customers ADD COLUMN phone_normalized TEXT;
ALTER TABLE customers ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN is_system INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_customers_phone_normalized ON customers(phone_normalized);
CREATE INDEX IF NOT EXISTS idx_customers_is_test ON customers(is_test);
CREATE INDEX IF NOT EXISTS idx_customers_is_system ON customers(is_system);

-- 3. Add is_test column to invoices
ALTER TABLE invoices ADD COLUMN is_test INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_invoices_is_test ON invoices(is_test);

-- 4. Backfill phone_normalized for existing records
UPDATE customers 
SET phone_normalized = (
  CASE 
    WHEN phone IS NULL OR TRIM(phone) = '' THEN NULL
    ELSE 
      -- Remove common non-digits (spaces, dashes, parens, +91)
      CASE 
        WHEN LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+91', ''), '(', ''), ')', ''))) = 11 
             AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+91', ''), '(', ''), ')', '')) LIKE '0%'
        THEN SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+91', ''), '(', ''), ')', '')), 2)
        WHEN LENGTH(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+91', ''), '(', ''), ')', ''))) = 12 
             AND TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+91', ''), '(', ''), ')', '')) LIKE '91%'
        THEN SUBSTR(TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+91', ''), '(', ''), ')', '')), 3)
        ELSE TRIM(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+91', ''), '(', ''), ')', ''))
      END
  END
);

-- 5. Flag specified seed/test customer records (without deleting them)
UPDATE customers SET is_test = 1 WHERE customer_code IN ('CUST-TEST-999', 'CUST-TST') OR id IN (4, 8);
UPDATE customers SET is_system = 1 WHERE customer_code = 'CUST-WALKIN' OR id = 5;

-- 6. Flag test invoices
UPDATE invoices SET is_test = 1 WHERE id IN (193, 194, 195);
