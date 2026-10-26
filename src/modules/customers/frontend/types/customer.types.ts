// customer.types.ts
// Frontend-safe type definitions for Customer A/R module

export interface CustomerGroup {
  id: number;
  name: string;
  description: string | null;
  default_credit_limit_paise: number;
  default_discount_percent: number;
}

export interface Customer {
  id: number;
  customer_code: string;
  name: string;
  business_name: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  phone2: string | null;
  whatsapp: string | null;
  email: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_pincode: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_pincode: string | null;
  delivery_notes: string | null;
  group_id: number | null;
  group_name: string | null;
  category: CustomerCategory;
  status?: 'active' | 'inactive' | 'blocked' | 'merged';
  merged_into_customer_id?: number | null;
  customer_segment?: CustomerSegmentType;
  is_active: number;
  credit_allowed: number;
  credit_limit_paise: number;
  outstanding_balance_paise: number;
  advance_balance_paise: number;
  opening_balance_paise: number;
  opening_balance_date: string | null;
  preferred_payment_method: PaymentMethodType;
  preferred_delivery_time: string | null;
  price_tier: PriceTier;
  discount_percent: number;
  preferred_cut?: string | null;
  skin_preference?: string | null;
  cutting_preference?: string | null;
  typical_quantity?: string | null;
  delivery_preference?: string | null;
  packaging_preference?: string | null;
  special_instructions?: string | null;
  notes: string | null;
  phone_normalized?: string | null;
  locality?: string | null;
  whatsapp_bill_consent?: number;
  marketing_consent?: number;
  manual_tier?: string | null;
  preferred_time_slot?: string | null;
  is_test?: number;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerPurchaseItem {
  id: number;
  product_variant_id: number;
  product_name: string;
  variant_name: string;
  unit_type: string;
  quantity: number;
  unit_label: string;
  rate_paise: number;
  line_total_paise: number;
}

export interface CustomerPurchaseInvoice {
  id: number;
  invoice_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  is_gst_invoice: number;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
  payment_methods: string[];
  items_summary: string;
  items_count: number;
  items: CustomerPurchaseItem[];
}

export interface CustomerOverviewSummary {
  customer_id: number;
  total_purchases_paise: number;
  total_visits: number;
  total_payments_paise: number;
  last_purchase_date: string | null;
  last_purchase_amount_paise: number;
  last_purchase_items: string | null;
  last_payment_date: string | null;
  last_payment_amount_paise: number;
  outstanding_balance_paise: number;
  advance_balance_paise: number;
  credit_limit_paise: number;
  available_credit_paise: number;
}

export interface CustomerDuplicateMatch {
  id: number;
  customer_code: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  category: CustomerCategory;
  outstanding_balance_paise: number;
  is_active: number;
  status: string;
  matchReason?: string;
}

export interface DuplicateCheckResult {
  hasDuplicate: boolean;
  duplicates: CustomerDuplicateMatch[];
}

export type CustomerCategory =
  | 'Hotel'
  | 'Restaurant'
  | 'Retail'
  | 'Wholesale'
  | 'Catering'
  | 'Distributor'
  | 'Contract';

export type PaymentMethodType =
  | 'cash'
  | 'upi'
  | 'card'
  | 'bank_transfer'
  | 'cheque'
  | 'credit'
  | 'advance_adjustment';

export type PriceTier = 'standard' | 'wholesale' | 'vip';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface CreditAccount {
  id: number;
  customer_id: number;
  credit_limit_paise: number;
  soft_limit_paise: number;
  hard_limit_paise: number;
  grace_days: number;
  max_overdue_days: number;
  interest_rate_percent: number;
  is_frozen: number;
  freeze_reason: string | null;
  is_blacklisted: number;
  blacklist_reason: string | null;
}

export interface LedgerEntry {
  id: number;
  customer_id: number;
  entry_date: string;
  ref_type: LedgerRefType;
  ref_id: number | null;
  invoice_number: string | null;
  description: string;
  debit_paise: number;
  credit_paise: number;
  running_balance_paise: number;
  created_by: number | null;
  created_at: string;
}

export type LedgerRefType =
  | 'opening_balance'
  | 'invoice'
  | 'payment'
  | 'advance_deposit'
  | 'advance_applied'
  | 'credit_note'
  | 'debit_note'
  | 'adjustment'
  | 'write_off'
  | 'interest'
  | 'refund';

export interface CustomerPayment {
  id: number;
  customer_id: number;
  amount_paise: number;
  method: PaymentMethodType;
  reference_number: string | null;
  cheque_number: string | null;
  cheque_date: string | null;
  bank_name: string | null;
  payment_date: string;
  notes: string | null;
  is_advance: number;
  is_allocated: number;
  unallocated_paise: number;
  created_at: string;
}

export interface CreditTransaction {
  id: number;
  customer_id: number;
  invoice_id: number | null;
  transaction_type: string;
  amount_paise: number;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

export interface CreditNote {
  id: number;
  credit_note_number: string;
  customer_id: number;
  original_invoice_id: number | null;
  amount_paise: number;
  reason: string;
  is_applied: number;
  applied_to_invoice_id: number | null;
  applied_at: string | null;
  created_at: string;
}

export interface AgingBucketConfig {
  index: number;
  label: string;
  shortLabel: string;
  min_days: number;
  max_days: number | null;
  key: string;
}

export interface AgingReportRowInvoice {
  id: number;
  invoice_number: string;
  completed_at: string;
  total_paise: number;
  paid_paise: number;
  remaining_paise: number;
  days_overdue: number;
  bucket_index: number;
  payment_status?: string;
}

export interface AgingReportRow {
  customer_id: number;
  customer_code: string;
  name: string;
  phone: string | null;
  category?: string;
  outstanding_paise: number;
  bucket_values?: number[];
  current_paise: number;
  days_1_30_paise: number;
  days_31_60_paise: number;
  days_61_90_paise: number;
  days_91_180_paise: number;
  days_180_plus_paise: number;
  last_payment_date: string | null;
  credit_limit_paise: number;
  available_credit_paise: number;
  risk_level: RiskLevel;
  invoices?: AgingReportRowInvoice[];
}

export interface AgingReportResult {
  asOfDate: string;
  boundaries: number[];
  buckets: AgingBucketConfig[];
  rows: AgingReportRow[];
  totals: {
    outstanding_paise: number;
    bucket_totals: number[];
    customer_count: number;
  };
}

export interface StatementShopInfo {
  name: string;
  address: string;
  phone: string;
  gstin: string;
  email: string;
  currency: string;
}

export interface CustomerStatement {
  shopInfo?: StatementShopInfo;
  customer: Customer;
  opening_balance_paise: number;
  entries: LedgerEntry[];
  closing_balance_paise: number;
  total_debits_paise: number;
  total_credits_paise: number;
  startDate: string;
  endDate: string;
}

export interface PaymentAllocationItem {
  allocated_paise: number;
  invoice_id: number;
  invoice_number: string;
  invoice_date: string;
}

export interface CollectionRecordItem extends CustomerPayment {
  customer_name: string;
  customer_code: string;
  received_by_name?: string;
  received_by_display?: string;
  allocations: PaymentAllocationItem[];
  allocated_paise: number;
  unallocated_paise: number;
  is_on_account: boolean;
}

export interface CollectionReportResult {
  startDate: string;
  endDate: string;
  total_collected_paise: number;
  total_allocated_paise: number;
  total_unallocated_paise: number;
  transaction_count: number;
  by_method: Record<string, { count: number; total_paise: number }>;
  payments: CollectionRecordItem[];
}

export interface CreditValidationResult {
  allowed: boolean;
  requiresOverride: boolean;
  message: string;
  outstanding_paise: number;
  credit_limit_paise: number;
  available_credit_paise: number;
}

export interface ActivityLog {
  id: number;
  customer_id: number;
  action: string;
  details: string | null;
  performed_by: number | null;
  created_at: string;
}

export interface CustomerReminder {
  id: number;
  customer_id: number;
  channel: 'sms' | 'whatsapp' | 'email' | 'manual';
  template_type: 'payment_due' | 'overdue' | 'credit_limit' | 'custom';
  message: string;
  outstanding_paise: number | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  scheduled_for: string | null;
  sent_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface UnpaidInvoice {
  id: number;
  invoice_number: string | null;
  total_paise: number;
  remaining_paise: number;
  completed_at: string | null;
  payment_status: string;
  days_overdue: number;
}

// ─── Formatting Helpers ──────────────────────────────────────

export function formatPaise(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function getCategoryBadgeColor(category: CustomerCategory): string {
  const map: Record<CustomerCategory, string> = {
    Hotel: 'bg-purple-100 dark:bg-purple-500/20 text-purple-800 dark:text-purple-300 border-purple-300 dark:border-purple-500/40 font-semibold',
    Restaurant: 'bg-orange-100 dark:bg-orange-500/20 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-500/40 font-semibold',
    Retail: 'bg-blue-100 dark:bg-blue-500/20 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-500/40 font-semibold',
    Wholesale: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 font-semibold',
    Catering: 'bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 font-semibold',
    Distributor: 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-500/40 font-semibold',
    Contract: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300 border-cyan-300 dark:border-cyan-500/40 font-semibold',
  };
  return map[category] ?? 'bg-slate-100 dark:bg-slate-500/20 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-500/40 font-semibold';
}

export function getRiskBadgeColor(risk: RiskLevel): string {
  const map: Record<RiskLevel, string> = {
    low: 'bg-emerald-100 dark:bg-brand-500/20 text-emerald-800 dark:text-brand-400 border border-emerald-300 dark:border-brand-500/40',
    medium: 'bg-amber-100 dark:bg-yellow-500/20 text-amber-800 dark:text-yellow-300 border border-amber-300 dark:border-yellow-500/40',
    high: 'bg-rose-100 dark:bg-red-500/20 text-rose-800 dark:text-red-300 border border-rose-300 dark:border-red-500/40',
  };
  return map[risk];
}

export function getLedgerRefLabel(refType: LedgerRefType): string {
  const map: Record<LedgerRefType, string> = {
    opening_balance: 'Opening Balance',
    invoice: 'Credit Sale',
    payment: 'Payment Received',
    advance_deposit: 'Advance Deposit',
    advance_applied: 'Advance Applied',
    credit_note: 'Credit Note',
    debit_note: 'Debit Note',
    adjustment: 'Manual Adjustment',
    write_off: 'Write-Off',
    interest: 'Interest Charged',
    refund: 'Refund',
  };
  return map[refType] ?? refType;
}

export function getPaymentMethodLabel(method: string): string {
  const map: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
    bank_transfer: 'Bank Transfer',
    cheque: 'Cheque',
    credit: 'Credit',
    advance_adjustment: 'Advance Adjustment',
  };
  return map[method] ?? method;
}

export function getDaysOverdue(completedAt: string | null): number {
  if (!completedAt) return 0;
  const diff = Date.now() - new Date(completedAt).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

export type CustomerSegmentType =
  | 'VIP'
  | 'Regular'
  | 'Due'
  | 'At Risk'
  | 'Inactive'
  | 'Credit Customer'
  | 'Business Customer'
  | 'New';

export interface TypicalBasketItem {
  product_variant_id: number;
  product_name: string;
  variant_name: string;
  unit_type: string;
  unit_label: string;
  typical_quantity_grams: number | null;
  typical_quantity_units: number | null;
  typical_qty_display: string;
  rate_paise: number;
}

export interface FavoriteProduct {
  product_variant_id: number;
  product_name: string;
  variant_name: string;
  unit_type: string;
  unit_label: string;
  purchase_count: number;
  total_quantity: number;
  total_spend_paise: number;
}

export interface FavoriteCategory {
  category_name: string;
  purchase_count: number;
  total_spend_paise: number;
}

export interface PaymentReliability {
  score: number;
  avg_days_to_pay: number;
  rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'N/A';
  total_credit_purchases: number;
  total_payments_logged: number;
}

export interface CustomerIntelligence {
  customer_id: number;
  customer_code: string;
  name: string;
  category: string;
  last_purchase_date: string | null;
  days_since_last_purchase: number | null;
  total_visits: number;
  total_spend_paise: number;
  average_bill_paise: number;
  average_visit_interval: number | null;
  median_visit_interval: number | null;
  expected_next_visit: string | null;
  days_overdue: number;
  purchase_frequency_label: string;
  total_weight_grams: number;
  average_weight_grams_per_visit: number;
  favorite_products: FavoriteProduct[];
  favorite_categories: FavoriteCategory[];
  typical_basket: TypicalBasketItem[];
  typical_basket_summary: string;
  preferred_payment_method: string;
  preferred_visit_day: string;
  preferred_visit_time: string;
  customer_lifetime_value_paise: number;
  customer_segment: CustomerSegmentType;
  segment_health_summary: string;
  credit_limit_paise: number;
  outstanding_balance_paise: number;
  advance_balance_paise: number;
  payment_reliability: PaymentReliability;
  calculated_at: string;
}

export function getSegmentBadgeStyle(segment?: string | null): {
  bg: string;
  text: string;
  border: string;
  icon: string;
  label: string;
} {
  switch (segment) {
    case 'VIP':
      return { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-500/40', icon: '⭐', label: 'VIP' };
    case 'Regular':
      return { bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-800 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-500/40', icon: '🟢', label: 'Regular' };
    case 'Due':
      return { bg: 'bg-yellow-100 dark:bg-yellow-500/15', text: 'text-yellow-800 dark:text-yellow-300', border: 'border-yellow-300 dark:border-yellow-500/40', icon: '🟡', label: 'Due' };
    case 'At Risk':
      return { bg: 'bg-orange-100 dark:bg-orange-500/15', text: 'text-orange-800 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-500/40', icon: '🔴', label: 'At Risk' };
    case 'Inactive':
      return { bg: 'bg-zinc-200 dark:bg-zinc-500/15', text: 'text-zinc-800 dark:text-zinc-300', border: 'border-zinc-300 dark:border-zinc-500/40', icon: '⚫', label: 'Inactive' };
    case 'Credit Customer':
      return { bg: 'bg-blue-100 dark:bg-blue-500/15', text: 'text-blue-800 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-500/40', icon: '🧾', label: 'Credit Account' };
    case 'Business Customer':
      return { bg: 'bg-purple-100 dark:bg-purple-500/15', text: 'text-purple-800 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-500/40', icon: '🏪', label: 'Business' };
    case 'Rare':
      return { bg: 'bg-purple-100 dark:bg-purple-500/15', text: 'text-purple-800 dark:text-purple-300', border: 'border-purple-300 dark:border-purple-500/40', icon: '⏳', label: 'Rare' };
    case 'Wholesale':
      return { bg: 'bg-blue-100 dark:bg-blue-500/15', text: 'text-blue-800 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-500/40', icon: '📦', label: 'Wholesale' };
    case 'Restaurant':
      return { bg: 'bg-indigo-100 dark:bg-indigo-500/15', text: 'text-indigo-800 dark:text-indigo-300', border: 'border-indigo-300 dark:border-indigo-500/40', icon: '🍽️', label: 'Restaurant' };
    case 'New':
    default:
      return { bg: 'bg-cyan-100 dark:bg-cyan-500/15', text: 'text-cyan-800 dark:text-cyan-300', border: 'border-cyan-300 dark:border-cyan-500/40', icon: '🆕', label: 'New' };
  }
}

export interface TimelineEventItem {
  id: string;
  type: 'purchase' | 'payment' | 'credit' | 'activity';
  title: string;
  description: string;
  amount_paise: number | null;
  badge: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface CrmAlertsSummary {
  total_customers: number;
  due_today_count: number;
  at_risk_count: number;
  vip_count: number;
  inactive_count: number;
  regular_count: number;
  shop_avg_visit_interval: number;
}

export interface AttentionCustomerItem {
  customer_id: number;
  customer_code: string;
  name: string;
  phone?: string;
  whatsapp_bill_consent?: number;
  marketing_consent?: number;
  category: string;
  customer_segment: CustomerSegmentType;
  tags?: string[];
  is_credit_customer?: boolean;
  has_credit_due?: boolean;
  credit_status?: string;
  segment_health_summary: string;
  average_visit_interval: number | null;
  last_purchase_date: string | null;
  days_since_last_purchase: number | null;
  expected_next_visit: string | null;
  days_overdue: number;
  purchase_frequency_label: string;
  customer_lifetime_value_paise: number;
  outstanding_balance_paise: number;
  advance_balance_paise: number;
  typical_basket_summary: string;
}

export interface UpiMatchCandidate {
  customer_id: number;
  customer_code: string;
  name: string;
  phone: string | null;
  category: string;
  customer_segment?: string;
  confidence_score: number;
  match_reason: string;
  vpa: string;
  payer_name?: string;
  verified_count: number;
  auto_link: boolean;
}

export interface UpiMatchResult {
  has_match: boolean;
  best_match: UpiMatchCandidate | null;
  candidates: UpiMatchCandidate[];
  raw_payload: {
    vpa?: string;
    payer_name?: string;
    amount_paise?: number;
    ref_number?: string;
  };
  quick_create_suggestion?: {
    name: string;
    phone?: string;
  };
}

export interface CustomerUpiIdentity {
  id: number;
  customer_id: number;
  vpa: string;
  payer_name: string | null;
  verified_count: number;
  auto_link: number;
  last_seen_at: string;
  created_at: string;
}

// ─── Phase 2 Cashier & Fast Lookup Types ───────────────────────

export interface FastCustomerLookupResult {
  id: number;
  customer_code: string;
  name: string;
  phone: string | null;
  phone_normalized: string | null;
  masked_phone: string;
  matched_digits: string | null;
  locality: string;
  outstanding_balance_paise: number;
  advance_balance_paise: number;
  credit_allowed: number;
  credit_limit_paise: number;
  segment: string;
  visit_count: number;
  last_visit_date: string | null;
  last_visit_relative: string;
  usual_item_summary: string;
  cutting_preference: string;
  whatsapp_bill_consent: number;
  marketing_consent: number;
}

export interface FastCustomerLookupResponse {
  results: FastCustomerLookupResult[];
  totalMatches: number;
  collision: boolean;
  hint?: string;
}

export interface QuickAddCustomerInput {
  name?: string;
  phone: string;
  whatsapp_bill_consent?: boolean;
  marketing_consent?: boolean;
}

export interface CustomerTierSettings {
  id: number;
  vip_min_spend_paise: number;
  vip_min_visits: number;
  vip_criteria_mode: 'either' | 'both';
  regular_min_visits: number;
  rare_inactive_days: number;
  updated_at?: string;
}

export interface RegularCustomerTile {
  id: number;
  customer_code: string;
  name: string;
  initials: string;
  phone?: string | null;
  phone_normalized: string | null;
  segment: string;
  manual_tier?: string | null;
  category?: string;
  price_tier?: string;
  outstanding_balance_paise: number;
  visit_count: number;
  total_spend_paise: number;
  last_visit_date: string | null;
  days_since_last_purchase?: number | null;
  usual_time_slot: 'morning' | 'afternoon' | 'evening' | 'flexible';
  is_time_match: boolean;
  current_store_slot: 'morning' | 'afternoon' | 'evening';
  morning_visits?: number;
  afternoon_visits?: number;
  evening_visits?: number;
  usual_item_summary: string;
  cutting_preference: string;
}

export interface RecentCustomerItem {
  id: number;
  customer_code: string;
  name: string;
  phone: string | null;
  phone_normalized: string | null;
  masked_phone: string;
  outstanding_balance_paise: number;
  segment: string;
  usual_item_summary: string;
}

export interface RepeatOrderItem {
  product_variant_id: number;
  product_id: number;
  product_name: string;
  variant_name: string;
  unit_type: string;
  quantity_grams: number | null;
  quantity_units: number | null;
  display_qty: string;
  previous_rate_paise: number;
  current_rate_paise: number;
  price_changed: boolean;
  price_diff_paise: number;
  is_available: boolean;
  stock_warning?: string;
}

export interface RepeatOrderResponse {
  hasOrder: boolean;
  lastInvoice?: {
    id: number;
    invoice_number: string;
    created_at: string;
    total_paise: number;
  };
  items: RepeatOrderItem[];
  warnings: string[];
}


