-- Migration 079: Customer Quick-Add Consent & WhatsApp Attempt Audit Logs
-- Adds explicit consent flags for billing messages vs promotional marketing
-- Adds privacy-compliant attempt logger storing only timestamp, invoice, and phone suffix

ALTER TABLE customers ADD COLUMN whatsapp_bill_consent INTEGER NOT NULL DEFAULT 1 CHECK(whatsapp_bill_consent IN (0, 1));
ALTER TABLE customers ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK(marketing_consent IN (0, 1));

CREATE TABLE IF NOT EXISTS whatsapp_attempt_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  phone_suffix TEXT NOT NULL,
  attempt_type TEXT NOT NULL DEFAULT 'wa_me_link',
  status TEXT NOT NULL DEFAULT 'attempted',
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_attempts_invoice ON whatsapp_attempt_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_attempts_customer ON whatsapp_attempt_logs(customer_id);
