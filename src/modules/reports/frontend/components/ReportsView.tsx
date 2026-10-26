import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingBag,
  Truck,
  Boxes,
  FileSpreadsheet,
  Search,
  Download,
  Printer,
  RefreshCw,
  Calendar,
  AlertTriangle,
  FileText,
  Trash2,
  X,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  CreditCard,
  PieChart,
  Tag,
  Filter,
  Sparkles,
} from 'lucide-react';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { formatMoney, formatQty, roundQty } from '../../../../core/shared/math';
import { ReportQueryResult } from '../../types/reports.types';

export type CoreReportKey = 'sales' | 'purchases' | 'delivery' | 'inventory';
export type DatePresetKey = 'today' | 'yesterday' | 'this_week' | 'this_month' | 'all_time' | 'custom';
export type CategoryFilterKey = 'all' | 'chicken' | 'mutton' | 'egg' | 'fish';
export type PaymentModeFilterKey = 'all' | 'cash' | 'upi' | 'credit';
export type SalesViewModeKey = 'bills' | 'product_breakdown' | 'payment_breakdown';

export interface ModularReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  isCurrency?: boolean;
  renderCell?: (row: any) => React.ReactNode;
  renderTotal?: (grandTotals: Record<string, any>, rows: any[]) => React.ReactNode;
}

export interface SummaryTileSpec {
  id: string;
  label: string;
  color: 'brand' | 'emerald' | 'blue' | 'amber' | 'purple' | 'rose';
  computeValue: (rows: any[], grandTotals: Record<string, any>) => string;
  computeSubtext?: (rows: any[], grandTotals: Record<string, any>) => string;
}

export interface ModularReportDefinition {
  id: CoreReportKey;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  columns: ModularReportColumn[];
  summaryTiles: SummaryTileSpec[];
}

