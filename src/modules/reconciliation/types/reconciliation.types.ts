// reconciliation.types.ts
// Shared frontend/backend types for Bank & UPI Statement Reconciliation (Phase 3B)

export interface StatementImportProfile {
  id: number;
  profile_name: string;
  bank_name: string;
  date_col: string;
  credit_col: string;
  debit_col?: string | null;
  ref_col: string;
  narration_col?: string | null;
  payer_vpa_col?: string | null;
  payer_name_col?: string | null;
  date_format: string;
  amount_in_paise: number;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface StatementTransactionRow {
  id: number;
  import_id: number;
  row_fingerprint: string;
  txn_time: string;
  amount_paise: number;
  type: 'credit' | 'debit';
  ref_no: string | null;
  narration: string | null;
  payer_vpa: string | null;
  payer_name: string | null;
  status: 'matched' | 'unmatched' | 'review_needed' | 'not_a_sale';
  match_rule: string | null;
  matched_invoice_id: number | null;
  matched_payment_id: number | null;
  matched_at: string | null;
  notes: string | null;
  invoice_number?: string | null;
  customer_id?: number | null;
  customer_name?: string | null;
}

export interface UnmatchedBill {
  invoice_id: number;
  invoice_number: string;
  created_at: string;
  customer_id: number | null;
  customer_name: string | null;
  payment_method: string;
  amount_paise: number;
  reference_number: string | null;
}

export interface ReconciliationResult {
  import_id: number;
  file_name: string;
  shift_date: string;
  total_rows: number;
  matched: StatementTransactionRow[];
  unmatched_bills: UnmatchedBill[];
  unmatched_credits: StatementTransactionRow[];
  review_queue: Array<StatementTransactionRow & { candidate_invoices?: any[] }>;
  summary: {
    total_billed_upi_card_paise: number;
    total_matched_paise: number;
    unmatched_bills_paise: number;
    unmatched_credits_paise: number;
    difference_paise: number;
    difference_status: 'balanced' | 'surplus' | 'shortfall';
  };
}
