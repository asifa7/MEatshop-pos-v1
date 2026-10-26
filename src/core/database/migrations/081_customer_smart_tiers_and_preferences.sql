-- Migration 081: Customer Smart Tiers, VIP Criteria Settings & Time-of-Day Preferences
-- Scope:
-- 1. Add manual_tier and preferred_time_slot columns to customers table
-- 2. Create customer_tier_settings table for persistent, configurable VIP/Regular/Rare criteria

-- 1. Add columns to customers
ALTER TABLE customers ADD COLUMN manual_tier TEXT DEFAULT NULL;
ALTER TABLE customers ADD COLUMN preferred_time_slot TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_customers_manual_tier ON customers(manual_tier);
CREATE INDEX IF NOT EXISTS idx_customers_preferred_time_slot ON customers(preferred_time_slot);

-- 2. Customer tier criteria settings table
CREATE TABLE IF NOT EXISTS customer_tier_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  vip_min_spend_paise INTEGER NOT NULL DEFAULT 500000,
  vip_min_visits INTEGER NOT NULL DEFAULT 5,
  vip_criteria_mode TEXT NOT NULL DEFAULT 'either',
  regular_min_visits INTEGER NOT NULL DEFAULT 2,
  rare_inactive_days INTEGER NOT NULL DEFAULT 30,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default settings row
INSERT OR IGNORE INTO customer_tier_settings (id, vip_min_spend_paise, vip_min_visits, vip_criteria_mode, regular_min_visits, rare_inactive_days)
VALUES (1, 500000, 5, 'either', 2, 30);
