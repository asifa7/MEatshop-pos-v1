import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { 
  PosSession, 
  ShiftSummaryItem, 
  ShiftMovementType 
} from '../../../../core/types/enterprise_types';

export interface ShiftMovementInput {
  movement_type: ShiftMovementType;
  category: string;
  amount_paise: number;
  reason: string;
  added_by?: string;
  taken_by?: string;
  expense_category_id?: number;
}

export interface ShiftClosingInput {
  sessionId: number;
  closingCashPaise: number;
  denominations?: Record<string, number>;
  countedByMethod?: Record<string, number>;
  declaredReason?: string;
  notes?: string;
}

export interface ShiftCorrectionInput {
  sessionId: number;
  movementId?: number;
  action: 'update_movement' | 'delete_movement' | 'adjust_closing';
  amount_paise?: number;
  category?: string;
  reason: string;
  authPinOrPassword?: string;
}

export interface ShiftHistoryFilter {
  startDate?: string;
  endDate?: string;
  cashierId?: number;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export function useCashBox(activeSessionId?: number) {
  const queryClient = useQueryClient();

  const currentSessionQuery = useQuery<any>({
    queryKey: ['cashbox', 'current-session'],
    queryFn: async () => {
      const res = await window.api.invoke('cashbox:get-current-session');
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch current shift session');
      return res.data;
    },
    staleTime: 10_000,
  });

  const sessionId = activeSessionId || currentSessionQuery.data?.id;

  const dashboardQuery = useQuery({
    queryKey: ['cashbox', 'dashboard', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const res = await window.api.invoke('cashbox:get-dashboard', { sessionId });
      if (!res.success) throw new Error(res.error?.message || 'Failed to load shift dashboard');
      return res.data;
    },
    enabled: !!sessionId,
    staleTime: 5_000,
  });

  const lastClosedQuery = useQuery({
    queryKey: ['cashbox', 'last-closed'],
    queryFn: async () => {
      const res = await window.api.invoke('cashbox:get-last-closed');
      if (res?.success) return res.data;
      // Fallback via shift history
      const hist = await window.api.invoke('cashbox:get-shift-history', { limit: 10 });
      if (hist?.success && Array.isArray(hist.data?.shifts)) {
        const lastClosed = hist.data.shifts.find((s: any) => s.status === 'Closed');
        if (lastClosed) {
          return {
            previousSessionId: lastClosed.id,
            previousClosingCashPaise: lastClosed.physical_cash_paise ?? lastClosed.expected_cash_paise ?? 0,
            previousClosedAt: lastClosed.closed_at,
            previousCashierName: lastClosed.cashier_name,
          };
        }
      }
      return { previousSessionId: null, previousClosingCashPaise: 0, previousClosedAt: null, previousCashierName: null };
    },
    staleTime: 10_000,
  });

  const paymentMethodsQuery = useQuery({
    queryKey: ['cashbox', 'payment-methods'],
    queryFn: async () => {
      const res = await window.api.invoke('cashbox:get-payment-methods', { includeDisabled: true });
      if (res?.success && Array.isArray(res.data)) return res.data;
      return [
        { id: 1, method_key: 'cash', display_name: 'Cash', method_type: 'CASH', is_enabled: 1, sort_order: 1 },
        { id: 2, method_key: 'paytm', display_name: 'Paytm', method_type: 'UPI', is_enabled: 1, sort_order: 2 },
        { id: 3, method_key: 'gpay', display_name: 'Google Pay', method_type: 'UPI', is_enabled: 1, sort_order: 3 },
        { id: 4, method_key: 'phonepe', display_name: 'PhonePe', method_type: 'UPI', is_enabled: 1, sort_order: 4 },
        { id: 5, method_key: 'card', display_name: 'Card', method_type: 'CARD', is_enabled: 1, sort_order: 5 },
        { id: 6, method_key: 'other', display_name: 'Other', method_type: 'OTHER', is_enabled: 1, sort_order: 6 },
      ];
    },
    staleTime: 15_000,
  });

  const transactionsQuery = useQuery({
    queryKey: ['cashbox', 'transactions', sessionId],
    queryFn: async () => {
      if (!sessionId) return [];
      const res = await window.api.invoke('cashbox:get-shift-transactions', { sessionId });
      if (!res.success) throw new Error(res.error?.message || 'Failed to load shift transactions');
      return res.data;
    },
    enabled: !!sessionId,
    staleTime: 5_000,
  });

  const expenseCategoriesQuery = useQuery({
    queryKey: ['expenses', 'categories'],
    queryFn: async () => {
      const res = await window.api.invoke('expenses:get-categories');
      if (!res.success) return [];
      return res.data || [];
    },
    staleTime: 60_000,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['cashbox'] });
  };

