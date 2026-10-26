CREATE INDEX idx_acc_ledger_type ON accounting_daily_ledger(account_type, date);

CREATE INDEX idx_activity_log_customer ON customer_activity_logs(customer_id);

CREATE INDEX idx_activity_log_date ON customer_activity_logs(created_at);

CREATE INDEX idx_adl_account ON accounting_daily_ledger(account_type);

CREATE INDEX idx_adl_date ON accounting_daily_ledger(date);

CREATE INDEX idx_adl_ref ON accounting_daily_ledger(reference_id);

CREATE INDEX idx_adl_voucher_group ON accounting_daily_ledger(voucher_group_id);

CREATE INDEX idx_advance_customer ON customer_advance_payments(customer_id);

CREATE INDEX idx_advance_remaining ON customer_advance_payments(customer_id, remaining_paise);

CREATE INDEX idx_animal_yield_configs_vis 
ON live_animal_yield_configs(show_in_inventory, is_active);

CREATE INDEX idx_asset_branch ON asset_items(branch_id);

CREATE INDEX idx_asset_category ON asset_items(category);

CREATE INDEX idx_asset_replacement_asset ON asset_replacement_log(asset_id);

CREATE INDEX idx_asset_status ON asset_items(status);

CREATE INDEX idx_audit_items_session ON physical_stock_audit_items(session_id);

CREATE INDEX idx_audit_items_variant ON physical_stock_audit_items(product_variant_id);

CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

CREATE INDEX idx_bulk_orders_date ON bulk_orders(delivery_date, status);

CREATE INDEX idx_calendar_events_date ON calendar_events(event_date);

CREATE INDEX idx_cash_box_session_created ON store_cash_box(session_id, created_at, id);

CREATE INDEX idx_cash_box_session_type ON store_cash_box(session_id, type);

CREATE INDEX idx_contra_date ON contra_entries(entry_date);

CREATE INDEX idx_cost_lots_variant ON inventory_cost_lots(variant_id, is_exhausted);

CREATE UNIQUE INDEX idx_credit_note_sequences_year ON credit_note_sequences(year);

CREATE INDEX idx_credit_notes_customer ON customer_credit_notes(customer_id);

CREATE INDEX idx_credit_txn_customer ON customer_credit_transactions(customer_id);

CREATE INDEX idx_credit_txn_date ON customer_credit_transactions(created_at);

CREATE INDEX idx_credit_txn_invoice ON customer_credit_transactions(invoice_id);

CREATE INDEX idx_credit_txn_type ON customer_credit_transactions(transaction_type);

CREATE INDEX idx_customer_addresses_customer_id ON customer_addresses(customer_id);

CREATE INDEX idx_customer_analytics_calculated ON customer_analytics_cache(last_calculated_at);

CREATE INDEX idx_customer_analytics_segment ON customer_analytics_cache(segment);

CREATE INDEX idx_customer_comm_log_customer_id ON customer_communication_log(customer_id);

CREATE INDEX idx_customer_face_profiles_customer_id ON customer_face_profiles(customer_id);

CREATE INDEX idx_customer_ledger_customer ON customer_ledger(customer_id);

CREATE INDEX idx_customer_ledger_date ON customer_ledger(customer_id, entry_date);

CREATE INDEX idx_customer_ledger_ref ON customer_ledger(ref_type, ref_id);

CREATE INDEX idx_customer_notes_customer_id ON customer_notes(customer_id);

CREATE INDEX idx_customer_payments_customer ON customer_payment_records(customer_id);

CREATE INDEX idx_customer_payments_date ON customer_payment_records(payment_date);

CREATE INDEX idx_customer_payments_unalloc ON customer_payment_records(customer_id, is_allocated);

CREATE INDEX idx_customer_upi_customer ON customer_upi_identities(customer_id);

CREATE INDEX idx_customer_upi_vpa ON customer_upi_identities(vpa);

CREATE INDEX idx_customer_visits_customer_id ON customer_visits(customer_id);

CREATE INDEX idx_customer_visits_linked_invoice ON customer_visits(linked_invoice_id);

CREATE INDEX idx_customer_visits_timestamp ON customer_visits(visit_timestamp);

CREATE INDEX idx_customers_active ON customers(is_active);

CREATE INDEX idx_customers_code ON customers(customer_code);

CREATE UNIQUE INDEX idx_customers_customer_code_unique ON customers(customer_code);

CREATE INDEX idx_customers_group ON customers(group_id);

CREATE INDEX idx_customers_group_category ON customers(group_id, category);

CREATE INDEX idx_customers_is_system ON customers(is_system);

CREATE INDEX idx_customers_is_test ON customers(is_test);

CREATE INDEX idx_customers_manual_tier ON customers(manual_tier);

CREATE INDEX idx_customers_name ON customers(name);

CREATE INDEX idx_customers_outstanding ON customers(outstanding_balance_paise DESC);

CREATE INDEX idx_customers_phone ON customers(phone);

CREATE INDEX idx_customers_phone_normalized ON customers(phone_normalized);

CREATE UNIQUE INDEX idx_customers_phone_normalized_unique 
ON customers(phone_normalized) 
WHERE phone_normalized IS NOT NULL 
  AND phone_normalized != ''
  AND (status != 'merged' OR status IS NULL) 
  AND (is_test = 0 OR is_test IS NULL);

CREATE INDEX idx_customers_preferred_time_slot ON customers(preferred_time_slot);

CREATE INDEX idx_customers_search_business ON customers(business_name);

CREATE INDEX idx_customers_search_name ON customers(name);

CREATE INDEX idx_customers_search_phone ON customers(phone);

CREATE INDEX idx_customers_search_whatsapp ON customers(whatsapp);

CREATE INDEX idx_customers_status ON customers(is_active, status);

CREATE INDEX idx_daily_reconciliations_date ON daily_inventory_reconciliations(reconciliation_date);

CREATE INDEX idx_daily_reconciliations_variant ON daily_inventory_reconciliations(product_variant_id);

CREATE INDEX idx_deleted_products_archive_category ON deleted_products_archive (category);

CREATE INDEX idx_deleted_products_archive_deleted_at ON deleted_products_archive (deleted_at);

CREATE INDEX idx_deleted_products_archive_name ON deleted_products_archive (name);

CREATE INDEX idx_deliveries_customer_id ON deliveries(customer_id);

CREATE INDEX idx_deliveries_driver_id ON deliveries(driver_id);

CREATE INDEX idx_deliveries_invoice_id ON deliveries(invoice_id);

CREATE INDEX idx_deliveries_requested_date ON deliveries(requested_date);

CREATE INDEX idx_deliveries_status ON deliveries(status);

CREATE INDEX idx_delivery_attempts_delivery_id ON delivery_attempts(delivery_id);

CREATE INDEX idx_delivery_status_history_delivery_id ON delivery_status_history(delivery_id);

CREATE INDEX idx_emp_att_date ON employee_attendance(date);

CREATE INDEX idx_emp_salary_struct_emp ON employee_salary_structures(employee_id);

CREATE INDEX idx_employee_advances_date ON employee_advances(advance_date);

CREATE INDEX idx_employee_advances_emp ON employee_advances(employee_id, is_active);

CREATE INDEX idx_employee_attendance_emp_date ON employee_attendance(employee_id, date);

CREATE INDEX idx_employee_deductions_adv ON employee_deductions(advance_id);

CREATE INDEX idx_employee_deductions_date ON employee_deductions(deduction_date);

CREATE INDEX idx_employee_deductions_emp ON employee_deductions(employee_id, is_active);

CREATE INDEX idx_employee_expenses_date ON employee_expenses(expense_date);

CREATE INDEX idx_employee_expenses_emp ON employee_expenses(employee_id, is_active);

CREATE INDEX idx_employee_incentives_emp ON employee_incentives(employee_id, is_active);

CREATE INDEX idx_employee_incentives_month ON employee_incentives(month_year);

CREATE INDEX idx_employee_ledger_date ON employee_ledger(entry_date);

CREATE INDEX idx_employee_ledger_emp ON employee_ledger(employee_id, is_active);

CREATE INDEX idx_employee_ledger_ref ON employee_ledger(reference_type, reference_id);

CREATE INDEX idx_employee_overtime_date ON employee_overtime(date);

CREATE INDEX idx_employee_overtime_emp ON employee_overtime(employee_id, is_active);

CREATE INDEX idx_employees_dept ON employees(department);

CREATE INDEX idx_employees_status ON employees(status);

CREATE INDEX idx_ent_audit_mod ON enterprise_audit_logs(module, action);

CREATE INDEX idx_global_search_vec ON global_search_index(search_vector);

CREATE INDEX idx_grn_date ON goods_receipts(received_date);

CREATE INDEX idx_grn_po ON goods_receipts(purchase_order_id);

CREATE INDEX idx_grn_supplier ON goods_receipts(supplier_id);

CREATE INDEX idx_hr_audit_created ON hr_audit_logs(created_at);

CREATE INDEX idx_hr_audit_entity ON hr_audit_logs(entity_type, entity_id);

CREATE INDEX idx_inv_ledger_action ON inventory_ledger(action_type);

CREATE INDEX idx_inv_ledger_batch ON inventory_ledger(batch_id);

CREATE INDEX idx_inv_ledger_branch ON inventory_ledger(branch_id);

CREATE INDEX idx_inv_ledger_created ON inventory_ledger(created_at);

CREATE INDEX idx_inv_ledger_product ON inventory_ledger(product_id);

CREATE INDEX idx_inv_ledger_ref ON inventory_ledger(reference_type, reference_id);

CREATE INDEX idx_inv_ledger_variant ON inventory_ledger(product_variant_id);

CREATE INDEX idx_invoice_items_invoice_id ON invoice_items(invoice_id);

CREATE INDEX idx_invoice_items_invoice_variant ON invoice_items(invoice_id, product_variant_id);

CREATE INDEX idx_invoice_reprints_invoice ON invoice_reprints(invoice_id);

CREATE INDEX idx_invoices_completed_at_status ON invoices(completed_at, status);

CREATE INDEX idx_invoices_created_by_completed ON invoices(created_by, completed_at);

CREATE INDEX idx_invoices_customer_completed ON invoices(customer_id, completed_at);

CREATE INDEX idx_invoices_customer_created ON invoices(customer_id, created_at);

CREATE INDEX idx_invoices_customer_status ON invoices(customer_id, status, completed_at);

CREATE INDEX idx_invoices_fy_num ON invoices(financial_year, invoice_number);

CREATE INDEX idx_invoices_is_test ON invoices(is_test);

CREATE INDEX idx_invoices_location_completed ON invoices(location_id, completed_at);

CREATE INDEX idx_invoices_shift_completed ON invoices(shift_id, completed_at);

CREATE INDEX idx_invoices_status ON invoices(status);

CREATE INDEX idx_jv_entries_account ON journal_voucher_entries(account_code);

CREATE INDEX idx_live_batches_animal_status 
ON live_chicken_batches(animal_type, status, remaining_weight_grams);

CREATE INDEX idx_live_batches_remaining 
ON live_chicken_batches(status, remaining_weight_grams, remaining_count);

CREATE INDEX idx_live_chicken_batches_status ON live_chicken_batches(status, purchase_date ASC);

