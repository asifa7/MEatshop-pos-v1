import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Receipt,
  Plus,
  Zap,
  Home,
  Users,
  Fuel,
  Package,
  Truck,
  Wrench,
  Coffee,
  HelpCircle,
  Delete,
  Camera,
  CheckCircle2,
  Calendar,
  IndianRupee,
  AlertCircle,
  ArrowRight,
  TrendingDown,
  Clock,
} from 'lucide-react';
import type { Expense, Employee } from '../../../../core/types/enterprise_types';
import { formatMoney, paiseToRupees, rupeesToPaise } from '../../../../core/shared/math';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';

const CATEGORY_ICONS: Record<string, any> = {
  electricity: Zap,
  rent: Home,
  salary: Users,
  fuel: Fuel,
  packaging: Package,
  transport: Truck,
  maintenance: Wrench,
  repairs: Wrench,
  'tea/misc': Coffee,
  miscellaneous: HelpCircle,
  other: Receipt,
};

export default function ExpenseManagementView() {
  const queryClient = useQueryClient();

  // Selected Quick Tile State
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
  const [amountStr, setAmountStr] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'UPI'>('Cash');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [vendorName, setVendorName] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [photoUrl, setPhotoUrl] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Queries
  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ['expenses', 'categories'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.EXPENSES.GET_CATEGORIES);
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['hr', 'employees'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.HR.GET_EMPLOYEES);
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  const { data: todayExpenses = [], refetch: refetchToday } = useQuery<Expense[]>({
    queryKey: ['expenses', 'today'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.EXPENSES.GET_TODAY);
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  const { data: monthlyTotals = [], refetch: refetchMonthly } = useQuery<any[]>({
    queryKey: ['expenses', 'monthly-totals'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.EXPENSES.GET_MONTHLY_TOTALS);
      return res?.success && Array.isArray(res.data) ? res.data : [];
    },
  });

  // Default to first category if none selected
  React.useEffect(() => {
    if (!selectedCategoryId && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
      setSelectedCategoryName(categories[0].name);
    }
  }, [categories, selectedCategoryId]);

  const isSalary = selectedCategoryName.toLowerCase() === 'salary' || selectedCategoryId === 3;

  // Keypad Handlers
  const handleNumClick = (val: string) => {
    if (val === '.' && amountStr.includes('.')) return;
    if (amountStr === '' && val === '.') {
      setAmountStr('0.');
      return;
    }
    setAmountStr((prev) => prev + val);
  };

  const handleBackspace = () => {
    setAmountStr((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setAmountStr('');
  };

  // Record Expense Mutation
  const recordMutation = useMutation({
    mutationFn: async () => {
      const amountPaise = rupeesToPaise(parseFloat(amountStr) || 0);
      if (amountPaise <= 0) {
        throw new Error('Please enter a valid expense amount greater than ₹0.');
      }
      if (isSalary && !selectedEmployeeId) {
        throw new Error('Selecting a staff member is mandatory for Salary expenses.');
      }

      const res = await window.api.invoke(IPC_CHANNELS.EXPENSES.RECORD_EXPENSE, {
        category_id: selectedCategoryId,
        employee_id: isSalary ? selectedEmployeeId : undefined,
        vendor_name: isSalary ? undefined : vendorName.trim() || undefined,
        amount_paise: amountPaise,
        gst_paise: 0,
        payment_method: paymentMethod,
        notes: notes.trim() || undefined,
        photo_url: photoUrl.trim() || undefined,
      });

      if (!res?.success) {
        throw new Error(res?.error?.message || 'Failed to record expense');
      }
      return res.data;
    },
    onSuccess: () => {
      setFeedback({ type: 'success', message: 'Expense recorded & posted to ledger!' });
      setAmountStr('');
      setNotes('');
      setVendorName('');
      setPhotoUrl('');
      setSelectedEmployeeId(null);
      refetchToday();
      refetchMonthly();
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (err: any) => {
      setFeedback({ type: 'error', message: err?.message || 'Failed to save expense.' });
    },
  });

  const totalTodayPaise = useMemo(() => {
    return todayExpenses.reduce((sum, e) => sum + (e.amount_paise || 0), 0);
  }, [todayExpenses]);

  const totalMonthPaise = useMemo(() => {
    return monthlyTotals.reduce((sum, m) => sum + (Number(m.total_paise) || 0), 0);
  }, [monthlyTotals]);

  return (
    <div className="flex flex-col h-full bg-surface-app text-text-primary p-4 sm:p-6 overflow-hidden gap-4">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border-subtle pb-3 gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-black font-outfit text-text-primary flex items-center gap-2">
            <Receipt className="text-emerald-500" size={24} />
            <span>Quick Shop Expenses & Cash Out</span>
          </h2>
          <p className="text-xs text-text-muted mt-0.5">
            Cashier-friendly 1-tap logging. Salary expenses automatically link to staff records & double-entry ledger.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-surface-panel px-3.5 py-1.5 rounded-xl border border-border-subtle flex items-center gap-2">
            <Clock size={16} className="text-emerald-400" />
            <div className="text-left">
              <span className="text-[10px] text-text-muted block leading-none font-bold uppercase">Today Total</span>
              <span className="text-sm font-black font-mono text-emerald-400">
                ₹{formatMoney(paiseToRupees(totalTodayPaise))}
              </span>
            </div>
          </div>

          <div className="bg-surface-panel px-3.5 py-1.5 rounded-xl border border-border-subtle flex items-center gap-2">
            <TrendingDown size={16} className="text-brand-400" />
            <div className="text-left">
              <span className="text-[10px] text-text-muted block leading-none font-bold uppercase">This Month</span>
              <span className="text-sm font-black font-mono text-brand-400">
                ₹{formatMoney(paiseToRupees(totalMonthPaise))}
              </span>
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-xs opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Main Grid: Left = Quick Entry (Tiles + Keypad), Right = Today's List + Monthly Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 overflow-y-auto">
        {/* Left Column (7 cols): Quick Tiles + Numpad */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Quick Category Tiles */}
          <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-sm flex flex-col gap-2">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-text-muted">
              1. Tap Expense Category
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {categories.map((cat: any) => {
                const isSelected = selectedCategoryId === cat.id;
                const key = cat.name.toLowerCase();
                const IconComp = CATEGORY_ICONS[key] || Receipt;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setSelectedCategoryId(cat.id);
                      setSelectedCategoryName(cat.name);
                    }}
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-extrabold shadow-md scale-[1.02]'
                        : 'bg-surface-card hover:bg-surface-hover border-border-subtle text-text-primary font-bold'
                    }`}
                  >
                    <IconComp size={22} className={isSelected ? 'text-emerald-400' : 'text-text-muted'} />
                    <span className="text-xs mt-1.5 leading-tight">{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount Display & Number Pad */}
          <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-extrabold uppercase tracking-wider text-text-muted">
                2. Enter Amount for <span className="text-emerald-400 font-black">{selectedCategoryName}</span>
              </label>

              {/* Cash vs UPI toggle */}
              <div className="inline-flex rounded-xl p-1 bg-surface-card border border-border-subtle">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('Cash')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                    paymentMethod === 'Cash'
                      ? 'bg-emerald-500 text-white shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('UPI')}
                  className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${
                    paymentMethod === 'UPI'
                      ? 'bg-brand-500 text-white shadow-sm'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  UPI / Bank
                </button>
              </div>
            </div>

            {/* Big Amount Box */}
            <div className="relative bg-surface-card border-2 border-emerald-500/40 focus-within:border-emerald-500 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xl font-black text-text-muted">₹</span>
              <input
                type="text"
                readOnly
                placeholder="0"
                value={amountStr}
                className="w-full bg-transparent text-right font-mono text-3xl font-black text-text-primary focus:outline-none"
              />
            </div>

            {/* Number Pad */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '.'].map((key) => {
                const isClear = key === 'C';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (isClear) handleClear();
                      else handleNumClick(key);
                    }}
                    className={`h-12 rounded-xl text-lg font-black font-mono transition-all border ${
                      isClear
                        ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30'
                        : 'bg-surface-card hover:bg-surface-hover text-text-primary border-border-subtle active:scale-95'
                    }`}
                  >
                    {key}
                  </button>
                );
              })}
            </div>

            {/* Additional details for Salary or general vendor */}
            {isSalary ? (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex flex-col gap-1.5">
                <label className="text-[11px] font-black uppercase text-amber-300 flex items-center gap-1.5">
                  <Users size={14} />
                  <span>Pick Staff Member * (Required for Salary)</span>
                </label>
                <select
                  value={selectedEmployeeId || ''}
                  onChange={(e) => setSelectedEmployeeId(Number(e.target.value) || null)}
                  className="w-full bg-surface-card border border-amber-500/40 rounded-lg px-3 py-2 text-xs font-bold text-text-primary focus:outline-none focus:border-amber-400"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees
                    .filter((e) => e.is_active !== 0)
                    .map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.full_name} ({emp.emp_code} - {emp.designation})
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Payee / Vendor name (optional)"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Note / Purpose (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            {/* Big Action Save Button */}
            <button
              type="button"
              disabled={recordMutation.isPending || !amountStr || parseFloat(amountStr) <= 0}
              onClick={() => recordMutation.mutate()}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black rounded-xl flex items-center justify-center gap-2 text-base shadow-lg transition-all active:scale-[0.99]"
            >
              <CheckCircle2 size={20} />
              <span>
                {recordMutation.isPending
                  ? 'Saving...'
                  : `Save ₹${amountStr || '0'} Expense (${paymentMethod})`}
              </span>
            </button>
          </div>
        </div>

        {/* Right Column (5 cols): Today's Expenses + Monthly Totals */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          {/* Today's Expenses List */}
          <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-sm flex flex-col flex-1 min-h-[300px]">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2.5 mb-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-text-primary flex items-center gap-1.5">
                <Calendar size={14} className="text-emerald-400" />
                <span>Today's Logged Expenses ({todayExpenses.length})</span>
              </h3>
              <span className="text-xs font-mono font-black text-emerald-400">
                ₹{formatMoney(paiseToRupees(totalTodayPaise))}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {todayExpenses.length === 0 ? (
                <div className="text-center py-12 text-text-muted text-xs">
                  No expenses logged yet today.
                </div>
              ) : (
                todayExpenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-2.5 bg-surface-card border border-border-subtle/80 rounded-xl flex items-center justify-between gap-3 hover:border-emerald-500/30 transition-all"
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-extrabold text-text-primary truncate">
                          {exp.category_name || 'Expense'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-bold bg-surface-panel border border-border-subtle text-text-muted">
                          {exp.payment_method}
                        </span>
                      </div>
                      <span className="text-[11px] text-text-muted truncate">
                        {exp.employee_name ? `Staff: ${exp.employee_name}` : exp.vendor_name || exp.notes || '-'}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-black text-rose-400">
                        ₹{formatMoney(paiseToRupees(exp.amount_paise))}
                      </span>
                      <span className="text-[10px] text-text-muted block leading-none">
                        {exp.expense_date}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Monthly Category Totals */}
          <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-sm flex flex-col gap-2.5">
            <h3 className="text-xs font-black uppercase tracking-wider text-text-muted flex items-center justify-between">
              <span>This Month Category Breakdown</span>
              <span className="font-mono text-text-primary">
                ₹{formatMoney(paiseToRupees(totalMonthPaise))}
              </span>
            </h3>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {monthlyTotals.map((cat: any) => {
                const total = Number(cat.total_paise) || 0;
                const percent = totalMonthPaise > 0 ? (total / totalMonthPaise) * 100 : 0;
                return (
                  <div key={cat.category_id} className="text-xs flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-text-primary">{cat.category_name}</span>
                      <span className="font-mono font-extrabold text-text-muted">
                        ₹{formatMoney(paiseToRupees(total))} ({percent.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full bg-surface-card h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, percent)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
