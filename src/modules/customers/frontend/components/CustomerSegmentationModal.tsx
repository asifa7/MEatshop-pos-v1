import React, { useState, useEffect } from 'react';
import { 
  X, 
  Crown, 
  Sparkles, 
  CheckCircle2, 
  RefreshCw, 
  Sliders, 
  HelpCircle,
  Building2,
  UtensilsCrossed,
  UserCheck,
  Hourglass,
  Sparkle
} from 'lucide-react';
import { 
  useCustomerTierSettings, 
  useUpdateCustomerTierSettings, 
  useRecalculateCustomerTiers 
} from '../hooks/useCustomers';

interface CustomerSegmentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CustomerSegmentationModal({
  isOpen,
  onClose,
}: CustomerSegmentationModalProps) {
  const { data: tierSettings, isLoading } = useCustomerTierSettings();
  const updateSettingsMutation = useUpdateCustomerTierSettings();
  const recalculateMutation = useRecalculateCustomerTiers();

  const [vipSpendRupees, setVipSpendRupees] = useState<number>(5000);
  const [vipMinVisits, setVipMinVisits] = useState<number>(5);
  const [vipMode, setVipMode] = useState<'either' | 'both'>('either');
  const [regularMinVisits, setRegularMinVisits] = useState<number>(2);
  const [rareInactiveDays, setRareInactiveDays] = useState<number>(30);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (tierSettings) {
      setVipSpendRupees(Math.round(tierSettings.vip_min_spend_paise / 100));
      setVipMinVisits(tierSettings.vip_min_visits);
      setVipMode(tierSettings.vip_criteria_mode);
      setRegularMinVisits(tierSettings.regular_min_visits);
      setRareInactiveDays(tierSettings.rare_inactive_days);
    }
  }, [tierSettings]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setStatusMessage('Saving criteria & recalibrating all customer accounts...');
      const res = await updateSettingsMutation.mutateAsync({
        vip_min_spend_paise: Math.max(1000, vipSpendRupees * 100),
        vip_min_visits: Math.max(1, vipMinVisits),
        vip_criteria_mode: vipMode,
        regular_min_visits: Math.max(1, regularMinVisits),
        rare_inactive_days: Math.max(7, rareInactiveDays),
      });

      const recalc = await recalculateMutation.mutateAsync();
      const s = recalc.summary;
      setStatusMessage(`✓ Criteria updated! Calibrated ${recalc.updatedCount} accounts (${s.VIP || 0} VIP, ${s.Regular || 0} Regular, ${s.New || 0} New, ${s.Rare || 0} Rare, ${s.Wholesale || 0} Wholesale, ${s.Restaurant || 0} Resto)`);
      setTimeout(() => {
        setStatusMessage(null);
      }, 4000);
    } catch (err: any) {
      setStatusMessage(`Failed to update criteria: ${err?.message || err}`);
    }
  };

  const handleRecalculateOnly = async () => {
    try {
      setStatusMessage('Recalculating customer tiers live...');
      const recalc = await recalculateMutation.mutateAsync();
      const s = recalc.summary;
      setStatusMessage(`✓ Done! ${recalc.updatedCount} accounts recalculated (${s.VIP || 0} VIP, ${s.Regular || 0} Regular, ${s.New || 0} New, ${s.Rare || 0} Rare)`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      setStatusMessage(`Recalculation error: ${err?.message || err}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-white dark:bg-surface-card border border-gray-200 dark:border-border-subtle rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col text-xs text-text-primary">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-border-subtle flex items-center justify-between bg-gray-50/80 dark:bg-surface-panel">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Crown size={19} />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900 dark:text-white font-outfit">
                Customer VIP & Tier Criteria Rules
              </h3>
              <p className="text-[11px] text-gray-500">
                Configure spending and visit bars to automatically move customers between New, Regular, VIP, and Rare
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-200 dark:hover:bg-surface-hover text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {statusMessage && (
            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 font-bold text-xs flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* 1. VIP Criteria Setting */}
          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/10 p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown size={16} className="text-amber-500" />
                <span className="font-black text-xs text-amber-900 dark:text-amber-300 uppercase tracking-wider">
                  ⭐ VIP Tier Qualifying Bar
                </span>
              </div>
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/60 px-2 py-0.5 rounded-full">
                Auto-Promotes to VIP
              </span>
            </div>

            <p className="text-[11px] text-gray-600 dark:text-gray-400">
              When a customer's total purchases or visits cross this bar, they are automatically upgraded to VIP status.
            </p>

            <div className="grid grid-cols-2 gap-3.5 pt-1">
              <div>
                <label className="text-[11px] font-extrabold text-gray-700 dark:text-gray-300 block mb-1">
                  Lifetime Purchase Spend (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-gray-400 font-bold">₹</span>
                  <input
                    type="number"
                    min={100}
                    step={500}
                    value={vipSpendRupees}
                    onChange={(e) => setVipSpendRupees(Number(e.target.value))}
                    className="w-full pl-7 pr-3 py-2 rounded-xl border border-gray-300 dark:border-border-subtle bg-white dark:bg-surface-card font-mono font-bold text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                    placeholder="5000"
                  />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">E.g. ₹5,000 or ₹10,000 lifetime buy</p>
              </div>

              <div>
                <label className="text-[11px] font-extrabold text-gray-700 dark:text-gray-300 block mb-1">
                  Minimum Visit Count
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={vipMinVisits}
                  onChange={(e) => setVipMinVisits(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-border-subtle bg-white dark:bg-surface-card font-mono font-bold text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                  placeholder="5"
                />
                <p className="text-[10px] text-gray-400 mt-1">E.g. 5 or 8 shop visits</p>
              </div>
            </div>

            {/* Qualifying Condition Mode */}
            <div className="pt-1">
              <label className="text-[11px] font-extrabold text-gray-700 dark:text-gray-300 block mb-1">
                VIP Condition Rule
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setVipMode('either')}
                  className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                    vipMode === 'either'
                      ? 'border-amber-500 bg-amber-100/70 dark:bg-amber-950/60 font-black text-amber-900 dark:text-amber-200'
                      : 'border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-panel text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <p className="font-extrabold text-xs">Either Spend OR Visits</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Recommended (reaches ₹{vipSpendRupees.toLocaleString('en-IN')} OR {vipMinVisits} visits)</p>
                </button>

                <button
                  type="button"
                  onClick={() => setVipMode('both')}
                  className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                    vipMode === 'both'
                      ? 'border-amber-500 bg-amber-100/70 dark:bg-amber-950/60 font-black text-amber-900 dark:text-amber-200'
                      : 'border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-panel text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <p className="font-extrabold text-xs">Both Spend AND Visits</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Strict (must reach BOTH spend and visits)</p>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Regular & Rare Inactivity Settings */}
          <div className="grid grid-cols-2 gap-3.5">
            {/* Regular Visits */}
            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/20 dark:bg-emerald-950/10 p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-extrabold">
                <UserCheck size={14} />
                <span>🟢 Regular Threshold</span>
              </div>
              <p className="text-[10px] text-gray-500">
                Moves from <span className="font-bold text-blue-600">New</span> to <span className="font-bold text-emerald-600">Regular</span> after:
              </p>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={regularMinVisits}
                  onChange={(e) => setRegularMinVisits(Number(e.target.value))}
                  className="w-20 px-3 py-1.5 rounded-xl border border-gray-300 dark:border-border-subtle bg-white dark:bg-surface-card font-mono font-bold text-xs text-gray-900 dark:text-white"
                />
                <span className="font-extrabold text-gray-700 dark:text-gray-300">visits</span>
              </div>
            </div>

            {/* Rare Customer Inactivity */}
            <div className="rounded-2xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/20 dark:bg-purple-950/10 p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-purple-800 dark:text-purple-300 font-extrabold">
                <Hourglass size={14} />
                <span>⏳ Rare Customer Threshold</span>
              </div>
              <p className="text-[10px] text-gray-500">
                Classified as <span className="font-bold text-purple-600">Rare</span> if no purchase for:
              </p>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="number"
                  min={7}
                  max={365}
                  value={rareInactiveDays}
                  onChange={(e) => setRareInactiveDays(Number(e.target.value))}
                  className="w-20 px-3 py-1.5 rounded-xl border border-gray-300 dark:border-border-subtle bg-white dark:bg-surface-card font-mono font-bold text-xs text-gray-900 dark:text-white"
                />
                <span className="font-extrabold text-gray-700 dark:text-gray-300">days</span>
              </div>
            </div>
          </div>

          {/* 3. Manual Overrides Info */}
          <div className="rounded-2xl border border-gray-200 dark:border-border-subtle bg-gray-50/70 dark:bg-surface-panel p-3.5 space-y-1.5">
            <h4 className="font-black text-xs text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <Sliders size={13} className="text-[#0d6e53]" />
              <span>Manual Tier Overrides & Business Accounts</span>
            </h4>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              You can manually assign any customer directly from the Customer List or detail panel:
            </p>
            <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-bold">
              <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">⭐ VIP</span>
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300">🟢 Regular</span>
              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 border border-blue-300">🆕 New</span>
              <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-300">⏳ Rare</span>
              <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-300">📦 Wholesale</span>
              <span className="px-2 py-0.5 rounded-md bg-orange-100 text-orange-800 border border-orange-300">🍽️ Restaurant</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              Manual assignment locks the customer in that tier until reverted back to Auto.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleRecalculateOnly}
              disabled={recalculateMutation.isPending}
              className="px-3.5 py-2 rounded-xl border border-gray-300 dark:border-border-subtle bg-white dark:bg-surface-card hover:bg-gray-100 font-extrabold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Force recalculate tier segments for all customers without changing rules"
            >
              <RefreshCw size={13} className={recalculateMutation.isPending ? 'animate-spin' : ''} />
              <span>Recalculate All</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-gray-300 dark:border-border-subtle text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-100 cursor-pointer"
              >
                Close
              </button>

              <button
                type="submit"
                disabled={updateSettingsMutation.isPending}
                className="px-5 py-2 rounded-xl bg-[#0d6e53] hover:bg-[#0a5842] text-white font-black text-xs shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckCircle2 size={14} />
                <span>Save & Apply Criteria</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
