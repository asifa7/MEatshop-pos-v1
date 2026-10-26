-- Migration 083: Product Stock Modes, Single Ledger (stock_movements), and Data Integrity Reconciliation
-- Scope:
-- 1. Products: Add stock_mode ('OWN' | 'LINKED' | 'NONE'), parent_product_id, link_mode ('YIELD' | 'PACK'), yield_g_per_kg, parent_units_per_sale_unit
-- 2. Invoice Items: Add stock_product_id, stock_link_mode, conversion_rate_used, deducted_qty
-- 3. Single Ledger: Create stock_movements append-only table with strict deduplication index
-- 4. Catalogue Configuration: Map all cuts to parent live products (Chicken Live, CC Live, Mutton Live), fix Quais Egg is_processed_cut
-- 5. Stock Backfill: Initialize stock_movements with OPENING balance from current stock_ledger
-- 6. Formatting & Consistency: Sanitize float counts and -0 values in stock_ledger

-- 1. Schema updates for products
ALTER TABLE products ADD COLUMN stock_mode TEXT NOT NULL DEFAULT 'OWN' CHECK(stock_mode IN ('OWN', 'LINKED', 'NONE'));
ALTER TABLE products ADD COLUMN parent_product_id INTEGER REFERENCES products(id);
ALTER TABLE products ADD COLUMN link_mode TEXT DEFAULT NULL CHECK(link_mode IS NULL OR link_mode IN ('YIELD', 'PACK'));
ALTER TABLE products ADD COLUMN yield_g_per_kg INTEGER DEFAULT NULL;
ALTER TABLE products ADD COLUMN parent_units_per_sale_unit INTEGER DEFAULT NULL;

-- 2. Schema updates for invoice_items snapshot
ALTER TABLE invoice_items ADD COLUMN stock_product_id INTEGER REFERENCES products(id);
ALTER TABLE invoice_items ADD COLUMN stock_link_mode TEXT DEFAULT NULL;
ALTER TABLE invoice_items ADD COLUMN conversion_rate_used INTEGER DEFAULT NULL;
ALTER TABLE invoice_items ADD COLUMN deducted_qty INTEGER DEFAULT NULL;

-- 3. Create stock_movements table
CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    qty_delta INTEGER NOT NULL, -- grams for weight products, pieces for counted products
    movement_type TEXT NOT NULL CHECK(movement_type IN ('OPENING', 'PURCHASE', 'PURCHASE_RETURN', 'SALE', 'SALE_RETURN', 'SALE_CANCEL', 'SALE_EDIT', 'WASTAGE', 'COUNT_ADJUSTMENT')),
    ref_type TEXT,
    ref_id INTEGER,
    invoice_line_id INTEGER REFERENCES invoice_items(id),
    reason_code TEXT,
    note TEXT,
    user_id INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_movements_dedup
ON stock_movements(ref_type, ref_id, product_id, movement_type, COALESCE(invoice_line_id, 0))
WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ref ON stock_movements(ref_type, ref_id);

-- 4. Fix QUAIS EGG and catalogue flags
UPDATE products SET is_processed_cut = 0, is_inventory_tracked = 1, stock_mode = 'OWN' WHERE id = 38 OR product_code = '25';
UPDATE product_variants SET is_processed_cut = 0, track_in_inventory = 1 WHERE product_id = 38 OR product_code = '25';

-- Service / Non-physical items
UPDATE products SET stock_mode = 'NONE', is_inventory_tracked = 0 WHERE product_code IN ('20'); -- TRANSPORT

-- Live / OWN items
UPDATE products SET stock_mode = 'OWN', is_inventory_tracked = 1 WHERE id IN (29, 17, 20, 19, 31, 32, 38);
UPDATE product_variants SET track_in_inventory = 1 WHERE product_id IN (29, 17, 20, 19, 31, 32, 38);

