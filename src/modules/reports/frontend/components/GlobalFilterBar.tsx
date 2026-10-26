import React, { useState } from 'react';
import {
  Calendar,
  Filter,
  X,
  RotateCcw,
  Search,
  Store,
  Tag,
  Users,
  CreditCard,
  UserCheck,
  Clock,
  SlidersHorizontal,
  ChevronDown
} from 'lucide-react';
import { GlobalFilterState, ReportFilterOptions } from '../../types/reports.types';

interface GlobalFilterBarProps {
  filters: GlobalFilterState;
  onFiltersChange: (filters: GlobalFilterState) => void;
  filterOptions?: ReportFilterOptions;
  isLoadingOptions?: boolean;
}

export default function GlobalFilterBar({
  filters,
  onFiltersChange,
  filterOptions,
  isLoadingOptions
}: GlobalFilterBarProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  // Quick Date Presets Handler
  const handleDatePreset = (preset: string) => {
    const today = new Date();
    let start = todayStr;
    let end = todayStr;

    if (preset === 'today') {
      start = todayStr;
      end = todayStr;
    } else if (preset === 'yesterday') {
      const y = new Date();
      y.setDate(today.getDate() - 1);
      start = y.toISOString().split('T')[0];
      end = start;
    } else if (preset === 'this_week') {
      const firstDay = new Date(today);
      const day = today.getDay();
      const diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
      firstDay.setDate(diff);
      start = firstDay.toISOString().split('T')[0];
      end = todayStr;
    } else if (preset === 'last_week') {
      const lastMon = new Date(today);
      lastMon.setDate(today.getDate() - today.getDay() - 6);
      const lastSun = new Date(today);
      lastSun.setDate(today.getDate() - today.getDay());
      start = lastMon.toISOString().split('T')[0];
      end = lastSun.toISOString().split('T')[0];
    } else if (preset === 'this_month') {
      start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      end = todayStr;
    } else if (preset === 'last_month') {
      const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
      start = prevMonthStart.toISOString().split('T')[0];
      end = prevMonthEnd.toISOString().split('T')[0];
    } else if (preset === 'this_year') {
      start = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
      end = todayStr;
    }

    onFiltersChange({
      ...filters,
      datePreset: preset,
      startDate: start,
      endDate: end,
    });
  };

  // Helper to remove individual filter
  const removeFilter = (key: keyof GlobalFilterState) => {
    const updated = { ...filters };
    if (key === 'categoryId') updated.categoryId = 'all';
    else if (key === 'paymentMethod') updated.paymentMethod = 'all';
    else if (key === 'customerCategory') updated.customerCategory = 'all';
    else if (key === 'locationId') updated.locationId = 'all';
    else if (key === 'cashierId') updated.cashierId = 'all';
    else if (key === 'customerId') updated.customerId = 'all';
    else if (key === 'shiftId') updated.shiftId = 'all';
    else if (key === 'searchTerm') updated.searchTerm = '';
    else if (key === 'minAmountPaise') updated.minAmountPaise = undefined;
    else if (key === 'maxAmountPaise') updated.maxAmountPaise = undefined;
    else if (key === 'minWeightGrams') updated.minWeightGrams = undefined;
    else if (key === 'maxWeightGrams') updated.maxWeightGrams = undefined;
    onFiltersChange(updated);
  };

  const handleClearAll = () => {
    onFiltersChange({
      datePreset: 'today',
      startDate: todayStr,
      endDate: todayStr,
      categoryId: 'all',
      paymentMethod: 'all',
      customerCategory: 'all',
      locationId: 'all',
      cashierId: 'all',
      customerId: 'all',
      shiftId: 'all',
      searchTerm: '',
    });
  };

  // Compute active removable chips
  const activeChips: { id: string; key: keyof GlobalFilterState; label: string; value: string }[] = [];
  if (filters.categoryId && filters.categoryId !== 'all') {
    activeChips.push({ id: 'cat', key: 'categoryId', label: 'Category', value: String(filters.categoryId) });
  }
  if (filters.paymentMethod && filters.paymentMethod !== 'all') {
    activeChips.push({ id: 'pmt', key: 'paymentMethod', label: 'Payment', value: String(filters.paymentMethod).toUpperCase() });
  }
  if (filters.customerCategory && filters.customerCategory !== 'all') {
    activeChips.push({ id: 'cust_cat', key: 'customerCategory', label: 'Customer Group', value: String(filters.customerCategory) });
  }
  if (filters.locationId && filters.locationId !== 'all') {
    const b = filterOptions?.branches.find(br => br.id === Number(filters.locationId));
    activeChips.push({ id: 'loc', key: 'locationId', label: 'Branch', value: b?.name || `Branch #${filters.locationId}` });
  }
  if (filters.cashierId && filters.cashierId !== 'all') {
    const u = filterOptions?.cashiers.find(c => c.id === Number(filters.cashierId));
    activeChips.push({ id: 'cashier', key: 'cashierId', label: 'Cashier', value: u?.name || `User #${filters.cashierId}` });
  }
  if (filters.shiftId && filters.shiftId !== 'all') {
    activeChips.push({ id: 'shift', key: 'shiftId', label: 'Shift', value: `Shift ${filters.shiftId}` });
  }
  if (filters.minAmountPaise !== undefined && filters.minAmountPaise > 0) {
    activeChips.push({ id: 'min_amt', key: 'minAmountPaise', label: 'Min Amount', value: `₹${(filters.minAmountPaise / 100).toFixed(0)}` });
  }
  if (filters.maxAmountPaise !== undefined && filters.maxAmountPaise > 0) {
    activeChips.push({ id: 'max_amt', key: 'maxAmountPaise', label: 'Max Amount', value: `₹${(filters.maxAmountPaise / 100).toFixed(0)}` });
  }
  if (filters.minWeightGrams !== undefined && filters.minWeightGrams > 0) {
    activeChips.push({ id: 'min_wt', key: 'minWeightGrams', label: 'Min Wt', value: `${(filters.minWeightGrams / 1000).toFixed(1)}kg` });
  }
  if (filters.maxWeightGrams !== undefined && filters.maxWeightGrams > 0) {
    activeChips.push({ id: 'max_wt', key: 'maxWeightGrams', label: 'Max Wt', value: `${(filters.maxWeightGrams / 1000).toFixed(1)}kg` });
  }
  if (filters.searchTerm && filters.searchTerm.trim() !== '') {
    activeChips.push({ id: 'search', key: 'searchTerm', label: 'Search', value: `"${filters.searchTerm}"` });
  }

  return (
    <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 shadow-sm space-y-3 select-none">
      {/* Top Filter Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Quick Date Presets & Custom Dates */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Presets Group */}
          <div className="flex items-center bg-surface-card border border-border-subtle rounded-xl p-1 shadow-inner">
            {[
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'this_week', label: 'This Week' },
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'this_year', label: 'This Year' },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => handleDatePreset(p.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  filters.datePreset === p.id
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-panel'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Explicit Custom Dates */}
          <div className="flex items-center gap-1.5 bg-surface-card border border-border-subtle rounded-xl px-2.5 py-1 text-xs">
            <Calendar size={14} className="text-brand-500" />
            <input
              type="date"
              value={filters.startDate || todayStr}
              onChange={e => onFiltersChange({ ...filters, datePreset: 'custom', startDate: e.target.value })}
              className="bg-transparent text-text-primary text-xs font-mono font-medium outline-none"
            />
            <span className="text-text-muted font-bold text-[10px] uppercase">to</span>
            <input
              type="date"
              value={filters.endDate || todayStr}
              onChange={e => onFiltersChange({ ...filters, datePreset: 'custom', endDate: e.target.value })}
              className="bg-transparent text-text-primary text-xs font-mono font-medium outline-none"
            />
          </div>
        </div>

        {/* Right: Quick Search & Toggle Advanced Filters */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search invoice, customer, item..."
              value={filters.searchTerm || ''}
              onChange={e => onFiltersChange({ ...filters, searchTerm: e.target.value })}
              className="w-56 bg-surface-card border border-border-subtle rounded-xl pl-8 pr-3 py-1.5 text-xs text-text-primary outline-none focus:border-brand-500 shadow-inner"
            />
            {filters.searchTerm && (
              <button
                onClick={() => onFiltersChange({ ...filters, searchTerm: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
              isAdvancedOpen || activeChips.length > 0
                ? 'bg-brand-500/10 border-brand-500/30 text-brand-600 dark:text-brand-400'
                : 'bg-surface-card border-border-subtle text-text-secondary hover:text-text-primary'
            }`}
          >
            <SlidersHorizontal size={13} />
            <span>Filters</span>
            {activeChips.length > 0 && (
              <span className="px-1.5 py-0.2 bg-brand-500 text-white rounded-full text-[10px]">
                {activeChips.length}
              </span>
            )}
            <ChevronDown size={12} className={`transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
          </button>

          {activeChips.length > 0 && (
            <button
              onClick={handleClearAll}
              className="px-2.5 py-1.5 rounded-xl border border-border-subtle bg-surface-card hover:bg-surface-panel text-text-secondary hover:text-red-500 text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
              title="Reset all filters"
            >
              <RotateCcw size={12} />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filter Dropdowns Drawer */}
      {isAdvancedOpen && (
        <div className="pt-3 border-t border-border-subtle grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 animate-fadeIn">
          {/* 1. Category */}
          <div>
            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 flex items-center gap-1">
              <Tag size={11} className="text-brand-500" /> Category
            </label>
            <select
              value={filters.categoryId || 'all'}
              onChange={e => onFiltersChange({ ...filters, categoryId: e.target.value })}
              className="w-full bg-surface-card border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-primary font-medium outline-none focus:border-brand-500"
            >
              <option value="all">All Categories</option>
              {filterOptions?.categories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* 2. Payment Method */}
          <div>
            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 flex items-center gap-1">
              <CreditCard size={11} className="text-brand-500" /> Payment
            </label>
            <select
              value={filters.paymentMethod || 'all'}
              onChange={e => onFiltersChange({ ...filters, paymentMethod: e.target.value })}
              className="w-full bg-surface-card border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-primary font-medium outline-none focus:border-brand-500"
            >
              <option value="all">All Methods</option>
              <option value="cash">Cash</option>
              <option value="upi">UPI / QR</option>
              <option value="card">Card</option>
              <option value="credit">Store Credit</option>
              <option value="advance">Advance</option>
            </select>
          </div>

          {/* 3. Customer Type */}
          <div>
            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 flex items-center gap-1">
              <Users size={11} className="text-brand-500" /> Customer Type
            </label>
            <select
              value={filters.customerCategory || 'all'}
              onChange={e => onFiltersChange({ ...filters, customerCategory: e.target.value })}
              className="w-full bg-surface-card border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-primary font-medium outline-none focus:border-brand-500"
            >
              <option value="all">All Customer Types</option>
              {filterOptions?.customerCategories?.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* 4. Cashier */}
          <div>
            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 flex items-center gap-1">
              <UserCheck size={11} className="text-brand-500" /> Cashier
            </label>
            <select
              value={filters.cashierId || 'all'}
              onChange={e => onFiltersChange({ ...filters, cashierId: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
              className="w-full bg-surface-card border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-primary font-medium outline-none focus:border-brand-500"
            >
              <option value="all">All Cashiers</option>
              {filterOptions?.cashiers.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* 5. Branch / Location */}
          <div>
            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 flex items-center gap-1">
              <Store size={11} className="text-brand-500" /> Branch
            </label>
            <select
              value={filters.locationId || 'all'}
              onChange={e => onFiltersChange({ ...filters, locationId: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
              className="w-full bg-surface-card border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-primary font-medium outline-none focus:border-brand-500"
            >
              <option value="all">All Branches</option>
              {filterOptions?.branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* 6. Shift */}
          <div>
            <label className="block text-[10px] font-bold text-text-secondary uppercase mb-1 flex items-center gap-1">
              <Clock size={11} className="text-brand-500" /> Shift
            </label>
            <select
              value={filters.shiftId || 'all'}
              onChange={e => onFiltersChange({ ...filters, shiftId: e.target.value === 'all' ? 'all' : Number(e.target.value) })}
              className="w-full bg-surface-card border border-border-subtle rounded-lg px-2 py-1 text-xs text-text-primary font-medium outline-none focus:border-brand-500"
            >
              <option value="all">All Shifts</option>
              {filterOptions?.shifts?.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Active Filter Chips Bar */}
      {activeChips.length > 0 && (
        <div className="pt-2 border-t border-border-subtle flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1 mr-1">
            <Filter size={10} /> Active Filters:
          </span>
          {activeChips.map(chip => (
            <span
              key={chip.id}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-brand-500/10 border border-brand-500/30 text-brand-600 dark:text-brand-400 shadow-sm"
            >
              <span className="text-text-muted">{chip.label}:</span>
              <span>{chip.value}</span>
              <button
                onClick={() => removeFilter(chip.key)}
                className="p-0.5 hover:bg-brand-500 hover:text-white rounded-full transition-colors ml-0.5"
                title={`Remove ${chip.label}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <button
            onClick={handleClearAll}
            className="text-[11px] font-bold text-red-500 hover:text-red-600 hover:underline ml-2"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}
