-- Migration 071: Purchase Invoice Extended Fields
-- Adds expected_payment_date and paid_amount_paise to purchase_invoices

ALTER TABLE purchase_invoices ADD COLUMN expected_payment_date TEXT;
ALTER TABLE purchase_invoices ADD COLUMN paid_amount_paise INTEGER DEFAULT 0;
