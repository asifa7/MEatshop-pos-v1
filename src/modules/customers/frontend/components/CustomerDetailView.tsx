import { useState } from 'react';
import {
  X, User, Edit3, Banknote, Lock, Unlock, ShoppingBag, 
  GitMerge, ChevronDown, ChevronUp, Clock, 
  UtensilsCrossed, CheckCircle2, AlertCircle, Sparkles,
  TrendingUp, Calendar, Scale, Activity, ShieldCheck,
  Award, RefreshCw, AlertTriangle, FileText, Printer, Download, Search,
  Truck, MapPin, Plus
} from 'lucide-react';
import {
  useCustomerCreditAccount, useFreezeCredit, useUnfreezeCredit,
  useCustomerReminders, useCreateReminder, useCreditNotes
} from '../hooks/useCustomerCredit';
import { 
  useCustomerActivityLog, 
  useCustomerPurchaseHistory, 
  useCustomerOverviewSummary,
  useCustomerIntelligence,
  useUpdateCustomerConsent,
  useSetManualCustomerTier
} from '../hooks/useCustomers';
import { useCustomerAddresses, useDeliveries, useSaveCustomerAddress } from '../../../delivery/frontend/hooks/useDelivery';
import AddressMapPickerModal from '../../../delivery/frontend/components/AddressMapPickerModal';
import { 
  formatPaise, 
  formatDate, 
  getCategoryBadgeColor, 
  getSegmentBadgeStyle,
  getLedgerRefLabel 
} from '../types/customer.types';
import type { Customer, CustomerPurchaseInvoice, CustomerStatement } from '../types/customer.types';
import LedgerView from './LedgerView';
import PaymentDialog from './PaymentDialog';
import CustomerMergeModal from './CustomerMergeModal';
import CustomerTimelineView from './CustomerTimelineView';

interface CustomerDetailViewProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (customer: Customer) => void;
}

type Tab = 'overview' | 'purchases' | 'visits' | 'behavior' | 'payments' | 'ledger' | 'notes' | 'reminders' | 'credit_notes' | 'consent' | 'deliveries' | 'activity';

