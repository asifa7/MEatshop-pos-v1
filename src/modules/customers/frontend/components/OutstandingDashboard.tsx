import React, { useState, useMemo } from 'react';
import {
  TrendingDown, TrendingUp, Users, AlertCircle, ArrowRight,
  Wallet, CheckCircle2, IndianRupee, MessageSquare, X, RefreshCw
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useARReports } from '../hooks/useCustomerLedger';
import { useCustomers, useRecordWhatsAppAttempt } from '../hooks/useCustomers';
import { useRecordCustomerPayment, useCreateReminder } from '../hooks/useCustomerCredit';
import { formatPaise } from '../types/customer.types';
import { formatMoney, roundMoney, rupeesToPaise, paiseToRupees } from '../../../../core/shared/math';

interface OutstandingDashboardProps {
  onSelectCustomer?: (customerId: number) => void;
}

export default function OutstandingDashboard({ onSelectCustomer }: OutstandingDashboardProps) {
  const qc = useQueryClient();
  const { useOutstandingReport, useTopDebtors, useOverdueReport, useAdvanceReport, useCollectionReport } = useARReports();
  const { data: allCustomers } = useCustomers(true);
  const recordPaymentMutation = useRecordCustomerPayment();
  const createReminderMutation = useCreateReminder();
  const recordWhatsAppMutation = useRecordWhatsAppAttempt();

  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = `${today.slice(0, 7)}-01`;

  const { data: outstanding } = useOutstandingReport();
  const { data: topDebtors } = useTopDebtors(20);
  const { data: overdue } = useOverdueReport();
  const { data: advances } = useAdvanceReport();
  const { data: collectionToday } = useCollectionReport(today, today);
  const { data: collectionMonth } = useCollectionReport(firstOfMonth, today);

  const [tab, setTab] = useState<'outstanding' | 'overdue' | 'advance'>('outstanding');

  // Collect Payment Modal State
  const [collectTarget, setCollectTarget] = useState<any | null>(null);
  const [payAmountRupees, setPayAmountRupees] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'cash' | 'upi' | 'card' | 'bank_transfer' | 'cheque' | 'advance_adjustment'>('cash');
  const [payRef, setPayRef] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Merge backend report rows with any customer from useCustomers who has outstanding_balance_paise > 0
  // so no Udhaar/credit customer is ever omitted.
  const rows: any[] = useMemo(() => {
    const base: any[] = Array.isArray(outstanding) ? [...outstanding] : [];
    const seen = new Set(base.map((r) => r.id));
    for (const c of allCustomers ?? []) {
      if ((c.outstanding_balance_paise || 0) > 0 && !seen.has(c.id)) {
        base.push(c);
        seen.add(c.id);
      }
    }
    return base.sort((a, b) => (b.outstanding_balance_paise || 0) - (a.outstanding_balance_paise || 0));
  }, [outstanding, allCustomers]);

  const topRows: any[] = useMemo(() => {
    const base: any[] = Array.isArray(topDebtors) && topDebtors.length > 0 ? [...topDebtors] : [...rows];
    const seen = new Set(base.map((r) => r.id));
    for (const r of rows) {
      if (!seen.has(r.id)) {
        base.push(r);
        seen.add(r.id);
      }
    }
    return base.sort((a, b) => (b.outstanding_balance_paise || 0) - (a.outstanding_balance_paise || 0)).slice(0, 12);
  }, [topDebtors, rows]);

  const overdueRows: any[] = (overdue as any) ?? [];

  const advanceRows: any[] = useMemo(() => {
    const base: any[] = Array.isArray(advances) ? [...advances] : [];
    const seen = new Set(base.map((r) => r.id));
    for (const c of allCustomers ?? []) {
      if ((c.advance_balance_paise || 0) > 0 && !seen.has(c.id)) {
        base.push(c);
        seen.add(c.id);
      }
    }
    return base.sort((a, b) => (b.advance_balance_paise || 0) - (a.advance_balance_paise || 0));
  }, [advances, allCustomers]);

  const totalOutstanding = rows.reduce((s: number, r: any) => s + (r.outstanding_balance_paise || 0), 0);
  const totalAdvance = advanceRows.reduce((s: number, r: any) => s + (r.advance_balance_paise || 0), 0);
  const overdueCount = overdueRows.length;
  const todayCollected = (collectionToday as any)?.total_collected_paise ?? 0;
  const monthCollected = (collectionMonth as any)?.total_collected_paise ?? 0;

  const openCollectModal = (e: React.MouseEvent, debtor: any) => {
    e.stopPropagation();
    const fullCust = (allCustomers ?? []).find((c) => c.id === (debtor.id || debtor.customer_id)) || debtor;
    const duePaise = debtor.outstanding_balance_paise ?? debtor.outstanding_paise ?? fullCust.outstanding_balance_paise ?? 0;
    const advPaise = debtor.advance_balance_paise ?? fullCust.advance_balance_paise ?? 0;
    setCollectTarget({
      ...fullCust,
      ...debtor,
      id: debtor.id || debtor.customer_id,
      outstanding_balance_paise: duePaise,
      advance_balance_paise: advPaise,
    });
    setPayAmountRupees(String(roundMoney(paiseToRupees(duePaise))));
    setPayMethod(advPaise > 0 ? 'advance_adjustment' : 'cash');
    setPayRef('');
    setPayNotes('');
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectTarget) return;
    const amountPaise = rupeesToPaise(Number(payAmountRupees) || 0);
    if (amountPaise <= 0) {
      alert('Please enter a valid payment amount greater than ₹0.');
      return;
    }

    setIsSubmittingPay(true);
    try {
      const custId = Number(collectTarget.id || collectTarget.customer_id);
      if (payMethod === 'advance_adjustment') {
        const maxAdjust = Math.min(
          amountPaise,
          collectTarget.advance_balance_paise || amountPaise,
          collectTarget.outstanding_balance_paise || amountPaise
        );
        // Fetch unpaid invoices to allocate advance cleanly if available
        const unpaidRes = await window.api.invoke('customers:get-unpaid-invoices', { customer_id: custId });
        const unpaidList = unpaidRes?.success && Array.isArray(unpaidRes.data) ? unpaidRes.data : [];
        if (unpaidList.length > 0) {
          let rem = maxAdjust;
          for (const inv of unpaidList) {
            if (rem <= 0) break;
            const alloc = Math.min(rem, inv.remaining_paise || rem);
            if (alloc > 0) {
              await window.api.invoke('customers:apply-advance', {
                customer_id: custId,
                invoice_id: inv.id,
                amount_paise: alloc,
              });
              rem -= alloc;
            }
          }
          if (rem > 0) {
            await recordPaymentMutation.mutateAsync({
              customer_id: custId,
              amount_paise: rem,
              method: 'advance_adjustment',
              notes: payNotes || 'Advance balance adjusted against outstanding Udhaar',
            });
          }
        } else {
          await recordPaymentMutation.mutateAsync({
            customer_id: custId,
            amount_paise: maxAdjust,
            method: 'advance_adjustment',
            notes: payNotes || 'Advance balance adjusted against outstanding Udhaar',
          });
        }
      } else {
        await recordPaymentMutation.mutateAsync({
          customer_id: custId,
          amount_paise: amountPaise,
          method: payMethod,
          reference_number: payRef.trim() || null,
          notes: payNotes.trim() || `Udhaar collection (${payMethod.toUpperCase()})`,
        });
      }

      // Refresh all A/R queries
      qc.invalidateQueries({ queryKey: ['ar-outstanding'] });
      qc.invalidateQueries({ queryKey: ['ar-top-debtors'] });
      qc.invalidateQueries({ queryKey: ['ar-overdue'] });
      qc.invalidateQueries({ queryKey: ['ar-advance'] });
      qc.invalidateQueries({ queryKey: ['ar-collection'] });
      qc.invalidateQueries({ queryKey: ['ar-aging'] });
      qc.invalidateQueries({ queryKey: ['customers'] });

      setFeedbackBanner(`Collected ₹${formatMoney(paiseToRupees(amountPaise))} from ${collectTarget.name}!`);
      setTimeout(() => setFeedbackBanner(null), 4000);
      setCollectTarget(null);
    } catch (err: any) {
      alert(`Failed to record payment: ${err?.message || err}`);
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const handleSendWhatsAppReminder = async (e: React.MouseEvent, debtor: any) => {
    e.stopPropagation();
    const custId = Number(debtor.id || debtor.customer_id);
    const fullCust = (allCustomers ?? []).find((c) => c.id === custId) || debtor;
    const rawPhone = debtor.whatsapp || debtor.phone || fullCust?.whatsapp || fullCust?.phone || '';
    const cleanPhone = String(rawPhone).replace(/\D/g, '').slice(-10);
    if (!cleanPhone || cleanPhone.length < 10) {
      alert(`No valid 10-digit mobile/WhatsApp number saved for ${debtor.name}.`);
      return;
    }
    const duePaise = debtor.outstanding_balance_paise ?? debtor.outstanding_paise ?? 0;
    const formattedDue = formatMoney(paiseToRupees(duePaise));
    const message = `Namaste ${debtor.name},\nThis is a gentle reminder from our shop regarding your current pending account (Udhaar) balance of ₹${formattedDue}.\nKindly arrange payment via Cash or UPI at your convenience. Thank you for your business!`;
    const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');

    try {
      await createReminderMutation.mutateAsync({
        customer_id: custId,
        channel: 'whatsapp',
        template_type: 'payment_due',
        message,
      });
    } catch (_) {}

    try {
      recordWhatsAppMutation.mutate({
        invoice_id: 0,
        customer_id: custId,
        phone: cleanPhone,
      });
    } catch (_) {}
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary">Accounts Receivable Dashboard</h2>
          <p className="text-xs text-text-secondary mt-0.5">Live Udhaar outstanding, 1-click payment collection, advance adjustments &amp; WhatsApp reminders</p>
        </div>
        {feedbackBanner && (
          <div className="px-4 py-2 bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-extrabold flex items-center gap-2">
            <CheckCircle2 size={15} />
            <span>{feedbackBanner}</span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        {[
          {
            label: 'Total Outstanding', value: formatPaise(totalOutstanding),
            icon: <TrendingDown size={18} />, color: 'text-red-700 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-500/10', border: 'border-red-300 dark:border-red-500/20'
          },
          {
            label: 'Overdue Customers', value: String(overdueCount),
            icon: <AlertCircle size={18} />, color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-500/10', border: 'border-orange-300 dark:border-orange-500/20'
          },
          {
            label: 'Advance Balances', value: formatPaise(totalAdvance),
            icon: <Wallet size={18} />, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-100 dark:bg-brand-500/10', border: 'border-brand-300 dark:border-brand-500/20'
          },
          {
            label: 'Collected Today', value: formatPaise(todayCollected),
            icon: <TrendingUp size={18} />, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-100 dark:bg-brand-500/10', border: 'border-brand-300 dark:border-brand-500/50'
          },
          {
            label: 'This Month', value: formatPaise(monthCollected),
            icon: <CheckCircle2 size={18} />, color: 'text-brand-600 dark:text-brand-400', bg: 'bg-brand-100 dark:bg-brand-500/10', border: 'border-brand-300 dark:border-brand-500/50'
          },
        ].map((card, i) => (
          <div key={i} className={`bg-surface-card border ${card.border} rounded-xl p-4 shadow-sm`}>
            <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center ${card.color} mb-3`}>
              {card.icon}
            </div>
            <p className="text-[11px] text-text-secondary font-medium">{card.label}</p>
            <p className={`text-base font-bold mt-1 ${card.color} font-mono`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Top Debtors with Direct Collect Payment & WhatsApp Reminder Actions */}
        <div className="col-span-2 bg-surface-card border border-border-subtle rounded-xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-panel">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Top Debtors (Udhaar Accounts)</h3>
              <p className="text-[10px] text-text-secondary mt-0.5">Collect full/partial payments or send WhatsApp balance reminders directly</p>
            </div>
            <Users size={14} className="text-text-secondary" />
          </div>
          <div className="divide-y divide-border-subtle">
            {topRows.length === 0 ? (
              <div className="py-10 text-center text-text-secondary text-xs">No outstanding balances</div>
            ) : (
              topRows.map((r: any, i: number) => {
                const util = r.credit_limit_paise > 0 ? Math.round((r.outstanding_balance_paise / r.credit_limit_paise) * 100) : 0;
                const advPaise = r.advance_balance_paise || 0;
                return (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3.5 hover:bg-surface-hover cursor-pointer transition-colors group"
                    onClick={() => onSelectCustomer?.(r.id)}
                  >
                    <div className="w-6 text-center text-[10px] font-bold text-text-secondary">#{i + 1}</div>
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-extrabold text-text-primary truncate">{r.name}</span>
                        {advPaise > 0 && (
                          <span className="px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 rounded text-[9px] font-bold font-mono">
                            Adv: {formatPaise(advPaise)}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-text-secondary font-mono">
                        {r.customer_code} · {r.category} {r.phone ? `· ${r.phone}` : ''}
                      </div>
                      {r.credit_limit_paise > 0 && (
                        <div className="mt-1 flex items-center gap-2 max-w-xs">
                          <div className="flex-1 bg-surface-panel rounded-full h-1">
                            <div
                              className={`h-full rounded-full ${util > 90 ? 'bg-red-500' : util > 70 ? 'bg-orange-500' : 'bg-brand-500'}`}
                              style={{ width: `${Math.min(100, util)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-text-secondary font-mono">{util}% used</span>
                        </div>
                      )}
                    </div>

                    <div className="text-right mr-2">
                      <div className="text-sm font-black font-mono text-red-600 dark:text-red-400">{formatPaise(r.outstanding_balance_paise)}</div>
                      <div className="text-[9px] text-text-muted uppercase font-bold">Due Balance</div>
                    </div>

                    {/* Direct Cashier Actions */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => openCollectModal(e, r)}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-extrabold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        title="Collect full/partial payment or adjust from advance"
                      >
                        <IndianRupee size={13} />
                        <span>Collect Payment</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleSendWhatsAppReminder(e, r)}
                        className="px-2.5 py-2 bg-green-600/15 hover:bg-green-600 hover:text-white border border-green-600/35 text-green-700 dark:text-green-400 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                        title="Send WhatsApp payment reminder"
                      >
                        <MessageSquare size={13} />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Tabs Panel */}
        <div className="bg-surface-card border border-border-subtle rounded-xl overflow-hidden flex flex-col shadow-sm">
          <div className="flex border-b border-border-subtle bg-surface-panel">
            {(['outstanding', 'overdue', 'advance'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-[10px] font-bold transition-colors cursor-pointer ${
                  tab === t ? 'text-brand-600 dark:text-brand-400 border-b-2 border-brand-500 bg-brand-500/10' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t === 'outstanding' ? `All (${rows.length})` : t === 'overdue' ? `Overdue (${overdueRows.length})` : `Advance (${advanceRows.length})`}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto divide-y divide-border-subtle">
            {tab === 'outstanding' && rows.slice(0, 25).map((r: any) => (
              <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface-hover cursor-pointer" onClick={() => onSelectCustomer?.(r.id)}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-text-primary truncate">{r.name}</div>
                  <div className="text-[10px] text-text-secondary font-mono">{r.phone ?? r.customer_code}</div>
                </div>
                <div className="text-xs font-mono font-bold text-red-600 dark:text-red-400 mr-1">{formatPaise(r.outstanding_balance_paise)}</div>
                <button
                  type="button"
                  onClick={(e) => openCollectModal(e, r)}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-extrabold cursor-pointer"
                  title="Collect Payment"
                >
                  Collect
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSendWhatsAppReminder(e, r)}
                  className="p-1.5 bg-green-600/15 hover:bg-green-600 hover:text-white text-green-700 dark:text-green-400 rounded-lg cursor-pointer"
                  title="WhatsApp Reminder"
                >
                  <MessageSquare size={12} />
                </button>
              </div>
            ))}
            {tab === 'overdue' && overdueRows.slice(0, 25).map((r: any) => (
              <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface-hover cursor-pointer" onClick={() => onSelectCustomer?.(r.id)}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-text-primary truncate">{r.name}</div>
                  <div className="text-[10px] text-orange-700 dark:text-orange-400 font-medium">{r.days_overdue ?? 0}d overdue</div>
                </div>
                <div className="text-xs font-mono font-bold text-orange-700 dark:text-orange-400 mr-1">{formatPaise(r.outstanding_balance_paise)}</div>
                <button
                  type="button"
                  onClick={(e) => openCollectModal(e, r)}
                  className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-extrabold cursor-pointer"
                >
                  Collect
                </button>
                <button
                  type="button"
                  onClick={(e) => handleSendWhatsAppReminder(e, r)}
                  className="p-1.5 bg-green-600/15 hover:bg-green-600 hover:text-white text-green-700 dark:text-green-400 rounded-lg cursor-pointer"
                  title="WhatsApp Reminder"
                >
                  <MessageSquare size={12} />
                </button>
              </div>
            ))}
            {tab === 'advance' && advanceRows.slice(0, 25).map((r: any) => (
              <div key={r.id} className="flex items-center gap-2 px-4 py-2.5 hover:bg-surface-hover cursor-pointer" onClick={() => onSelectCustomer?.(r.id)}>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-text-primary truncate">{r.name}</div>
                  <div className="text-[10px] text-text-secondary font-mono">{r.phone ?? r.customer_code}</div>
                </div>
                <div className="text-xs font-mono font-bold text-brand-600 dark:text-brand-500">{formatPaise(r.advance_balance_paise)}</div>
              </div>
            ))}
            {((tab === 'outstanding' && rows.length === 0) ||
              (tab === 'overdue' && overdueRows.length === 0) ||
              (tab === 'advance' && advanceRows.length === 0)) && (
              <div className="py-10 text-center text-text-secondary text-xs">
                {tab === 'advance' ? 'No advance balances' : 'Nothing to show'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Collect Payment / Adjust Advance Modal */}
      {collectTarget && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-card/60">
              <div>
                <h3 className="text-sm font-extrabold text-text-primary">Collect Payment — {collectTarget.name}</h3>
                <p className="text-[11px] text-text-muted font-mono">
                  {collectTarget.customer_code || `#${collectTarget.id}`} · Outstanding: <span className="text-red-500 font-bold">{formatPaise(collectTarget.outstanding_balance_paise || 0)}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCollectTarget(null)}
                className="p-1.5 rounded-lg hover:bg-surface-app text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleConfirmPayment} className="p-6 space-y-4">
              {(collectTarget.advance_balance_paise || 0) > 0 && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                  <div className="text-xs">
                    <div className="font-extrabold text-emerald-700 dark:text-emerald-300">Advance Available: {formatPaise(collectTarget.advance_balance_paise)}</div>
                    <div className="text-[10px] text-text-secondary">You can adjust due balance directly from customer advance.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPayMethod('advance_adjustment');
                      const maxAdj = Math.min(collectTarget.advance_balance_paise || 0, collectTarget.outstanding_balance_paise || 0);
                      setPayAmountRupees(String(roundMoney(paiseToRupees(maxAdj))));
                    }}
                    className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-extrabold cursor-pointer"
                  >
                    Adjust Advance
                  </button>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-text-secondary">Amount Received (₹)</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPayAmountRupees(String(roundMoney(paiseToRupees(collectTarget.outstanding_balance_paise || 0))))}
                      className="px-2 py-0.5 bg-surface-card border border-border-subtle rounded text-[10px] font-bold text-brand-500 cursor-pointer"
                    >
                      Full Due (₹{formatMoney(paiseToRupees(collectTarget.outstanding_balance_paise || 0))})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayAmountRupees(String(roundMoney(paiseToRupees(Math.round((collectTarget.outstanding_balance_paise || 0) / 2)))))}
                      className="px-2 py-0.5 bg-surface-card border border-border-subtle rounded text-[10px] font-bold text-text-secondary cursor-pointer"
                    >
                      50%
                    </button>
                  </div>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  value={payAmountRupees}
                  onChange={(e) => setPayAmountRupees(e.target.value)}
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-4 py-3 text-lg font-mono font-black text-text-primary focus:border-emerald-500 focus:outline-none"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-text-secondary mb-1.5">Payment Method</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'cash', label: '💵 Cash' },
                    { id: 'upi', label: '📱 UPI' },
                    { id: 'bank_transfer', label: '🏦 Bank' },
                    { id: 'card', label: '💳 Card' },
                    { id: 'cheque', label: '🧾 Cheque' },
                    ...((collectTarget.advance_balance_paise || 0) > 0
                      ? [{ id: 'advance_adjustment', label: '🔄 Advance' }]
                      : []),
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPayMethod(m.id as any)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-extrabold transition-all cursor-pointer ${
                        payMethod === m.id
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-surface-card border-border-subtle text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {payMethod !== 'cash' && payMethod !== 'advance_adjustment' && (
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Reference / UTR / Cheque No. (Optional)</label>
                  <input
                    type="text"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="e.g. UTR or transaction ref"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2 text-xs font-mono text-text-primary"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-text-secondary mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Optional payment note"
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2 text-xs text-text-primary"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCollectTarget(null)}
                  className="px-4 py-2.5 bg-surface-card border border-border-subtle rounded-xl text-xs font-bold text-text-secondary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPay}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingPay
                    ? 'Recording...'
                    : payMethod === 'advance_adjustment'
                    ? 'Confirm Advance Adjustment'
                    : `Collect ₹${formatMoney(Number(payAmountRupees) || 0)}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
