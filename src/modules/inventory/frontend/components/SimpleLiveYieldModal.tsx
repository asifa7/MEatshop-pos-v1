import React, { useState, useEffect } from 'react';
import { X, Scale, Bird, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';

interface SimpleLiveYieldModalProps {
  isOpen: boolean;
  onClose: () => void;
  poolSummary: {
    total_live_weight_grams: number;
    total_live_weight_kg: number;
    total_bird_count: number;
  };
  yieldSettings: {
    yield_enabled: boolean;
    track_liver_gizzard: boolean;
    whole_chicken_grams: number;
    liver_grams: number;
    gizzard_grams: number;
    custom_product_ratios?: Record<string, number>;
  };
}

export default function SimpleLiveYieldModal({
  isOpen,
  onClose,
  poolSummary,
  yieldSettings,
}: SimpleLiveYieldModalProps) {
  const queryClient = useQueryClient();

  const [liveWeightKg, setLiveWeightKg] = useState<string>('');
  const [birdCount, setBirdCount] = useState<string>('');
  const [wholeGramsOverride, setWholeGramsOverride] = useState<string>(String(yieldSettings?.whole_chicken_grams || 625));
  const [liverGramsOverride, setLiverGramsOverride] = useState<string>(String(yieldSettings?.liver_grams || 30));
  const [gizzardGramsOverride, setGizzardGramsOverride] = useState<string>(String(yieldSettings?.gizzard_grams || 40));
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setLiveWeightKg('');
      setBirdCount('');
      setWholeGramsOverride(String(yieldSettings?.whole_chicken_grams || 625));
      setLiverGramsOverride(String(yieldSettings?.liver_grams || 30));
      setGizzardGramsOverride(String(yieldSettings?.gizzard_grams || 40));
      setNotes('');
      setErrorMsg('');
    }
  }, [isOpen, yieldSettings]);

  const liveKg = parseFloat(liveWeightKg) || 0;
  const liveGrams = Math.round(liveKg * 1000);
  const countNum = parseInt(birdCount) || undefined;

  const wholeRate = parseFloat(wholeGramsOverride) || 0;
  const liverRate = yieldSettings.track_liver_gizzard ? (parseFloat(liverGramsOverride) || 0) : 0;
  const gizzardRate = yieldSettings.track_liver_gizzard ? (parseFloat(gizzardGramsOverride) || 0) : 0;

  const expectedWholeKg = (liveKg * (wholeRate / 1000));
  const expectedLiverKg = (liveKg * (liverRate / 1000));
  const expectedGizzardKg = (liveKg * (gizzardRate / 1000));

  const totalOutputGrams = Math.round(expectedWholeKg * 1000) + Math.round(expectedLiverKg * 1000) + Math.round(expectedGizzardKg * 1000);
  const totalOutputKg = totalOutputGrams / 1000;
  const unaccountedKg = Math.max(0, liveKg - totalOutputKg);

  const isOverStock = liveGrams > (poolSummary?.total_live_weight_grams || 0);

  const processMutation = useMutation({
    mutationFn: async () => {
      const res = await (window as any).api.invoke(IPC_CHANNELS.INVENTORY.PROCESS_SIMPLE_LIVE_YIELD, {
        live_weight_grams: liveGrams,
        bird_count: countNum,
        overrides: {
          whole_chicken_grams: wholeRate,
          liver_grams: liverRate,
          gizzard_grams: gizzardRate,
        },
        notes: notes || undefined,
      });
      if (!res.success) {
        throw new Error(res.error?.message || 'Processing live chicken failed');
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-chicken-pool-summary'] });
      queryClient.invalidateQueries({ queryKey: ['live-chicken-batches'] });
      queryClient.invalidateQueries({ queryKey: ['stock-status'] });
      queryClient.invalidateQueries({ queryKey: ['product_rates'] });
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to process live chicken yield');
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-surface-panel border border-border-subtle rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl text-text-primary flex flex-col max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center font-bold">
              <Bird size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold font-outfit text-text-primary">Process Live Chicken</h2>
              <p className="text-xs text-text-muted">
                Available in Shed: <span className="font-mono font-bold text-amber-400">{poolSummary?.total_live_weight_kg || 0} kg</span> · <span className="font-mono font-bold text-text-primary">{poolSummary?.total_bird_count || 0} birds</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400 flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Inputs */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">
                Live Weight to Process (kg) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0.1"
                  max={poolSummary?.total_live_weight_kg || 9999}
                  value={liveWeightKg}
                  onChange={(e) => setLiveWeightKg(e.target.value)}
                  placeholder="e.g. 10.00"
                  className="w-full bg-surface-base border border-border-subtle rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary focus:outline-none focus:border-amber-500"
                  autoFocus
                />
                <span className="absolute right-3 top-2.5 text-xs text-text-muted">kg</span>
              </div>
              {isOverStock && (
                <p className="text-[11px] text-rose-400 mt-1 font-medium">
                  Exceeds live stock ({poolSummary?.total_live_weight_kg || 0} kg available)
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1">
                Bird Count (Optional)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="1"
                  value={birdCount}
                  onChange={(e) => setBirdCount(e.target.value)}
                  placeholder="e.g. 5 birds"
                  className="w-full bg-surface-base border border-border-subtle rounded-xl px-3 py-2.5 text-sm font-mono text-text-primary focus:outline-none focus:border-amber-500"
                />
                <span className="absolute right-3 top-2.5 text-xs text-text-muted">birds</span>
              </div>
            </div>
          </div>

          {/* Ratios Override Section */}
          <div className="p-3.5 bg-surface-subtle/50 rounded-xl border border-border-subtle space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-text-secondary flex items-center gap-1.5">
                <Scale size={14} className="text-amber-400" />
                Yield Ratios for this Batch (grams per 1 kg live)
              </span>
              <button
                type="button"
                onClick={() => {
                  setWholeGramsOverride(String(yieldSettings?.whole_chicken_grams || 625));
                  setLiverGramsOverride(String(yieldSettings?.liver_grams || 30));
                  setGizzardGramsOverride(String(yieldSettings?.gizzard_grams || 40));
                }}
                className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw size={11} /> Reset defaults
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5 pt-1">
              <div>
                <label className="block text-[11px] text-text-muted mb-0.5">Whole Dressed (g)</label>
                <input
                  type="number"
                  value={wholeGramsOverride}
                  onChange={(e) => setWholeGramsOverride(e.target.value)}
                  className="w-full bg-surface-base border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] text-text-muted mb-0.5">Liver (g)</label>
                <input
                  type="number"
                  disabled={!yieldSettings.track_liver_gizzard}
                  value={liverGramsOverride}
                  onChange={(e) => setLiverGramsOverride(e.target.value)}
                  className="w-full bg-surface-base border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-amber-500 disabled:opacity-40"
                />
              </div>

              <div>
                <label className="block text-[11px] text-text-muted mb-0.5">Gizzard (g)</label>
                <input
                  type="number"
                  disabled={!yieldSettings.track_liver_gizzard}
                  value={gizzardGramsOverride}
                  onChange={(e) => setGizzardGramsOverride(e.target.value)}
                  className="w-full bg-surface-base border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-amber-500 disabled:opacity-40"
                />
              </div>
            </div>
          </div>

          {/* Expected Outputs Live Preview */}
          {liveKg > 0 && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
              <div className="text-xs font-bold text-amber-400 flex items-center justify-between">
                <span>Outputs Added to Stock:</span>
                <span className="font-mono">Total: {totalOutputKg.toFixed(2)} kg</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-surface-panel/80 p-2 rounded-lg border border-border-subtle">
                  <div className="text-[11px] text-text-muted">Whole Chicken</div>
                  <div className="font-bold font-mono text-emerald-400 mt-0.5">+{expectedWholeKg.toFixed(2)} kg</div>
                </div>
                {yieldSettings.track_liver_gizzard ? (
                  <>
                    <div className="bg-surface-panel/80 p-2 rounded-lg border border-border-subtle">
                      <div className="text-[11px] text-text-muted">Liver</div>
                      <div className="font-bold font-mono text-emerald-400 mt-0.5">+{expectedLiverKg.toFixed(2)} kg</div>
                    </div>
                    <div className="bg-surface-panel/80 p-2 rounded-lg border border-border-subtle">
                      <div className="text-[11px] text-text-muted">Gizzard</div>
                      <div className="font-bold font-mono text-emerald-400 mt-0.5">+{expectedGizzardKg.toFixed(2)} kg</div>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 bg-surface-panel/80 p-2 rounded-lg border border-border-subtle text-text-muted text-[11px] flex items-center">
                    Liver & Gizzard tracking is toggled OFF
                  </div>
                )}
              </div>
              {unaccountedKg > 0 && (
                <div className="text-[11px] text-text-muted text-right pt-0.5">
                  Wastage / Dressing Loss: <span className="font-mono font-medium">{unaccountedKg.toFixed(2)} kg</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Batch from Farm X processed for morning sale"
              className="w-full bg-surface-base border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={liveKg <= 0 || isOverStock || processMutation.isPending}
            onClick={() => processMutation.mutate()}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed font-bold text-xs text-slate-950 flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
          >
            {processMutation.isPending ? (
              <>Processing...</>
            ) : (
              <>
                Confirm & Process Stock
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
