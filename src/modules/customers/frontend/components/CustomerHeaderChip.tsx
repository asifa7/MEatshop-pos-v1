import React from 'react';
import { User, X, ShoppingBag, Clock, Sparkles, RotateCcw, AlertCircle } from 'lucide-react';
import { Customer } from '../types/customer.types';

interface CustomerHeaderChipProps {
  customer: Customer | null;
  intelligence?: any;
  onOpenSearch: () => void;
  onClearCustomer: () => void;
  onOpenRepeatOrder?: () => void;
  allowedToSeeCredit?: boolean;
}

export default function CustomerHeaderChip({
  customer,
  intelligence,
  onOpenSearch,
  onClearCustomer,
  onOpenRepeatOrder,
  allowedToSeeCredit = true,
}: CustomerHeaderChipProps) {
  if (!customer) {
    return (
      <button
        type="button"
        onClick={onOpenSearch}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white dark:bg-surface-card border border-gray-200 dark:border-border-subtle text-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-gray-50 dark:hover:bg-surface-panel shadow-2xs transition-all cursor-pointer active:scale-95"
        title="Click to select or search customer (F2)"
      >
        <User size={13} className="text-gray-400" />
        <span>Walk-in Customer</span>
      </button>
    );
  }

  const isDue = (customer.outstanding_balance_paise || 0) > 0;
  const isVip = customer.customer_segment === 'VIP' || (intelligence?.customer_segment === 'VIP');
  const segment = customer.customer_segment || intelligence?.customer_segment || 'Regular';

  return (
    <div className="flex items-center gap-1.5 bg-white dark:bg-surface-card border border-emerald-300 dark:border-emerald-800/60 rounded-full pl-2 pr-1.5 py-0.5 shadow-2xs">
      <div 
        onClick={onOpenSearch} 
        className="flex items-center gap-1.5 cursor-pointer hover:opacity-80"
        title="Click to change customer"
      >
        <div className="w-5 h-5 rounded-full bg-[#0d6e53] text-white flex items-center justify-center text-[10px] font-black">
          {customer.name.slice(0, 1).toUpperCase()}
        </div>

        <span className="font-black text-gray-900 dark:text-white text-xs max-w-[140px] truncate">
          {customer.name}
        </span>

        {isVip && (
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
            VIP
          </span>
        )}

        {isDue && allowedToSeeCredit && (
          <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
            Due ₹{((customer.outstanding_balance_paise || 0) / 100).toFixed(0)}
          </span>
        )}
      </div>

      {/* Clear/Unlink Button (Never blocks billing) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClearCustomer();
        }}
        className="text-gray-400 hover:text-red-500 p-0.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="Clear customer (Revert to Walk-in)"
      >
        <X size={12} />
      </button>
    </div>
  );
}

/**
 * One-line Customer Context Banner displayed under header when customer is linked (Section 9)
 */
export function CustomerContextBanner({
  customer,
  intelligence,
  onOpenRepeatOrder,
  allowedToSeeCredit = true,
}: {
  customer: Customer | null;
  intelligence?: any;
  onOpenRepeatOrder?: () => void;
  allowedToSeeCredit?: boolean;
}) {
  if (!customer) return null;

  const lastVisit = intelligence?.last_purchase_date 
    ? `Last visit ${intelligence.days_since_last_purchase === 0 ? 'Today' : intelligence.days_since_last_purchase === 1 ? 'Yesterday' : `${intelligence.days_since_last_purchase}d ago`}`
    : 'New customer';

  const usualOrder = intelligence?.typical_basket_summary || customer.preferred_cut || '';
  const cuttingPref = customer.cutting_preference || customer.special_instructions || '';
  const isDue = (customer.outstanding_balance_paise || 0) > 0;

  return (
    <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-[11px] text-emerald-900 dark:text-emerald-200 animate-in fade-in duration-100">
      <div className="flex items-center gap-3 overflow-hidden">
        <span className="font-bold shrink-0 flex items-center gap-1 text-[#0d6e53] dark:text-emerald-400">
          <Clock size={11} />
          {lastVisit}
        </span>

        {usualOrder && (
          <span className="text-gray-600 dark:text-gray-300 truncate flex items-center gap-1">
            <ShoppingBag size={11} className="shrink-0 text-gray-400" />
            <strong className="font-medium">Usual:</strong> {usualOrder}
          </span>
        )}

        {cuttingPref && (
          <span className="text-gray-600 dark:text-gray-300 truncate hidden md:flex items-center gap-1">
            <strong className="font-medium">Cut:</strong> {cuttingPref}
          </span>
        )}

        {isDue && allowedToSeeCredit && (
          <span className="text-red-600 dark:text-red-400 font-extrabold shrink-0">
            • Udhaar Due: ₹{((customer.outstanding_balance_paise || 0) / 100).toFixed(0)}
          </span>
        )}
      </div>

      {onOpenRepeatOrder && (
        <button
          type="button"
          onClick={onOpenRepeatOrder}
          className="shrink-0 ml-2 px-2.5 py-0.5 rounded-lg bg-white dark:bg-surface-card hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-[#0d6e53] dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-700 text-[10px] flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
          title="Review and repeat customer's previous items"
        >
          <RotateCcw size={10} />
          <span>Repeat Last Order</span>
        </button>
      )}
    </div>
  );
}