export const MODULAR_REPORTS: ModularReportDefinition[] = [
  {
    id: 'sales',
    title: 'Sales',
    subtitle: 'Completed counter & delivery bills with payment modes and item breakdown',
    icon: <ShoppingBag size={16} />,
    summaryTiles: [
      {
        id: 'total_sales',
        label: 'Total Sales',
        color: 'emerald',
        computeValue: (_, totals) => formatMoney(totals.total_paise || 0),
        computeSubtext: (rows) => `Across ${rows.length} completed bill${rows.length === 1 ? '' : 's'}`,
      },
      {
        id: 'bills_count',
        label: 'Bills Count',
        color: 'brand',
        computeValue: (rows) => String(rows.length),
        computeSubtext: (rows) =>
          rows.length > 0
            ? `Avg Bill: ${formatMoney(Math.round(rows.reduce((a, r) => a + (r.total_paise || 0), 0) / rows.length))}`
            : 'No bills in period',
      },
      {
        id: 'cash_sales',
        label: 'Cash Collections',
        color: 'amber',
        computeValue: (rows, totals) => {
          const cashPaise =
            totals.cash_paise !== undefined
              ? Number(totals.cash_paise)
              : rows
                  .filter((r) => String(r.mode || '').toUpperCase().includes('CASH'))
                  .reduce((a, r) => a + Number(r.total_paise || 0), 0);
          return formatMoney(cashPaise);
        },
        computeSubtext: () => 'Cash counter collections',
      },
      {
        id: 'digital_sales',
        label: 'UPI / Digital / Cards',
        color: 'purple',
        computeValue: (rows, totals) => {
          const digitalPaise =
            totals.digital_paise !== undefined
              ? Number(totals.digital_paise)
              : rows
                  .filter((r) => {
                    const m = String(r.mode || '').toUpperCase();
                    return (
                      m.includes('UPI') ||
                      m.includes('CARD') ||
                      m.includes('PHONEPE') ||
                      m.includes('PAYTM') ||
                      m.includes('GPAY') ||
                      m.includes('QR')
                    );
                  })
                  .reduce((a, r) => a + Number(r.total_paise || 0), 0);
          return formatMoney(digitalPaise);
        },
        computeSubtext: () => 'UPI & Card payments',
      },
    ],
    columns: [
      {
        key: 'bill_no',
        label: 'Bill No',
        align: 'left',
        renderCell: (row) => (
          <span className="font-mono font-black text-brand-400">{row.bill_no}</span>
        ),
        renderTotal: () => 'TOTAL',
      },
      {
        key: 'time',
        label: 'Time',
        align: 'left',
        renderCell: (row) => (
          <span className="font-mono text-xs text-text-secondary">{row.time}</span>
        ),
        renderTotal: () => '',
      },
      {
        key: 'customer',
        label: 'Customer',
        align: 'left',
        renderCell: (row) => (
          <div className="flex flex-col">
            <span className="font-bold text-text-primary">{row.customer}</span>
            {row.customer_phone && (
              <span className="font-mono text-[10px] text-text-muted">{row.customer_phone}</span>
            )}
          </div>
        ),
        renderTotal: () => '',
      },
      {
        key: 'mode',
        label: 'Mode',
        align: 'center',
        renderCell: (row) => {
          const modeStr = String(row.mode || 'CASH').toUpperCase();
          const isCash = modeStr.includes('CASH');
          const isUpi = modeStr.includes('UPI') || modeStr.includes('GPAY') || modeStr.includes('PAYTM') || modeStr.includes('PHONEPE') || modeStr.includes('QR');
          const isCredit = modeStr.includes('CREDIT') || row.payment_status === 'unpaid' || row.payment_status === 'partial';
          return (
            <span
              className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase border ${
                isCredit
                  ? 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                  : isUpi
                  ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                  : isCash
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : 'bg-surface-app border-border-subtle text-text-secondary'
              }`}
            >
              {row.mode}
            </span>
          );
        },
        renderTotal: () => '',
      },
      {
        key: 'items',
        label: 'Items Sold',
        align: 'left',
        renderCell: (row) => (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-text-secondary line-clamp-2">{row.items}</span>
            {row.filtered_item_qty > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                <Tag size={10} />
                <span>
                  Match: {row.filtered_item_qty} {row.filtered_item_unit} ({formatMoney(row.filtered_item_revenue_paise)})
                </span>
              </span>
            )}
          </div>
        ),
        renderTotal: (_, rows) => `${rows.length} Bills`,
      },
      {
        key: 'total_paise',
        label: 'Total',
        align: 'right',
        isCurrency: true,
        renderCell: (row) => (
          <span className="font-mono font-black text-text-primary">
            {formatMoney(row.total_paise || 0)}
          </span>
        ),
        renderTotal: (totals, rows) =>
          formatMoney(
            totals.total_paise ?? rows.reduce((a, r) => a + Number(r.total_paise || 0), 0)
          ),
      },
    ],
  },
  {
    id: 'purchases',
    title: 'Purchases',
    subtitle: 'Supplier procurement, stock received, payment status, and pending balances',
    icon: <Boxes size={16} />,
    summaryTiles: [
      {
        id: 'total_purchases',
        label: 'Total Purchases',
        color: 'blue',
        computeValue: (_, totals) => formatMoney(totals.total_paise || 0),
        computeSubtext: (rows) => `${rows.length} purchase bill${rows.length === 1 ? '' : 's'} recorded`,
      },
      {
        id: 'total_paid',
        label: 'Total Paid',
        color: 'emerald',
        computeValue: (_, totals) => formatMoney(totals.paid_paise || 0),
        computeSubtext: () => 'Settled procurement payments',
      },
      {
        id: 'total_balance',
        label: 'Outstanding Payable',
        color: 'rose',
        computeValue: (_, totals) => formatMoney(totals.balance_paise || 0),
        computeSubtext: () => 'Pending supplier credit balance',
      },
      {
        id: 'bills_count',
        label: 'Purchases Count',
        color: 'brand',
        computeValue: (rows) => String(rows.length),
        computeSubtext: (rows) =>
          rows.length > 0
            ? `Avg Purchase: ${formatMoney(Math.round(rows.reduce((a, r) => a + (r.total_paise || 0), 0) / rows.length))}`
            : 'No purchases in period',
      },
    ],
    columns: [
      {
        key: 'date',
        label: 'Date',
        align: 'left',
        renderCell: (row) => <span className="font-mono text-xs font-bold">{row.date}</span>,
        renderTotal: () => 'TOTAL',
      },
      {
        key: 'supplier',
        label: 'Supplier',
        align: 'left',
        renderCell: (row) => <span className="font-bold text-text-primary">{row.supplier}</span>,
        renderTotal: () => '',
      },
      {
        key: 'ref',
        label: 'Ref No',
        align: 'left',
        renderCell: (row) => (
          <span className="font-mono text-xs text-brand-400 font-semibold">{row.ref}</span>
        ),
        renderTotal: () => '',
      },
      {
        key: 'total_paise',
        label: 'Total',
        align: 'right',
        isCurrency: true,
        renderCell: (row) => (
          <span className="font-mono font-black text-text-primary">
            {formatMoney(row.total_paise || 0)}
          </span>
        ),
        renderTotal: (totals, rows) =>
          formatMoney(
            totals.total_paise ?? rows.reduce((a, r) => a + Number(r.total_paise || 0), 0)
          ),
      },
      {
        key: 'paid_paise',
        label: 'Paid',
        align: 'right',
        isCurrency: true,
        renderCell: (row) => (
          <span className="font-mono font-bold text-emerald-400">
            {formatMoney(row.paid_paise || 0)}
          </span>
        ),
        renderTotal: (totals, rows) =>
          formatMoney(
            totals.paid_paise ?? rows.reduce((a, r) => a + Number(r.paid_paise || 0), 0)
          ),
      },
      {
        key: 'balance_paise',
        label: 'Balance',
        align: 'right',
        isCurrency: true,
        renderCell: (row) => (
          <span
            className={`font-mono font-black ${
              Number(row.balance_paise || 0) > 0 ? 'text-rose-400' : 'text-text-muted'
            }`}
          >
            {formatMoney(row.balance_paise || 0)}
          </span>
        ),
        renderTotal: (totals, rows) =>
          formatMoney(
            totals.balance_paise ?? rows.reduce((a, r) => a + Number(r.balance_paise || 0), 0)
          ),
      },
    ],
  },
  {
    id: 'delivery',
    title: 'Delivery',
    subtitle: 'Daily delivery orders, dispatch tracking, customer details, and COD collections',
    icon: <Truck size={16} />,
    summaryTiles: [
      {
        id: 'total_deliveries',
        label: 'Total Orders',
        color: 'brand',
        computeValue: (rows) => String(rows.length),
        computeSubtext: (rows) =>
          `${rows.filter((r) => String(r.status).toLowerCase().includes('closed')).length} closed`,
      },
      {
        id: 'completed_deliveries',
        label: 'Closed / Delivered',
        color: 'emerald',
        computeValue: (rows) =>
          String(
            rows.filter(
              (r) =>
                String(r.status).toLowerCase().includes('closed') ||
                String(r.status).toLowerCase().includes('delivered')
            ).length
          ),
        computeSubtext: () => 'Fulfilled customer orders',
      },
      {
        id: 'total_order_amount',
        label: 'Order Value',
        color: 'blue',
        computeValue: (_, totals) => formatMoney(totals.amount_paise || 0),
        computeSubtext: () => 'Gross delivery sales',
      },
      {
        id: 'total_collected',
        label: 'COD Collected',
        color: 'amber',
        computeValue: (_, totals) => formatMoney(totals.collected_paise || 0),
        computeSubtext: () => 'Cash/UPI collected at delivery',
      },
    ],
    columns: [
      {
        key: 'date',
        label: 'Date',
        align: 'left',
        renderCell: (row) => <span className="font-mono text-xs font-bold">{row.date}</span>,
        renderTotal: () => 'TOTAL',
      },
      {
        key: 'bill',
        label: 'Bill / Order #',
        align: 'left',
        renderCell: (row) => (
          <span className="font-mono font-black text-brand-400">{row.bill}</span>
        ),
        renderTotal: () => '',
      },
      {
        key: 'customer',
        label: 'Customer',
        align: 'left',
        renderCell: (row) => <span className="font-bold text-text-primary">{row.customer}</span>,
        renderTotal: () => '',
      },
      {
        key: 'status',
        label: 'Status',
        align: 'center',
        renderCell: (row) => {
          const isClosed = String(row.status).toLowerCase().includes('closed');
          const isPendingPay = String(row.status).toLowerCase().includes('pending');
          const isOut = String(row.status).toLowerCase().includes('out');
          return (
            <span
              className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase border ${
                isClosed
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                  : isPendingPay
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : isOut
                  ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                  : 'bg-surface-app border-border-subtle text-text-secondary'
              }`}
            >
              {row.status}
            </span>
          );
        },
        renderTotal: () => '',
      },
      {
        key: 'amount_paise',
        label: 'Amount',
        align: 'right',
        isCurrency: true,
        renderCell: (row) => (
          <span className="font-mono font-black text-text-primary">
            {formatMoney(row.amount_paise || 0)}
          </span>
        ),
        renderTotal: (totals, rows) =>
          formatMoney(
            totals.amount_paise ?? rows.reduce((a, r) => a + Number(r.amount_paise || 0), 0)
          ),
      },
      {
        key: 'collected_paise',
        label: 'Collected',
        align: 'right',
        isCurrency: true,
        renderCell: (row) => (
          <span className="font-mono font-bold text-emerald-400">
            {formatMoney(row.collected_paise || 0)}
          </span>
        ),
        renderTotal: (totals, rows) =>
          formatMoney(
            totals.collected_paise ?? rows.reduce((a, r) => a + Number(r.collected_paise || 0), 0)
          ),
      },
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory',
    subtitle: 'Stock on hand, goods in/out, customer sales, wastage, closing balances, and stock value',
    icon: <FileSpreadsheet size={16} />,
    summaryTiles: [
      {
        id: 'total_valuation',
        label: 'Inventory Valuation',
        color: 'emerald',
        computeValue: (_, totals) => formatMoney(totals.value_paise || 0),
        computeSubtext: () => 'Based on latest purchase costs',
      },
      {
        id: 'total_items',
        label: 'Tracked Items',
        color: 'brand',
        computeValue: (rows) => String(rows.length),
        computeSubtext: () => 'Active catalogue variants',
      },
      {
        id: 'total_out',
        label: 'Stock Out (Sales)',
        color: 'blue',
        computeValue: (_, totals) => `${totals.out || '0'}`,
        computeSubtext: () => 'Total goods sold in period',
      },
      {
        id: 'total_wastage',
        label: 'Wastage Recorded',
        color: 'rose',
        computeValue: (_, totals) => `${totals.wastage || '0'}`,
        computeSubtext: () => 'Wastage & trimming loss',
      },
    ],
    columns: [
      {
        key: 'product',
        label: 'Product',
        align: 'left',
        renderCell: (row) => (
          <div className="flex flex-col">
            <span className="font-bold text-text-primary">{row.product}</span>
            {row.category && (
              <span className="text-[10px] font-semibold text-text-muted">{row.category}</span>
            )}
          </div>
        ),
        renderTotal: () => 'TOTAL',
      },
      {
        key: 'opening',
        label: 'Opening',
        align: 'right',
        renderCell: (row) => (
          <span className="font-mono text-xs text-text-secondary">{row.opening}</span>
        ),
        renderTotal: (totals) => totals.opening ?? '',
      },
      {
        key: 'in',
        label: 'In (+)',
        align: 'right',
        renderCell: (row) => (
          <span className="font-mono text-xs font-bold text-emerald-400">{row.in}</span>
        ),
        renderTotal: (totals) => totals.in ?? '',
      },
      {
        key: 'out',
        label: 'Out (-)',
        align: 'right',
        renderCell: (row) => (
          <span className="font-mono text-xs font-bold text-blue-400">{row.out}</span>
        ),
        renderTotal: (totals) => totals.out ?? '',
      },
      {
        key: 'wastage',
        label: 'Wastage',
        align: 'right',
        renderCell: (row) => (
          <span className="font-mono text-xs font-bold text-rose-400">{row.wastage}</span>
        ),
        renderTotal: (totals) => totals.wastage ?? '',
      },
      {
        key: 'closing',
        label: 'Closing',
        align: 'right',
        renderCell: (row) => (
          <span className="font-mono text-xs font-black text-brand-400">{row.closing}</span>
        ),
        renderTotal: (totals) => totals.closing ?? '',
      },
      {
        key: 'value_paise',
        label: 'Value',
        align: 'right',
        isCurrency: true,
        renderCell: (row) => (
          <span className="font-mono font-black text-text-primary">
            {formatMoney(row.value_paise || 0)}
          </span>
        ),
        renderTotal: (totals, rows) =>
          formatMoney(
            totals.value_paise ?? rows.reduce((a, r) => a + Number(r.value_paise || 0), 0)
          ),
      },
    ],
  },
];