export default function CustomerDetailView({ 
  customer, 
  isOpen, 
  onClose, 
  onEdit 
}: CustomerDetailViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [reminderChannel, setReminderChannel] = useState('sms');
  const [reminderMsg, setReminderMsg] = useState('');
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<number | null>(null);

  // Statement modal state
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const [stmtStart, setStmtStart] = useState(firstDayOfMonth);
  const [stmtEnd, setStmtEnd] = useState(today);
  const [statementData, setStatementData] = useState<CustomerStatement | null>(null);
  const [isStmtLoading, setIsStmtLoading] = useState(false);
  
  if (!isOpen || !customer) return null;

  const { data: creditAcc } = useCustomerCreditAccount(customer.id);
  const { data: reminders } = useCustomerReminders(customer.id);
  const { data: creditNotes } = useCreditNotes(customer.id);
  const { data: activityLogs } = useCustomerActivityLog(customer.id);
  const { data: purchaseData, isLoading: isPurchasesLoading } = useCustomerPurchaseHistory(customer.id, 100);
  const { data: overviewSummary } = useCustomerOverviewSummary(customer.id);
  const { data: intelligence, refetch: refetchIntelligence, isFetching: isRefreshingIntel } = useCustomerIntelligence(customer.id);
  const { data: customerAddresses = [] } = useCustomerAddresses(customer.id);
  const { data: customerDeliveries = [] } = useDeliveries({ customerId: String(customer.id) });
  const saveAddressMutation = useSaveCustomerAddress();

  const [isMapPickerOpen, setIsMapPickerOpen] = useState(false);
  const [isNewAddressOpen, setIsNewAddressOpen] = useState(false);
  const [newAddrDoor, setNewAddrDoor] = useState('');
  const [newAddrBuilding, setNewAddrBuilding] = useState('');
  const [newAddrStreet, setNewAddrStreet] = useState('');
  const [newAddrArea, setNewAddrArea] = useState('');
  const [newAddrLandmark, setNewAddrLandmark] = useState('');
  const [newAddrPincode, setNewAddrPincode] = useState('560001');
  const [newAddrLat, setNewAddrLat] = useState<number | null>(null);
  const [newAddrLng, setNewAddrLng] = useState<number | null>(null);

  const freezeCredit = useFreezeCredit();
  const unfreezeCredit = useUnfreezeCredit();
  const createReminder = useCreateReminder();
  const updateConsentMutation = useUpdateCustomerConsent();
  const setManualTierMutation = useSetManualCustomerTier();

  const handleToggleConsent = async (field: 'whatsapp_bill_consent' | 'marketing_consent', value: number) => {
    try {
      await updateConsentMutation.mutateAsync({
        customer_id: customer.id,
        [field]: value,
      });
      customer[field] = value;
    } catch (err) {
      console.error('Failed to update consent:', err);
    }
  };

  const handleSaveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddrArea.trim()) {
      alert('Area name is required');
      return;
    }
    try {
      await saveAddressMutation.mutateAsync({
        input: {
          customer_id: customer.id,
          door_no: newAddrDoor,
          building: newAddrBuilding,
          street: newAddrStreet,
          area: newAddrArea,
          landmark: newAddrLandmark,
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: newAddrPincode,
          latitude: newAddrLat,
          longitude: newAddrLng,
          is_default: customerAddresses.length === 0 ? 1 : 0,
        }
      });
      setIsNewAddressOpen(false);
      setNewAddrDoor('');
      setNewAddrBuilding('');
      setNewAddrStreet('');
      setNewAddrArea('');
      setNewAddrLandmark('');
      setNewAddrLat(null);
      setNewAddrLng(null);
    } catch (err: any) {
      alert(err.message || 'Failed to save address');
    }
  };

  const handleToggleFreeze = async () => {
    if (creditAcc?.is_frozen) {
      await unfreezeCredit.mutateAsync(customer.id);
    } else {
      const reason = prompt('Enter freeze reason:') || 'Requested by manager';
      await freezeCredit.mutateAsync({ customer_id: customer.id, reason });
    }
  };

  const handleSendReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderMsg.trim()) return;
    try {
      await createReminder.mutateAsync({
        customer_id: customer.id,
        channel: reminderChannel,
        template_type: 'payment_due',
        message: reminderMsg,
      });
      setReminderMsg('');
      setIsReminderOpen(false);
    } catch (err) {
      console.error(err);
    }
  };

  const hasPreferences = Boolean(
    customer.preferred_cut || 
    customer.skin_preference || 
    customer.cutting_preference || 
    customer.typical_quantity || 
    customer.packaging_preference ||
    customer.special_instructions
  );

  const segmentStyle = getSegmentBadgeStyle(intelligence?.customer_segment || customer.customer_segment);

  return (
    <div className="fixed inset-y-0 right-0 w-[720px] bg-surface-panel border-l border-border-subtle shadow-2xl flex flex-col z-40 select-none text-xs text-text-secondary animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-card/60">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 font-extrabold text-base">
            <User size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-text-primary leading-tight">{customer.name}</h3>
              <span className={`px-2 py-0.5 border rounded-full text-[9px] font-bold ${getCategoryBadgeColor(customer.category)}`}>
                {customer.category}
              </span>
              <span className={`px-2 py-0.5 border rounded-full text-[9px] font-bold flex items-center gap-1 ${segmentStyle.bg} ${segmentStyle.text} ${segmentStyle.border}`}>
                <span>{segmentStyle.icon}</span>
                <span>{segmentStyle.label}</span>
              </span>
            </div>
            <p className="text-[11px] text-text-secondary mt-0.5 font-mono">
              {customer.customer_code} {customer.phone ? `• ${customer.phone}` : ''} {customer.whatsapp && customer.whatsapp !== customer.phone ? `(WA: ${customer.whatsapp})` : ''}
            </p>

            {/* Quick Tier & Time Habit Selector */}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text-muted font-bold">Tier:</span>
                <select
                  value={customer.manual_tier || 'auto'}
                  onChange={async (e) => {
                    const val = e.target.value;
                    try {
                      await setManualTierMutation.mutateAsync({
                        customer_id: customer.id,
                        tier: val === 'auto' ? null : val,
                        preferred_time_slot: customer.preferred_time_slot,
                      });
                      customer.manual_tier = val === 'auto' ? null : val;
                      refetchIntelligence();
                    } catch (err: any) {
                      alert(`Error setting tier: ${err?.message || err}`);
                    }
                  }}
                  className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg border border-border-subtle bg-surface-card hover:border-amber-400 cursor-pointer outline-none text-text-primary"
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

              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text-muted font-bold">Usual Time:</span>
                <select
                  value={customer.preferred_time_slot || 'flexible'}
                  onChange={async (e) => {
                    const val = e.target.value;
                    try {
                      await setManualTierMutation.mutateAsync({
                        customer_id: customer.id,
                        tier: customer.manual_tier || null,
                        preferred_time_slot: val === 'flexible' ? null : val,
                      });
                      customer.preferred_time_slot = val === 'flexible' ? null : val;
                      refetchIntelligence();
                    } catch (err: any) {
                      alert(`Error setting time preference: ${err?.message || err}`);
                    }
                  }}
                  className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg border border-border-subtle bg-surface-card hover:border-amber-400 cursor-pointer outline-none text-text-primary"
                >
                  <option value="flexible">Auto Habit</option>
                  <option value="morning">🌅 Morning (6 AM - 12 PM)</option>
                  <option value="afternoon">☀️ Afternoon (12 PM - 5 PM)</option>
                  <option value="evening">🌙 Evening (5 PM+)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        
        {/* Badges & Actions */}
        <div className="flex items-center gap-2">
          {creditAcc?.is_frozen === 1 && (
            <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-500/20 text-yellow-800 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-500/30 font-semibold rounded text-[9px] uppercase">
              Frozen
            </span>
          )}
          {creditAcc?.is_blacklisted === 1 && (
            <span className="px-2 py-0.5 bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-400 border border-red-300 dark:border-red-500/30 font-semibold rounded text-[9px] uppercase">
              Blacklisted
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              onClose();
              onEdit(customer);
            }}
            className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all hover:scale-105 active:scale-95 cursor-pointer"
            title="Edit Customer Profile"
          >
            <Edit3 size={13} />
            <span>Edit Customer</span>
          </button>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-surface-hover rounded-xl text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-4 gap-2.5 p-4 border-b border-border-subtle bg-surface-app/40">
        <div className="bg-surface-card border border-border-subtle rounded-xl p-3 shadow-sm">
          <p className="text-[10px] text-text-muted font-medium uppercase">Outstanding</p>
          <p className="text-xs font-mono font-extrabold text-red-600 dark:text-red-400 mt-1">{formatPaise(customer.outstanding_balance_paise)}</p>
        </div>
        <div className="bg-surface-card border border-border-subtle rounded-xl p-3 shadow-sm">
          <p className="text-[10px] text-text-muted font-medium uppercase">Available Credit</p>
          <p className="text-xs font-mono font-extrabold text-brand-600 dark:text-brand-400 mt-1">
            {formatPaise(Math.max(0, customer.credit_limit_paise - customer.outstanding_balance_paise))}
          </p>
        </div>
        <div className="bg-surface-card border border-border-subtle rounded-xl p-3 shadow-sm">
          <p className="text-[10px] text-text-muted font-medium uppercase">Advance Balance</p>
          <p className="text-xs font-mono font-extrabold text-brand-600 dark:text-brand-400 mt-1">{formatPaise(customer.advance_balance_paise)}</p>
        </div>
        <div className="bg-surface-card border border-border-subtle rounded-xl p-3 shadow-sm">
          <p className="text-[10px] text-text-muted font-medium uppercase">Lifetime Purchases</p>
          <p className="text-xs font-mono font-extrabold text-text-primary mt-1">
            {formatPaise(intelligence?.total_spend_paise ?? overviewSummary?.total_purchases_paise ?? 0)}
          </p>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex border-b border-border-subtle bg-surface-card/40 overflow-x-auto">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'purchases', label: `Purchases (${purchaseData?.total_count ?? 0})` },
          { id: 'visits', label: `Visits & Habits (${intelligence?.total_visits ?? 0})`, highlight: true },
          { id: 'payments', label: 'Payments & Ledger' },
          { id: 'notes', label: `Notes & Reminders (${(reminders?.length ?? 0) + (creditNotes?.length ?? 0)})` },
          { id: 'consent', label: 'Consent & Privacy' },
          { id: 'deliveries', label: `Deliveries (${customerDeliveries.length})` },
          { id: 'activity', label: 'Activity' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as Tab)}
            className={`flex-shrink-0 px-4 py-3 text-center border-b-2 font-bold text-xs transition-colors flex items-center gap-1.5 ${
              activeTab === t.id
                ? 'border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/10'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.highlight && <Sparkles size={12} className={activeTab === t.id ? 'text-brand-500' : 'text-amber-500'} />}
            {t.label}
          </button>
        ))}
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Customer Health Readout Banner */}
            {intelligence && (
              <div className="p-4 rounded-2xl bg-surface-card border border-border-subtle shadow-subtle flex items-start gap-3">
                <div className="p-2 rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20 mt-0.5">
                  <Activity size={18} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-text-primary uppercase tracking-wider">Customer Health & Intelligence</span>
                    <button
                      onClick={() => refetchIntelligence()}
                      className="text-[10px] text-text-muted hover:text-brand-500 flex items-center gap-1 transition-colors"
                      title="Recalculate live"
                    >
                      <RefreshCw size={11} className={isRefreshingIntel ? 'animate-spin' : ''} />
                      <span>{isRefreshingIntel ? 'Updating...' : 'Live'}</span>
                    </button>
                  </div>
                  <p className="text-xs font-semibold text-text-primary mt-1 leading-relaxed">
                    {intelligence.segment_health_summary}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-text-secondary font-mono">
                    <span>Visits: <strong className="text-text-primary font-bold">{intelligence.total_visits}</strong></span>
                    <span>•</span>
                    <span>Avg Bill: <strong className="text-text-primary font-bold">{formatPaise(intelligence.average_bill_paise)}</strong></span>
                    <span>•</span>
                    <span>Cadence: <strong className="text-brand-600 dark:text-brand-400 font-bold">{intelligence.purchase_frequency_label}</strong></span>
                    {intelligence.expected_next_visit && (
                      <>
                        <span>•</span>
                        <span>Expected Next: <strong className="text-emerald-700 dark:text-emerald-400 font-bold">{formatDate(intelligence.expected_next_visit)}</strong></span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Actions Bar */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 shadow-sm">
              <h4 className="font-extrabold text-text-primary text-xs mb-3">Quick Actions</h4>
              <div className="grid grid-cols-5 gap-2">
                <button
                  onClick={() => setIsPaymentOpen(true)}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-subtle bg-surface-panel hover:bg-surface-hover hover:border-brand-500 text-text-primary transition-all group"
                >
                  <Banknote size={18} className="text-brand-600 dark:text-brand-400 mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-[11px] text-text-primary">Record Payment</span>
                </button>
                <button
                  onClick={() => setIsStatementOpen(true)}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-subtle bg-surface-panel hover:bg-surface-hover hover:border-brand-500 text-text-primary transition-all group"
                >
                  <FileText size={18} className="text-emerald-600 dark:text-emerald-400 mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-[11px] text-text-primary">Print Statement</span>
                </button>
                <button
                  onClick={() => onEdit(customer)}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-subtle bg-surface-panel hover:bg-surface-hover hover:border-brand-500 text-text-primary transition-all group"
                >
                  <Edit3 size={18} className="text-blue-600 dark:text-blue-400 mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-[11px] text-text-primary">Edit Profile</span>
                </button>
                <button
                  onClick={() => setIsMergeOpen(true)}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-subtle bg-surface-panel hover:bg-surface-hover hover:border-amber-500 text-text-primary transition-all group"
                >
                  <GitMerge size={18} className="text-amber-600 dark:text-amber-400 mb-1.5 group-hover:scale-110 transition-transform" />
                  <span className="font-bold text-[11px] text-text-primary">Merge Account</span>
                </button>
                <button
                  onClick={handleToggleFreeze}
                  className="flex flex-col items-center justify-center p-3 rounded-xl border border-border-subtle bg-surface-panel hover:bg-surface-hover hover:border-yellow-500 text-text-primary transition-all group"
                >
                  {creditAcc?.is_frozen ? (
                    <Unlock size={18} className="text-emerald-600 dark:text-emerald-400 mb-1.5 group-hover:scale-110 transition-transform" />
                  ) : (
                    <Lock size={18} className="text-yellow-600 dark:text-yellow-400 mb-1.5 group-hover:scale-110 transition-transform" />
                  )}
                  <span className="font-bold text-[11px] text-text-primary">
                    {creditAcc?.is_frozen ? 'Unfreeze Credit' : 'Freeze Credit'}
                  </span>
                </button>
              </div>
            </div>

            {/* Usual Order Preview (Intelligence Payoff) */}
            {intelligence && intelligence.typical_basket.length > 0 && (
              <div className="bg-brand-500/5 border border-brand-500/30 rounded-2xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-brand-500" />
                  <h4 className="font-extrabold text-text-primary text-xs">Customer's Usual Order</h4>
                </div>
                <p className="text-xs font-semibold text-text-primary">
                  {intelligence.typical_basket_summary}
                </p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {intelligence.typical_basket.map((item, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded-lg bg-surface-card border border-border-subtle text-[10px] font-mono text-text-primary">
                      {item.typical_qty_display} {item.product_name} {item.variant_name !== 'Default' ? `(${item.variant_name})` : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Meat Shop Cutting & Preparation Preferences */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <UtensilsCrossed size={14} className="text-brand-500" />
                <h4 className="font-extrabold text-text-primary text-xs">Meat Preparation & Cutting Preferences</h4>
              </div>
              
              {hasPreferences ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[10px] text-text-muted font-medium block">Preferred Cut</span>
                      <strong className="text-text-primary font-bold mt-0.5 block">{customer.preferred_cut || 'Any / No Preference'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[10px] text-text-muted font-medium block">Skin Preference</span>
                      <strong className="text-text-primary font-bold mt-0.5 block">{customer.skin_preference || 'Any'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[10px] text-text-muted font-medium block">Cutting Style</span>
                      <strong className="text-brand-600 dark:text-brand-400 font-bold mt-0.5 block">{customer.cutting_preference || 'Standard'}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[10px] text-text-muted font-medium block">Typical Quantity</span>
                      <strong className="text-text-primary font-bold mt-0.5 block">{customer.typical_quantity || '—'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[10px] text-text-muted font-medium block">Delivery Preference</span>
                      <strong className="text-text-primary font-bold mt-0.5 block">{customer.delivery_preference || 'Counter Pickup'}</strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[10px] text-text-muted font-medium block">Packaging</span>
                      <strong className="text-text-primary font-bold mt-0.5 block">{customer.packaging_preference || 'Standard'}</strong>
                    </div>
                  </div>

                  {customer.special_instructions && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-300">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider block mb-0.5 text-amber-800 dark:text-amber-300">Special Instructions</span>
                      <p className="text-xs text-amber-950 dark:text-amber-200 font-medium">{customer.special_instructions}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-text-muted text-[11px] italic">No structured cutting preferences configured yet.</p>
              )}
            </div>

            {/* Profile Information */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 space-y-3 shadow-sm">
              <h4 className="font-extrabold text-text-primary text-xs mb-2">Account Details</h4>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div>
                  <span className="text-text-muted">Business Name:</span>{' '}
                  <span className="text-text-primary font-medium">{customer.business_name || '—'}</span>
                </div>
                <div>
                  <span className="text-text-muted">GSTIN:</span>{' '}
                  <span className="text-text-primary font-mono font-medium">{customer.gstin || '—'}</span>
                </div>
                <div>
                  <span className="text-text-muted">Customer Group:</span>{' '}
                  <span className="text-text-primary font-medium">{customer.group_name || 'Retail Customers'}</span>
                </div>
                <div>
                  <span className="text-text-muted">Preferred Payment:</span>{' '}
                  <span className="text-text-primary font-medium uppercase">{intelligence?.preferred_payment_method || customer.preferred_payment_method || 'CASH'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-text-muted">Billing Address:</span>{' '}
                  <span className="text-text-primary font-medium">
                    {[customer.billing_address_line1, customer.billing_city, customer.billing_pincode].filter(Boolean).join(', ') || '—'}
                  </span>
                </div>
                {customer.notes && (
                  <div className="col-span-2">
                    <span className="text-text-muted">Notes:</span>{' '}
                    <span className="text-text-primary font-medium">{customer.notes}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PURCHASES (Invoice History) */}
        {activeTab === 'purchases' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-text-primary text-xs">Customer Purchase History</h4>
                <p className="text-[10px] text-text-muted">Chronological record of completed invoices and line items</p>
              </div>
              <span className="text-[10px] text-text-muted font-mono">
                {purchaseData?.total_count ?? 0} Invoices Found
              </span>
            </div>

            {isPurchasesLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-surface-card rounded-xl animate-pulse" />
                ))}
              </div>
            ) : !purchaseData || purchaseData.invoices.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border-subtle rounded-2xl bg-surface-card/40">
                <ShoppingBag size={28} className="mx-auto text-text-muted mb-2" />
                <p className="font-bold text-text-primary text-xs">No Purchases Recorded</p>
                <p className="text-[10px] text-text-muted mt-1">This customer has not completed any billed invoices yet.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {purchaseData.invoices.map((inv: CustomerPurchaseInvoice) => {
                  const isExpanded = expandedInvoiceId === inv.id;
                  return (
                    <div 
                      key={inv.id}
                      className="bg-surface-card border border-border-subtle rounded-xl overflow-hidden hover:border-brand-500/40 transition-colors shadow-sm"
                    >
                      <div 
                        onClick={() => setExpandedInvoiceId(isExpanded ? null : inv.id)}
                        className="p-3.5 flex items-center justify-between cursor-pointer select-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-surface-panel border border-border-subtle flex items-center justify-center text-brand-600 dark:text-brand-400 font-mono font-bold text-xs">
                            #{inv.id}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-text-primary text-xs">{inv.invoice_number}</span>
                              <span className="text-[10px] text-text-muted">• {formatDate(inv.created_at)}</span>
                              <span className="px-1.5 py-0.2 rounded text-[8px] font-bold uppercase bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30">
                                {inv.payment_status}
                              </span>
                            </div>
                            <p className="text-[11px] text-text-secondary mt-0.5 line-clamp-1">
                              {inv.items_summary || `${inv.items_count} items`}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-mono font-bold text-text-primary text-xs">{formatPaise(inv.total_paise)}</p>
                            <p className="text-[9px] text-text-muted uppercase">
                              {inv.payment_methods.join(', ') || 'CASH'}
                            </p>
                          </div>
                          <div className="text-text-muted">
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                      </div>

                      {/* Expandable Line Items Table */}
                      {isExpanded && (
                        <div className="px-4 pb-3.5 pt-1 border-t border-border-subtle bg-surface-panel/40">
                          <table className="w-full text-left text-[10px]">
                            <thead>
                              <tr className="text-text-muted border-b border-border-subtle/50">
                                <th className="py-1.5 font-semibold">Item & Variant</th>
                                <th className="py-1.5 text-right font-semibold">Qty</th>
                                <th className="py-1.5 text-right font-semibold">Rate</th>
                                <th className="py-1.5 text-right font-semibold">Line Total</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border-subtle/30">
                              {inv.items.map((it, idx) => (
                                <tr key={idx} className="text-text-secondary">
                                  <td className="py-1.5 font-medium text-text-primary">
                                    {it.product_name} {it.variant_name !== 'Default' ? `(${it.variant_name})` : ''}
                                  </td>
                                  <td className="py-1.5 text-right font-mono text-text-primary">
                                    {it.unit_label === 'kg' ? `${it.quantity.toFixed(2)} kg` : `${Math.round(it.quantity)} pcs`}
                                  </td>
                                  <td className="py-1.5 text-right font-mono text-text-muted">
                                    {formatPaise(it.rate_paise)}
                                  </td>
                                  <td className="py-1.5 text-right font-mono font-bold text-text-primary">
                                    {formatPaise(it.line_total_paise)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB: DELIVERIES & ADDRESSES */}
        {activeTab === 'deliveries' && (
          <div className="space-y-6">
            {/* 1. Saved Doorstep Addresses */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-brand-500" />
                  <h4 className="font-extrabold text-text-primary text-xs">Saved Delivery Addresses ({customerAddresses.length})</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewAddressOpen(true)}
                  className="px-3 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-sm transition-all"
                >
                  <Plus size={12} /> Add Address
                </button>
              </div>

              {isNewAddressOpen && (
                <form onSubmit={handleSaveAddress} className="p-3.5 bg-surface-panel border border-brand-500/40 rounded-xl space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between font-bold text-xs text-text-primary">
                    <span>Add New Address</span>
                    <button
                      type="button"
                      onClick={() => setIsMapPickerOpen(true)}
                      className="text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold text-xs"
                    >
                      <MapPin size={12} />
                      {newAddrLat ? 'Pin Placed ✅' : 'Drop Pin on Map'}
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Door / Flat #"
                      value={newAddrDoor}
                      onChange={e => setNewAddrDoor(e.target.value)}
                      className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-text-primary outline-none focus:border-brand-500 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="Building / Apartment"
                      value={newAddrBuilding}
                      onChange={e => setNewAddrBuilding(e.target.value)}
                      className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-text-primary outline-none focus:border-brand-500 text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Street / Cross"
                      value={newAddrStreet}
                      onChange={e => setNewAddrStreet(e.target.value)}
                      className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-text-primary outline-none focus:border-brand-500 text-xs"
                    />
                    <input
                      type="text"
                      required
                      placeholder="Area / Locality *"
                      value={newAddrArea}
                      onChange={e => setNewAddrArea(e.target.value)}
                      className="px-3 py-1.5 bg-surface-card border border-brand-500/50 rounded-lg text-text-primary outline-none focus:border-brand-500 text-xs"
                    />
                    <input
                      type="text"
                      placeholder="PIN Code"
                      value={newAddrPincode}
                      onChange={e => setNewAddrPincode(e.target.value)}
                      className="px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-text-primary outline-none focus:border-brand-500 text-xs"
                    />
                  </div>

                  <input
                    type="text"
                    placeholder="Landmark (Optional)"
                    value={newAddrLandmark}
                    onChange={e => setNewAddrLandmark(e.target.value)}
                    className="w-full px-3 py-1.5 bg-surface-card border border-border-subtle rounded-lg text-text-primary outline-none focus:border-brand-500 text-xs"
                  />

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsNewAddressOpen(false)}
                      className="px-3 py-1 text-text-muted hover:text-text-primary text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saveAddressMutation.isPending}
                      className="px-4 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold text-xs shadow-sm"
                    >
                      Save Address
                    </button>
                  </div>
                </form>
              )}

              {customerAddresses.length === 0 ? (
                <div className="p-4 text-center text-text-muted text-xs bg-surface-panel rounded-xl">
                  No saved doorstep addresses for this customer yet.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {customerAddresses.map(addr => (
                    <div key={addr.id} className="p-3 bg-surface-panel border border-border-subtle rounded-xl space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-text-primary">{addr.label}</span>
                        {addr.is_default === 1 && (
                          <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-1.5 py-0.5 rounded">Default</span>
                        )}
                      </div>
                      <p className="text-text-secondary text-[11px]">
                        {[addr.door_no, addr.building, addr.street, addr.area].filter(Boolean).join(', ')}
                      </p>
                      <p className="text-[10px] text-text-muted">{addr.city} — {addr.pincode}</p>
                      {addr.latitude && addr.longitude && (
                        <span className="text-[9px] font-mono text-blue-400 block pt-0.5">
                          📍 Lat/Lng: {addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Customer Delivery Orders History */}
            <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 space-y-3 shadow-sm">
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-brand-500" />
                <h4 className="font-extrabold text-text-primary text-xs">Delivery Orders History ({customerDeliveries.length})</h4>
              </div>

              {customerDeliveries.length === 0 ? (
                <div className="p-4 text-center text-text-muted text-xs bg-surface-panel rounded-xl">
                  No delivery orders logged for this customer.
                </div>
              ) : (
                <div className="space-y-2">
                  {customerDeliveries.map(del => (
                    <div key={del.id} className="p-3 bg-surface-panel border border-border-subtle rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-text-primary">{del.delivery_number}</span>
                          <span className="text-[10px] text-text-muted">• {del.requested_date}</span>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-brand-500/10 text-brand-500">
                            {del.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-secondary mt-0.5">
                          Driver: <strong className="text-text-primary">{del.driver_name || 'Unassigned'}</strong> · Area: {del.address?.area || 'Local'}
                        </p>
                      </div>

                      <div className="text-right font-mono">
                        <div className="font-bold text-text-primary">{formatPaise(del.total_paise)}</div>
                        <span className="text-[10px] text-text-muted uppercase font-bold">{del.payment_method}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: VISITS & HABITS INTELLIGENCE */}
        {(activeTab === 'visits' || activeTab === 'behavior') && (
          <div className="space-y-6">
            {intelligence ? (
              <>
                {/* Visit Rhythm & Cadence Card */}
                <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-brand-500" />
                      <h4 className="font-extrabold text-text-primary text-xs">Visit Cadence & Predictor</h4>
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/30">
                      {intelligence.purchase_frequency_label}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[9px] text-text-muted uppercase font-medium block">Mean Visit Gap</span>
                      <strong className="text-sm font-mono font-bold text-text-primary mt-0.5 block">
                        {intelligence.average_visit_interval != null ? `${intelligence.average_visit_interval} days` : '—'}
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[9px] text-text-muted uppercase font-medium block">Median Gap</span>
                      <strong className="text-sm font-mono font-bold text-text-primary mt-0.5 block">
                        {intelligence.median_visit_interval != null ? `${intelligence.median_visit_interval} days` : '—'}
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[9px] text-text-muted uppercase font-medium block">Last Visit</span>
                      <strong className="text-xs font-mono font-bold text-text-primary mt-0.5 block">
                        {intelligence.days_since_last_purchase != null ? `${intelligence.days_since_last_purchase}d ago` : 'Never'}
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[9px] text-text-muted uppercase font-medium block">Expected Next</span>
                      <strong className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                        {intelligence.expected_next_visit ? formatDate(intelligence.expected_next_visit) : '—'}
                      </strong>
                    </div>
                  </div>

                  {intelligence.days_overdue > 0 && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-300 flex items-center gap-2">
                      <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 flex-shrink-0" />
                      <span className="text-xs">
                        Customer is overdue by <strong className="font-bold">{intelligence.days_overdue} days</strong> past their expected visit cycle.
                      </span>
                    </div>
                  )}
                </div>

                {/* Spend & Meat Weight Analytics Card */}
                <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Scale size={16} className="text-brand-500" />
                    <h4 className="font-extrabold text-text-primary text-xs">Spend & Meat Weight Metrics</h4>
                  </div>

                  <div className="grid grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[9px] text-text-muted uppercase font-medium block">Average Bill</span>
                      <strong className="text-sm font-mono font-bold text-text-primary mt-0.5 block">
                        {formatPaise(intelligence.average_bill_paise)}
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[9px] text-text-muted uppercase font-medium block">Lifetime Meat Qty</span>
                      <strong className="text-sm font-mono font-bold text-brand-600 dark:text-brand-400 mt-0.5 block">
                        {(intelligence.total_weight_grams / 1000).toFixed(1)} kg
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[9px] text-text-muted uppercase font-medium block">Avg Qty / Visit</span>
                      <strong className="text-sm font-mono font-bold text-text-primary mt-0.5 block">
                        {(intelligence.average_weight_grams_per_visit / 1000).toFixed(2)} kg
                      </strong>
                    </div>
                    <div className="p-3 rounded-xl bg-surface-panel border border-border-subtle">
                      <span className="text-[9px] text-text-muted uppercase font-medium block">Lifetime Value</span>
                      <strong className="text-sm font-mono font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                        {formatPaise(intelligence.customer_lifetime_value_paise)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Favorite Products Leaderboard */}
                <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Award size={16} className="text-amber-500" />
                      <h4 className="font-extrabold text-text-primary text-xs">Favorite Meat Items Leaderboard</h4>
                    </div>
                    <span className="text-[10px] text-text-muted">Ranked by purchase frequency</span>
                  </div>

                  {intelligence.favorite_products.length === 0 ? (
                    <p className="text-text-muted text-[11px] italic py-2">No item purchase history available.</p>
                  ) : (
                    <div className="divide-y divide-border-subtle/50">
                      {intelligence.favorite_products.map((fav, rank) => (
                        <div key={fav.product_variant_id} className="py-2.5 flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-3">
                            <span className="w-5 h-5 rounded-full bg-surface-panel border border-border-subtle text-[10px] font-bold flex items-center justify-center text-text-muted">
                              #{rank + 1}
                            </span>
                            <div>
                              <p className="font-bold text-text-primary">
                                {fav.product_name} {fav.variant_name !== 'Default' ? `(${fav.variant_name})` : ''}
                              </p>
                              <p className="text-[10px] text-text-muted">
                                Bought {fav.purchase_count} times • Total {fav.total_quantity} {fav.unit_label}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{formatPaise(fav.total_spend_paise)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Shopping Habits & Payment Reliability */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Shopping Timing Habits */}
                  <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Clock size={16} className="text-blue-500" />
                      <h4 className="font-extrabold text-text-primary text-xs">Shopping Habits</h4>
                    </div>
                    <div className="space-y-2 text-[11px]">
                      <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle flex justify-between items-center">
                        <span className="text-text-muted font-medium">Preferred Day:</span>
                        <strong className="text-text-primary font-bold">{intelligence.preferred_visit_day}</strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle flex justify-between items-center">
                        <span className="text-text-muted font-medium">Preferred Time:</span>
                        <strong className="text-text-primary font-bold">{intelligence.preferred_visit_time}</strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle flex justify-between items-center">
                        <span className="text-text-muted font-medium">Preferred Payment:</span>
                        <strong className="text-text-primary font-bold uppercase">{intelligence.preferred_payment_method}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Payment Reliability */}
                  <div className="bg-surface-card border border-border-subtle rounded-2xl p-4 space-y-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-emerald-500" />
                      <h4 className="font-extrabold text-text-primary text-xs">Payment Reliability</h4>
                    </div>
                    <div className="space-y-2 text-[11px]">
                      <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle flex justify-between items-center">
                        <span className="text-text-muted font-medium">Reliability Rating:</span>
                        <span className={`font-bold px-2 py-0.5 rounded text-[10px] ${
                          intelligence.payment_reliability.rating === 'Excellent' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-800 dark:text-emerald-400' :
                          intelligence.payment_reliability.rating === 'Good' ? 'bg-blue-100 dark:bg-blue-500/10 text-blue-800 dark:text-blue-400' :
                          intelligence.payment_reliability.rating === 'Fair' ? 'bg-yellow-100 dark:bg-yellow-500/10 text-yellow-800 dark:text-yellow-400' :
                          'bg-zinc-200 dark:bg-zinc-500/10 text-zinc-800 dark:text-zinc-400'
                        }`}>
                          {intelligence.payment_reliability.rating}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle flex justify-between items-center">
                        <span className="text-text-muted font-medium">Avg Payoff Window:</span>
                        <strong className="text-text-primary font-bold">
                          {intelligence.payment_reliability.avg_days_to_pay > 0 ? `${intelligence.payment_reliability.avg_days_to_pay} days` : 'Immediate'}
                        </strong>
                      </div>
                      <div className="p-2.5 rounded-xl bg-surface-panel border border-border-subtle flex justify-between items-center">
                        <span className="text-text-muted font-medium">Reliability Score:</span>
                        <strong className="text-emerald-700 dark:text-emerald-400 font-mono font-bold">{intelligence.payment_reliability.score} / 100</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-center border border-dashed border-border-subtle rounded-2xl bg-surface-card/40">
                <Activity size={28} className="mx-auto text-text-muted mb-2 animate-spin" />
                <p className="font-bold text-text-primary text-xs">Calculating Customer Intelligence...</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: PAYMENTS & LEDGER */}
        {(activeTab === 'payments' || activeTab === 'ledger') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-text-primary text-xs">Direct Payments & Credit Ledger</h4>
                <p className="text-[10px] text-text-muted mt-0.5">Complete chronological debit & credit movements with running balance</p>
              </div>
              <button
                onClick={() => setIsPaymentOpen(true)}
                className="btn-primary text-[10px] px-3.5 py-2 flex items-center gap-1.5 font-bold shadow-sm"
              >
                <Banknote size={14} /> Record Payment
              </button>
            </div>
            <LedgerView customerId={customer.id} customerName={customer.name} />
          </div>
        )}

        {/* TAB 5: NOTES & REMINDERS */}
        {(activeTab === 'notes' || activeTab === 'reminders' || activeTab === 'credit_notes') && (
          <div className="space-y-6">
            {/* Customer Internal Profile Notes */}
            <div className="p-4 rounded-2xl bg-surface-card border border-border-subtle shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-text-primary uppercase tracking-wider">Account Notes & Cutting Preferences</span>
                <button onClick={() => onEdit(customer)} className="text-[11px] text-brand-500 hover:underline flex items-center gap-1 font-bold">
                  <Edit3 size={12} /> Edit Notes
                </button>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed bg-surface-panel p-3 rounded-xl border border-border-subtle">
                {customer.notes || customer.special_instructions || 'No internal notes recorded for this customer profile.'}
              </p>
            </div>

            {/* Payment & Visit Reminders */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-extrabold text-text-primary text-xs">Payment Due Reminders</h4>
                <button
                  onClick={() => setIsReminderOpen(!isReminderOpen)}
                  className="btn-primary text-[10px] px-3 py-1.5 font-bold"
                >
                  Send Reminder
                </button>
              </div>

              {isReminderOpen && (
                <form onSubmit={handleSendReminder} className="p-4 bg-surface-card border border-border-subtle rounded-2xl space-y-3 shadow-sm">
                  <div className="flex gap-2">
                    <select
                      value={reminderChannel}
                      onChange={(e) => setReminderChannel(e.target.value)}
                      className="bg-surface-panel border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs text-text-primary"
                    >
                      <option value="sms">SMS</option>
                      <option value="whatsapp">WhatsApp</option>
                      <option value="email">Email</option>
                    </select>
                    <input
                      type="text"
                      value={reminderMsg}
                      onChange={(e) => setReminderMsg(e.target.value)}
                      placeholder="Enter reminder note..."
                      className="flex-1 bg-surface-panel border border-border-subtle rounded-lg px-3 py-1.5 text-xs text-text-primary"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setIsReminderOpen(false)} className="btn-secondary text-[10px] px-3 py-1">Cancel</button>
                    <button type="submit" className="btn-primary text-[10px] px-3 py-1">Send</button>
                  </div>
                </form>
              )}

              {!reminders || reminders.length === 0 ? (
                <p className="text-text-muted text-[11px] italic">No reminders sent yet.</p>
              ) : (
                <div className="space-y-2">
                  {reminders.map((r) => (
                    <div key={r.id} className="p-3 bg-surface-card border border-border-subtle rounded-xl text-[11px] flex justify-between items-center shadow-sm">
                      <div>
                        <span className="font-bold text-text-primary uppercase text-[9px] px-1.5 py-0.5 bg-surface-panel rounded border border-border-subtle mr-2">
                          {r.channel}
                        </span>
                        <span className="text-text-secondary">{r.message || (r as any).message_body}</span>
                      </div>
                      <span className="text-[10px] text-text-muted">{formatDate(r.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Credit Notes Log */}
            <div className="space-y-4">
              <h4 className="font-extrabold text-text-primary text-xs">Credit Notes Log</h4>
              {!creditNotes || creditNotes.length === 0 ? (
                <p className="text-text-muted text-[11px] italic">No credit notes issued for this customer.</p>
              ) : (
                <div className="divide-y divide-border-subtle border border-border-subtle rounded-2xl overflow-hidden bg-surface-card shadow-sm">
                  {creditNotes.map((note) => (
                    <div key={note.id} className="p-3.5 flex items-center justify-between text-[11px]">
                      <div>
                        <p className="font-bold text-text-primary font-mono">{note.credit_note_number}</p>
                        <p className="text-text-muted text-[10px]">{note.reason} • {formatDate(note.created_at)}</p>
                      </div>
                      <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{formatPaise(note.amount_paise)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 6: PRIVACY & CONSENT MANAGEMENT */}
        {activeTab === 'consent' && (
          <div className="space-y-6">
            <div className="p-5 rounded-2xl bg-surface-card border border-border-subtle shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-500 border border-brand-500/20">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h4 className="font-extrabold text-sm text-text-primary">Communication & Privacy Consent</h4>
                  <p className="text-xs text-text-muted mt-0.5">
                    Explicit customer consent controls for digital invoices and marketing reminders
                  </p>
                </div>
              </div>

              <div className="divide-y divide-border-subtle">
                {/* Consent 1: WhatsApp Digital Invoices */}
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-emerald-500" />
                      <span className="font-bold text-xs text-text-primary">Digital Bill via WhatsApp</span>
                      {customer.whatsapp_bill_consent === 1 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          Opted In ✓
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/10 text-text-muted border border-border-subtle">
                          Opted Out
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed max-w-xl">
                      Permits preparing and sending transaction invoices via standard WhatsApp link (wa.me). No spam or marketing is allowed under this setting.
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleConsent('whatsapp_bill_consent', customer.whatsapp_bill_consent === 1 ? 0 : 1)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                      customer.whatsapp_bill_consent === 1
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-surface-panel hover:bg-surface-hover border border-border-subtle text-text-secondary'
                    }`}
                  >
                    {customer.whatsapp_bill_consent === 1 ? 'Consent Granted' : 'Grant Consent'}
                  </button>
                </div>

                {/* Consent 2: Marketing & Retention Reminders */}
                <div className="py-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className="text-amber-500" />
                      <span className="font-bold text-xs text-text-primary">Marketing & Visit Reminders</span>
                      {customer.marketing_consent === 1 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          Opted In ✓
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/10 text-text-muted border border-border-subtle">
                          Opted Out
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted leading-relaxed max-w-xl">
                      Permits the Retention Desk to send personalized weekend specials, fresh arrival alerts, and gentle visit reminders on WhatsApp.
                    </p>
                  </div>
                  <button
                    onClick={() => handleToggleConsent('marketing_consent', customer.marketing_consent === 1 ? 0 : 1)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ${
                      customer.marketing_consent === 1
                        ? 'bg-amber-600 hover:bg-amber-700 text-white'
                        : 'bg-surface-panel hover:bg-surface-hover border border-border-subtle text-text-secondary'
                    }`}
                  >
                    {customer.marketing_consent === 1 ? 'Consent Granted' : 'Grant Consent'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: ACTIVITY TIMELINE */}
        {activeTab === 'activity' && (
          <div className="space-y-3">
            <CustomerTimelineView customerId={customer.id} />
          </div>
        )}
      </div>

      {/* Payment Dialog Modal */}
      {isPaymentOpen && (
        <PaymentDialog
          isOpen={isPaymentOpen}
          onClose={() => setIsPaymentOpen(false)}
          customer={customer}
        />
      )}

      {/* Merge Dialog Modal */}
      {isMergeOpen && (
        <CustomerMergeModal
          isOpen={isMergeOpen}
          onClose={() => setIsMergeOpen(false)}
          sourceCustomer={customer}
        />
      )}

      {/* Customer Statement Modal (A4 Printable) */}
      {isStatementOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden text-xs select-none">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-card/80 shrink-0">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-emerald-500" />
                <h3 className="text-sm font-bold text-text-primary">
                  Statement of Account: {customer.name} ({customer.customer_code})
                </h3>
              </div>
              <button
                onClick={() => setIsStatementOpen(false)}
                className="p-1.5 hover:bg-surface-hover rounded-full text-text-secondary hover:text-text-primary transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Date Range Selector Bar */}
            <div className="p-4 bg-surface-card border-b border-border-subtle flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div>
                  <label className="block text-[10px] text-text-secondary font-bold mb-0.5">From Date</label>
                  <input
                    type="date"
                    value={stmtStart}
                    onChange={(e) => setStmtStart(e.target.value)}
                    className="bg-surface-panel border border-border-subtle rounded-lg px-2.5 py-1.5 text-text-primary font-mono text-xs shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-text-secondary font-bold mb-0.5">To Date</label>
                  <input
                    type="date"
                    value={stmtEnd}
                    onChange={(e) => setStmtEnd(e.target.value)}
                    className="bg-surface-panel border border-border-subtle rounded-lg px-2.5 py-1.5 text-text-primary font-mono text-xs shadow-sm"
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!customer || !stmtStart || !stmtEnd) return;
                    setIsStmtLoading(true);
                    try {
                      const res = (await window.api.invoke('customers:get-statement', {
                        customer_id: customer.id,
                        startDate: stmtStart,
                        endDate: stmtEnd,
                      })) as { success: boolean; data?: CustomerStatement };
                      if (res.success && res.data) {
                        setStatementData(res.data);
                      }
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setIsStmtLoading(false);
                    }
                  }}
                  disabled={isStmtLoading}
                  className="mt-4 px-4 py-1.5 bg-brand-500 hover:bg-brand-400 text-white rounded-lg font-bold text-xs shadow-sm transition-colors disabled:opacity-50"
                >
                  {isStmtLoading ? 'Generating...' : 'Generate'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (!statementData) return;
                    const header = ['Date', 'Entry Type', 'Invoice / Ref #', 'Description', 'Debit (₹)', 'Credit (₹)', 'Running Balance (₹)'];
                    const csvRows = statementData.entries.map((e) => [
                      e.entry_date,
                      getLedgerRefLabel(e.ref_type),
                      e.invoice_number || e.ref_id || '',
                      `"${(e.description || '').replace(/"/g, '""')}"`,
                      (e.debit_paise / 100).toFixed(2),
                      (e.credit_paise / 100).toFixed(2),
                      (e.running_balance_paise / 100).toFixed(2),
                    ]);
                    const fileContent =
                      `Customer Statement: ${customer.name} (${customer.customer_code})\n` +
                      `Period: ${stmtStart} to ${stmtEnd}\n` +
                      `Opening Balance: ${(statementData.opening_balance_paise / 100).toFixed(2)}\n` +
                      `Closing Balance: ${(statementData.closing_balance_paise / 100).toFixed(2)}\n\n` +
                      [header.join(','), ...csvRows.map((r) => r.join(','))].join('\n');
                    const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `Statement_${customer.customer_code}_${stmtStart}_${stmtEnd}.csv`;
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                  disabled={!statementData}
                  className="px-3 py-1.5 bg-surface-panel hover:bg-surface-hover border border-border-subtle rounded-lg font-bold text-xs text-text-primary flex items-center gap-1.5 shadow-sm disabled:opacity-40"
                >
                  <Download size={14} className="text-emerald-500" />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={() => window.print()}
                  disabled={!statementData}
                  className="px-4 py-1.5 bg-brand-500 hover:bg-brand-400 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-40"
                >
                  <Printer size={14} />
                  <span>Print A4 Statement</span>
                </button>
              </div>
            </div>

            {/* Statement Preview Content */}
            <div className="p-6 overflow-y-auto flex-1 bg-surface-card">
              {statementData ? (
                <div className="bg-white text-black p-8 rounded-2xl border border-gray-200 shadow-md space-y-6 font-sans">
                  {/* Shop Header */}
                  <div className="border-b-2 border-gray-800 pb-5 flex justify-between items-start">
                    <div>
                      <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                        {statementData.shopInfo?.name || 'PREMIUM MEAT SHOP'}
                      </h1>
                      <p className="text-xs text-gray-600 mt-1">{statementData.shopInfo?.address}</p>
                      <div className="text-[11px] text-gray-600 font-mono mt-0.5 space-x-3">
                        {statementData.shopInfo?.phone && <span>Phone: {statementData.shopInfo.phone}</span>}
                        {statementData.shopInfo?.gstin && <span>GSTIN: {statementData.shopInfo.gstin}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="inline-block px-3 py-1 bg-gray-900 text-white font-extrabold text-xs uppercase tracking-widest rounded">
                        STATEMENT OF ACCOUNT
                      </span>
                      <p className="text-xs font-mono font-bold text-gray-800 mt-2">Date: {formatDate(today)}</p>
                      <p className="text-[11px] font-mono text-gray-600">
                        Period: {formatDate(statementData.startDate)} – {formatDate(statementData.endDate)}
                      </p>
                    </div>
                  </div>

                  {/* Customer Information Block */}
                  <div className="grid grid-cols-2 gap-6 bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div>
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block">Customer:</span>
                      <h3 className="text-sm font-extrabold text-gray-900 mt-0.5">{customer.name}</h3>
                      <p className="text-[11px] font-mono text-gray-600">Code: {customer.customer_code}</p>
                      {customer.phone && <p className="text-[11px] font-mono text-gray-600">Phone: {customer.phone}</p>}
                    </div>
                    <div className="text-right flex flex-col justify-between">
                      <div>
                        {customer.gstin && <p className="text-[11px] font-mono text-gray-700">GSTIN: {customer.gstin}</p>}
                        {customer.billing_address_line1 && (
                          <p className="text-xs text-gray-600 mt-0.5">
                            {customer.billing_address_line1}, {customer.billing_city}
                          </p>
                        )}
                      </div>
                      <div className="pt-2 border-t border-gray-200">
                        <span className="text-[10px] text-gray-500 font-bold uppercase">Outstanding:</span>
                        <span className="text-xs font-bold text-red-600 ml-1">
                          {formatPaise(statementData.closing_balance_paise)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-4 gap-3 bg-gray-100 border border-gray-300 rounded-xl p-4 text-center">
                    <div className="border-r border-gray-300 pr-2">
                      <span className="text-[10px] text-gray-600 font-bold uppercase block">Opening Balance</span>
                      <p className="font-mono text-sm font-bold text-gray-900 mt-1">
                        {formatPaise(statementData.opening_balance_paise)}
                      </p>
                    </div>
                    <div className="border-r border-gray-300 pr-2">
                      <span className="text-[10px] text-gray-600 font-bold uppercase block">Total Purchases (DR)</span>
                      <p className="font-mono text-sm font-bold text-red-600 mt-1">
                        +{formatPaise(statementData.total_debits_paise)}
                      </p>
                    </div>
                    <div className="border-r border-gray-300 pr-2">
                      <span className="text-[10px] text-gray-600 font-bold uppercase block">Total Payments (CR)</span>
                      <p className="font-mono text-sm font-bold text-emerald-700 mt-1">
                        -{formatPaise(statementData.total_credits_paise)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-600 font-bold uppercase block">Closing Balance</span>
                      <p className="font-mono text-base font-extrabold text-gray-900 mt-1">
                        {formatPaise(statementData.closing_balance_paise)}
                      </p>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  <div className="border border-gray-300 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="bg-gray-200 border-b border-gray-300 text-gray-800 text-[11px]">
                          <th className="py-2 px-3 font-bold">Date</th>
                          <th className="py-2 px-3 font-bold">Type</th>
                          <th className="py-2 px-3 font-bold">Invoice / Ref #</th>
                          <th className="py-2 px-4 font-bold">Description</th>
                          <th className="py-2 px-3 text-right font-bold text-red-700">Debit (₹)</th>
                          <th className="py-2 px-3 text-right font-bold text-emerald-700">Credit (₹)</th>
                          <th className="py-2 px-3 text-right font-bold text-gray-900">Balance (₹)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 text-gray-900">
                        {statementData.entries.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-gray-500 italic">
                              No financial transactions recorded in this period.
                            </td>
                          </tr>
                        ) : (
                          statementData.entries.map((entry) => (
                            <tr key={entry.id} className="hover:bg-gray-50">
                              <td className="py-2 px-3 font-mono">{formatDate(entry.entry_date)}</td>
                              <td className="py-2 px-3 font-semibold text-[10px] uppercase text-gray-700">
                                {getLedgerRefLabel(entry.ref_type)}
                              </td>
                              <td className="py-2 px-3 font-mono font-bold text-gray-800">
                                {entry.invoice_number || (entry.ref_id ? `#${entry.ref_id}` : '—')}
                              </td>
                              <td className="py-2 px-4 font-medium">{entry.description}</td>
                              <td className="py-2 px-3 text-right font-mono text-red-600 font-bold">
                                {entry.debit_paise > 0 ? `+${formatPaise(entry.debit_paise)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono text-emerald-700 font-bold">
                                {entry.credit_paise > 0 ? `-${formatPaise(entry.credit_paise)}` : '—'}
                              </td>
                              <td className="py-2 px-3 text-right font-mono font-extrabold text-gray-900">
                                {formatPaise(entry.running_balance_paise)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-text-muted space-y-3">
                  <FileText size={36} className="opacity-30" />
                  <p className="font-semibold text-xs text-text-secondary">
                    Select a date range and click "Generate" to preview the formal statement.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Address Map Picker Modal */}
      {isMapPickerOpen && (
        <AddressMapPickerModal
          isOpen={isMapPickerOpen}
          onClose={() => setIsMapPickerOpen(false)}
          initialLat={newAddrLat}
          initialLng={newAddrLng}
          addressLabel={newAddrArea || customer.name}
          onSelectCoordinates={(lat, lng) => {
            setNewAddrLat(lat);
            setNewAddrLng(lng);
          }}
        />
      )}
    </div>
  );
}
