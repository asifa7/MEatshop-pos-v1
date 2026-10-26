import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';

export interface LiquidBalances {
  cashInHandPaise: number;
  bankBalancePaise: number;
  totalLiquidFundsPaise: number;
  posCashSalesPaise: number;
  posBankSalesPaise: number;
}

export interface OpenBill {
  id: number;
  bill_type: 'purchase_invoice' | 'sale_invoice';
  bill_number: string;
  invoice_number: string;
  supplier_invoice_number?: string;
  invoice_date: string;
  due_date?: string;
  total_amount_paise: number;
  paid_amount_paise: number;
  outstanding_balance_paise: number;
  days_overdue?: number;
}

export interface PaymentReceiptVoucher {
  id: number;
  voucher_number: string;
  direction: 'payment' | 'receipt';
  payment_method: 'cash' | 'bank' | 'upi' | 'card';
  party_type: 'supplier' | 'customer' | 'other';
  party_id: number | null;
  party_name: string | null;
  category: string | null;
  amount_paise: number;
  allocated_amount_paise: number;
  unallocated_amount_paise: number;
  payment_date: string;
  narration: string | null;
  is_reversed?: number;
  reversed_at?: string | null;
  reversal_reason?: string | null;
  reversed_payment_id?: number | null;
  idempotency_key?: string | null;
  created_by: number;
  created_at: string;
  created_by_name?: string;
  allocation_count?: number;
  allocations?: Array<{
    id: number;
    bill_type: string;
    bill_id: number;
    bill_number: string;
    allocated_amount_paise: number;
  }>;
}

export interface OutstandingPurchaseBill {
  id: number;
  invoice_number: string;
  supplier_invoice_number: string | null;
  purchase_ref_number: string | null;
  supplier_id: number;
  supplier_name: string;
  supplier_company: string;
  invoice_date: string;
  due_date: string | null;
  total_amount_paise: number;
  paid_amount_paise: number;
  outstanding_balance_paise: number;
  days_overdue: number;
  invoice_status: string;
  computed_payment_status: 'unpaid' | 'partial' | 'paid';
  payment_status?: 'unpaid' | 'partial' | 'paid';
}

export interface BillPaymentHistoryItem {
  allocation_id: number;
  allocated_amount_paise: number;
  allocated_at: string;
  voucher_id: number;
  voucher_number: string;
  payment_method: 'cash' | 'bank' | 'upi' | 'card';
  payment_date: string;
  direction: 'payment' | 'receipt';
  narration: string | null;
  is_reversed: number;
  reversed_at: string | null;
  reversal_reason: string | null;
  reversed_payment_id: number | null;
  created_by_name?: string;
}

export function useLiquidBalances() {
  return useQuery<LiquidBalances>({
    queryKey: ['payments-receipts', 'balances'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.GET_BALANCES);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    refetchInterval: 10000,
  });
}

export function useOpenBills(partyType?: 'supplier' | 'customer', partyId?: number | null) {
  return useQuery<OpenBill[]>({
    queryKey: ['payments-receipts', 'open-bills', partyType, partyId],
    queryFn: async () => {
      if (!partyType || !partyId) return [];
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.GET_OPEN_BILLS, { partyType, partyId });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!partyType && !!partyId,
  });
}

export function useOutstandingPurchaseBills(filters?: {
  status?: 'outstanding' | 'paid' | 'unpaid' | 'partial' | 'all';
  supplierId?: number;
  search?: string;
  sortBy?: 'due_date' | 'total_amount' | 'outstanding' | 'supplier';
  sortOrder?: 'asc' | 'desc';
}) {
  return useQuery<OutstandingPurchaseBill[]>({
    queryKey: ['payments-receipts', 'outstanding-bills', filters],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.GET_OUTSTANDING_BILLS, filters || {});
      if (!res.success) throw new Error(res.error.message);
      return res.data || [];
    },
    refetchInterval: 10000,
  });
}

export function useBillPaymentHistory(billType: 'purchase_invoice' | 'sale_invoice', billId?: number | null) {
  return useQuery<{ allocations: BillPaymentHistoryItem[]; totalPaidPaise: number }>({
    queryKey: ['payments-receipts', 'bill-history', billType, billId],
    queryFn: async () => {
      if (!billId) return { allocations: [], totalPaidPaise: 0 };
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.GET_BILL_PAYMENT_HISTORY, { billType, billId });
      if (!res.success) throw new Error(res.error.message);
      return res.data || { allocations: [], totalPaidPaise: 0 };
    },
    enabled: !!billId,
  });
}

export function usePaymentRegister(filters: {
  startDate?: string;
  endDate?: string;
  direction?: string;
  paymentMethod?: string;
  partyType?: string;
  partyId?: number;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery<{
    vouchers: PaymentReceiptVoucher[];
    summary: {
      totalPaymentsPaise: number;
      totalReceiptsPaise: number;
      netCashFlowPaise: number;
      count: number;
    };
  }>({
    queryKey: ['payments-receipts', 'register', filters],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.GET_REGISTER, filters);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    refetchInterval: 15000,
  });
}

export function useDuePurchasesList(filters?: { supplierId?: number; startDate?: string; endDate?: string }) {
  return useQuery<OutstandingPurchaseBill[]>({
    queryKey: ['payments-receipts', 'due-purchases', filters],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.GET_DUE_PURCHASES, filters || {});
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    refetchInterval: 15000,
  });
}

