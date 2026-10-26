-- Migration 070: Recalibrate Supplier Outstanding Balances
-- Resets any corrupted or desynced supplier balances to match their actual net ledger amount:
-- opening_balance_paise + SUM(credit_paise) - SUM(debit_paise)

UPDATE suppliers
SET outstanding_balance_paise = COALESCE(opening_balance_paise, 0) + COALESCE((
    SELECT SUM(credit_paise) - SUM(debit_paise)
    FROM supplier_ledger
    WHERE supplier_ledger.supplier_id = suppliers.id
      AND supplier_ledger.status != 'rejected'
), 0);
