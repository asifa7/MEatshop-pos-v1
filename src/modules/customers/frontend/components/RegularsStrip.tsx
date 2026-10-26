import React, { useState, useMemo } from 'react';
import { useCustomerRegulars } from '../hooks/useCustomers';
import { RegularCustomerTile } from '../types/customer.types';
import { 
  Sparkles, 
  Clock, 
  Crown, 
  UserCheck, 
  Sparkle, 
  Hourglass, 
  Building2, 
  UtensilsCrossed,
  Sun,
  Sunset,
  Sunrise,
  ChevronRight,
  ChevronLeft,
  Check
} from 'lucide-react';

interface RegularsStripProps {
  onSelectCustomer: (customer: RegularCustomerTile) => void;
  selectedCustomerId?: number | null;
}

type SegmentTab = 'all' | 'regular' | 'vip' | 'new' | 'rare' | 'wholesale' | 'restaurant';
type TimeFilter = 'all' | 'now' | 'morning' | 'afternoon' | 'evening';

export default function RegularsStrip({
  onSelectCustomer,
  selectedCustomerId,
}: RegularsStripProps) {
  const [segmentFilter, setSegmentFilter] = useState<SegmentTab>('all');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [viewLayout, setViewLayout] = useState<'grid' | 'carousel'>('carousel');

  const { data: regulars = [], isLoading } = useCustomerRegulars(24, segmentFilter, timeFilter);

  // Compute current local time slot for live UI indicator
  const currentSlot = useMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'morning';
    if (h >= 12 && h < 17) return 'afternoon';
    return 'evening';
  }, []);

  const slotLabels = {
    morning: { label: 'Morning Slot', icon: Sunrise, color: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300' },
    afternoon: { label: 'Afternoon Slot', icon: Sun, color: 'text-orange-600 bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300' },
    evening: { label: 'Evening Rush', icon: Sunset, color: 'text-indigo-600 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300' },
  };

  const CurrentSlotIcon = slotLabels[currentSlot].icon;

  // Background color palette for initials avatar
  const avatarColors = [
    'bg-emerald-600 text-white',
    'bg-blue-600 text-white',
    'bg-indigo-600 text-white',
    'bg-amber-600 text-white',
    'bg-teal-600 text-white',
    'bg-rose-600 text-white',
  ];

  const getTierBadge = (segment: string) => {
    const s = segment.toLowerCase();
    if (s === 'vip') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[9px] font-black bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60">
          <Crown size={9} className="text-amber-600" /> VIP
        </span>
      );
    }
    if (s === 'wholesale') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[9px] font-black bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-300/60">
          <Building2 size={9} /> Wholesale
        </span>
      );
    }
    if (s === 'restaurant') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[9px] font-black bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-300/60">
          <UtensilsCrossed size={9} /> Resto
        </span>
      );
    }
    if (s === 'rare') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[9px] font-black bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-300/60">
          <Hourglass size={9} /> Rare
        </span>
      );
    }
    if (s === 'new') {
      return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[9px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300/60">
          <Sparkle size={9} /> New
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md text-[9px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/60">
        <UserCheck size={9} /> Regular
      </span>
    );
  };

  const getTimeBadge = (slot: string, isMatch: boolean) => {
    if (slot === 'morning') {
      return (
        <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.2 rounded ${
          isMatch ? 'text-amber-700 bg-amber-100 font-extrabold ring-1 ring-amber-400' : 'text-gray-500 bg-gray-100 dark:bg-surface-card'
        }`}>
          🌅 Morning
        </span>
      );
    }
    if (slot === 'afternoon') {
      return (
        <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.2 rounded ${
          isMatch ? 'text-orange-700 bg-orange-100 font-extrabold ring-1 ring-orange-400' : 'text-gray-500 bg-gray-100 dark:bg-surface-card'
        }`}>
          ☀️ Afternoon
        </span>
      );
    }
    if (slot === 'evening') {
      return (
        <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.2 rounded ${
          isMatch ? 'text-indigo-700 bg-indigo-100 font-extrabold ring-1 ring-indigo-400' : 'text-gray-500 bg-gray-100 dark:bg-surface-card'
        }`}>
          🌙 Evening
        </span>
      );
    }
    return null;
  };

  return (
    <div className="w-full bg-white dark:bg-surface-card border border-gray-200 dark:border-border-subtle rounded-2xl p-3 space-y-2.5 shadow-sm transition-all">
      {/* ── Top Bar: Title & Store Time Indicator ── */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-md bg-[#0d6e53]/10 text-[#0d6e53] flex items-center justify-center shrink-0">
            <Sparkles size={12} />
          </div>
          <span className="font-black text-xs text-gray-900 dark:text-white truncate">Smart Customers</span>
        </div>

        {/* Live Slot Status Pill */}
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-black shrink-0 ${slotLabels[currentSlot].color}`}>
          <CurrentSlotIcon size={11} className="shrink-0 animate-pulse" />
          <span>{slotLabels[currentSlot].label}</span>
        </div>
      </div>

      {/* ── Time Quick-Filter Pills ── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px] font-bold">
        <button
          type="button"
          onClick={() => setTimeFilter('all')}
          className={`px-2 py-0.8 rounded-lg cursor-pointer whitespace-nowrap transition-all ${
            timeFilter === 'all'
              ? 'bg-[#0d6e53] text-white font-black shadow-xs'
              : 'bg-gray-100 dark:bg-surface-panel text-gray-600 dark:text-gray-300 hover:bg-gray-200'
          }`}
          title="All customers sorted with current time matching first"
        >
          ⏰ Smart Now
        </button>
        <button
          type="button"
          onClick={() => setTimeFilter('morning')}
          className={`px-2 py-0.8 rounded-lg cursor-pointer whitespace-nowrap transition-all flex items-center gap-1 ${
            timeFilter === 'morning'
              ? 'bg-amber-600 text-white font-black shadow-xs'
              : 'bg-gray-100 dark:bg-surface-panel text-gray-600 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          🌅 Morning
        </button>
        <button
          type="button"
          onClick={() => setTimeFilter('afternoon')}
          className={`px-2 py-0.8 rounded-lg cursor-pointer whitespace-nowrap transition-all flex items-center gap-1 ${
            timeFilter === 'afternoon'
              ? 'bg-orange-600 text-white font-black shadow-xs'
              : 'bg-gray-100 dark:bg-surface-panel text-gray-600 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          ☀️ Noon
        </button>
        <button
          type="button"
          onClick={() => setTimeFilter('evening')}
          className={`px-2 py-0.8 rounded-lg cursor-pointer whitespace-nowrap transition-all flex items-center gap-1 ${
            timeFilter === 'evening'
              ? 'bg-indigo-600 text-white font-black shadow-xs'
              : 'bg-gray-100 dark:bg-surface-panel text-gray-600 dark:text-gray-300 hover:bg-gray-200'
          }`}
        >
          🌙 Evening
        </button>
      </div>

      {/* ── Segment Filter Bar (No Udhaar Due, includes Regular, VIP, New, Rare, Wholesale, Restaurant) ── */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px] font-bold border-t border-gray-100 dark:border-border-subtle pt-1.5">
        {(['all', 'regular', 'vip', 'new', 'rare', 'wholesale', 'restaurant'] as const).map(tab => {
          const isActive = segmentFilter === tab;
          const labelMap: Record<SegmentTab, string> = {
            all: 'ALL',
            regular: 'REGULAR',
            vip: '⭐ VIP',
            new: 'NEW',
            rare: 'RARE',
            wholesale: 'WHOLESALE',
            restaurant: 'RESTO',
          };

          return (
            <button
              key={tab}
              type="button"
              onClick={() => setSegmentFilter(tab)}
              className={`px-2 py-0.8 rounded-md transition-all cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-black shadow-xs'
                  : 'bg-gray-50 dark:bg-surface-panel text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100'
              }`}
            >
              {labelMap[tab]}
            </button>
          );
        })}
      </div>

      {/* ── Big, High-Visibility Usable Tiles ── */}
      {isLoading ? (
        <div className="py-6 text-center text-gray-400 text-xs font-medium animate-pulse">
          Analyzing customers & time habits...
        </div>
      ) : regulars.length === 0 ? (
        <div className="py-6 text-center text-gray-400 text-xs">
          No matching customers in this filter
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* Scrollable Container with Comfortable Cards */}
          <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
            {regulars.map((r, i) => {
              const isSelected = r.id === selectedCustomerId;
              const hasDue = r.outstanding_balance_paise > 0;
              const colorClass = avatarColors[i % avatarColors.length];

              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onSelectCustomer(r)}
                  className={`min-w-[175px] max-w-[195px] p-2.5 rounded-xl border text-left cursor-pointer transition-all shrink-0 flex flex-col justify-between select-none relative group ${
                    isSelected
                      ? 'border-2 border-[#0d6e53] bg-emerald-50/80 dark:bg-emerald-950/50 shadow-md ring-1 ring-[#0d6e53]'
                      : r.is_time_match
                      ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50/40 dark:bg-surface-panel hover:border-[#0d6e53] hover:bg-white dark:hover:bg-surface-card shadow-xs'
                      : 'border-gray-200 dark:border-border-subtle bg-gray-50/70 dark:bg-surface-panel hover:border-emerald-400 hover:bg-white dark:hover:bg-surface-card shadow-2xs'
                  }`}
                  title={`${r.name} • ${r.segment} • ${r.visit_count} visits • ₹${(r.total_spend_paise / 100).toFixed(0)} • Usual: ${r.usual_item_summary || 'N/A'}`}
                >
                  {/* Selected Tick Indicator */}
                  {isSelected && (
                    <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#0d6e53] text-white flex items-center justify-center shadow-xs">
                      <Check size={10} strokeWidth={3} />
                    </div>
                  )}

                  {/* Card Top: Avatar, Name & Phone */}
                  <div className="flex items-start gap-2 min-w-0">
                    <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center text-xs font-black shrink-0 shadow-2xs`}>
                      {r.initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="font-black text-xs text-gray-900 dark:text-white truncate group-hover:text-[#0d6e53] transition-colors">
                        {r.name}
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 font-mono truncate">
                        {r.phone || r.phone_normalized || r.customer_code}
                      </p>
                    </div>
                  </div>

                  {/* Card Middle: Badges (Tier & Time) */}
                  <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                    {getTierBadge(r.segment)}
                    {getTimeBadge(r.usual_time_slot, r.is_time_match)}
                  </div>

                  {/* Card Bottom: Visits, Spend & Balance */}
                  <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-gray-100 dark:border-border-subtle text-[10px]">
                    <span className="font-extrabold text-gray-700 dark:text-gray-300">
                      {r.visit_count} {r.visit_count === 1 ? 'visit' : 'visits'}
                    </span>

                    {hasDue ? (
                      <span className="font-black text-red-600 bg-red-50 dark:bg-red-950/40 px-1 rounded">
                        ₹{(r.outstanding_balance_paise / 100).toFixed(0)} due
                      </span>
                    ) : r.total_spend_paise > 0 ? (
                      <span className="font-bold text-gray-500 dark:text-gray-400 font-mono">
                        ₹{(r.total_spend_paise / 100).toFixed(0)}
                      </span>
                    ) : (
                      <span className="text-gray-400">Fresh</span>
                    )}
                  </div>

                  {/* Usual item preview if exists */}
                  {r.usual_item_summary && (
                    <div className="mt-1 text-[9px] text-emerald-800 dark:text-emerald-300 font-medium truncate bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 rounded">
                      + {r.usual_item_summary}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <p className="text-[9px] text-gray-400 text-center font-medium">
            Showing smart picks matching your store schedule • Click to select
          </p>
        </div>
      )}
    </div>
  );
}
