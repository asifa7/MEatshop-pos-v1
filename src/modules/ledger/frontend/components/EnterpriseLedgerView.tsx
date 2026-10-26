import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Search,
  Download,
  Printer,
  ShieldCheck,
  Wallet,
  Landmark,
  Users,
  Scale,
  HeartPulse,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Calendar,
  Filter,
} from 'lucide-react';
import { formatMoney, paiseToRupees } from '../../../../core/shared/math';
import type { EnterpriseAuditLog } from '../../../../core/types/enterprise_types';
export interface ExtendedLedgerEntry {
  id: number;
  date: string;
  account_type: string;
  reference_id: string | null;
  description: string;
  debit_paise: number;
  credit_paise: number;
  balance_paise: number;
  created_at: string;
  voucher_group_id?: string | null;
  party_type?: string | null;
  party_id?: number | null;
  party_name?: string | null;
  source_module?: string | null;
  running_balance_paise?: number;
}

export interface TrialBalanceRow {
  account_type: string;
  debit_paise: number;
  credit_paise: number;
  net_paise: number;
  balance_type: 'Dr' | 'Cr' | 'Nil';
  entry_count: number;
}

export interface UnbalancedVoucherGroup {
  voucher_group_id: string;
  date: string;
  reference_id: string | null;
  description: string;
  debit_paise: number;
  credit_paise: number;
  difference_paise: number;
  entry_count: number;
}

export interface LedgerHealthSummary {
  isBalanced: boolean;
  totalDebitPaise: number;
  totalCreditPaise: number;
  differencePaise: number;
  totalEntries: number;
  totalVoucherGroups: number;
  unbalancedGroups: UnbalancedVoucherGroup[];
}

export interface PartySummaryRow {
  key: string;
  party_type: string;
  party_id: number | null;
  party_name: string;
  debit_paise: number;
  credit_paise: number;
  net_paise: number;
  balance_type: 'Receivable (Dr)' | 'Payable (Cr)' | 'Settled' | string;
  entry_count: number;
}

export interface LedgerBundleResponse {
  entries: ExtendedLedgerEntry[];
  cashBook: ExtendedLedgerEntry[];
  bankBook: ExtendedLedgerEntry[];
  partyLedger: ExtendedLedgerEntry[];
  parties: PartySummaryRow[];
  accounts?: string[];
  trialBalance: {
    rows: TrialBalanceRow[];
    grandTotalDebitPaise: number;
    grandTotalCreditPaise: number;
    isBalanced: boolean;
  };
  health: LedgerHealthSummary;
}

type LedgerTab =
  | 'day_book'
  | 'cash_book'
  | 'bank_book'
  | 'party_ledger'
  | 'trial_balance'
  | 'ledger_health'
  | 'audit_logs';

function formatRupees(paise: number | undefined | null): string {
  return `₹${formatMoney(paiseToRupees(Number(paise) || 0))}`;
}

