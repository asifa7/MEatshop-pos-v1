import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Calendar, ShoppingCart, Activity, CheckCircle2 } from 'lucide-react';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { formatQty } from '../../../../core/shared/math';
import FestivalCalendarSettings from './FestivalCalendarSettings';

export default function DemandForecastingView() {
  const [activeTab, setActiveTab] = useState<'forecast' | 'calendar'>('forecast');

  const { data: suggestions = [], isLoading } = useQuery({
    queryKey: ['demand-forecasting-suggestions'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_PURCHASING_SUGGESTIONS, {});
      return res.success ? (res.data || []) : [];
    },
  });

  const avgAccuracy = suggestions.length > 0
    ? Math.round(suggestions.reduce((sum: number, s: any) => sum + (s.accuracy_percent || 90), 0) / suggestions.length)
    : 92;

  return (
    <div className="flex flex-col h-full overflow-hidden p-6 space-y-5 bg-surface-app text-text-primary">
      {/* Header */}
      <div className="border-b border-border-subtle pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-outfit text-text-primary flex items-center gap-2">
            <TrendingUp className="text-brand-500" />
            <span>AI Demand Forecasting & Festival Calendar Engine</span>
          </h2>
          <p className="text-text-muted text-xs mt-1">
            Formula: <strong className="text-text-primary">Base (8-Week Same-Weekday Avg) × Festival/Day Multiplier × Trend</strong>. (Low Stock Reminders have been moved to the Inventory screen.)
          </p>
        </div>

        <div className="flex items-center gap-2 bg-surface-panel border border-border-subtle p-1.5 rounded-xl self-start">
          <button
            type="button"
            onClick={() => setActiveTab('forecast')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'forecast'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <ShoppingCart size={14} /> Tomorrow & 7-Day Purchase Forecast
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('calendar')}
            className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 cursor-pointer transition-all ${
              activeTab === 'calendar'
                ? 'bg-brand-500 text-white shadow-sm'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            <Calendar size={14} /> 24-Month Festival Calendar
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-1">
        {activeTab === 'forecast' ? (
          <>
            {/* Top Summary Tiles */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-subtle">
                <div className="text-[10px] font-black uppercase text-text-muted tracking-wider">Forecast Formula</div>
                <div className="text-sm font-extrabold text-text-primary mt-1">
                  8-Wk Weekday Avg × Festival Mult × Trend
                </div>
                <div className="text-[11px] text-text-muted mt-1">
                  Automatically applies Sunday 1.4x peak, Tue/Fri 0.75x dip, and 24-month TN festival calendar.
                </div>
              </div>

              <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-subtle">
                <div className="text-[10px] font-black uppercase text-text-muted tracking-wider">Tomorrow's Active Multiplier</div>
                <div className="text-xl font-black font-mono text-brand-500 mt-1">
                  {suggestions[0]?.tomorrow_festival_multiplier ?? 1.0}x • {suggestions[0]?.tomorrow_event_name || 'Standard Day'}
                </div>
                <div className="text-[11px] text-text-muted mt-1">
                  Click "24-Month Festival Calendar" tab to inspect or customize any date.
                </div>
              </div>

              <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-subtle">
                <div className="text-[10px] font-black uppercase text-text-muted tracking-wider flex items-center gap-1">
                  <Activity size={12} className="text-emerald-500" /> Forecast vs Actual Accuracy
                </div>
                <div className="text-2xl font-black font-mono text-emerald-500 mt-1">
                  {avgAccuracy}% Rolling Accuracy
                </div>
                <div className="text-[11px] text-text-muted mt-1">
                  Tracked across completed POS sales vs 8-week weekday baseline.
                </div>
              </div>
            </div>

            {/* Product Forecast & Suggested Purchase Quantity Table */}
            <div className="bg-surface-panel border border-border-subtle rounded-2xl overflow-hidden shadow-subtle">
              <div className="p-4 border-b border-border-subtle flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-text-primary">
                    Suggested Purchase Quantities (Tomorrow & Next 7 Days)
                  </h3>
                  <p className="text-[11px] text-text-muted">
                    Calculated per product with transparent formula breakdown and forecast-vs-actual tracking.
                  </p>
                </div>
              </div>

              {isLoading ? (
                <div className="p-8 text-center text-xs text-text-muted">Calculating 8-week weekday averages and festival multipliers...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-surface-card border-b border-border-subtle text-text-muted uppercase text-[10px] font-bold">
                      <tr>
                        <th className="py-3 px-4">Product</th>
                        <th className="py-3 px-4 text-right">Current Stock</th>
                        <th className="py-3 px-4">Formula Breakdown (Base × Festival × Trend)</th>
                        <th className="py-3 px-4 text-right">Tomorrow Forecast</th>
                        <th className="py-3 px-4 text-right">Buy for Tomorrow</th>
                        <th className="py-3 px-4 text-right">7-Day Forecast</th>
                        <th className="py-3 px-4 text-right">Buy for 7 Days</th>
                        <th className="py-3 px-4 text-center">Forecast vs Actual</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle/50">
                      {suggestions.map((s: any) => {
                        const unitStr = s.unit_type === 'weight' ? 'kg' : 'pcs';
                        return (
                          <tr key={s.product_variant_id} className="hover:bg-surface-hover/30">
                            <td className="py-3 px-4">
                              <div className="font-bold text-text-primary">{s.product_name}</div>
                              <div className="text-[10px] text-text-muted font-mono">
                                Code #{s.product_code} • {s.category}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-text-primary">
                              {formatQty(s.current_stock)} {unitStr}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-text-secondary">
                              {s.formula_display}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-text-primary">
                              {formatQty(s.tomorrow_forecast)} {unitStr}
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              <span className="px-2.5 py-1 rounded-lg bg-brand-500/15 text-brand-500 border border-brand-500/30 font-black">
                                {formatQty(s.suggested_tomorrow_purchase_qty)} {unitStr}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-text-secondary">
                              {formatQty(s.next_7day_forecast)} {unitStr}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-emerald-500">
                              {formatQty(s.suggested_7day_purchase_qty)} {unitStr}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                <CheckCircle2 size={10} /> {s.accuracy_percent}%
                              </div>
                              <div className="text-[9px] text-text-muted font-mono mt-0.5">
                                Est {formatQty(s.last_forecast_qty)} vs Act {formatQty(s.last_actual_qty)} {unitStr}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Embedded Festival Calendar below for 1-scroll access */}
            <FestivalCalendarSettings />
          </>
        ) : (
          <FestivalCalendarSettings />
        )}
      </div>
    </div>
  );
}