CREATE INDEX idx_pay_alloc_bill ON payment_allocations(bill_type, bill_id);

CREATE INDEX idx_pay_alloc_voucher ON payment_allocations(payment_receipt_id);

CREATE INDEX idx_pay_rec_date ON payments_receipts(payment_date);

CREATE INDEX idx_pay_rec_direction ON payments_receipts(direction);

CREATE UNIQUE INDEX idx_pay_rec_idempotency ON payments_receipts(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE INDEX idx_pay_rec_method ON payments_receipts(payment_method);

CREATE INDEX idx_pay_rec_parent ON payments_receipts(reversed_payment_id);

CREATE INDEX idx_pay_rec_party ON payments_receipts(party_type, party_id);

CREATE INDEX idx_pay_rec_reversed ON payments_receipts(is_reversed);

CREATE INDEX idx_payment_alloc_invoice ON customer_payment_allocations(invoice_id);

CREATE INDEX idx_payment_alloc_payment ON customer_payment_allocations(payment_id);

CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);

CREATE INDEX idx_payments_invoice_method ON payments(invoice_id, method);

CREATE INDEX idx_payroll_items_emp_month ON payroll_items(employee_id, month_year);

CREATE INDEX idx_payroll_items_run ON payroll_items(payroll_run_id);

CREATE INDEX idx_payroll_items_status ON payroll_items(status);

CREATE INDEX idx_payroll_locks_month ON hr_payroll_locks(month_year);

CREATE INDEX idx_payroll_reversals_item ON payroll_reversals(payroll_item_id);

CREATE INDEX idx_payroll_runs_month ON payroll_runs(month_year);

CREATE INDEX idx_pi_date ON purchase_invoices(invoice_date);

CREATE INDEX idx_pi_payment_status ON purchase_invoices(payment_status);

CREATE INDEX idx_pi_supplier ON purchase_invoices(supplier_id);

CREATE INDEX idx_po_date ON purchase_orders(order_date);

CREATE INDEX idx_po_status ON purchase_orders(status);

CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);

CREATE INDEX idx_processing_events_batch ON processing_events(batch_id);

CREATE INDEX idx_prod_track_log_created ON product_tracking_change_log(created_at);

CREATE INDEX idx_prod_track_log_product ON product_tracking_change_log(product_id);

CREATE UNIQUE INDEX idx_product_variants_code ON product_variants(product_code);

CREATE INDEX idx_product_variants_product_id ON product_variants(product_id);

CREATE INDEX idx_products_category ON products(category);

CREATE INDEX idx_products_code ON products(product_code);

CREATE UNIQUE INDEX idx_purchase_invoices_ref_number ON purchase_invoices(purchase_ref_number);

CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);

CREATE INDEX idx_purchases_variant ON purchases(product_variant_id);

CREATE INDEX idx_recent_reports_user ON recent_reports(user_id, last_accessed_at);

CREATE INDEX idx_refrigerator_removal_invoice ON refrigerator_removal_events(invoice_id);

CREATE INDEX idx_refrigerator_removal_stock ON refrigerator_removal_events(refrigerator_stock_id);

CREATE INDEX idx_refrigerator_stock_status ON refrigerator_stock(status, date_added ASC);

CREATE INDEX idx_reminders_customer ON customer_reminders(customer_id);

CREATE INDEX idx_reminders_status ON customer_reminders(status, scheduled_for);

CREATE INDEX idx_report_favorites_user ON report_favorite_items(user_id);

CREATE INDEX idx_role_permissions_role ON role_permissions(role);

CREATE INDEX idx_sale_deductions_invoice ON live_animal_sale_deductions(invoice_id);

CREATE INDEX idx_sale_deductions_item ON live_animal_sale_deductions(invoice_item_id);

CREATE INDEX idx_sale_edit_audit_invoice ON sale_edit_audit_logs(invoice_id);

CREATE INDEX idx_saved_reports_fav ON saved_reports(is_favorite);

CREATE INDEX idx_saved_reports_user ON saved_reports(created_by);

CREATE INDEX idx_shift_closing_closed_at ON shift_closing_records(closed_at);

CREATE INDEX idx_shift_closing_session ON shift_closing_records(session_id);

CREATE INDEX idx_shift_closing_status ON shift_closing_records(status);

CREATE INDEX idx_shift_corrections_created ON shift_corrections(created_at);

CREATE INDEX idx_shift_corrections_entity ON shift_corrections(entity_type, entity_id);

CREATE INDEX idx_shift_corrections_session ON shift_corrections(session_id);

CREATE INDEX idx_shift_movements_created ON shift_cash_movements(created_at);

CREATE INDEX idx_shift_movements_session ON shift_cash_movements(session_id);

CREATE INDEX idx_shift_movements_type ON shift_cash_movements(movement_type);

CREATE INDEX idx_stmt_txns_invoice ON statement_transactions(matched_invoice_id);

CREATE INDEX idx_stmt_txns_ref ON statement_transactions(ref_no);

CREATE INDEX idx_stmt_txns_status ON statement_transactions(status);

CREATE INDEX idx_stmt_txns_time ON statement_transactions(txn_time);

CREATE INDEX idx_stock_adjustments_variant ON stock_adjustments(product_variant_id);

CREATE INDEX idx_stock_batches_variant_fifo 
ON product_stock_batches(product_variant_id, status, received_date ASC, id ASC);

CREATE INDEX idx_stock_ledger_location ON stock_ledger(location_id);

CREATE INDEX idx_stock_ledger_variant ON stock_ledger(product_variant_id);

CREATE INDEX idx_stock_transactions_variant ON stock_transactions(product_variant_id);

CREATE INDEX idx_supplier_ledger_supplier_date ON supplier_ledger(supplier_id, entry_date);

CREATE INDEX idx_supplier_payments_date ON supplier_payments(payment_date);

CREATE INDEX idx_supplier_payments_supplier ON supplier_payments(supplier_id);

CREATE INDEX idx_supplier_price_history_variant ON supplier_price_history(product_variant_id);

CREATE INDEX idx_suppliers_gstin ON suppliers(gstin);

CREATE INDEX idx_suppliers_name ON suppliers(company_name);

CREATE INDEX idx_suppliers_outstanding ON suppliers(outstanding_balance_paise);

CREATE INDEX idx_suppliers_phone ON suppliers(phone);

CREATE INDEX idx_users_code ON users(code);

CREATE INDEX idx_users_username ON users(username);

CREATE INDEX idx_whatsapp_attempts_customer ON whatsapp_attempt_logs(customer_id);

CREATE INDEX idx_whatsapp_attempts_invoice ON whatsapp_attempt_logs(invoice_id);

CREATE INDEX idx_whatsapp_queue_invoice ON whatsapp_send_queue(invoice_id);

CREATE INDEX idx_whatsapp_queue_status_retry ON whatsapp_send_queue(status, next_retry_at);

CREATE INDEX idx_yield_ratios_lookup ON live_yield_ratios(variant_id, animal_key);

CREATE UNIQUE INDEX uq_cash_box_invoice_sale
  ON store_cash_box(invoice_id, type) WHERE type = 'CASH_SALE' AND invoice_id IS NOT NULL;

CREATE TABLE accounting_daily_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    date DATE NOT NULL,
    account_type TEXT NOT NULL, 

    reference_id TEXT,
    description TEXT NOT NULL,
    debit_paise INTEGER NOT NULL DEFAULT 0,
    credit_paise INTEGER NOT NULL DEFAULT 0,
    balance_paise INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME
, voucher_group_id TEXT DEFAULT NULL, party_type TEXT DEFAULT NULL, party_id INTEGER DEFAULT NULL, party_name TEXT DEFAULT NULL, source_module TEXT, is_auto_balanced INTEGER DEFAULT 0);

CREATE TABLE asset_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    purchase_cost_paise INTEGER NOT NULL DEFAULT 0,
    purchase_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'damaged', 'replaced', 'disposed')),
    branch_id INTEGER DEFAULT 1,
    times_replaced INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(branch_id) REFERENCES branches(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE asset_replacement_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    replacement_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    replacement_cost_paise INTEGER DEFAULT 0,
    notes TEXT,
    logged_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(asset_id) REFERENCES asset_items(id) ON DELETE CASCADE,
    FOREIGN KEY(logged_by) REFERENCES users(id)
);

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE bank_gateway_configs (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          provider TEXT NOT NULL DEFAULT 'PhonePe Merchant',
          merchant_id TEXT NOT NULL DEFAULT '',
          api_key TEXT NOT NULL DEFAULT '',
          api_secret TEXT DEFAULT '',
          webhook_secret TEXT DEFAULT '',
          poll_interval_minutes INTEGER NOT NULL DEFAULT 15,
          auto_poll_enabled INTEGER NOT NULL DEFAULT 0,
          last_synced_at TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bulk_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_date DATE NOT NULL,
  product_variant_id INTEGER NOT NULL,
  quantity_grams INTEGER,
  quantity_units INTEGER,
  customer_name_or_notes TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'fulfilled', 'cancelled')),
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(product_variant_id) REFERENCES product_variants(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE business_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rule_key TEXT NOT NULL UNIQUE,
    rule_name TEXT NOT NULL,
    threshold_value REAL NOT NULL,
    action_type TEXT NOT NULL, 

    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  event_date DATE NOT NULL,
  impact_level TEXT NOT NULL CHECK(impact_level IN ('High', 'Normal', 'Low', 'Very_Low')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, confidence_level TEXT NOT NULL DEFAULT 'Verified', custom_multiplier REAL DEFAULT NULL, category TEXT DEFAULT 'Festival');

CREATE TABLE cash_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    opening_float_paise INTEGER NOT NULL,
    actual_cash_paise INTEGER,
    status TEXT NOT NULL CHECK(status IN ('open', 'reconciled')),
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    remarks TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE contra_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_number TEXT UNIQUE NOT NULL,
    from_account TEXT NOT NULL CHECK(from_account IN ('cash', 'bank')),
    to_account TEXT NOT NULL CHECK(to_account IN ('cash', 'bank')),
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    entry_date TEXT NOT NULL,
    narration TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE credit_note_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    financial_year TEXT UNIQUE NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0
, year TEXT);

CREATE TABLE credit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credit_note_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    original_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    reason TEXT NOT NULL,
    is_applied INTEGER DEFAULT 0 NOT NULL CHECK(is_applied IN (0,1)),
    applied_to_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    applied_at DATETIME,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    details TEXT,
    performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    label TEXT NOT NULL DEFAULT 'Home', 

    door_no TEXT,
    building TEXT,
    street TEXT,
    area TEXT NOT NULL,
    landmark TEXT,
    city TEXT NOT NULL DEFAULT 'Bengaluru',
    district TEXT,
    state TEXT NOT NULL DEFAULT 'Karnataka',
    pincode TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    delivery_instructions TEXT,
    is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE customer_advance_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    payment_record_id INTEGER REFERENCES customer_payment_records(id) ON DELETE SET NULL,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    remaining_paise INTEGER NOT NULL,                

    method TEXT NOT NULL CHECK(method IN ('cash','upi','card','bank_transfer','cheque')),
    reference_number TEXT,
    deposit_date DATE NOT NULL DEFAULT (date('now')),
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_analytics_cache (
  customer_id INTEGER PRIMARY KEY REFERENCES customers(id) ON DELETE CASCADE,
  segment TEXT NOT NULL DEFAULT 'New',
  metrics_json TEXT NOT NULL,
  last_calculated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_communication_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, 

  template_type TEXT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER NULL
);

