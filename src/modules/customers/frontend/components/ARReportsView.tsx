import { useState } from 'react';
import {
  BarChart3,
  Clock,
  FileText,
  Landmark,
  Printer,
  Download,
  Search,
  Filter,
  Layers,
  Wallet,
  MessageCircle,
  X,
  Check
} from 'lucide-react';
import OutstandingDashboard from './OutstandingDashboard';
import AgingDashboard from './AgingDashboard';
import CustomerSearch from './CustomerSearch';
import { useARReports } from '../hooks/useCustomerLedger';
import { formatPaise, formatDate, getLedgerRefLabel } from '../types/customer.types';
import { formatMoney, roundMoney, rupeesToPaise, paiseToRupees } from '../../../../core/shared/math';
import type { Customer, CustomerStatement } from '../types/customer.types';

type Tab = 'dashboard' | 'aging' | 'statement' | 'collections';

export default function ARReportsView() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  // ─── Statement State ─────────────────────────────────────────
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  
  const [stmtStart, setStmtStart] = useState(firstDayOfMonth);
  const [stmtEnd, setStmtEnd] = useState(today);
  const [statementData, setStatementData] = useState<CustomerStatement | null>(null);
  const [isStmtLoading, setIsStmtLoading] = useState(false);
  const [stmtError, setStmtError] = useState<string | null>(null);

  // ─── Direct Collect Payment Modal State ──────────────────────
  const [collectModalOpen, setCollectModalOpen] = useState(false);
  const [collectCust, setCollectCust] = useState<Customer | null>(null);
  const [collectAmountRupees, setCollectAmountRupees] = useState<string>('');
  const [collectMethod, setCollectMethod] = useState<'cash' | 'upi' | 'bank_transfer' | 'card' | 'cheque' | 'advance_adjustment'>('cash');
  const [collectRef, setCollectRef] = useState('');
  const [collectNotes, setCollectNotes] = useState('');
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectFeedback, setCollectFeedback] = useState<string | null>(null);

  // ─── Collections State ───────────────────────────────────────
  const [colStart, setColStart] = useState(firstDayOfMonth);
  const [colEnd, setColEnd] = useState(today);
  const [colCustomer, setColCustomer] = useState<Customer | null>(null);
  const [colMethod, setColMethod] = useState<string>('all');

  const { useCollectionReport } = useARReports();
  const { data: collectionReport, refetch: refetchCol } = useCollectionReport({
    startDate: colStart,
    endDate: colEnd,
    customerId: colCustomer ? colCustomer.id : undefined,
    method: colMethod !== 'all' ? colMethod : undefined,
  });

  const openCollectModalForCustomer = (cust: Customer | null) => {
    const target = cust || selectedCust;
    setCollectCust(target);
    if (target && target.outstanding_balance_paise > 0) {
      setCollectAmountRupees(String(roundMoney(paiseToRupees(target.outstanding_balance_paise))));
    } else {
      setCollectAmountRupees('');
    }
    setCollectMethod('cash');
    setCollectRef('');
    setCollectNotes('');
    setCollectModalOpen(true);
  };

  const handleConfirmCollectPayment = async () => {
    if (!collectCust) return;
    const amountPaise = rupeesToPaise(roundMoney(parseFloat(collectAmountRupees || '0')));
    if (amountPaise <= 0) return;

    setIsCollecting(true);
    try {
      if (collectMethod === 'advance_adjustment') {
        const unpaidRes = (await window.api.invoke('customers:get-unpaid-invoices', {
          customer_id: collectCust.id,
        })) as { success: boolean; data?: any[] };
        let remaining = Math.min(amountPaise, collectCust.advance_balance_paise || amountPaise);
        const allocations: { sale_id: number; invoice_number: string; amount_paise: number }[] = [];
        for (const inv of unpaidRes.data || []) {
          if (remaining <= 0) break;
          const due = Number(inv.balance_due_paise || 0);
          if (due <= 0) continue;
          const alloc = Math.min(remaining, due);
          allocations.push({
            sale_id: inv.id,
            invoice_number: inv.invoice_number,
            amount_paise: alloc,
          });
          remaining -= alloc;
        }
        if (allocations.length > 0) {
          await window.api.invoke('customers:apply-advance', {
            customer_id: collectCust.id,
            allocations,
            notes: collectNotes.trim() || 'Advance adjusted against outstanding bills',
          });
        } else {
          await window.api.invoke('customers:record-payment', {
            customer_id: collectCust.id,
            amount_paise: amountPaise,
            method: 'advance_adjustment',
            payment_date: today,
            notes: collectNotes.trim() || 'Advance adjusted against outstanding balance',
          });
        }
      } else {
        await window.api.invoke('customers:record-payment', {
          customer_id: collectCust.id,
          amount_paise: amountPaise,
          method: collectMethod,
          payment_date: today,
          reference_number: collectRef.trim() || undefined,
          notes: collectNotes.trim() || `Counter payment received (${collectMethod.toUpperCase()})`,
        });
      }

      setCollectFeedback(`Collected ₹${formatMoney(paiseToRupees(amountPaise))} from ${collectCust.name}`);
      setTimeout(() => setCollectFeedback(null), 4000);
      setCollectModalOpen(false);
      refetchCol();
      if (selectedCust && selectedCust.id === collectCust.id) {
        const fresh = await window.api.invoke('customers:get-by-id', { id: collectCust.id });
        if (fresh?.success && fresh.data) {
          setSelectedCust(fresh.data);
          handleFetchStatement(fresh.data);
        }
      }
    } catch (err: any) {
      alert(err.message || 'Failed to record payment');
    } finally {
      setIsCollecting(false);
    }
  };

  const handleSendWhatsAppReminder = async (cust: Customer) => {
    const dueRupees = formatMoney(paiseToRupees(cust.outstanding_balance_paise || 0));
    const msg = `Namaste ${cust.name}, friendly reminder regarding your outstanding account balance of ₹${dueRupees} (${cust.customer_code}). Kindly arrange settlement at your convenience. Thank you!`;
    const cleanPhone = (cust.whatsapp || cust.phone || '').replace(/\D/g, '');
    const waPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    try {
      const remRes = (await window.api.invoke('customers:create-reminder', {
        customer_id: cust.id,
        channel: 'whatsapp',
        reminder_type: 'payment_due',
        scheduled_date: today,
        outstanding_at_time_paise: cust.outstanding_balance_paise || 0,
        message_text: msg,
        notes: 'Dispatched via AR Reports WhatsApp Reminder',
      })) as { success: boolean; data?: { id: number } };
      if (remRes?.success && remRes.data?.id) {
        await window.api.invoke('customers:record-whatsapp-attempt', {
          id: remRes.data.id,
          success: true,
        });
      }
    } catch (e) {
      console.error('Failed to log WhatsApp reminder:', e);
    }

    const url = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Fetch statement
  const handleFetchStatement = async (cust?: Customer) => {
    const targetCust = cust || selectedCust;
    if (!targetCust || !stmtStart || !stmtEnd) return;
    setIsStmtLoading(true);
    setStmtError(null);
    try {
      const res = (await window.api.invoke('customers:get-statement', {
        customer_id: targetCust.id,
        startDate: stmtStart,
        endDate: stmtEnd,
      })) as { success: boolean; data?: CustomerStatement; error?: string };
      if (res.success && res.data) {
        setStatementData(res.data);
      } else {
        setStmtError(res.error || 'Failed to fetch statement');
      }
    } catch (err: any) {
      setStmtError(err.message || 'Error fetching customer statement');
    } finally {
      setIsStmtLoading(false);
    }
  };

  // Quick date presets for statements
  const handleSetStmtPreset = (preset: 'this_month' | 'last_month' | 'last_30' | 'fy' | 'all') => {
    const now = new Date();
    if (preset === 'this_month') {
      setStmtStart(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
      setStmtEnd(today);
    } else if (preset === 'last_month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const last = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setStmtStart(first);
      setStmtEnd(last);
    } else if (preset === 'last_30') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setStmtStart(past);
      setStmtEnd(today);
    } else if (preset === 'fy') {
      const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      setStmtStart(`${currentYear}-04-01`);
      setStmtEnd(today);
    } else if (preset === 'all') {
      setStmtStart('2020-01-01');
      setStmtEnd(today);
    }
  };

  // Quick date presets for collections
  const handleSetColPreset = (preset: 'today' | 'yesterday' | 'last_7' | 'this_month' | 'last_month') => {
    const now = new Date();
    if (preset === 'today') {
      setColStart(today);
      setColEnd(today);
    } else if (preset === 'yesterday') {
      const y = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setColStart(y);
      setColEnd(y);
    } else if (preset === 'last_7') {
      const p7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      setColStart(p7);
      setColEnd(today);
    } else if (preset === 'this_month') {
      setColStart(new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
      setColEnd(today);
    } else if (preset === 'last_month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      const last = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
      setColStart(first);
      setColEnd(last);
    }
  };

  // Export Statement CSV
  const handleExportStatementCSV = () => {
    if (!statementData) return;
    const header = ['Date', 'Entry Type', 'Invoice / Ref #', 'Description', 'Debit (₹)', 'Credit (₹)', 'Running Balance (₹)'];
    const csvRows = statementData.entries.map((e) => [
      e.entry_date,
      getLedgerRefLabel(e.ref_type),
      e.invoice_number || e.ref_id || '',
      `"${(e.description || '').replace(/"/g, '""')}"`,
      formatMoney(paiseToRupees(e.debit_paise)),
      formatMoney(paiseToRupees(e.credit_paise)),
      formatMoney(paiseToRupees(e.running_balance_paise)),
    ]);

    const fileContent =
      `Customer Statement: ${statementData.customer.name} (${statementData.customer.customer_code})\n` +
      `Period: ${statementData.startDate} to ${statementData.endDate}\n` +
      `Opening Balance: ${formatMoney(paiseToRupees(statementData.opening_balance_paise))}\n` +
      `Closing Balance: ${formatMoney(paiseToRupees(statementData.closing_balance_paise))}\n\n` +
      [header.join(','), ...csvRows.map((r) => r.join(','))].join('\n');

    const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Statement_${statementData.customer.customer_code}_${statementData.startDate}_${statementData.endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export Collections CSV
  const handleExportCollectionsCSV = () => {
    if (!collectionReport || !collectionReport.payments) return;
    const header = ['Payment Date', 'Customer Code', 'Customer Name', 'Method', 'Reference #', 'Collected By', 'Allocations', 'Amount Paid (₹)', 'On-Account (₹)'];
    const csvRows = collectionReport.payments.map((p) => {
      const allocSummary = p.allocations.map((a) => `${a.invoice_number} (₹${formatMoney(paiseToRupees(a.allocated_paise))})`).join('; ') || 'On-Account';
      return [
        p.payment_date,
        p.customer_code,
        `"${p.customer_name.replace(/"/g, '""')}"`,
        p.method.toUpperCase(),
        p.reference_number || '',
        p.received_by_display || '',
        `"${allocSummary.replace(/"/g, '""')}"`,
        formatMoney(paiseToRupees(p.amount_paise)),
        formatMoney(paiseToRupees(p.unallocated_paise)),
      ];
    });

    const fileContent =
      `Customer Collections Report: ${colStart} to ${colEnd}\n` +
      `Total Collected: ${formatMoney(paiseToRupees(collectionReport.total_collected_paise))}\n\n` +
      [header.join(','), ...csvRows.map((r) => r.join(','))].join('\n');

    const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Collections_${colStart}_${colEnd}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col select-none text-xs text-text-secondary">
      {/* Navigation Sub-Tabs */}
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-card px-6 print:hidden">
        <div className="flex">
          {[
            { id: 'dashboard', label: 'Outstanding Dashboard', icon: <Landmark size={14} /> },
            { id: 'aging', label: 'Aging Schedule', icon: <Clock size={14} /> },
            { id: 'statement', label: 'Customer Statements', icon: <FileText size={14} /> },
            { id: 'collections', label: 'Collection Reports', icon: <BarChart3 size={14} /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as Tab)}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs transition-colors ${
                activeTab === t.id
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/10'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 py-1.5">
          {collectFeedback && (
            <span className="px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[11px] flex items-center gap-1">
              <Check size={12} />
              {collectFeedback}
            </span>
          )}
          <button
            type="button"
            onClick={() => openCollectModalForCustomer(selectedCust)}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors"
          >
            <Wallet size={13} />
            <span>Collect Payment</span>
          </button>
          {selectedCust && (
            <button
              type="button"
              onClick={() => handleSendWhatsAppReminder(selectedCust)}
              className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-500 font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <MessageCircle size={13} />
              <span>WhatsApp Reminder</span>
            </button>
          )}
        </div>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'dashboard' && (
          <OutstandingDashboard
            onSelectCustomer={async (customerId: number) => {
              setActiveTab('statement');
              try {
                const res = await window.api.invoke('customers:get-by-id', { id: customerId });
                if (res?.success && res.data) {
                  setSelectedCust(res.data);
                  handleFetchStatement(res.data);
                }
              } catch (e) {
                console.error(e);
              }
            }}
          />
        )}

        {activeTab === 'aging' && <AgingDashboard />}

        {/* ─── SECTION B: CUSTOMER STATEMENTS ───────────────────────── */}
        {activeTab === 'statement' && (
          <div className="h-full overflow-auto p-6 space-y-6">
            {/* Input Toolbar */}
            <div className="bg-surface-card border border-border-subtle p-5 rounded-2xl flex flex-wrap items-end justify-between gap-4 print:hidden shadow-sm">
              <div className="flex flex-wrap items-end gap-4">
                <div className="w-72">
                  <label className="block text-[11px] text-text-primary font-bold mb-1">Select Customer *</label>
                  <CustomerSearch
                    value={selectedCust}
                    onChange={(c) => {
                      setSelectedCust(c);
                      setStatementData(null);
                    }}
                    showBalance={true}
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-primary font-bold mb-1">Period From</label>
                  <input
                    type="date"
                    value={stmtStart}
                    onChange={(e) => setStmtStart(e.target.value)}
                    className="bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-text-primary font-mono text-xs shadow-sm focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-primary font-bold mb-1">Period To</label>
                  <input
                    type="date"
                    value={stmtEnd}
                    onChange={(e) => setStmtEnd(e.target.value)}
                    className="bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-text-primary font-mono text-xs shadow-sm focus:outline-none focus:border-brand-500"
                  />
                </div>

                <button
                  onClick={() => handleFetchStatement()}
                  disabled={!selectedCust || !stmtStart || !stmtEnd || isStmtLoading}
                  className="px-5 py-2.5 bg-brand-500 hover:bg-brand-400 rounded-xl text-white font-bold text-xs transition-colors disabled:opacity-40 shadow-sm flex items-center gap-1.5"
                >
                  <Search size={14} />
                  <span>{isStmtLoading ? 'Loading Statement...' : 'Generate Statement'}</span>
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-text-muted font-bold mr-1">Quick Range:</span>
                {[
                  { id: 'this_month', label: 'This Month' },
                  { id: 'last_month', label: 'Last Month' },
                  { id: 'last_30', label: 'Last 30 Days' },
                  { id: 'fy', label: 'Financial Year' },
                  { id: 'all', label: 'All Time' },
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSetStmtPreset(p.id as any)}
                    className="px-2.5 py-1 rounded-lg bg-surface-panel hover:bg-surface-hover border border-border-subtle text-[10px] font-medium text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {stmtError && (
              <div className="p-4 rounded-xl bg-red-100 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 text-red-800 dark:text-red-400 text-xs font-semibold print:hidden">
                {stmtError}
              </div>
            )}

            {/* Standalone A4 Formal Customer Statement */}
            {statementData && (
              <div className="space-y-4">
                {/* Print/Export Bar */}
                <div className="flex items-center justify-between print:hidden bg-surface-card border border-border-subtle p-3 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2 text-text-primary font-bold">
                    <FileText size={16} className="text-brand-500" />
                    <span>
                      Customer Statement: {statementData.customer.name} ({statementData.customer.customer_code})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openCollectModalForCustomer(statementData.customer)}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Wallet size={14} />
                      <span>Collect Payment</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendWhatsAppReminder(statementData.customer)}
                      className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-500 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors"
                    >
                      <MessageCircle size={14} />
                      <span>WhatsApp Reminder</span>
                    </button>
                    <button
                      onClick={handleExportStatementCSV}
                      className="px-3 py-1.5 bg-surface-panel hover:bg-surface-hover border border-border-subtle rounded-lg font-bold text-xs text-text-primary flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Download size={14} className="text-emerald-500" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      onClick={() => window.print()}
                      className="px-4 py-1.5 bg-brand-500 text-white hover:bg-brand-400 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Printer size={14} />
                      <span>Print A4 Statement</span>
                    </button>
                  </div>
                </div>

                {/* Printable Document (A4 Styled) */}
                <div className="bg-white text-black p-8 rounded-2xl border border-gray-200 shadow-md space-y-6 font-sans print:border-0 print:p-0 print:shadow-none print:m-0 print:w-full">
                  {/* Formal Header: Shop & Customer Details */}
                  <div className="border-b-2 border-gray-800 pb-5">
                    <div className="flex justify-between items-start">
                      <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                          {statementData.shopInfo?.name || 'PREMIUM MEAT SHOP'}
                        </h1>
                        <p className="text-xs text-gray-600 mt-1">{statementData.shopInfo?.address}</p>
                        <div className="text-[11px] text-gray-600 font-mono mt-0.5 space-x-3">
                          {statementData.shopInfo?.phone && <span>Phone: {statementData.shopInfo.phone}</span>}
                          {statementData.shopInfo?.gstin && <span>GSTIN: {statementData.shopInfo.gstin}</span>}
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="inline-block px-3 py-1 bg-gray-900 text-white font-extrabold text-xs uppercase tracking-widest rounded">
                          STATEMENT OF ACCOUNT
                        </span>
                        <p className="text-xs font-mono font-bold text-gray-800 mt-2">
                          Date: {formatDate(today)}
                        </p>
                        <p className="text-[11px] font-mono text-gray-600">
                          Period: {formatDate(statementData.startDate)} – {formatDate(statementData.endDate)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Customer Information Block */}
                  <div className="grid grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Statement For:</span>
                      <h3 className="text-sm font-extrabold text-gray-900 mt-0.5">{statementData.customer.name}</h3>
                      {statementData.customer.business_name && (
                        <p className="text-xs font-semibold text-gray-700">{statementData.customer.business_name}</p>
                      )}
                      <p className="text-[11px] font-mono text-gray-600 mt-0.5">Code: {statementData.customer.customer_code}</p>
                      {statementData.customer.phone && (
                        <p className="text-[11px] font-mono text-gray-600">Phone: {statementData.customer.phone}</p>
                      )}
                    </div>

                    <div className="text-right flex flex-col justify-between">
                      <div>
                        {statementData.customer.gstin && (
                          <p className="text-[11px] font-mono text-gray-700">GSTIN: {statementData.customer.gstin}</p>
                        )}
                        {statementData.customer.billing_address_line1 && (
                          <p className="text-xs text-gray-600 mt-0.5">
                            {statementData.customer.billing_address_line1}, {statementData.customer.billing_city}
                          </p>
                        )}
                      </div>
                      <div className="pt-2 border-t border-gray-200">
                        <span className="text-[10px] text-gray-500 font-bold uppercase">Credit Terms:</span>
                        <span className="text-xs font-bold text-gray-900 ml-1">
                          Limit {formatPaise(statementData.customer.credit_limit_paise)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-4 gap-3 bg-gray-100 border border-gray-300 rounded-xl p-4 text-center">
                    <div className="border-r border-gray-300 pr-2">
                      <span className="text-[10px] text-gray-600 font-bold uppercase block">Opening Balance</span>
                      <p className="font-mono text-sm font-bold text-gray-900 mt-1">
                        {formatPaise(statementData.opening_balance_paise)}
                      </p>
                    </div>

                    <div className="border-r border-gray-300 pr-2">
                      <span className="text-[10px] text-gray-600 font-bold uppercase block">Total Debits (Purchases)</span>
                      <p className="font-mono text-sm font-bold text-red-600 mt-1">
                        +{formatPaise(statementData.total_debits_paise)}
                      </p>
                    </div>

                    <div className="border-r border-gray-300 pr-2">
                      <span className="text-[10px] text-gray-600 font-bold uppercase block">Total Credits (Payments)</span>
                      <p className="font-mono text-sm font-bold text-emerald-700 mt-1">
                        -{formatPaise(statementData.total_credits_paise)}
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] text-gray-600 font-bold uppercase block">Closing Balance</span>
                      <p className="font-mono text-base font-extrabold text-gray-900 mt-1">
                        {formatPaise(statementData.closing_balance_paise)}
                      </p>
                    </div>
                  </div>

                  {/* Itemized Ledger Table */}
                  <div className="border border-gray-300 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-gray-200 border-b border-gray-300 text-gray-800 text-[11px]">
                          <th className="py-2.5 px-3 font-bold">Date</th>
                          <th className="py-2.5 px-3 font-bold">Type</th>
                          <th className="py-2.5 px-3 font-bold">Invoice / Ref #</th>
                          <th className="py-2.5 px-4 font-bold">Description</th>
                          <th className="py-2.5 px-3 text-right font-bold text-red-700">Debit (₹)</th>
                          <th className="py-2.5 px-3 text-right font-bold text-emerald-700">Credit (₹)</th>
                          <th className="py-2.5 px-3 text-right font-bold text-gray-900">Balance (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 text-gray-900">
                        {statementData.entries.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-10 text-gray-500 italic">
                              No financial transactions recorded in this period.
                            </td>
                          </tr>
                        ) : (
                          statementData.entries.map((entry) => (
                            <tr key={entry.id} className="hover:bg-gray-50">
                              <td className="py-2 px-3 font-mono">{formatDate(entry.entry_date)}</td>
                              <td className="py-2 px-3 font-semibold text-[10px] uppercase text-gray-700">
                                {getLedgerRefLabel(entry.ref_type)}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-gray-800">
                                {entry.invoice_number || (entry.ref_id ? `#${entry.ref_id}` : '—')}
                              </td>
                              <td className="py-2 px-4 font-medium">{entry.description}</td>
                              <td className="py-2 px-3 text-right font-mono text-red-600 font-bold">
                                {entry.debit_paise > 0 ? `+${formatPaise(entry.debit_paise)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">
                                {entry.credit_paise > 0 ? `-${formatPaise(entry.credit_paise)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-extrabold text-gray-900">
                                {formatPaise(entry.running_balance_paise)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Statement Footer & Signoff */}
                  <div className="pt-8 flex justify-between items-end text-xs text-gray-600">
                    <div>
                      <p className="font-semibold text-gray-800">Terms & Payment Instructions:</p>
                      <p className="text-[10px] text-gray-500 mt-0.5 max-w-sm">
                        Please settle outstanding balances via UPI, Bank Transfer or Cash at the billing counter.
                        For billing discrepancies, contact the accounts desk within 7 days of statement receipt.
                      </p>
                    </div>

                    <div className="text-center">
                      <div className="w-48 border-b border-gray-400 mb-1" />
                      <span className="text-[10px] font-bold text-gray-700 uppercase">Authorized Signatory</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── SECTION C: COLLECTION REPORTS ────────────────────────── */}
        {activeTab === 'collections' && (
          <div className="h-full overflow-auto p-6 space-y-6">
            {/* Filter Toolbar */}
            <div className="bg-surface-card border border-border-subtle p-5 rounded-2xl flex flex-wrap items-end justify-between gap-4 shadow-sm">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-[11px] text-text-primary font-bold mb-1">Collection From</label>
                  <input
                    type="date"
                    value={colStart}
                    onChange={(e) => setColStart(e.target.value)}
                    className="bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-text-primary font-mono text-xs shadow-sm focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-primary font-bold mb-1">Collection To</label>
                  <input
                    type="date"
                    value={colEnd}
                    onChange={(e) => setColEnd(e.target.value)}
                    className="bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-text-primary font-mono text-xs shadow-sm focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="w-56">
                  <label className="block text-[11px] text-text-primary font-bold mb-1">Customer (Optional)</label>
                  <CustomerSearch value={colCustomer} onChange={setColCustomer} showBalance={false} />
                </div>

                <div>
                  <label className="block text-[11px] text-text-primary font-bold mb-1">Payment Method</label>
                  <select
                    value={colMethod}
                    onChange={(e) => setColMethod(e.target.value)}
                    className="bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-text-primary text-xs shadow-sm focus:outline-none focus:border-brand-500 font-bold"
                  >
                    <option value="all">All Methods</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cheque">Cheque</option>
                    <option value="advance_adjustment">Advance Adjustment</option>
                  </select>
                </div>

                <button
                  onClick={() => refetchCol()}
                  className="px-5 py-2.5 bg-brand-500 hover:bg-brand-400 rounded-xl text-white font-bold text-xs transition-colors shadow-sm flex items-center gap-1.5"
                >
                  <Filter size={14} />
                  <span>Filter Collections</span>
                </button>
              </div>

              {/* Actions & Presets */}
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCollectionsCSV}
                    disabled={!collectionReport?.payments?.length}
                    className="px-3 py-1.5 bg-surface-panel hover:bg-surface-hover border border-border-subtle rounded-xl text-xs font-bold text-text-primary flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-40"
                  >
                    <Download size={14} className="text-emerald-500" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    disabled={!collectionReport?.payments?.length}
                    className="px-3 py-1.5 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-40"
                  >
                    <Printer size={14} />
                    <span>Print Report</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  {[
                    { id: 'today', label: 'Today' },
                    { id: 'yesterday', label: 'Yesterday' },
                    { id: 'last_7', label: 'Last 7 Days' },
                    { id: 'this_month', label: 'This Month' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSetColPreset(p.id as any)}
                      className="px-2 py-0.5 rounded-md bg-surface-panel hover:bg-surface-hover border border-border-subtle text-[10px] font-medium text-text-secondary hover:text-text-primary"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Collection Summary KPI Metrics */}
            {collectionReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="col-span-2 bg-surface-card border border-border-subtle rounded-2xl p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-text-secondary font-bold uppercase">Total Collections</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 font-bold">
                        {collectionReport.transaction_count} receipts
                      </span>
                    </div>
                    <p className="text-2xl font-extrabold font-mono text-brand-600 dark:text-brand-400 mt-2">
                      {formatPaise(collectionReport.total_collected_paise)}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border-subtle text-[10px] font-mono text-text-muted">
                      <span>Allocated: {formatPaise(collectionReport.total_allocated_paise)}</span>
                      <span>On-Account: {formatPaise(collectionReport.total_unallocated_paise)}</span>
                    </div>
                  </div>

                  {Object.entries(collectionReport.by_method).map(([method, data]) => {
                    const methodLabels: Record<string, string> = {
                      cash: 'Cash',
                      upi: 'UPI',
                      card: 'Card',
                      bank_transfer: 'Bank Transfer',
                      cheque: 'Cheque',
                      advance_adjustment: 'Advance Adj.',
                    };

                    return (
                      <div key={method} className="bg-surface-card border border-border-subtle rounded-2xl p-3.5 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-text-secondary font-bold uppercase">{methodLabels[method] || method}</span>
                            <span className="text-[9px] font-mono text-text-muted">{data.count}x</span>
                          </div>
                          <p className="text-sm font-mono font-extrabold text-text-primary mt-2">
                            {formatPaise(data.total_paise)}
                          </p>
                        </div>
                        <div className="w-full bg-surface-panel rounded-full h-1.5 overflow-hidden mt-3">
                          <div
                            className="h-full bg-brand-500 rounded-full"
                            style={{
                              width: `${collectionReport.total_collected_paise > 0 ? (data.total_paise / collectionReport.total_collected_paise) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Collection Receipts Log Table */}
                <div className="bg-surface-card border border-border-subtle rounded-2xl overflow-hidden shadow-sm">
                  <div className="px-5 py-3.5 border-b border-border-subtle flex items-center justify-between bg-surface-panel">
                    <h3 className="font-extrabold text-text-primary text-xs flex items-center gap-2">
                      <Layers size={14} className="text-brand-500" />
                      <span>Payment Collections Log & Bill Allocations</span>
                    </h3>
                    <span className="text-[11px] font-mono text-text-secondary">
                      Showing {collectionReport.payments.length} receipts
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-border-subtle bg-surface-panel text-text-secondary text-[10px] font-bold">
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Receipt #</th>
                          <th className="px-4 py-3">Customer</th>
                          <th className="px-3 py-3">Method</th>
                          <th className="px-4 py-3">Reference / Cheque</th>
                          <th className="px-4 py-3">Collected By</th>
                          <th className="px-4 py-3">Invoice(s) Allocated Against</th>
                          <th className="px-4 py-3 text-right">Amount Collected</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {collectionReport.payments.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="text-center py-12 text-text-secondary">
                              <BarChart3 size={32} className="mx-auto mb-2 opacity-30" />
                              <p className="font-semibold">No payment collections found matching the selected criteria.</p>
                            </td>
                          </tr>
                        ) : (
                          collectionReport.payments.map((p) => (
                            <tr key={p.id} className="hover:bg-surface-hover transition-colors">
                              <td className="px-4 py-3 font-mono text-text-primary whitespace-nowrap">
                                {formatDate(p.payment_date)}
                              </td>

                              <td className="px-4 py-3 font-mono font-bold text-text-secondary">
                                #{p.id}
                              </td>

                              <td className="px-4 py-3">
                                <div className="font-bold text-text-primary">{p.customer_name}</div>
                                <div className="text-[10px] text-text-secondary font-mono">{p.customer_code}</div>
                              </td>

                              <td className="px-3 py-3">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300 border border-brand-300 dark:border-brand-500/30">
                                  {p.method.replace('_', ' ')}
                                </span>
                              </td>

                              <td className="px-4 py-3 font-mono text-text-secondary text-[11px]">
                                {p.reference_number || p.cheque_number ? (
                                  <div>
                                    <span className="font-medium text-text-primary">{p.reference_number || `Chq: ${p.cheque_number}`}</span>
                                    {p.bank_name && <span className="block text-[10px] text-text-muted">{p.bank_name}</span>}
                                  </div>
                                ) : (
                                  '—'
                                )}
                              </td>

                              <td className="px-4 py-3 text-text-secondary font-medium">
                                {p.received_by_display}
                              </td>

                              {/* Invoices Allocated Against */}
                              <td className="px-4 py-3">
                                {p.allocations && p.allocations.length > 0 ? (
                                  <div className="space-y-1">
                                    {p.allocations.map((a, idx) => (
                                      <div key={idx} className="flex items-center gap-1.5 text-[11px] font-mono">
                                        <span className="font-bold text-text-primary">{a.invoice_number}:</span>
                                        <span className="text-brand-600 dark:text-brand-400">{formatPaise(a.allocated_paise)}</span>
                                      </div>
                                    ))}
                                    {p.unallocated_paise > 0 && (
                                      <div className="text-[10px] font-mono text-amber-700 dark:text-amber-400 font-bold">
                                        + On-Account Advance: {formatPaise(p.unallocated_paise)}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-[10px] font-bold font-mono">
                                    On-Account Deposit ({formatPaise(p.amount_paise)})
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-3 text-right font-mono font-extrabold text-sm text-brand-600 dark:text-brand-400">
                                {formatPaise(p.amount_paise)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>

                      {collectionReport.payments.length > 0 && (
                        <tfoot>
                          <tr className="bg-surface-panel border-t-2 border-border-subtle font-extrabold text-text-primary">
                            <td colSpan={7} className="px-4 py-3.5 uppercase tracking-wider text-xs">
                              TOTAL COLLECTIONS FOR PERIOD
                            </td>
                            <td className="px-4 py-3.5 text-right font-mono text-base text-brand-600 dark:text-brand-400">
                              {formatPaise(collectionReport.total_collected_paise)}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Collect Payment / Advance Adjustment Modal */}
      {collectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-surface-card border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border-subtle bg-surface-panel flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet size={18} className="text-emerald-500" />
                <h3 className="text-sm font-black text-text-primary">Collect Customer Payment</h3>
              </div>
              <button
                type="button"
                onClick={() => setCollectModalOpen(false)}
                className="p-1 rounded-lg hover:bg-surface-hover text-text-secondary"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-text-primary mb-1">Select Customer *</label>
                <CustomerSearch
                  value={collectCust}
                  onChange={(c) => {
                    setCollectCust(c);
                    if (c && c.outstanding_balance_paise > 0) {
                      setCollectAmountRupees(String(roundMoney(paiseToRupees(c.outstanding_balance_paise))));
                    }
                  }}
                  showBalance={true}
                />
              </div>

              {collectCust && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-surface-panel border border-border-subtle text-xs">
                  <div>
                    <span className="text-[10px] text-text-muted uppercase font-bold block">Outstanding Due</span>
                    <span className="font-mono font-extrabold text-red-500 text-sm">
                      ₹{formatMoney(paiseToRupees(collectCust.outstanding_balance_paise || 0))}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-text-muted uppercase font-bold block">Advance Available</span>
                    <span className="font-mono font-extrabold text-emerald-500 text-sm">
                      ₹{formatMoney(paiseToRupees(collectCust.advance_balance_paise || 0))}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-text-primary">Amount (₹) *</label>
                  {collectCust && collectCust.outstanding_balance_paise > 0 && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCollectAmountRupees(String(roundMoney(paiseToRupees(collectCust.outstanding_balance_paise))))}
                        className="px-2 py-0.5 rounded bg-brand-500/15 text-brand-500 font-bold text-[10px]"
                      >
                        Full Due
                      </button>
                      <button
                        type="button"
                        onClick={() => setCollectAmountRupees(String(roundMoney(paiseToRupees(collectCust.outstanding_balance_paise) / 2)))}
                        className="px-2 py-0.5 rounded bg-surface-panel border border-border-subtle text-text-secondary font-bold text-[10px]"
                      >
                        50%
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={collectAmountRupees}
                  onChange={(e) => setCollectAmountRupees(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3.5 py-2.5 text-base font-mono font-bold text-text-primary focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-text-primary mb-1.5">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cash', label: 'Cash' },
                    { id: 'upi', label: 'UPI' },
                    { id: 'bank_transfer', label: 'Bank' },
                    { id: 'card', label: 'Card' },
                    { id: 'cheque', label: 'Cheque' },
                    ...(collectCust && (collectCust.advance_balance_paise || 0) > 0
                      ? [{ id: 'advance_adjustment', label: 'Adjust Advance' }]
                      : []),
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setCollectMethod(m.id as any)}
                      className={`py-2 px-2.5 rounded-xl font-bold text-xs border transition-all ${
                        collectMethod === m.id
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-surface-panel text-text-secondary border-border-subtle hover:text-text-primary'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {collectMethod !== 'cash' && collectMethod !== 'advance_adjustment' && (
                <div>
                  <label className="block text-[11px] font-bold text-text-primary mb-1">Reference / UTR / Cheque #</label>
                  <input
                    type="text"
                    value={collectRef}
                    onChange={(e) => setCollectRef(e.target.value)}
                    placeholder="Optional reference number"
                    className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-brand-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-text-primary mb-1">Notes</label>
                <input
                  type="text"
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                  placeholder="Optional remark"
                  className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCollectModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-surface-panel border border-border-subtle text-text-secondary font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!collectCust || isCollecting || !(parseFloat(collectAmountRupees || '0') > 0)}
                  onClick={handleConfirmCollectPayment}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs disabled:opacity-40 flex items-center gap-1.5 shadow-sm"
                >
                  <Check size={14} />
                  <span>{isCollecting ? 'Recording...' : 'Confirm Payment'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
