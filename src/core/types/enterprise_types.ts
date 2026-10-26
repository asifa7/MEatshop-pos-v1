export interface Employee {
  id: number;
  store_id: number;
  emp_code: string;
  full_name: string;
  gender: string;
  dob: string | null;
  mobile: string;
  email: string | null;
  address: string | null;
  emergency_contact: string | null;
  joining_date: string;
  department: string;
  designation: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'ACCOUNTANT' | 'STOREKEEPER' | 'HR';
  employment_type: string;
  shift: string;
  status: 'Active' | 'Inactive' | 'On-Leave' | 'Terminated';
  aadhaar_number: string | null;
  pan_number: string | null;
  bank_account: string | null;
  ifsc_code: string | null;
  upi_id: string | null;
  basic_salary_paise: number;
  hra_paise: number;
  allowance_paise: number;
  is_active: number;
  created_at: string;
}

export interface EmployeeAttendance {
  id: number;
  employee_id: number;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: 'Present' | 'Absent' | 'Late' | 'Half_Day' | 'Holiday' | 'Weekly_Off';
  working_hours: number;
  overtime_hours: number;
  notes: string | null;
}

export interface EmployeeLeave {
  id: number;
  employee_id: number;
  leave_type: 'Sick' | 'Casual' | 'Paid' | 'Emergency' | 'Unpaid';
  start_date: string;
  end_date: string;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  approved_by: number | null;
}

export interface EmployeePayroll {
  id: number;
  employee_id: number;
  month_year: string;
  basic_paise: number;
  hra_paise: number;
  allowance_paise: number;
  incentive_paise: number;
  bonus_paise: number;
  overtime_paise: number;
  pf_deduction_paise: number;
  esi_deduction_paise: number;
  tax_deduction_paise: number;
  advance_deduction_paise: number;
  net_salary_paise: number;
  payment_status: 'Pending' | 'Paid';
  paid_at: string | null;
}

export interface PosSession {
  id: number;
  store_id: number;
  cashier_id: number;
  opened_at: string;
  closed_at: string | null;
  opening_cash_paise: number;
  closing_cash_paise: number | null;
  expected_cash_paise: number | null;
  variance_paise: number | null;
  status: 'Open' | 'Closed' | 'Reconciled';
  notes: string | null;
}

export interface Expense {
  id: number;
  category_id: number;
  category_name?: string;
  vendor_name: string | null;
  employee_id?: number | null;
  employee_name?: string | null;
  photo_url?: string | null;
  amount_paise: number;
  gst_paise: number;
  payment_method: string;
  expense_date: string;
  notes: string | null;
  status: 'Pending' | 'Approved' | 'Rejected';
  created_at: string;
}

export type ShiftMovementType = 'cash_in' | 'cash_out' | 'expense';

export interface ShiftCashMovement {
  id: number;
  store_id: number;
  session_id: number;
  movement_type: ShiftMovementType;
  category: string;
  amount_paise: number;
  reason: string;
  added_by: string | null;
  taken_by: string | null;
  expense_id: number | null;
  is_active: number;
  created_by: number;
  created_by_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ShiftClosingRecord {
  id: number;
  store_id: number;
  session_id: number;
  expected_cash_paise: number;
  physical_cash_paise: number;
  difference_paise: number;
  status: 'matched' | 'explained_difference' | 'corrected';
  declared_reason: string | null;
  closing_denominations_json: string | null;
  non_cash_summary_json: string | null;
  closed_by: number;
  closed_by_name?: string;
  closed_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftCorrection {
  id: number;
  store_id: number;
  session_id: number;
  entity_type: 'cash_movement' | 'closing_record' | 'session_status';
  entity_id: number;
  field_name: string;
  original_value: string | null;
  new_value: string | null;
  reason: string;
  authorized_by: number;
  authorized_by_name?: string;
  created_by: number;
  created_by_name?: string;
  created_at: string;
}

export interface ShiftSummaryItem {
  id: number;
  session_id: number;
  cashier_id: number;
  cashier_name: string;
  cashier_code: string;
  opened_at: string;
  closed_at: string | null;
  status: 'Open' | 'Closed';
  reconciliation_status: 'Open' | 'matched' | 'explained_difference' | 'corrected';
  opening_cash_paise: number;
  cash_sales_paise: number;
  cash_in_paise: number;
  cash_expenses_paise: number;
  cash_refunds_paise: number;
  cash_out_paise: number;
  expected_cash_paise: number;
  physical_cash_paise: number | null;
  difference_paise: number | null;
  declared_reason: string | null;
  has_corrections: number;
}

export interface DailyMarketPrice {
  id: number;
  date: string;
  product_name: string;
  grade: string;
  market_rate_paise: number;
  wholesale_rate_paise: number;
  retail_rate_paise: number;
  selling_rate_paise: number;
  expected_margin_percent: number;
  supplier_name: string | null;
  notes: string | null;
}

export interface EggMarketPrice {
  id: number;
  date: string;
  egg_type: 'Country' | 'Farm' | 'Brown' | 'Duck';
  tray_price_paise: number;
  single_price_paise: number;
  wholesale_price_paise: number;
  retail_price_paise: number;
}

export interface AccountingLedgerEntry {
  id: number;
  date: string;
  account_type: 'Cash' | 'Bank' | 'Sales' | 'Purchase' | 'Expense' | 'Supplier' | 'Customer' | 'Employee_Advance' | 'Variance';
  reference_id: string | null;
  description: string;
  debit_paise: number;
  credit_paise: number;
  balance_paise: number;
  created_at: string;
}

export interface EnterpriseAuditLog {
  id: number;
  user_id: number;
  username: string;
  module: string;
  action: string;
  description: string;
  created_at: string;
}
