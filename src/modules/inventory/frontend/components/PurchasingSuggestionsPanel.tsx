import { AlertTriangle, PackageCheck, Flame } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useStockStatus } from '../hooks/useInventory';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { formatQty, roundQty, getStockStatus, unitsToTraysAndPieces } from '../../../../core/shared/math';

export default function PurchasingSuggestionsPanel({ onQuickFilterLow }: { onQuickFilterLow?: () => void }) {
  const { data: stocks, isLoading } = useStockStatus();

  const { data: allPoolSummaries } = useQuery({
    queryKey: ['animal-pool-summaries-all'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_ANIMAL_POOL_SUMMARY, { animal_key: 'all' });
      if (!res.success) return {};
      return res.data || {};
    },
  });

  if (isLoading) {
    return (
      <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-subtle text-text-muted text-xs flex items-center justify-center">
        Checking current stock levels...
      </div>
    );
  }

  // Filter items that are low in stock (below their safety threshold or <= 0)
  // Ensure Mutton at 0.000 kg and any tracked item at 0 always appear as CRITICAL
  const lowStockItems: Array<{
    key: string;
    name: string;
    variantName?: string;
    category: string;
    currentQtyStr: string;
    thresholdStr: string;
    isCritical: boolean;
  }> = [];

  const seenMutton = new Set<string>();

  for (const s of (stocks || [])) {
    if (s.track_in_inventory === 0 || s.is_inventory_tracked === 0) continue;
    // Only OWN products are purchased; LINKED cuts draw from parent live stock
    if (s.stock_mode && s.stock_mode !== 'OWN') continue;

    const isMutton =
      (s.product_name || '').toLowerCase().includes('mutton') ||
      (s.category || '').toLowerCase().includes('mutton');
    const isEgg = (s.category || '').toLowerCase() === 'eggs' || (s.product_name || '').toLowerCase().includes('egg');

    const isWeight = s.unit_type === 'weight' || s.unit_type === 'live_dual';
    const currentRaw = isWeight ? ((s.quantity_grams ?? 0) / 1000) : (s.quantity_units ?? 0);
    const currentVal = roundQty(currentRaw, 3);
    const defaultThreshold = isWeight ? 5 : 10;
    const thresholdRaw = isWeight
      ? ((s.safety_threshold_grams && s.safety_threshold_grams > 0 ? s.safety_threshold_grams : defaultThreshold * 1000) / 1000)
      : (s.safety_threshold_units && s.safety_threshold_units > 0 ? s.safety_threshold_units : defaultThreshold);
    const thresholdVal = roundQty(thresholdRaw, 3);

    const statusInfo = getStockStatus(currentVal, thresholdVal);

    if (statusInfo.isPurchasingAlert) {
      if (isMutton) seenMutton.add(s.product_name.toLowerCase());
      const unitStr = isWeight ? 'kg' : 'pcs';
      const qtyStr = isEgg 
        ? unitsToTraysAndPieces(currentVal).display
        : `${formatQty(currentVal, { minDecimals: isWeight ? 2 : 0 })} ${unitStr}`;

      lowStockItems.push({
        key: `var-${s.product_variant_id}`,
        name: s.product_name,
        variantName: s.variant_name && s.variant_name !== 'Standard' && s.variant_name !== s.product_name ? s.variant_name : undefined,
        category: s.category || 'General',
        currentQtyStr: qtyStr,
        thresholdStr: isEgg ? `${thresholdVal} pcs (${roundQty(thresholdVal / 30, 1)} trays)` : `${formatQty(thresholdVal)} ${unitStr}`,
        isCritical: statusInfo.status === 'OUT_OF_STOCK' || statusInfo.status === 'CRITICAL' || currentVal <= 0,
      });
    }
  }

  // Also check Mutton live pool if not already added
  const muttonPool = (allPoolSummaries as any)?.mutton;
  const muttonLiveKg = roundQty(muttonPool?.total_live_weight_kg ?? 0, 3);
  if (muttonLiveKg <= 0 && seenMutton.size === 0) {
    lowStockItems.unshift({
      key: 'pool-mutton',
      name: 'Mutton (Goat/Sheep)',
      category: 'Mutton',
      currentQtyStr: '0.00 kg',
      thresholdStr: '5 kg',
      isCritical: true,
    });
  }

  // Sort critical (<= 0) items first, with Mutton prioritized at top
  lowStockItems.sort((a, b) => {
    const aMutton = a.name.toLowerCase().includes('mutton') ? 1 : 0;
    const bMutton = b.name.toLowerCase().includes('mutton') ? 1 : 0;
    if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
    if (aMutton !== bMutton) return bMutton - aMutton;
    return a.name.localeCompare(b.name);
  });

  if (lowStockItems.length === 0) {
    return (
      <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-subtle flex items-center justify-between">
        <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs">
          <PackageCheck size={16} />
          <span>Stock Levels Optimal — All tracked items exceed their safety thresholds.</span>
        </div>
      </div>
    );
  }

  const criticalCount = lowStockItems.filter(i => i.isCritical).length;

  return (
    <div className="bg-surface-panel border border-amber-500/30 rounded-2xl p-4 shadow-subtle space-y-3">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-subtle pb-2.5">
        <div>
          <h3 className="text-sm font-black text-text-primary flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={16} />
            <span>Purchasing Reminder: Low Stock / Reorder Items ({lowStockItems.length})</span>
            {criticalCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-red-500/15 text-red-500 border border-red-500/30 flex items-center gap-1">
                <Flame size={11} /> {criticalCount} Critical (0 Stock)
              </span>
            )}
          </h3>
          <p className="text-text-muted text-[11px] mt-0.5">
            Items at or below their safety threshold. Critical zero-stock items (including Mutton at 0.00 kg) are highlighted first.
          </p>
        </div>
        {onQuickFilterLow && (
          <button
            type="button"
            onClick={onQuickFilterLow}
            className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-bold transition-colors cursor-pointer self-start sm:self-auto"
          >
            Filter Table to Low Stock
          </button>
        )}
      </div>

      {/* Grid of Low Stock / Critical Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto pr-1">
        {lowStockItems.map(item => (
          <div
            key={item.key}
            className={`rounded-xl p-2.5 border flex items-center justify-between gap-2 ${
              item.isCritical
                ? 'bg-red-500/10 border-red-500/30 text-text-primary'
                : 'bg-surface-card border-border-subtle text-text-primary'
            }`}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xs truncate">{item.name}</span>
                {item.isCritical ? (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-red-600 text-white shrink-0">
                    CRITICAL
                  </span>
                ) : (
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-500 shrink-0">
                    LOW
                  </span>
                )}
              </div>
              <div className="text-[10px] text-text-muted truncate">
                {item.variantName ? `${item.variantName} • ` : ''}{item.category} • Min: {item.thresholdStr}
              </div>
            </div>
            <div className="text-right shrink-0 font-mono">
              <span className={`text-xs font-black ${item.isCritical ? 'text-red-500' : 'text-amber-500'}`}>
                {item.currentQtyStr}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