CREATE TABLE customer_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    contact_name TEXT NOT NULL,
    role TEXT,
    phone TEXT,
    email TEXT,
    is_primary INTEGER DEFAULT 0 NOT NULL CHECK(is_primary IN (0,1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_credit_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    credit_limit_paise INTEGER DEFAULT 0 NOT NULL,
    soft_limit_paise INTEGER DEFAULT 0 NOT NULL,       

    hard_limit_paise INTEGER DEFAULT 0 NOT NULL,        

    grace_days INTEGER DEFAULT 0 NOT NULL,              

    max_overdue_days INTEGER DEFAULT 90 NOT NULL,       

    interest_rate_percent REAL DEFAULT 0 NOT NULL,      

    is_frozen INTEGER DEFAULT 0 NOT NULL CHECK(is_frozen IN (0,1)),
    freeze_reason TEXT,
    frozen_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    frozen_at DATETIME,
    is_blacklisted INTEGER DEFAULT 0 NOT NULL CHECK(is_blacklisted IN (0,1)),
    blacklist_reason TEXT,
    blacklisted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    blacklisted_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_credit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credit_note_number TEXT UNIQUE NOT NULL,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    original_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    reason TEXT NOT NULL,
    is_applied INTEGER DEFAULT 0 NOT NULL CHECK(is_applied IN (0,1)),
    applied_to_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    applied_at DATETIME,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN (
        'credit_sale','payment','advance_deposit','advance_applied',
        'credit_note','debit_note','write_off','adjustment','interest','refund'
    )),
    amount_paise INTEGER NOT NULL,
    reference_number TEXT,
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_face_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  face_embedding_data TEXT NOT NULL, 

  reference_photo_path TEXT NULL,    

  enrolled_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_matched_at DATETIME NULL,
  match_confidence_threshold REAL NOT NULL DEFAULT 0.85,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    default_credit_limit_paise INTEGER DEFAULT 0,
    default_discount_percent REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL DEFAULT (date('now')),
    ref_type TEXT NOT NULL CHECK(ref_type IN (
        'opening_balance','invoice','payment','advance_deposit',
        'advance_applied','credit_note','debit_note','adjustment',
        'write_off','interest','refund'
    )),
    ref_id INTEGER,                        

    invoice_number TEXT,                   

    description TEXT NOT NULL,
    debit_paise INTEGER DEFAULT 0 NOT NULL,   

    credit_paise INTEGER DEFAULT 0 NOT NULL,  

    running_balance_paise INTEGER NOT NULL,   

    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    

);

CREATE TABLE customer_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  category TEXT NULL DEFAULT 'preference', 

  created_by INTEGER NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_id INTEGER NOT NULL REFERENCES customer_payment_records(id) ON DELETE CASCADE,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    allocated_paise INTEGER NOT NULL CHECK(allocated_paise > 0),
    allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(payment_id, invoice_id)
);

CREATE TABLE customer_payment_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    method TEXT NOT NULL CHECK(method IN ('cash','upi','card','bank_transfer','cheque','advance_adjustment')),
    reference_number TEXT,
    cheque_number TEXT,
    cheque_date DATE,
    bank_name TEXT,
    payment_date DATE NOT NULL DEFAULT (date('now')),
    notes TEXT,
    is_advance INTEGER DEFAULT 0 NOT NULL CHECK(is_advance IN (0,1)),
    is_allocated INTEGER DEFAULT 0 NOT NULL CHECK(is_allocated IN (0,1)),
    unallocated_paise INTEGER DEFAULT 0 NOT NULL,
    received_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    method TEXT NOT NULL CHECK(method IN ('cash', 'upi', 'card', 'cheque', 'bank_transfer')),
    reference_number TEXT,
    cheque_number TEXT,
    cheque_date TEXT,
    bank_name TEXT,
    payment_date DATE NOT NULL DEFAULT (date('now')),
    notes TEXT,
    is_advance INTEGER DEFAULT 0 NOT NULL CHECK(is_advance IN (0, 1)),
    is_allocated INTEGER DEFAULT 0 NOT NULL CHECK(is_allocated IN (0, 1)),
    unallocated_paise INTEGER NOT NULL DEFAULT 0,
    received_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK(channel IN ('sms','whatsapp','email','manual')),
    template_type TEXT NOT NULL CHECK(template_type IN ('payment_due','overdue','credit_limit','custom')),
    message TEXT NOT NULL,
    outstanding_paise INTEGER,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','cancelled')),
    scheduled_for DATETIME,
    sent_at DATETIME,
    failure_reason TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_sequences (
  sequence_key TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_tier_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  vip_min_spend_paise INTEGER NOT NULL DEFAULT 500000,
  vip_min_visits INTEGER NOT NULL DEFAULT 5,
  vip_criteria_mode TEXT NOT NULL DEFAULT 'either',
  regular_min_visits INTEGER NOT NULL DEFAULT 2,
  rare_inactive_days INTEGER NOT NULL DEFAULT 30,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, new_window_days INTEGER NOT NULL DEFAULT 14, at_risk_gap_multiplier REAL NOT NULL DEFAULT 2.0, wholesale_tags TEXT NOT NULL DEFAULT 'Wholesale,Distributor,Contract', restaurant_tags TEXT NOT NULL DEFAULT 'Restaurant,Hotel,Catering');

CREATE TABLE customer_upi_identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  vpa TEXT NOT NULL,
  payer_name TEXT,
  verified_count INTEGER DEFAULT 1,
  auto_link INTEGER DEFAULT 0,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vpa, customer_id)
);

CREATE TABLE customer_visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NULL REFERENCES customers(id) ON DELETE SET NULL,
  visit_timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  detection_method TEXT NOT NULL CHECK(detection_method IN ('camera_recognition', 'manual', 'phone_lookup')),
  camera_snapshot_path TEXT NULL,
  linked_invoice_id INTEGER NULL REFERENCES invoices(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    business_name TEXT,
    gstin TEXT,
    pan TEXT,
    phone TEXT,
    phone2 TEXT,
    whatsapp TEXT,
    email TEXT,
    

    billing_address_line1 TEXT,
    billing_address_line2 TEXT,
    billing_city TEXT,
    billing_state TEXT,
    billing_pincode TEXT,
    

    shipping_address_line1 TEXT,
    shipping_address_line2 TEXT,
    shipping_city TEXT,
    shipping_state TEXT,
    shipping_pincode TEXT,
    delivery_notes TEXT,
    

    group_id INTEGER REFERENCES customer_groups(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT 'Retail' CHECK(category IN ('Hotel','Restaurant','Retail','Wholesale','Catering','Distributor','Contract')),
    

    is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0,1)),
    

    credit_allowed INTEGER DEFAULT 0 NOT NULL CHECK(credit_allowed IN (0,1)),
    credit_limit_paise INTEGER DEFAULT 0 NOT NULL,
    

    outstanding_balance_paise INTEGER DEFAULT 0 NOT NULL,
    advance_balance_paise INTEGER DEFAULT 0 NOT NULL,
    

    opening_balance_paise INTEGER DEFAULT 0 NOT NULL,
    opening_balance_date DATE,
    

    preferred_payment_method TEXT DEFAULT 'cash' CHECK(preferred_payment_method IN ('cash','upi','card','bank_transfer','cheque','credit')),
    preferred_delivery_time TEXT,
    price_tier TEXT DEFAULT 'standard' CHECK(price_tier IN ('standard','wholesale','vip')),
    discount_percent REAL DEFAULT 0 CHECK(discount_percent >= 0 AND discount_percent <= 100),
    

    notes TEXT,
    

    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, allow_face_recognition INTEGER NOT NULL DEFAULT 0, current_balance_paise INTEGER DEFAULT 0, status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'blocked', 'merged')), merged_into_customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL, preferred_cut TEXT, skin_preference TEXT, cutting_preference TEXT, typical_quantity TEXT, delivery_preference TEXT, packaging_preference TEXT, special_instructions TEXT, phone_normalized TEXT, is_test INTEGER NOT NULL DEFAULT 0, is_system INTEGER NOT NULL DEFAULT 0, whatsapp_bill_consent INTEGER NOT NULL DEFAULT 1 CHECK(whatsapp_bill_consent IN (0, 1)), marketing_consent INTEGER NOT NULL DEFAULT 0 CHECK(marketing_consent IN (0, 1)), linked_supplier_id INTEGER DEFAULT NULL, manual_tier TEXT DEFAULT NULL, preferred_time_slot TEXT DEFAULT NULL);

CREATE TABLE "customers_stub_backup" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    credit_limit_paise INTEGER DEFAULT 0 NOT NULL,
    current_balance_paise INTEGER DEFAULT 0 NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_inventory_reconciliations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reconciliation_date DATE NOT NULL,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    expected_quantity_grams INTEGER,
    expected_quantity_units INTEGER,
    expected_quantity_count REAL,
    actual_quantity_grams INTEGER,
    actual_quantity_units INTEGER,
    actual_quantity_count REAL,
    discrepancy_grams INTEGER,
    discrepancy_units INTEGER,
    discrepancy_count REAL,
    status TEXT NOT NULL DEFAULT 'flagged' CHECK(status IN ('flagged', 'resolved_wastage', 'resolved_bill', 'dismissed')),
    action_taken TEXT,
    notes TEXT,
    flagged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE daily_market_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    product_name TEXT NOT NULL,
    grade TEXT NOT NULL DEFAULT 'Standard',
    market_rate_paise INTEGER NOT NULL,
    wholesale_rate_paise INTEGER NOT NULL,
    retail_rate_paise INTEGER NOT NULL,
    selling_rate_paise INTEGER NOT NULL,
    expected_margin_percent REAL DEFAULT 15.0,
    supplier_name TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME, product_variant_id INTEGER DEFAULT NULL, fetched_rate_paise INTEGER DEFAULT NULL, source_name TEXT DEFAULT NULL, fetched_at DATETIME DEFAULT NULL, auto_apply INTEGER DEFAULT 0,
    UNIQUE(date, product_name, grade)
);

