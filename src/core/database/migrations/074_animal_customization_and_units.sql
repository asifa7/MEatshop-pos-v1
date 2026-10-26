-- Migration 074: Animal Customization, Symbols & Inventory Visibility Controls

ALTER TABLE live_animal_yield_configs ADD COLUMN icon_key TEXT NOT NULL DEFAULT 'chicken';
ALTER TABLE live_animal_yield_configs ADD COLUMN unit_name TEXT NOT NULL DEFAULT 'head';
ALTER TABLE live_animal_yield_configs ADD COLUMN show_in_inventory INTEGER NOT NULL DEFAULT 1 CHECK(show_in_inventory IN (0, 1));
ALTER TABLE live_animal_yield_configs ADD COLUMN stock_mode TEXT NOT NULL DEFAULT 'dual' CHECK(stock_mode IN ('dual', 'weight_only', 'count_only'));

-- Update initial configs with custom symbols and default unit names
UPDATE live_animal_yield_configs SET icon_key = 'chicken', unit_name = 'birds', show_in_inventory = 1 WHERE animal_key = 'chicken';
UPDATE live_animal_yield_configs SET icon_key = 'rooster', unit_name = 'birds', show_in_inventory = 1 WHERE animal_key = 'country_chicken';
UPDATE live_animal_yield_configs SET icon_key = 'goat', unit_name = 'head', show_in_inventory = 1 WHERE animal_key = 'mutton';
UPDATE live_animal_yield_configs SET icon_key = 'quail', unit_name = 'birds', show_in_inventory = 1 WHERE animal_key = 'quils';
UPDATE live_animal_yield_configs SET icon_key = 'duck', unit_name = 'birds', show_in_inventory = 1 WHERE animal_key = 'ducks';
UPDATE live_animal_yield_configs SET icon_key = 'rabbit', unit_name = 'animals', show_in_inventory = 1 WHERE animal_key = 'rabbit';
