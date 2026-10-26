import React from 'react';
import { X, RotateCcw, AlertTriangle, CheckCircle2, ShoppingBag, ArrowRight } from 'lucide-react';
import { useRepeatOrder } from '../hooks/useCustomers';
import { RepeatOrderItem } from '../types/customer.types';

interface RepeatOrderModalProps {
  customerId: number | null;
  customerName: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirmAddItems: (items: RepeatOrderItem[]) => void;
}

export default function RepeatOrderModal({
  customerId,
  customerName,
  isOpen,
  onClose,
  onConfirmAddItems,
}: RepeatOrderModalProps) {
  const { data: repeatData, isLoading } = useRepeatOrder(customerId);

  if (!isOpen || !customerId) return null;

  const items = repeatData?.items || [];
  const warnings = repeatData?.warnings || [];
  const hasUnavailable = items.some(i => !i.is_available);
  const availableItems = items.filter(i => i.is_available);

  const handleConfirm = () => {
    if (availableItems.length === 0) return;
    onConfirmAddItems(availableItems);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-100">
      <div className="w-full max-w-lg bg-white dark:bg-surface-card rounded-2xl shadow-2xl border border-gray-200 dark:border-border-subtle overflow-hidden flex flex-col max-h-[85vh]">
        {/* ── Modal Header ── */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-border-subtle flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#0d6e53] dark:text-emerald-400 flex items-center justify-center">
              <RotateCcw size={16} />
            </div>
            <div>
              <h3 className="font-black text-sm text-gray-900 dark:text-white">
                Repeat Last Order: {customerName}
              </h3>
              <p className="text-[11px] text-gray-400">
                {repeatData?.lastInvoice 
                  ? `Invoice #${repeatData.lastInvoice.invoice_number} • ${repeatData.lastInvoice.created_at.split(' ')[0]}`
                  : 'Propose items from previous bill'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1 rounded-lg"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Warnings Banner (Price changes or Out of Stock) ── */}
        {warnings.length > 0 && (
          <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 px-5 py-2.5 space-y-1">
            <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-bold text-xs">
              <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <span>Price or availability changes detected:</span>
            </div>
            <ul className="text-[11px] text-amber-700 dark:text-amber-400 list-disc list-inside space-y-0.5">
              {warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* ── Content / Proposed Items ── */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {isLoading ? (
            <div className="py-8 text-center text-gray-400 text-xs">
              Fetching last order items and checking live prices...
            </div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-xs">
              No previous completed order items found for this customer.
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-border-subtle border border-gray-100 dark:border-border-subtle rounded-xl overflow-hidden">
              {items.map(item => {
                const isPriceChanged = item.price_changed;
                const priceDiff = item.price_diff_paise;

                return (
                  <div
                    key={item.product_variant_id}
                    className={`p-3 flex items-center justify-between text-xs transition-colors ${
                      !item.is_available 
                        ? 'bg-gray-50/70 dark:bg-gray-900/40 opacity-60' 
                        : isPriceChanged 
                          ? 'bg-amber-50/40 dark:bg-amber-950/20' 
                          : 'bg-white dark:bg-surface-card'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-gray-900 dark:text-white">
                          {item.product_name}
                        </span>
                        <span className="text-[10px] text-gray-500 font-medium">
                          ({item.variant_name})
                        </span>
                        {!item.is_available && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-600">
                            Unavailable
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 font-mono mt-0.5">
                        Quantity: <strong>{item.display_qty}</strong>
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-black text-xs text-gray-900 dark:text-white">
                        ₹{(item.current_rate_paise / 100).toFixed(2)}
                      </div>
                      {isPriceChanged && (
                        <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                          {priceDiff > 0 ? `+₹${(priceDiff / 100).toFixed(0)}` : `-₹${(Math.abs(priceDiff) / 100).toFixed(0)}`} from previous
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Modal Footer ── */}
        <div className="px-5 py-3.5 bg-gray-50 dark:bg-surface-panel border-t border-gray-100 dark:border-border-subtle flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-card text-gray-700 dark:text-gray-300 text-xs font-bold hover:bg-gray-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={availableItems.length === 0}
            onClick={handleConfirm}
            className="px-5 py-2 rounded-xl bg-[#0d6e53] hover:bg-[#0a5641] disabled:opacity-50 text-white text-xs font-black flex items-center gap-1.5 shadow-sm active:scale-[0.99] transition-all cursor-pointer"
          >
            <span>Confirm & Add to Bill</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