CREATE TABLE daily_purchase_sequences (
  sequence_date TEXT PRIMARY KEY, 

  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE deleted_products_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL, -- 'product', 'variant', 'category'
  original_id INTEGER NOT NULL,
  original_parent_id INTEGER,
  product_code TEXT,
  name TEXT NOT NULL,
  category TEXT,
  unit_type TEXT DEFAULT 'weight',
  is_processed_cut INTEGER DEFAULT 0,
  track_in_inventory INTEGER DEFAULT 1,
  current_rate_paise INTEGER DEFAULT 0,
  cost_price_paise INTEGER DEFAULT 0,
  snapshot_json TEXT NOT NULL,
  deleted_by INTEGER,
  deleted_by_username TEXT,
  deleted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_number TEXT NOT NULL UNIQUE,
    order_id INTEGER,
    invoice_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    customer_address_id INTEGER,
    zone_id INTEGER,
    driver_id INTEGER,
    delivery_type TEXT NOT NULL DEFAULT 'immediate' CHECK(delivery_type IN ('immediate', 'scheduled', 'same_day', 'pickup', 'home', 'business')),
    priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal', 'high', 'urgent')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
        'order_created', 'pending', 'preparing', 'ready_for_dispatch',
        'assigned', 'picked_up', 'out_for_delivery', 'arrived',
        'delivered', 'failed', 'rescheduled', 'cancelled', 'returned'
    )),
    requested_date TEXT NOT NULL,           

    time_slot_start TEXT,                  

    time_slot_end TEXT,                    

    subtotal_paise INTEGER NOT NULL DEFAULT 0,
    delivery_charge_paise INTEGER NOT NULL DEFAULT 0,
    discount_paise INTEGER NOT NULL DEFAULT 0,
    total_paise INTEGER NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'cod', 

    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'partial', 'paid', 'cod_pending', 'refunded')),
    cod_expected_paise INTEGER NOT NULL DEFAULT 0,
    cod_collected_paise INTEGER NOT NULL DEFAULT 0,
    cod_variance_paise INTEGER NOT NULL DEFAULT 0,
    cod_reconciled INTEGER NOT NULL DEFAULT 0 CHECK(cod_reconciled IN (0, 1)),
    otp_code TEXT,                         

    otp_verified INTEGER NOT NULL DEFAULT 0 CHECK(otp_verified IN (0, 1)),
    special_prep_instructions TEXT,        

    customer_notes TEXT,
    internal_notes TEXT,
    estimated_minutes INTEGER DEFAULT 45,
    actual_prep_minutes INTEGER,
    actual_delivery_minutes INTEGER,
    scheduled_at DATETIME,
    dispatched_at DATETIME,
    delivered_at DATETIME,
    cancelled_at DATETIME,
    created_by INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, customer_name TEXT, customer_phone TEXT, delivery_address_snapshot TEXT, delivered INTEGER NOT NULL DEFAULT 0, delivered_by INTEGER, payment_received INTEGER NOT NULL DEFAULT 0, payment_received_at DATETIME, payment_received_by INTEGER, amount_paid_now_paise INTEGER NOT NULL DEFAULT 0, amount_pending_paise INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY(customer_id) REFERENCES customers(id),
    FOREIGN KEY(customer_address_id) REFERENCES customer_addresses(id),
    FOREIGN KEY(zone_id) REFERENCES delivery_zones(id),
    FOREIGN KEY(driver_id) REFERENCES delivery_drivers(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE delivery_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id INTEGER NOT NULL,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    driver_id INTEGER,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    arrived_at DATETIME,
    completed_at DATETIME,
    result TEXT NOT NULL CHECK(result IN ('success', 'failed', 'rescheduled', 'customer_unavailable', 'rejected', 'wrong_address')),
    failure_reason_code TEXT, 

    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
    FOREIGN KEY(driver_id) REFERENCES delivery_drivers(id)
);

CREATE TABLE delivery_cod_reconciliation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reconciliation_number TEXT NOT NULL UNIQUE,
    driver_id INTEGER NOT NULL,
    shift_id INTEGER,
    reconciliation_date TEXT NOT NULL, 

    total_deliveries INTEGER NOT NULL DEFAULT 0,
    total_expected_paise INTEGER NOT NULL DEFAULT 0,
    total_collected_paise INTEGER NOT NULL DEFAULT 0,
    total_variance_paise INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'verified', 'discrepancy_resolved')),
    notes TEXT,
    verified_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(driver_id) REFERENCES delivery_drivers(id),
    FOREIGN KEY(verified_by) REFERENCES users(id)
);

CREATE TABLE delivery_drivers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    alternate_phone TEXT,
    vehicle_type TEXT NOT NULL DEFAULT 'two_wheeler', 

    vehicle_number TEXT,
    license_number TEXT,
    status TEXT NOT NULL DEFAULT 'available' CHECK(status IN ('available', 'assigned', 'picking_up', 'delivering', 'on_break', 'offline')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    max_concurrent_orders INTEGER NOT NULL DEFAULT 4,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE delivery_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    delivery_id INTEGER NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by INTEGER NOT NULL DEFAULT 1,
    reason TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE,
    FOREIGN KEY(changed_by) REFERENCES users(id)
);

CREATE TABLE delivery_zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    delivery_charge_paise INTEGER NOT NULL DEFAULT 4000, 

    min_order_paise INTEGER NOT NULL DEFAULT 20000,      

    free_delivery_above_paise INTEGER DEFAULT 100000,    

    estimated_minutes INTEGER NOT NULL DEFAULT 45,
    available_from TEXT DEFAULT '07:00',
    available_to TEXT DEFAULT '21:00',
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE egg_market_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    egg_type TEXT NOT NULL, 

    tray_price_paise INTEGER NOT NULL, 

    single_price_paise INTEGER NOT NULL,
    wholesale_price_paise INTEGER NOT NULL,
    retail_price_paise INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME,
    UNIQUE(date, egg_type)
);

CREATE TABLE employee_advances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  amount_paise INTEGER NOT NULL,
  advance_date DATE NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'cash', 

  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active', 

  created_by INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    employee_id INTEGER NOT NULL,
    date DATE NOT NULL,
    clock_in DATETIME,
    clock_out DATETIME,
    status TEXT NOT NULL DEFAULT 'Present', 

    working_hours REAL DEFAULT 0,
    overtime_hours REAL DEFAULT 0,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME, is_modified INTEGER NOT NULL DEFAULT 0, modified_reason TEXT DEFAULT NULL, modified_at DATETIME DEFAULT NULL, modified_by INTEGER DEFAULT NULL,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    UNIQUE(employee_id, date)
);

CREATE TABLE employee_deductions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  deduction_type TEXT NOT NULL, 

  advance_id INTEGER REFERENCES employee_advances(id),
  amount_paise INTEGER NOT NULL,
  deduction_date DATE NOT NULL,
  reason TEXT NOT NULL, 

  approved_by INTEGER,
  approved_by_name TEXT,
  created_by INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  expense_date DATE NOT NULL,
  amount_paise INTEGER NOT NULL,
  category TEXT NOT NULL, 

  description TEXT NOT NULL,
  flag TEXT NOT NULL, 

  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'Approved', 

  approved_by INTEGER,
  created_by INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_incentive_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL, 

  target_value NUMERIC NOT NULL,
  reward_amount_paise INTEGER NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_incentives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  incentive_type TEXT NOT NULL DEFAULT 'manual', 

  rule_id INTEGER REFERENCES employee_incentive_rules(id),
  amount_paise INTEGER NOT NULL,
  incentive_date DATE NOT NULL,
  month_year TEXT, 

  reason TEXT NOT NULL,
  created_by INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    employee_id INTEGER NOT NULL,
    leave_type TEXT NOT NULL, 

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending', 

    approved_by INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME, leave_type_id INTEGER, is_paid INTEGER DEFAULT 1, total_days REAL DEFAULT 1, rejection_reason TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
);

CREATE TABLE employee_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  entry_date DATE NOT NULL,
  entry_type TEXT NOT NULL, 

  debit_paise INTEGER NOT NULL DEFAULT 0, 

  credit_paise INTEGER NOT NULL DEFAULT 0, 

  running_balance_paise INTEGER NOT NULL DEFAULT 0,
  reference_type TEXT, 

  reference_id INTEGER,
  reference_number TEXT,
  description TEXT NOT NULL,
  created_by INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_overtime (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  date DATE NOT NULL,
  normal_hours NUMERIC NOT NULL DEFAULT 8,
  ot_hours NUMERIC NOT NULL,
  ot_rate_paise INTEGER NOT NULL,
  computed_amount_paise INTEGER NOT NULL, 

  notes TEXT,
  created_by INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE employee_payrolls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    employee_id INTEGER NOT NULL,
    month_year TEXT NOT NULL, 

    basic_paise INTEGER NOT NULL DEFAULT 0,
    hra_paise INTEGER NOT NULL DEFAULT 0,
    allowance_paise INTEGER NOT NULL DEFAULT 0,
    incentive_paise INTEGER NOT NULL DEFAULT 0,
    bonus_paise INTEGER NOT NULL DEFAULT 0,
    overtime_paise INTEGER NOT NULL DEFAULT 0,
    pf_deduction_paise INTEGER NOT NULL DEFAULT 0,
    esi_deduction_paise INTEGER NOT NULL DEFAULT 0,
    tax_deduction_paise INTEGER NOT NULL DEFAULT 0,
    advance_deduction_paise INTEGER NOT NULL DEFAULT 0,
    net_salary_paise INTEGER NOT NULL DEFAULT 0,
    payment_status TEXT NOT NULL DEFAULT 'Pending', 

    paid_at DATETIME,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    UNIQUE(employee_id, month_year)
);

CREATE TABLE employee_salary_structures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL UNIQUE,
    pay_type TEXT NOT NULL DEFAULT 'Monthly' CHECK(pay_type IN ('Monthly', 'Daily', 'Hourly')),
    basic_salary_paise INTEGER NOT NULL DEFAULT 0,
    fixed_allowances_json TEXT NOT NULL DEFAULT '[]',
    overtime_rate_paise INTEGER NOT NULL DEFAULT 0,
    incentive_rule_ref TEXT,
    attendance_based_salary INTEGER NOT NULL DEFAULT 0,
    deduction_rules_json TEXT NOT NULL DEFAULT '[]',
    effective_from DATE DEFAULT (date('now')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

CREATE TABLE employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    emp_code TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    gender TEXT,
    dob DATE,
    mobile TEXT NOT NULL,
    email TEXT,
    address TEXT,
    emergency_contact TEXT,
    joining_date DATE NOT NULL,
    department TEXT NOT NULL,
    designation TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'CASHIER',
    employment_type TEXT NOT NULL DEFAULT 'Full-Time',
    shift TEXT DEFAULT 'General',
    status TEXT NOT NULL DEFAULT 'Active',
    aadhaar_number TEXT,
    pan_number TEXT,
    bank_account TEXT,
    ifsc_code TEXT,
    upi_id TEXT,
    basic_salary_paise INTEGER NOT NULL DEFAULT 0,
    hra_paise INTEGER NOT NULL DEFAULT 0,
    allowance_paise INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME, salary_type TEXT DEFAULT 'Monthly', photo_url TEXT, emergency_contact_name TEXT, emergency_contact_phone TEXT, documents_notes TEXT, salary_cycle TEXT NOT NULL DEFAULT 'Monthly', salary_cycle_start_day TEXT DEFAULT 'Monday', relieving_date DATE DEFAULT NULL, relieving_reason TEXT DEFAULT NULL, relieving_settled INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE enterprise_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    module TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    ip_address TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expense_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    category_id INTEGER NOT NULL,
    vendor_name TEXT,
    amount_paise INTEGER NOT NULL,
    gst_paise INTEGER DEFAULT 0,
    payment_method TEXT NOT NULL DEFAULT 'Cash',
    expense_date DATE NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'Approved', 

    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME, employee_id INTEGER DEFAULT NULL, photo_url TEXT DEFAULT NULL,
    FOREIGN KEY (category_id) REFERENCES expense_categories(id)
);

