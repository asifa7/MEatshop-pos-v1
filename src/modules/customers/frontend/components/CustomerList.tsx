import { useState, useEffect } from 'react';
import {
  Plus, Search, Eye, Edit3, UserCheck, ChevronLeft, ChevronRight,
  Ban, GitMerge, UtensilsCrossed, AlertTriangle, Sparkles, Clock,
  Calendar, Award, Activity, Phone, MessageSquare, ArrowUpDown,
  Lock, RefreshCw, Filter, X, Building2, Settings, Link2, CheckCircle2
} from 'lucide-react';
import { 
  useCustomers, 
  useCrmAlertsSummary, 
  useCustomersNeedingAttention,
  useRecordWhatsAppAttempt,
  useSetManualCustomerTier,
  useCustomerTierSettings,
  useUpdateCustomerTierSettings,
  useRecalculateCustomerTiers
} from '../hooks/useCustomers';
import { formatPaise, getCategoryBadgeColor, getSegmentBadgeStyle } from '../types/customer.types';
import type { Customer, AttentionCustomerItem } from '../types/customer.types';
import { formatMoney, roundMoney, rupeesToPaise, paiseToRupees } from '../../../../core/shared/math';
import CustomerForm from './CustomerForm';
import CustomerDetailView from './CustomerDetailView';
import CustomerMergeModal from './CustomerMergeModal';

