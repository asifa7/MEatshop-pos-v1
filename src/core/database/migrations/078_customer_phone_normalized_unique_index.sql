-- Migration 078: Unique partial index on phone_normalized
-- Ensures database-level uniqueness for active customer phone numbers.
-- Excludes NULL, empty string, merged customers, and test records.
-- Replaces old un-scoped unique index on raw phone.

DROP INDEX IF EXISTS idx_customers_phone_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_phone_normalized_unique 
ON customers(phone_normalized) 
WHERE phone_normalized IS NOT NULL 
  AND phone_normalized != ''
  AND (status != 'merged' OR status IS NULL) 
  AND (is_test = 0 OR is_test IS NULL);
