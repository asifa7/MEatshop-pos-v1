// useCustomers.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import type { 
  Customer, 
  CustomerGroup, 
  ActivityLog, 
  CustomerPurchaseInvoice, 
  CustomerOverviewSummary, 
  DuplicateCheckResult,
  CustomerIntelligence,
  TimelineEventItem,
  CrmAlertsSummary,
  AttentionCustomerItem,
  UpiMatchResult,
  CustomerUpiIdentity,
  FastCustomerLookupResponse,
  QuickAddCustomerInput,
  RegularCustomerTile,
  RecentCustomerItem,
  RepeatOrderResponse,
  CustomerTierSettings
} from '../types/customer.types';

async function invoke<T>(channel: string, args?: unknown): Promise<T> {
  const res = await window.api.invoke(channel, args) as { success: boolean; data?: any; error?: any };
  if (!res.success) throw res.error ?? new Error('IPC error');
  return res.data as T;
}

// ─── Customers ──────────────────────────────────────────────

export function useCustomers(includeInactive = false) {
  return useQuery<Customer[]>({
    queryKey: ['customers', { includeInactive }],
    queryFn: () => invoke(IPC_CHANNELS.CUSTOMERS.GET_ALL, { includeInactive }),
    staleTime: 30_000,
  });
}

export function useCustomer(id: number | null) {
  return useQuery<Customer>({
    queryKey: ['customer', id],
    queryFn: () => invoke(IPC_CHANNELS.CUSTOMERS.GET_BY_ID, { id }),
    enabled: id !== null,
    staleTime: 15_000,
  });
}

export function useCustomerGroups() {
  return useQuery<CustomerGroup[]>({
    queryKey: ['customer-groups'],
    queryFn: () => invoke(IPC_CHANNELS.CUSTOMERS.GET_GROUPS),
    staleTime: 300_000,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Customer>) => invoke(IPC_CHANNELS.CUSTOMERS.CREATE, input),
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ['customers'] }); 
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fields }: { id: number; fields: Partial<Customer> }) =>
      invoke(IPC_CHANNELS.CUSTOMERS.UPDATE, { id, fields }),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', id] });
      qc.invalidateQueries({ queryKey: ['customer-overview', id] });
    },
  });
}

export function useDeactivateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => invoke(IPC_CHANNELS.CUSTOMERS.DEACTIVATE, { id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); },
  });
}

export function useCustomerActivityLog(customerId: number | null, limit = 50) {
  return useQuery<ActivityLog[]>({
    queryKey: ['customer-activity', customerId],
    queryFn: () => invoke<ActivityLog[]>(IPC_CHANNELS.CUSTOMERS.GET_ACTIVITY_LOG, { customer_id: customerId, limit }),
    enabled: customerId !== null,
    staleTime: 15_000,
  });
}

export function useCustomerPurchaseHistory(customerId: number | null, limit = 50, offset = 0) {
  return useQuery<{ invoices: CustomerPurchaseInvoice[]; total_count: number }>({
    queryKey: ['customer-purchase-history', customerId, limit, offset],
    queryFn: () => invoke(IPC_CHANNELS.CUSTOMERS.GET_PURCHASE_HISTORY, { customer_id: customerId, limit, offset }),
    enabled: customerId !== null,
    staleTime: 10_000,
  });
}

export function useCustomerOverviewSummary(customerId: number | null) {
  return useQuery<CustomerOverviewSummary>({
    queryKey: ['customer-overview', customerId],
    queryFn: () => invoke<CustomerOverviewSummary>(IPC_CHANNELS.CUSTOMERS.GET_OVERVIEW_SUMMARY, { customer_id: customerId }),
    enabled: customerId !== null,
    staleTime: 10_000,
  });
}

export function useCheckCustomerDuplicates() {
  return useMutation<DuplicateCheckResult, Error, { phone?: string | null; whatsapp?: string | null; name?: string | null; email?: string | null; excludeId?: number | null }>({
    mutationFn: (criteria) => invoke(IPC_CHANNELS.CUSTOMERS.CHECK_DUPLICATES, criteria),
  });
}

export function useCustomerIntelligence(customerId: number | null, forceRefresh = false) {
  return useQuery<CustomerIntelligence>({
    queryKey: ['customer-intelligence', customerId, forceRefresh],
    queryFn: () => invoke<CustomerIntelligence>(IPC_CHANNELS.CUSTOMERS.GET_INTELLIGENCE, { customer_id: customerId, force_refresh: forceRefresh }),
    enabled: customerId !== null,
    staleTime: 10_000,
  });
}