export default function EnterpriseLedgerView() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<LedgerTab>('day_book');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [filterAccount, setFilterAccount] = useState<string>('All');
  const [filterParty, setFilterParty] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isReconciling, setIsReconciling] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const { data: bundle, isLoading, refetch } = useQuery<LedgerBundleResponse>({
    queryKey: ['ledgers-bundle', startDate, endDate, filterAccount, filterParty, searchQuery],
    queryFn: async () => {
      const res = await window.api.invoke('ledgers:get-entries', {
        accountType: {
          mode: 'bundle',
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          accountFilter: filterAccount,
          partyFilter: filterParty,
          searchQuery: searchQuery || undefined,
        },
      });

      if (res && res.success && res.data) {
        // Handle both bundle response and fallback array response gracefully
        if (Array.isArray(res.data)) {
          const entries = res.data as ExtendedLedgerEntry[];
          const totalDebitPaise = entries.reduce((s, e) => s + (e.debit_paise || 0), 0);
          const totalCreditPaise = entries.reduce((s, e) => s + (e.credit_paise || 0), 0);
          return {
            entries,
            cashBook: entries.filter((e) => e.account_type === 'Cash'),
            bankBook: entries.filter((e) => e.account_type === 'Bank'),
            partyLedger: entries.filter((e) => e.account_type === 'Supplier' || e.account_type === 'Customer'),
            parties: [],
            trialBalance: {
              rows: [],
              grandTotalDebitPaise: totalDebitPaise,
              grandTotalCreditPaise: totalCreditPaise,
              isBalanced: totalDebitPaise === totalCreditPaise,
            },
            health: {
              isBalanced: totalDebitPaise === totalCreditPaise,
              totalDebitPaise,
              totalCreditPaise,
              differencePaise: totalDebitPaise - totalCreditPaise,
              totalEntries: entries.length,
              totalVoucherGroups: 0,
              unbalancedGroups: [],
            },
            accounts: ['Cash', 'Bank', 'Sales', 'Purchase', 'Expense', 'Supplier', 'Customer'],
          };
        }
        return res.data as LedgerBundleResponse;
      }
      throw new Error(res?.error || 'Failed to load double-entry ledger');
    },
  });

  const { data: auditLogs = [] } = useQuery<EnterpriseAuditLog[]>({
    queryKey: ['audit', 'logs'],
    queryFn: async () => {
      const res = await window.api.invoke('audit:get-logs');
      return res && res.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  const entries: ExtendedLedgerEntry[] = bundle?.entries || [];
  const cashBook: ExtendedLedgerEntry[] = bundle?.cashBook || [];
  const bankBook: ExtendedLedgerEntry[] = bundle?.bankBook || [];
  const partyLedger: ExtendedLedgerEntry[] = bundle?.partyLedger || [];
  const parties: PartySummaryRow[] = bundle?.parties || [];
  const trialBalanceRows: TrialBalanceRow[] = bundle?.trialBalance?.rows || [];
  const health = bundle?.health || {
    isBalanced: true,
    totalDebitPaise: 0,
    totalCreditPaise: 0,
    differencePaise: 0,
    totalEntries: 0,
    totalVoucherGroups: 0,
    unbalancedGroups: [],
  };
  const accounts = bundle?.accounts || ['Cash', 'Bank', 'Sales', 'Purchase', 'Expense', 'Supplier', 'Customer'];

  const activeBookTotals = useMemo(() => {
    const currentList =
      activeTab === 'cash_book'
        ? cashBook
        : activeTab === 'bank_book'
        ? bankBook
        : activeTab === 'party_ledger'
        ? partyLedger
        : entries;
    const dr = currentList.reduce((acc, r) => acc + (r.debit_paise || 0), 0);
    const cr = currentList.reduce((acc, r) => acc + (r.credit_paise || 0), 0);
    return { dr, cr, net: dr - cr, count: currentList.length };
  }, [activeTab, entries, cashBook, bankBook, partyLedger]);

  const handleAutoBalance = async () => {
    setIsReconciling(true);
    setStatusBanner(null);
    try {
      const res = await window.api.invoke('ledgers:get-entries', {
        accountType: {
          mode: 'bundle',
          action: 'auto_balance',
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ['ledgers-bundle'] });
      await refetch();
      const fixed = res?.data?.autoBalanceResult?.fixedGroups ?? 0;
      setStatusBanner(
        fixed > 0
          ? `Successfully auto-balanced ${fixed} unbalanced voucher group(s). Total Debits now equal Total Credits.`
          : 'All voucher groups are already balanced (Total Debits == Total Credits).'
      );
    } catch (err: any) {
      setStatusBanner(`Reconcile error: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsReconciling(false);
    }
  };

  const handleExportCSV = async () => {
    try {
      let csvRows: string[] = [];
      if (activeTab === 'trial_balance') {
        csvRows.push(['Account', 'Entries', 'Total Debit (Rs)', 'Total Credit (Rs)', 'Net Balance (Rs)', 'Dr/Cr'].join(','));
        for (const r of trialBalanceRows) {
          csvRows.push(
            [
              `"${r.account_type}"`,
              r.entry_count,
              formatMoney(paiseToRupees(r.debit_paise)),
              formatMoney(paiseToRupees(r.credit_paise)),
              formatMoney(paiseToRupees(Math.abs(r.net_paise))),
              r.balance_type,
            ].join(',')
          );
        }
      } else if (activeTab === 'audit_logs') {
        csvRows.push(['Timestamp', 'User', 'Module', 'Action', 'Description'].join(','));
        for (const l of auditLogs) {
          csvRows.push(
            [
              `"${l.created_at}"`,
              `"${l.username || l.user_id}"`,
              `"${l.module}"`,
              `"${l.action}"`,
              `"${(l.description || '').replace(/"/g, '""')}"`,
            ].join(',')
          );
        }
      } else {
        const list =
          activeTab === 'cash_book'
            ? cashBook
            : activeTab === 'bank_book'
            ? bankBook
            : activeTab === 'party_ledger'
            ? partyLedger
            : entries;
        csvRows.push(
          ['Date', 'Voucher Group', 'Reference ID', 'Account', 'Party', 'Description', 'Debit (Rs)', 'Credit (Rs)', 'Running Balance (Rs)'].join(',')
        );
        for (const e of list) {
          csvRows.push(
            [
              `"${e.date}"`,
              `"${e.voucher_group_id || ''}"`,
              `"${e.reference_id || ''}"`,
              `"${e.account_type}"`,
              `"${(e.party_name || '').replace(/"/g, '""')}"`,
              `"${(e.description || '').replace(/"/g, '""')}"`,
              formatMoney(paiseToRupees(e.debit_paise)),
              formatMoney(paiseToRupees(e.credit_paise)),
              e.running_balance_paise !== undefined ? formatMoney(paiseToRupees(e.running_balance_paise)) : '',
            ].join(',')
          );
        }
      }

      const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enterprise_ledger_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      await window.api.invoke('system:export-csv', { type: 'ledger' });
    }
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const tabs: { id: LedgerTab; label: string; icon: any; badge?: string | number }[] = [
    { id: 'day_book', label: 'Day Book', icon: BookOpen, badge: entries.length },
    { id: 'cash_book', label: 'Cash Book', icon: Wallet, badge: cashBook.length },
    { id: 'bank_book', label: 'Bank Book', icon: Landmark, badge: bankBook.length },
    { id: 'party_ledger', label: 'Party Ledger', icon: Users, badge: partyLedger.length },
    { id: 'trial_balance', label: 'Trial Balance', icon: Scale, badge: trialBalanceRows.length },
    {
      id: 'ledger_health',
      label: 'Ledger Health',
      icon: HeartPulse,
      badge: health.isBalanced ? 'OK' : `${health.unbalancedGroups.length} Issue`,
    },
    { id: 'audit_logs', label: 'Audit Logs', icon: ShieldCheck, badge: auditLogs.length },
  ];

  const renderJournalTable = (rows: ExtendedLedgerEntry[], showRunningBalance: boolean, showPartyCol: boolean) => (
    <table className="w-full text-left text-xs font-mono">
      <thead className="bg-surface-card border-b border-border-subtle text-[10px] text-text-muted font-bold uppercase sticky top-0 z-10">
        <tr>
          <th className="p-3">Date</th>
          <th className="p-3">Voucher / Ref</th>
          <th className="p-3">Account</th>
          {showPartyCol && <th className="p-3">Party</th>}
          <th className="p-3">Description</th>
          <th className="p-3 text-right">Debit (Dr)</th>
          <th className="p-3 text-right">Credit (Cr)</th>
          {showRunningBalance && <th className="p-3 text-right">Running Balance</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={6 + (showRunningBalance ? 1 : 0) + (showPartyCol ? 1 : 0)} className="p-8 text-center text-text-muted">
              No double-entry ledger lines match the current filters.
            </td>
          </tr>
        ) : (
          rows.map((entry) => {
            const runBal = entry.running_balance_paise ?? 0;
            return (
              <tr key={entry.id} className="hover:bg-surface-card/50 transition-colors">
                <td className="p-3 font-bold whitespace-nowrap">{entry.date}</td>
                <td className="p-3 text-text-muted whitespace-nowrap">
                  <div className="font-bold text-text-primary">{entry.reference_id || '-'}</div>
                  {entry.voucher_group_id && (
                    <div className="text-[10px] text-text-muted">{entry.voucher_group_id}</div>
                  )}
                </td>
                <td className="p-3 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-500 font-bold border border-brand-500/20">
                    {entry.account_type}
                  </span>
                </td>
                {showPartyCol && (
                  <td className="p-3 font-bold text-text-primary whitespace-nowrap">
                    {entry.party_name || '-'}
                    {entry.party_type && (
                      <span className="ml-1.5 text-[10px] text-text-muted font-normal">({entry.party_type})</span>
                    )}
                  </td>
                )}
                <td className="p-3 text-text-primary max-w-md">{entry.description}</td>
                <td className="p-3 text-right font-bold text-emerald-400 whitespace-nowrap">
                  {entry.debit_paise > 0 ? formatRupees(entry.debit_paise) : '-'}
                </td>
                <td className="p-3 text-right font-bold text-amber-400 whitespace-nowrap">
                  {entry.credit_paise > 0 ? formatRupees(entry.credit_paise) : '-'}
                </td>
                {showRunningBalance && (
                  <td className="p-3 text-right font-black whitespace-nowrap">
                    <span className={runBal >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {formatRupees(Math.abs(runBal))} {runBal > 0 ? 'Dr' : runBal < 0 ? 'Cr' : ''}
                    </span>
                  </td>
                )}
              </tr>
            );
          })
        )}
      </tbody>
      {rows.length > 0 && (
        <tfoot className="bg-surface-card border-t-2 border-border-subtle font-black text-xs sticky bottom-0">
          <tr>
            <td colSpan={showPartyCol ? 5 : 4} className="p-3 text-right uppercase text-text-muted">
              View Totals ({rows.length} Lines):
            </td>
            <td className="p-3 text-right text-emerald-400">{formatRupees(activeBookTotals.dr)}</td>
            <td className="p-3 text-right text-amber-400">{formatRupees(activeBookTotals.cr)}</td>
            {showRunningBalance && (
              <td className="p-3 text-right text-text-primary">
                Net: {formatRupees(Math.abs(activeBookTotals.net))}{' '}
                {activeBookTotals.net > 0 ? 'Dr' : activeBookTotals.net < 0 ? 'Cr' : ''}
              </td>
            )}
          </tr>
        </tfoot>
      )}
    </table>
  );

  return (
    <div className="flex flex-col h-full bg-surface-app text-text-primary p-5 space-y-4 overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between border-b border-border-subtle pb-4 gap-4 flex-shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-black font-outfit text-text-primary flex items-center gap-2">
              <BookOpen className="text-brand-500" size={24} />
              <span>Double-Entry Financial Ledger & Trial Balance</span>
            </h2>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-black flex items-center gap-1.5 border ${
                health.isBalanced
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-red-500/15 text-red-400 border-red-500/30'
              }`}
            >
              {health.isBalanced ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {health.isBalanced ? 'Books Balanced (Dr == Cr)' : 'Unbalanced Vouchers Detected'}
            </span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">
            Complete double-entry accounting across Day Book, Cash Book, Bank Book, Customer & Supplier Party Ledgers, and Trial Balance.
          </p>
        </div>

        {/* Summary KPI Strip + Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="px-3 py-1.5 rounded-lg bg-surface-card border border-border-subtle text-xs">
            <span className="text-text-muted mr-1.5">Total Dr:</span>
            <span className="font-black text-emerald-400 font-mono">{formatRupees(health.totalDebitPaise)}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-surface-card border border-border-subtle text-xs">
            <span className="text-text-muted mr-1.5">Total Cr:</span>
            <span className="font-black text-amber-400 font-mono">{formatRupees(health.totalCreditPaise)}</span>
          </div>

          <button
            onClick={() => refetch()}
            className="btn-secondary px-3 py-2 text-xs font-bold flex items-center gap-1.5"
            title="Sync & Refresh Books"
          >
            <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} /> Sync
          </button>

          <button
            onClick={handleExportCSV}
            className="btn-secondary px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-elevation"
          >
            <Download size={14} /> Export CSV
          </button>

          <button
            onClick={handlePrintPDF}
            className="btn-primary px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 shadow-elevation"
          >
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>

      {statusBanner && (
        <div className="px-4 py-2.5 rounded-lg bg-brand-500/15 border border-brand-500/30 text-xs font-bold text-brand-400 flex items-center justify-between flex-shrink-0">
          <span>{statusBanner}</span>
          <button onClick={() => setStatusBanner(null)} className="text-text-muted hover:text-text-primary text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* 7 Sub-Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border-subtle pb-2 flex-shrink-0">
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`py-2 px-3.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                isActive
                  ? 'bg-brand-500 text-white font-black shadow-sm'
                  : 'bg-surface-card/60 text-text-muted hover:text-text-primary hover:bg-surface-card'
              }`}
            >
              <Icon size={14} />
              <span>{t.label}</span>
              {t.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-surface-app text-text-muted'
                  }`}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter Bar */}
      {activeTab !== 'audit_logs' && (
        <div className="flex flex-wrap items-center gap-3 bg-surface-card/60 border border-border-subtle rounded-xl p-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-bold text-text-muted">
            <Filter size={14} className="text-brand-500" />
            <span>Filters:</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar size={13} className="text-text-muted" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-surface-app border border-border-subtle rounded px-2.5 py-1.5 text-xs font-bold text-text-primary"
              title="Start Date"
            />
            <span className="text-xs text-text-muted">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-surface-app border border-border-subtle rounded px-2.5 py-1.5 text-xs font-bold text-text-primary"
              title="End Date"
            />
          </div>

          {activeTab === 'day_book' && (
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="bg-surface-app border border-border-subtle rounded px-3 py-1.5 text-xs font-bold text-text-primary"
            >
              <option value="All">All Accounts</option>
              {accounts.map((acc: string) => (
                <option key={acc} value={acc}>
                  {acc} Account
                </option>
              ))}
            </select>
          )}

          {(activeTab === 'day_book' || activeTab === 'party_ledger' || activeTab === 'cash_book' || activeTab === 'bank_book') && (
            <select
              value={filterParty}
              onChange={(e) => setFilterParty(e.target.value)}
              className="bg-surface-app border border-border-subtle rounded px-3 py-1.5 text-xs font-bold text-text-primary max-w-[220px]"
            >
              <option value="All">All Parties (Customers & Suppliers)</option>
              {parties.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.party_name} ({p.party_type})
                </option>
              ))}
            </select>
          )}

          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search voucher, invoice, party, or narration..."
              className="w-full pl-8 pr-3 py-1.5 bg-surface-app border border-border-subtle rounded text-xs font-bold text-text-primary outline-none focus:border-brand-500"
            />
          </div>

          {(startDate || endDate || filterAccount !== 'All' || filterParty !== 'All' || searchQuery) && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setFilterAccount('All');
                setFilterParty('All');
                setSearchQuery('');
              }}
              className="text-xs font-bold text-brand-500 hover:underline px-2 py-1"
            >
              Reset Filters
            </button>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-surface-panel border border-border-subtle rounded-xl overflow-hidden shadow-elevation">
        {activeTab === 'day_book' && renderJournalTable(entries, false, true)}

        {activeTab === 'cash_book' && renderJournalTable(cashBook, true, true)}

        {activeTab === 'bank_book' && renderJournalTable(bankBook, true, true)}

        {activeTab === 'party_ledger' && (
          <div className="flex flex-col h-full overflow-y-auto">
            {/* Party Summary Tiles */}
            {parties.length > 0 && (
              <div className="p-4 bg-surface-card/40 border-b border-border-subtle">
                <div className="text-[11px] font-black uppercase text-text-muted mb-2.5 flex items-center justify-between">
                  <span>Party Balances (Click a Party Card to Filter Ledger)</span>
                  {filterParty !== 'All' && (
                    <button
                      onClick={() => setFilterParty('All')}
                      className="text-brand-500 hover:underline text-xs font-bold"
                    >
                      Show All Parties
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-44 overflow-y-auto pr-1">
                  {parties.map((p) => {
                    const selected = filterParty === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => setFilterParty(selected ? 'All' : p.key)}
                        className={`text-left p-3 rounded-lg border transition-all ${
                          selected
                            ? 'bg-brand-500/15 border-brand-500 shadow-sm'
                            : 'bg-surface-card border-border-subtle hover:border-brand-500/50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-xs text-text-primary truncate">{p.party_name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-app text-text-muted font-bold">
                            {p.party_type}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-baseline justify-between font-mono text-xs">
                          <span
                            className={`font-black ${
                              p.net_paise < 0
                                ? 'text-amber-400'
                                : p.net_paise > 0
                                ? 'text-emerald-400'
                                : 'text-text-muted'
                            }`}
                          >
                            {formatRupees(Math.abs(p.net_paise))}
                          </span>
                          <span className="text-[10px] text-text-muted font-bold">{p.balance_type}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="flex-1">{renderJournalTable(partyLedger, true, true)}</div>
          </div>
        )}

        {activeTab === 'trial_balance' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-text-primary">Account-wise Trial Balance</h3>
                <p className="text-xs text-text-muted">
                  Summary of total Debits, total Credits, and Net Closing Balance for each general ledger account.
                </p>
              </div>
              <div
                className={`px-3 py-1.5 rounded-lg text-xs font-black border ${
                  bundle?.trialBalance?.isBalanced
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-red-500/10 text-red-400 border-red-500/30'
                }`}
              >
                {bundle?.trialBalance?.isBalanced
                  ? 'Trial Balance Matched (Dr == Cr)'
                  : 'Trial Balance Discrepancy Detected'}
              </div>
            </div>

            <table className="w-full text-left text-xs font-mono border border-border-subtle rounded-lg overflow-hidden">
              <thead className="bg-surface-card border-b border-border-subtle text-[10px] text-text-muted font-bold uppercase">
                <tr>
                  <th className="p-3">Ledger Account</th>
                  <th className="p-3 text-right">Journal Lines</th>
                  <th className="p-3 text-right">Total Debit (Dr)</th>
                  <th className="p-3 text-right">Total Credit (Cr)</th>
                  <th className="p-3 text-right">Net Closing Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {trialBalanceRows.map((row) => (
                  <tr
                    key={row.account_type}
                    onClick={() => {
                      setFilterAccount(row.account_type);
                      setActiveTab('day_book');
                    }}
                    className="hover:bg-surface-card/50 cursor-pointer transition-colors"
                    title="Click to inspect account entries in Day Book"
                  >
                    <td className="p-3 font-black text-brand-500">{row.account_type} Account</td>
                    <td className="p-3 text-right text-text-muted">{row.entry_count}</td>
                    <td className="p-3 text-right font-bold text-emerald-400">{formatRupees(row.debit_paise)}</td>
                    <td className="p-3 text-right font-bold text-amber-400">{formatRupees(row.credit_paise)}</td>
                    <td className="p-3 text-right font-black">
                      <span
                        className={
                          row.balance_type === 'Dr'
                            ? 'text-emerald-400'
                            : row.balance_type === 'Cr'
                            ? 'text-amber-400'
                            : 'text-text-muted'
                        }
                      >
                        {formatRupees(Math.abs(row.net_paise))} {row.balance_type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-card border-t-2 border-border-subtle font-black text-xs">
                <tr>
                  <td className="p-3 uppercase text-text-primary">Grand Total</td>
                  <td className="p-3 text-right text-text-muted">
                    {trialBalanceRows.reduce((s, r) => s + r.entry_count, 0)}
                  </td>
                  <td className="p-3 text-right text-emerald-400">
                    {formatRupees(bundle?.trialBalance?.grandTotalDebitPaise)}
                  </td>
                  <td className="p-3 text-right text-amber-400">
                    {formatRupees(bundle?.trialBalance?.grandTotalCreditPaise)}
                  </td>
                  <td className="p-3 text-right text-text-primary">
                    Diff: {formatRupees(Math.abs((bundle?.trialBalance?.grandTotalDebitPaise || 0) - (bundle?.trialBalance?.grandTotalCreditPaise || 0)))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {activeTab === 'ledger_health' && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-surface-card border border-border-subtle">
                <div className="text-[11px] font-bold uppercase text-text-muted">Total Debits</div>
                <div className="text-xl font-black font-mono text-emerald-400 mt-1">
                  {formatRupees(health.totalDebitPaise)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-surface-card border border-border-subtle">
                <div className="text-[11px] font-bold uppercase text-text-muted">Total Credits</div>
                <div className="text-xl font-black font-mono text-amber-400 mt-1">
                  {formatRupees(health.totalCreditPaise)}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-surface-card border border-border-subtle">
                <div className="text-[11px] font-bold uppercase text-text-muted">Net Discrepancy</div>
                <div
                  className={`text-xl font-black font-mono mt-1 ${
                    health.differencePaise === 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {formatRupees(Math.abs(health.differencePaise))}
                </div>
              </div>
              <div className="p-4 rounded-xl bg-surface-card border border-border-subtle">
                <div className="text-[11px] font-bold uppercase text-text-muted">Voucher Groups</div>
                <div className="text-xl font-black font-mono text-text-primary mt-1">
                  {health.totalVoucherGroups} Groups ({health.totalEntries} Lines)
                </div>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-surface-card border border-border-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                {health.isBalanced ? (
                  <CheckCircle2 className="text-emerald-400 flex-shrink-0 mt-0.5" size={24} />
                ) : (
                  <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={24} />
                )}
                <div>
                  <h4 className="text-sm font-black text-text-primary">
                    {health.isBalanced
                      ? 'Double-Entry Integrity Verified: Total Debits Equal Total Credits'
                      : `${health.unbalancedGroups.length} Unbalanced Voucher Group(s) Require Reconciliation`}
                  </h4>
                  <p className="text-xs text-text-muted mt-1">
                    {health.isBalanced
                      ? 'Every sale, purchase bill, supplier payment, and operational expense voucher has balanced Debit and Credit legs.'
                      : 'Click "Auto-Balance / Reconcile" to automatically generate the missing contra ledger lines for unbalanced legacy entries.'}
                  </p>
                </div>
              </div>

              <button
                onClick={handleAutoBalance}
                disabled={isReconciling}
                className="btn-primary px-5 py-2.5 text-xs font-black flex items-center gap-2 whitespace-nowrap shadow-elevation"
              >
                <RefreshCw size={15} className={isReconciling ? 'animate-spin' : ''} />
                <span>{isReconciling ? 'Reconciling...' : 'Auto-Balance / Reconcile'}</span>
              </button>
            </div>

            {health.unbalancedGroups.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-text-muted">Unbalanced Voucher Groups</h4>
                <table className="w-full text-left text-xs font-mono border border-border-subtle rounded-lg overflow-hidden">
                  <thead className="bg-surface-card border-b border-border-subtle text-[10px] text-text-muted font-bold uppercase">
                    <tr>
                      <th className="p-3">Voucher Group</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Ref ID</th>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Debit</th>
                      <th className="p-3 text-right">Credit</th>
                      <th className="p-3 text-right">Difference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {health.unbalancedGroups.map((g) => (
                      <tr key={g.voucher_group_id} className="hover:bg-surface-card/40">
                        <td className="p-3 font-bold text-brand-500">{g.voucher_group_id}</td>
                        <td className="p-3">{g.date}</td>
                        <td className="p-3">{g.reference_id || '-'}</td>
                        <td className="p-3">{g.description}</td>
                        <td className="p-3 text-right text-emerald-400">{formatRupees(g.debit_paise)}</td>
                        <td className="p-3 text-right text-amber-400">{formatRupees(g.credit_paise)}</td>
                        <td className="p-3 text-right font-black text-red-400">
                          {formatRupees(Math.abs(g.difference_paise))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'audit_logs' && (
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-surface-card border-b border-border-subtle text-[10px] text-text-muted font-bold uppercase sticky top-0">
              <tr>
                <th className="p-3">Timestamp</th>
                <th className="p-3">User</th>
                <th className="p-3">Module</th>
                <th className="p-3">Action</th>
                <th className="p-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-text-muted">
                    No audit logs recorded yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-card/40">
                    <td className="p-3 text-text-muted">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="p-3 font-bold text-brand-500">{log.username || `User #${log.user_id}`}</td>
                    <td className="p-3 font-bold">{log.module}</td>
                    <td className="p-3 font-bold text-amber-400">{log.action}</td>
                    <td className="p-3 text-text-secondary">{log.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
