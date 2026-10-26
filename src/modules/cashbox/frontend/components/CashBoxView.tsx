import { useState, useEffect } from 'react';
import { 
  Lock, 
  Unlock, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Receipt, 
  AlertTriangle, 
  History, 
  Search, 
  RefreshCw, 
  Plus, 
  Trash2, 
  Edit3, 
  Eye, 
  ShieldCheck, 
  X, 
  DollarSign, 
  CreditCard, 
  Smartphone,
  Settings
} from 'lucide-react';
import { useCashBox, useShiftHistory, useShiftDetails, type ShiftHistoryFilter } from '../hooks/useCashBox';
import type { ShiftCashMovement, ShiftMovementType, ShiftCorrection } from '../../../../core/types/enterprise_types';
import { formatMoney as sharedFormatMoney } from '../../../../core/shared/math';

const DENOMINATIONS = [
  { key: '500-note', value: 500, type: 'Note', label: '₹500 Note' },
  { key: '200-note', value: 200, type: 'Note', label: '₹200 Note' },
  { key: '100-note', value: 100, type: 'Note', label: '₹100 Note' },
  { key: '50-note', value: 50, type: 'Note', label: '₹50 Note' },
  { key: '20-note', value: 20, type: 'Note', label: '₹20 Note' },
  { key: '10-note', value: 10, type: 'Note', label: '₹10 Note' },
  { key: '20-coin', value: 20, type: 'Coin', label: '₹20 Coin' },
  { key: '10-coin', value: 10, type: 'Coin', label: '₹10 Coin' },
  { key: '5-coin', value: 5, type: 'Coin', label: '₹5 Coin' },
  { key: '2-coin', value: 2, type: 'Coin', label: '₹2 Coin' },
  { key: '1-coin', value: 1, type: 'Coin', label: '₹1 Coin' },
] as const;

type Counts = Record<string, number>;
const emptyCounts = (): Counts => ({
  ...Object.fromEntries(DENOMINATIONS.map(d => [d.key, 0])),
  coins: 0,
});
const totalPaise = (counts: Counts) => {
  const denoms = DENOMINATIONS.reduce((sum, d) => sum + d.value * (counts[d.key] || 0) * 100, 0);
  const looseCoinsPaise = Math.round((Number(counts.coins) || 0) * 100);
  return denoms + looseCoinsPaise;
};
const formatMoney = (paise = 0) => sharedFormatMoney(paise);

