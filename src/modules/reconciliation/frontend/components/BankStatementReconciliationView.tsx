// BankStatementReconciliationView.tsx
// Phase 3B: Shift-End Statement Matching View

import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  CheckCircle2, 
  AlertTriangle, 
  HelpCircle, 
  FileText, 
  ArrowRight, 
  RefreshCw, 
  Clock, 
  DollarSign, 
  UserCheck, 
  ShieldAlert, 
  Link as LinkIcon,
  X,
  ChevronDown,
  Info
} from 'lucide-react';
import { 
  useReconciliationProfiles, 
  useParseCsvPreview, 
  useIngestStatement, 
  useRunMatching, 
  useManualMatch, 
  useMarkNotASale, 
  useLinkPayerAlias,
  useSyncGatewaySettlements
} from '../hooks/useReconciliation';
import type { ReconciliationResult, StatementTransactionRow, UnmatchedBill } from '../../types/reconciliation.types';

export const BankStatementReconciliationView: React.FC = () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [shiftDate, setShiftDate] = useState<string>(todayStr);
  const [selectedProfileId, setSelectedProfileId] = useState<number | undefined>(undefined);
  const [clockOffsetMinutes, setClockOffsetMinutes] = useState<number>(0);
  const [windowMinutes, setWindowMinutes] = useState<number>(10);

  // Reconciliation Mode: Manual CSV vs Automatic Gateway Sync
  const [reconMode, setReconMode] = useState<'csv' | 'gateway'>('csv');
  const [gatewayProvider, setGatewayProvider] = useState<'PhonePe Merchant' | 'Paytm Business' | 'Razorpay' | 'HDFC SmartHub'>('PhonePe Merchant');
  const [gatewayMerchantId, setGatewayMerchantId] = useState<string>('MERCHANT_LIVE_001');
  const [gatewayApiKey, setGatewayApiKey] = useState<string>('rzp_test_key_secret');
  const [gatewayFeedback, setGatewayFeedback] = useState<string | null>(null);

  // Upload & File State
  const [fileName, setFileName] = useState<string>('');
  const [csvContent, setCsvContent] = useState<string>('');
  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);

  // Result state
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null);
  const [activeTab, setActiveTab] = useState<'matched' | 'unmatched_bills' | 'unmatched_credits' | 'review'>('matched');

  // Modals & Actions State
  const [selectedTxnForNotSale, setSelectedTxnForNotSale] = useState<StatementTransactionRow | null>(null);
  const [notSaleReason, setNotSaleReason] = useState<string>('');
  const [selectedTxnForManualMatch, setSelectedTxnForManualMatch] = useState<StatementTransactionRow | null>(null);
  const [manualMatchInvoiceId, setManualMatchInvoiceId] = useState<string>('');
  const [manualMatchNote, setManualMatchNote] = useState<string>('');
  const [aliasPrompt, setAliasPrompt] = useState<{ customerId: number; customerName: string; upiHandle: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Queries & Mutations
  const { data: profiles = [], isLoading: loadingProfiles } = useReconciliationProfiles();
  const parsePreviewMutation = useParseCsvPreview();
  const ingestMutation = useIngestStatement();
  const runMatchingMutation = useRunMatching();
  const manualMatchMutation = useManualMatch();
  const markNotSaleMutation = useMarkNotASale();
  const linkAliasMutation = useLinkPayerAlias();
  const syncGatewayMutation = useSyncGatewaySettlements();

  // Handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      try {
        const preview = await parsePreviewMutation.mutateAsync(text);
        setCsvPreview(preview);
      } catch (err: any) {
        alert(`Failed to parse CSV: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleStartReconciliation = async () => {
    if (!csvContent) {
      alert('Please select or upload a statement CSV file first.');
      return;
    }

    try {
      // Step 1: Ingest CSV into DB
      const ingestRes = await ingestMutation.mutateAsync({
        fileName: fileName || 'Statement.csv',
        csvContent,
        profileId: selectedProfileId,
        shiftDate,
      });

      // Step 2: Run 4-phase matching engine
      const matchRes = await runMatchingMutation.mutateAsync({
        importId: ingestRes.importId,
        shiftDate,
        clockOffsetMinutes,
        windowMinutes,
      });

      setReconciliationResult(matchRes);
    } catch (err: any) {
      alert(`Reconciliation error: ${err.message}`);
    }
  };

  const handleConfirmManualMatch = async () => {
    if (!selectedTxnForManualMatch || !manualMatchInvoiceId) return;
    try {
      await manualMatchMutation.mutateAsync({
        transactionId: selectedTxnForManualMatch.id,
        invoiceId: parseInt(manualMatchInvoiceId, 10),
        note: manualMatchNote || 'Manual match confirmed by manager',
      });
      setSelectedTxnForManualMatch(null);
      setManualMatchInvoiceId('');
      setManualMatchNote('');
      // Re-run matching to refresh state
      if (reconciliationResult) {
        handleStartReconciliation();
      }
    } catch (err: any) {
      alert(`Manual match failed: ${err.message}`);
    }
  };

  const handleConfirmNotSale = async () => {
    if (!selectedTxnForNotSale || !notSaleReason.trim()) return;
    try {
      await markNotSaleMutation.mutateAsync({
        transactionId: selectedTxnForNotSale.id,
        reason: notSaleReason,
      });
      setSelectedTxnForNotSale(null);
      setNotSaleReason('');
      if (reconciliationResult) {
        handleStartReconciliation();
      }
    } catch (err: any) {
      alert(`Failed to mark not a sale: ${err.message}`);
    }
  };

  const handleConfirmLinkAlias = async () => {
    if (!aliasPrompt) return;
    try {
      await linkAliasMutation.mutateAsync({
        customerId: aliasPrompt.customerId,
        upiHandle: aliasPrompt.upiHandle,
      });
      alert(`✓ Linked UPI ID "${aliasPrompt.upiHandle}" to ${aliasPrompt.customerName}`);
      setAliasPrompt(null);
    } catch (err: any) {
      alert(`Failed to link UPI alias: ${err.message}`);
    }
  };

  const formatPaise = (paise: number) => {
    return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="flex flex-col h-full bg-surface-base text-text-primary p-5 overflow-y-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-subtle pb-4">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <RefreshCw className="text-brand-500" size={22} />
            Shift-End Bank Statement Reconciliation
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Phase 3B: Reconcile UPI and card payment tenders with uploaded bank / PhonePe / Paytm / GPay statements.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold text-text-secondary">Shift Date:</label>
          <input
            type="date"
            value={shiftDate}
            onChange={(e) => setShiftDate(e.target.value)}
            className="bg-surface-panel border border-border-subtle text-xs px-2.5 py-1.5 rounded-lg text-text-primary font-medium focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-surface-panel p-2.5 rounded-2xl border border-border-subtle gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-text-muted uppercase tracking-wider ml-1">Reconciliation Mode:</span>
          <div className="inline-flex rounded-xl p-1 bg-surface-card border border-border-subtle">
            <button
              type="button"
              onClick={() => setReconMode('csv')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                reconMode === 'csv'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              📄 Manual CSV Upload
            </button>
            <button
              type="button"
              onClick={() => setReconMode('gateway')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                reconMode === 'gateway'
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              ⚡ Automatic Gateway Polling (Webhooks / API)
            </button>
          </div>
        </div>

        <div className="text-xs text-text-muted flex items-center gap-1.5">
          <Info size={14} className="text-brand-400" />
          <span>{reconMode === 'csv' ? 'Upload net banking / merchant statement' : 'Direct API fetch of settlements from payment provider'}</span>
        </div>
      </div>

      {reconMode === 'gateway' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 bg-surface-panel border border-border-subtle rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <span className="text-xs font-black uppercase tracking-wider text-text-primary flex items-center gap-2">
                <RefreshCw size={16} className="text-emerald-400" />
                Automatic Gateway Settlement Sync
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-bold border border-emerald-500/30">
                Live / Sandbox Adapter Ready
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-text-muted uppercase">Payment Provider</label>
                <select
                  value={gatewayProvider}
                  onChange={(e: any) => setGatewayProvider(e.target.value)}
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 font-bold text-text-primary"
                >
                  <option value="PhonePe Merchant">PhonePe Merchant (UPI / QR / Smart POS)</option>
                  <option value="Paytm Business">Paytm for Business (Soundbox / All-in-One)</option>
                  <option value="Razorpay">Razorpay (Payment Gateway / UPI POS)</option>
                  <option value="HDFC SmartHub">HDFC Bank SmartHub Vyapar</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-text-muted uppercase">Merchant ID (MID) *</label>
                <input
                  type="text"
                  value={gatewayMerchantId}
                  onChange={(e) => setGatewayMerchantId(e.target.value)}
                  placeholder="e.g. MERCH_89412"
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 font-mono font-bold text-text-primary"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-text-muted uppercase">API Key / Salt Key / Secret *</label>
                <input
                  type="password"
                  value={gatewayApiKey}
                  onChange={(e) => setGatewayApiKey(e.target.value)}
                  placeholder="Paste merchant salt key or API secret"
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 mt-1 font-mono text-text-primary"
                />
              </div>
            </div>

            {gatewayFeedback && (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                {gatewayFeedback}
              </div>
            )}

            <button
              onClick={async () => {
                try {
                  setGatewayFeedback(null);
                  const res = await syncGatewayMutation.mutateAsync({
                    provider: gatewayProvider,
                    merchantId: gatewayMerchantId,
                    apiKey: gatewayApiKey,
                    shiftDate,
                  });
                  setGatewayFeedback(`✓ ${res.message} - Polled & reconciled ${res.count} transactions!`);
                  setReconciliationResult(res.result);
                } catch (err: any) {
                  alert(`Gateway sync error: ${err.message}`);
                }
              }}
              disabled={syncGatewayMutation.isPending}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99]"
            >
              <RefreshCw size={15} className={syncGatewayMutation.isPending ? 'animate-spin' : ''} />
              <span>{syncGatewayMutation.isPending ? 'Connecting & Polling Settlements...' : `Sync & Reconcile ${gatewayProvider} (${shiftDate})`}</span>
            </button>
          </div>

          {/* Credentials Guide Box */}
          <div className="lg:col-span-5 bg-surface-panel border border-border-subtle rounded-2xl p-5 space-y-3">
            <span className="text-xs font-black uppercase tracking-wider text-text-primary flex items-center gap-1.5 border-b border-border-subtle pb-2">
              <HelpCircle size={15} className="text-brand-400" />
              Credentials & Webhook Setup Guide
            </span>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-surface-card border border-border-subtle">
                <span className="font-bold text-emerald-400 block">PhonePe Merchant:</span>
                <span className="text-[11px] text-text-muted">
                  Log in to PhonePe Business Portal &gt; Developer Settings &gt; Copy Merchant ID and Salt Key (Index 1).
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-card border border-border-subtle">
                <span className="font-bold text-brand-400 block">Paytm for Business:</span>
                <span className="text-[11px] text-text-muted">
                  Log in to Paytm Dashboard &gt; API Keys &gt; Generate Production MID and Merchant Key.
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-card border border-border-subtle">
                <span className="font-bold text-amber-400 block">Razorpay:</span>
                <span className="text-[11px] text-text-muted">
                  Razorpay Dashboard &gt; Settings &gt; API Keys &gt; Key ID and Secret.
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-surface-card border border-border-subtle">
                <span className="font-bold text-blue-400 block">HDFC SmartHub:</span>
                <span className="text-[11px] text-text-muted">
                  SmartHub Vyapar &gt; Profile &gt; Terminal Identifier and Aggregator Secret.
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Control Panel: Upload, Preset & Settings */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Upload Card */}
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">1. Upload Statement CSV</span>
              <FileText size={16} className="text-text-muted" />
            </div>
            <p className="text-xs text-text-secondary mb-3">
              Export the settlement or transaction statement from your merchant portal or net banking.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border-subtle hover:border-brand-500/50 hover:bg-brand-500/5 transition rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer"
            >
              <UploadCloud size={24} className="text-brand-500 mb-1" />
              <span className="text-xs font-semibold">{fileName ? fileName : 'Click to select CSV file'}</span>
              <span className="text-[10px] text-text-muted mt-0.5">Supports PhonePe, Paytm, GPay, HDFC, SBI exports</span>
            </button>
          </div>
          {csvPreview && (
            <div className="mt-3 text-[11px] text-emerald-500 flex items-center gap-1 font-medium">
              <CheckCircle2 size={13} />
              Parsed {csvPreview.rows.length} rows ({csvPreview.headers.length} columns)
            </div>
          )}
        </div>

        {/* Bank Mapping Profile */}
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">2. Bank / Aggregator Preset</span>
              <CheckCircle2 size={16} className="text-text-muted" />
            </div>
            <p className="text-xs text-text-secondary mb-3">
              Select your payment provider preset or saved column configuration.
            </p>
            <select
              value={selectedProfileId || (profiles.find(p => p.is_default)?.id || '')}
              onChange={(e) => setSelectedProfileId(Number(e.target.value))}
              className="w-full bg-surface-base border border-border-subtle text-xs px-3 py-2 rounded-lg text-text-primary font-medium focus:ring-1 focus:ring-brand-500"
            >
              {profiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.profile_name} {p.is_default ? '(Default)' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="text-[11px] text-text-muted mt-3 bg-surface-base/50 p-2 rounded border border-border-subtle">
            Maps Reference ID/UTR, Credit Amount, Timestamp, and Payer UPI ID automatically.
          </div>
        </div>

        {/* Matching Tolerances & Action */}
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted">3. Tolerance Settings</span>
              <Clock size={16} className="text-text-muted" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[11px] text-text-muted block mb-1">Clock Offset (Mins):</label>
                <input
                  type="number"
                  value={clockOffsetMinutes}
                  onChange={(e) => setClockOffsetMinutes(Number(e.target.value))}
                  className="w-full bg-surface-base border border-border-subtle text-xs px-2.5 py-1.5 rounded-lg text-text-primary"
                  title="Shift bank clock vs POS system clock"
                />
              </div>
              <div>
                <label className="text-[11px] text-text-muted block mb-1">Match Window (Mins):</label>
                <input
                  type="number"
                  value={windowMinutes}
                  onChange={(e) => setWindowMinutes(Number(e.target.value))}
                  className="w-full bg-surface-base border border-border-subtle text-xs px-2.5 py-1.5 rounded-lg text-text-primary"
                  title="Allowed time delay between POS bill and bank credit"
                />
              </div>
            </div>
          </div>
          <button
            onClick={handleStartReconciliation}
            disabled={!csvContent || ingestMutation.isPending || runMatchingMutation.isPending}
            className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 ${
              !csvContent || ingestMutation.isPending || runMatchingMutation.isPending
                ? 'bg-brand-500/30 text-white/50 cursor-not-allowed'
                : 'bg-brand-500 hover:bg-brand-600 text-white shadow-md'
            }`}
          >
            {ingestMutation.isPending || runMatchingMutation.isPending ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                Matching In Progress...
              </>
            ) : (
              <>
                <RefreshCw size={14} />
                Run Shift Reconciliation
              </>
            )}
          </button>
        </div>
      </div>
      )}

      {/* Summary KPI Strip */}
      {reconciliationResult && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="bg-surface-panel border border-border-subtle p-3 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-text-muted block mb-1">Billed UPI / Card</span>
            <span className="text-base font-black text-text-primary">
              {formatPaise(reconciliationResult.summary.total_billed_upi_card_paise)}
            </span>
          </div>

          <div className="bg-surface-panel border border-border-subtle p-3 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-text-muted block mb-1">Matched in Bank</span>
            <span className="text-base font-black text-emerald-500">
              {formatPaise(reconciliationResult.summary.total_matched_paise)}
            </span>
            <span className="text-[10px] text-text-muted block mt-0.5">{reconciliationResult.matched.length} bills matched</span>
          </div>

          <div className="bg-surface-panel border border-border-subtle p-3 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-text-muted block mb-1">Unmatched Bills</span>
            <span className="text-base font-black text-red-500">
              {formatPaise(reconciliationResult.summary.unmatched_bills_paise)}
            </span>
            <span className="text-[10px] text-text-muted block mt-0.5">{reconciliationResult.unmatched_bills.length} bills missing payment</span>
          </div>

          <div className="bg-surface-panel border border-border-subtle p-3 rounded-xl">
            <span className="text-[10px] uppercase font-bold text-text-muted block mb-1">Unmatched Bank Credits</span>
            <span className="text-base font-black text-amber-500">
              {formatPaise(reconciliationResult.summary.unmatched_credits_paise)}
            </span>
            <span className="text-[10px] text-text-muted block mt-0.5">{reconciliationResult.unmatched_credits.length} unlinked credits</span>
          </div>

          <div className={`p-3 rounded-xl border ${
            reconciliationResult.summary.difference_status === 'balanced'
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-amber-500/10 border-amber-500/30'
          }`}>
            <span className="text-[10px] uppercase font-bold text-text-muted block mb-1">Net Discrepancy</span>
            <span className={`text-base font-black ${
              reconciliationResult.summary.difference_status === 'balanced' ? 'text-emerald-500' : 'text-amber-500'
            }`}>
              {formatPaise(Math.abs(reconciliationResult.summary.difference_paise))}
              <span className="text-[11px] font-semibold ml-1">
                ({reconciliationResult.summary.difference_status})
              </span>
            </span>
          </div>
        </div>
      )}

      {/* 4 Interactive Tabbed Lists */}
      {reconciliationResult && (
        <div className="bg-surface-panel border border-border-subtle rounded-xl flex-1 flex flex-col overflow-hidden">
          {/* Tab Headers */}
          <div className="flex items-center border-b border-border-subtle bg-surface-base/50 px-4 pt-2 gap-2">
            <button
              onClick={() => setActiveTab('matched')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
                activeTab === 'matched'
                  ? 'border-brand-500 text-brand-500 bg-surface-panel'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <CheckCircle2 size={14} className="text-emerald-500" />
              Matched ({reconciliationResult.matched.length})
            </button>

            <button
              onClick={() => setActiveTab('unmatched_bills')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
                activeTab === 'unmatched_bills'
                  ? 'border-brand-500 text-brand-500 bg-surface-panel'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <AlertTriangle size={14} className="text-red-500" />
              Bills With No Payment ({reconciliationResult.unmatched_bills.length})
            </button>

            <button
              onClick={() => setActiveTab('unmatched_credits')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
                activeTab === 'unmatched_credits'
                  ? 'border-brand-500 text-brand-500 bg-surface-panel'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <DollarSign size={14} className="text-amber-500" />
              Payments With No Bill ({reconciliationResult.unmatched_credits.length})
            </button>

            <button
              onClick={() => setActiveTab('review')}
              className={`px-4 py-2.5 text-xs font-bold rounded-t-lg transition flex items-center gap-2 border-b-2 ${
                activeTab === 'review'
                  ? 'border-brand-500 text-brand-500 bg-surface-panel'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <ShieldAlert size={14} className="text-indigo-400" />
              Review Queue ({reconciliationResult.review_queue.length})
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-4 flex-1 overflow-y-auto">
            {/* 1. MATCHED TAB */}
            {activeTab === 'matched' && (
              <div className="space-y-2">
                {reconciliationResult.matched.length === 0 ? (
                  <div className="p-8 text-center text-xs text-text-muted">No matched transactions found for this shift.</div>
                ) : (
                  reconciliationResult.matched.map(t => (
                    <div key={t.id} className="bg-surface-base p-3 rounded-lg border border-border-subtle flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          t.match_rule === 'exact_ref' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-400'
                        }`}>
                          {t.match_rule === 'exact_ref' ? 'Exact UTR' : 'Amount + Time'}
                        </span>
                        <div>
                          <span className="text-xs font-bold text-text-primary">Invoice #{t.invoice_number || t.matched_invoice_id}</span>
                          {t.customer_name && (
                            <span className="text-[11px] text-text-muted ml-2">({t.customer_name})</span>
                          )}
                          <div className="text-[10px] text-text-muted mt-0.5">
                            Bank Ref: {t.ref_no || 'N/A'} • Time: {new Date(t.txn_time).toLocaleTimeString()}
                            {t.payer_vpa && ` • VPA: ${t.payer_vpa}`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {t.payer_vpa && t.customer_id && (
                          <button
                            onClick={() => setAliasPrompt({ customerId: t.customer_id!, customerName: t.customer_name || 'Customer', upiHandle: t.payer_vpa! })}
                            className="text-[10px] bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 px-2 py-1 rounded font-medium flex items-center gap-1"
                            title="Remember this UPI address for customer"
                          >
                            <LinkIcon size={11} /> Link UPI ID
                          </button>
                        )}
                        <span className="text-sm font-black text-text-primary">{formatPaise(t.amount_paise)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 2. BILLS WITH NO PAYMENT */}
            {activeTab === 'unmatched_bills' && (
              <div className="space-y-2">
                {reconciliationResult.unmatched_bills.length === 0 ? (
                  <div className="p-8 text-center text-xs text-emerald-500 flex items-center justify-center gap-1.5">
                    <CheckCircle2 size={16} /> All digital bills have matching bank settlements!
                  </div>
                ) : (
                  reconciliationResult.unmatched_bills.map(b => (
                    <div key={b.invoice_id} className="bg-surface-base p-3 rounded-lg border border-red-500/20 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-text-primary">Invoice #{b.invoice_number}</span>
                        {b.customer_name && (
                          <span className="text-[11px] text-text-muted ml-2">({b.customer_name})</span>
                        )}
                        <div className="text-[10px] text-red-400 mt-0.5">
                          Tender: {b.payment_method.toUpperCase()} • Time: {new Date(b.created_at).toLocaleTimeString()}
                          {b.reference_number && ` • Ref: ${b.reference_number}`}
                        </div>
                      </div>
                      <span className="text-sm font-black text-red-500">{formatPaise(b.amount_paise)}</span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 3. PAYMENTS WITH NO BILL */}
            {activeTab === 'unmatched_credits' && (
              <div className="space-y-2">
                {reconciliationResult.unmatched_credits.length === 0 ? (
                  <div className="p-8 text-center text-xs text-text-muted">No unlinked bank credits found.</div>
                ) : (
                  reconciliationResult.unmatched_credits.map(c => (
                    <div key={c.id} className="bg-surface-base p-3 rounded-lg border border-amber-500/20 flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-text-primary">Bank Credit Ref: {c.ref_no || 'N/A'}</span>
                        <div className="text-[10px] text-text-muted mt-0.5">
                          Time: {new Date(c.txn_time).toLocaleTimeString()} • Payer: {c.payer_name || c.payer_vpa || c.narration || 'Unknown'}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setSelectedTxnForNotSale(c)}
                          className="text-[10px] bg-surface-panel hover:bg-surface-hover text-text-secondary px-2.5 py-1 rounded border border-border-subtle"
                        >
                          Mark as Not a Sale
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTxnForManualMatch(c);
                            setManualMatchInvoiceId('');
                          }}
                          className="text-[10px] bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 px-2.5 py-1 rounded font-semibold"
                        >
                          Link Bill
                        </button>
                        <span className="text-sm font-black text-amber-500">{formatPaise(c.amount_paise)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* 4. REVIEW QUEUE (Ties & Mode Mismatches) */}
            {activeTab === 'review' && (
              <div className="space-y-2">
                {reconciliationResult.review_queue.length === 0 ? (
                  <div className="p-8 text-center text-xs text-emerald-500 flex items-center justify-center gap-1.5">
                    <CheckCircle2 size={16} /> Review queue is clear. No ambiguous ties or mode mismatches detected!
                  </div>
                ) : (
                  reconciliationResult.review_queue.map(r => (
                    <div key={r.id} className="bg-surface-base p-3 rounded-lg border border-indigo-500/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            r.match_rule === 'mode_mismatch_suspected'
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-indigo-500/20 text-indigo-400'
                          }`}>
                            {r.match_rule === 'mode_mismatch_suspected' ? '⚠️ Suspected Mode Mismatch' : 'Ambiguous Candidates (Tie)'}
                          </span>
                          <span className="text-xs font-bold text-text-primary">
                            Bank Ref: {r.ref_no || 'N/A'} ({new Date(r.txn_time).toLocaleTimeString()})
                          </span>
                        </div>
                        <span className="text-sm font-black text-text-primary">{formatPaise(r.amount_paise)}</span>
                      </div>
                      <p className="text-xs text-text-secondary bg-surface-panel/80 p-2 rounded">
                        {r.notes}
                      </p>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => {
                            setSelectedTxnForManualMatch(r);
                            setManualMatchInvoiceId('');
                          }}
                          className="text-xs bg-brand-500 hover:bg-brand-600 text-white font-semibold px-3 py-1.5 rounded-lg"
                        >
                          Choose Matching Bill
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Match Modal */}
      {selectedTxnForManualMatch && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h3 className="text-sm font-bold">Manual Match Bank Transaction</h3>
              <button onClick={() => setSelectedTxnForManualMatch(null)} className="text-text-muted hover:text-text-primary">
                <X size={16} />
              </button>
            </div>
            <div className="text-xs text-text-secondary space-y-1 bg-surface-base p-2.5 rounded">
              <div><strong>Bank Ref:</strong> {selectedTxnForManualMatch.ref_no || 'N/A'}</div>
              <div><strong>Amount:</strong> {formatPaise(selectedTxnForManualMatch.amount_paise)}</div>
              <div><strong>Timestamp:</strong> {new Date(selectedTxnForManualMatch.txn_time).toLocaleString()}</div>
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">Select Candidate Invoice:</label>
              {reconciliationResult?.unmatched_bills && reconciliationResult.unmatched_bills.length > 0 ? (
                <select
                  value={manualMatchInvoiceId}
                  onChange={(e) => setManualMatchInvoiceId(e.target.value)}
                  className="w-full bg-surface-base border border-border-subtle text-xs px-3 py-2 rounded-lg text-text-primary"
                >
                  <option value="">-- Choose an unmatched bill --</option>
                  {reconciliationResult.unmatched_bills.map(b => (
                    <option key={b.invoice_id} value={b.invoice_id}>
                      #{b.invoice_number} • {formatPaise(b.amount_paise)} • {b.customer_name || 'Walk-in'} ({new Date(b.created_at).toLocaleTimeString()})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  placeholder="Enter Invoice ID"
                  value={manualMatchInvoiceId}
                  onChange={(e) => setManualMatchInvoiceId(e.target.value)}
                  className="w-full bg-surface-base border border-border-subtle text-xs px-3 py-2 rounded-lg text-text-primary"
                />
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">Reason / Note (Audited):</label>
              <input
                type="text"
                placeholder="e.g. Verified customer UTR on PhonePe screenshot"
                value={manualMatchNote}
                onChange={(e) => setManualMatchNote(e.target.value)}
                className="w-full bg-surface-base border border-border-subtle text-xs px-3 py-2 rounded-lg text-text-primary"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedTxnForManualMatch(null)}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmManualMatch}
                disabled={!manualMatchInvoiceId}
                className="bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white font-bold text-xs px-4 py-1.5 rounded-lg"
              >
                Confirm Link
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark Not a Sale Modal */}
      {selectedTxnForNotSale && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <h3 className="text-sm font-bold">Mark Credit as Not a Sale</h3>
              <button onClick={() => setSelectedTxnForNotSale(null)} className="text-text-muted hover:text-text-primary">
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-text-secondary">
              Use this if this bank credit is a personal transfer, owner loan, supplier refund, or other non-sales income.
            </p>
            <div>
              <label className="text-xs font-semibold text-text-secondary block mb-1">Mandatory Reason (Audited):</label>
              <input
                type="text"
                placeholder="e.g. Owner personal account deposit, vendor security refund"
                value={notSaleReason}
                onChange={(e) => setNotSaleReason(e.target.value)}
                className="w-full bg-surface-base border border-border-subtle text-xs px-3 py-2 rounded-lg text-text-primary"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedTxnForNotSale(null)}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmNotSale}
                disabled={!notSaleReason.trim()}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-bold text-xs px-4 py-1.5 rounded-lg"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link UPI Alias Confirmation Modal */}
      {aliasPrompt && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-xl max-w-sm w-full p-5 space-y-4 shadow-xl text-center">
            <div className="w-10 h-10 rounded-full bg-brand-500/10 text-brand-500 mx-auto flex items-center justify-center">
              <LinkIcon size={20} />
            </div>
            <div>
              <h3 className="text-sm font-bold">Link Payer UPI Alias?</h3>
              <p className="text-xs text-text-secondary mt-1">
                Link UPI ID <strong className="text-text-primary font-mono">{aliasPrompt.upiHandle}</strong> to customer <strong className="text-text-primary">{aliasPrompt.customerName}</strong> for future billing-time identification?
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setAliasPrompt(null)}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
              >
                No, Skip
              </button>
              <button
                onClick={handleConfirmLinkAlias}
                className="bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs px-4 py-1.5 rounded-lg"
              >
                Yes, Link Alias
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankStatementReconciliationView;