CREATE TABLE feature_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    flag_key TEXT NOT NULL UNIQUE,
    flag_name TEXT NOT NULL,
    description TEXT,
    is_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE global_search_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL, 

    entity_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    search_vector TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE goods_receipt_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goods_receipt_id INTEGER NOT NULL,
    purchase_order_item_id INTEGER,
    product_variant_id INTEGER NOT NULL,
    quantity_accepted INTEGER NOT NULL,
    quantity_rejected INTEGER DEFAULT 0,
    rejection_reason TEXT,
    batch_number TEXT,
    expiry_date TEXT,
    FOREIGN KEY(goods_receipt_id) REFERENCES goods_receipts(id) ON DELETE CASCADE,
    FOREIGN KEY(purchase_order_item_id) REFERENCES purchase_order_items(id) ON DELETE SET NULL,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT
);

CREATE TABLE goods_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grn_number TEXT UNIQUE NOT NULL,
    purchase_order_id INTEGER,
    supplier_id INTEGER NOT NULL,
    delivery_note_number TEXT,
    received_date TEXT NOT NULL,
    received_by INTEGER NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY(received_by) REFERENCES users(id)
);

CREATE TABLE hr_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  entity_type TEXT NOT NULL, 

  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL, 

  old_value_json TEXT,
  new_value_json TEXT,
  reason TEXT NOT NULL,
  performed_by INTEGER NOT NULL,
  performed_by_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hr_leave_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    code TEXT UNIQUE NOT NULL,
    default_days_per_year INTEGER NOT NULL DEFAULT 12,
    is_paid INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE hr_payroll_locks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_year TEXT UNIQUE NOT NULL, 

    is_locked INTEGER NOT NULL DEFAULT 0,
    locked_at DATETIME,
    locked_by INTEGER,
    notes TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (locked_by) REFERENCES users(id)
);

CREATE TABLE hr_roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inventory_cost_lots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    variant_id INTEGER NOT NULL,
    purchase_invoice_id INTEGER,
    received_date DATE NOT NULL,
    initial_qty REAL NOT NULL,
    remaining_qty REAL NOT NULL,
    unit_cost_paise INTEGER NOT NULL,
    is_exhausted INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "inventory_ledger" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER NOT NULL,
    product_id INTEGER,
    branch_id INTEGER NOT NULL DEFAULT 1,
    action_type TEXT NOT NULL,
    quantity_grams INTEGER,
    quantity_units INTEGER,
    running_balance_grams INTEGER,
    running_balance_units INTEGER,
    unit_cost_paise INTEGER DEFAULT 0,
    batch_id INTEGER REFERENCES product_stock_batches(id),
    source_location_id INTEGER,
    destination_location_id INTEGER,
    reference_type TEXT,
    reference_id INTEGER,
    reference_number TEXT,
    reason_code TEXT,
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    FOREIGN KEY(branch_id) REFERENCES branches(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE inventory_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoice_item_batch_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_item_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  quantity_grams INTEGER,
  quantity_units INTEGER,
  unit_cost_paise INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(invoice_item_id) REFERENCES invoice_items(id) ON DELETE CASCADE,
  FOREIGN KEY(batch_id) REFERENCES product_stock_batches(id)
);

CREATE TABLE invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    product_variant_id INTEGER NOT NULL,
    quantity_grams INTEGER,
    quantity_units INTEGER,
    rate_paise_snapshot INTEGER NOT NULL,
    line_subtotal_paise INTEGER NOT NULL,
    gst_rate_percent_snapshot INTEGER, -- Basis points (e.g. 500 = 5.00%)
    line_total_paise INTEGER NOT NULL,
    override_applied INTEGER DEFAULT 0 NOT NULL CHECK(override_applied IN (0, 1)),
    override_reason TEXT,
    overridden_by INTEGER, is_manual_batch_selected INTEGER DEFAULT 0, real_cogs_paise INTEGER DEFAULT 0, estimated_cogs_paise INTEGER DEFAULT 0, is_estimated_cogs INTEGER DEFAULT 0, fifo_cogs_paise INTEGER DEFAULT 0, line_tax_paise INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, stock_source TEXT, refrigerator_stock_id INTEGER REFERENCES refrigerator_stock(id),
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id),
    FOREIGN KEY(overridden_by) REFERENCES users(id),
    CHECK(
        (quantity_grams IS NOT NULL AND quantity_units IS NULL) OR 
        (quantity_grams IS NULL AND quantity_units IS NOT NULL)
    )
);

CREATE TABLE invoice_reprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reprinted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE invoice_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    financial_year TEXT UNIQUE NOT NULL,
    last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE,
    financial_year TEXT,
    customer_id INTEGER,
    customer_face_id INTEGER,
    status TEXT NOT NULL CHECK(status IN ('draft', 'held', 'completed', 'void', 'returned')),
    is_gst_invoice INTEGER DEFAULT 0 NOT NULL CHECK(is_gst_invoice IN (0, 1)),
    gst_number_snapshot TEXT,
    subtotal_paise INTEGER NOT NULL,
    cgst_paise INTEGER NOT NULL,
    sgst_paise INTEGER NOT NULL,
    tax_paise INTEGER NOT NULL,
    total_paise INTEGER NOT NULL,
    payment_status TEXT NOT NULL CHECK(payment_status IN ('unpaid', 'partial', 'paid')),
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    voided_by INTEGER,
    void_reason TEXT,
    voided_at DATETIME, discount_paise INTEGER DEFAULT 0 NOT NULL, discount_reason TEXT, discount_applied_by INTEGER REFERENCES users(id), shop_name_snapshot TEXT, shop_address_snapshot TEXT, discount_percent REAL DEFAULT 0, flat_deduction_paise INTEGER DEFAULT 0, dressing_charge_paise INTEGER DEFAULT 0, round_off_paise INTEGER DEFAULT 0, narration TEXT DEFAULT NULL, print_delivery_token INTEGER DEFAULT 0, total_amount_paise INTEGER DEFAULT 0, invoice_date DATETIME, location_id INTEGER DEFAULT 1, shift_id INTEGER DEFAULT 1, counter_id TEXT DEFAULT 'Counter 1', is_delivery INTEGER DEFAULT 0, delivery_charge_paise INTEGER DEFAULT 0, delivery_id INTEGER, whatsapp_delivery_status TEXT DEFAULT 'pending', edit_snapshot_json TEXT, edit_reason TEXT, reprint_count INTEGER NOT NULL DEFAULT 0, initial_printed_at DATETIME, is_test INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(created_by) REFERENCES users(id),
    FOREIGN KEY(voided_by) REFERENCES users(id)
);

CREATE TABLE journal_voucher_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id INTEGER NOT NULL,
    account_code TEXT NOT NULL, 

    account_name TEXT NOT NULL,
    debit_paise INTEGER NOT NULL DEFAULT 0,
    credit_paise INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (voucher_id) REFERENCES journal_vouchers(id) ON DELETE CASCADE
);

CREATE TABLE journal_vouchers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    voucher_number TEXT NOT NULL UNIQUE,
    voucher_date DATE NOT NULL,
    voucher_type TEXT NOT NULL, 

    reference_id TEXT,
    narration TEXT NOT NULL,
    total_debit_paise INTEGER NOT NULL DEFAULT 0,
    total_credit_paise INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'Posted',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER
);

CREATE TABLE legacy_negative_stock_review (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER NOT NULL,
    original_quantity_grams INTEGER,
    original_quantity_units INTEGER,
    reset_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reconciled INTEGER DEFAULT 0,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id)
);

CREATE TABLE live_animal_sale_deductions (
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

CREATE TABLE live_animal_yield_configs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_key TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    live_tracking_enabled INTEGER NOT NULL DEFAULT 0 CHECK(live_tracking_enabled IN (0, 1)),
    track_byproducts INTEGER NOT NULL DEFAULT 1 CHECK(track_byproducts IN (0, 1)),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    live_variant_id INTEGER REFERENCES product_variants(id),
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, icon_key TEXT NOT NULL DEFAULT 'chicken', unit_name TEXT NOT NULL DEFAULT 'head', show_in_inventory INTEGER NOT NULL DEFAULT 1 CHECK(show_in_inventory IN (0, 1)), stock_mode TEXT NOT NULL DEFAULT 'dual' CHECK(stock_mode IN ('dual', 'weight_only', 'count_only')));

CREATE TABLE live_chicken_batch_adjustments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id INTEGER NOT NULL,
    adjustment_type TEXT NOT NULL CHECK(adjustment_type IN ('mortality', 'correction')),
    weight_delta_grams INTEGER NOT NULL,
    count_delta INTEGER NOT NULL,
    previous_weight_grams INTEGER NOT NULL,
    new_weight_grams INTEGER NOT NULL,
    previous_count INTEGER NOT NULL,
    new_count INTEGER NOT NULL,
    reason_notes TEXT NOT NULL,
    adjusted_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(batch_id) REFERENCES live_chicken_batches(id),
    FOREIGN KEY(adjusted_by) REFERENCES users(id)
);

CREATE TABLE live_chicken_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER,
    purchase_invoice_id INTEGER,
    purchase_date DATETIME NOT NULL,
    cost_per_kg_paise INTEGER NOT NULL DEFAULT 0,
    initial_weight_grams INTEGER NOT NULL,
    initial_count INTEGER NOT NULL,
    remaining_weight_grams INTEGER NOT NULL,
    remaining_count INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'exhausted')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, animal_type TEXT NOT NULL DEFAULT 'chicken', remaining_count_milli INTEGER,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY(purchase_invoice_id) REFERENCES purchase_invoices(id)
);

CREATE TABLE live_chicken_yield_settings (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    yield_enabled INTEGER NOT NULL DEFAULT 1 CHECK(yield_enabled IN (0, 1)),
    track_liver_gizzard INTEGER NOT NULL DEFAULT 1 CHECK(track_liver_gizzard IN (0, 1)),
    whole_chicken_grams INTEGER NOT NULL DEFAULT 625,
    liver_grams INTEGER NOT NULL DEFAULT 30,
    gizzard_grams INTEGER NOT NULL DEFAULT 40,
    custom_product_ratios_json TEXT DEFAULT '{}',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE live_yield_ratio_audit (
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

CREATE TABLE live_yield_ratios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    animal_key TEXT NOT NULL,
    product_id INTEGER NOT NULL REFERENCES products(id),
    variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    role TEXT NOT NULL DEFAULT 'DIRECT' CHECK(role IN ('MAIN_CUT', 'BYPRODUCT', 'DIRECT')),
    grams_per_kg_live INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(animal_key, variant_id)
);

CREATE TABLE locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE market_price_fetch_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER,
  product_variant_id INTEGER,
  product_name TEXT,
  fetched_rate_paise INTEGER,
  applied INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  error_message TEXT,
  fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE market_price_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  product_variant_id INTEGER,
  product_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  parser_type TEXT NOT NULL DEFAULT 'regex', -- 'css' | 'regex' | 'json'
  parser_rule TEXT NOT NULL,
  schedule_time TEXT DEFAULT '07:00',
  auto_apply INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_fetched_at DATETIME,
  last_fetched_paise INTEGER,
  last_status TEXT DEFAULT 'idle',
  last_error TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

CREATE TABLE oversold_unreconciled (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    invoice_item_id INTEGER NOT NULL,
    product_variant_id INTEGER NOT NULL,
    shortfall_grams INTEGER,
    shortfall_units INTEGER,
    manager_id INTEGER NOT NULL,
    override_reason TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id),
    FOREIGN KEY(invoice_item_id) REFERENCES invoice_items(id),
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id),
    FOREIGN KEY(manager_id) REFERENCES users(id)
);