-- Chicken Cuts -> Parent: BROILER CHICKEN (LIVE) (id: 29)
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 625 WHERE id IN (11, 87); -- CHICKEN DRESSED (625 g/kg)
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 550 WHERE id IN (12, 88); -- CHICKEN SKINLESS (550 g/kg)
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 625 WHERE id = 13; -- SPECIAL CHICKEN
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 350 WHERE id = 14; -- CHICKEN BONELESS
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 30  WHERE id = 15; -- CHICKEN LIVER
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 20  WHERE id = 18; -- CHICKEN KALL
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 150 WHERE id = 43; -- CHICKEN BONE
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 625 WHERE id = 45; -- CHICKEN 65
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 350 WHERE id = 46; -- 65 BONELESS
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 625 WHERE id = 51; -- KADAI 65
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'PACK', parent_units_per_sale_unit = 1 WHERE id IN (47, 48, 50); -- HALF LEG, FULL LEG, LOLLY POP

-- Country Chicken -> Parent: CC LIVE (id: 17)
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 17, link_mode = 'YIELD', yield_g_per_kg = 625 WHERE id = 84; -- CC DRESSED

-- Mutton Cuts -> Parent: MUTTON (id: 20)
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 20, link_mode = 'YIELD', yield_g_per_kg = 650 WHERE id = 21; -- MUTTON BONELESS
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 20, link_mode = 'YIELD', yield_g_per_kg = 200 WHERE id = 22; -- MUTTON BONE
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 20, link_mode = 'YIELD', yield_g_per_kg = 20  WHERE id = 23; -- MUTTON LIVER
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 20, link_mode = 'YIELD', yield_g_per_kg = 15  WHERE id = 37; -- SPLEEN
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 20, link_mode = 'YIELD', yield_g_per_kg = 650 WHERE id = 53; -- MUTTON KEEMA
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 20, link_mode = 'PACK', parent_units_per_sale_unit = 1 WHERE id IN (24, 25, 26, 27, 28, 39, 83, 90); -- BOTTI, LEG, HEAD, LUNGS, BRAIN, PARTS, SPL

-- Eggs -> Parent: EGG (id: 31)
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 31, link_mode = 'PACK', parent_units_per_sale_unit = 1 WHERE id IN (41, 54); -- EGG 1, FREE EGG

-- Duck & Rabbit
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 650 WHERE id = 91;
UPDATE products SET stock_mode = 'LINKED', parent_product_id = 29, link_mode = 'YIELD', yield_g_per_kg = 550 WHERE id = 92;

-- Sync product_variants parent_variant_id for backward compatibility
UPDATE product_variants
SET parent_variant_id = (SELECT pv_parent.id FROM product_variants pv_parent WHERE pv_parent.product_id = (SELECT p.parent_product_id FROM products p WHERE p.id = product_variants.product_id) LIMIT 1),
    yield_ratio = (SELECT p.yield_g_per_kg / 10.0 FROM products p WHERE p.id = product_variants.product_id AND p.link_mode = 'YIELD')
WHERE EXISTS (SELECT 1 FROM products p WHERE p.id = product_variants.product_id AND p.stock_mode = 'LINKED');

-- 5. Backfill OPENING stock movements into stock_movements for all OWN products
INSERT INTO stock_movements (product_id, qty_delta, movement_type, ref_type, ref_id, note)
SELECT 
    p.id as product_id,
    CASE 
        WHEN p.unit_type IN ('weight', 'live_dual') THEN COALESCE(sl.quantity_grams, 0)
        ELSE COALESCE(sl.quantity_units, 0)
    END as qty_delta,
    'OPENING' as movement_type,
    'migration' as ref_type,
    83 as ref_id,
    'Initial opening balance from stock_ledger' as note
FROM products p
JOIN product_variants pv ON pv.product_id = p.id
JOIN stock_ledger sl ON sl.product_variant_id = pv.id
WHERE p.stock_mode = 'OWN'
  AND (
    (p.unit_type IN ('weight', 'live_dual') AND COALESCE(sl.quantity_grams, 0) != 0)
    OR (p.unit_type = 'piece' AND COALESCE(sl.quantity_units, 0) != 0)
  )
  AND NOT EXISTS (
    SELECT 1 FROM stock_movements sm 
    WHERE sm.product_id = p.id AND sm.movement_type = 'OPENING' AND sm.ref_type = 'migration' AND sm.ref_id = 83
  );

-- 6. Clean up stock_ledger quantities and sanitize floating-point numbers
UPDATE stock_ledger
SET quantity_count = ROUND(quantity_count, 0)
WHERE quantity_count IS NOT NULL;

UPDATE stock_ledger
SET quantity_count = 0
WHERE quantity_count IS NULL OR quantity_count < 0;