export default function CustomerList() {
  const { data: customerList, isLoading } = useCustomers(true);
  const { data: crmAlerts } = useCrmAlertsSummary();
  const { data: tierSettings } = useCustomerTierSettings();
  const updateTierSettingsMutation = useUpdateCustomerTierSettings();
  const recalculateTiersMutation = useRecalculateCustomerTiers();
  
  const [viewMode, setViewMode] = useState<'all' | 'retention'>('all');
  const [attentionSortBy, setAttentionSortBy] = useState<'days_overdue' | 'lifetime_value'>('days_overdue');
  const { data: attentionCustomers, isLoading: isAttentionLoading } = useCustomersNeedingAttention(attentionSortBy);

  const recordWhatsAppMutation = useRecordWhatsAppAttempt();
  const setManualTierMutation = useSetManualCustomerTier();

  const [selectedCardFilter, setSelectedCardFilter] = useState<'due' | 'at_risk' | 'vip' | 'inactive' | 'rhythm' | null>(null);

  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'vip' | 'regular' | 'new' | 'rare' | 'wholesale' | 'restaurant' | 'active' | 'inactive' | 'outstanding' | 'advance'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  
  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mergeSourceCustomer, setMergeSourceCustomer] = useState<Customer | null>(null);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);
  const [recalcFeedback, setRecalcFeedback] = useState<string | null>(null);

  // Rules Form State
  const [rulesForm, setRulesForm] = useState({
    vipMinSpendRupees: '5000',
    vipMinVisits: '5',
    vipCriteriaMode: 'either' as 'either' | 'both',
    regularMinVisits: '2',
    newWindowDays: '14',
    atRiskGapMultiplier: '2.0',
    rareInactiveDays: '30',
    wholesaleTags: 'Wholesale,Distributor,Contract',
    restaurantTags: 'Restaurant,Hotel,Catering',
  });

  useEffect(() => {
    if (tierSettings) {
      const ts = tierSettings as any;
      setRulesForm({
        vipMinSpendRupees: String(roundMoney(paiseToRupees(ts.vip_min_spend_paise ?? 500000))),
        vipMinVisits: String(ts.vip_min_visits ?? 5),
        vipCriteriaMode: ts.vip_criteria_mode === 'both' ? 'both' : 'either',
        regularMinVisits: String(ts.regular_min_visits ?? 2),
        newWindowDays: String(ts.new_window_days ?? 14),
        atRiskGapMultiplier: String(ts.at_risk_gap_multiplier ?? 2.0),
        rareInactiveDays: String(ts.rare_inactive_days ?? 30),
        wholesaleTags: ts.wholesale_tags || 'Wholesale,Distributor,Contract',
        restaurantTags: ts.restaurant_tags || 'Restaurant,Hotel,Catering',
      });
    }
  }, [tierSettings]);

  const handleSaveRules = async () => {
    try {
      await updateTierSettingsMutation.mutateAsync({
        vip_min_spend_paise: rupeesToPaise(Number(rulesForm.vipMinSpendRupees) || 0),
        vip_min_visits: Math.max(1, parseInt(rulesForm.vipMinVisits, 10) || 5),
        vip_criteria_mode: rulesForm.vipCriteriaMode,
        regular_min_visits: Math.max(1, parseInt(rulesForm.regularMinVisits, 10) || 2),
        rare_inactive_days: Math.max(1, parseInt(rulesForm.rareInactiveDays, 10) || 30),
        new_window_days: Math.max(1, parseInt(rulesForm.newWindowDays, 10) || 14),
        at_risk_gap_multiplier: Math.max(1.1, parseFloat(rulesForm.atRiskGapMultiplier) || 2.0),
        wholesale_tags: rulesForm.wholesaleTags.trim() || 'Wholesale,Distributor,Contract',
        restaurant_tags: rulesForm.restaurantTags.trim() || 'Restaurant,Hotel,Catering',
      } as any);
      setRecalcFeedback('Rules saved & all customer tiers recalculated!');
      setTimeout(() => setRecalcFeedback(null), 4000);
    } catch (err: any) {
      alert(`Failed to save rules: ${err?.message || err}`);
    }
  };

  const handleRecalculateAll = async () => {
    try {
      const res = await recalculateTiersMutation.mutateAsync();
      setRecalcFeedback(`Recalculated ${res.updatedCount} customer tiers!`);
      setTimeout(() => setRecalcFeedback(null), 4000);
    } catch (err: any) {
      alert(`Failed to recalculate tiers: ${err?.message || err}`);
    }
  };

  // Pagination
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const rawCustomers = customerList ?? [];

  // Client-side filtering
  const filtered = rawCustomers.filter((c) => {
    const query = search.toLowerCase();
    const matchesSearch =
      c.name.toLowerCase().includes(query) ||
      (c.phone && c.phone.includes(query)) ||
      (c.whatsapp && c.whatsapp.includes(query)) ||
      c.customer_code.toLowerCase().includes(query) ||
      (c.business_name && c.business_name.toLowerCase().includes(query));

    let matchesTab = true;
    const catUpper = (c.category || '').toUpperCase();
    const isWholesale = catUpper.includes('WHOLESALE') || catUpper.includes('DISTRIBUTOR') || c.price_tier === 'wholesale';
    const isRestaurant = catUpper.includes('RESTAURANT') || catUpper.includes('HOTEL') || catUpper.includes('CATERING');

    if (activeTab === 'vip') {
      matchesTab = c.manual_tier?.toLowerCase() === 'vip' || c.customer_segment === 'VIP' || c.price_tier === 'vip';
    } else if (activeTab === 'regular') {
      matchesTab = c.manual_tier?.toLowerCase() === 'regular' || c.customer_segment === 'Regular';
    } else if (activeTab === 'new') {
      matchesTab = c.manual_tier?.toLowerCase() === 'new' || c.customer_segment === 'New';
    } else if (activeTab === 'rare') {
      matchesTab = c.manual_tier?.toLowerCase() === 'rare' || c.customer_segment === 'Inactive' || c.customer_segment === 'At Risk';
    } else if (activeTab === 'wholesale') {
      matchesTab = c.manual_tier?.toLowerCase() === 'wholesale' || isWholesale;
    } else if (activeTab === 'restaurant') {
      matchesTab = c.manual_tier?.toLowerCase() === 'restaurant' || isRestaurant;
    } else if (activeTab === 'active') {
      matchesTab = c.is_active === 1;
    } else if (activeTab === 'inactive') {
      matchesTab = c.is_active === 0;
    } else if (activeTab === 'outstanding') {
      matchesTab = c.outstanding_balance_paise > 0;
    } else if (activeTab === 'advance') {
      matchesTab = c.advance_balance_paise > 0;
    }

    const matchesCategory = selectedCategory === 'All' || c.category === selectedCategory;

    // Card drill-down filter
    let matchesCard = true;
    if (selectedCardFilter === 'vip') {
      matchesCard = c.customer_segment === 'VIP';
    } else if (selectedCardFilter === 'inactive') {
      matchesCard = c.customer_segment === 'Inactive';
    }

    return matchesSearch && matchesTab && matchesCategory && matchesCard;
  });

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const totalOutstanding = filtered.reduce((s, r) => s + r.outstanding_balance_paise, 0);
  const totalAdvance = filtered.reduce((s, r) => s + r.advance_balance_paise, 0);

  const categories: string[] = ['All', 'Hotel', 'Restaurant', 'Retail', 'Wholesale', 'Catering', 'Distributor', 'Contract'];

  const handleRowClick = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsDetailOpen(true);
  };

  const handleAttentionCustomerClick = (att: AttentionCustomerItem) => {
    const fullCust = rawCustomers.find(c => c.id === att.customer_id);
    if (fullCust) {
      setSelectedCustomer(fullCust);
      setIsDetailOpen(true);
    }
  };

  const handleSendWhatsAppReminder = (att: AttentionCustomerItem) => {
    if (!att.phone || att.marketing_consent !== 1) return;
    const cleanPhone = att.phone.replace(/\D/g, '').slice(-10);
    const usualOrder = att.typical_basket_summary ? ` (${att.typical_basket_summary})` : '';
    const text = `Hello ${att.name}! We missed you at the shop! Your usual favorite cuts${usualOrder} are fresh and ready for you today. Looking forward to serving you!`;
    const waUrl = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank');
    recordWhatsAppMutation.mutate({
      invoice_id: 0,
      customer_id: att.customer_id,
      phone: att.phone,
    });
  };

  const handleEditClick = (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    setSelectedCustomer(customer);
    setIsFormOpen(true);
  };

  const handleMergeClick = (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    setMergeSourceCustomer(customer);
    setIsMergeOpen(true);
  };

  const handleCardClick = (card: 'due' | 'at_risk' | 'vip' | 'inactive' | 'rhythm') => {
    if (selectedCardFilter === card) {
      setSelectedCardFilter(null);
      return;
    }
    setSelectedCardFilter(card);
    setPage(1);

    if (card === 'due' || card === 'at_risk') {
      setViewMode('retention');
      setAttentionSortBy('days_overdue');
    } else {
      setViewMode('all');
    }
  };

  return (
    <div className="h-full overflow-auto p-6 space-y-5 select-none text-xs text-text-primary bg-surface-app">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-text-primary font-outfit">Customer Accounts & CRM Hub</h2>
          <p className="text-xs text-text-muted mt-0.5">Manage customer profiles, purchase history, visit intelligence & retention alerts</p>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {recalcFeedback && (
            <div className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 rounded-xl text-[11px] font-bold flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              <span>{recalcFeedback}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsRulesModalOpen(true)}
            className="px-3.5 py-2.5 bg-surface-panel hover:bg-surface-card border border-border-subtle text-text-primary rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
            title="Configure VIP, Regular, New, At-Risk, Rare & Wholesale/Restaurant Tier Rules"
          >
            <Settings size={15} className="text-amber-500" />
            <span>Rules</span>
          </button>
          <button
            type="button"
            onClick={handleRecalculateAll}
            disabled={recalculateTiersMutation.isPending}
            className="px-3.5 py-2.5 bg-surface-panel hover:bg-surface-card border border-border-subtle text-text-primary rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            title="Recalculate all customer segments using current rules"
          >
            <RefreshCw size={15} className={`text-brand-500 ${recalculateTiersMutation.isPending ? 'animate-spin' : ''}`} />
            <span>{recalculateTiersMutation.isPending ? 'Recalculating...' : 'Recalculate All'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedCustomer(null);
              setIsFormOpen(true);
            }}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Create a new customer profile"
          >
            <Plus size={16} className="stroke-[3]" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Row 1: Financial & Account Stats Banner */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-4 flex items-center justify-between shadow-elevation">
          <div>
            <p className="text-[10px] text-text-muted font-medium uppercase">Active Accounts</p>
            <p className="text-lg font-bold text-text-primary mt-1">{rawCustomers.filter(c => c.is_active === 1).length}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/50 flex items-center justify-center text-brand-500">
            <UserCheck size={18} />
          </div>
        </div>
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-4 flex items-center justify-between shadow-elevation">
          <div>
            <p className="text-[10px] text-text-muted font-medium uppercase">Total A/R Outstanding</p>
            <p className="text-lg font-bold text-amber-400 mt-1 font-mono">{formatPaise(totalOutstanding)}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-950/40 border border-amber-800/40 flex items-center justify-center text-amber-400">
            <Ban size={18} />
          </div>
        </div>
        <div className="bg-surface-panel border border-border-subtle rounded-xl p-4 flex items-center justify-between shadow-elevation">
          <div>
            <p className="text-[10px] text-text-muted font-medium uppercase">Total Advance Deposits</p>
            <p className="text-lg font-bold text-brand-500 mt-1 font-mono">{formatPaise(totalAdvance)}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 border border-brand-500/30 flex items-center justify-center text-brand-500">
            <UserCheck size={18} />
          </div>
        </div>
      </div>

      {/* Row 2: CRM Intelligence & Retention Alerts (Phase 3 Dashboard with Mathematical Formulas) */}
      <div className="grid grid-cols-5 gap-3">
        {/* Due Today Card */}
        <div 
          onClick={() => handleCardClick('due')}
          className={`bg-yellow-50 dark:bg-yellow-500/10 border rounded-xl p-3 cursor-pointer hover:border-yellow-500/60 transition-all shadow-sm ${
            selectedCardFilter === 'due' ? 'ring-2 ring-yellow-500 border-yellow-500' : 'border-yellow-300 dark:border-yellow-500/30'
          }`}
          title="Formula: expected_next_visit <= today OR customer_segment == 'Due'"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-yellow-800 dark:text-yellow-400">Due Today</span>
            <Clock size={14} className="text-yellow-600 dark:text-yellow-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-yellow-900 dark:text-yellow-300 font-mono">
              {crmAlerts ? crmAlerts.due_today_count : '—'}
            </span>
            <span className="text-[10px] text-yellow-800/80 dark:text-text-muted font-medium">expected</span>
          </div>
          <p className="text-[9px] text-yellow-800/90 dark:text-yellow-200/80 mt-1 truncate font-medium">
            Formula: Cadence reached (Visit ≤ Today)
          </p>
        </div>

        {/* At Risk Card */}
        <div 
          onClick={() => handleCardClick('at_risk')}
          className={`bg-orange-50 dark:bg-orange-500/10 border rounded-xl p-3 cursor-pointer hover:border-orange-500/60 transition-all shadow-sm ${
            selectedCardFilter === 'at_risk' ? 'ring-2 ring-orange-500 border-orange-500' : 'border-orange-300 dark:border-orange-500/30'
          }`}
          title="Formula: days_since_last_purchase > 2.0x cadence AND <= 60 days"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-orange-800 dark:text-orange-400">At Risk</span>
            <AlertTriangle size={14} className="text-orange-600 dark:text-orange-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-orange-900 dark:text-orange-300 font-mono">
              {crmAlerts ? crmAlerts.at_risk_count : '—'}
            </span>
            <span className="text-[10px] text-orange-800/80 dark:text-text-muted font-medium">overdue</span>
          </div>
          <p className="text-[9px] text-orange-800/90 dark:text-orange-200/80 mt-1 truncate font-medium">
            Formula: Gap &gt; 2.0x normal cycle
          </p>
        </div>

        {/* VIP Customers Card */}
        <div 
          onClick={() => handleCardClick('vip')}
          className={`bg-amber-50 dark:bg-amber-500/10 border rounded-xl p-3 cursor-pointer hover:border-amber-500/60 transition-all shadow-sm ${
            selectedCardFilter === 'vip' ? 'ring-2 ring-amber-500 border-amber-500' : 'border-amber-300 dark:border-amber-500/30'
          }`}
          title="Formula: lifetime_spend >= ₹10,000 AND visits >= 5 AND active within 1.5x cadence"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-amber-800 dark:text-amber-400">VIP Accounts</span>
            <Award size={14} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-amber-900 dark:text-amber-300 font-mono">
              {crmAlerts ? crmAlerts.vip_count : '—'}
            </span>
            <span className="text-[10px] text-amber-800/80 dark:text-text-muted font-medium">top spenders</span>
          </div>
          <p className="text-[9px] text-amber-800/90 dark:text-amber-200/80 mt-1 truncate font-medium">
            Formula: Spend ≥ ₹10k + 5+ visits
          </p>
        </div>

        {/* Avg Shop Visit Frequency */}
        <div 
          onClick={() => handleCardClick('rhythm')}
          className={`bg-emerald-50 dark:bg-emerald-500/10 border rounded-xl p-3 cursor-pointer hover:border-emerald-500/60 transition-all shadow-sm ${
            selectedCardFilter === 'rhythm' ? 'ring-2 ring-emerald-500 border-emerald-500' : 'border-emerald-300 dark:border-emerald-500/30'
          }`}
          title="Formula: AVG(interval) across all distinct calendar visit days"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-emerald-800 dark:text-emerald-400">Shop Rhythm</span>
            <Activity size={14} className="text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-emerald-900 dark:text-emerald-300 font-mono">
              {crmAlerts && crmAlerts.shop_avg_visit_interval > 0 ? `${crmAlerts.shop_avg_visit_interval}d` : '—'}
            </span>
            <span className="text-[10px] text-emerald-800/80 dark:text-text-muted font-medium">avg gap</span>
          </div>
          <p className="text-[9px] text-emerald-800/90 dark:text-emerald-200/80 mt-1 truncate font-medium">
            Formula: AVG(distinct day intervals)
          </p>
        </div>

        {/* Inactive Customers Card */}
        <div 
          onClick={() => handleCardClick('inactive')}
          className={`bg-zinc-100 dark:bg-zinc-500/10 border rounded-xl p-3 cursor-pointer hover:border-zinc-500/60 transition-all shadow-sm ${
            selectedCardFilter === 'inactive' ? 'ring-2 ring-zinc-500 border-zinc-500' : 'border-zinc-300 dark:border-zinc-500/30'
          }`}
          title="Formula: days_since_last_purchase > 60 days"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-extrabold text-zinc-800 dark:text-zinc-400">Inactive</span>
            <Calendar size={14} className="text-zinc-600 dark:text-zinc-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl font-extrabold text-zinc-900 dark:text-zinc-300 font-mono">
              {crmAlerts ? crmAlerts.inactive_count : '—'}
            </span>
            <span className="text-[10px] text-zinc-700/80 dark:text-text-muted font-medium">absent</span>
          </div>
          <p className="text-[9px] text-zinc-700 dark:text-zinc-400 mt-1 truncate font-medium">
            Formula: No visits in &gt;60 days
          </p>
        </div>
      </div>

      {/* Active Filter Pill */}
      {selectedCardFilter && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-500/10 border border-brand-500/30 rounded-xl text-xs font-bold text-brand-600 dark:text-brand-400 w-fit">
          <Filter size={13} />
          <span>
            Drill-down filter active: <strong className="uppercase">{selectedCardFilter}</strong> ({viewMode === 'retention' ? (attentionCustomers?.length ?? 0) : filtered.length} records)
          </span>
          <button 
            onClick={() => setSelectedCardFilter(null)}
            className="ml-2 p-0.5 hover:bg-brand-500/20 rounded text-brand-600 dark:text-brand-400"
            title="Reset drill-down filter"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {/* View Mode Selector Bar */}
      <div className="flex items-center justify-between pb-1 border-b border-border-subtle">
        <div className="flex bg-surface-card p-1 rounded-xl border border-border-subtle gap-1 shadow-sm">
          <button
            type="button"
            onClick={() => { setViewMode('all'); setSelectedCardFilter(null); }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'all'
                ? 'bg-brand-500 text-white shadow-subtle'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            👥 All Customers Database ({rawCustomers.length})
          </button>
          <button
            type="button"
            onClick={() => { setViewMode('retention'); }}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'retention'
                ? 'bg-orange-500 text-white shadow-subtle'
                : 'text-orange-700 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300'
            }`}
          >
            <AlertTriangle size={13} />
            Retention Desk (Needing Attention) {attentionCustomers ? `(${attentionCustomers.length})` : ''}
          </button>
        </div>

        {viewMode === 'retention' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[10px] uppercase font-bold text-text-muted flex items-center gap-1">
              <ArrowUpDown size={11} /> Sort by:
            </span>
            <button
              type="button"
              onClick={() => setAttentionSortBy('days_overdue')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                attentionSortBy === 'days_overdue'
                  ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-900 dark:text-orange-300 border-orange-300 dark:border-orange-500/50 shadow-sm'
                  : 'bg-surface-card text-text-secondary border-border-subtle hover:text-text-primary'
              }`}
            >
              Most Overdue
            </button>
            <button
              type="button"
              onClick={() => setAttentionSortBy('lifetime_value')}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                attentionSortBy === 'lifetime_value'
                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-500/50 shadow-sm'
                  : 'bg-surface-card text-text-secondary border-border-subtle hover:text-text-primary'
              }`}
            >
              Highest Lifetime Value (LTV)
            </button>
          </div>
        )}
      </div>

      {/* VIEW A: RETENTION DESK (CUSTOMERS NEEDING ATTENTION) */}
      {viewMode === 'retention' ? (
        <div className="erp-table-container">
          <table className="erp-table">
            <thead>
              <tr>
                <th className="erp-th">Customer</th>
                <th className="erp-th">Segment & Health</th>
                <th className="erp-th text-center">Normal Gap</th>
                <th className="erp-th text-center">Last Visit</th>
                <th className="erp-th text-center text-orange-400">Overdue</th>
                <th className="erp-th">Their Usual Order</th>
                <th className="erp-th text-right text-brand-500">Lifetime Value (LTV)</th>
                <th className="erp-th text-right text-red-400">Due (₹)</th>
                <th className="erp-th text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isAttentionLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 9 }).map((__, j) => (
                      <td key={j} className="erp-td"><div className="h-2 bg-surface-card rounded" /></td>
                    ))}
                  </tr>
                ))
              ) : !attentionCustomers || attentionCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="erp-td text-center py-14 text-text-muted">
                    🎉 Excellent! All customer visits are currently on schedule.
                  </td>
                </tr>
              ) : (
                attentionCustomers.map((att: AttentionCustomerItem) => {
                  const segStyle = getSegmentBadgeStyle(att.customer_segment);
                  return (
                    <tr
                      key={att.customer_id}
                      onClick={() => handleAttentionCustomerClick(att)}
                      className="erp-tr-hover cursor-pointer"
                    >
                      <td className="erp-td">
                        <div className="font-bold text-text-primary">{att.name}</div>
                        <div className="text-[10px] text-text-muted font-mono">{att.customer_code}</div>
                      </td>

                      <td className="erp-td">
                        <span className={`px-2 py-0.5 border rounded-full text-[9px] font-bold flex items-center gap-1 w-fit ${segStyle.bg} ${segStyle.text} ${segStyle.border}`}>
                          <span>{segStyle.icon}</span>
                          <span>{segStyle.label}</span>
                        </span>
                        <div className="text-[9px] text-text-muted mt-0.5 line-clamp-1">{att.segment_health_summary}</div>
                      </td>

                      <td className="erp-td text-center font-mono font-bold">
                        {att.average_visit_interval ? `${att.average_visit_interval}d` : '—'}
                      </td>

                      <td className="erp-td text-center font-mono text-[10px]">
                        {att.days_since_last_purchase != null ? `${att.days_since_last_purchase}d ago` : 'Never'}
                      </td>

                      <td className="erp-td text-center">
                        {att.days_overdue > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-500/40 font-mono">
                            +{att.days_overdue} days
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-500/40 font-mono">
                            Due Today
                          </span>
                        )}
                      </td>

                      <td className="erp-td text-[11px] text-brand-700 dark:text-brand-300 font-medium">
                        {att.typical_basket_summary ? (
                          <span className="line-clamp-1">✨ {att.typical_basket_summary}</span>
                        ) : '—'}
                      </td>

                      <td className="erp-td text-right font-mono font-extrabold text-brand-600 dark:text-brand-400">
                        {formatPaise(att.customer_lifetime_value_paise)}
                      </td>

                      <td className="erp-td text-right font-mono font-bold text-red-600 dark:text-red-400">
                        {att.outstanding_balance_paise > 0 ? formatPaise(att.outstanding_balance_paise) : '—'}
                      </td>

                      <td className="erp-td text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          {att.marketing_consent === 1 && att.phone ? (
                            <button
                              type="button"
                              onClick={() => handleSendWhatsAppReminder(att)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[10px] flex items-center gap-1.5 shadow-sm transition-all hover:scale-105"
                              title="Send personalized visit reminder via WhatsApp"
                            >
                              <MessageSquare size={12} />
                              <span>Remind</span>
                            </button>
                          ) : (
                            <div
                              className="px-2 py-1 bg-surface-card border border-border-subtle rounded-lg text-text-muted text-[10px] flex items-center gap-1 cursor-not-allowed opacity-60"
                              title={!att.phone ? "No phone number recorded" : "Customer has not opted in for marketing messages"}
                            >
                              <Lock size={10} />
                              <span>No Consent</span>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const fullCust = rawCustomers.find(c => c.id === att.customer_id);
                              if (fullCust) {
                                setSelectedCustomer(fullCust);
                                setIsFormOpen(true);
                              }
                            }}
                            className="px-2 py-1 bg-surface-card hover:bg-brand-500 hover:text-white border border-border-subtle rounded-lg text-text-secondary font-bold text-[10px] flex items-center gap-1 transition-all"
                            title="Edit Customer"
                          >
                            <Edit3 size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAttentionCustomerClick(att)}
                            className="p-1.5 bg-surface-card hover:bg-brand-500 hover:text-white rounded-lg text-text-secondary transition-colors"
                            title="View Full Profile & History"
                          >
                            <Eye size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* VIEW B: ALL CUSTOMERS DATABASE */
        <>
          {/* Toolbar filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-card border border-border-subtle p-3 rounded-xl shadow-sm">
            <div className="relative w-80">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by name, phone, shop code..."
                className="w-full bg-surface-panel border border-border-subtle rounded-lg pl-9 pr-4 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500"
              />
              <Search size={14} className="absolute left-3 top-3 text-text-muted" />
            </div>

            {/* Tab filters */}
            <div className="flex flex-wrap bg-surface-panel p-0.5 rounded-lg border border-border-subtle gap-0.5">
              {[
                { key: 'all', label: 'All' },
                { key: 'vip', label: '⭐ VIP' },
                { key: 'regular', label: '🟢 Regular' },
                { key: 'new', label: '🆕 New' },
                { key: 'rare', label: '⏳ Rare' },
                { key: 'wholesale', label: '📦 Wholesale' },
                { key: 'restaurant', label: '🍽️ Restaurant' },
                { key: 'outstanding', label: 'Outstanding' },
                { key: 'active', label: 'Active' },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setActiveTab(t.key as any);
                    setPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                    activeTab === t.key
                      ? 'bg-brand-500 text-white shadow-subtle'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-card'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Category filter */}
            <select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value);
                setPage(1);
              }}
              className="bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-brand-500 text-xs font-medium"
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === 'All' ? 'All Categories' : c}
                </option>
              ))}
            </select>
          </div>

          {/* Main Table */}
          <div className="erp-table-container">
            <table className="erp-table">
              <thead>
                <tr>
                  <th className="erp-th">Code</th>
                  <th className="erp-th">Name / Business</th>
                  <th className="erp-th">Contact</th>
                  <th className="erp-th">Category & Segment</th>
                  <th className="erp-th text-right text-red-600 dark:text-red-400">Outstanding (₹)</th>
                  <th className="erp-th text-right text-brand-600 dark:text-brand-500">Avail Credit (₹)</th>
                  <th className="erp-th text-right text-brand-600 dark:text-brand-500">Advance (₹)</th>
                  <th className="erp-th text-center">Status</th>
                  <th className="erp-th text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {Array.from({ length: 9 }).map((__, j) => (
                        <td key={j} className="erp-td"><div className="h-2 bg-surface-card rounded" /></td>
                      ))}
                    </tr>
                  ))
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="erp-td text-center py-14 text-text-muted">
                      No customers found matching current filters
                    </td>
                  </tr>
                ) : (
                  paginated.map((cust: Customer) => (
                    <tr
                      key={cust.id}
                      onClick={() => handleRowClick(cust)}
                      className="erp-tr-hover"
                    >
                      <td className="erp-td font-mono font-bold text-text-primary">{cust.customer_code}</td>
                      <td className="erp-td">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-text-primary leading-tight">{cust.name}</span>
                          {(cust as any).linked_supplier_id ? (
                            <span
                              className="px-1.5 py-0.5 bg-indigo-500/15 border border-indigo-500/40 text-indigo-700 dark:text-indigo-300 rounded-md text-[9px] font-extrabold inline-flex items-center gap-1"
                              title={`Dual-role account linked to Supplier #${(cust as any).linked_supplier_id} (${(cust as any).linked_supplier_name || ''})`}
                            >
                              <Link2 size={10} />
                              <span>🔗 Also Supplier{(cust as any).linked_supplier_name ? `: ${(cust as any).linked_supplier_name}` : ''}</span>
                            </span>
                          ) : null}
                        </div>
                        {cust.business_name && <div className="text-[10px] text-text-muted mt-0.5">{cust.business_name}</div>}
                        {(cust.preferred_cut || cust.cutting_preference) && (
                          <div className="text-[9px] text-brand-600 dark:text-brand-400 mt-0.5 flex items-center gap-1 font-medium">
                            <UtensilsCrossed size={10} />
                            <span>{cust.preferred_cut || ''} {cust.cutting_preference ? `• ${cust.cutting_preference}` : ''}</span>
                          </div>
                        )}
                      </td>
                      <td className="erp-td font-mono text-text-secondary">
                        <div>{cust.phone || '—'}</div>
                        {cust.whatsapp && cust.whatsapp !== cust.phone && (
                          <div className="text-[10px] text-text-muted">WA: {cust.whatsapp}</div>
                        )}
                      </td>
                      <td className="erp-td" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col gap-1 items-start">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 border rounded-full text-[9px] ${getCategoryBadgeColor(cust.category)}`}>
                              {cust.category}
                            </span>
                            {cust.customer_segment && (
                              <span className={`px-1.5 py-0.2 border rounded-full text-[8px] font-bold flex items-center gap-1 ${getSegmentBadgeStyle(cust.customer_segment).bg} ${getSegmentBadgeStyle(cust.customer_segment).text} ${getSegmentBadgeStyle(cust.customer_segment).border}`}>
                                <span>{getSegmentBadgeStyle(cust.customer_segment).icon}</span>
                                <span>{getSegmentBadgeStyle(cust.customer_segment).label}</span>
                              </span>
                            )}
                          </div>

                          {/* Quick Manual Tier Assignment */}
                          <div className="flex items-center gap-1 mt-0.5">
                            <span className="text-[9px] text-text-muted font-bold">Tier:</span>
                            <select
                              value={cust.manual_tier || 'auto'}
                              onChange={async (e) => {
                                const val = e.target.value;
                                try {
                                  await setManualTierMutation.mutateAsync({
                                    customer_id: cust.id,
                                    tier: val === 'auto' ? null : val,
                                  });
                                } catch (err: any) {
                                  alert(`Error updating tier: ${err?.message || err}`);
                                }
                              }}
                              className="text-[9px] font-extrabold px-1.5 py-0.5 rounded border border-border-subtle bg-surface-card hover:border-amber-400 cursor-pointer outline-none text-text-primary"
                              title="Assign manual tier or reset to Auto Criteria"
                            >
                              <option value="auto">Auto (Criteria)</option>
                              <option value="vip">⭐ VIP</option>
                              <option value="regular">🟢 Regular</option>
                              <option value="new">🆕 New</option>
                              <option value="rare">⏳ Rare</option>
                              <option value="wholesale">📦 Wholesale</option>
                              <option value="restaurant">🍽️ Restaurant</option>
                            </select>
                          </div>
                        </div>
                      </td>
                      <td className="erp-td text-right font-mono font-bold text-red-600 dark:text-red-400">
                        {cust.outstanding_balance_paise > 0 ? formatPaise(cust.outstanding_balance_paise) : '—'}
                      </td>
                      <td className="erp-td text-right font-mono font-bold text-brand-600 dark:text-brand-500">
                        {cust.credit_allowed === 1
                          ? formatPaise(Math.max(0, cust.credit_limit_paise - cust.outstanding_balance_paise))
                          : 'No Credit'}
                      </td>
                      <td className="erp-td text-right font-mono font-bold text-brand-600 dark:text-brand-500">
                        {cust.advance_balance_paise > 0 ? formatPaise(cust.advance_balance_paise) : '—'}
                      </td>
                      <td className="erp-td text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${cust.is_active === 1 ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30' : 'bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-300 border border-red-300 dark:border-red-500/30'}`}>
                          {cust.is_active === 1 ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="erp-td text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleRowClick(cust)}
                            className="p-1.5 bg-surface-card hover:bg-brand-500 hover:text-white rounded-lg text-text-secondary transition-colors"
                            title="View Full Profile & Ledger"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            onClick={(e) => handleEditClick(e, cust)}
                            className="px-2 py-1 bg-surface-card hover:bg-brand-500 hover:text-white border border-border-subtle rounded-lg text-text-secondary font-bold text-[10px] flex items-center gap-1 transition-all"
                            title="Edit Customer"
                          >
                            <Edit3 size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={(e) => handleMergeClick(e, cust)}
                            className="p-1.5 bg-surface-card hover:bg-amber-500 hover:text-white rounded-lg text-text-secondary transition-colors"
                            title="Merge Duplicate Customer"
                          >
                            <GitMerge size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-[11px] text-text-muted pt-2">
            <div>
              Showing {filtered.length === 0 ? 0 : (page - 1) * pageSize + 1} to {Math.min(page * pageSize, filtered.length)} of {filtered.length} customers
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 bg-surface-card border border-border-subtle rounded-lg disabled:opacity-30 hover:bg-surface-app text-text-secondary"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="font-mono font-bold text-text-primary">
                {page} / {totalPages}
              </span>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 bg-surface-card border border-border-subtle rounded-lg disabled:opacity-30 hover:bg-surface-app text-text-secondary"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </>
      )}

      {/* Customer Tier & Segment Rules Editor Modal */}
      {isRulesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-card/60">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-500">
                  <Settings size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-text-primary">Customer Tier &amp; Segment Rules Editor</h3>
                  <p className="text-[11px] text-text-muted">Configure automatic segmentation thresholds for VIP, Regular, New, At-Risk, Rare &amp; B2B tags</p>
                </div>
              </div>
              <button
                onClick={() => setIsRulesModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-surface-app text-text-muted hover:text-text-primary cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-5">
              {/* VIP Section */}
              <div className="bg-amber-500/5 border border-amber-500/25 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-amber-600 dark:text-amber-400">⭐ VIP Customer Criteria</span>
                  <span className="text-[10px] text-text-muted font-mono">
                    Current: ₹{formatMoney(Number(rulesForm.vipMinSpendRupees) || 0)} {rulesForm.vipCriteriaMode === 'both' ? 'AND' : 'OR'} {rulesForm.vipMinVisits}+ visits
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-text-secondary mb-1">Min Total Spend (₹)</label>
                    <input
                      type="number"
                      min="0"
                      value={rulesForm.vipMinSpendRupees}
                      onChange={(e) => setRulesForm(p => ({ ...p, vipMinSpendRupees: e.target.value }))}
                      className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono font-bold text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-secondary mb-1">Min Visit Count</label>
                    <input
                      type="number"
                      min="1"
                      value={rulesForm.vipMinVisits}
                      onChange={(e) => setRulesForm(p => ({ ...p, vipMinVisits: e.target.value }))}
                      className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono font-bold text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-secondary mb-1">Criteria Mode</label>
                    <select
                      value={rulesForm.vipCriteriaMode}
                      onChange={(e) => setRulesForm(p => ({ ...p, vipCriteriaMode: e.target.value as 'either' | 'both' }))}
                      className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-xs font-bold text-text-primary"
                    >
                      <option value="either">Either (Spend OR Visits)</option>
                      <option value="both">Both (Spend AND Visits)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Regular, New, At-Risk, Rare Section */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-500/5 border border-emerald-500/25 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400">🟢 Regular Customer</div>
                  <label className="block text-[10px] font-bold text-text-secondary">Minimum Visit Count</label>
                  <input
                    type="number"
                    min="1"
                    value={rulesForm.regularMinVisits}
                    onChange={(e) => setRulesForm(p => ({ ...p, regularMinVisits: e.target.value }))}
                    className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono font-bold text-text-primary"
                  />
                  <p className="text-[10px] text-text-muted">Customers with at least this many distinct visit days.</p>
                </div>

                <div className="bg-blue-500/5 border border-blue-500/25 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-extrabold text-blue-600 dark:text-blue-400">🆕 New Customer Window</div>
                  <label className="block text-[10px] font-bold text-text-secondary">First N Days Since Joining</label>
                  <input
                    type="number"
                    min="1"
                    value={rulesForm.newWindowDays}
                    onChange={(e) => setRulesForm(p => ({ ...p, newWindowDays: e.target.value }))}
                    className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono font-bold text-text-primary"
                  />
                  <p className="text-[10px] text-text-muted">First N days since first purchase / account creation.</p>
                </div>

                <div className="bg-orange-500/5 border border-orange-500/25 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-extrabold text-orange-600 dark:text-orange-400">🔴 At-Risk Churn Multiplier</div>
                  <label className="block text-[10px] font-bold text-text-secondary">Visit Gap Multiplier (× Avg Gap)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.1"
                    value={rulesForm.atRiskGapMultiplier}
                    onChange={(e) => setRulesForm(p => ({ ...p, atRiskGapMultiplier: e.target.value }))}
                    className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono font-bold text-text-primary"
                  />
                  <p className="text-[10px] text-text-muted">Flagged At-Risk when days since last visit &gt; {rulesForm.atRiskGapMultiplier}× usual gap.</p>
                </div>

                <div className="bg-slate-500/5 border border-slate-500/25 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-extrabold text-text-primary">⏳ Rare / Inactive Threshold</div>
                  <label className="block text-[10px] font-bold text-text-secondary">No Purchase in Last N Days</label>
                  <input
                    type="number"
                    min="1"
                    value={rulesForm.rareInactiveDays}
                    onChange={(e) => setRulesForm(p => ({ ...p, rareInactiveDays: e.target.value }))}
                    className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-xs font-mono font-bold text-text-primary"
                  />
                  <p className="text-[10px] text-text-muted">Marked Rare / Inactive after {rulesForm.rareInactiveDays} days without a visit.</p>
                </div>
              </div>

              {/* Wholesale & Restaurant Auto-Tagging */}
              <div className="bg-surface-card border border-border-subtle rounded-xl p-4 space-y-3">
                <div className="text-xs font-extrabold text-text-primary">📦 Wholesale &amp; 🍽️ Restaurant Auto-Tagging</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-text-secondary mb-1">Wholesale Category Keywords (comma-separated)</label>
                    <input
                      type="text"
                      value={rulesForm.wholesaleTags}
                      onChange={(e) => setRulesForm(p => ({ ...p, wholesaleTags: e.target.value }))}
                      className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-xs font-medium text-text-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-text-secondary mb-1">Restaurant Category Keywords (comma-separated)</label>
                    <input
                      type="text"
                      value={rulesForm.restaurantTags}
                      onChange={(e) => setRulesForm(p => ({ ...p, restaurantTags: e.target.value }))}
                      className="w-full bg-surface-panel border border-border-subtle rounded-lg px-3 py-2 text-xs font-medium text-text-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border-subtle bg-surface-card/60 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleRecalculateAll}
                disabled={recalculateTiersMutation.isPending}
                className="px-4 py-2 bg-surface-panel hover:bg-surface-app border border-border-subtle rounded-xl text-xs font-bold text-text-primary flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw size={14} className={recalculateTiersMutation.isPending ? 'animate-spin' : ''} />
                <span>Recalculate All Now</span>
              </button>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsRulesModalOpen(false)}
                  className="px-4 py-2 bg-surface-panel hover:bg-surface-app border border-border-subtle rounded-xl text-xs font-bold text-text-secondary cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleSaveRules();
                    setIsRulesModalOpen(false);
                  }}
                  disabled={updateTierSettingsMutation.isPending}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer disabled:opacity-50"
                >
                  {updateTierSettingsMutation.isPending ? 'Saving & Recalculating...' : 'Save Rules & Recalculate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Customer Form Modal */}
      {isFormOpen && (
        <CustomerForm
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          customer={selectedCustomer}
        />
      )}

      {/* Customer Detail View Modal */}
      {isDetailOpen && (
        <CustomerDetailView
          customer={selectedCustomer}
          isOpen={isDetailOpen}
          onClose={() => setIsDetailOpen(false)}
          onEdit={(cust) => {
            setIsDetailOpen(false);
            setSelectedCustomer(cust);
            setIsFormOpen(true);
          }}
        />
      )}

      {/* Customer Merge Modal */}
      {isMergeOpen && mergeSourceCustomer && (
        <CustomerMergeModal
          isOpen={isMergeOpen}
          onClose={() => {
            setIsMergeOpen(false);
            setMergeSourceCustomer(null);
          }}
          sourceCustomer={mergeSourceCustomer}
        />
      )}
    </div>
  );
}