CREATE TABLE payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_receipt_id INTEGER NOT NULL,
    bill_type TEXT NOT NULL CHECK(bill_type IN ('purchase_invoice', 'sale_invoice')),
    bill_id INTEGER NOT NULL,
    bill_number TEXT NOT NULL,
    allocated_amount_paise INTEGER NOT NULL CHECK(allocated_amount_paise > 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(payment_receipt_id) REFERENCES payments_receipts(id) ON DELETE CASCADE
);

CREATE TABLE payment_methods_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method_key TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  method_group TEXT NOT NULL DEFAULT 'upi', -- 'cash' | 'upi' | 'card' | 'bank' | 'other'
  is_enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 10,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('cash', 'upi', 'card', 'split')),
    amount_paise INTEGER NOT NULL,
    reference_number TEXT,
    received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE payments_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_number TEXT UNIQUE NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('payment', 'receipt')),
    payment_method TEXT NOT NULL CHECK(payment_method IN ('cash', 'bank', 'upi', 'card')),
    party_type TEXT CHECK(party_type IN ('supplier', 'customer', 'other')),
    party_id INTEGER,
    party_name TEXT,
    category TEXT,
    amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
    allocated_amount_paise INTEGER NOT NULL DEFAULT 0,
    unallocated_amount_paise INTEGER NOT NULL DEFAULT 0,
    payment_date TEXT NOT NULL,
    narration TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, idempotency_key TEXT, is_reversed INTEGER NOT NULL DEFAULT 0, reversed_at DATETIME, reversal_reason TEXT, reversed_by INTEGER, reversed_payment_id INTEGER, reference_number TEXT,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE payroll_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payroll_run_id INTEGER REFERENCES payroll_runs(id),
  store_id INTEGER NOT NULL DEFAULT 1,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  month_year TEXT NOT NULL, 

  salary_type TEXT NOT NULL DEFAULT 'Monthly', 

  total_days_in_month INTEGER NOT NULL DEFAULT 30,
  worked_days NUMERIC NOT NULL DEFAULT 0,
  present_days NUMERIC NOT NULL DEFAULT 0,
  paid_leave_days NUMERIC NOT NULL DEFAULT 0,
  unpaid_leave_days NUMERIC NOT NULL DEFAULT 0,
  half_days NUMERIC NOT NULL DEFAULT 0,
  overtime_hours NUMERIC NOT NULL DEFAULT 0,
  basic_salary_paise INTEGER NOT NULL DEFAULT 0,
  fixed_allowances_paise INTEGER NOT NULL DEFAULT 0,
  fixed_allowances_breakdown_json TEXT,
  overtime_amount_paise INTEGER NOT NULL DEFAULT 0,
  incentive_amount_paise INTEGER NOT NULL DEFAULT 0,
  reimbursable_expenses_paise INTEGER NOT NULL DEFAULT 0,
  gross_salary_paise INTEGER NOT NULL DEFAULT 0,
  advance_recovery_paise INTEGER NOT NULL DEFAULT 0,
  unpaid_leave_deduction_paise INTEGER NOT NULL DEFAULT 0,
  other_deductions_paise INTEGER NOT NULL DEFAULT 0,
  total_deductions_paise INTEGER NOT NULL DEFAULT 0,
  net_salary_paise INTEGER NOT NULL DEFAULT 0,
  is_overridden INTEGER NOT NULL DEFAULT 0,
  original_net_salary_paise INTEGER,
  override_reason TEXT,
  status TEXT NOT NULL DEFAULT 'Draft', 

  payment_method TEXT, 

  payment_date DATE,
  payment_reference TEXT,
  paid_by INTEGER,
  payment_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, start_date DATE DEFAULT NULL, end_date DATE DEFAULT NULL, cycle_type TEXT NOT NULL DEFAULT 'Monthly',
  UNIQUE(employee_id, month_year, is_active)
);

CREATE TABLE payroll_reversals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  payroll_item_id INTEGER NOT NULL REFERENCES payroll_items(id),
  reversed_amount_paise INTEGER NOT NULL,
  reversal_reason TEXT NOT NULL,
  reversed_by INTEGER NOT NULL,
  reversed_by_name TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payroll_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  month_year TEXT NOT NULL UNIQUE, 

  status TEXT NOT NULL DEFAULT 'Draft', 

  total_employees INTEGER NOT NULL DEFAULT 0,
  total_gross_paise INTEGER NOT NULL DEFAULT 0,
  total_deductions_paise INTEGER NOT NULL DEFAULT 0,
  total_net_paise INTEGER NOT NULL DEFAULT 0,
  approved_by INTEGER,
  approved_at DATETIME,
  locked_by INTEGER,
  locked_at DATETIME,
  notes TEXT,
  created_by INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, start_date DATE DEFAULT NULL, end_date DATE DEFAULT NULL, cycle_type TEXT NOT NULL DEFAULT 'Monthly');

CREATE TABLE pending_stock_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    invoice_item_id INTEGER NOT NULL,
    product_variant_id INTEGER NOT NULL,
    quantity_grams INTEGER,
    quantity_units INTEGER,
    event_type TEXT NOT NULL CHECK(event_type IN ('sale_pending_deduction', 'sale_reversal')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY(invoice_item_id) REFERENCES invoice_items(id) ON DELETE CASCADE,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id),
    CHECK(
        (quantity_grams IS NOT NULL AND quantity_units IS NULL) OR 
        (quantity_grams IS NULL AND quantity_units IS NOT NULL)
    )
);

CREATE TABLE physical_stock_audit_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES physical_stock_audit_sessions(id) ON DELETE CASCADE,
    product_variant_id INTEGER NOT NULL REFERENCES product_variants(id),
    unit_type TEXT NOT NULL DEFAULT 'weight',
    system_quantity_grams INTEGER,
    system_quantity_units INTEGER,
    counted_quantity_grams INTEGER,
    counted_quantity_units INTEGER,
    variance_grams INTEGER,
    variance_units INTEGER,
    unit_cost_paise INTEGER DEFAULT 0,
    variance_value_paise INTEGER DEFAULT 0,
    reason_code TEXT CHECK(reason_code IS NULL OR reason_code IN ('cutting_loss', 'wastage', 'spoilage', 'measurement_error', 'unrecorded_sale', 'unrecorded_purchase', 'other')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE physical_stock_audit_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'counting', 'submitted', 'reviewed', 'approved', 'applied', 'cancelled')),
    branch_id INTEGER DEFAULT 1,
    storage_location_id INTEGER REFERENCES storage_locations(id),
    counted_by INTEGER REFERENCES users(id),
    reviewed_by INTEGER REFERENCES users(id),
    approved_by INTEGER REFERENCES users(id),
    applied_by INTEGER REFERENCES users(id),
    total_items_counted INTEGER DEFAULT 0,
    total_variance_grams INTEGER DEFAULT 0,
    total_variance_units INTEGER DEFAULT 0,
    total_variance_value_paise INTEGER DEFAULT 0,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME,
    approved_at DATETIME,
    applied_at DATETIME
);

CREATE TABLE pos_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    cashier_id INTEGER NOT NULL,
    opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    opening_cash_paise INTEGER NOT NULL DEFAULT 0,
    closing_cash_paise INTEGER,
    expected_cash_paise INTEGER,
    variance_paise INTEGER,
    status TEXT NOT NULL DEFAULT 'Open', 

    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME
, opening_denominations_json TEXT, closing_denominations_json TEXT, variance_reason TEXT, payment_methods_breakdown_json TEXT DEFAULT NULL);

CREATE TABLE processing_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_number TEXT UNIQUE NOT NULL,
    batch_id INTEGER NOT NULL,
    live_weight_grams INTEGER NOT NULL,
    live_count INTEGER NOT NULL,
    processed_weight_grams INTEGER NOT NULL,
    yield_ratio_used REAL NOT NULL,
    cost_per_gram_processed_paise REAL NOT NULL DEFAULT 0,
    processed_variant_id INTEGER,
    destination_batch_id INTEGER,
    created_by INTEGER NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(batch_id) REFERENCES live_chicken_batches(id),
    FOREIGN KEY(processed_variant_id) REFERENCES product_variants(id),
    FOREIGN KEY(destination_batch_id) REFERENCES product_stock_batches(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE product_stock_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_number TEXT UNIQUE NOT NULL,
  product_variant_id INTEGER NOT NULL,
  received_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  initial_quantity_grams INTEGER,
  initial_quantity_units INTEGER,
  current_quantity_grams INTEGER,
  current_quantity_units INTEGER,
  unit_cost_paise INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL CHECK(source_type IN ('purchase', 'yield_processing', 'initial_balance', 'adjustment')),
  source_ref_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'exhausted')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, location_id INTEGER NOT NULL DEFAULT 1, initial_count REAL, current_count REAL, original_batch_date DATETIME DEFAULT NULL, original_batch_id INTEGER DEFAULT NULL, storage_location_id INTEGER DEFAULT 1,
  FOREIGN KEY(product_variant_id) REFERENCES product_variants(id)
);

CREATE TABLE product_tracking_change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    old_track_in_inventory INTEGER NOT NULL,
    new_track_in_inventory INTEGER NOT NULL,
    reason TEXT NOT NULL,
    changed_by INTEGER,
    changed_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY(changed_by) REFERENCES users(id)
);

CREATE TABLE product_variant_rate_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER NOT NULL,
    rate_paise_per_unit INTEGER NOT NULL,
    effective_from DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    set_by INTEGER NOT NULL,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    FOREIGN KEY(set_by) REFERENCES users(id)
);

CREATE TABLE product_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    variant_name TEXT NOT NULL,
    current_rate_paise_per_unit INTEGER NOT NULL,
    effective_from DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0, 1)), cost_price_paise_per_unit INTEGER DEFAULT 0, barcode TEXT DEFAULT NULL, last_purchase_cost INTEGER DEFAULT 0, weighted_average_cost INTEGER DEFAULT 0, fifo_current_cost INTEGER DEFAULT 0, current_stock INTEGER DEFAULT 0, inventory_value INTEGER DEFAULT 0, is_processed_cut INTEGER DEFAULT 0 CHECK(is_processed_cut IN (0, 1)), safety_threshold_grams INTEGER DEFAULT 0, safety_threshold_units INTEGER DEFAULT 0, unit_type TEXT DEFAULT 'weight', parent_variant_id INTEGER DEFAULT NULL REFERENCES product_variants(id) ON DELETE SET NULL, yield_ratio REAL DEFAULT NULL, product_code TEXT, track_in_inventory INTEGER DEFAULT 1, last_purchase_cost_paise INTEGER DEFAULT 0, unit_cost_paise_cache INTEGER DEFAULT 0, paper_rate_paise INTEGER DEFAULT 0, wholesale_rate_paise INTEGER DEFAULT 0, sale_rate_type TEXT DEFAULT 'FixedRate',
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(product_id, variant_name)
);

