import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  TrendingDown,
  Users,
  Clock,
  ChevronUp,
  ChevronDown,
  Settings,
  X,
  Check,
  FileText,
  Printer,
  Download,
  Receipt,
  ChevronRight
} from 'lucide-react';
import { useARReports } from '../hooks/useCustomerLedger';
import { formatPaise, getRiskBadgeColor, formatDate } from '../types/customer.types';
import type { AgingReportRow, AgingBucketConfig } from '../types/customer.types';

export default function AgingDashboard() {
  const { useAgingReport, useAgingSettings, useUpdateAgingSettings } = useARReports();
  const [asOfDate, setAsOfDate] = useState('');
  
  const { data: agingResult, isLoading, refetch } = useAgingReport(asOfDate ? { asOfDate } : undefined);
  const { data: settingsData } = useAgingSettings();
  const updateSettingsMutation = useUpdateAgingSettings();

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [b1, setB1] = useState<number>(15);
  const [b2, setB2] = useState<number>(30);
  const [b3, setB3] = useState<number>(60);
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Drilldown state: expanded customer ID
  const [expandedCustomerId, setExpandedCustomerId] = useState<number | null>(null);

  // Sorting & Filtering
  const [sortIndex, setSortIndex] = useState<number | 'name' | 'outstanding'>('outstanding');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [riskFilter, setRiskFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const buckets: AgingBucketConfig[] = agingResult?.buckets || [
    { index: 0, label: '0–15 Days', shortLabel: '0–15d', min_days: 0, max_days: 15, key: 'b0' },
    { index: 1, label: '16–30 Days', shortLabel: '16–30d', min_days: 16, max_days: 30, key: 'b1' },
    { index: 2, label: '31–60 Days', shortLabel: '31–60d', min_days: 31, max_days: 60, key: 'b2' },
    { index: 3, label: '60+ Days', shortLabel: '60+d', min_days: 61, max_days: null, key: 'b3' },
  ];

  const rows: AgingReportRow[] = agingResult?.rows || [];

  // Sync settings when loaded
  const handleOpenSettings = () => {
    const cur = settingsData?.boundaries || [15, 30, 60];
    setB1(cur[0] ?? 15);
    setB2(cur[1] ?? 30);
    setB3(cur[2] ?? 60);
    setSettingsError(null);
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (b1 <= 0 || b2 <= b1 || b3 <= b2) {
      setSettingsError('Boundary thresholds must be in strictly increasing order (e.g. 15, 30, 60)');
      return;
    }
    try {
      await updateSettingsMutation.mutateAsync([b1, b2, b3]);
      setIsSettingsOpen(false);
      refetch();
    } catch (err: any) {
      setSettingsError(err.message || 'Failed to save aging bucket settings');
    }
  };

  // Filtered & Sorted Rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (riskFilter !== 'all' && r.risk_level !== riskFilter) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = r.name.toLowerCase().includes(query);
        const matchCode = r.customer_code.toLowerCase().includes(query);
        const matchPhone = r.phone?.toLowerCase().includes(query);
        if (!matchName && !matchCode && !matchPhone) return false;
      }
      return true;
    });
  }, [rows, riskFilter, searchTerm]);

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      if (sortIndex === 'name') {
        const av = a.name.toLowerCase();
        const bv = b.name.toLowerCase();
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      if (sortIndex === 'outstanding') {
        const av = a.outstanding_paise;
        const bv = b.outstanding_paise;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      // Numeric bucket index
      const av = a.bucket_values?.[sortIndex] ?? 0;
      const bv = b.bucket_values?.[sortIndex] ?? 0;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [filteredRows, sortIndex, sortDir]);

  const totals = useMemo(() => {
    const bucketTotals = new Array(buckets.length).fill(0);
    let totalOutstanding = 0;
    let highRiskTotal = 0;
    let overdueTotal = 0;

    for (const r of rows) {
      totalOutstanding += r.outstanding_paise;
      if (r.risk_level === 'high') {
        highRiskTotal += r.outstanding_paise;
      }
      if (r.bucket_values) {
        for (let i = 0; i < buckets.length; i++) {
          bucketTotals[i] += r.bucket_values[i] || 0;
          if (i > 0) {
            // Overdue beyond first bucket
            overdueTotal += r.bucket_values[i] || 0;
          }
        }
      }
    }

    return {
      outstanding: totalOutstanding,
      bucketTotals,
      highRiskTotal,
      overdueTotal,
    };
  }, [rows, buckets]);

  function toggleSort(col: number | 'name' | 'outstanding') {
    if (sortIndex === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortIndex(col);
      setSortDir('desc');
    }
  }

  const SortIcon = ({ col }: { col: number | 'name' | 'outstanding' }) =>
    sortIndex === col ? (
      sortDir === 'desc' ? (
        <ChevronDown size={12} className="inline ml-1 text-brand-500" />
      ) : (
        <ChevronUp size={12} className="inline ml-1 text-brand-500" />
      )
    ) : null;

  // Chart max scale
  const maxBucketValue = Math.max(...totals.bucketTotals, 1);

  // Export CSV
  const handleExportCSV = () => {
    const header = [
      'Customer Code',
      'Customer Name',
      'Phone',
      'Risk Level',
      'Total Outstanding (₹)',
      ...buckets.map((b) => `${b.label} (₹)`),
      'Credit Limit (₹)',
      'Last Payment Date',
    ];

    const csvRows = sortedRows.map((r) => [
      r.customer_code,
      `"${r.name.replace(/"/g, '""')}"`,
      r.phone || '',
      r.risk_level.toUpperCase(),
      (r.outstanding_paise / 100).toFixed(2),
      ...buckets.map((_, idx) => ((r.bucket_values?.[idx] || 0) / 100).toFixed(2)),
      (r.credit_limit_paise / 100).toFixed(2),
      r.last_payment_date || '',
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [header.join(','), ...csvRows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AR_Aging_Schedule_${asOfDate || new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-text-primary flex items-center gap-2">
            <span>Accounts Receivable Aging Schedule</span>
          </h2>
          <p className="text-xs text-text-secondary mt-0.5">
            Configurable overdue age buckets reconciled with live invoice allocations
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-surface-card border border-border-subtle rounded-xl px-3 py-1.5 shadow-sm">
            <span className="text-xs text-text-secondary font-medium">As of:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="bg-transparent text-xs text-text-primary font-mono focus:outline-none"
            />
          </div>

          <button
            onClick={handleOpenSettings}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-card hover:bg-surface-hover border border-border-subtle hover:border-brand-500 rounded-xl text-xs font-bold text-text-primary transition-colors shadow-sm"
            title="Configure Bucket Thresholds"
          >
            <Settings size={14} className="text-brand-500" />
            <span>Bucket Settings</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-card hover:bg-surface-hover border border-border-subtle hover:border-brand-500 rounded-xl text-xs font-bold text-text-primary transition-colors shadow-sm"
            title="Export CSV"
          >
            <Download size={14} className="text-emerald-500" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
          >
            <Printer size={14} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Outstanding Balance',
            value: totals.outstanding,
            icon: <TrendingDown size={18} />,
            color: 'text-amber-700 dark:text-amber-400',
            bg: 'bg-amber-100 dark:bg-amber-500/10 border-amber-300 dark:border-amber-500/20',
          },
          {
            label: `Overdue (${buckets[0]?.max_days ? buckets[0].max_days + 1 : 16}+ days)`,
            value: totals.overdueTotal,
            icon: <Clock size={18} />,
            color: 'text-orange-700 dark:text-orange-400',
            bg: 'bg-orange-100 dark:bg-orange-500/10 border-orange-300 dark:border-orange-500/20',
          },
          {
            label: 'High Risk Balances',
            value: totals.highRiskTotal,
            icon: <AlertTriangle size={18} />,
            color: 'text-red-700 dark:text-red-400',
            bg: 'bg-red-100 dark:bg-red-500/10 border-red-300 dark:border-red-500/20',
          },
          {
            label: 'Customers with Balances',
            value: null,
            count: rows.filter((r) => r.outstanding_paise > 0).length,
            icon: <Users size={18} />,
            color: 'text-brand-600 dark:text-brand-400',
            bg: 'bg-brand-100 dark:bg-brand-500/10 border-brand-300 dark:border-brand-500/20',
          },
        ].map((card, i) => (
          <div key={i} className="bg-surface-card border border-border-subtle rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-secondary font-bold">{card.label}</span>
              <div className={`w-8 h-8 rounded-xl ${card.bg} border flex items-center justify-center ${card.color}`}>
                {card.icon}
              </div>
            </div>
            <p className={`text-xl font-extrabold font-mono mt-1 ${card.color}`}>
              {card.count !== undefined ? `${card.count} customers` : formatPaise(card.value!)}
            </p>
          </div>
        ))}
      </div>

      {/* Dynamic Aging Distribution Bar */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-text-primary flex items-center gap-2">
            <span>Aging Schedule Distribution</span>
            <span className="text-[11px] font-normal text-text-muted font-mono">
              (Thresholds: {buckets.map((b) => b.label).join(' | ')})
            </span>
          </h3>
          <span className="text-xs font-mono font-bold text-text-primary">
            Total: {formatPaise(totals.outstanding)}
          </span>
        </div>

        <div className="space-y-3 pt-2">
          {buckets.map((b, idx) => {
            const val = totals.bucketTotals[idx] || 0;
            const pct = totals.outstanding > 0 ? (val / totals.outstanding) * 100 : 0;
            const barColors = ['bg-emerald-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-600', 'bg-rose-800'];
            const barColor = barColors[idx % barColors.length];

            return (
              <div key={b.key} className="flex items-center gap-4">
                <div className="w-28 text-xs text-text-secondary font-bold text-right">{b.label}</div>
                <div className="flex-1 bg-surface-panel rounded-full h-5 overflow-hidden p-0.5 border border-border-subtle">
                  <div
                    className={`h-full ${barColor} rounded-full transition-all duration-500`}
                    style={{ width: `${Math.max(pct > 0 ? 2 : 0, Math.min(100, (val / maxBucketValue) * 100))}%` }}
                  />
                </div>
                <div className="w-32 text-xs font-mono font-bold text-text-primary text-right">
                  {formatPaise(val)} <span className="text-[10px] text-text-muted font-normal">({pct.toFixed(1)}%)</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-secondary font-bold">Filter Risk:</span>
          {(['all', 'low', 'medium', 'high'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRiskFilter(r)}
              className={`px-3 py-1 rounded-xl text-xs font-bold border transition-colors ${
                riskFilter === r
                  ? 'bg-brand-500 text-white border-brand-500 shadow-sm'
                  : 'border-border-subtle bg-surface-card text-text-secondary hover:text-text-primary'
              }`}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search customer name, code or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-surface-card border border-border-subtle rounded-xl px-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500 w-64 shadow-sm"
          />
          <span className="text-xs text-text-secondary font-mono font-medium">
            {sortedRows.length} {sortedRows.length === 1 ? 'customer' : 'customers'}
          </span>
        </div>
      </div>

      {/* Aging Table with Drill-Down */}
      <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border-subtle bg-surface-panel text-text-secondary">
                <th className="w-8 px-2 py-3"></th>
                <th
                  className="text-left px-4 py-3 font-bold cursor-pointer hover:text-text-primary"
                  onClick={() => toggleSort('name')}
                >
                  Customer <SortIcon col="name" />
                </th>
                <th
                  className="text-right px-3 py-3 font-bold cursor-pointer hover:text-text-primary"
                  onClick={() => toggleSort('outstanding')}
                >
                  Total Outstanding <SortIcon col="outstanding" />
                </th>
                {buckets.map((b, idx) => (
                  <th
                    key={b.key}
                    className="text-right px-3 py-3 font-bold cursor-pointer hover:text-text-primary"
                    onClick={() => toggleSort(idx)}
                  >
                    {b.label} <SortIcon col={idx} />
                  </th>
                ))}
                <th className="text-center px-3 py-3 font-bold">Risk</th>
                <th className="text-right px-4 py-3 font-bold">Credit Limit</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border-subtle animate-pulse">
                    <td colSpan={5 + buckets.length} className="px-4 py-3">
                      <div className="h-4 bg-surface-panel rounded" />
                    </td>
                  </tr>
                ))
              ) : sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={5 + buckets.length} className="text-center py-12 text-text-secondary">
                    <TrendingDown size={36} className="mx-auto mb-2 opacity-30" />
                    <p className="font-semibold">No outstanding customer balances match the current filters.</p>
                  </td>
                </tr>
              ) : (
                sortedRows.map((row) => {
                  const isExpanded = expandedCustomerId === row.customer_id;
                  const invoiceList = row.invoices || [];

                  return (
                    <React.Fragment key={row.customer_id}>
                      <tr
                        onClick={() => setExpandedCustomerId(isExpanded ? null : row.customer_id)}
                        className={`border-b border-border-subtle hover:bg-surface-hover transition-colors cursor-pointer ${
                          isExpanded ? 'bg-surface-panel/80' : ''
                        }`}
                      >
                        <td className="px-2 py-3 text-center text-text-muted">
                          {invoiceList.length > 0 ? (
                            isExpanded ? (
                              <ChevronDown size={15} className="text-brand-500" />
                            ) : (
                              <ChevronRight size={15} />
                            )
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-text-primary flex items-center gap-2">
                            <span>{row.name}</span>
                            {invoiceList.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[9px] font-mono">
                                {invoiceList.length} {invoiceList.length === 1 ? 'bill' : 'bills'}
                              </span>
                            )}
                          </div>
                          <div className="text-text-secondary text-[10px] font-mono mt-0.5">
                            {row.customer_code} {row.phone ? `· ${row.phone}` : ''}
                          </div>
                        </td>

                        <td className="px-3 py-3 text-right font-mono font-extrabold text-red-600 dark:text-red-400 text-sm">
                          {formatPaise(row.outstanding_paise)}
                        </td>

                        {buckets.map((b, idx) => {
                          const val = row.bucket_values?.[idx] || 0;
                          return (
                            <td
                              key={b.key}
                              className={`px-3 py-3 text-right font-mono font-semibold ${
                                val > 0 ? 'text-text-primary' : 'text-text-muted opacity-40'
                              }`}
                            >
                              {val > 0 ? formatPaise(val) : '—'}
                            </td>
                          );
                        })}

                        <td className="px-3 py-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${getRiskBadgeColor(
                              row.risk_level
                            )}`}
                          >
                            {row.risk_level}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-right font-mono text-text-secondary font-medium">
                          {formatPaise(row.credit_limit_paise)}
                        </td>
                      </tr>

                      {/* Drill-down Invoice List */}
                      {isExpanded && (
                        <tr className="bg-surface-panel/40 border-b border-border-subtle">
                          <td colSpan={5 + buckets.length} className="p-4 pl-12">
                            <div className="bg-surface-card border border-border-subtle rounded-xl p-4 shadow-sm space-y-3">
                              <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                                <div className="flex items-center gap-2">
                                  <Receipt size={16} className="text-brand-500" />
                                  <h4 className="text-xs font-bold text-text-primary">
                                    Overdue Invoices for {row.name} ({row.customer_code})
                                  </h4>
                                </div>
                                <span className="text-[11px] font-mono text-text-secondary">
                                  Reconciled live against payment allocations
                                </span>
                              </div>

                              {invoiceList.length === 0 ? (
                                <p className="text-xs text-text-muted py-2 italic">
                                  No individual itemized invoices found. Balance is tracked as opening/unbilled debt.
                                </p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-[10px] text-text-secondary border-b border-border-subtle uppercase">
                                        <th className="text-left py-1.5 px-2">Invoice #</th>
                                        <th className="text-left py-1.5 px-2">Billing Date</th>
                                        <th className="text-center py-1.5 px-2">Days Overdue</th>
                                        <th className="text-center py-1.5 px-2">Bucket Range</th>
                                        <th className="text-right py-1.5 px-2">Total Amount</th>
                                        <th className="text-right py-1.5 px-2">Paid / Allocated</th>
                                        <th className="text-right py-1.5 px-2">Remaining Due</th>
                                        <th className="text-center py-1.5 px-2">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {invoiceList.map((inv) => (
                                        <tr key={inv.id} className="border-b border-border-subtle/50 font-mono">
                                          <td className="py-2 px-2 font-bold text-text-primary">
                                            {inv.invoice_number}
                                          </td>
                                          <td className="py-2 px-2 text-text-secondary">
                                            {formatDate(inv.completed_at)}
                                          </td>
                                          <td className="py-2 px-2 text-center text-orange-600 dark:text-orange-400 font-bold">
                                            {inv.days_overdue} days
                                          </td>
                                          <td className="py-2 px-2 text-center">
                                            <span className="px-2 py-0.5 rounded bg-surface-panel border border-border-subtle text-[10px] text-text-primary">
                                              {buckets[inv.bucket_index]?.label || 'Overdue'}
                                            </span>
                                          </td>
                                          <td className="py-2 px-2 text-right text-text-primary">
                                            {formatPaise(inv.total_paise)}
                                          </td>
                                          <td className="py-2 px-2 text-right text-brand-600 dark:text-brand-400">
                                            {formatPaise(inv.paid_paise)}
                                          </td>
                                          <td className="py-2 px-2 text-right font-bold text-red-600 dark:text-red-400">
                                            {formatPaise(inv.remaining_paise)}
                                          </td>
                                          <td className="py-2 px-2 text-center">
                                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300">
                                              {inv.payment_status || 'unpaid'}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>

            {/* Table Totals Row */}
            {sortedRows.length > 0 && (
              <tfoot>
                <tr className="bg-surface-panel border-t-2 border-border-subtle font-extrabold text-text-primary">
                  <td />
                  <td className="px-4 py-3.5 text-xs uppercase tracking-wider">TOTAL SCHEDULE</td>
                  <td className="px-3 py-3.5 text-right font-mono text-sm text-red-600 dark:text-red-400">
                    {formatPaise(totals.outstanding)}
                  </td>
                  {buckets.map((b, idx) => (
                    <td key={b.key} className="px-3 py-3.5 text-right font-mono text-xs text-text-primary">
                      {formatPaise(totals.bucketTotals[idx] || 0)}
                    </td>
                  ))}
                  <td />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Bucket Configuration Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-2xl shadow-2xl max-w-md w-full overflow-hidden text-xs text-text-secondary select-none">
            <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-card/60">
              <div className="flex items-center gap-2">
                <Settings size={16} className="text-brand-500" />
                <h3 className="text-sm font-bold text-text-primary">Aging Bucket Settings</h3>
              </div>
              <button
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 hover:bg-surface-hover rounded-full text-text-secondary hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-6 space-y-4">
              <p className="text-xs text-text-secondary leading-relaxed">
                Customize the aging boundary thresholds (in days) to match your shop's credit terms. Invoices are
                classified automatically based on these boundaries.
              </p>

              {settingsError && (
                <div className="p-3 rounded-xl bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 text-red-800 dark:text-red-400 text-xs font-semibold">
                  {settingsError}
                </div>
              )}

              <div className="space-y-3 bg-surface-card border border-border-subtle p-4 rounded-xl shadow-sm">
                <div>
                  <label className="block text-[11px] font-bold text-text-primary mb-1">
                    Bucket 1 Boundary (0 to X days):
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={b1}
                    onChange={(e) => setB1(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-text-primary font-mono font-bold focus:outline-none focus:border-brand-500 text-xs"
                    required
                  />
                  <span className="text-[10px] text-text-muted">Bucket 1: 0–{b1} Days</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-text-primary mb-1">
                    Bucket 2 Boundary ({b1 + 1} to Y days):
                  </label>
                  <input
                    type="number"
                    min={b1 + 1}
                    max="365"
                    value={b2}
                    onChange={(e) => setB2(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-text-primary font-mono font-bold focus:outline-none focus:border-brand-500 text-xs"
                    required
                  />
                  <span className="text-[10px] text-text-muted">Bucket 2: {b1 + 1}–{b2} Days</span>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-text-primary mb-1">
                    Bucket 3 Boundary ({b2 + 1} to Z days):
                  </label>
                  <input
                    type="number"
                    min={b2 + 1}
                    max="365"
                    value={b3}
                    onChange={(e) => setB3(parseInt(e.target.value, 10) || 0)}
                    className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-text-primary font-mono font-bold focus:outline-none focus:border-brand-500 text-xs"
                    required
                  />
                  <span className="text-[10px] text-text-muted">
                    Bucket 3: {b2 + 1}–{b3} Days | Bucket 4: {b3}+ Days
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 py-2.5 border border-border-subtle hover:border-brand-500 rounded-xl text-text-secondary hover:text-text-primary font-bold transition-colors bg-surface-card"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateSettingsMutation.isPending}
                  className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                >
                  <Check size={14} />
                  <span>{updateSettingsMutation.isPending ? 'Saving...' : 'Apply & Save'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
