import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Calculator, 
  Search, 
  Plus, 
  RotateCcw, 
  Truck, 
  CheckCircle2, 
  Trash2, 
  Layers, 
  Edit2, 
  Phone,
  Printer,
  Sparkles,
  MessageSquare,
  X,
  Settings2,
  Check
} from 'lucide-react';
import { useCart } from '../hooks/useCart';
import { formatPaise, calculateLineTax, InvoiceDetail, InvoiceItem } from '../types/billing.types';
import { roundQty, roundMoney, formatQty, formatMoney } from '../../../../core/shared/math';
import { useCustomer, useCustomerIntelligence, useRecordWhatsAppAttempt } from '../../../customers/frontend/hooks/useCustomers';
import FastCustomerSearchControl from '../../../customers/frontend/components/FastCustomerSearchControl';
import CustomerHeaderChip, { CustomerContextBanner } from '../../../customers/frontend/components/CustomerHeaderChip';
import RepeatOrderModal from '../../../customers/frontend/components/RepeatOrderModal';
import { useBillingSettingsStore } from '../hooks/useBillingSettingsStore';
import { usePOSShortcutsStore } from '../hooks/usePOSShortcutsStore';
import { useActiveRates } from '../hooks/useActiveRates';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { useQuery } from '@tanstack/react-query';
import WastageCalculatorWidget from './WastageCalculatorWidget';
import SalesReturnModal from './SalesReturnModal';
import { WhatsAppPhoneModal } from './WhatsAppPhoneModal';

export interface QuickPickItem {
  id: string;
  name: string;
  product_code?: string;
  variant_id?: number;
  qty: number;
  unit: string;
  badge?: string;
  highlight?: boolean;
}

const DEFAULT_QUICK_PICKS: QuickPickItem[] = [
  {
    id: 'default-live-1',
    name: 'Broiler Chicken (Live)',
    product_code: '1',
    qty: 1,
    unit: 'kg',
    badge: 'CODE 1',
    highlight: true,
  },
  {
    id: 'default-skinless-2',
    name: 'Chicken Skinless',
    qty: 1,
    unit: 'kg',
  },
  {
    id: 'default-liver-3',
    name: 'Chicken Liver',
    qty: 0.5,
    unit: 'kg',
  },
];

interface ExpressBillingViewProps {
  customer: any;
  onCustomerChange: (cust: any) => void;
  lastCompletedInvoice: InvoiceDetail | null;
  onReprintLast: () => void;
  onEditLast: () => void;
  onDispatchDelivery: () => void;
  onOpenHeldBills: () => void;
  onCompleteSale: (invoice: InvoiceDetail, printType?: 'both' | 'normal' | 'token' | 'none') => void;
  isDeliveryOrder: boolean;
  onToggleDelivery: () => void;
  deliveryChargePaise: number;
}

