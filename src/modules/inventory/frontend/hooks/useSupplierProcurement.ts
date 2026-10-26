import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import type {
  FullSupplierRow,
  SupplierCategoryRow,
  SupplierContactRow,
  SupplierAddressRow,
  SupplierBankAccountRow,
  SupplierPaymentTermsRow,
  SupplierLedgerEntryRow,
  SupplierPaymentRow,
  PurchaseOrderRow,
  PurchaseOrderItemRow,
  GoodsReceiptRow,
  GoodsReceiptItemRow,
  PurchaseInvoiceRow,
  PurchaseInvoiceItemRow,
  PurchaseReturnRow,
  PurchaseReturnItemRow,
  SupplierAgingRow,
  SupplierPurchaseVolumeRow,
  PassbookLedgerEntry,
  SupplierSnapshot,
  PurchasesMonthSummary,
} from '../types/supplier.types';

// ==========================================
// 1. Supplier Profile & Sub-entities Hooks
// ==========================================

export function useSuppliersProfile() {
  return useQuery<FullSupplierRow[]>({
    queryKey: ['supplier', 'profiles'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.GET_ALL);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 30000,
  });
}

export function useSupplierDetails(id: number | undefined) {
  return useQuery<
    FullSupplierRow & {
      contacts: SupplierContactRow[];
      addresses: SupplierAddressRow[];
      bankAccounts: SupplierBankAccountRow[];
      paymentTerms?: SupplierPaymentTermsRow;
      documents: any[];
    }
  >({
    queryKey: ['supplier', 'details', id],
    queryFn: async () => {
      if (!id) throw new Error('Supplier ID is required');
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.GET_BY_ID, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!id,
    staleTime: 30000,
  });
}

export function useCreateSupplier() {
  const queryClient = useQueryClient();
  return useMutation<FullSupplierRow, Error, any>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.CREATE, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'profiles'] });
    },
  });
}

export function useUpdateSupplier() {
  const queryClient = useQueryClient();
  return useMutation<FullSupplierRow, Error, { id: number; fields: any }>({
    mutationFn: async ({ id, fields }) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.UPDATE, { id, fields });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'profiles'] });
      queryClient.invalidateQueries({ queryKey: ['supplier', 'details', variables.id] });
    },
  });
}

export function useSupplierCategories() {
  return useQuery<SupplierCategoryRow[]>({
    queryKey: ['supplier', 'categories'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.GET_CATEGORIES);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 60000,
  });
}

export function useCreateSupplierCategory() {
  const queryClient = useQueryClient();
  return useMutation<SupplierCategoryRow, Error, { name: string; description?: string | null }>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.CREATE_CATEGORY, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'categories'] });
    },
  });
}

export function useAddSupplierContact() {
  const queryClient = useQueryClient();
  return useMutation<SupplierContactRow, Error, { supplierId: number; contact: any }>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.ADD_CONTACT, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'details', variables.supplierId] });
    },
  });
}

export function useRemoveSupplierContact(supplierId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.REMOVE_CONTACT, { id });
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'details', supplierId] });
    },
  });
}

export function useRecordQuickPurchase() {
  const queryClient = useQueryClient();
  return useMutation<any, Error, any>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.RECORD_QUICK_PURCHASE, input);
      if (!res.success) throw new Error(res.error.message || 'Quick purchase failed');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stockStatus'] });
      queryClient.invalidateQueries({ queryKey: ['procurement'] });
      queryClient.invalidateQueries({ queryKey: ['supplier'] });
    },
  });
}

export function useAddSupplierAddress() {
  const queryClient = useQueryClient();
  return useMutation<SupplierAddressRow, Error, { supplierId: number; address: any }>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.ADD_ADDRESS, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'details', variables.supplierId] });
    },
  });
}

export function useRemoveSupplierAddress(supplierId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.REMOVE_ADDRESS, { id });
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'details', supplierId] });
    },
  });
}

export function useAddSupplierBankAccount() {
  const queryClient = useQueryClient();
  return useMutation<SupplierBankAccountRow, Error, { supplierId: number; account: any }>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.ADD_BANK_ACCOUNT, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'details', variables.supplierId] });
    },
  });
}