export function useMergeCustomers() {
  const qc = useQueryClient();
  return useMutation<any, Error, { source_customer_id: number; target_customer_id: number; reason?: string }>({
    mutationFn: (payload) => invoke(IPC_CHANNELS.CUSTOMERS.MERGE, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer'] });
      qc.invalidateQueries({ queryKey: ['customer-overview'] });
      qc.invalidateQueries({ queryKey: ['customer-purchase-history'] });
      qc.invalidateQueries({ queryKey: ['customer-intelligence'] });
      qc.invalidateQueries({ queryKey: ['customer-ledger'] });
      qc.invalidateQueries({ queryKey: ['customer-credit'] });
    },
  });
}

export function useCustomerTimeline(customerId: number | null, limit = 100) {
  return useQuery<TimelineEventItem[]>({
    queryKey: ['customer-timeline', customerId, limit],
    queryFn: () => invoke<TimelineEventItem[]>(IPC_CHANNELS.CUSTOMERS.GET_TIMELINE, { customer_id: customerId, limit }),
    enabled: customerId !== null,
    staleTime: 5_000,
  });
}

export function useCrmAlertsSummary() {
  return useQuery<CrmAlertsSummary>({
    queryKey: ['customer-crm-alerts-summary'],
    queryFn: () => invoke<CrmAlertsSummary>(IPC_CHANNELS.CUSTOMERS.GET_CRM_ALERTS),
    staleTime: 10_000,
  });
}

export function useCustomersNeedingAttention(sortBy: 'days_overdue' | 'lifetime_value' = 'days_overdue', limit = 50) {
  return useQuery<AttentionCustomerItem[]>({
    queryKey: ['customers-needing-attention', sortBy, limit],
    queryFn: () => invoke<AttentionCustomerItem[]>(IPC_CHANNELS.CUSTOMERS.GET_NEEDING_ATTENTION, { sortBy, limit }),
    staleTime: 10_000,
  });
}

export function useMatchUpiPayment() {
  return useMutation<UpiMatchResult, Error, { vpa?: string | null; payer_name?: string | null; amount_paise?: number; ref_number?: string | null }>({
    mutationFn: (payload) => invoke<UpiMatchResult>(IPC_CHANNELS.CUSTOMERS.MATCH_UPI, payload),
  });
}

export function useConfirmUpiIdentity() {
  const qc = useQueryClient();
  return useMutation<CustomerUpiIdentity, Error, { customer_id: number; vpa: string; payer_name?: string | null; auto_link?: boolean }>({
    mutationFn: (payload) => invoke<CustomerUpiIdentity>(IPC_CHANNELS.CUSTOMERS.CONFIRM_UPI, payload),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['customer-upi-identities', vars.customer_id] });
    },
  });
}

export function useCustomerUpiIdentities(customerId: number | null) {
  return useQuery<CustomerUpiIdentity[]>({
    queryKey: ['customer-upi-identities', customerId],
    queryFn: () => invoke<CustomerUpiIdentity[]>(IPC_CHANNELS.CUSTOMERS.GET_UPI_IDENTITIES, { customer_id: customerId }),
    enabled: customerId !== null,
  });
}

// ─── Phase 2 Cashier Hooks ─────────────────────────────────────

export function useFastCustomerLookup(query: string, limit = 8) {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  const isDigits = /^\d+$/.test(trimmed);
  const minLen = isDigits ? 4 : 2;

  return useQuery<FastCustomerLookupResponse>({
    queryKey: ['fast-customer-lookup', query, limit],
    queryFn: () => invoke<FastCustomerLookupResponse>(IPC_CHANNELS.CUSTOMERS.FAST_LOOKUP, { query, limit }),
    enabled: trimmed.length >= minLen,
    staleTime: 5_000,
  });
}

export function useQuickAddCustomer() {
  const qc = useQueryClient();
  return useMutation<Customer, Error, QuickAddCustomerInput>({
    mutationFn: (input) => invoke<Customer>(IPC_CHANNELS.CUSTOMERS.QUICK_ADD, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['recent-customers'] });
      qc.invalidateQueries({ queryKey: ['customer-regulars'] });
    },
  });
}

export function useCustomerRegulars(limit = 16, segmentFilter = 'all', timeSlotFilter = 'all') {
  return useQuery<RegularCustomerTile[]>({
    queryKey: ['customer-regulars', limit, segmentFilter, timeSlotFilter],
    queryFn: () => invoke<RegularCustomerTile[]>(IPC_CHANNELS.CUSTOMERS.GET_REGULARS, { 
      limit, 
      segment_filter: segmentFilter,
      time_slot_filter: timeSlotFilter 
    }),
    staleTime: 10_000,
    refetchInterval: 30_000, // Periodically refresh to stay in sync with time of day
  });
}

export function useCustomerTierSettings() {
  return useQuery<CustomerTierSettings>({
    queryKey: ['customer-tier-settings'],
    queryFn: () => invoke<CustomerTierSettings>(IPC_CHANNELS.CUSTOMERS.GET_TIER_SETTINGS),
    staleTime: 60_000,
  });
}

