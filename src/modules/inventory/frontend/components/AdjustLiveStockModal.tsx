import React, { useState } from 'react';
import { X, Scale, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';

interface AdjustLiveStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  animalKey: string;
  animalName: string;
  currentKg: number;
  currentCount: number;
}

export default function AdjustLiveStockModal({
  isOpen,
  onClose,
  animalKey,
  animalName,
  currentKg,
  currentCount,
}: AdjustLiveStockModalProps) {
  const queryClient = useQueryClient();

  const [adjustmentType, setAdjustmentType] = useState<
    'mortality' | 'weight_loss' | 'count_correction' | 'staff_use' | 'other'
  >('mortality');
  const [direction, setDirection] = useState<'reduce' | 'add'>('reduce');
  const [weightKg, setWeightKg] = useState<string>('');
  const [count, setCount] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const adjustMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.ADJUST_LIVE_STOCK, payload);
      if (!res.success) throw new Error(res.error?.message || 'Failed to adjust live stock');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['animal-pool-summary'] });
      queryClient.invalidateQueries({ queryKey: ['animal-pool-summaries-all'] });
      queryClient.invalidateQueries({ queryKey: ['live-chicken-pool-summary'] });
      queryClient.invalidateQueries({ queryKey: ['stock-status'] });
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Error executing adjustment');
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const parsedKg = parseFloat(weightKg) || 0;
    const parsedCount = parseInt(count, 10) || 0;

    if (parsedKg === 0 && parsedCount === 0) {
      setErrorMsg('Please specify a weight (kg) or count quantity.');
      return;
    }

    const multiplier = direction === 'reduce' ? -1 : 1;
    const weightGramsDelta = Math.round(parsedKg * 1000) * multiplier;
    const countDelta = parsedCount * multiplier;

    adjustMutation.mutate({
      animal_key: animalKey,
      adjustment_type: adjustmentType,
      weight_grams_delta: weightGramsDelta,
      count_delta: countDelta,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-surface-card border border-border-subtle rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-panel">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
              <Scale size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Adjust Live Stock</h3>
              <p className="text-xs text-text-muted">{animalName} Shed Pool</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Current Pool Banner */}
          <div className="p-3 bg-surface-app border border-border-subtle rounded-xl flex items-center justify-between text-xs">
            <span className="text-text-muted">Current Live Pool:</span>
            <span className="font-mono font-bold text-text-primary">
              {currentKg.toFixed(2)} kg · {currentCount} count
            </span>
          </div>

          {/* Reason / Adjustment Type */}
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1.5">
              Adjustment Reason
            </label>
            <select
              value={adjustmentType}
              onChange={(e) => setAdjustmentType(e.target.value as any)}
              className="w-full px-3 py-2 bg-surface-app border border-border-subtle rounded-xl text-xs text-text-primary focus:outline-none focus:border-brand-500"
            >
              <option value="mortality">Mortality (Bird/Animal Loss)</option>
              <option value="weight_loss">Natural Weight Loss / Dehydration</option>
              <option value="count_correction">Count Correction (Physical Reconciliation)</option>
              <option value="staff_use">Staff / Internal Use</option>
              <option value="other">Other Adjustment</option>
            </select>
          </div>

          {/* Direction Toggle */}
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1.5">
              Direction
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('reduce')}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  direction === 'reduce'
                    ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-sm'
                    : 'bg-surface-app text-text-muted border-border-subtle hover:text-text-primary'
                }`}
              >
                - Reduce (Deduction/Loss)
              </button>
              <button
                type="button"
                onClick={() => setDirection('add')}
                className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                  direction === 'add'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-sm'
                    : 'bg-surface-app text-text-muted border-border-subtle hover:text-text-primary'
                }`}
              >
                + Add (Correction In)
              </button>
            </div>
          </div>

          {/* Weight & Count Inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1.5">
                Weight Change (kg)
              </label>
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="e.g. 1.850"
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
                className="w-full px-3 py-2 bg-surface-app border border-border-subtle rounded-xl text-xs font-mono text-text-primary focus:outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-text-secondary mb-1.5">
                Count Change
              </label>
              <input
                type="number"
                step="1"
                min="0"
                placeholder="e.g. 1"
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="w-full px-3 py-2 bg-surface-app border border-border-subtle rounded-xl text-xs font-mono text-text-primary focus:outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-text-secondary mb-1.5">
              Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Died in cage overnight"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-surface-app border border-border-subtle rounded-xl text-xs text-text-primary focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Footer Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adjustMutation.isPending}
              className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-subtle disabled:opacity-50"
            >
              {adjustMutation.isPending ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={13} />
                  <span>Confirm Adjustment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