export function useRemoveSupplierBankAccount(supplierId: number) {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.REMOVE_BANK_ACCOUNT, { id });
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'details', supplierId] });
    },
  });
}

export function useUpsertSupplierPaymentTerms() {
  const queryClient = useQueryClient();
  return useMutation<SupplierPaymentTermsRow, Error, { supplierId: number; terms: { payment_terms_days?: number; grace_period_days?: number } }>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.UPSERT_PAYMENT_TERMS, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'details', variables.supplierId] });
    },
  });
}

// ==========================================
// 2. Purchase Order Hooks
// ==========================================

export function usePurchaseOrders() {
  return useQuery<PurchaseOrderRow[]>({
    queryKey: ['procurement', 'purchase-orders'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.PO_GET_ALL);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 10000,
  });
}

export function usePurchaseOrderDetails(id: number | undefined) {
  return useQuery<{ po: PurchaseOrderRow; items: PurchaseOrderItemRow[] }>({
    queryKey: ['procurement', 'purchase-order', id],
    queryFn: async () => {
      if (!id) throw new Error('PO ID is required');
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.PO_GET_BY_ID, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!id,
    staleTime: 10000,
  });
}

export function useCreatePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<PurchaseOrderRow, Error, any>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.PO_CREATE, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-orders'] });
    },
  });
}

export function useSubmitPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.PO_SUBMIT, { id });
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-order', id] });
    },
  });
}

export function useApprovePurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.PO_APPROVE, { id });
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-order', id] });
    },
  });
}

export function useCancelPurchaseOrder() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.PO_CANCEL, { id });
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-order', id] });
    },
  });
}

// ==========================================
// 3. Goods Receipt (GRN) Hooks
// ==========================================

export function useGoodsReceipts() {
  return useQuery<GoodsReceiptRow[]>({
    queryKey: ['procurement', 'goods-receipts'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.GRN_GET_ALL);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 10000,
  });
}

export function useGoodsReceiptDetails(id: number | undefined) {
  return useQuery<{ grn: GoodsReceiptRow; items: GoodsReceiptItemRow[] }>({
    queryKey: ['procurement', 'goods-receipt', id],
    queryFn: async () => {
      if (!id) throw new Error('GRN ID is required');
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.GRN_GET_BY_ID, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!id,
    staleTime: 10000,
  });
}

export function useCreateGoodsReceipt() {
  const queryClient = useQueryClient();
  return useMutation<GoodsReceiptRow, Error, any>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.GRN_CREATE, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', 'goods-receipts'] });
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock'] });
    },
  });
}

// ==========================================
// 4. Purchase Invoice Hooks
// ==========================================

export function usePurchaseInvoices() {
  return useQuery<PurchaseInvoiceRow[]>({
    queryKey: ['procurement', 'purchase-invoices'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.INVOICE_GET_ALL);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 10000,
  });
}

export function useUpdateInvoiceStatus() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { invoiceId: number; status: 'approved' | 'rejected' }>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.INVOICE_UPDATE_STATUS, input);
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['procurement'] });
    },
  });
}

export function usePurchaseInvoiceDetails(id: number | undefined) {
  return useQuery<{ invoice: PurchaseInvoiceRow; items: PurchaseInvoiceItemRow[] }>({
    queryKey: ['procurement', 'purchase-invoice', id],
    queryFn: async () => {
      if (!id) throw new Error('Invoice ID is required');
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.INVOICE_GET_BY_ID, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!id,
    staleTime: 10000,
  });
}

export function useCreatePurchaseInvoice() {
  const queryClient = useQueryClient();
  return useMutation<PurchaseInvoiceRow, Error, any>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.INVOICE_CREATE, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-invoices'] });
      queryClient.invalidateQueries({ queryKey: ['supplier', 'profiles'] });
    },
  });
}

// ==========================================
// 5. Purchase Return Hooks
// ==========================================

export function usePurchaseReturns() {
  return useQuery<PurchaseReturnRow[]>({
    queryKey: ['procurement', 'purchase-returns'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.RETURN_GET_ALL);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 10000,
  });
}

