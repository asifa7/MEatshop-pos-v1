-- Migration 072: Live Chicken Yield Settings and Negative Stock Safeguards

-- 1. Create live_chicken_yield_settings table
CREATE TABLE IF NOT EXISTS live_chicken_yield_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    yield_enabled INTEGER NOT NULL DEFAULT 1 CHECK(yield_enabled IN (0, 1)),
    track_liver_gizzard INTEGER NOT NULL DEFAULT 1 CHECK(track_liver_gizzard IN (0, 1)),
    whole_chicken_grams INTEGER NOT NULL DEFAULT 625,
    liver_grams INTEGER NOT NULL DEFAULT 30,
    gizzard_grams INTEGER NOT NULL DEFAULT 40,
    custom_product_ratios_json TEXT DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial singleton row if not present
INSERT OR IGNORE INTO live_chicken_yield_settings (
    id, yield_enabled, track_liver_gizzard, whole_chicken_grams, liver_grams, gizzard_grams, custom_product_ratios_json
) VALUES (
    1, 1, 1, 625, 30, 40, '{}'
);

-- 2. Add negative_stock_policy to system_settings
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('negative_stock_policy', 'warn');

-- 3. Ensure live_pool_summary tracking is indexed
CREATE INDEX IF NOT EXISTS idx_live_batches_remaining 
ON live_chicken_batches(status, remaining_weight_grams, remaining_count);