  const openSessionMutation = useMutation({
    mutationFn: async (input: { openingCashPaise: number; denominations?: Record<string, number>; openingVarianceReason?: string }) => {
      const res = await window.api.invoke('cashbox:open-session', input);
      if (!res.success) throw new Error(res.error?.message || 'Failed to open shift session');
      return res.data;
    },
    onSuccess: invalidateAll,
  });

  const savePaymentMethodMutation = useMutation({
    mutationFn: async (input: { id?: number; method_key?: string; display_name: string; method_type?: string; is_enabled?: boolean | number; sort_order?: number }) => {
      const res = await window.api.invoke('cashbox:save-payment-method', input);
      if (!res.success) throw new Error(res.error?.message || 'Failed to save payment method');
      return res.data;
    },
    onSuccess: invalidateAll,
  });

  const recordMovementMutation = useMutation({
    mutationFn: async (input: ShiftMovementInput) => {
      const res = await window.api.invoke('cashbox:record-movement', input);
      if (!res.success) throw new Error(res.error?.message || 'Failed to record cash movement');
      return res.data;
    },
    onSuccess: invalidateAll,
  });

  const updateOpenMovementMutation = useMutation({
    mutationFn: async ({ movementId, input }: { movementId: number; input: Partial<ShiftMovementInput> }) => {
      const res = await window.api.invoke('cashbox:update-open-movement', { movementId, input });
      if (!res.success) throw new Error(res.error?.message || 'Failed to update movement');
      return res.data;
    },
    onSuccess: invalidateAll,
  });

  const deleteOpenMovementMutation = useMutation({
    mutationFn: async (movementId: number) => {
      const res = await window.api.invoke('cashbox:delete-open-movement', { movementId });
      if (!res.success) throw new Error(res.error?.message || 'Failed to delete movement');
      return res.data;
    },
    onSuccess: invalidateAll,
  });

  const closeSessionMutation = useMutation({
    mutationFn: async (input: ShiftClosingInput) => {
      const res = await window.api.invoke('cashbox:close-session', input);
      if (!res.success) throw new Error(res.error?.message || 'Failed to close shift session');
      return res.data;
    },
    onSuccess: invalidateAll,
  });

  const applyCorrectionMutation = useMutation({
    mutationFn: async (input: ShiftCorrectionInput) => {
      const res = await window.api.invoke('cashbox:apply-correction', input);
      if (!res.success) throw new Error(res.error?.message || 'Failed to apply shift correction');
      return res.data;
    },
    onSuccess: invalidateAll,
  });

  return {
    currentSession: currentSessionQuery.data,
    isLoadingSession: currentSessionQuery.isLoading,
    dashboard: dashboardQuery.data,
    isLoadingDashboard: dashboardQuery.isLoading,
    lastClosedSummary: dashboardQuery.data?.previousShiftSummary || lastClosedQuery.data,
    paymentMethods: paymentMethodsQuery.data || [],
    savePaymentMethod: savePaymentMethodMutation.mutateAsync,
    isSavingPaymentMethod: savePaymentMethodMutation.isPending,
    transactions: transactionsQuery.data || [],
    isLoadingTransactions: transactionsQuery.isLoading,
    expenseCategories: expenseCategoriesQuery.data || [],
    openSession: openSessionMutation.mutateAsync,
    isOpeningSession: openSessionMutation.isPending,
    recordMovement: recordMovementMutation.mutateAsync,
    isRecordingMovement: recordMovementMutation.isPending,
    updateOpenMovement: updateOpenMovementMutation.mutateAsync,
    isUpdatingOpenMovement: updateOpenMovementMutation.isPending,
    deleteOpenMovement: deleteOpenMovementMutation.mutateAsync,
    isDeletingOpenMovement: deleteOpenMovementMutation.isPending,
    closeSession: closeSessionMutation.mutateAsync,
    isClosingSession: closeSessionMutation.isPending,
    applyCorrection: applyCorrectionMutation.mutateAsync,
    isApplyingCorrection: applyCorrectionMutation.isPending,
    refresh: invalidateAll,
  };
}

export function useShiftHistory(filter: ShiftHistoryFilter = {}) {
  return useQuery({
    queryKey: ['cashbox', 'history', filter],
    queryFn: async () => {
      const res = await window.api.invoke('cashbox:get-shift-history', filter);
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch shift history');
      return res.data as { shifts: ShiftSummaryItem[]; total: number };
    },
    staleTime: 10_000,
  });
}

export function useShiftDetails(sessionId?: number) {
  return useQuery({
    queryKey: ['cashbox', 'details', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;
      const res = await window.api.invoke('cashbox:get-shift-details', { sessionId });
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch shift details');
      return res.data;
    },
    enabled: !!sessionId,
    staleTime: 5_000,
  });
}