export function usePurchaseReturnDetails(id: number | undefined) {
  return useQuery<{ returnRecord: PurchaseReturnRow; items: PurchaseReturnItemRow[] }>({
    queryKey: ['procurement', 'purchase-return', id],
    queryFn: async () => {
      if (!id) throw new Error('Return ID is required');
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.RETURN_GET_BY_ID, { id });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!id,
    staleTime: 10000,
  });
}

export function useCreatePurchaseReturn() {
  const queryClient = useQueryClient();
  return useMutation<PurchaseReturnRow, Error, any>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.RETURN_CREATE, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-returns'] });
      queryClient.invalidateQueries({ queryKey: ['supplier', 'profiles'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', 'stock'] });
    },
  });
}

// ==========================================
// 6. Supplier Ledger & Payment Hooks
// ==========================================

export function useSupplierPayments(supplierId?: number) {
  return useQuery<SupplierPaymentRow[]>({
    queryKey: ['supplier', 'payments', supplierId],
    queryFn: async () => {
      return [];
    },
    staleTime: 10000,
  });
}

export function useRecordSupplierPayment() {
  const queryClient = useQueryClient();
  return useMutation<SupplierPaymentRow, Error, any>({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.RECORD_PAYMENT, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'payments', variables.supplier_id] });
      queryClient.invalidateQueries({ queryKey: ['supplier', 'ledger', variables.supplier_id] });
      queryClient.invalidateQueries({ queryKey: ['supplier', 'profiles'] });
      queryClient.invalidateQueries({ queryKey: ['procurement', 'purchase-invoices'] });
    },
  });
}

export function useSupplierLedger(supplierId: number | undefined) {
  return useQuery<SupplierLedgerEntryRow[]>({
    queryKey: ['supplier', 'ledger', supplierId],
    queryFn: async () => {
      if (!supplierId) return [];
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.GET_LEDGER, { supplierId });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!supplierId,
    staleTime: 30000,
  });
}

export function useSupplierStatement(supplierId: number | undefined, startDate: string, endDate: string) {
  return useQuery<{
    supplier: any;
    startDate: string;
    endDate: string;
    openingBalancePaise: number;
    totalDebitPaise: number;
    totalCreditPaise: number;
    closingBalancePaise: number;
    entries: SupplierLedgerEntryRow[];
  }>({
    queryKey: ['supplier', 'statement', supplierId, startDate, endDate],
    queryFn: async () => {
      if (!supplierId) throw new Error('Supplier ID is required');
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.GET_STATEMENT, { supplierId, startDate, endDate });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!supplierId && !!startDate && !!endDate,
    staleTime: 30000,
  });
}

export function useRecordSupplierAdjustment() {
  const queryClient = useQueryClient();
  return useMutation<
    SupplierLedgerEntryRow,
    Error,
    { supplierId: number; amountPaise: number; type: 'debit' | 'credit'; description: string }
  >({
    mutationFn: async (input) => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.RECORD_ADJUSTMENT, input);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['supplier', 'ledger', variables.supplierId] });
      queryClient.invalidateQueries({ queryKey: ['supplier', 'profiles'] });
    },
  });
}

// ==========================================
// 7. Reporting & Analytics Hooks
// ==========================================

export function useSupplierAgingReport() {
  return useQuery<SupplierAgingRow[]>({
    queryKey: ['supplier', 'report', 'aging'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.GET_AGING_REPORT);
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 30000,
  });
}

export function useSupplierPurchaseVolumes(startDate: string, endDate: string) {
  return useQuery<SupplierPurchaseVolumeRow[]>({
    queryKey: ['supplier', 'report', 'purchase-volumes', startDate, endDate],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.SUPPLIERS.GET_PURCHASE_VOLUMES, { startDate, endDate });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!startDate && !!endDate,
    staleTime: 30000,
  });
}

export function useSupplierLedgerSummary(supplierId: number | undefined, startDate: string, endDate: string) {
  return useQuery<{
    opening_balance_paise: number;
    total_debit_paise: number;
    total_credit_paise: number;
    closing_balance_paise: number;
  }>({
    queryKey: ['supplier', 'report', 'ledger-summary', supplierId, startDate, endDate],
    queryFn: async () => {
      return {
        opening_balance_paise: 0,
        total_debit_paise: 0,
        total_credit_paise: 0,
        closing_balance_paise: 0,
      };
    },
    staleTime: 30000,
  });
}

