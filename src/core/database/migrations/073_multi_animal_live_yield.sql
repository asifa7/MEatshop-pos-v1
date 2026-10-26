-- Migration 073: Multi-Animal Live Yield & Direct Auto-Deduction Engine

-- 1. Add animal_type and remaining_count_milli to live_chicken_batches
ALTER TABLE live_chicken_batches ADD COLUMN animal_type TEXT NOT NULL DEFAULT 'chicken';
ALTER TABLE live_chicken_batches ADD COLUMN remaining_count_milli INTEGER;

CREATE INDEX IF NOT EXISTS idx_live_batches_animal_status 
ON live_chicken_batches(animal_type, status, remaining_weight_grams);

-- 2. Create live_animal_yield_configs table
CREATE TABLE IF NOT EXISTS live_animal_yield_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_key TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    live_tracking_enabled INTEGER NOT NULL DEFAULT 0 CHECK(live_tracking_enabled IN (0, 1)),
    track_byproducts INTEGER NOT NULL DEFAULT 1 CHECK(track_byproducts IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    live_variant_id INTEGER REFERENCES product_variants(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial configs
INSERT OR IGNORE INTO live_animal_yield_configs (animal_key, display_name, live_tracking_enabled, track_byproducts, is_active, live_variant_id)
VALUES 
  ('chicken', 'Broiler Chicken', 1, 1, 1, 47),
  ('country_chicken', 'Country Chicken', 0, 1, 1, 35),
  ('mutton', 'Mutton (Goat/Sheep)', 0, 1, 1, 38),
  ('quils', 'Quils (Quail)', 0, 0, 1, 37),
  ('ducks', 'Ducks', 0, 0, 1, NULL),
  ('rabbit', 'Rabbit', 0, 0, 1, NULL);

-- 3. Create live_yield_ratios table
-- Maps individual product variants to an animal and assigns a role: MAIN_CUT, BYPRODUCT, or DIRECT (default)
CREATE TABLE IF NOT EXISTS live_yield_ratios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_key TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    role TEXT NOT NULL DEFAULT 'DIRECT' CHECK(role IN ('MAIN_CUT', 'BYPRODUCT', 'DIRECT')),
    grams_per_kg_live INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(animal_key, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_yield_ratios_lookup ON live_yield_ratios(variant_id, animal_key);

-- Seed Chicken ratios using existing defaults (Whole 625g, Skinless 520g, Liver 30g)
-- Prod 11 / Variant 29 (CHICKEN DRESSED) -> MAIN_CUT 625g
INSERT OR IGNORE INTO live_yield_ratios (animal_key, product_id, variant_id, role, grams_per_kg_live)
VALUES ('chicken', 11, 29, 'MAIN_CUT', 625);

-- Prod 12 / Variant 30 (CHICKEN SKINLESS) -> MAIN_CUT 520g
INSERT OR IGNORE INTO live_yield_ratios (animal_key, product_id, variant_id, role, grams_per_kg_live)
VALUES ('chicken', 12, 30, 'MAIN_CUT', 520);

-- Prod 15 / Variant 33 (CHICKEN LIVER) -> BYPRODUCT 30g
INSERT OR IGNORE INTO live_yield_ratios (animal_key, product_id, variant_id, role, grams_per_kg_live)
VALUES ('chicken', 15, 33, 'BYPRODUCT', 30);

-- Mutton seeds
INSERT OR IGNORE INTO live_yield_ratios (animal_key, product_id, variant_id, role, grams_per_kg_live)
VALUES ('mutton', 21, 39, 'MAIN_CUT', 500);

INSERT OR IGNORE INTO live_yield_ratios (animal_key, product_id, variant_id, role, grams_per_kg_live)
VALUES ('mutton', 39, 57, 'MAIN_CUT', 550);

INSERT OR IGNORE INTO live_yield_ratios (animal_key, product_id, variant_id, role, grams_per_kg_live)
VALUES ('mutton', 23, 41, 'BYPRODUCT', 20);

INSERT OR IGNORE INTO live_yield_ratios (animal_key, product_id, variant_id, role, grams_per_kg_live)
VALUES ('mutton', 24, 42, 'BYPRODUCT', 30);

INSERT OR IGNORE INTO live_yield_ratios (animal_key, product_id, variant_id, role, grams_per_kg_live)
VALUES ('mutton', 28, 46, 'BYPRODUCT', 10);

-- Ducks seeds
INSERT OR IGNORE INTO live_yield_ratios (animal_key, product_id, variant_id, role, grams_per_kg_live)
VALUES ('ducks', 91, 109, 'MAIN_CUT', 650);

-- Rabbit seeds
INSERT OR IGNORE INTO live_yield_ratios (animal_key, product_id, variant_id, role, grams_per_kg_live)
VALUES ('rabbit', 92, 110, 'MAIN_CUT', 550);

-- 4. Create live_animal_sale_deductions table
-- Stores exact per-sale FIFO drawdown rows for deterministic bill cancellations and returns
CREATE TABLE IF NOT EXISTS live_animal_sale_deductions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    invoice_item_id INTEGER NOT NULL REFERENCES invoice_items(id),
    batch_id INTEGER NOT NULL REFERENCES live_chicken_batches(id),
    animal_type TEXT NOT NULL,
    sold_product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    sold_grams INTEGER NOT NULL,
    live_grams_deducted INTEGER NOT NULL,
    count_milli_deducted INTEGER NOT NULL,
    ratio_snapshot_used INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_deductions_item ON live_animal_sale_deductions(invoice_item_id);
CREATE INDEX IF NOT EXISTS idx_sale_deductions_invoice ON live_animal_sale_deductions(invoice_id);

-- 5. Create live_yield_ratio_audit table
CREATE TABLE IF NOT EXISTS live_yield_ratio_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_key TEXT NOT NULL,
    variant_id INTEGER NOT NULL,
    old_role TEXT,
    new_role TEXT,
    old_grams_per_kg INTEGER,
    new_grams_per_kg INTEGER,
    changed_by INTEGER,
    changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
