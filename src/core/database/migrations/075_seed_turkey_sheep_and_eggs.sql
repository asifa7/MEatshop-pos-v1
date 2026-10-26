-- Migration 075: Seed Turkey, Sheep, and update Combined Mutton

INSERT OR IGNORE INTO live_animal_yield_configs (
  animal_key, display_name, icon_key, unit_name, show_in_inventory, stock_mode, live_tracking_enabled, track_byproducts, is_active
) VALUES 
  ('turkey', 'Turkey', 'turkey', 'birds', 1, 'dual', 0, 0, 1),
  ('sheep', 'Sheep (Mutton)', 'sheep', 'head', 1, 'dual', 0, 1, 1);

-- Update mutton display name to indicate Combined Goat & Sheep
UPDATE live_animal_yield_configs 
SET display_name = 'Mutton (Goat/Sheep Combined)', icon_key = 'goat', unit_name = 'head'
WHERE animal_key = 'mutton';