function parseShiftTimestamp(ts?: string | null): Date | null {
  if (!ts) return null;
  const s = String(ts).trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(s)
    ? s.replace(' ', 'T') + 'Z'
    : s;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function formatShiftDateTime(ts?: string | null): string {
  const d = parseShiftTimestamp(ts);
  if (!d) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function formatShiftTime(ts?: string | null): string {
  const d = parseShiftTimestamp(ts);
  if (!d) return '—';
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function isTimestampFromPreviousDay(ts?: string | null): boolean {
  const d = parseShiftTimestamp(ts);
  if (!d) return false;
  const now = new Date();
  return (
    d.getFullYear() !== now.getFullYear() ||
    d.getMonth() !== now.getMonth() ||
    d.getDate() !== now.getDate()
  );
}

/* ─── Denomination Counter Component ────────────────────────────────────────── */
function DenominationCounter({ 
  counts, 
  setCounts, 
  title = 'Physical Cash Denomination Count' 
}: { 
  counts: Counts; 
  setCounts: (val: Counts) => void; 
  title?: string;
}) {
  const total = totalPaise(counts);
  const [coinsInput, setCoinsInput] = useState<string>(() => (counts.coins ? String(counts.coins) : ''));

  useEffect(() => {
    if ((counts.coins === 0 || counts.coins === undefined) && coinsInput !== '' && coinsInput !== '0') {
      setCoinsInput('');
    } else if (counts.coins && parseFloat(coinsInput || '0') !== counts.coins) {
      setCoinsInput(String(counts.coins));
    }
  }, [counts.coins]);

  const handleCountChange = (key: string, val: string) => {
    const num = Math.max(0, Math.floor(Number(val) || 0));
    setCounts({ ...counts, [key]: num });
  };

  const handleCoinsChange = (val: string) => {
    setCoinsInput(val);
    const num = Math.max(0, parseFloat(val) || 0);
    setCounts({ ...counts, coins: num });
  };

  const handleClear = () => {
    setCoinsInput('');
    setCounts(emptyCounts());
  };

  return (
    <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2">
        <div>
          <span className="text-xs font-black uppercase text-text-muted">{title}</span>
          <div className="text-lg font-black font-mono text-brand-400 mt-0.5">{formatMoney(total)}</div>
        </div>
        <button 
          onClick={handleClear} 
          className="text-[11px] font-bold text-text-muted hover:text-rose-400 transition-colors px-2 py-1 bg-surface-panel rounded-lg border border-border-subtle"
        >
          Reset Count
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Notes Section */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">Currency Notes</span>
          {DENOMINATIONS.filter(d => d.type === 'Note').map(d => (
            <div key={d.key} className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-surface-panel/60 border border-border-subtle/40 text-xs">
              <span className="font-bold font-mono w-16 text-text-primary">₹{d.value}</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text-muted">×</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={counts[d.key] || ''}
                  placeholder="0"
                  onChange={e => handleCountChange(d.key, e.target.value)}
                  className="w-16 text-center bg-surface-card border border-border-subtle rounded-lg py-1 px-1.5 font-mono font-bold text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>
              <span className="font-mono text-right w-20 text-[11px] font-bold text-text-secondary">
                {formatMoney(d.value * (counts[d.key] || 0) * 100)}
              </span>
            </div>
          ))}
        </div>

        {/* Coins Section */}
        <div className="space-y-1.5">
          <span className="text-[10px] font-bold uppercase text-text-muted tracking-wider">Coins</span>
          {DENOMINATIONS.filter(d => d.type === 'Coin').map(d => (
            <div key={d.key} className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-surface-panel/60 border border-border-subtle/40 text-xs">
              <span className="font-bold font-mono w-16 text-text-primary">₹{d.value}</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text-muted">×</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={counts[d.key] || ''}
                  placeholder="0"
                  onChange={e => handleCountChange(d.key, e.target.value)}
                  className="w-16 text-center bg-surface-card border border-border-subtle rounded-lg py-1 px-1.5 font-mono font-bold text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>
              <span className="font-mono text-right w-20 text-[11px] font-bold text-text-secondary">
                {formatMoney(d.value * (counts[d.key] || 0) * 100)}
              </span>
            </div>
          ))}

          {/* Direct Total Coins entry after ₹1 Coin */}
          <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-surface-panel/60 border border-border-subtle/40 text-xs">
            <span className="font-bold font-mono w-16 text-text-primary" title="Total Coins Amount">Coins</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-muted font-bold font-mono">₹</span>
              <input
                type="number"
                min="0"
                step="any"
                value={coinsInput}
                placeholder="0"
                onChange={e => handleCoinsChange(e.target.value)}
                className="w-16 text-center bg-surface-card border border-border-subtle rounded-lg py-1 px-1.5 font-mono font-bold text-xs focus:border-brand-500 focus:outline-none"
                title="Enter total amount of coins"
              />
            </div>
            <span className="font-mono text-right w-20 text-[11px] font-bold text-text-secondary">
              {formatMoney(Math.round((Number(counts.coins) || 0) * 100))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CashBoxView() {
  const [activeTab, setActiveTab] = useState<'active' | 'closing' | 'history'>('active');
  const [selectedShiftId, setSelectedShiftId] = useState<number | null>(null);
  const [showMethodsManager, setShowMethodsManager] = useState(false);
  const [newMethodName, setNewMethodName] = useState('');
  const [newMethodType, setNewMethodType] = useState<'UPI' | 'CARD' | 'OTHER'>('UPI');

  const {
    currentSession,
    isLoadingSession,
    dashboard,
    lastClosedSummary,
    paymentMethods,
    savePaymentMethod,
    transactions,
    expenseCategories,
    openSession,
    isOpeningSession,
    recordMovement,
    isRecordingMovement,
    updateOpenMovement,
    deleteOpenMovement,
    closeSession,
    isClosingSession,
    applyCorrection,
    isApplyingCorrection,
    refresh,
  } = useCashBox();

  // Opening Float Count state
  const [openingCounts, setOpeningCounts] = useState<Counts>(emptyCounts());
  const [openingVarianceReason, setOpeningVarianceReason] = useState('');
  const [openingError, setOpeningError] = useState<string | null>(null);

  // Cash Movement Form state
  const [movementType, setMovementType] = useState<ShiftMovementType>('cash_in');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementCategory, setMovementCategory] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [movementPerson, setMovementPerson] = useState('');
  const [selectedExpenseCatId, setSelectedExpenseCatId] = useState<number>(1);
  const [movementError, setMovementError] = useState<string | null>(null);

  // Editing open movement state
  const [editingMovement, setEditingMovement] = useState<ShiftCashMovement | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editReason, setEditReason] = useState('');

  // Closing Shift Flow state
  const [closingCounts, setClosingCounts] = useState<Counts>(emptyCounts());
  const [nonCashCountedInputs, setNonCashCountedInputs] = useState<Record<string, string>>({});
  const [declaredDifferenceReason, setDeclaredDifferenceReason] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [showTransactionDrawer, setShowTransactionDrawer] = useState(false);
  const [closingError, setClosingError] = useState<string | null>(null);

  // Shift History Filter state
  const [historyFilter, setHistoryFilter] = useState<ShiftHistoryFilter>({
    status: 'ALL',
    limit: 50,
  });

  const { data: historyData, isLoading: isLoadingHistory } = useShiftHistory(historyFilter);

  // Calculations
  const calc = dashboard?.calculation || {
    openingCashPaise: currentSession?.opening_cash_paise || 0,
    cashSalesPaise: 0,
    cashInPaise: 0,
    cashExpensesPaise: 0,
    cashRefundsPaise: 0,
    cashOutPaise: 0,
    expectedCashPaise: currentSession?.opening_cash_paise || 0,
  };

  const prevSessionId = lastClosedSummary?.previousSessionId ?? currentSession?.previous_session_id ?? null;
  const prevClosingCashPaise = lastClosedSummary?.previousClosingCashPaise ?? currentSession?.previous_closing_cash_paise ?? 0;
  const prevClosedAt = lastClosedSummary?.previousClosedAt ?? currentSession?.previous_closed_at ?? null;

  const countedOpeningPaise = totalPaise(openingCounts);
  const openingDiffFromPrevPaise = prevSessionId !== null ? countedOpeningPaise - prevClosingCashPaise : 0;
  const isOpeningMatchedWithYesterday = prevSessionId === null || openingDiffFromPrevPaise === 0;

  const activeShiftOpeningDiffPaise =
    currentSession && prevSessionId !== null
      ? (currentSession.opening_cash_paise || 0) - prevClosingCashPaise
      : 0;

  const isStaleShift = Boolean(
    currentSession &&
      (currentSession.is_stale_previous_day || dashboard?.isStaleShift || isTimestampFromPreviousDay(currentSession.opened_at))
  );

  const countedPhysicalPaise = totalPaise(closingCounts);
  const differencePaise = countedPhysicalPaise - calc.expectedCashPaise;

  // Build per-method Expected vs Counted rows
  const enabledMethods = (paymentMethods || []).filter((m: any) => m.is_enabled !== 0);
  const expectedByMethodList: Array<{
    methodKey: string;
    displayName: string;
    methodType: string;
    expectedPaise: number;
    txCount: number;
  }> = dashboard?.nonCashSummary?.expectedByMethod || enabledMethods.map((m: any) => ({
    methodKey: m.method_key,
    displayName: m.display_name,
    methodType: m.method_type,
    expectedPaise: m.method_key === 'cash' ? calc.expectedCashPaise : 0,
    txCount: 0,
  }));

  const methodRows = expectedByMethodList.map(m => {
    const isCash = m.methodKey === 'cash';
    const rawStr = nonCashCountedInputs[m.methodKey];
    const countedPaise = isCash
      ? countedPhysicalPaise
      : rawStr !== undefined && rawStr.trim() !== ''
      ? Math.max(0, Math.round((parseFloat(rawStr) || 0) * 100))
      : 0;
    const diff = countedPaise - m.expectedPaise;
    return {
      ...m,
      countedPaise,
      differencePaise: diff,
      isMatched: diff === 0,
    };
  });

  const isAllMethodsMatched = methodRows.every(r => r.isMatched);
  const isClosingMatched = differencePaise === 0 && isAllMethodsMatched;

  // Handle Opening a Shift
  const handleOpenShift = async () => {
    setOpeningError(null);
    const openingPaise = totalPaise(openingCounts);
    if (!isOpeningMatchedWithYesterday && !openingVarianceReason.trim()) {
      setOpeningError(
        `Opening cash (${formatMoney(openingPaise)}) differs from yesterday's closing cash (${formatMoney(prevClosingCashPaise)}). Please enter a reason.`
      );
      return;
    }
    try {
      await openSession({
        openingCashPaise: openingPaise,
        denominations: openingCounts,
        openingVarianceReason: openingVarianceReason.trim() || undefined,
      });
      setOpeningCounts(emptyCounts());
      setOpeningVarianceReason('');
    } catch (err: any) {
      setOpeningError(err?.message || 'Failed to open shift');
    }
  };

  // Handle Recording Categorized Cash Movement
  const handleRecordMovement = async () => {
    setMovementError(null);
    const amountVal = parseFloat(movementAmount);
    if (isNaN(amountVal) || amountVal <= 0) {
      setMovementError('Enter a valid positive cash amount');
      return;
    }
    if (!movementReason.trim()) {
      setMovementError('Reason / description is mandatory');
      return;
    }

    const amountPaise = Math.round(amountVal * 100);
    const catName = movementType === 'expense' 
      ? (expenseCategories.find((c: { id: number; name: string }) => c.id === selectedExpenseCatId)?.name || 'General Expense')
      : movementCategory.trim() || (movementType === 'cash_in' ? 'Float / Top-up' : 'Petty Withdrawal');

    try {
      await recordMovement({
        movement_type: movementType,
        category: catName,
        amount_paise: amountPaise,
        reason: movementReason.trim(),
        added_by: movementType === 'cash_in' ? movementPerson.trim() : undefined,
        taken_by: movementType !== 'cash_in' ? movementPerson.trim() : undefined,
        expense_category_id: movementType === 'expense' ? selectedExpenseCatId : undefined,
      });

      setMovementAmount('');
      setMovementReason('');
      setMovementPerson('');
      setMovementCategory('');
    } catch (err: any) {
      setMovementError(err?.message || 'Failed to record cash movement');
    }
  };

  // Handle Closing the Shift
  const handleCloseShift = async () => {
    if (!currentSession) return;
    setClosingError(null);

    if (!isClosingMatched && !declaredDifferenceReason.trim()) {
      setClosingError('Declared reason is mandatory when counted cash or payment method totals differ from expected');
      return;
    }

    const countedByMethodPayload: Record<string, number> = {};
    for (const r of methodRows) {
      countedByMethodPayload[r.methodKey] = r.countedPaise;
    }

    try {
      await closeSession({
        sessionId: currentSession.id,
        closingCashPaise: countedPhysicalPaise,
        denominations: closingCounts,
        countedByMethod: countedByMethodPayload,
        declaredReason: declaredDifferenceReason.trim() || undefined,
        notes: closingNotes.trim() || undefined,
      });
      setClosingCounts(emptyCounts());
      setNonCashCountedInputs({});
      setDeclaredDifferenceReason('');
      setClosingNotes('');
      setActiveTab('history');
    } catch (err: any) {
      setClosingError(err?.message || 'Failed to close shift');
    }
  };

  return (
    <div className="h-full flex flex-col bg-surface-app text-text-primary overflow-hidden">
      {/* ─── Top Header & Navigation ─────────────────────────────────────────── */}
      <header className="p-4 sm:p-5 bg-surface-panel border-b border-border-subtle flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black font-outfit flex items-center gap-2">
            <Lock className="text-brand-500" size={22} />
            <span>Cash Box & Shift Reconciliation</span>
          </h1>
          <p className="text-xs text-text-muted mt-0.5">
            Strict audit-trail cash flow, multi-method closing (Cash, Paytm, GPay, PhonePe, Card, Other) & yesterday closing tally.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowMethodsManager(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-surface-card border border-border-subtle text-text-secondary hover:text-text-primary transition-all"
            title="Manage Payment Methods (Add / Rename / Disable)"
          >
            <Settings size={14} />
            <span>Payment Methods</span>
          </button>

          <div className="flex items-center gap-2 bg-surface-card p-1 rounded-2xl border border-border-subtle">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'active'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <Unlock size={14} />
              <span>Active Shift</span>
              {currentSession && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse ml-1" />}
            </button>

            <button
              onClick={() => setActiveTab('closing')}
              disabled={!currentSession}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'closing'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : !currentSession
                  ? 'text-text-muted/40 cursor-not-allowed'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <ShieldCheck size={14} />
              <span>Close Shift</span>
            </button>

            <button
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'history'
                  ? 'bg-brand-500 text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <History size={14} />
              <span>Shift History</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Stale Previous-Day Shift Warning Banner (Item 11d) ──────────────── */}
      {isStaleShift && currentSession && (
        <div className="mx-4 sm:mx-6 mt-4 p-4 rounded-2xl bg-amber-500/15 border-2 border-amber-500/40 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
              <AlertTriangle size={22} />
            </div>
            <div>
              <div className="text-sm font-black text-amber-300">
                Stale Shift Detected from a Previous Day (Shift #{currentSession.id})
              </div>
              <p className="text-xs text-text-secondary mt-0.5">
                Opened on <span className="font-mono font-bold text-text-primary">{formatShiftDateTime(currentSession.opened_at)}</span> (Current System Time: <span className="font-mono font-bold text-text-primary">{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>). Please close this previous shift before starting today's billing.
              </p>
            </div>
          </div>
          {activeTab !== 'closing' && (
            <button
              onClick={() => setActiveTab('closing')}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition-all shadow-md"
            >
              Close Stale Shift #{currentSession.id} Now →
            </button>
          )}
        </div>
      )}

      {/* ─── Main Content Body ──────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 1: ACTIVE SHIFT & LIVE CASH */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'active' && (
          <>
            {isLoadingSession ? (
              <div className="p-12 text-center text-text-muted text-xs">Loading active shift status...</div>
            ) : !currentSession ? (
              /* No Active Shift -> Prompt to Open with Yesterday's Closing Cash Tally (Item 11c) */
              <div className="max-w-2xl mx-auto space-y-5 bg-surface-panel border border-border-subtle rounded-3xl p-6 shadow-sm">
                <div className="text-center space-y-1">
                  <div className="w-12 h-12 rounded-2xl bg-brand-500/10 text-brand-500 flex items-center justify-center mx-auto mb-3 border border-brand-500/20">
                    <Unlock size={24} />
                  </div>
                  <h2 className="text-lg font-black">Open Shift & Tally with Previous Closing Cash</h2>
                  <p className="text-xs text-text-muted">
                    Count the physical cash in the drawer. Opening cash must tally with yesterday's closing cash.
                  </p>
                </div>

                {/* Previous Shift Closing Cash Tally Banner */}
                {prevSessionId !== null && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-2xl bg-surface-card border border-border-subtle text-center">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-text-muted">
                        Yesterday / Prev Shift #{prevSessionId} Closing
                      </span>
                      <div className="text-base font-black font-mono text-text-primary mt-0.5">
                        {formatMoney(prevClosingCashPaise)}
                      </div>
                      {prevClosedAt && (
                        <div className="text-[10px] text-text-muted">{formatShiftDateTime(prevClosedAt)}</div>
                      )}
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase text-text-muted">Counted Opening Cash</span>
                      <div className="text-base font-black font-mono text-brand-400 mt-0.5">
                        {formatMoney(countedOpeningPaise)}
                      </div>
                    </div>

                    <div className={`rounded-xl p-2 border ${
                      isOpeningMatchedWithYesterday
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}>
                      <span className="text-[10px] font-bold uppercase">Difference</span>
                      <div className="text-base font-black font-mono mt-0.5">
                        {isOpeningMatchedWithYesterday
                          ? '₹0.00 (Matched)'
                          : `${openingDiffFromPrevPaise > 0 ? '+' : '−'}${formatMoney(Math.abs(openingDiffFromPrevPaise))}`}
                      </div>
                    </div>
                  </div>
                )}

                <DenominationCounter 
                  counts={openingCounts} 
                  setCounts={setOpeningCounts} 
                  title="Opening Float Physical Denominations" 
                />

                {!isOpeningMatchedWithYesterday && (
                  <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                    <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                      <AlertTriangle size={15} />
                      <span>Opening Cash Does Not Match Previous Closing Cash ({formatMoney(prevClosingCashPaise)})</span>
                    </div>
                    <input
                      type="text"
                      value={openingVarianceReason}
                      onChange={e => setOpeningVarianceReason(e.target.value)}
                      placeholder="Mandatory reason required (e.g. Owner withdrew ₹2,000 overnight / Float added)..."
                      className="w-full bg-surface-card border border-rose-500/40 rounded-xl p-2.5 text-xs focus:border-rose-400 focus:outline-none"
                    />
                  </div>
                )}

                {openingError && (
                  <p className="text-xs text-rose-400 font-bold bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                    {openingError}
                  </p>
                )}

                <button
                  onClick={handleOpenShift}
                  disabled={isOpeningSession}
                  className="w-full btn-primary py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20"
                >
                  <Unlock size={16} />
                  <span>{isOpeningSession ? 'Opening Shift...' : `Open Shift with ${formatMoney(countedOpeningPaise)}`}</span>
                </button>
              </div>
            ) : (
              /* Active Shift Dashboard */
              <div className="space-y-6">
                {/* Shift Info Banner */}
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-surface-panel border border-border-subtle shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center border border-emerald-500/20 font-mono font-black">
                      #{currentSession.id}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black">Active Shift #{currentSession.id}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span>Open</span>
                        </span>
                        {prevSessionId !== null && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            activeShiftOpeningDiffPaise === 0
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>
                            {activeShiftOpeningDiffPaise === 0
                              ? `✓ Opening matches Prev Shift #${prevSessionId} (${formatMoney(prevClosingCashPaise)})`
                              : `⚠️ Opening diff vs Prev Shift #${prevSessionId}: ${activeShiftOpeningDiffPaise > 0 ? '+' : '−'}${formatMoney(Math.abs(activeShiftOpeningDiffPaise))}`}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Opened: <span className="font-mono font-bold text-text-secondary">{formatShiftDateTime(currentSession.opened_at)}</span> • Cashier #{currentSession.cashier_id}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => refresh()}
                      className="p-2 rounded-xl bg-surface-card border border-border-subtle text-text-muted hover:text-text-primary transition-colors text-xs font-bold flex items-center gap-1"
                      title="Refresh shift data"
                    >
                      <RefreshCw size={14} />
                      <span>Refresh</span>
                    </button>
                    <button
                      onClick={() => setActiveTab('closing')}
                      className="btn-primary px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md"
                    >
                      <Lock size={14} />
                      <span>Proceed to Close Shift</span>
                    </button>
                  </div>
                </div>

                {/* ── 7 KPI Cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  {/* Live Expected Cash Highlight */}
                  <div className="col-span-2 sm:col-span-4 lg:col-span-1 p-3.5 rounded-2xl bg-brand-500/10 border-2 border-brand-500/30 flex flex-col justify-between shadow-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-brand-400 tracking-wider">Live Expected Cash</span>
                      <DollarSign size={14} className="text-brand-400" />
                    </div>
                    <div className="text-lg font-black font-mono text-brand-300 mt-1">
                      {formatMoney(calc.expectedCashPaise)}
                    </div>
                    <span className="text-[9px] text-text-muted mt-1">Real completed sales only</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-surface-panel border border-border-subtle">
                    <span className="text-[10px] font-bold uppercase text-text-muted">Opening Float</span>
                    <div className="text-sm font-black font-mono text-text-primary mt-1">{formatMoney(calc.openingCashPaise)}</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-surface-panel border border-border-subtle">
                    <span className="text-[10px] font-bold uppercase text-emerald-400">+ Cash Sales</span>
                    <div className="text-sm font-black font-mono text-emerald-400 mt-1">+{formatMoney(calc.cashSalesPaise)}</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-surface-panel border border-border-subtle">
                    <span className="text-[10px] font-bold uppercase text-cyan-400">+ Cash In</span>
                    <div className="text-sm font-black font-mono text-cyan-400 mt-1">+{formatMoney(calc.cashInPaise)}</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-surface-panel border border-border-subtle">
                    <span className="text-[10px] font-bold uppercase text-rose-400">- Expenses</span>
                    <div className="text-sm font-black font-mono text-rose-400 mt-1">-{formatMoney(calc.cashExpensesPaise)}</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-surface-panel border border-border-subtle">
                    <span className="text-[10px] font-bold uppercase text-amber-400">- Refunds</span>
                    <div className="text-sm font-black font-mono text-amber-400 mt-1">-{formatMoney(calc.cashRefundsPaise)}</div>
                  </div>

                  <div className="p-3 rounded-2xl bg-surface-panel border border-border-subtle">
                    <span className="text-[10px] font-bold uppercase text-purple-400">- Cash Out</span>
                    <div className="text-sm font-black font-mono text-purple-400 mt-1">-{formatMoney(calc.cashOutPaise)}</div>
                  </div>
                </div>

                {/* ── Movement Entry Form & Active Movements ── */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  {/* Left: Categorized Movement Entry Form */}
                  <div className="lg:col-span-5 bg-surface-panel border border-border-subtle rounded-3xl p-5 shadow-sm space-y-4">
                    <div className="border-b border-border-subtle/50 pb-2">
                      <h3 className="text-sm font-black flex items-center gap-2">
                        <Plus size={16} className="text-brand-500" />
                        <span>Record Auditable Cash Movement</span>
                      </h3>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        Categorized entries write directly to shift records & update live expected cash.
                      </p>
                    </div>

                    {/* 3 Movement Type Selector */}
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-surface-card rounded-2xl border border-border-subtle">
                      <button
                        type="button"
                        onClick={() => { setMovementType('cash_in'); setMovementError(null); }}
                        className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all ${
                          movementType === 'cash_in'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <ArrowDownLeft size={13} />
                        <span>Cash In</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setMovementType('cash_out'); setMovementError(null); }}
                        className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all ${
                          movementType === 'cash_out'
                            ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <ArrowUpRight size={13} />
                        <span>Cash Out</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => { setMovementType('expense'); setMovementError(null); }}
                        className={`py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all ${
                          movementType === 'expense'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <Receipt size={13} />
                        <span>Expense</span>
                      </button>
                    </div>

                    {/* Form Inputs */}
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">
                          Amount (₹) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          value={movementAmount}
                          onChange={e => setMovementAmount(e.target.value)}
                          placeholder="e.g. 500"
                          className="w-full bg-surface-card border border-border-subtle rounded-xl p-2.5 text-xs font-mono font-bold focus:border-brand-500 focus:outline-none"
                        />
                      </div>

                      {movementType === 'expense' ? (
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">
                            Expense Category <span className="text-rose-400">*</span>
                          </label>
                          <select
                            value={selectedExpenseCatId}
                            onChange={e => setSelectedExpenseCatId(Number(e.target.value))}
                            className="w-full bg-surface-card border border-border-subtle rounded-xl p-2.5 text-xs font-bold focus:border-brand-500 focus:outline-none"
                          >
                            {expenseCategories.map((c: { id: number; name: string }) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">
                            Category / Reference
                          </label>
                          <input
                            type="text"
                            value={movementCategory}
                            onChange={e => setMovementCategory(e.target.value)}
                            placeholder={movementType === 'cash_in' ? 'e.g. Owner Float Top-up' : 'e.g. Petty Cash / Handover'}
                            className="w-full bg-surface-card border border-border-subtle rounded-xl p-2.5 text-xs focus:border-brand-500 focus:outline-none"
                          />
                        </div>
                      )}

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">
                          {movementType === 'cash_in' ? 'Added By' : 'Taken By / Paid To'}
                        </label>
                        <input
                          type="text"
                          value={movementPerson}
                          onChange={e => setMovementPerson(e.target.value)}
                          placeholder="e.g. Store Owner / Driver / Vendor"
                          className="w-full bg-surface-card border border-border-subtle rounded-xl p-2.5 text-xs focus:border-brand-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">
                          Reason / Description <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="text"
                          value={movementReason}
                          onChange={e => setMovementReason(e.target.value)}
                          placeholder="Mandatory explanation for audit trail..."
                          className="w-full bg-surface-card border border-border-subtle rounded-xl p-2.5 text-xs focus:border-brand-500 focus:outline-none"
                        />
                      </div>

                      {movementError && (
                        <p className="text-xs text-rose-400 font-bold bg-rose-500/10 p-2 rounded-xl border border-rose-500/20">
                          {movementError}
                        </p>
                      )}

                      <button
                        onClick={handleRecordMovement}
                        disabled={isRecordingMovement}
                        className="w-full btn-primary py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
                      >
                        <Plus size={14} />
                        <span>{isRecordingMovement ? 'Recording...' : `Record ${movementType === 'cash_in' ? 'Cash In' : movementType === 'expense' ? 'Expense' : 'Cash Out'}`}</span>
                      </button>
                    </div>
                  </div>

                  {/* Right: Active Shift Movements Table */}
                  <div className="lg:col-span-7 bg-surface-panel border border-border-subtle rounded-3xl p-5 shadow-sm flex flex-col space-y-3">
                    <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2">
                      <div>
                        <h3 className="text-sm font-black">Shift Cash Movements</h3>
                        <p className="text-[11px] text-text-muted">Recorded during active Shift #{currentSession.id} (editable while open)</p>
                      </div>
                      <span className="text-xs font-bold font-mono px-2 py-0.5 rounded-lg bg-surface-card border border-border-subtle">
                        {(dashboard?.recentMovements || []).length} Movements
                      </span>
                    </div>

                    <div className="flex-1 overflow-y-auto max-h-[360px]">
                      {(dashboard?.recentMovements || []).length === 0 ? (
                        <div className="p-12 text-center text-text-muted text-xs space-y-1">
                          <Receipt size={32} className="mx-auto text-text-muted/40" />
                          <p className="font-bold">No manual cash movements recorded yet</p>
                          <p className="text-[11px]">Use the form on the left to record Cash In, Cash Out, or Shop Expenses.</p>
                        </div>
                      ) : (
                        <table className="w-full text-xs text-left">
                          <thead className="bg-surface-card text-text-muted uppercase text-[10px] font-bold sticky top-0">
                            <tr>
                              <th className="p-2.5">Time</th>
                              <th className="p-2.5">Type</th>
                              <th className="p-2.5">Category / Reason</th>
                              <th className="p-2.5 text-right">Amount</th>
                              <th className="p-2.5 text-center">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border-subtle/50">
                            {(dashboard?.recentMovements || []).map((m: ShiftCashMovement) => (
                              <tr key={m.id} className="hover:bg-surface-hover/30 transition-colors">
                                <td className="p-2.5 font-mono text-text-muted text-[11px]">
                                  {formatShiftTime(m.created_at)}
                                </td>
                                <td className="p-2.5">
                                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    m.movement_type === 'cash_in'
                                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                      : m.movement_type === 'expense'
                                      ? 'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                                      : 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                                  }`}>
                                    {m.movement_type === 'cash_in' ? 'Cash In' : m.movement_type === 'expense' ? 'Expense' : 'Cash Out'}
                                  </span>
                                </td>
                                <td className="p-2.5 max-w-[200px]">
                                  <div className="font-bold text-text-primary truncate">{m.category}</div>
                                  <div className="text-[11px] text-text-muted truncate">{m.reason}</div>
                                </td>
                                <td className={`p-2.5 text-right font-mono font-bold ${
                                  m.movement_type === 'cash_in' ? 'text-emerald-400' : 'text-rose-400'
                                }`}>
                                  {m.movement_type === 'cash_in' ? '+' : '-'}{formatMoney(m.amount_paise)}
                                </td>
                                <td className="p-2.5 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => {
                                        setEditingMovement(m);
                                        setEditAmount(String(m.amount_paise / 100));
                                        setEditReason(m.reason);
                                      }}
                                      className="p-1 rounded-lg hover:bg-surface-card text-text-muted hover:text-text-primary transition-colors"
                                      title="Edit Movement"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (confirm('Delete this cash movement from open shift?')) {
                                          await deleteOpenMovement(m.id);
                                        }
                                      }}
                                      className="p-1 rounded-lg hover:bg-rose-500/10 text-text-muted hover:text-rose-400 transition-colors"
                                      title="Delete Movement"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 2: STEP-BY-STEP SHIFT CLOSING FLOW (Item 11a, 11b, 11c) */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'closing' && currentSession && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
              <div>
                <h2 className="text-lg font-black flex items-center gap-2">
                  <Lock className="text-brand-500" size={20} />
                  <span>Shift Closing & Multi-Method Reconciliation — Shift #{currentSession.id}</span>
                </h2>
                <p className="text-xs text-text-muted mt-0.5">
                  Count physical cash denominations and enter counted totals for Paytm, Google Pay, PhonePe, Card, and Other methods.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowMethodsManager(true)}
                className="px-3 py-1.5 rounded-xl bg-surface-panel border border-border-subtle text-xs font-bold text-text-secondary hover:text-text-primary flex items-center gap-1.5"
              >
                <Settings size={14} />
                <span>Configure Payment Methods</span>
              </button>
            </div>

            {/* Step 1: Opening Cash Tally vs Yesterday's Closing + Expected Cash Formula */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Expected Cash Formula Panel */}
              <div className="bg-surface-panel border border-border-subtle rounded-3xl p-5 shadow-sm space-y-3">
                <span className="text-[10px] font-black uppercase text-brand-400 tracking-wider">
                  1. Expected Cash Breakdown Formula
                </span>

                <div className="space-y-2 text-xs divide-y divide-border-subtle/40">
                  <div className="flex justify-between pt-1">
                    <span className="text-text-muted">Opening Cash Float:</span>
                    <span className="font-mono font-bold">{formatMoney(calc.openingCashPaise)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 text-emerald-400">
                    <span>+ Cash Sales (Completed Bills):</span>
                    <span className="font-mono font-bold">+{formatMoney(calc.cashSalesPaise)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 text-cyan-400">
                    <span>+ Cash In (Top-ups / Additions):</span>
                    <span className="font-mono font-bold">+{formatMoney(calc.cashInPaise)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 text-rose-400">
                    <span>− Cash Expenses (Drawer Paid):</span>
                    <span className="font-mono font-bold">−{formatMoney(calc.cashExpensesPaise)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 text-amber-400">
                    <span>− Cash Refunds (Sales Returns):</span>
                    <span className="font-mono font-bold">−{formatMoney(calc.cashRefundsPaise)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 text-purple-400">
                    <span>− Cash Out (Withdrawals / Safe Drops):</span>
                    <span className="font-mono font-bold">−{formatMoney(calc.cashOutPaise)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t-2 border-border-subtle text-sm font-black">
                    <span className="text-brand-400">Total Live Expected Cash:</span>
                    <span className="font-mono text-brand-300">{formatMoney(calc.expectedCashPaise)}</span>
                  </div>
                </div>
              </div>

              {/* Yesterday's Closing Cash Tally & Shift Info Panel */}
              <div className="bg-surface-panel border border-border-subtle rounded-3xl p-5 shadow-sm space-y-3 flex flex-col justify-between">
                <div className="space-y-3">
                  <span className="text-[10px] font-black uppercase text-cyan-400 tracking-wider">
                    Opening Cash vs Yesterday's Closing Tally
                  </span>

                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2.5 rounded-2xl bg-surface-card border border-border-subtle">
                      <div className="text-[10px] text-text-muted uppercase font-bold">Prev Closing</div>
                      <div className="font-mono font-black text-sm mt-0.5">{formatMoney(prevClosingCashPaise)}</div>
                      {prevSessionId && <div className="text-[9px] text-text-muted">Shift #{prevSessionId}</div>}
                    </div>
                    <div className="p-2.5 rounded-2xl bg-surface-card border border-border-subtle">
                      <div className="text-[10px] text-text-muted uppercase font-bold">This Opening</div>
                      <div className="font-mono font-black text-sm mt-0.5">{formatMoney(calc.openingCashPaise)}</div>
                      <div className="text-[9px] text-text-muted">Shift #{currentSession.id}</div>
                    </div>
                    <div className={`p-2.5 rounded-2xl border ${
                      activeShiftOpeningDiffPaise === 0
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                    }`}>
                      <div className="text-[10px] uppercase font-bold">Tally Diff</div>
                      <div className="font-mono font-black text-sm mt-0.5">
                        {activeShiftOpeningDiffPaise === 0
                          ? '₹0.00'
                          : `${activeShiftOpeningDiffPaise > 0 ? '+' : '−'}${formatMoney(Math.abs(activeShiftOpeningDiffPaise))}`}
                      </div>
                      <div className="text-[9px] font-bold">{activeShiftOpeningDiffPaise === 0 ? 'Matched' : 'Variance'}</div>
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-surface-card border border-border-subtle text-xs flex items-center justify-between">
                  <div>
                    <div className="font-bold text-text-primary">Credit / Udhaar Sales (Tracked in A/R)</div>
                    <div className="text-[10px] text-text-muted">{dashboard?.nonCashSummary?.creditCount || 0} Credit Invoices in Shift</div>
                  </div>
                  <span className="font-mono font-black text-purple-400">
                    {formatMoney(dashboard?.nonCashSummary?.creditSalesPaise || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Step 2: Physical Cash Denominations + Manual Entry for Paytm, GPay, PhonePe, Card, Other */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 space-y-2">
                <span className="text-xs font-black uppercase text-text-muted">
                  2A. Count Physical Cash in Drawer (Denominations)
                </span>
                <DenominationCounter 
                  counts={closingCounts} 
                  setCounts={setClosingCounts} 
                  title="Closing Physical Cash Count" 
                />
              </div>

              <div className="lg:col-span-5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-text-muted">
                    2B. Enter Non-Cash Method Totals
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const prefilled: Record<string, string> = {};
                      for (const m of methodRows) {
                        if (m.methodKey !== 'cash') {
                          prefilled[m.methodKey] = (m.expectedPaise / 100).toFixed(2);
                        }
                      }
                      setNonCashCountedInputs(prefilled);
                    }}
                    className="text-[11px] font-bold text-brand-400 hover:underline"
                  >
                    Fill Expected for Non-Cash
                  </button>
                </div>

                <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 shadow-sm space-y-3">
                  {methodRows.filter(m => m.methodKey !== 'cash').map(m => (
                    <div key={m.methodKey} className="p-2.5 rounded-xl bg-surface-panel/70 border border-border-subtle/50 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                          {m.methodType === 'CARD' ? <CreditCard size={13} className="text-blue-400" /> : <Smartphone size={13} className="text-emerald-400" />}
                          <span>{m.displayName}</span>
                        </div>
                        <div className="text-[10px] text-text-muted font-mono">
                          Expected: {formatMoney(m.expectedPaise)} ({m.txCount} txns)
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-text-muted">₹</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={nonCashCountedInputs[m.methodKey] ?? ''}
                          placeholder="0.00"
                          onChange={e => setNonCashCountedInputs({ ...nonCashCountedInputs, [m.methodKey]: e.target.value })}
                          className="w-28 text-right bg-surface-card border border-border-subtle rounded-xl py-1.5 px-2.5 font-mono font-bold text-xs focus:border-brand-500 focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Step 3: Expected vs Counted Per Method & Difference (Red/Green) */}
            <div className="p-5 rounded-3xl bg-surface-panel border border-border-subtle shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase text-text-muted">
                  3. Expected vs Counted Per Payment Method
                </span>
                <button
                  type="button"
                  onClick={() => setShowTransactionDrawer(!showTransactionDrawer)}
                  className="text-xs font-bold text-brand-400 hover:text-brand-300 underline flex items-center gap-1"
                >
                  <Eye size={14} />
                  <span>{showTransactionDrawer ? 'Hide Transactions' : 'Check Shift Transactions'}</span>
                </button>
              </div>

              <div className="overflow-x-auto border border-border-subtle rounded-2xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-card text-text-muted uppercase text-[10px] font-bold border-b border-border-subtle">
                    <tr>
                      <th className="py-2.5 px-4">Payment Method</th>
                      <th className="py-2.5 px-4 text-right">Expected</th>
                      <th className="py-2.5 px-4 text-right">Counted / Entered</th>
                      <th className="py-2.5 px-4 text-right">Difference</th>
                      <th className="py-2.5 px-4 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/50">
                    {methodRows.map(row => (
                      <tr key={row.methodKey} className="hover:bg-surface-hover/20">
                        <td className="py-3 px-4 font-bold text-text-primary">
                          {row.displayName}
                          <span className="ml-2 text-[10px] font-mono text-text-muted uppercase">({row.methodType})</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold">
                          {formatMoney(row.expectedPaise)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-brand-400">
                          {formatMoney(row.countedPaise)}
                        </td>
                        <td className={`py-3 px-4 text-right font-mono font-black ${
                          row.isMatched ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {row.isMatched
                            ? '₹0.00'
                            : `${row.differencePaise > 0 ? '+' : '−'}${formatMoney(Math.abs(row.differencePaise))}`}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            row.isMatched
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                          }`}>
                            {row.isMatched ? '✓ Matched' : row.differencePaise < 0 ? 'SHORT' : 'OVER'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Transaction Inspection Drawer */}
              {showTransactionDrawer && (
                <div className="p-4 rounded-2xl bg-surface-card border border-border-subtle space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold border-b border-border-subtle/50 pb-1.5">
                    <span>Shift Transaction Inspection ({transactions.length} entries)</span>
                    <span className="text-text-muted text-[11px]">Check for unrecorded or duplicate entries</span>
                  </div>

                  <div className="max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[10px] uppercase text-text-muted">
                        <tr>
                          <th className="p-1.5">Time</th>
                          <th className="p-1.5">Type</th>
                          <th className="p-1.5">Reference / Description</th>
                          <th className="p-1.5 text-right">In</th>
                          <th className="p-1.5 text-right">Out</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle/40">
                        {transactions.map((tx: any) => (
                          <tr key={tx.id} className="text-[11px]">
                            <td className="p-1.5 font-mono text-text-muted">{formatShiftTime(tx.created_at)}</td>
                            <td className="p-1.5 font-bold">{tx.type}</td>
                            <td className="p-1.5 text-text-secondary truncate max-w-[200px]">{tx.reference_id || tx.reason}</td>
                            <td className="p-1.5 text-right font-mono text-emerald-400">{tx.cash_in_paise ? formatMoney(tx.cash_in_paise) : '—'}</td>
                            <td className="p-1.5 text-right font-mono text-rose-400">{tx.cash_out_paise ? formatMoney(tx.cash_out_paise) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* If Mismatched: Required Declared Difference Reason */}
              {!isClosingMatched && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                  <div className="flex items-center gap-2 text-rose-400 font-bold text-xs">
                    <AlertTriangle size={16} />
                    <span>Difference Detected: Mandatory Declared Reason Required</span>
                  </div>
                  <p className="text-[11px] text-text-muted">
                    Silent closing is blocked when any payment method has a difference. State the operational cause for audit & manager review.
                  </p>
                  <input
                    type="text"
                    value={declaredDifferenceReason}
                    onChange={e => setDeclaredDifferenceReason(e.target.value)}
                    placeholder="e.g. Customer paid via PhonePe instead of Google Pay / Excess change given"
                    className="w-full bg-surface-card border border-rose-500/40 rounded-xl p-2.5 text-xs focus:border-rose-400 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">Optional Closing Notes</label>
                <input
                  type="text"
                  value={closingNotes}
                  onChange={e => setClosingNotes(e.target.value)}
                  placeholder="Any shift handover notes..."
                  className="w-full bg-surface-card border border-border-subtle rounded-xl p-2.5 text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>

              {closingError && (
                <p className="text-xs text-rose-400 font-bold bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                  {closingError}
                </p>
              )}

              <button
                onClick={handleCloseShift}
                disabled={isClosingSession}
                className="w-full btn-primary py-3 rounded-2xl text-sm font-black flex items-center justify-center gap-2 shadow-lg"
              >
                <Lock size={16} />
                <span>
                  {isClosingSession
                    ? 'Finalizing Shift...'
                    : isClosingMatched
                    ? 'Confirm Count & Close Shift (All Methods Matched)'
                    : 'Confirm Count & Close Shift with Declared Reason'}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════ */}
        {/* TAB 3: SHIFT HISTORY & AUDIT CORRECTIONS */}
        {/* ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'history' && (
          <div className="space-y-5">
            {/* Filter Bar */}
            <div className="p-4 rounded-3xl bg-surface-panel border border-border-subtle shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 flex-1">
                {/* Search */}
                <div className="relative min-w-[200px]">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    type="text"
                    value={historyFilter.search || ''}
                    onChange={e => setHistoryFilter({ ...historyFilter, search: e.target.value })}
                    placeholder="Search cashier, shift #..."
                    className="w-full pl-8 pr-3 py-2 bg-surface-card border border-border-subtle rounded-xl text-xs focus:outline-none focus:border-brand-500"
                  />
                </div>

                {/* Status Filter */}
                <select
                  value={historyFilter.status || 'ALL'}
                  onChange={e => setHistoryFilter({ ...historyFilter, status: e.target.value })}
                  className="bg-surface-card border border-border-subtle rounded-xl py-2 px-3 text-xs font-bold focus:outline-none focus:border-brand-500"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="Open">🟢 Open Shifts</option>
                  <option value="matched">✅ Closed - Matched</option>
                  <option value="explained_difference">⚠️ Closed - Difference</option>
                  <option value="corrected">🟣 Corrected</option>
                </select>

                {/* Date Filters */}
                <div className="flex items-center gap-1 text-xs">
                  <input
                    type="date"
                    value={historyFilter.startDate || ''}
                    onChange={e => setHistoryFilter({ ...historyFilter, startDate: e.target.value })}
                    className="bg-surface-card border border-border-subtle rounded-xl py-1.5 px-2.5 text-xs"
                  />
                  <span className="text-text-muted">to</span>
                  <input
                    type="date"
                    value={historyFilter.endDate || ''}
                    onChange={e => setHistoryFilter({ ...historyFilter, endDate: e.target.value })}
                    className="bg-surface-card border border-border-subtle rounded-xl py-1.5 px-2.5 text-xs"
                  />
                </div>
              </div>

              <span className="text-xs font-mono font-bold text-text-muted">
                Total: {historyData?.total || 0} Shifts
              </span>
            </div>

            {/* Shift History Table */}
            <div className="bg-surface-panel border border-border-subtle rounded-3xl overflow-hidden shadow-sm">
              {isLoadingHistory ? (
                <div className="p-12 text-center text-text-muted text-xs">Loading shift records...</div>
              ) : (historyData?.shifts || []).length === 0 ? (
                <div className="p-12 text-center text-text-muted text-xs space-y-1">
                  <History size={36} className="mx-auto text-text-muted/40" />
                  <p className="font-bold">No past shifts match your filter</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-card text-text-muted uppercase text-[10px] font-bold border-b border-border-subtle">
                      <tr>
                        <th className="py-3 px-4">Shift #</th>
                        <th className="py-3 px-4">Cashier</th>
                        <th className="py-3 px-4">Date / Timing</th>
                        <th className="py-3 px-4 text-right">Opening Float</th>
                        <th className="py-3 px-4 text-right">Cash Sales</th>
                        <th className="py-3 px-4 text-right">Expected</th>
                        <th className="py-3 px-4 text-right">Physical Count</th>
                        <th className="py-3 px-4 text-right">Difference</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle/50">
                      {(historyData?.shifts || []).map(shift => {
                        const isMatched = (shift.difference_paise || 0) === 0;
                        const isShort = (shift.difference_paise || 0) < 0;

                        return (
                          <tr key={shift.id} className="hover:bg-surface-hover/30 transition-colors">
                            <td className="py-3.5 px-4 font-mono font-bold text-brand-400">
                              #{shift.id}
                            </td>

                            <td className="py-3.5 px-4">
                              <div className="font-bold text-text-primary">{shift.cashier_name}</div>
                              <div className="text-[10px] text-text-muted font-mono">{shift.cashier_code}</div>
                            </td>

                            <td className="py-3.5 px-4 text-[11px] text-text-muted font-mono">
                              <div>{formatShiftDateTime(shift.opened_at)}</div>
                              <div className="text-[10px]">
                                {shift.closed_at ? `Closed: ${formatShiftTime(shift.closed_at)}` : '🟢 Active'}
                              </div>
                            </td>

                            <td className="py-3.5 px-4 text-right font-mono">
                              {formatMoney(shift.opening_cash_paise)}
                            </td>

                            <td className="py-3.5 px-4 text-right font-mono text-emerald-400 font-bold">
                              +{formatMoney(shift.cash_sales_paise)}
                            </td>

                            <td className="py-3.5 px-4 text-right font-mono font-bold">
                              {formatMoney(shift.expected_cash_paise)}
                            </td>

                            <td className="py-3.5 px-4 text-right font-mono font-bold text-brand-400">
                              {shift.physical_cash_paise !== null ? formatMoney(shift.physical_cash_paise) : '—'}
                            </td>

                            <td className={`py-3.5 px-4 text-right font-mono font-bold ${
                              shift.status === 'Open'
                                ? 'text-text-muted'
                                : isMatched
                                ? 'text-emerald-400'
                                : isShort
                                ? 'text-rose-400'
                                : 'text-amber-400'
                            }`}>
                              {shift.status === 'Open' ? '—' : isMatched ? '₹0.00' : formatMoney(shift.difference_paise || 0)}
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                shift.status === 'Open'
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                                  : shift.reconciliation_status === 'corrected'
                                  ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                                  : shift.reconciliation_status === 'matched'
                                  ? 'bg-blue-500/15 text-blue-400 border border-blue-500/20'
                                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                              }`}>
                                {shift.status === 'Open'
                                  ? '🟢 Open'
                                  : shift.reconciliation_status === 'corrected'
                                  ? '🟣 Corrected'
                                  : shift.reconciliation_status === 'matched'
                                  ? '✅ Matched'
                                  : '⚠️ Difference'}
                              </span>
                            </td>

                            <td className="py-3.5 px-4 text-center">
                              <button
                                onClick={() => setSelectedShiftId(shift.id)}
                                className="px-2.5 py-1 rounded-xl bg-surface-card border border-border-subtle hover:border-brand-500 text-text-secondary hover:text-brand-400 font-bold transition-all flex items-center gap-1 mx-auto text-[11px]"
                              >
                                <Eye size={12} />
                                <span>Details</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ─── MODAL 0: PAYMENT METHODS MANAGER (Add / Rename / Enable-Disable) ─── */}
      {showMethodsManager && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-3xl p-5 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
              <div>
                <h3 className="text-sm font-black flex items-center gap-2">
                  <Settings size={16} className="text-brand-500" />
                  <span>Manage Payment Methods</span>
                </h3>
                <p className="text-[11px] text-text-muted">
                  Add, rename, or enable/disable payment methods shown during Shift Closing & Settings.
                </p>
              </div>
              <button onClick={() => setShowMethodsManager(false)} className="text-text-muted hover:text-text-primary">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {(paymentMethods || []).map((m: any) => (
                <div key={m.id || m.method_key} className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-card border border-border-subtle text-xs">
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      defaultValue={m.display_name}
                      disabled={m.method_key === 'cash'}
                      onBlur={async e => {
                        const val = e.target.value.trim();
                        if (val && val !== m.display_name) {
                          await savePaymentMethod({
                            id: m.id,
                            method_key: m.method_key,
                            display_name: val,
                            method_type: m.method_type,
                            is_enabled: m.is_enabled,
                          });
                        }
                      }}
                      className="bg-surface-panel border border-border-subtle rounded-lg px-2.5 py-1 text-xs font-bold flex-1"
                    />
                    <span className="text-[10px] font-mono uppercase text-text-muted px-2 py-0.5 rounded bg-surface-panel">
                      {m.method_type}
                    </span>
                  </div>
                  {m.method_key !== 'cash' && (
                    <button
                      type="button"
                      onClick={async () => {
                        await savePaymentMethod({
                          id: m.id,
                          method_key: m.method_key,
                          display_name: m.display_name,
                          method_type: m.method_type,
                          is_enabled: m.is_enabled ? 0 : 1,
                        });
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                        m.is_enabled
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : 'bg-surface-panel text-text-muted border-border-subtle'
                      }`}
                    >
                      {m.is_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border-subtle space-y-2">
              <span className="text-[10px] font-bold uppercase text-text-muted">Add New Payment Method</span>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newMethodName}
                  onChange={e => setNewMethodName(e.target.value)}
                  placeholder="e.g. Amazon Pay / BharatPe"
                  className="flex-1 bg-surface-card border border-border-subtle rounded-xl p-2 text-xs"
                />
                <select
                  value={newMethodType}
                  onChange={e => setNewMethodType(e.target.value as any)}
                  className="bg-surface-card border border-border-subtle rounded-xl p-2 text-xs font-bold"
                >
                  <option value="UPI">UPI</option>
                  <option value="CARD">CARD</option>
                  <option value="OTHER">OTHER</option>
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    if (!newMethodName.trim()) return;
                    await savePaymentMethod({
                      display_name: newMethodName.trim(),
                      method_type: newMethodType,
                      is_enabled: 1,
                    });
                    setNewMethodName('');
                  }}
                  className="btn-primary px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1"
                >
                  <Plus size={14} />
                  <span>Add</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 1: EDIT OPEN MOVEMENT ──────────────────────────────────────── */}
      {editingMovement && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-3xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border-subtle/50 pb-2">
              <h3 className="text-sm font-black">Edit Movement #{editingMovement.id}</h3>
              <button onClick={() => setEditingMovement(null)} className="text-text-muted hover:text-text-primary">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">Amount (₹)</label>
                <input
                  type="number"
                  step="any"
                  value={editAmount}
                  onChange={e => setEditAmount(e.target.value)}
                  className="w-full bg-surface-card border border-border-subtle rounded-xl p-2 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">Reason</label>
                <input
                  type="text"
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  className="w-full bg-surface-card border border-border-subtle rounded-xl p-2"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setEditingMovement(null)} className="flex-1 btn-secondary py-2 rounded-xl text-xs font-bold">
                Cancel
              </button>
              <button
                onClick={async () => {
                  const num = parseFloat(editAmount);
                  if (isNaN(num) || num <= 0) return alert('Invalid amount');
                  await updateOpenMovement({
                    movementId: editingMovement.id,
                    input: { amount_paise: Math.round(num * 100), reason: editReason },
                  });
                  setEditingMovement(null);
                }}
                className="flex-1 btn-primary py-2 rounded-xl text-xs font-bold"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: SHIFT DRILL-DOWN & SAFE MANAGER CORRECTIONS ──────────────── */}
      {selectedShiftId && (
        <ShiftDetailModal
          sessionId={selectedShiftId}
          onClose={() => setSelectedShiftId(null)}
          applyCorrection={applyCorrection}
          isApplyingCorrection={isApplyingCorrection}
          onCorrectionSuccess={() => {
            refresh();
          }}
        />
      )}
    </div>
  );
}

/* ─── Shift Drill-down & Manager Correction Modal ────────────────────────────── */
function ShiftDetailModal({
  sessionId,
  onClose,
  applyCorrection,
  isApplyingCorrection,
  onCorrectionSuccess,
}: {
  sessionId: number;
  onClose: () => void;
  applyCorrection: (input: any) => Promise<any>;
  isApplyingCorrection: boolean;
  onCorrectionSuccess: () => void;
}) {
  const { data: details, isLoading } = useShiftDetails(sessionId);
  const [showCorrectionForm, setShowCorrectionForm] = useState(false);
  const [targetAction, setTargetAction] = useState<'update_movement' | 'delete_movement' | 'adjust_closing'>('update_movement');
  const [targetMovementId, setTargetMovementId] = useState<number | undefined>(undefined);
  const [correctionAmount, setCorrectionAmount] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  if (isLoading || !details) {
    return (
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
        <div className="bg-surface-panel p-8 rounded-3xl text-xs text-text-muted">Loading shift #{sessionId} details...</div>
      </div>
    );
  }

  const { session, closingRecord, movements, corrections, liveExpected } = details;

  const handleSaveCorrection = async () => {
    setCorrectionError(null);
    if (!correctionReason.trim()) {
      setCorrectionError('Mandatory audit reason is required for historical correction');
      return;
    }

    try {
      const amountPaise = correctionAmount ? Math.round(parseFloat(correctionAmount) * 100) : undefined;
      await applyCorrection({
        sessionId,
        action: targetAction,
        movementId: targetMovementId,
        amount_paise: amountPaise,
        reason: correctionReason.trim(),
      });
      setShowCorrectionForm(false);
      onCorrectionSuccess();
    } catch (err: any) {
      setCorrectionError(err?.message || 'Correction failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-surface-panel border border-border-subtle rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-border-subtle flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black">Shift #{session.id} Detail Record</h2>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                session.status === 'Open' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'
              }`}>
                {session.status}
              </span>
            </div>
            <p className="text-[11px] text-text-muted mt-0.5">
              Cashier: {session.cashier_name} ({session.cashier_code}) • Opened {new Date(session.opened_at).toLocaleString()}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-text-muted hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-3 rounded-2xl bg-surface-card border border-border-subtle">
              <span className="text-[10px] uppercase font-bold text-text-muted">Opening Float</span>
              <div className="text-sm font-black font-mono mt-0.5">{formatMoney(session.opening_cash_paise)}</div>
            </div>

            <div className="p-3 rounded-2xl bg-surface-card border border-border-subtle">
              <span className="text-[10px] uppercase font-bold text-text-muted">Expected Cash</span>
              <div className="text-sm font-black font-mono text-brand-400 mt-0.5">
                {formatMoney(closingRecord?.expected_cash_paise || liveExpected.expectedCashPaise)}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-surface-card border border-border-subtle">
              <span className="text-[10px] uppercase font-bold text-text-muted">Physical Count</span>
              <div className="text-sm font-black font-mono text-brand-300 mt-0.5">
                {closingRecord ? formatMoney(closingRecord.physical_cash_paise) : '—'}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-surface-card border border-border-subtle">
              <span className="text-[10px] uppercase font-bold text-text-muted">Closing Status</span>
              <div className="text-xs font-bold mt-1 text-text-primary">
                {closingRecord ? closingRecord.status.toUpperCase() : 'OPEN'}
              </div>
            </div>
          </div>

          {/* Declared Reason if Mismatched */}
          {closingRecord?.declared_reason && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1">
              <div className="font-bold text-amber-400 text-[11px] flex items-center gap-1.5">
                <AlertTriangle size={14} />
                <span>Declared Closing Difference Reason (on record):</span>
              </div>
              <p className="text-xs text-text-primary pl-5 font-mono">{closingRecord.declared_reason}</p>
            </div>
          )}

          {/* Cash Movements during this Shift */}
          <div className="space-y-2">
            <span className="text-xs font-black uppercase text-text-muted">Cash Movements ({movements.length})</span>
            {movements.length === 0 ? (
              <p className="text-text-muted text-[11px] italic">No manual cash movements recorded during this shift.</p>
            ) : (
              <div className="border border-border-subtle rounded-2xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-surface-card text-text-muted uppercase text-[10px]">
                    <tr>
                      <th className="p-2">Type</th>
                      <th className="p-2">Category</th>
                      <th className="p-2">Reason</th>
                      <th className="p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle/40">
                    {movements.map((m: ShiftCashMovement) => (
                      <tr key={m.id} className="text-[11px]">
                        <td className="p-2 font-bold">{m.movement_type}</td>
                        <td className="p-2">{m.category}</td>
                        <td className="p-2 text-text-secondary">{m.reason}</td>
                        <td className="p-2 text-right font-mono font-bold">{formatMoney(m.amount_paise)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Audit Corrections History */}
          {corrections.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-black uppercase text-purple-400 flex items-center gap-1">
                <ShieldCheck size={14} />
                <span>Correction Audit Trail ({corrections.length} edits applied)</span>
              </span>

              <div className="border border-purple-500/20 bg-purple-500/5 rounded-2xl p-3 space-y-2">
                {corrections.map((c: ShiftCorrection) => (
                  <div key={c.id} className="text-[11px] border-b border-purple-500/10 pb-1.5 last:border-0 last:pb-0">
                    <div className="flex justify-between font-mono">
                      <span className="font-bold text-purple-300">
                        {c.field_name}: {c.original_value} → {c.new_value}
                      </span>
                      <span className="text-text-muted">{new Date(c.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-text-secondary mt-0.5">Reason: {c.reason} (Authorized by {c.authorized_by_name})</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manager Correction Form Toggle */}
          {session.status === 'Closed' && (
            <div className="border-t border-border-subtle pt-3">
              {!showCorrectionForm ? (
                <button
                  onClick={() => {
                    setShowCorrectionForm(true);
                    if (movements.length > 0) setTargetMovementId(movements[0].id);
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 font-bold text-xs transition-colors flex items-center gap-1.5"
                >
                  <Edit3 size={14} />
                  <span>Apply Manager Correction / Fix Record</span>
                </button>
              ) : (
                <div className="p-4 rounded-2xl bg-surface-card border border-purple-500/30 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-400">
                    <span>Manager Historical Correction</span>
                    <button onClick={() => setShowCorrectionForm(false)} className="text-text-muted hover:text-text-primary">
                      <X size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">Target</label>
                      <select
                        value={targetAction}
                        onChange={e => setTargetAction(e.target.value as any)}
                        className="w-full bg-surface-panel border border-border-subtle rounded-xl p-2 text-xs"
                      >
                        <option value="update_movement">Update Cash Movement</option>
                        <option value="delete_movement">Void / Delete Movement</option>
                        <option value="adjust_closing">Adjust Physical Count</option>
                      </select>
                    </div>

                    {targetAction !== 'adjust_closing' && (
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">Select Movement</label>
                        <select
                          value={targetMovementId}
                          onChange={e => setTargetMovementId(Number(e.target.value))}
                          className="w-full bg-surface-panel border border-border-subtle rounded-xl p-2 text-xs"
                        >
                          {movements.map((m: ShiftCashMovement) => (
                            <option key={m.id} value={m.id}>
                              #{m.id} {m.movement_type} - {formatMoney(m.amount_paise)} ({m.reason})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {targetAction !== 'delete_movement' && (
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">New Value (₹)</label>
                      <input
                        type="number"
                        step="any"
                        value={correctionAmount}
                        onChange={e => setCorrectionAmount(e.target.value)}
                        placeholder="e.g. 350.00"
                        className="w-full bg-surface-panel border border-border-subtle rounded-xl p-2 text-xs font-mono"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-[10px] uppercase font-bold text-text-muted mb-1">
                      Mandatory Correction Reason <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={correctionReason}
                      onChange={e => setCorrectionReason(e.target.value)}
                      placeholder="Why is this historical financial record being altered?..."
                      className="w-full bg-surface-panel border border-border-subtle rounded-xl p-2 text-xs"
                    />
                  </div>

                  {correctionError && (
                    <p className="text-xs text-rose-400 font-bold">{correctionError}</p>
                  )}

                  <button
                    onClick={handleSaveCorrection}
                    disabled={isApplyingCorrection}
                    className="w-full btn-primary py-2 rounded-xl text-xs font-bold"
                  >
                    {isApplyingCorrection ? 'Saving...' : 'Authorize & Commit Correction'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