export function useUpdateCustomerTierSettings() {
  const qc = useQueryClient();
  return useMutation<CustomerTierSettings, Error, Partial<CustomerTierSettings>>({
    mutationFn: (settings) => invoke<CustomerTierSettings>(IPC_CHANNELS.CUSTOMERS.UPDATE_TIER_SETTINGS, settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-tier-settings'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer-regulars'] });
    },
  });
}

export function useRecalculateCustomerTiers() {
  const qc = useQueryClient();
  return useMutation<{ updatedCount: number; summary: Record<string, number> }, Error, void>({
    mutationFn: () => invoke<{ updatedCount: number; summary: Record<string, number> }>(IPC_CHANNELS.CUSTOMERS.RECALCULATE_TIERS),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer-regulars'] });
      qc.invalidateQueries({ queryKey: ['customer-crm-alerts-summary'] });
    },
  });
}

export function useSetManualCustomerTier() {
  const qc = useQueryClient();
  return useMutation<{ success: boolean; customer: Customer }, Error, { customer_id: number; tier: string | null; preferred_time_slot?: string | null }>({
    mutationFn: (payload) => invoke<{ success: boolean; customer: Customer }>(IPC_CHANNELS.CUSTOMERS.SET_MANUAL_TIER, payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', variables.customer_id] });
      qc.invalidateQueries({ queryKey: ['customer-regulars'] });
    },
  });
}

export function useRecentCustomers(limit = 10) {
  return useQuery<RecentCustomerItem[]>({
    queryKey: ['recent-customers', limit],
    queryFn: () => invoke<RecentCustomerItem[]>(IPC_CHANNELS.CUSTOMERS.GET_RECENTS, { limit }),
    staleTime: 10_000,
  });
}

export function useRepeatOrder(customerId: number | null) {
  return useQuery<RepeatOrderResponse>({
    queryKey: ['repeat-order', customerId],
    queryFn: () => invoke<RepeatOrderResponse>(IPC_CHANNELS.CUSTOMERS.GET_REPEAT_ORDER, { customer_id: customerId }),
    enabled: customerId !== null,
    staleTime: 15_000,
  });
}

export function useRecordWhatsAppAttempt() {
  return useMutation<{ success: boolean; logged_at: string }, Error, { invoice_id: number; customer_id?: number | null; phone: string }>({
    mutationFn: (payload) => invoke<{ success: boolean; logged_at: string }>(IPC_CHANNELS.CUSTOMERS.RECORD_WHATSAPP_ATTEMPT, payload),
  });
}

export function useGenerateSeedData() {
  const qc = useQueryClient();
  return useMutation<any, Error, void>({
    mutationFn: () => invoke(IPC_CHANNELS.CUSTOMERS.GENERATE_SEED_DATA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer-crm-alerts-summary'] });
      qc.invalidateQueries({ queryKey: ['customers-needing-attention'] });
      qc.invalidateQueries({ queryKey: ['customer-regulars'] });
    },
  });
}

export function useClearSeedData() {
  const qc = useQueryClient();
  return useMutation<any, Error, void>({
    mutationFn: () => invoke(IPC_CHANNELS.CUSTOMERS.CLEAR_SEED_DATA),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer-crm-alerts-summary'] });
      qc.invalidateQueries({ queryKey: ['customers-needing-attention'] });
      qc.invalidateQueries({ queryKey: ['customer-regulars'] });
    },
  });
}

export function useIncludeTestData() {
  return useQuery<{ include_test: boolean }>({
    queryKey: ['customers-include-test-data'],
    queryFn: () => invoke<{ include_test: boolean }>(IPC_CHANNELS.CUSTOMERS.GET_INCLUDE_TEST_DATA),
    staleTime: 5_000,
  });
}

export function useSetIncludeTestData() {
  const qc = useQueryClient();
  return useMutation<{ include_test: boolean }, Error, boolean>({
    mutationFn: (include_test: boolean) => invoke<{ include_test: boolean }>(IPC_CHANNELS.CUSTOMERS.SET_INCLUDE_TEST_DATA, { include_test }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers-include-test-data'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer-crm-alerts-summary'] });
      qc.invalidateQueries({ queryKey: ['customers-needing-attention'] });
      qc.invalidateQueries({ queryKey: ['customer-regulars'] });
    },
  });
}

export function useUpdateCustomerConsent() {
  const qc = useQueryClient();
  return useMutation<Customer, Error, { customer_id: number; whatsapp_bill_consent?: number; marketing_consent?: number }>({
    mutationFn: (payload) => invoke<Customer>(IPC_CHANNELS.CUSTOMERS.UPDATE_CONSENT, payload),
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      qc.invalidateQueries({ queryKey: ['customer', variables.customer_id] });
      qc.invalidateQueries({ queryKey: ['customers-needing-attention'] });
    },
  });
}


