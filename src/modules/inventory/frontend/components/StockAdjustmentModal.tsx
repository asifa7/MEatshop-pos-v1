import React, { useState, useEffect } from 'react';
import { X, Settings as AdjustIcon, CheckCircle2 } from 'lucide-react';
import { useStockStatus, useAdjustStock } from '../hooks/useInventory';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialVariantId?: number | null;
  preselectedVariantId?: number | null;
  onSuccess?: () => void;
}

export default function StockAdjustmentModal({ isOpen, onClose, initialVariantId, preselectedVariantId, onSuccess }: StockAdjustmentModalProps) {
  const { data: stocks } = useStockStatus();
  const adjustMutation = useAdjustStock();

  const [selectedVariantId, setSelectedVariantId] = useState<string>('');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const effectiveVariantId = initialVariantId ?? preselectedVariantId;

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccess(false);
      setAdjustQty('');
      setAdjustReason('');
      if (effectiveVariantId) {
        setSelectedVariantId(String(effectiveVariantId));
      } else if (stocks && stocks.length > 0) {
        setSelectedVariantId(String(stocks[0].product_variant_id));
      }
    }
  }, [isOpen, initialVariantId, stocks]);

  if (!isOpen) return null;

  const selectedItem = stocks?.find(s => s.product_variant_id === parseInt(selectedVariantId));
  const isWeight = selectedItem?.unit_type === 'weight';
  const currentQty = selectedItem ? (isWeight ? (selectedItem.quantity_grams ?? 0) / 1000 : (selectedItem.quantity_units ?? 0)) : 0;
  const unitLabel = isWeight ? 'kg' : 'pcs';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!selectedVariantId) {
      setError('Please select a product variant');
      return;
    }
    const qtyVal = parseFloat(adjustQty);
    if (isNaN(qtyVal) || qtyVal === 0) {
      setError('Please enter a valid non-zero quantity');
      return;
    }
    if (!adjustReason.trim()) {
      setError('Reason is mandatory for adjustments.');
      return;
    }

    let adjType = qtyVal > 0 ? 'stock_in' : 'stock_out';
    const lowerReason = adjustReason.toLowerCase();
    if (qtyVal < 0) {
      if (lowerReason.includes('wastage') || lowerReason.includes('spoilage') || lowerReason.includes('dead')) {
        adjType = 'wastage';
      } else if (lowerReason.includes('damage')) {
        adjType = 'damage';
      }
    }

    const absQtyVal = Math.abs(qtyVal);

    try {
      await adjustMutation.mutateAsync({
        product_variant_id: parseInt(selectedVariantId),
        adjustment_type: adjType as any,
        quantity_grams: isWeight ? Math.round(absQtyVal * 1000) : null,
        quantity_units: !isWeight ? Math.round(absQtyVal) : null,
        reason: adjustReason.trim(),
      });

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to apply stock adjustment');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-panel border border-border-subtle rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/15 flex items-center justify-center text-brand-500">
              <AdjustIcon size={18} />
            </div>
            <div>
              <h2 className="font-bold text-sm text-text-primary">Stock Adjustment & Wastage Log</h2>
              <p className="text-[11px] text-text-muted">Record stock in, stock out, damage, or wastage with full audit logging.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-card text-text-muted hover:text-text-primary transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Select Variant */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Select Product Item *</label>
            <select
              value={selectedVariantId}
              onChange={e => setSelectedVariantId(e.target.value)}
              className="w-full bg-surface-app border border-border-subtle rounded-xl px-3 py-2 text-xs font-semibold text-text-primary outline-none focus:border-brand-500"
            >
              {(stocks || []).map(s => (
                  <option key={s.product_variant_id} value={s.product_variant_id}>
                    {s.product_name} - {s.variant_name} ({s.unit_type === 'live_dual' ? `${s.quantity_count ?? 0} pcs / ${((s.quantity_grams ?? 0)/1000).toFixed(2)} kg` : s.unit_type === 'weight' ? `${((s.quantity_grams ?? 0)/1000).toFixed(2)} kg` : `${s.quantity_units ?? 0} pcs`})
                  </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Current Stock</label>
              <div className="w-full bg-surface-app border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono font-bold text-text-secondary">
                {currentQty.toFixed(isWeight ? 3 : 0)} {unitLabel}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Quantity to Adjust *</label>
              <div className="relative">
                <input
                  type="number"
                  step={isWeight ? '0.001' : '1'}
                  value={adjustQty}
                  onChange={e => setAdjustQty(e.target.value)}
                  placeholder={`Use '-' for deductions e.g. -5`}
                  required
                  className="w-full bg-surface-app border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono font-bold text-text-primary placeholder-text-muted outline-none focus:border-brand-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">Reason *</label>
            <select
              value={adjustReason}
              onChange={e => setAdjustReason(e.target.value)}
              className="w-full bg-surface-app border border-border-subtle rounded-xl px-3 py-2 text-xs font-semibold text-text-primary outline-none focus:border-brand-500"
            >
              <option value="">Select Reason...</option>
              <option value="Correction">Correction</option>
              <option value="Wastage">Wastage</option>
              <option value="Spoilage">Spoilage</option>
              <option value="Dead Stock">Dead Stock</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {error && <div className="px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-400 font-medium">{error}</div>}
          {success && <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-400 font-semibold flex items-center gap-1.5"><CheckCircle2 size={14} /> Stock adjustment recorded successfully!</div>}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border-subtle text-xs font-semibold text-text-secondary hover:bg-surface-card transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={adjustMutation.isPending}
              className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-brand-500/20"
            >
              {adjustMutation.isPending ? 'Saving...' : 'Apply Stock Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