const formatLocalDate = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const getTodayIso = (): string => formatLocalDate(new Date());

const computePresetDates = (preset: DatePresetKey): { start: string; end: string } => {
  const today = getTodayIso();
  const now = new Date();

  if (preset === 'today') {
    return { start: today, end: today };
  }
  if (preset === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yIso = formatLocalDate(y);
    return { start: yIso, end: yIso };
  }
  if (preset === 'this_week') {
    const w = new Date(now);
    const dayOfWeek = w.getDay(); // 0 is Sun, 1 is Mon
    const diff = w.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    w.setDate(diff);
    return { start: formatLocalDate(w), end: today };
  }
  if (preset === 'this_month') {
    const m = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: formatLocalDate(m), end: today };
  }
  if (preset === 'all_time') {
    return { start: '2020-01-01', end: today };
  }
  return { start: today, end: today };
};

export function ReportsView() {
  const todayIso = getTodayIso();
  const [activeReportId, setActiveReportId] = useState<CoreReportKey>('sales');
  const [datePreset, setDatePreset] = useState<DatePresetKey>('today');
  const [startDate, setStartDate] = useState<string>(todayIso);
  const [endDate, setEndDate] = useState<string>(todayIso);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilterKey>('all');
  const [customItemFilter, setCustomItemFilter] = useState<string>('');
  const [paymentModeFilter, setPaymentModeFilter] = useState<PaymentModeFilterKey>('all');
  const [salesViewMode, setSalesViewMode] = useState<SalesViewModeKey>('bills');
  const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<number>>(new Set());
  const [isDraftsModalOpen, setIsDraftsModalOpen] = useState<boolean>(false);

  const queryClient = useQueryClient();

  const activeReportDef = useMemo(
    () => MODULAR_REPORTS.find((r) => r.id === activeReportId) || MODULAR_REPORTS[0],
    [activeReportId]
  );

  const handleSelectPreset = (preset: DatePresetKey) => {
    setDatePreset(preset);
    if (preset !== 'custom') {
      const range = computePresetDates(preset);
      setStartDate(range.start);
      setEndDate(range.end);
    }
  };

  const activeItemFilter = (customItemFilter.trim() || (categoryFilter !== 'all' ? categoryFilter : '')).toLowerCase();

  // Fetch modular report data via existing IPC_CHANNELS.REPORTS.RUN_REPORT
  const {
    data: reportResult,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery<ReportQueryResult>({
    queryKey: [
      'modular-report',
      activeReportId,
      startDate,
      endDate,
      searchTerm,
      categoryFilter,
      customItemFilter,
      paymentModeFilter,
    ],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.REPORTS.RUN_REPORT, {
        reportId: activeReportId,
        filters: {
          startDate,
          endDate,
          searchTerm: searchTerm.trim() || undefined,
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          itemFilter: customItemFilter.trim() || (categoryFilter !== 'all' ? categoryFilter : undefined),
          paymentMode: paymentModeFilter !== 'all' ? paymentModeFilter : undefined,
        },
      });
      if (!res.success) {
        throw new Error(res.error?.message || 'Failed to load report');
      }
      return res.data;
    },
  });

  // Fetch held/draft invoices
  const { data: heldDrafts = [], refetch: refetchDrafts } = useQuery<any[]>({
    queryKey: ['held-invoices-drafts'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.BILLING.LIST_HELD);
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  const handleDeleteDraft = async (invoiceId: number) => {
    await window.api.invoke(IPC_CHANNELS.BILLING.DELETE_DRAFT, { invoice_id: invoiceId });
    refetchDrafts();
    queryClient.invalidateQueries({ queryKey: ['report-alerts'] });
  };

  const toggleInvoiceExpanded = (invoiceId: number) => {
    setExpandedInvoiceIds((prev) => {
      const next = new Set(prev);
      if (next.has(invoiceId)) next.delete(invoiceId);
      else next.add(invoiceId);
      return next;
    });
  };

  const rows = reportResult?.rows || [];
  const grandTotals = reportResult?.grandTotals || {};
  const productBreakdown = reportResult?.productBreakdown || [];
  const paymentBreakdown = reportResult?.paymentBreakdown || [];

  // Export CSV handler
  const handleExportCsv = () => {
    if (activeReportId === 'sales' && salesViewMode === 'product_breakdown') {
      const headers = ['"Product / Cut"', '"Category"', '"Unit"', '"Quantity Sold"', '"Average Rate (₹)"', '"Total Revenue (₹)"', '"Bills Count"'];
      const csvRows = productBreakdown.map((p: any) =>
        [
          `"${String(p.display_name).replace(/"/g, '""')}"`,
          `"${String(p.category).replace(/"/g, '""')}"`,
          `"${p.unit}"`,
          p.total_qty,
          (p.avg_rate_paise / 100).toFixed(2),
          (p.total_revenue_paise / 100).toFixed(2),
          p.invoice_count,
        ].join(',')
      );
      const totalQty = roundQty(productBreakdown.reduce((a: number, p: any) => a + Number(p.total_qty || 0), 0));
      const totalRev = productBreakdown.reduce((a: number, p: any) => a + Number(p.total_revenue_paise || 0), 0);
      const totalsCsv = [`"TOTAL"`, `""`, `""`, totalQty, `""`, (totalRev / 100).toFixed(2), `""`].join(',');

      const csvString = [headers.join(','), ...csvRows, totalsCsv].join('\n');
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `product_sales_breakdown_${startDate}_to_${endDate}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const headers = activeReportDef.columns.map((c) => `"${c.label.replace(/"/g, '""')}"`);
    const csvRows = rows.map((row) =>
      activeReportDef.columns
        .map((col) => {
          const raw = row[col.key];
          if (col.isCurrency) {
            return (Number(raw || 0) / 100).toFixed(2);
          }
          return `"${String(raw ?? '').replace(/"/g, '""')}"`;
        })
        .join(',')
    );

    const totalsCsv = activeReportDef.columns
      .map((col, idx) => {
        if (idx === 0) return '"TOTAL"';
        if (col.isCurrency) {
          const totalVal =
            grandTotals[col.key] ??
            rows.reduce((a, r) => a + Number(r[col.key] || 0), 0);
          return (Number(totalVal || 0) / 100).toFixed(2);
        }
        const totalStr = grandTotals[col.key] ?? '';
        return `"${String(totalStr).replace(/"/g, '""')}"`;
      })
      .join(',');

    const csvString = [headers.join(','), ...csvRows, totalsCsv].join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeReportDef.id}_report_${startDate}_to_${endDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  const tileColorClasses: Record<SummaryTileSpec['color'], string> = {
    brand: 'border-brand-500/30 bg-brand-500/10 text-brand-400',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    blue: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
    amber: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    purple: 'border-purple-500/30 bg-purple-500/10 text-purple-400',
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
  };

  // Dynamic summary tiles when item filter is active (e.g. Chicken)
  const isItemFilterActive = Boolean(activeItemFilter);
  const filterDisplayName = activeItemFilter ? activeItemFilter.toUpperCase() : '';

  return (
    <div className="flex flex-col h-full bg-surface-base text-text-primary overflow-hidden p-4 sm:p-6 gap-3.5">
      {/* ─── Top Bar: 4 Core Report Tabs + Review Drafts / Export / Print ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        {/* 4 Core Report Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-surface-card border border-border-subtle rounded-2xl p-1.5 shadow-xs">
          {MODULAR_REPORTS.map((rep) => {
            const isActive = rep.id === activeReportId;
            return (
              <button
                key={rep.id}
                type="button"
                onClick={() => {
                  setActiveReportId(rep.id);
                  setExpandedInvoiceIds(new Set());
                }}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-brand-600 text-white border-brand-500 shadow-xs'
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                {rep.icon}
                <span>{rep.title}</span>
              </button>
            );
          })}
        </div>

        {/* Right Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {heldDrafts.length > 0 && (
            <button
              type="button"
              onClick={() => setIsDraftsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-extrabold cursor-pointer transition-colors"
            >
              <FileText size={14} />
              <span>Review Drafts ({heldDrafts.length})</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={rows.length === 0 && productBreakdown.length === 0}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-card hover:bg-surface-hover disabled:opacity-50 border border-border-subtle rounded-xl text-xs font-extrabold text-text-primary cursor-pointer transition-colors shadow-xs"
          >
            <Download size={14} className="text-emerald-400" />
            <span>Export CSV</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded-xl text-xs font-extrabold text-text-primary cursor-pointer transition-colors shadow-xs"
          >
            <Printer size={14} className="text-brand-400" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded-xl text-xs font-bold text-text-secondary cursor-pointer transition-colors shadow-xs"
          >
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ─── 1-Click Date Shortcuts Row ─── */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-surface-card border border-border-subtle rounded-2xl shrink-0 shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-black uppercase text-text-muted px-1">Dates:</span>
          {(
            [
              { key: 'today', label: '📅 Today' },
              { key: 'yesterday', label: '📅 Yesterday' },
              { key: 'this_week', label: '📅 This Week' },
              { key: 'this_month', label: '📅 This Month' },
              { key: 'all_time', label: '📅 All Time' },
              { key: 'custom', label: 'Custom Range' },
            ] as { key: DatePresetKey; label: string }[]
          ).map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => handleSelectPreset(p.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-colors cursor-pointer border ${
                datePreset === p.key
                  ? 'bg-brand-500/20 text-brand-400 border-brand-500/40 shadow-xs'
                  : 'bg-surface-app text-text-secondary border-border-subtle hover:text-text-primary hover:border-text-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom Start & End Date Inputs */}
        <div className="flex items-center gap-1.5 bg-surface-app border border-border-subtle rounded-xl px-2.5 py-1">
          <Calendar size={13} className="text-brand-500 shrink-0" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setDatePreset('custom');
              setStartDate(e.target.value);
            }}
            aria-label="Start Date"
            className="bg-transparent text-xs font-mono font-bold text-text-primary outline-none cursor-pointer"
          />
          <span className="text-text-muted text-xs font-bold">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setDatePreset('custom');
              setEndDate(e.target.value);
            }}
            aria-label="End Date"
            className="bg-transparent text-xs font-mono font-bold text-text-primary outline-none cursor-pointer"
          />
        </div>
      </div>

      {/* ─── High-Power Filter Toolbar: Item Pills + Payment Tender + Search + Views ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 p-3 bg-surface-card border border-border-subtle rounded-2xl shrink-0 shadow-xs">
        {/* Left: Quick Item / Category Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-black uppercase text-text-muted px-1 flex items-center gap-1">
            <Filter size={12} className="text-brand-400" />
            <span>Product:</span>
          </span>

          {(
            [
              { key: 'all', label: 'All Items' },
              { key: 'chicken', label: '🍗 Chicken' },
              { key: 'mutton', label: '🥩 Mutton' },
              { key: 'egg', label: '🥚 Eggs' },
              { key: 'fish', label: '🐟 Fish' },
            ] as { key: CategoryFilterKey; label: string }[]
          ).map((c) => {
            const isSelected = categoryFilter === c.key && !customItemFilter;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setCategoryFilter(c.key);
                  setCustomItemFilter('');
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                    : 'bg-surface-app text-text-secondary border-border-subtle hover:text-text-primary hover:border-text-muted'
                }`}
              >
                {c.label}
              </button>
            );
          })}

          {/* Custom Item Search / Filter Input */}
          <div className="relative">
            <input
              type="text"
              value={customItemFilter}
              onChange={(e) => setCustomItemFilter(e.target.value)}
              placeholder="Or filter cut (e.g. skinless, wings)..."
              className="pl-2.5 pr-6 py-1 bg-surface-app border border-border-subtle rounded-xl text-xs font-semibold text-text-primary placeholder:text-text-muted outline-none focus:border-brand-500 w-48"
            />
            {customItemFilter && (
              <button
                type="button"
                onClick={() => setCustomItemFilter('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Center/Right: Payment Mode Filter + General Search + Sales View Mode */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Payment Mode Selector */}
          <div className="flex items-center gap-1 bg-surface-app border border-border-subtle rounded-xl px-2 py-1">
            <CreditCard size={12} className="text-text-muted" />
            <select
              value={paymentModeFilter}
              onChange={(e) => setPaymentModeFilter(e.target.value as PaymentModeFilterKey)}
              aria-label="Payment Mode"
              className="bg-transparent text-xs font-bold text-text-primary outline-none cursor-pointer"
            >
              <option value="all" className="bg-surface-card text-text-primary">All Payment Modes</option>
              <option value="cash" className="bg-surface-card text-text-primary">💵 Cash Only</option>
              <option value="upi" className="bg-surface-card text-text-primary">📱 UPI / Digital</option>
              <option value="credit" className="bg-surface-card text-text-primary">📋 Credit (Udhaar)</option>
            </select>
          </div>

          {/* General Search Box */}
          <div className="relative w-48 sm:w-56">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Search ${activeReportDef.title.toLowerCase()}...`}
              className="w-full pl-8 pr-3 py-1 bg-surface-app border border-border-subtle rounded-xl text-xs font-semibold text-text-primary placeholder:text-text-muted outline-none focus:border-brand-500"
            />
          </div>

          {/* Sales View Mode Switcher */}
          {activeReportId === 'sales' && (
            <div className="flex items-center gap-1 bg-surface-app border border-border-subtle rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setSalesViewMode('bills')}
                title="Bill-wise Invoice List"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                  salesViewMode === 'bills'
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <FileText size={12} />
                <span>Bills</span>
              </button>
              <button
                type="button"
                onClick={() => setSalesViewMode('product_breakdown')}
                title="Product-wise Sales Breakdown (Kg & Revenue per cut)"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                  salesViewMode === 'product_breakdown'
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Layers size={12} />
                <span>Product Breakdown</span>
              </button>
              <button
                type="button"
                onClick={() => setSalesViewMode('payment_breakdown')}
                title="Payment Tender Summary"
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition-colors ${
                  salesViewMode === 'payment_breakdown'
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <PieChart size={12} />
                <span>Tenders</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── 4 Big Summary Tiles (Adaptive when Chicken or specific item is selected) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {activeReportId === 'sales' && isItemFilterActive ? (
          <>
            <div className="p-4 rounded-2xl border bg-surface-card flex flex-col justify-between shadow-xs border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
              <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-85">
                🍗 {filterDisplayName} Sales Revenue
              </div>
              <div className="text-2xl font-black font-mono text-text-primary mt-1.5">
                {formatMoney(grandTotals.filtered_item_revenue_paise || 0)}
              </div>
              <div className="text-[11px] font-semibold text-text-muted mt-1">
                Filtered revenue from {rows.length} bills
              </div>
            </div>

            <div className="p-4 rounded-2xl border bg-surface-card flex flex-col justify-between shadow-xs border-brand-500/30 bg-brand-500/10 text-brand-400">
              <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-85">
                🍗 {filterDisplayName} Weight / Qty Sold
              </div>
              <div className="text-2xl font-black font-mono text-text-primary mt-1.5">
                {grandTotals.filtered_item_formatted_qty || '0 kg'}
              </div>
              <div className="text-[11px] font-semibold text-text-muted mt-1">
                Total {filterDisplayName.toLowerCase()} volume dispatched
              </div>
            </div>

            <div className="p-4 rounded-2xl border bg-surface-card flex flex-col justify-between shadow-xs border-amber-500/30 bg-amber-500/10 text-amber-400">
              <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-85">
                🧾 {filterDisplayName} Invoices Count
              </div>
              <div className="text-2xl font-black font-mono text-text-primary mt-1.5">
                {rows.length} Bills
              </div>
              <div className="text-[11px] font-semibold text-text-muted mt-1">
                {rows.length > 0
                  ? `Avg ${formatMoney(Math.round((grandTotals.filtered_item_revenue_paise || 0) / rows.length))} per bill`
                  : 'No bills in period'}
              </div>
            </div>

            <div className="p-4 rounded-2xl border bg-surface-card flex flex-col justify-between shadow-xs border-purple-500/30 bg-purple-500/10 text-purple-400">
              <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-85">
                ⚡ Avg Realized {filterDisplayName} Rate
              </div>
              <div className="text-2xl font-black font-mono text-text-primary mt-1.5">
                {grandTotals.filtered_item_qty > 0
                  ? `${formatMoney(Math.round((grandTotals.filtered_item_revenue_paise || 0) / grandTotals.filtered_item_qty))} / ${grandTotals.filtered_item_unit || 'kg'}`
                  : 'N/A'}
              </div>
              <div className="text-[11px] font-semibold text-text-muted mt-1">
                Effective selling rate across cuts
              </div>
            </div>
          </>
        ) : (
          activeReportDef.summaryTiles.map((tile) => (
            <div
              key={tile.id}
              className={`p-4 rounded-2xl border bg-surface-card flex flex-col justify-between shadow-xs ${tileColorClasses[tile.color]}`}
            >
              <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-85">
                {tile.label}
              </div>
              <div className="text-2xl font-black font-mono text-text-primary mt-1.5">
                {tile.computeValue(rows, grandTotals)}
              </div>
              {tile.computeSubtext && (
                <div className="text-[11px] font-semibold text-text-muted mt-1">
                  {tile.computeSubtext(rows, grandTotals)}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ─── Main Content Area: Bill-wise Table, Product Breakdown, or Tender Breakdown ─── */}
      <div className="flex-1 min-h-0 bg-surface-card border border-border-subtle rounded-2xl overflow-hidden flex flex-col shadow-xs">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-text-muted">
            <RefreshCw size={24} className="animate-spin text-brand-500" />
            <p className="text-sm font-bold text-text-secondary">
              Running {activeReportDef.title} report...
            </p>
          </div>
        ) : isError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <AlertTriangle size={32} className="text-red-400 mb-2" />
            <p className="text-sm font-bold text-red-400">Failed to run report</p>
            <p className="text-xs text-text-muted mt-1 max-w-md">
              {(error as any)?.message || 'Error fetching report data'}
            </p>
            <div className="flex items-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => refetch()}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-brand-600 text-white hover:bg-brand-500 cursor-pointer"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('all');
                  setCustomItemFilter('');
                  setPaymentModeFilter('all');
                  setSearchTerm('');
                  handleSelectPreset('today');
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-surface-app border border-border-subtle text-text-secondary hover:text-text-primary cursor-pointer"
              >
                Reset All Filters
              </button>
            </div>
          </div>
        ) : activeReportId === 'sales' && salesViewMode === 'product_breakdown' ? (
          /* ─── View Mode: Product-wise Sales Breakdown Table ─── */
          productBreakdown.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted">
              <Boxes size={36} className="opacity-25 mb-2" />
              <p className="text-sm font-extrabold text-text-secondary">
                No product sales found for {startDate} to {endDate}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Try widening your date range or clearing filters.
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-surface-app border-b border-border-subtle">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-text-secondary">
                      Product / Cut Name
                    </th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-text-secondary">
                      Category
                    </th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-text-secondary text-right">
                      Quantity Sold
                    </th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-text-secondary text-right">
                      Avg Rate (₹)
                    </th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-text-secondary text-right">
                      Total Revenue (₹)
                    </th>
                    <th className="px-4 py-3 text-[11px] font-black uppercase tracking-wider text-text-secondary text-center">
                      Bills Count
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50 text-xs">
                  {productBreakdown.map((item: any, idx: number) => (
                    <tr
                      key={item.key || idx}
                      className="hover:bg-surface-hover/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-bold text-text-primary">
                        {item.display_name}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-surface-app border border-border-subtle text-text-secondary">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-black text-right text-brand-400">
                        {item.formatted_qty}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-right text-text-secondary">
                        {formatMoney(item.avg_rate_paise)} / {item.unit}
                      </td>
                      <td className="px-4 py-3 font-mono font-black text-right text-emerald-400">
                        {formatMoney(item.total_revenue_paise)}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-center text-text-muted">
                        {item.invoice_count} Bills
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 bg-surface-app border-t-2 border-brand-500/40 font-black text-xs text-text-primary">
                  <tr>
                    <td className="px-4 py-3 font-mono font-black">TOTAL</td>
                    <td className="px-4 py-3 text-text-muted">
                      {productBreakdown.length} Products
                    </td>
                    <td className="px-4 py-3 font-mono font-black text-right text-brand-400">
                      {formatQty(
                        productBreakdown.reduce((a: number, p: any) => a + Number(p.total_qty || 0), 0)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">---</td>
                    <td className="px-4 py-3 font-mono font-black text-right text-emerald-400">
                      {formatMoney(
                        productBreakdown.reduce((a: number, p: any) => a + Number(p.total_revenue_paise || 0), 0)
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono font-black text-center">
                      {rows.length} Bills
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        ) : activeReportId === 'sales' && salesViewMode === 'payment_breakdown' ? (
          /* ─── View Mode: Payment Tender Summary ─── */
          <div className="flex-1 p-6 overflow-auto space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {paymentBreakdown.map((pm: any) => (
                <div
                  key={pm.mode}
                  className="p-5 rounded-2xl border border-border-subtle bg-surface-app flex flex-col justify-between shadow-xs"
                >
                  <div className="text-xs font-black uppercase text-text-muted">{pm.label}</div>
                  <div className="text-2xl font-black font-mono text-emerald-400 mt-2">
                    {formatMoney(pm.amount_paise)}
                  </div>
                  <div className="text-xs font-semibold text-text-secondary mt-1">
                    {pm.count} Transactions
                  </div>
                </div>
              ))}
            </div>

            <div className="border border-border-subtle rounded-2xl overflow-hidden">
              <table className="w-full border-collapse text-left">
                <thead className="bg-surface-app border-b border-border-subtle text-[11px] font-black uppercase text-text-secondary">
                  <tr>
                    <th className="px-4 py-3">Tender Method</th>
                    <th className="px-4 py-3 text-center">Transactions</th>
                    <th className="px-4 py-3 text-right">Total Amount (₹)</th>
                    <th className="px-4 py-3 text-right">Share of Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle/50 text-xs">
                  {paymentBreakdown.map((pm: any) => {
                    const totalSales = grandTotals.total_paise || 1;
                    const share = ((pm.amount_paise / totalSales) * 100).toFixed(1);
                    return (
                      <tr key={pm.mode} className="hover:bg-surface-hover/50">
                        <td className="px-4 py-3 font-bold text-text-primary">{pm.label}</td>
                        <td className="px-4 py-3 font-mono font-bold text-center">{pm.count}</td>
                        <td className="px-4 py-3 font-mono font-black text-right text-emerald-400">
                          {formatMoney(pm.amount_paise)}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-right text-text-muted">
                          {share}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : rows.length === 0 ? (
          /* ─── Empty State with Quick Helper Buttons ─── */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-muted">
            <FileSpreadsheet size={36} className="opacity-25 mb-2" />
            <p className="text-sm font-extrabold text-text-secondary">
              No {activeReportDef.title.toLowerCase()} records for {startDate} to {endDate}
            </p>
            <p className="text-xs text-text-muted mt-1">
              Select a wider period or click a shortcut below:
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
              <button
                type="button"
                onClick={() => handleSelectPreset('today')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-surface-app border border-border-subtle hover:border-brand-500 hover:text-brand-400 transition-colors cursor-pointer"
              >
                📅 Today's Sales
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('yesterday')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-surface-app border border-border-subtle hover:border-brand-500 hover:text-brand-400 transition-colors cursor-pointer"
              >
                📅 View Yesterday
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('this_week')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-surface-app border border-border-subtle hover:border-brand-500 hover:text-brand-400 transition-colors cursor-pointer"
              >
                📅 View This Week
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('this_month')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-surface-app border border-border-subtle hover:border-brand-500 hover:text-brand-400 transition-colors cursor-pointer"
              >
                📅 View This Month
              </button>
              <button
                type="button"
                onClick={() => handleSelectPreset('all_time')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-extrabold bg-brand-500/15 border border-brand-500/30 text-brand-300 hover:bg-brand-500/25 transition-colors cursor-pointer"
              >
                📅 View All Time
              </button>
            </div>
          </div>
        ) : (
          /* ─── Standard Clean Table with Bold Totals Row and Accordion Expansion ─── */
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-surface-app border-b border-border-subtle">
                <tr>
                  {activeReportId === 'sales' && (
                    <th className="w-8 px-2 py-3 text-center"></th>
                  )}
                  {activeReportDef.columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-3 text-[11px] font-black uppercase tracking-wider text-text-secondary ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/50 text-xs">
                {rows.map((row, idx) => {
                  const isExpanded = activeReportId === 'sales' && expandedInvoiceIds.has(row._row_id);
                  return (
                    <React.Fragment key={row._row_id ?? idx}>
                      <tr
                        onClick={() => activeReportId === 'sales' && toggleInvoiceExpanded(row._row_id)}
                        className={`hover:bg-surface-hover/50 transition-colors ${
                          activeReportId === 'sales' ? 'cursor-pointer' : ''
                        } ${isExpanded ? 'bg-surface-hover/40' : ''}`}
                      >
                        {activeReportId === 'sales' && (
                          <td className="px-2 py-3 text-center text-text-muted">
                            {isExpanded ? (
                              <ChevronDown size={14} className="text-brand-400 inline" />
                            ) : (
                              <ChevronRight size={14} className="inline opacity-50" />
                            )}
                          </td>
                        )}
                        {activeReportDef.columns.map((col) => (
                          <td
                            key={col.key}
                            className={`px-4 py-3 ${
                              col.align === 'right'
                                ? 'text-right'
                                : col.align === 'center'
                                ? 'text-center'
                                : 'text-left'
                            }`}
                          >
                            {col.renderCell ? col.renderCell(row) : String(row[col.key] ?? '-')}
                          </td>
                        ))}
                      </tr>

                      {/* Expandable Line Items Drawer for Sales Invoices */}
                      {isExpanded && row.items_detail && Array.isArray(row.items_detail) && (
                        <tr className="bg-surface-app/70 border-b border-border-subtle">
                          <td colSpan={activeReportDef.columns.length + 1} className="p-3 pl-10">
                            <div className="bg-surface-card border border-border-subtle rounded-xl p-3 shadow-inner space-y-2">
                              <div className="flex items-center justify-between text-xs font-black text-text-primary border-b border-border-subtle/50 pb-1.5">
                                <span className="flex items-center gap-1.5">
                                  <Tag size={13} className="text-brand-400" />
                                  <span>Bill {row.bill_no} Itemized Lines</span>
                                </span>
                                <span className="text-text-muted font-normal text-[11px]">
                                  {row.items_detail.length} item{row.items_detail.length === 1 ? '' : 's'}
                                </span>
                              </div>

                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="text-[10px] font-black uppercase text-text-muted border-b border-border-subtle/30">
                                    <th className="py-1">Item / Cut</th>
                                    <th className="py-1">Category</th>
                                    <th className="py-1 text-right">Quantity</th>
                                    <th className="py-1 text-right">Rate</th>
                                    <th className="py-1 text-right">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border-subtle/20 font-mono">
                                  {row.items_detail.map((it: any, iIdx: number) => {
                                    const isMatch =
                                      activeItemFilter &&
                                      (it.category?.toLowerCase().includes(activeItemFilter) ||
                                        it.product_name?.toLowerCase().includes(activeItemFilter) ||
                                        it.display_name?.toLowerCase().includes(activeItemFilter));
                                    return (
                                      <tr
                                        key={it.item_id || iIdx}
                                        className={isMatch ? 'bg-emerald-500/10 text-emerald-300' : ''}
                                      >
                                        <td className="py-1.5 font-bold font-sans">
                                          {it.display_name}
                                          {isMatch && (
                                            <span className="ml-1.5 text-[10px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
                                              Matched
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-1.5 font-sans text-text-muted text-[11px]">
                                          {it.category}
                                        </td>
                                        <td className="py-1.5 text-right font-black">
                                          {it.formatted_qty}
                                        </td>
                                        <td className="py-1.5 text-right text-text-secondary">
                                          {formatMoney(it.unit_price_paise)}
                                        </td>
                                        <td className="py-1.5 text-right font-black text-text-primary">
                                          {formatMoney(it.line_total_paise)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-10 bg-surface-app border-t-2 border-brand-500/40 font-black text-xs text-text-primary">
                <tr>
                  {activeReportId === 'sales' && <td></td>}
                  {activeReportDef.columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 font-mono font-black ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                          ? 'text-center'
                          : 'text-left'
                      }`}
                    >
                      {col.renderTotal
                        ? col.renderTotal(grandTotals, rows)
                        : grandTotals[col.key] ?? ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ─── Review Drafts Modal ─── */}
      {isDraftsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-card border border-border-subtle rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-amber-400" />
                <h3 className="text-base font-black text-text-primary">
                  Held / Draft Invoices ({heldDrafts.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDraftsModalOpen(false)}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {heldDrafts.length === 0 ? (
              <div className="py-8 text-center text-xs text-text-muted flex flex-col items-center gap-2">
                <CheckCircle2 size={28} className="text-emerald-400" />
                <span>All draft invoices have been cleared.</span>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2">
                {heldDrafts.map((draft: any) => (
                  <div
                    key={draft.id}
                    className="p-3 rounded-xl bg-surface-app border border-border-subtle flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-mono font-bold text-xs text-text-primary">
                        Draft #{draft.id} ({draft.invoice_number || 'Held Bill'})
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        {draft.created_at?.slice(0, 16)} · Total: {formatMoney(draft.total_paise || 0)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteDraft(draft.id)}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 cursor-pointer transition-colors"
                      title="Delete Draft"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setIsDraftsModalOpen(false)}
                className="px-4 py-2 bg-surface-hover hover:bg-surface-app border border-border-subtle rounded-xl text-xs font-bold text-text-primary cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ReportsView;