CREATE TABLE "products" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    unit_type TEXT NOT NULL CHECK(unit_type IN ('weight', 'piece', 'live_dual')),
    category TEXT NOT NULL,
    is_processed_cut INTEGER DEFAULT 0 CHECK(is_processed_cut IN (0, 1)),
    is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, stock_classification TEXT NOT NULL DEFAULT 'refrigerator_direct', subcategory TEXT DEFAULT '', is_inventory_tracked INTEGER NOT NULL DEFAULT 1, paper_rate_paise INTEGER DEFAULT 0, wholesale_rate_paise INTEGER DEFAULT 0, sale_rate_type TEXT DEFAULT 'FixedRate', is_master_stock_item INTEGER DEFAULT 1, wastage REAL DEFAULT 0.0);

CREATE TABLE purchase_edit_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_invoice_id INTEGER NOT NULL,
    edited_by INTEGER NOT NULL,
    edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    edit_reason TEXT NOT NULL,
    old_values_json TEXT NOT NULL,
    new_values_json TEXT NOT NULL,
    FOREIGN KEY(purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY(edited_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE purchase_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_invoice_id INTEGER NOT NULL,
    product_variant_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_paise INTEGER NOT NULL,
    gst_rate_bps INTEGER DEFAULT 0,
    gst_amount_paise INTEGER DEFAULT 0,
    total_amount_paise INTEGER NOT NULL,
    FOREIGN KEY(purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT
);

CREATE TABLE purchase_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT UNIQUE NOT NULL,
    supplier_invoice_number TEXT NOT NULL,
    purchase_order_id INTEGER,
    goods_receipt_id INTEGER,
    supplier_id INTEGER NOT NULL,
    invoice_date TEXT NOT NULL,
    subtotal_paise INTEGER NOT NULL,
    gst_paise INTEGER DEFAULT 0,
    cgst_paise INTEGER DEFAULT 0,
    sgst_paise INTEGER DEFAULT 0,
    igst_paise INTEGER DEFAULT 0,
    freight_charges_paise INTEGER DEFAULT 0,
    loading_charges_paise INTEGER DEFAULT 0,
    packing_charges_paise INTEGER DEFAULT 0,
    other_charges_paise INTEGER DEFAULT 0,
    discount_paise INTEGER DEFAULT 0,
    round_off_paise INTEGER DEFAULT 0,
    total_amount_paise INTEGER NOT NULL,
    outstanding_amount_paise INTEGER NOT NULL,
    payment_status TEXT NOT NULL CHECK (payment_status IN ('unpaid', 'partially_paid', 'paid')),
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending_approval', 'approved', 'rejected')), file_path TEXT, purchase_ref_number TEXT, expected_payment_date TEXT, paid_amount_paise INTEGER DEFAULT 0, due_date TEXT DEFAULT NULL, updated_at DATETIME,
    FOREIGN KEY(purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL,
    FOREIGN KEY(goods_receipt_id) REFERENCES goods_receipts(id) ON DELETE SET NULL,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE "purchase_order_items" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL,
    product_variant_id INTEGER NOT NULL,
    quantity_ordered INTEGER NOT NULL,
    quantity_received INTEGER DEFAULT 0,
    unit_type TEXT CHECK (unit_type IN ('weight', 'piece', 'live_dual')),
    unit_price_paise INTEGER NOT NULL,
    subtotal_paise INTEGER NOT NULL,
    FOREIGN KEY(purchase_order_id) REFERENCES purchase_orders(id) ON DELETE CASCADE,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT
);

CREATE TABLE purchase_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    po_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL,
    order_date TEXT NOT NULL,
    expected_delivery_date TEXT,
    status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'approved', 'received', 'closed', 'cancelled')),
    total_amount_paise INTEGER DEFAULT 0,
    notes TEXT,
    created_by INTEGER NOT NULL,
    approved_by INTEGER,
    approved_at TEXT,
    revision_number INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY(created_by) REFERENCES users(id),
    FOREIGN KEY(approved_by) REFERENCES users(id)
);

CREATE TABLE purchase_return_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_return_id INTEGER NOT NULL,
    product_variant_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price_paise INTEGER NOT NULL,
    gst_amount_paise INTEGER DEFAULT 0,
    total_amount_paise INTEGER NOT NULL,
    FOREIGN KEY(purchase_return_id) REFERENCES purchase_returns(id) ON DELETE CASCADE,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT
);

CREATE TABLE purchase_returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    return_number TEXT UNIQUE NOT NULL,
    purchase_invoice_id INTEGER,
    supplier_id INTEGER NOT NULL,
    return_date TEXT NOT NULL,
    reason TEXT,
    total_refund_amount_paise INTEGER NOT NULL,
    resolved_via TEXT CHECK (resolved_via IN ('refund', 'replacement', 'debit_note')),
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE SET NULL,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE purchase_sequences (
    year TEXT PRIMARY KEY,
    last_seq INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE "purchases" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    product_variant_id INTEGER NOT NULL,
    quantity_grams INTEGER,
    quantity_units INTEGER,
    cost_paise INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
    FOREIGN KEY(created_by) REFERENCES users(id),
    CHECK(
        (quantity_grams IS NOT NULL AND quantity_units IS NULL) OR 
        (quantity_grams IS NULL AND quantity_units IS NOT NULL)
    )
);

CREATE TABLE recent_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  report_id TEXT NOT NULL,
  report_name TEXT NOT NULL,
  category TEXT NOT NULL,
  last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  parameters_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, report_id)
);

CREATE TABLE refrigerator_removal_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    refrigerator_stock_id INTEGER NOT NULL,
    removal_type TEXT NOT NULL CHECK(removal_type IN ('sold', 'transfer', 'wastage', 'staff')),
    quantity_grams INTEGER,
    count INTEGER,
    invoice_id INTEGER,
    invoice_item_id INTEGER,
    staff_name TEXT,
    reason_notes TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(refrigerator_stock_id) REFERENCES refrigerator_stock(id),
    FOREIGN KEY(invoice_id) REFERENCES invoices(id),
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE refrigerator_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name TEXT NOT NULL,
    item_type TEXT NOT NULL CHECK(item_type IN ('leg', 'brain', 'head', 'liver', 'meat', 'custom')),
    unit_type TEXT NOT NULL CHECK(unit_type IN ('weight', 'piece')),
    initial_quantity_grams INTEGER,
    initial_count INTEGER,
    quantity_grams INTEGER,
    count INTEGER,
    cost_paise_per_unit INTEGER DEFAULT 0,
    selling_rate_paise INTEGER DEFAULT 0,
    date_added DATE NOT NULL,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'removed')),
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE report_alert_thresholds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  threshold_value REAL NOT NULL,
  unit TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1 CHECK(is_enabled IN (0, 1)),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE report_favorite_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  report_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, report_id)
);

CREATE TABLE role_permissions (
    role TEXT NOT NULL,
    permission_key TEXT NOT NULL,
    allowed INTEGER NOT NULL DEFAULT 1 CHECK(allowed IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role, permission_key)
);

CREATE TABLE sale_edit_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    edited_by INTEGER NOT NULL,
    edit_reason TEXT NOT NULL,
    old_values_json TEXT NOT NULL,
    new_values_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY(edited_by) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE sales_return_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_return_id INTEGER NOT NULL,
  invoice_item_id INTEGER NOT NULL,
  product_variant_id INTEGER NOT NULL,
  quantity_grams INTEGER,
  quantity_units INTEGER,
  unit_rate_paise INTEGER NOT NULL,
  refund_total_paise INTEGER NOT NULL, resolution_type TEXT DEFAULT 'refunded' CHECK(resolution_type IN ('refunded', 'replaced')), replacement_variant_id INTEGER REFERENCES product_variants(id),
  FOREIGN KEY(sales_return_id) REFERENCES sales_returns(id) ON DELETE CASCADE,
  FOREIGN KEY(invoice_item_id) REFERENCES invoice_items(id),
  FOREIGN KEY(product_variant_id) REFERENCES product_variants(id)
);

CREATE TABLE sales_returns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  return_number TEXT UNIQUE NOT NULL,
  invoice_id INTEGER NOT NULL,
  customer_id INTEGER,
  refund_method TEXT NOT NULL CHECK(refund_method IN ('cash', 'credit_balance', 'credit_note')),
  total_refund_paise INTEGER NOT NULL,
  reason TEXT NOT NULL,
  processed_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, resolution_type TEXT DEFAULT 'refunded' CHECK(resolution_type IN ('refunded', 'replaced')), replacement_variant_id INTEGER REFERENCES product_variants(id), replacement_quantity REAL,
  FOREIGN KEY(invoice_id) REFERENCES invoices(id),
  FOREIGN KEY(customer_id) REFERENCES customers(id),
  FOREIGN KEY(processed_by) REFERENCES users(id)
);

CREATE TABLE saved_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Custom',
  data_source TEXT NOT NULL,
  configuration_json TEXT NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0, 1)),
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE shift_cash_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  session_id INTEGER NOT NULL,
  movement_type TEXT NOT NULL CHECK(movement_type IN ('cash_in', 'cash_out', 'expense')),
  category TEXT NOT NULL,
  amount_paise INTEGER NOT NULL CHECK(amount_paise > 0),
  reason TEXT NOT NULL,
  added_by TEXT,
  taken_by TEXT,
  expense_id INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES pos_sessions(id),
  FOREIGN KEY(expense_id) REFERENCES expenses(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE shift_closing_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  session_id INTEGER NOT NULL UNIQUE,
  expected_cash_paise INTEGER NOT NULL,
  physical_cash_paise INTEGER NOT NULL,
  difference_paise INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('matched', 'explained_difference', 'corrected')),
  declared_reason TEXT,
  closing_denominations_json TEXT,
  non_cash_summary_json TEXT,
  closed_by INTEGER NOT NULL,
  closed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES pos_sessions(id),
  FOREIGN KEY(closed_by) REFERENCES users(id)
);

CREATE TABLE shift_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL DEFAULT 1,
  session_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('cash_movement', 'closing_record', 'session_status')),
  entity_id INTEGER NOT NULL,
  field_name TEXT NOT NULL,
  original_value TEXT,
  new_value TEXT,
  reason TEXT NOT NULL,
  authorized_by INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(session_id) REFERENCES pos_sessions(id),
  FOREIGN KEY(authorized_by) REFERENCES users(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE sqlite_sequence(name,seq);

CREATE TABLE state_machine_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL, 

    entity_id INTEGER NOT NULL,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    performed_by INTEGER NOT NULL,
    reason TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE statement_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER REFERENCES statement_transactions(id) ON DELETE CASCADE,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reason TEXT,
  performed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE statement_import_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_name TEXT NOT NULL UNIQUE,
  bank_name TEXT NOT NULL,
  date_col TEXT NOT NULL,
  credit_col TEXT NOT NULL,
  debit_col TEXT,
  ref_col TEXT NOT NULL,
  narration_col TEXT,
  payer_vpa_col TEXT,
  payer_name_col TEXT,
  date_format TEXT NOT NULL DEFAULT 'auto',
  amount_in_paise INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE statement_imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  profile_id INTEGER REFERENCES statement_import_profiles(id) ON DELETE SET NULL,
  shift_date TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  total_credit_paise INTEGER NOT NULL DEFAULT 0,
  total_debit_paise INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  imported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE statement_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_id INTEGER NOT NULL REFERENCES statement_imports(id) ON DELETE CASCADE,
  row_fingerprint TEXT NOT NULL UNIQUE,
  txn_time TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'credit',
  ref_no TEXT,
  narration TEXT,
  payer_vpa TEXT,
  payer_name TEXT,
  status TEXT NOT NULL DEFAULT 'unmatched',
  match_rule TEXT,
  matched_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  matched_payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  matched_at TEXT,
  matched_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "stock_adjustments" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER NOT NULL,
    adjustment_type TEXT NOT NULL,
    quantity_grams INTEGER,
    quantity_units INTEGER,
    quantity_count REAL,
    reason TEXT NOT NULL,
    adjusted_by INTEGER NOT NULL,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    FOREIGN KEY(adjusted_by) REFERENCES users(id)
);