export function usePriceHistoryTrend(productVariantId: number | undefined) {
  return useQuery<{
    productVariantId: number;
    variantName: string;
    stats: {
      min_price_paise: number | null;
      max_price_paise: number | null;
      avg_price_paise: number | null;
      latest_price_paise: number | null;
    };
    trends: any[];
  }>({
    queryKey: ['procurement', 'report', 'price-trend', productVariantId],
    queryFn: async () => {
      if (!productVariantId) throw new Error('Product Variant ID is required');
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.GET_PRICE_HISTORY, { productVariantId });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!productVariantId,
    staleTime: 30000,
  });
}

export function useCheapestSupplier(productVariantId: number | undefined) {
  return useQuery<{
    productVariantId: number;
    suggestedSupplier: {
      supplier_id: number;
      company_name: string;
      supplier_code: string;
      unit_price_paise: number;
      effective_date: string;
    } | null;
  }>({
    queryKey: ['procurement', 'report', 'cheapest-supplier', productVariantId],
    queryFn: async () => {
      if (!productVariantId) throw new Error('Product Variant ID is required');
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.GET_CHEAPEST_SUPPLIER, { productVariantId });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!productVariantId,
    staleTime: 30000,
  });
}

export function usePurchaseRegister(startDate: string, endDate: string) {
  return useQuery<{
    startDate: string;
    endDate: string;
    summary: {
      invoice_count: number;
      total_subtotal_paise: number;
      total_gst_paise: number;
      total_cgst_paise: number;
      total_sgst_paise: number;
      total_igst_paise: number;
      total_freight_charges_paise: number;
      total_loading_charges_paise: number;
      total_packing_charges_paise: number;
      total_other_charges_paise: number;
      total_discount_paise: number;
      total_amount_paise: number;
    };
    invoices: any[];
  }>({
    queryKey: ['procurement', 'report', 'purchase-register', startDate, endDate],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.PROCUREMENT.GET_PURCHASE_REGISTER, { startDate, endDate });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!startDate && !!endDate,
    staleTime: 30000,
  });
}

export function usePassbookLedger(params?: { supplierId?: number; startDate?: string; endDate?: string; status?: string }) {
  return useQuery<{ entries: PassbookLedgerEntry[]; summary: PurchasesMonthSummary }>({
    queryKey: ['procurement', 'passbook', params],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_PASSBOOK_LEDGER, params || {});
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    staleTime: 10000,
  });
}

export function useSupplierSnapshot(supplierId?: number) {
  return useQuery<SupplierSnapshot | null>({
    queryKey: ['procurement', 'snapshot', supplierId],
    queryFn: async () => {
      if (!supplierId) return null;
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_SUPPLIER_SNAPSHOT, { supplier_id: supplierId });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!supplierId,
    staleTime: 10000,
  });
}

export function useEditPurchaseRecord() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { invoiceId: number; updateData: any; reason: string }>({
    mutationFn: async ({ invoiceId, updateData, reason }) => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.EDIT_PURCHASE, { invoice_id: invoiceId, update_data: updateData, reason });
      if (!res.success) throw new Error(res.error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement'] });
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
}

export function usePrintPurchaseThermal() {
  return useMutation<{ receiptText: string }, Error, { invoiceId: number }>({
    mutationFn: async ({ invoiceId }) => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.PRINT_PURCHASE_THERMAL, { invoice_id: invoiceId });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
  });
}

export function useLastPurchaseRate(supplierId?: number, variantId?: number) {
  return useQuery<number | null>({
    queryKey: ['procurement', 'lastRate', supplierId, variantId],
    queryFn: async () => {
      if (!supplierId || !variantId) return null;
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_LAST_PURCHASE_RATE, {
        supplier_id: supplierId,
        product_variant_id: variantId,
      });
      if (!res.success) throw new Error(res.error.message);
      return res.data;
    },
    enabled: !!supplierId && !!variantId,
    staleTime: 30000,
  });
}
