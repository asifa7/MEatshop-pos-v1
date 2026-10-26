// useReconciliation.ts
// React Query hooks for Shift-End Bank Statement Reconciliation (Phase 3B)

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import type {
  StatementImportProfile,
  ReconciliationResult,
  StatementTransactionRow,
} from '../../types/reconciliation.types';

export function useReconciliationProfiles() {
  return useQuery<StatementImportProfile[]>({
    queryKey: ['reconciliation-profiles'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.RECONCILIATION.GET_PROFILES);
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch profiles');
      return res.data;
    },
  });
}

export function useSaveReconciliationProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (profile: Partial<StatementImportProfile>) => {
      const res = await window.api.invoke(IPC_CHANNELS.RECONCILIATION.SAVE_PROFILE, profile);
      if (!res.success) throw new Error(res.error?.message || 'Failed to save profile');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-profiles'] });
    },
  });
}

export function useParseCsvPreview() {
  return useMutation({
    mutationFn: async (csvContent: string) => {
      const res = await window.api.invoke(IPC_CHANNELS.RECONCILIATION.PARSE_CSV_PREVIEW, { csvContent });
      if (!res.success) throw new Error(res.error?.message || 'Failed to parse CSV preview');
      return res.data;
    },
  });
}

export function useIngestStatement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      fileName: string;
      csvContent: string;
      profileId?: number;
      shiftDate: string;
      customMapping?: any;
    }) => {
      const res = await window.api.invoke(IPC_CHANNELS.RECONCILIATION.INGEST_STATEMENT, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to ingest statement');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-results'] });
    },
  });
}

export function useRunMatching() {
  const queryClient = useQueryClient();
  return useMutation<ReconciliationResult, Error, {
    importId: number;
    shiftDate: string;
    clockOffsetMinutes?: number;
    windowMinutes?: number;
  }>({
    mutationFn: async (params) => {
      const res = await window.api.invoke(IPC_CHANNELS.RECONCILIATION.RUN_MATCHING, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to run matching');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-results'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-shift-summary'] });
    },
  });
}

export function useManualMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { transactionId: number; invoiceId: number; note?: string }) => {
      const res = await window.api.invoke(IPC_CHANNELS.RECONCILIATION.MANUAL_MATCH, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to manually match bill');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-results'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-shift-summary'] });
    },
  });
}

export function useMarkNotASale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { transactionId: number; reason: string }) => {
      const res = await window.api.invoke(IPC_CHANNELS.RECONCILIATION.MARK_NOT_A_SALE, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to mark not a sale');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-results'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-shift-summary'] });
    },
  });
}

export function useLinkPayerAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { customerId: number; upiHandle: string; payerName?: string }) => {
      const res = await window.api.invoke(IPC_CHANNELS.RECONCILIATION.LINK_PAYER_ALIAS, params);
      if (!res.success) throw new Error(res.error?.message || 'Failed to link payer UPI alias');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['customer-upi-identities'] });
    },
  });
}

export function useShiftReconciliationSummary(shiftDate: string, importId?: number) {
  return useQuery({
    queryKey: ['reconciliation-shift-summary', shiftDate, importId],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.RECONCILIATION.GET_SHIFT_SUMMARY, { shiftDate, importId });
      if (!res.success) throw new Error(res.error?.message || 'Failed to fetch shift summary');
      return res.data;
    },
    enabled: !!shiftDate,
  });
}

export function useSyncGatewaySettlements() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      provider: string;
      merchantId: string;
      apiKey: string;
      shiftDate: string;
    }) => {
      const res = await window.api.invoke(IPC_CHANNELS.RECONCILIATION.SYNC_GATEWAY, params);
      if (!res.success) throw new Error(res.error?.message || 'Gateway sync failed');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-results'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation-shift-summary'] });
    },
  });
}

