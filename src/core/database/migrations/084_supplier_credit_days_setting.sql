-- 084_supplier_credit_days_setting.sql
-- Adds configurable supplier credit days setting (default: 0 = disabled)
INSERT INTO system_settings (key, value) VALUES ('supplier_credit_days', '0') ON CONFLICT(key) DO NOTHING;
