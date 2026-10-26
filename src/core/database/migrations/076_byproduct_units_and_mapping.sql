-- Migration 076: Sanitize show_in_inventory values and add index for fast animal yield lookups

UPDATE live_animal_yield_configs 
SET show_in_inventory = 1 
WHERE show_in_inventory IS NULL OR show_in_inventory NOT IN (0, 1);

CREATE INDEX IF NOT EXISTS idx_animal_yield_configs_vis 
ON live_animal_yield_configs(show_in_inventory, is_active);