export function useRecordPaymentReceipt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      direction: 'payment' | 'receipt';
      payment_method: 'cash' | 'bank' | 'upi' | 'card';
      party_type?: 'supplier' | 'customer' | 'other';
      party_id?: number | null;
      party_name?: string | null;
      category?: string | null;
      amount_paise: number;
      payment_date: string;
      narration?: string | null;
      reference_number?: string | null;
      idempotency_key?: string | null;
      allocations?: Array<{
        bill_type: 'purchase_invoice' | 'sale_invoice';
        bill_id: number;
        bill_number: string;
        allocated_amount_paise: number;
      }>;
    }) => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.RECORD, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['procurement'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useReversePayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { payment_receipt_id: number; reason: string }) => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.REVERSE, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['procurement'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function useRecordContraEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      from_account: 'cash' | 'bank';
      to_account: 'cash' | 'bank';
      amount_paise: number;
      entry_date: string;
      narration?: string | null;
    }) => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.RECORD_CONTRA, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments-receipts'] });
    },
  });
}

export interface VendorBillItem {
  id: number;
  invoice_number: string;
  supplier_invoice_number: string | null;
  purchase_ref_number: string | null;
  supplier_id: number;
  invoice_date: string;
  created_at: string;
  total_amount_paise: number;
  paid_amount_paise: number;
  outstanding_balance_paise: number;
  days_old: number;
  computed_payment_status: 'unpaid' | 'partial' | 'paid';
}

export interface VendorTileData {
  supplier_id: number;
  supplier_name: string;
  supplier_company: string;
  phone: string | null;
  total_outstanding_paise: number;
  total_purchased_paise: number;
  pending_bills_count: number;
  total_bills_count: number;
  oldest_bill_date: string | null;
  oldest_bill_days: number;
  last_payment_date: string | null;
  last_payment_amount_paise: number | null;
  credit_days: number;
  is_overdue: boolean;
  bills: VendorBillItem[];
}

export interface VendorPayablesSummaryResponse {
  summary: {
    total_payable_paise: number;
    vendors_count: number;
    pending_bills_count: number;
    supplier_credit_days: number;
  };
  vendors: VendorTileData[];
  all_vendors: VendorTileData[];
}

export interface RecordVendorPaymentInput {
  supplier_id: number;
  amount_paise: number;
  payment_method: 'cash' | 'bank' | 'upi' | 'card';
  payment_date: string;
  reference_number?: string | null;
  narration?: string | null;
  idempotency_key?: string | null;
  manual_allocations?: Array<{
    bill_id: number;
    allocated_amount_paise: number;
  }>;
}

export interface RecordVendorPaymentResult {
  voucher: PaymentReceiptVoucher;
  cleared_bills_count: number;
  partial_bills_count: number;
  remaining_balance_paise: number;
  allocations: Array<{
    bill_type: string;
    bill_id: number;
    bill_number: string;
    allocated_amount_paise: number;
  }>;
  message: string;
}

export interface PayablesHealthReport {
  is_healthy: boolean;
  checked_bills_count: number;
  discrepancies_count: number;
  discrepancies: Array<{
    bill_id: number;
    invoice_number: string;
    total_amount_paise: number;
    stored_paid_paise: number;
    calculated_paid_paise: number;
    stored_outstanding_paise: number;
    calculated_outstanding_paise: number;
    difference_paise: number;
  }>;
}

/**
 * Fetch supplier payables aggregated strictly by vendor (ONE tile per vendor)
 */
export function useVendorPayablesSummary(filters?: { search?: string }) {
  return useQuery<VendorPayablesSummaryResponse>({
    queryKey: ['payments-receipts', 'vendor-payables', filters?.search],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.GET_VENDOR_PAYABLES, filters);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });
}

/**
 * Cashier pays a vendor with automatic FIFO or manual allocation
 */
export function useRecordVendorPayment() {
  const queryClient = useQueryClient();
  return useMutation<RecordVendorPaymentResult, Error, RecordVendorPaymentInput>({
    mutationFn: async (input: RecordVendorPaymentInput) => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.RECORD_VENDOR_PAYMENT, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['cashbox'] });
      queryClient.invalidateQueries({ queryKey: ['procurement'] });
      queryClient.invalidateQueries({ queryKey: ['ledgers'] });
    },
  });
}

/**
 * Payables health check
 */
export function useCheckPayablesHealth() {
  const queryClient = useQueryClient();
  return useMutation<PayablesHealthReport, Error, { autoRepair?: boolean } | void>({
    mutationFn: async (args) => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.CHECK_HEALTH, args || {});
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments-receipts'] });
    },
  });
}

/**
 * Query and update supplier credit days setting
 */
export function useSupplierCreditDays() {
  return useQuery<number>({
    queryKey: ['payments-receipts', 'credit-days'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.GET_CREDIT_DAYS);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });
}

export function useUpdateSupplierCreditDays() {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean; credit_days: number }, Error, number>({
    mutationFn: async (days: number) => {
      const res = await window.api.invoke(IPC_CHANNELS.PAYMENTS_RECEIPTS.UPDATE_CREDIT_DAYS, { days });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments-receipts'] });
    },
  });
}