export default function ExpressBillingView({
  customer,
  onCustomerChange,
  lastCompletedInvoice,
  onReprintLast,
  onEditLast,
  onDispatchDelivery,
  onOpenHeldBills,
  onCompleteSale,
  isDeliveryOrder,
  onToggleDelivery,
  deliveryChargePaise,
}: ExpressBillingViewProps) {
  const cart = useCart();
  const { data: activeRates = [] } = useActiveRates();
  const { shortcuts } = usePOSShortcutsStore();
  const {
    skipPaymentConfirmation,
    setSkipPaymentConfirmation,
    setLastCompletedInvoice,
  } = useBillingSettingsStore();

  const customerId = customer?.id || cart.activeInvoice?.customer_id || null;
  const { data: customerIntelligence } = useCustomerIntelligence(customerId);

  // Pool summary for LIVE CHICKEN indicator
  const { data: allPoolSummaries } = useQuery({
    queryKey: ['animal-pool-summaries-all'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_ANIMAL_POOL_SUMMARY, { animal_key: 'all' });
      if (!res.success) return {};
      return res.data || {};
    },
    refetchInterval: 10000,
  });

  // System config query for billing settings (e.g. autoOpenWhatsAppBill)
  const { data: configData } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const res = await window.api.invoke(IPC_CHANNELS.CONFIG.GET);
      if (!res?.success) return null;
      return res.data;
    },
  });

  // Customers search
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [customerSearchResults, setCustomerSearchResults] = useState<any[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // Command bar search & selected item weigher state
  const [commandText, setCommandText] = useState('');
  const [selectedVariant, setSelectedVariant] = useState<any | null>(null);
  const [entryQty, setEntryQty] = useState('');
  const [entryAmount, setEntryAmount] = useState('');
  const [showCommandSuggestions, setShowCommandSuggestions] = useState(false);

  // Bottom row charges
  const [discountPercent, setDiscountPercent] = useState('');
  const [flatDeduction, setFlatDeduction] = useState('');
  const [dressingCharge, setDressingCharge] = useState('0');

  // Checkout panel
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'credit' | 'split'>('cash');
  const [cashReceived, setCashReceived] = useState('');
  const [printNormalBill, setPrintNormalBill] = useState(true);
  const [printTokenBill, setPrintTokenBill] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Modals
  const [showCalculator, setShowCalculator] = useState(false);
  const [showSalesReturn, setShowSalesReturn] = useState(false);
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [showRepeatOrderModal, setShowRepeatOrderModal] = useState(false);
  const [whatsAppFeedback, setWhatsAppFeedback] = useState<string | null>(null);
  const recordWhatsAppAttemptMutation = useRecordWhatsAppAttempt();

  // Inline editing for cart items
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<'rate' | 'qty' | 'amount' | null>(null);

  // Quick Picks / Usually Buys customization state (Cashier editable)
  const [isCustomizingQuickPicks, setIsCustomizingQuickPicks] = useState(false);
  const [newPickVariantId, setNewPickVariantId] = useState<string>('');
  const [newPickQty, setNewPickQty] = useState<string>('1');

  // Key for storage:
  const quickPicksStorageKey = customer?.id 
    ? `pos_customer_quick_picks_${customer.id}`
    : 'pos_cashier_quick_picks_global';

  const [quickPicks, setQuickPicks] = useState<QuickPickItem[]>(DEFAULT_QUICK_PICKS);

  // Load from localStorage or typical_basket when customer changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(quickPicksStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setQuickPicks(parsed);
          return;
        }
      }

      // If customer has typical_basket from intelligence, derive items
      if (customerIntelligence?.typical_basket && customerIntelligence.typical_basket.length > 0) {
        const derived: QuickPickItem[] = customerIntelligence.typical_basket.slice(0, 4).map((tb: any, i: number) => {
          const qtyKg = tb.typical_quantity_grams ? tb.typical_quantity_grams / 1000 : (tb.typical_quantity_units || 1);
          const isWeight = !!tb.typical_quantity_grams;
          const isCode1 = tb.product_name?.toLowerCase().includes('live') || tb.product_name?.toLowerCase().includes('broiler');
          return {
            id: `cust-auto-${i}-${Date.now()}`,
            name: tb.product_name,
            qty: qtyKg,
            unit: isWeight ? 'kg' : 'unit',
            badge: isCode1 ? 'CODE 1' : undefined,
            highlight: i === 0 && isCode1,
          };
        });
        setQuickPicks(derived);
        return;
      }

      // Fallback to global saved or default
      const globalSaved = localStorage.getItem('pos_cashier_quick_picks_global');
      if (globalSaved) {
        const parsedGlobal = JSON.parse(globalSaved);
        if (Array.isArray(parsedGlobal) && parsedGlobal.length > 0) {
          setQuickPicks(parsedGlobal);
          return;
        }
      }

      setQuickPicks(DEFAULT_QUICK_PICKS);
    } catch {
      setQuickPicks(DEFAULT_QUICK_PICKS);
    }
  }, [customer?.id, customerIntelligence?.typical_basket, quickPicksStorageKey]);

  // Helper to save quickPicks to current key
  const saveQuickPicks = (items: QuickPickItem[]) => {
    setQuickPicks(items);
    try {
      localStorage.setItem(quickPicksStorageKey, JSON.stringify(items));
      if (!customer?.id) {
        localStorage.setItem('pos_cashier_quick_picks_global', JSON.stringify(items));
      }
    } catch (e) {
      console.error('Failed to save quick picks:', e);
    }
  };

  const handleRemoveQuickPick = (id: string) => {
    const updated = quickPicks.filter(item => item.id !== id);
    saveQuickPicks(updated);
  };

  const handleAddQuickPick = () => {
    if (!newPickVariantId) return;
    const selected = activeRates.find(v => String(v.id) === String(newPickVariantId));
    if (!selected) return;

    const qty = parseFloat(newPickQty) || 1;
    const isWeight = selected.unit_type === 'weight' || selected.unit_type === 'live_dual';
    const isCode1 = String(selected.product_code) === '1' || selected.id === 47 || selected.product_name?.toLowerCase().includes('broiler');

    const newItem: QuickPickItem = {
      id: `pick-${Date.now()}`,
      variant_id: selected.id,
      product_code: selected.product_code ? String(selected.product_code) : undefined,
      name: selected.variant_name && selected.variant_name !== 'Standard'
        ? `${selected.product_name} (${selected.variant_name})`
        : selected.product_name,
      qty,
      unit: isWeight ? 'kg' : 'unit',
      badge: isCode1 ? 'CODE 1' : (selected.product_code ? `CODE ${selected.product_code}` : undefined),
      highlight: isCode1,
    };

    const updated = [...quickPicks, newItem];
    saveQuickPicks(updated);
    setNewPickVariantId('');
    setNewPickQty('1');
  };

  const handleResetQuickPicks = () => {
    saveQuickPicks(DEFAULT_QUICK_PICKS);
  };

  const handleExecuteQuickPick = async (item: QuickPickItem) => {
    let matched = item.variant_id ? activeRates.find(v => v.id === item.variant_id) : null;

    if (!matched && item.product_code) {
      matched = activeRates.find(v => String(v.product_code) === String(item.product_code));
    }

    if (!matched) {
      const q = item.name.toLowerCase();
      const isLiveSearch = q.includes('live') || q.includes('broiler');
      matched = activeRates.find(v => {
        if (isLiveSearch) {
          return String(v.product_code) === '1' || v.id === 47 || v.product_name?.toLowerCase().includes('broiler');
        }
        return v.product_name?.toLowerCase().includes(q) || v.variant_name?.toLowerCase().includes(q);
      });
    }

    if (!matched) {
      setErrorMessage(`Item "${item.name}" not found in current rates`);
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    const isWeight = matched.unit_type === 'weight' || matched.unit_type === 'live_dual';
    const grams = isWeight ? Math.round(item.qty * 1000) : null;
    const units = !isWeight ? Math.round(item.qty) : null;

    try {
      await cart.addItem({
        product_variant_id: matched.id,
        quantity_grams: grams,
        quantity_units: units,
        stock_source: matched.unit_type === 'live_dual' ? 'none' : ((matched as any).stock_source || 'processed_chicken'),
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add item');
      setTimeout(() => setErrorMessage(''), 4000);
    }
  };
  const [editValue, setEditValue] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  const entryQtyInputRef = useRef<HTMLInputElement>(null);
  const cashReceivedInputRef = useRef<HTMLInputElement>(null);

  // Subtotal & net calculation
  const subtotalPaise = cart.items.reduce((s, i) => s + i.line_subtotal_paise, 0);
  const taxPaise = cart.items.reduce((s, i) => s + calculateLineTax(i.line_subtotal_paise, i.gst_rate_percent_snapshot), 0);
  const discPercentNum = parseFloat(discountPercent) || 0;
  const discountPaise = discPercentNum > 0 ? Math.round(subtotalPaise * (discPercentNum / 100)) : 0;
  const deductionPaise = Math.round((parseFloat(flatDeduction) || 0) * 100);
  const dressingPaise = Math.round((parseFloat(dressingCharge) || 0) * 100);

  const exactTotalPaise = Math.max(0, subtotalPaise - discountPaise - deductionPaise + taxPaise + dressingPaise + (isDeliveryOrder ? (deliveryChargePaise || 0) : 0));
  const roundedRupees = Math.round(exactTotalPaise / 100);
  const netTotalPaise = roundedRupees * 100;

  // ITEM 1: Cash Received MUST start BLANK and NEVER auto-fill with net amount.
  // Change to return = received - net ONLY after the cashier types a value.
  const hasCashReceivedInput = cashReceived.trim() !== '' && !isNaN(parseFloat(cashReceived));
  const cashReceivedRupees = hasCashReceivedInput ? roundMoney(parseFloat(cashReceived)) : 0;
  const changeToReturnRupees = hasCashReceivedInput ? Math.max(0, roundMoney(cashReceivedRupees - roundedRupees)) : null;

  // Search customers when typing in left customer search input
  useEffect(() => {
    if (!customerSearchTerm.trim()) {
      setCustomerSearchResults([]);
      return;
    }
    const clean = customerSearchTerm.trim().toLowerCase();
    window.api.invoke('customers:search', { query: clean }).then((res: any) => {
      if (res && res.success && Array.isArray(res.data)) {
        setCustomerSearchResults(res.data.slice(0, 5));
        setShowCustomerDropdown(true);
      }
    }).catch(() => {});
  }, [customerSearchTerm]);

  // Live chicken stats computation (consistent 3-decimal kg, integer birds, and 550 g/kg skinless ratio)
  const chickenPool = (allPoolSummaries as any)?.chicken || (allPoolSummaries as any)?.broiler_chicken || Object.values(allPoolSummaries || {})[0] || null;
  const liveChickenKg = chickenPool
    ? roundQty(chickenPool.total_live_weight_kg ?? ((chickenPool.total_live_weight_grams || 0) / 1000), 3)
    : 0;
  const liveChickenBirds = chickenPool
    ? Math.round(chickenPool.total_bird_count ?? 0)
    : 0;
  const skinlessRatioGramsPerKg = chickenPool?.skinless_ratio_grams_per_kg || 550;
  const skinlessAvailableKg = chickenPool?.estimated_skinless_kg !== undefined
    ? roundQty(chickenPool.estimated_skinless_kg, 3)
    : roundQty(liveChickenKg * (skinlessRatioGramsPerKg / 1000), 3);

  // Command bar autocomplete filtering
  const matchingVariants = useMemo(() => {
    if (!commandText.trim()) return [];
    const term = commandText.trim().toLowerCase();
    // Check if input has weight suffix (e.g. "skinless 1.5" or "1 1.5" or "broiler 2")
    const parts = term.split(/\s+/);
    const queryPart = parts[0];

    return activeRates.filter(v => {
      const pCode = String(v.product_code || v.id || '').toLowerCase();
      const pName = (v.product_name || '').toLowerCase();
      const vName = (v.variant_name || '').toLowerCase();
      const isLiveChicken = pCode === '1' || v.id === 47 || pName.includes('broiler') || vName.includes('broiler') || pName.includes('cc live');

      // Alias check for live chicken / broiler chicken (Code 1)
      if (isLiveChicken) {
        if (
          queryPart === '1' ||
          term === '1' ||
          queryPart.startsWith('broil') ||
          queryPart.startsWith('live') ||
          term.includes('chicken live') ||
          term.includes('live chicken') ||
          term.includes('broiler chicken')
        ) {
          return true;
        }
      }

      const codeMatch = pCode === queryPart || pCode === term;
      const nameMatch = pName.includes(queryPart) || pName.includes(term);
      const variantMatch = vName.includes(queryPart) || vName.includes(term);
      return codeMatch || nameMatch || variantMatch;
    }).slice(0, 6);
  }, [commandText, activeRates]);

  // Handle Command Bar input change
  const handleCommandChange = (text: string) => {
    setCommandText(text);
    setShowCommandSuggestions(true);

    const parts = text.trim().split(/\s+/);
    if (parts.length >= 2) {
      const queryPart = parts[0].toLowerCase();
      const qtyPart = parseFloat(parts[1]);

      const isLiveChickenQuery = 
        queryPart === '1' || 
        queryPart.startsWith('broil') || 
        queryPart.startsWith('live') ||
        text.toLowerCase().includes('chicken live') ||
        text.toLowerCase().includes('live chicken');

      const found = activeRates.find(v => {
        if (isLiveChickenQuery && (String(v.product_code) === '1' || v.id === 47 || v.product_name?.toLowerCase().includes('broiler'))) {
          return true;
        }
        return String(v.product_code || v.id).toLowerCase() === queryPart ||
          v.product_name?.toLowerCase().includes(queryPart);
      });

      if (found) {
        setSelectedVariant(found);
        if (!isNaN(qtyPart) && qtyPart > 0) {
          setEntryQty(String(qtyPart));
          const rateRupees = (found.current_rate_paise_per_unit || 0) / 100;
          setEntryAmount((qtyPart * rateRupees).toFixed(2));
        }
      }
    }
  };

  // Handle selecting a variant for entry
  const handleSelectVariantForEntry = (v: any, initialQty = 1) => {
    setSelectedVariant(v);
    setShowCommandSuggestions(false);
    setCommandText(`${v.product_name} ${v.variant_name && v.variant_name !== 'Standard' ? v.variant_name : ''}`.trim());
    setEntryQty(String(initialQty));
    const rateRupees = (v.current_rate_paise_per_unit || 0) / 100;
    setEntryAmount((initialQty * rateRupees).toFixed(2));
    setTimeout(() => {
      entryQtyInputRef.current?.focus();
      entryQtyInputRef.current?.select();
    }, 50);
  };

  // Add Item to cart from entry card
  const handleConfirmAddItem = async () => {
    if (!selectedVariant) return;
    const qty = parseFloat(entryQty);
    if (isNaN(qty) || qty <= 0) return;

    const isWeight = selectedVariant.unit_type === 'weight' || selectedVariant.unit_type === 'live_dual';
    const grams = isWeight ? Math.round(qty * 1000) : null;
    const units = !isWeight ? Math.round(qty) : null;

    try {
      await cart.addItem({
        product_variant_id: selectedVariant.id,
        quantity_grams: grams,
        quantity_units: units,
        stock_source: selectedVariant.unit_type === 'live_dual' ? 'none' : (selectedVariant.stock_source || 'processed_chicken'),
      });
      // Clear entry form
      setSelectedVariant(null);
      setCommandText('');
      setEntryQty('');
      setEntryAmount('');
      searchInputRef.current?.focus();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add item');
      setTimeout(() => setErrorMessage(''), 4000);
    }
  };

  // 1-Click "USUALLY BUYS" shortcuts
  const handleQuickAdd = async (variantNameSnippet: string, qtyKg: number) => {
    const isLiveSearch = variantNameSnippet.toLowerCase().includes('live') || variantNameSnippet.toLowerCase().includes('broiler');
    const matched = activeRates.find(v => {
      if (isLiveSearch) {
        return String(v.product_code) === '1' || v.id === 47 || v.product_name?.toLowerCase().includes('broiler');
      }
      return v.product_name?.toLowerCase().includes(variantNameSnippet.toLowerCase()) ||
        v.variant_name?.toLowerCase().includes(variantNameSnippet.toLowerCase());
    });
    if (!matched) return;

    const isWeight = matched.unit_type === 'weight' || matched.unit_type === 'live_dual';
    try {
      await cart.addItem({
        product_variant_id: matched.id,
        quantity_grams: isWeight ? Math.round(qtyKg * 1000) : null,
        quantity_units: !isWeight ? Math.round(qtyKg) : null,
        stock_source: matched.unit_type === 'live_dual' ? 'none' : ((matched as any).stock_source || 'processed_chicken'),
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add item');
      setTimeout(() => setErrorMessage(''), 4000);
    }
  };

  // Complete & Print checkout handler
  const handleCheckout = async () => {
    if (cart.items.length === 0) {
      setErrorMessage('Cart is empty. Add at least one item.');
      setTimeout(() => setErrorMessage(''), 3000);
      return;
    }

    const assumeExactCashWhenBlank =
      configData?.billingSettings?.assumeExactCashWhenBlank === true ||
      localStorage.getItem('pos_assume_exact_cash_when_blank') === 'true';

    if (paymentMethod === 'cash') {
      if (!hasCashReceivedInput && !assumeExactCashWhenBlank) {
        setErrorMessage('Enter Cash Received (or tap Exact Cash). Enable "Assume exact cash when blank" in Settings to skip.');
        cashReceivedInputRef.current?.focus();
        setTimeout(() => setErrorMessage(''), 4500);
        return;
      }
      if (hasCashReceivedInput && cashReceivedRupees < roundedRupees) {
        setErrorMessage(`Cash received (₹${cashReceivedRupees}) is less than Net Amount (₹${roundedRupees}). Use Udhaar or Split for partial payment.`);
        cashReceivedInputRef.current?.focus();
        setTimeout(() => setErrorMessage(''), 4500);
        return;
      }
    }

    if (paymentMethod === 'credit' && !customer?.id && !cart.activeInvoice?.customer_id) {
      setErrorMessage('Please select a Customer on the left before completing an Udhaar (Credit) sale.');
      setTimeout(() => setErrorMessage(''), 4500);
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    try {
      if (paymentMethod === 'cash') {
        const finalCashRupees = hasCashReceivedInput ? cashReceivedRupees : roundedRupees;
        const tenderPaise = Math.round(finalCashRupees * 100);
        await cart.recordPayment('cash', netTotalPaise, `TENDERED:${tenderPaise}`);
      } else if (paymentMethod === 'upi') {
        await cart.recordPayment('upi', netTotalPaise);
      } else if (paymentMethod === 'credit') {
        // Leave paidAmount = 0 on the invoice so completeInvoice records the full Udhaar credit sale in customer_ledger & A/R!
        if (cart.activeInvoice?.id && !String(cart.activeInvoice.id).startsWith('local_')) {
          await cart.recordPayment('cash', 0, 'UDHAAR_CREDIT_SALE');
        }
      }

      const printType = (printNormalBill && printTokenBill) ? 'both' : (printNormalBill ? 'normal' : (printTokenBill ? 'token' : 'none'));

      const completed = await cart.completeInvoice({
        discount_percent: discPercentNum > 0 ? discPercentNum : undefined,
        flat_deduction_paise: deductionPaise > 0 ? deductionPaise : undefined,
        dressing_charge_paise: dressingPaise > 0 ? dressingPaise : undefined,
        print_delivery_token: printTokenBill,
        is_delivery: isDeliveryOrder,
        delivery_charge_paise: isDeliveryOrder ? (deliveryChargePaise || 0) : 0,
      });

      if (completed) {
        setLastCompletedInvoice(completed);
        onCompleteSale(completed, printType);

        // Phase 2 Fix: WhatsApp auto-open only with valid 10-digit number AND consent === 1 AND setting enabled
        const custPhone = customer?.phone_normalized || customer?.phone || customer?.whatsapp || '';
        const cleanPhoneDigits = custPhone.replace(/\D/g, '');
        const hasValidPhone = cleanPhoneDigits.length >= 10;
        const hasConsent = customer?.whatsapp_bill_consent === 1;
        const autoOpenEnabled = configData?.billingSettings?.autoOpenWhatsAppBill === true;

        if (hasValidPhone && hasConsent) {
          if (autoOpenEnabled) {
            recordWhatsAppAttemptMutation.mutate({
              invoice_id: completed.invoice.id,
              customer_id: customer?.id || null,
              phone: custPhone,
            });
            setWhatsAppFeedback(`✓ WhatsApp bill link opened (*${cleanPhoneDigits.slice(-4)})`);
          } else {
            setWhatsAppFeedback(`✓ WhatsApp bill ready (*${cleanPhoneDigits.slice(-4)})`);
          }
          setTimeout(() => setWhatsAppFeedback(null), 4000);
        }

        // Reset local charges and reset Cash Received to BLANK for the next bill
        setCashReceived('');
        setDiscountPercent('');
        setFlatDeduction('');
        setDressingCharge('0');
        setSelectedVariant(null);
        setCommandText('');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Checkout failed');
      setTimeout(() => setErrorMessage(''), 5000);
    } finally {
      setIsProcessing(false);
    }
  };

  // WhatsApp bill sender
  const handleSendWhatsAppBill = async () => {
    // Prefer last completed invoice if current cart is empty, or active draft if cart has items
    const targetInvoiceId = (cart.items.length > 0 && cart.activeInvoice?.id) 
      ? cart.activeInvoice.id 
      : (lastCompletedInvoice?.invoice?.id || cart.activeInvoice?.id);

    if (!targetInvoiceId) {
      setWhatsAppFeedback('No bill to send. Please complete a bill or add items first.');
      setTimeout(() => setWhatsAppFeedback(null), 4000);
      return;
    }

    const lastCust = (lastCompletedInvoice as any)?.customer;
    const phone = customer?.whatsapp || customer?.phone || customer?.phone2 || 
                  lastCust?.whatsapp || lastCust?.phone || '';
    
    const cleanDigits = phone.replace(/[^0-9]/g, '');
    if (cleanDigits.length < 10) {
      setShowWhatsAppModal(true);
      return;
    }

    setWhatsAppFeedback('Sending bill via WhatsApp...');
    try {
      const res = await window.api.invoke(IPC_CHANNELS.BILLING.SEND_WHATSAPP_BILL, {
        invoice_id: targetInvoiceId,
        customPhone: phone,
      });
      if (res && res.success) {
        setWhatsAppFeedback('✓ Bill sent successfully to customer!');
      } else {
        setWhatsAppFeedback(res?.failureReason || 'Failed to send WhatsApp bill');
      }
    } catch (e: any) {
      setWhatsAppFeedback(e.message || 'Error sending WhatsApp');
    } finally {
      setTimeout(() => setWhatsAppFeedback(null), 4000);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#f4f7f6] dark:bg-surface-app text-text-primary text-xs select-none">
      
      {/* ── LEFT COLUMN (Customer, Usually Buys, Live Stock, Last Bill) ── */}
      <div className="w-[315px] xl:w-[335px] 2xl:w-[350px] bg-white dark:bg-surface-card border-r border-[#dbe6e1] dark:border-border-subtle flex flex-col p-3.5 gap-3.5 overflow-y-auto shrink-0 shadow-subtle">
        
        {/* 1. Fast Customer Search with Collision Warning & Inline Quick-Add */}
        <div className="space-y-2 relative">
          <FastCustomerSearchControl
            selectedCustomer={customer}
            onSelectCustomer={(c) => {
              onCustomerChange(c);
              cart.linkCustomer(c.id);
            }}
            onClearCustomer={() => {
              onCustomerChange(null);
              cart.linkCustomer(null);
            }}
          />

          {/* Active Customer Card (if linked) */}
          {customer && (
            <div className="rounded-2xl border-2 border-[#0d6e53] p-3 bg-white dark:bg-surface-panel space-y-1.5 shadow-xs animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <h3 className="font-black text-sm text-gray-900 dark:text-white truncate">
                  {customer.name}
                </h3>
                {(() => {
                  const seg = (customer.manual_tier 
                    ? customer.manual_tier.toUpperCase() 
                    : (customer.customer_segment || 'NEW')).toUpperCase();
                  const isVip = seg.includes('VIP');
                  const isRegular = seg.includes('REGULAR');
                  const isRare = seg.includes('RARE');
                  const isWholesale = seg.includes('WHOLESALE');
                  const isRestaurant = seg.includes('RESTAURANT');

                  let badgeCls = 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border-cyan-200';
                  let icon = '🆕';
                  if (isVip) {
                    badgeCls = 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300';
                    icon = '⭐';
                  } else if (isRegular) {
                    badgeCls = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300';
                    icon = '🟢';
                  } else if (isRare) {
                    badgeCls = 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300';
                    icon = '⏳';
                  } else if (isWholesale) {
                    badgeCls = 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300';
                    icon = '📦';
                  } else if (isRestaurant) {
                    badgeCls = 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300';
                    icon = '🍽️';
                  }

                  return (
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-black border flex items-center gap-1 ${badgeCls}`}>
                      <span>{icon}</span>
                      <span>{seg}</span>
                    </span>
                  );
                })()}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                {(customerIntelligence as any)?.visit_frequency_label ? `Last visit ${(customerIntelligence as any).visit_frequency_label}` : 'Shopper'} • {customer.phone || customer.phone_normalized || 'No phone'}
              </p>
            </div>
          )}
        </div>

        {/* 2. USUALLY BUYS Section (Cashier Editable & Customizable) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
              USUALLY BUYS
            </label>
            <button
              type="button"
              onClick={() => setIsCustomizingQuickPicks(prev => !prev)}
              className="text-[10px] font-bold text-[#0d6e53] dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
              title="Customize Usually Buys quick list (Add or remove items)"
            >
              {isCustomizingQuickPicks ? (
                <>
                  <Check size={11} className="stroke-[3]" />
                  <span>Done</span>
                </>
              ) : (
                <>
                  <Settings2 size={11} />
                  <span>Customize</span>
                </>
              )}
            </button>
          </div>

          {/* Customizing Mode: Cashier can add, remove, and manage quick picks */}
          {isCustomizingQuickPicks ? (
            <div className="rounded-2xl border-2 border-emerald-400 dark:border-emerald-700 bg-white dark:bg-surface-panel p-3 space-y-3 shadow-md animate-in fade-in duration-150">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-border-subtle pb-2">
                <span className="text-xs font-black text-gray-900 dark:text-white flex items-center gap-1.5">
                  <Edit2 size={12} className="text-[#0d6e53]" />
                  <span>Edit Usually Buys</span>
                </span>
                <span className="text-[10px] text-gray-400 font-bold">
                  {quickPicks.length} items
                </span>
              </div>

              {/* Existing items with delete button */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                {quickPicks.length === 0 ? (
                  <p className="text-[11px] text-gray-400 text-center py-2">
                    No items in list. Add products below.
                  </p>
                ) : (
                  quickPicks.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2 rounded-xl border border-gray-200 dark:border-border-subtle bg-gray-50/70 dark:bg-surface-card text-xs"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <span className="font-bold text-gray-900 dark:text-white truncate">
                          + {item.name}
                        </span>
                        <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 font-bold whitespace-nowrap">
                          {item.qty} {item.unit}
                        </span>
                        {item.badge && (
                          <span className="text-[9px] px-1 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-black rounded">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveQuickPick(item.id)}
                        className="p-1 hover:bg-red-100 dark:hover:bg-red-950/50 text-red-500 rounded-lg transition-colors cursor-pointer ml-1"
                        title="Remove from Usually Buys"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add New Item to list */}
              <div className="space-y-1.5 pt-1 border-t border-gray-100 dark:border-border-subtle">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block">
                  + Add Product to List
                </label>
                <select
                  value={newPickVariantId}
                  onChange={(e) => {
                    setNewPickVariantId(e.target.value);
                    const sel = activeRates.find(v => String(v.id) === e.target.value);
                    if (sel && sel.unit_type === 'piece') {
                      setNewPickQty('1');
                    }
                  }}
                  className="w-full bg-white dark:bg-surface-card border border-gray-300 dark:border-border-subtle rounded-xl px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-medium focus:outline-none focus:border-emerald-500"
                >
                  <option value="">-- Select Product --</option>
                  {activeRates.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.product_code ? `[${v.product_code}] ` : ''}{v.product_name}{v.variant_name && v.variant_name !== 'Standard' ? ` - ${v.variant_name}` : ''} (₹{((v.current_rate_paise_per_unit || 0) / 100).toFixed(0)}/{v.unit_type === 'weight' ? 'kg' : 'unit'})
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center bg-white dark:bg-surface-card border border-gray-300 dark:border-border-subtle rounded-xl px-2.5 py-1.5">
                    <span className="text-[10px] font-bold text-gray-400 mr-1.5">Qty:</span>
                    <input
                      type="number"
                      step="0.25"
                      min="0.1"
                      value={newPickQty}
                      onChange={(e) => setNewPickQty(e.target.value)}
                      className="w-full bg-transparent text-xs font-mono font-bold text-gray-900 dark:text-white focus:outline-none"
                      placeholder="1"
                    />
                    <span className="text-[10px] font-bold text-gray-500 ml-1">
                      {(() => {
                        const sel = activeRates.find(v => String(v.id) === newPickVariantId);
                        return (sel?.unit_type === 'weight' || sel?.unit_type === 'live_dual') ? 'kg' : 'unit';
                      })()}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddQuickPick}
                    disabled={!newPickVariantId}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-xl text-xs font-black flex items-center gap-1 shadow-sm transition-all cursor-pointer"
                  >
                    <Plus size={13} className="stroke-[3]" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-border-subtle">
                <button
                  type="button"
                  onClick={handleResetQuickPicks}
                  className="text-[10px] font-bold text-gray-400 hover:text-red-600 flex items-center gap-1 transition-colors cursor-pointer"
                  title="Reset to default items"
                >
                  <RotateCcw size={10} />
                  <span>Reset Defaults</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsCustomizingQuickPicks(false)}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* Normal 1-Click Buttons Mode */
            <div className="space-y-1.5">
              {quickPicks.length === 0 ? (
                <div 
                  onClick={() => setIsCustomizingQuickPicks(true)}
                  className="p-3 text-center rounded-xl border border-dashed border-gray-300 dark:border-border-subtle text-xs text-gray-400 hover:text-emerald-600 hover:border-emerald-300 cursor-pointer transition-colors"
                >
                  + Click to add Usually Buys shortcuts
                </div>
              ) : (
                quickPicks.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleExecuteQuickPick(item)}
                    className={`w-full text-left font-bold text-xs py-2 px-3 rounded-xl border transition-colors flex items-center justify-between cursor-pointer ${
                      item.highlight
                        ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200'
                        : 'border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-panel hover:bg-emerald-50 dark:hover:bg-emerald-950/20 hover:border-emerald-300'
                    }`}
                  >
                    <span>+ {item.name} {item.qty} {item.unit}</span>
                    {item.badge && (
                      <span className="text-[10px] font-mono font-black text-emerald-700 dark:text-emerald-400">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* 3. LIVE CHICKEN Indicator Card */}
        <div 
          onClick={() => {
            const liveV = activeRates.find(v => 
              String(v.product_code || '') === '1' || 
              v.id === 47 || 
              v.product_name?.toLowerCase().includes('broiler chicken (live)') ||
              v.variant_name?.toLowerCase().includes('broiler chicken (live)')
            );
            if (liveV) {
              handleSelectVariantForEntry(liveV, 1);
            }
          }}
          className="rounded-2xl bg-[#e6f4ef] dark:bg-emerald-950/30 border border-[#b8e2d2] dark:border-emerald-800/50 p-3.5 space-y-0.5 cursor-pointer hover:border-[#0d6e53] hover:shadow-sm active:scale-[0.99] transition-all group"
          title="Click to bill Live Chicken / Broiler (Code #1)"
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase text-[#0d6e53] dark:text-emerald-400 tracking-wider">
              LIVE CHICKEN • CODE 1
            </span>
            <span className="text-[9px] font-bold text-[#0d6e53] dark:text-emerald-400 group-hover:underline">
              Select +
            </span>
          </div>
          <p className="text-base font-black text-gray-900 dark:text-white font-mono">
            {formatQty(liveChickenKg)} kg • {liveChickenBirds} birds
          </p>
          <p className="text-[11px] text-gray-600 dark:text-gray-400 font-medium">
            ≈ {formatQty(skinlessAvailableKg)} kg skinless available (550 g/kg)
          </p>
        </div>

        {/* 4. LAST BILL Box (Pinned at bottom) */}
        <div className="mt-auto pt-2 border-t border-gray-100 dark:border-border-subtle">
          <div className="rounded-2xl border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-panel p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase">
                LAST BILL #{lastCompletedInvoice?.invoice?.invoice_number?.split('_')[0] || lastCompletedInvoice?.invoice?.id || '206'}
              </span>
              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                COMPLETED
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 truncate max-w-[150px]">
                {lastCompletedInvoice?.invoice?.customer_id ? `Customer #${lastCompletedInvoice.invoice.customer_id}` : 'Walk-in'} • {lastCompletedInvoice?.payments[0]?.method?.toUpperCase() || 'CASH'}
              </span>
              <span className="font-black text-gray-900 dark:text-white font-mono text-sm">
                ₹{((lastCompletedInvoice?.invoice?.total_paise || 380000) / 100).toFixed(0)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={onReprintLast}
                className="py-1.5 rounded-xl border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-card hover:bg-gray-50 text-gray-700 dark:text-gray-200 text-xs font-bold text-center cursor-pointer transition-colors"
              >
                Reprint
              </button>
              <button
                type="button"
                onClick={onEditLast}
                className="py-1.5 rounded-xl border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-card hover:bg-gray-50 text-gray-700 dark:text-gray-200 text-xs font-bold text-center cursor-pointer transition-colors"
              >
                Edit
              </button>
            </div>

            <button
              type="button"
              onClick={onDispatchDelivery}
              className="w-full py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-extrabold text-center transition-colors cursor-pointer"
            >
              Dispatch as Delivery
            </button>
          </div>
        </div>

      </div>

      {/* ── MIDDLE COLUMN (Bill Header, Search/Entry, Cart Items, Bottom Charges) ── */}
      <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto min-w-0 bg-[#f4f7f6] dark:bg-surface-app">
        
        {/* 1. Bill Header Row */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2
                className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2"
                title="Continuous bill numbering: Drafts and Held bills preview the next sequence number and only consume it upon completion."
              >
                <span>
                  Bill #{(cart.activeInvoice as any)?.next_continuous_number || cart.activeInvoice?.invoice_number?.split('_')[0] || cart.activeInvoice?.id || '207'}
                </span>
                {(!cart.activeInvoice?.invoice_number || cart.activeInvoice?.status === 'draft') && (
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-gray-200/80 dark:bg-surface-panel text-gray-600 dark:text-gray-300 tracking-wider">
                    Draft
                  </span>
                )}
              </h2>

              {/* Phase 2: Compact Customer Chip */}
              <CustomerHeaderChip
                customer={customer}
                intelligence={customerIntelligence}
                onOpenSearch={() => {}}
                onClearCustomer={() => {
                  onCustomerChange(null);
                  cart.linkCustomer(null);
                }}
                onOpenRepeatOrder={() => setShowRepeatOrderModal(true)}
              />
            </div>

            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleDelivery}
              className={`rounded-full border px-3.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                isDeliveryOrder
                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                  : 'bg-white dark:bg-surface-card border-gray-200 dark:border-border-subtle text-gray-700 dark:text-gray-300 hover:bg-gray-50'
              }`}
            >
              Home Delivery
            </button>

            <button
              type="button"
              onClick={() => setShowSalesReturn(true)}
              className="rounded-full border border-amber-300 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 px-3.5 py-1 text-xs font-bold hover:bg-amber-100 transition-colors cursor-pointer"
            >
              Return Item
            </button>

            <span className="rounded-full bg-[#dcf2e9] dark:bg-emerald-950/50 text-[#0d6e53] dark:text-emerald-400 border border-[#b8e4d3] dark:border-emerald-800 px-3.5 py-1 text-xs font-black">
              Total Items :{cart.items.length}
            </span>
          </div>
        </div>

        {/* Phase 2: One-line Customer Context Banner */}
        {customer && (
          <CustomerContextBanner
            customer={customer}
            intelligence={customerIntelligence}
            onOpenRepeatOrder={() => setShowRepeatOrderModal(true)}
          />
        )}
      </div>

        {/* 2. Main Command Bar Search */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Type item, code, or weight  (e.g. skinless 1.5)"
            value={commandText}
            onChange={(e) => handleCommandChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (matchingVariants.length > 0 && !selectedVariant) {
                  handleSelectVariantForEntry(matchingVariants[0]);
                } else if (selectedVariant) {
                  handleConfirmAddItem();
                }
              }
            }}
            className="w-full rounded-2xl border-2 border-[#0d6e53] px-4 py-2.5 text-xs text-gray-950 dark:text-white placeholder:text-gray-400 bg-white dark:bg-surface-card shadow-sm outline-none font-medium"
          />

          {/* Autocomplete Suggestions */}
          {showCommandSuggestions && matchingVariants.length > 0 && !selectedVariant && (
            <div className="absolute top-12 left-0 right-0 z-40 bg-white dark:bg-surface-card border border-gray-200 dark:border-border-subtle rounded-2xl shadow-xl overflow-hidden divide-y divide-gray-100 dark:divide-border-subtle">
              {matchingVariants.map(v => (
                <div
                  key={v.id}
                  onClick={() => handleSelectVariantForEntry(v)}
                  className="p-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 text-xs bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg border border-emerald-200">
                      #{v.product_code || v.id}
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white text-xs">
                      {v.product_name} {v.variant_name && v.variant_name !== 'Standard' ? `(${v.variant_name})` : ''}
                    </span>
                  </div>
                  <span className="font-black text-xs font-mono text-gray-800 dark:text-gray-200">
                    ₹{((v.current_rate_paise_per_unit || 0) / 100).toFixed(2)} / {v.unit_type === 'piece' ? 'pc' : 'kg'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Selected Item Weigher / Entry Card */}
        {selectedVariant && (
          <div className="rounded-2xl bg-[#eef7f3] dark:bg-surface-card border-2 border-[#0d6e53]/50 p-4 space-y-2.5 animate-in fade-in zoom-in-98 duration-150 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-xs text-gray-900 dark:text-white flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#0d6e53]" />
                #{selectedVariant.product_code || selectedVariant.id} • {selectedVariant.product_name}
              </span>
              <span className="font-black text-xs text-gray-900 dark:text-white font-mono">
                ₹{((selectedVariant.current_rate_paise_per_unit || 0) / 100).toFixed(2)} / {selectedVariant.unit_type === 'piece' ? 'pc' : 'kg'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1">
                  Quantity ({selectedVariant.unit_type === 'piece' ? 'pc' : 'kg'})
                </label>
                <input
                  ref={entryQtyInputRef}
                  type="number"
                  step="any"
                  placeholder="e.g. 1.5"
                  value={entryQty}
                  onChange={(e) => {
                    const q = e.target.value;
                    setEntryQty(q);
                    const qNum = parseFloat(q);
                    const rate = (selectedVariant.current_rate_paise_per_unit || 0) / 100;
                    if (!isNaN(qNum) && qNum > 0) {
                      setEntryAmount((qNum * rate).toFixed(2));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmAddItem();
                  }}
                  className="w-full bg-white dark:bg-surface-panel border border-gray-300 dark:border-border-subtle rounded-xl px-3 py-2 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-[#0d6e53]"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-gray-500 dark:text-gray-400 block mb-1">
                  Total amount (₹)
                </label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 250"
                  value={entryAmount}
                  onChange={(e) => {
                    const amt = e.target.value;
                    setEntryAmount(amt);
                    const aNum = parseFloat(amt);
                    const rate = (selectedVariant.current_rate_paise_per_unit || 0) / 100;
                    if (!isNaN(aNum) && aNum > 0 && rate > 0) {
                      setEntryQty((aNum / rate).toFixed(3));
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmAddItem();
                  }}
                  className="w-full bg-white dark:bg-surface-panel border border-gray-300 dark:border-border-subtle rounded-xl px-3 py-2 text-xs font-bold text-gray-900 dark:text-white outline-none focus:border-[#0d6e53]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                Enter either one and the other fills in. Press Enter to add.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedVariant(null)}
                  className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 text-xs font-bold hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAddItem}
                  className="px-4 py-1 rounded-xl bg-[#0d6e53] hover:bg-[#0a5742] text-white text-xs font-extrabold shadow-xs cursor-pointer"
                >
                  Add Item
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Cart Line Items List */}
        <div className="flex-1 space-y-2 min-h-0 overflow-y-auto">
          {cart.items.length === 0 ? (
            <div className="p-8 text-center border-2 border-dashed border-gray-200 dark:border-border-subtle rounded-2xl bg-white/50 dark:bg-surface-card/40 text-gray-400 text-xs">
              No items in this bill yet. Type above or tap a shortcut to start.
            </div>
          ) : (
            cart.items.map((item: InvoiceItem) => {
              const isWeight = item.unit_type === 'weight' || item.unit_type === 'live_dual' || item.quantity_grams !== null;
              const qtyNum = isWeight ? (item.quantity_grams || 0) / 1000 : (item.quantity_units || 0);
              const rateRupees = (item.rate_paise_snapshot || 0) / 100;
              const lineTotalRupees = (item.line_subtotal_paise || 0) / 100;
              const liveUsesEstimate = (qtyNum * 1.9).toFixed(1);

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-card p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs hover:border-gray-300 transition-all"
                >
                  {/* Left info */}
                  <div>
                    <h4 className="font-extrabold text-sm text-gray-900 dark:text-white">
                      {item.product_name}
                    </h4>
                    <p className="text-xs mt-0.5">
                      {item.override_applied ? (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          price changed for this bill
                        </span>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-400">
                          ₹{rateRupees.toFixed(0)} / {isWeight ? 'kg' : 'pc'} • uses ≈ {liveUsesEstimate} kg live
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Right interactive pill controls */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {/* Rate pill */}
                    {editingItemId === item.id && editingField === 'rate' ? (
                      <input
                        type="number"
                        autoFocus
                        defaultValue={rateRupees}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0 && Math.round(val * 100) !== item.rate_paise_snapshot) {
                            cart.updateItemRate(item.id, Math.round(val * 100), 'Manual override');
                          }
                          setEditingItemId(null);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="w-16 text-center font-bold font-mono text-xs border border-[#0d6e53] rounded-xl py-1 bg-white outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItemId(item.id);
                          setEditingField('rate');
                        }}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-border-subtle bg-gray-50/70 dark:bg-surface-panel hover:bg-gray-100 text-xs font-bold font-mono text-gray-800 dark:text-gray-200 cursor-pointer"
                        title="Click to edit unit rate"
                      >
                        ₹{rateRupees.toFixed(0)}
                      </button>
                    )}

                    {/* Quantity pill */}
                    {editingItemId === item.id && editingField === 'qty' ? (
                      <input
                        type="number"
                        step="any"
                        autoFocus
                        defaultValue={qtyNum}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            const g = isWeight ? Math.round(val * 1000) : null;
                            const u = !isWeight ? Math.round(val) : null;
                            cart.updateItemQuantity(item.id, g, u);
                          }
                          setEditingItemId(null);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="w-18 text-center font-bold font-mono text-xs border border-[#0d6e53] rounded-xl py-1 bg-white outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItemId(item.id);
                          setEditingField('qty');
                        }}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-border-subtle bg-gray-50/70 dark:bg-surface-panel hover:bg-gray-100 text-xs font-bold font-mono text-gray-800 dark:text-gray-200 cursor-pointer"
                        title="Click to edit quantity"
                      >
                        {qtyNum.toFixed(3)}
                      </button>
                    )}

                    {/* Amount pill */}
                    {editingItemId === item.id && editingField === 'amount' ? (
                      <input
                        type="number"
                        step="any"
                        autoFocus
                        defaultValue={lineTotalRupees}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0 && rateRupees > 0) {
                            const newQty = val / rateRupees;
                            const g = isWeight ? Math.round(newQty * 1000) : null;
                            const u = !isWeight ? Math.round(newQty) : null;
                            cart.updateItemQuantity(item.id, g, u);
                          }
                          setEditingItemId(null);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                        }}
                        className="w-18 text-center font-bold font-mono text-xs border border-[#0d6e53] rounded-xl py-1 bg-white outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItemId(item.id);
                          setEditingField('amount');
                        }}
                        className="px-3 py-1.5 rounded-xl border border-gray-200 dark:border-border-subtle bg-gray-50/70 dark:bg-surface-panel hover:bg-gray-100 text-xs font-bold font-mono text-gray-800 dark:text-gray-200 cursor-pointer"
                        title="Click to edit line amount"
                      >
                        ₹{lineTotalRupees.toFixed(0)}
                      </button>
                    )}

                    {/* Delete button */}
                    <button
                      type="button"
                      onClick={() => cart.removeItem(item.id)}
                      className="w-8 h-8 rounded-xl border border-red-200 hover:border-red-400 hover:bg-red-50 text-red-500 flex items-center justify-center transition-colors cursor-pointer"
                      title="Remove from cart"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Subtext info */}
        <p className="text-[11px] text-gray-400 italic">
          Tap any rate, quantity or amount to change it. Rate changes apply to this bill only.
        </p>

        {/* 5. Bottom Charges Row + Floating Calculator */}
        <div className="relative pt-2 border-t border-gray-200 dark:border-border-subtle">
          <div className="grid grid-cols-3 gap-3 pr-14">
            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-1">Discount (%)</label>
              <input
                type="number"
                placeholder="0"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-panel px-3 py-2 text-xs font-bold font-mono text-gray-800 dark:text-white outline-none focus:border-[#0d6e53]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-1">Deduction (₹)</label>
              <input
                type="number"
                placeholder="0"
                value={flatDeduction}
                onChange={(e) => setFlatDeduction(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-panel px-3 py-2 text-xs font-bold font-mono text-gray-800 dark:text-white outline-none focus:border-[#0d6e53]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-gray-500 block mb-1">Dressing charge (₹)</label>
              <input
                type="number"
                placeholder="0"
                value={dressingCharge}
                onChange={(e) => setDressingCharge(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-panel px-3 py-2 text-xs font-bold font-mono text-gray-800 dark:text-white outline-none focus:border-[#0d6e53]"
              />
            </div>
          </div>
        </div>

      </div>

      {/* ── RIGHT COLUMN (Checkout, Net Amount, Tender, Action Buttons) ── */}
      <div className="w-[320px] xl:w-[350px] bg-white dark:bg-surface-card border-l border-[#dbe6e1] dark:border-border-subtle flex flex-col p-4 gap-4 overflow-y-auto shrink-0 shadow-subtle">
        
        {/* 1. Summary Breakdown */}
        <div className="space-y-1.5 pb-2 border-b border-gray-100 dark:border-border-subtle">
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>Subtotal</span>
            <span className="font-mono font-bold text-gray-900 dark:text-white">
              ₹{(subtotalPaise / 100).toFixed(0)}
            </span>
          </div>
          {dressingPaise > 0 && (
            <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>Dressing</span>
              <span className="font-mono font-bold text-gray-900 dark:text-white">
                + ₹{(dressingPaise / 100).toFixed(0)}
              </span>
            </div>
          )}
          {discountPaise > 0 && (
            <div className="flex items-center justify-between text-xs text-emerald-600">
              <span>Discount ({discountPercent}%)</span>
              <span className="font-mono font-bold">
                - ₹{(discountPaise / 100).toFixed(0)}
              </span>
            </div>
          )}
          {deductionPaise > 0 && (
            <div className="flex items-center justify-between text-xs text-emerald-600">
              <span>Deduction</span>
              <span className="font-mono font-bold">
                - ₹{(deductionPaise / 100).toFixed(0)}
              </span>
            </div>
          )}
          {isDeliveryOrder && deliveryChargePaise > 0 && (
            <div className="flex items-center justify-between text-xs text-purple-600">
              <span>Delivery charge</span>
              <span className="font-mono font-bold">
                + ₹{(deliveryChargePaise / 100).toFixed(0)}
              </span>
            </div>
          )}
        </div>

        {/* 2. Net Amount Big Box */}
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">
            Net amount
          </span>
          <div className="text-4xl font-black text-[#0d6e53] dark:text-emerald-400 tracking-tight font-mono mt-0.5">
            ₹{roundedRupees}
          </div>
        </div>

        {/* 3. Payment Method 2x2 Grid */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPaymentMethod('cash')}
            className={`py-3 rounded-2xl font-black text-xs transition-all cursor-pointer ${
              paymentMethod === 'cash'
                ? 'bg-[#0d6e53] text-white shadow-md'
                : 'bg-white dark:bg-surface-panel border border-gray-200 dark:border-border-subtle text-gray-800 dark:text-gray-200 hover:bg-gray-50'
            }`}
          >
            Cash
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod('upi')}
            className={`py-3 rounded-2xl font-black text-xs transition-all cursor-pointer ${
              paymentMethod === 'upi'
                ? 'bg-[#0d6e53] text-white shadow-md'
                : 'bg-white dark:bg-surface-panel border border-gray-200 dark:border-border-subtle text-gray-800 dark:text-gray-200 hover:bg-gray-50'
            }`}
          >
            UPI
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod('credit')}
            className={`py-3 rounded-2xl font-black text-xs transition-all cursor-pointer ${
              paymentMethod === 'credit'
                ? 'bg-[#0d6e53] text-white shadow-md'
                : 'bg-white dark:bg-surface-panel border border-gray-200 dark:border-border-subtle text-gray-800 dark:text-gray-200 hover:bg-gray-50'
            }`}
          >
            Udhaar
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod('split')}
            className={`py-3 rounded-2xl font-black text-xs transition-all cursor-pointer ${
              paymentMethod === 'split'
                ? 'bg-[#0d6e53] text-white shadow-md'
                : 'bg-white dark:bg-surface-panel border border-gray-200 dark:border-border-subtle text-gray-800 dark:text-gray-200 hover:bg-gray-50'
            }`}
          >
            Split
          </button>
        </div>

        {/* 4. CASH RECEIVED Tender Box (When Cash is selected) */}
        {paymentMethod === 'cash' && (
          <div className="rounded-2xl border-2 border-[#0d6e53]/70 bg-white dark:bg-surface-panel p-3.5 space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-gray-500 tracking-wider block">
                CASH RECEIVED (₹)
              </span>
              {roundedRupees > 0 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCashReceived(String(roundedRupees))}
                    className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-[#0d6e53] dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-extrabold hover:bg-emerald-100 cursor-pointer"
                    title="Fill exact net amount"
                  >
                    Exact ₹{roundedRupees}
                  </button>
                  {roundedRupees % 100 !== 0 && (
                    <button
                      type="button"
                      onClick={() => setCashReceived(String(Math.ceil(roundedRupees / 100) * 100))}
                      className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-surface-card text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-border-subtle text-[10px] font-bold hover:bg-gray-200 cursor-pointer"
                    >
                      ₹{Math.ceil(roundedRupees / 100) * 100}
                    </button>
                  )}
                  {roundedRupees < 500 && (
                    <button
                      type="button"
                      onClick={() => setCashReceived('500')}
                      className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-surface-card text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-border-subtle text-[10px] font-bold hover:bg-gray-200 cursor-pointer"
                    >
                      ₹500
                    </button>
                  )}
                </div>
              )}
            </div>
            <input
              ref={cashReceivedInputRef}
              type="number"
              placeholder="Enter cash received..."
              value={cashReceived}
              onChange={(e) => setCashReceived(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCheckout();
                }
              }}
              className="w-full text-right font-black font-mono text-2xl text-gray-900 dark:text-white placeholder:text-gray-300 dark:placeholder:text-gray-600 placeholder:text-sm placeholder:font-semibold bg-transparent outline-none"
            />
            <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-border-subtle">
              <span className="text-xs text-gray-500">Change to return</span>
              <span className="text-2xl font-black font-mono text-amber-700 dark:text-amber-400">
                {changeToReturnRupees !== null ? `₹${changeToReturnRupees}` : '—'}
              </span>
            </div>
          </div>
        )}

        {/* 5. Checkboxes */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={printNormalBill}
                onChange={(e) => setPrintNormalBill(e.target.checked)}
                className="w-4 h-4 rounded text-[#0d6e53] accent-[#0d6e53]"
              />
              <span>Bill Print</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300">
              <input
                type="checkbox"
                checked={printTokenBill}
                onChange={(e) => setPrintTokenBill(e.target.checked)}
                className="w-4 h-4 rounded text-[#0d6e53] accent-[#0d6e53]"
              />
              <span>Token Bill</span>
            </label>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={skipPaymentConfirmation}
              onChange={(e) => setSkipPaymentConfirmation(e.target.checked)}
              className="w-4 h-4 rounded text-[#0d6e53] accent-[#0d6e53]"
            />
            <span>Print without confirming</span>
          </label>
        </div>

        {/* Feedback / Error message */}
        {errorMessage && (
          <div className="p-2.5 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold text-center">
            {errorMessage}
          </div>
        )}
        {whatsAppFeedback && (
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold text-center">
            {whatsAppFeedback}
          </div>
        )}

        {/* 6. Action Buttons */}
        <div className="space-y-2 mt-auto">
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleCheckout}
            className="w-full py-4 rounded-2xl bg-[#0d6e53] hover:bg-[#0a5742] text-white font-black text-sm tracking-wide shadow-md transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
          >
            {isProcessing ? 'Processing...' : 'Complete & Print'}
          </button>

          <button
            type="button"
            onClick={handleSendWhatsAppBill}
            className="w-full py-2.5 rounded-2xl border-2 border-[#0d6e53] bg-white dark:bg-surface-panel hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-[#0d6e53] dark:text-emerald-400 font-black text-xs transition-colors cursor-pointer text-center"
          >
            Send bill on WhatsApp
          </button>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => cart.holdInvoice()}
              className="py-2 rounded-xl border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-panel hover:bg-gray-50 text-gray-700 dark:text-gray-300 font-bold text-xs text-center cursor-pointer"
            >
              Hold bill
            </button>
            <button
              type="button"
              onClick={onOpenHeldBills}
              className="py-2 rounded-xl border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-panel hover:bg-gray-50 text-gray-700 dark:text-gray-300 font-bold text-xs text-center cursor-pointer"
            >
              View Held Bills
            </button>
          </div>
        </div>

      </div>

      {/* Floating Wastage Calculator Dialog */}
      {showCalculator && (
        <div className="fixed bottom-16 right-6 z-50 w-96 shadow-2xl rounded-2xl overflow-hidden border border-gray-200 dark:border-border-subtle bg-white dark:bg-surface-card animate-in slide-in-from-bottom-6">
          <div className="p-3 bg-[#0d6e53] text-white flex items-center justify-between">
            <span className="font-black text-xs">Live Weight Wastage Calculator</span>
            <button type="button" onClick={() => setShowCalculator(false)} className="text-white hover:text-gray-200">
              <X size={15} />
            </button>
          </div>
          <div className="p-3">
            <WastageCalculatorWidget />
          </div>
        </div>
      )}

      {/* Sales Return Modal */}
      {showSalesReturn && (
        <SalesReturnModal
          isOpen={showSalesReturn}
          onClose={() => setShowSalesReturn(false)}
        />
      )}

      {/* WhatsApp Custom Phone Modal */}
      {showWhatsAppModal && (
        <WhatsAppPhoneModal
          isOpen={showWhatsAppModal}
          invoiceId={((cart.items.length > 0 && cart.activeInvoice?.id) ? cart.activeInvoice.id : (lastCompletedInvoice?.invoice?.id || cart.activeInvoice?.id)) || 0}
          invoiceNumber={lastCompletedInvoice?.invoice?.invoice_number || cart.activeInvoice?.invoice_number}
          customerId={lastCompletedInvoice?.invoice?.customer_id || cart.activeInvoice?.customer_id || customer?.id}
          customerName={(lastCompletedInvoice as any)?.customer?.name || customer?.name}
          initialPhone={customer?.whatsapp || customer?.phone || customer?.phone2 || (lastCompletedInvoice as any)?.customer?.whatsapp || (lastCompletedInvoice as any)?.customer?.phone || ''}
          onClose={() => setShowWhatsAppModal(false)}
          onSuccess={() => {
            setShowWhatsAppModal(false);
            setWhatsAppFeedback('✓ Bill sent successfully via WhatsApp!');
            setTimeout(() => setWhatsAppFeedback(null), 4000);
          }}
        />
      )}

      {/* Phase 2: Repeat Last Order Modal */}
      {showRepeatOrderModal && (
        <RepeatOrderModal
          customerId={customer?.id || null}
          customerName={customer?.name || 'Customer'}
          isOpen={showRepeatOrderModal}
          onClose={() => setShowRepeatOrderModal(false)}
          onConfirmAddItems={async (items) => {
            let addedCount = 0;
            for (const it of items) {
              try {
                await cart.addItem({
                  product_variant_id: it.product_variant_id,
                  quantity_grams: it.quantity_grams ?? null,
                  quantity_units: it.quantity_units ?? null,
                  override_rate_paise: it.current_rate_paise,
                });
                addedCount++;
              } catch (err: any) {
                console.error('Failed to add repeat item:', err);
              }
            }
            if (addedCount > 0) {
              setWhatsAppFeedback(`✓ Added ${addedCount} items from previous order`);
              setTimeout(() => setWhatsAppFeedback(null), 3000);
            }
          }}
        />
      )}

    </div>
  );
}