CREATE TABLE "stock_ledger" (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER UNIQUE NOT NULL,
    quantity_grams INTEGER,
    quantity_units INTEGER,
    quantity_count REAL DEFAULT 0,
    safety_threshold_grams INTEGER DEFAULT 5000,
    safety_threshold_units INTEGER DEFAULT 10,
    safety_threshold_count REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, location_id INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE
);

CREATE TABLE stock_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_variant_id INTEGER NOT NULL,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN ('sale_deduction', 'sale_reversal', 'manual_adjustment')),
    quantity_grams INTEGER,
    quantity_units INTEGER,
    reference_id INTEGER NOT NULL, -- references invoice_id or adjustment_id
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE CASCADE,
    CHECK(
        (quantity_grams IS NOT NULL AND quantity_units IS NULL) OR
        (quantity_grams IS NULL AND quantity_units IS NOT NULL)
    )
);

CREATE TABLE stock_transfer_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  product_variant_id INTEGER NOT NULL,
  sent_quantity_grams INTEGER,
  sent_quantity_units INTEGER,
  received_quantity_grams INTEGER,
  received_quantity_units INTEGER,
  shortfall_quantity_grams INTEGER DEFAULT 0,
  shortfall_quantity_units INTEGER DEFAULT 0,
  unit_cost_paise INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(transfer_id) REFERENCES stock_transfers(id) ON DELETE CASCADE,
  FOREIGN KEY(batch_id) REFERENCES product_stock_batches(id),
  FOREIGN KEY(product_variant_id) REFERENCES product_variants(id)
);

CREATE TABLE stock_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_number TEXT UNIQUE NOT NULL,
  from_location_id INTEGER NOT NULL,
  to_location_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_transit', 'received', 'cancelled')),
  initiated_by INTEGER NOT NULL,
  confirmed_by INTEGER,
  notes TEXT,
  discrepancy_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  dispatched_at DATETIME,
  received_at DATETIME,
  FOREIGN KEY(from_location_id) REFERENCES locations(id),
  FOREIGN KEY(to_location_id) REFERENCES locations(id),
  FOREIGN KEY(initiated_by) REFERENCES users(id),
  FOREIGN KEY(confirmed_by) REFERENCES users(id)
);

CREATE TABLE storage_locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    storage_type TEXT NOT NULL DEFAULT 'fridge' CHECK(storage_type IN ('fridge', 'freezer', 'ambient', 'processing', 'counter')),
    capacity_kg REAL NOT NULL DEFAULT 100.0,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'archived')),
    branch_id INTEGER DEFAULT 1,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE store_cash_box (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    store_id INTEGER NOT NULL DEFAULT 1,
    session_id INTEGER,
    type TEXT NOT NULL, 

    amount_paise INTEGER NOT NULL,
    category TEXT NOT NULL,
    reason TEXT NOT NULL,
    performed_by INTEGER NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME, direction TEXT NOT NULL DEFAULT 'IN' CHECK(direction IN ('IN', 'OUT')), reference_type TEXT, reference_id TEXT, invoice_id INTEGER, denomination_snapshot_json TEXT, expected_before_paise INTEGER, expected_after_paise INTEGER,
    FOREIGN KEY (session_id) REFERENCES pos_sessions(id)
);

CREATE TABLE stores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    address TEXT,
    phone TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    updated_by INTEGER,
    deleted_at DATETIME
);

CREATE TABLE supplier_activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    action_type TEXT NOT NULL,
    performed_by INTEGER NOT NULL,
    details TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY(performed_by) REFERENCES users(id)
);

CREATE TABLE supplier_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    address_type TEXT CHECK (address_type IN ('billing', 'shipping', 'warehouse')),
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city TEXT,
    state TEXT,
    pincode TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

CREATE TABLE supplier_bank_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    bank_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    ifsc_code TEXT NOT NULL,
    account_holder_name TEXT NOT NULL,
    upi_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

CREATE TABLE supplier_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE supplier_contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    contact_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    role TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

CREATE TABLE supplier_contracts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    contract_number TEXT UNIQUE,
    start_date TEXT NOT NULL,
    end_date TEXT,
    terms TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'terminated')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);

CREATE TABLE supplier_credit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credit_note_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL,
    amount_paise INTEGER NOT NULL,
    reason TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE supplier_debit_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debit_note_number TEXT UNIQUE NOT NULL,
    supplier_id INTEGER NOT NULL,
    amount_paise INTEGER NOT NULL,
    reason TEXT,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE supplier_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    document_name TEXT NOT NULL,
    document_type TEXT,
    file_path TEXT NOT NULL,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

CREATE TABLE supplier_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    entry_date TEXT NOT NULL,
    ref_type TEXT NOT NULL CHECK (ref_type IN ('opening_balance', 'purchase_invoice', 'payment', 'purchase_return', 'credit_note', 'debit_note', 'adjustment', 'write_off')),
    ref_id INTEGER,
    description TEXT NOT NULL,
    debit_paise INTEGER DEFAULT 0,
    credit_paise INTEGER DEFAULT 0,
    running_balance_paise INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, status TEXT NOT NULL DEFAULT 'approved' CHECK(status IN ('pending_approval', 'approved', 'rejected')),
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT
);

CREATE TABLE supplier_payment_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_payment_id INTEGER NOT NULL,
    purchase_invoice_id INTEGER NOT NULL,
    allocated_amount_paise INTEGER NOT NULL,
    allocated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_payment_id) REFERENCES supplier_payments(id) ON DELETE CASCADE,
    FOREIGN KEY(purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE
);

CREATE TABLE supplier_payment_terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER UNIQUE NOT NULL,
    payment_terms_days INTEGER DEFAULT 30,
    grace_period_days INTEGER DEFAULT 5,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
);

CREATE TABLE supplier_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    amount_paise INTEGER NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'upi', 'card', 'cheque', 'bank_transfer')),
    reference_number TEXT,
    cheque_number TEXT,
    cheque_date TEXT,
    bank_name TEXT,
    payment_date TEXT NOT NULL,
    notes TEXT,
    is_advance INTEGER DEFAULT 0 CHECK (is_advance IN (0, 1)),
    unallocated_amount_paise INTEGER DEFAULT 0,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY(created_by) REFERENCES users(id)
);

CREATE TABLE supplier_price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    product_variant_id INTEGER NOT NULL,
    unit_price_paise INTEGER NOT NULL,
    effective_date TEXT NOT NULL,
    purchase_invoice_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
    FOREIGN KEY(product_variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT,
    FOREIGN KEY(purchase_invoice_id) REFERENCES purchase_invoices(id) ON DELETE SET NULL
);

CREATE TABLE supplier_rating_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER NOT NULL,
    rating REAL NOT NULL,
    rated_by INTEGER NOT NULL,
    comments TEXT,
    rated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
    FOREIGN KEY(rated_by) REFERENCES users(id)
);

CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    company_name TEXT NOT NULL,
    owner_name TEXT,
    gstin TEXT,
    pan TEXT,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    category_id INTEGER,
    is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
    is_preferred INTEGER DEFAULT 0 CHECK (is_preferred IN (0, 1)),
    credit_limit_paise INTEGER DEFAULT 0,
    outstanding_balance_paise INTEGER DEFAULT 0,
    opening_balance_paise INTEGER DEFAULT 0,
    opening_balance_date TEXT,
    preferred_payment_method TEXT,
    notes TEXT,
    tags TEXT,
    rating REAL DEFAULT 5.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP, salutation TEXT, first_name TEXT, last_name TEXT, display_name TEXT, work_phone TEXT, mobile_phone TEXT, payment_terms TEXT, currency TEXT DEFAULT 'INR', billing_address_json TEXT, bank_name TEXT, account_number TEXT, ifsc_code TEXT, remarks TEXT, document_paths_json TEXT, name TEXT, contact TEXT, contact_person TEXT, linked_customer_id INTEGER DEFAULT NULL,
    FOREIGN KEY(category_id) REFERENCES supplier_categories(id) ON DELETE SET NULL
);

CREATE TABLE system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('ADMIN', 'MANAGER', 'CASHIER')),
    is_active INTEGER DEFAULT 1 NOT NULL CHECK(is_active IN (0, 1)),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, emp_code TEXT, pin_code TEXT, full_name TEXT);

CREATE TABLE whatsapp_attempt_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  phone_suffix TEXT NOT NULL,
  attempt_type TEXT NOT NULL DEFAULT 'wa_me_link',
  status TEXT NOT NULL DEFAULT 'attempted',
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE whatsapp_send_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  message_type TEXT NOT NULL, 
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', 
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE yield_processing_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  yield_run_id INTEGER NOT NULL,
  output_variant_id INTEGER NOT NULL,
  output_quantity_grams INTEGER,
  output_quantity_units INTEGER,
  allocated_cost_paise INTEGER NOT NULL DEFAULT 0,
  unit_cost_paise INTEGER NOT NULL DEFAULT 0,
  output_batch_id INTEGER,
  FOREIGN KEY(yield_run_id) REFERENCES yield_processing_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(output_variant_id) REFERENCES product_variants(id),
  FOREIGN KEY(output_batch_id) REFERENCES product_stock_batches(id)
);

CREATE TABLE yield_processing_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_number TEXT UNIQUE NOT NULL,
  raw_input_variant_id INTEGER NOT NULL,
  input_quantity_grams INTEGER,
  input_quantity_units INTEGER,
  total_input_cost_paise INTEGER NOT NULL DEFAULT 0,
  wastage_quantity_grams INTEGER NOT NULL DEFAULT 0,
  wastage_quantity_units INTEGER NOT NULL DEFAULT 0,
  processed_by INTEGER NOT NULL,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, input_count REAL,
  FOREIGN KEY(raw_input_variant_id) REFERENCES product_variants(id),
  FOREIGN KEY(processed_by) REFERENCES users(id)
);

CREATE VIEW v_customer_purchase_history AS
SELECT 
  i.id AS invoice_id,
  i.invoice_number,
  i.customer_id,
  i.total_paise,
  i.total_paise AS total_amount_paise,
  i.payment_status,
  COALESCE(i.invoice_date, i.created_at) AS invoice_date
FROM invoices i;
