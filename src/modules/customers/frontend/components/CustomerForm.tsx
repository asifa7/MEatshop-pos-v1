import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Save, Shield, MapPin, Info, AlertTriangle, 
  Phone, User, Check, Sparkles, UtensilsCrossed, Link2
} from 'lucide-react';
import { 
  useCreateCustomer, 
  useUpdateCustomer, 
  useCustomerGroups, 
  useCheckCustomerDuplicates 
} from '../hooks/useCustomers';
import type { 
  Customer, 
  CustomerCategory, 
  PriceTier, 
  PaymentMethodType, 
  CustomerDuplicateMatch 
} from '../types/customer.types';

interface CustomerFormProps {
  isOpen: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSelectExisting?: (customer: CustomerDuplicateMatch) => void;
}

type Tab = 'basic' | 'preferences' | 'address' | 'credit' | 'notes';

export default function CustomerForm({ 
  isOpen, 
  onClose, 
  customer = null,
  onSelectExisting 
}: CustomerFormProps) {
  const [activeTab, setActiveTab] = useState<Tab>('basic');
  
  // Basic info
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [phone, setPhone] = useState('');
  const [phone2, setPhone2] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive' | 'blocked'>('active');

  // Dual-Role Linked Supplier
  const [linkedSupplierId, setLinkedSupplierId] = useState<string>('');
  const [suppliersList, setSuppliersList] = useState<Array<{ id: number; code?: string; company_name?: string; name?: string; phone?: string | null }>>([]);

  // Address
  const [billingLine1, setBillingLine1] = useState('');
  const [billingLine2, setBillingLine2] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingState, setBillingState] = useState('');
  const [billingPincode, setBillingPincode] = useState('');
  const [shippingSameAsBilling, setShippingSameAsBilling] = useState(true);
  const [shippingLine1, setShippingLine1] = useState('');
  const [shippingLine2, setShippingLine2] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingState, setShippingState] = useState('');
  const [shippingPincode, setShippingPincode] = useState('');

  // Structured Preferences
  const [preferredCut, setPreferredCut] = useState<'Bone' | 'Boneless' | 'Any' | ''>('Any');
  const [skinPreference, setSkinPreference] = useState<'Skin' | 'No Skin' | 'Any' | ''>('Any');
  const [cuttingPreference, setCuttingPreference] = useState('Curry Cut');
  const [typicalQuantity, setTypicalQuantity] = useState('1 kg');
  const [prefPayment, setPrefPayment] = useState<PaymentMethodType>('cash');
  const [deliveryPreference, setDeliveryPreference] = useState('Counter Pickup');
  const [packagingPreference, setPackagingPreference] = useState('Standard');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Classification & Credit
  const [category, setCategory] = useState<CustomerCategory>('Retail');
  const [groupId, setGroupId] = useState<string>('');
  const [creditAllowed, setCreditAllowed] = useState(false);
  const [creditLimitRupees, setCreditLimitRupees] = useState('0');
  const [openingBalanceRupees, setOpeningBalanceRupees] = useState('0');
  const [openingBalanceDate, setOpeningBalanceDate] = useState('');
  const [priceTier, setPriceTier] = useState<PriceTier>('standard');
  const [discountPercent, setDiscountPercent] = useState('0');
  const [prefDeliveryTime, setPrefDeliveryTime] = useState('');
  const [manualTier, setManualTier] = useState<string>('auto');
  const [preferredTimeSlot, setPreferredTimeSlot] = useState<string>('flexible');

  // Notes
  const [notes, setNotes] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Duplicate Warning Modal State
  const [duplicates, setDuplicates] = useState<CustomerDuplicateMatch[]>([]);
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [bypassDuplicateWarning, setBypassDuplicateWarning] = useState(false);

  // Mutations
  const { data: groups } = useCustomerGroups();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const checkDuplicates = useCheckCustomerDuplicates();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    window.api.invoke('suppliers:get-all')
      .then((res: any) => {
        if (res?.success && Array.isArray(res.data)) {
          setSuppliersList(res.data);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  // Detect if customer name or phone matches an unlinked supplier
  const suggestedSupplier = useMemo(() => {
    if (linkedSupplierId) return null;
    const trimmedName = name.trim().toLowerCase();
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    if (trimmedName.length < 3 && cleanPhone.length < 10) return null;
    return suppliersList.find((s) => {
      const sName = (s.company_name || s.name || '').trim().toLowerCase();
      const sPhone = (s.phone || '').replace(/\D/g, '').slice(-10);
      if (trimmedName.length >= 3 && sName === trimmedName) return true;
      if (cleanPhone.length === 10 && sPhone === cleanPhone) return true;
      return false;
    }) || null;
  }, [name, phone, suppliersList, linkedSupplierId]);

  const linkedSupplierObj = useMemo(() => {
    if (!linkedSupplierId) return null;
    return suppliersList.find((s) => String(s.id) === String(linkedSupplierId)) || null;
  }, [linkedSupplierId, suppliersList]);

  useEffect(() => {
    if (customer) {
      setName(customer.name);
      setBusinessName(customer.business_name || '');
      setGstin(customer.gstin || '');
      setPan(customer.pan || '');
      setPhone(customer.phone || '');
      setPhone2(customer.phone2 || '');
      setWhatsapp(customer.whatsapp || '');
      setEmail(customer.email || '');
      setStatus((customer.status as any) || 'active');
      setLinkedSupplierId((customer as any).linked_supplier_id ? String((customer as any).linked_supplier_id) : '');

      setBillingLine1(customer.billing_address_line1 || '');
      setBillingLine2(customer.billing_address_line2 || '');
      setBillingCity(customer.billing_city || '');
      setBillingState(customer.billing_state || '');
      setBillingPincode(customer.billing_pincode || '');

      const isSame =
        customer.billing_address_line1 === customer.shipping_address_line1 &&
        customer.billing_city === customer.shipping_city &&
        customer.billing_pincode === customer.shipping_pincode;

      setShippingSameAsBilling(isSame);
      setShippingLine1(customer.shipping_address_line1 || '');
      setShippingLine2(customer.shipping_address_line2 || '');
      setShippingCity(customer.shipping_city || '');
      setShippingState(customer.shipping_state || '');
      setShippingPincode(customer.shipping_pincode || '');

      // Preferences
      setPreferredCut((customer.preferred_cut as any) || 'Any');
      setSkinPreference((customer.skin_preference as any) || 'Any');
      setCuttingPreference(customer.cutting_preference || 'Curry Cut');
      setTypicalQuantity(customer.typical_quantity || '1 kg');
      setDeliveryPreference(customer.delivery_preference || 'Counter Pickup');
      setPackagingPreference(customer.packaging_preference || 'Standard');
      setSpecialInstructions(customer.special_instructions || '');

      setCategory(customer.category);
      setGroupId(customer.group_id ? String(customer.group_id) : '');
      setCreditAllowed(customer.credit_allowed === 1);
      setCreditLimitRupees(String(customer.credit_limit_paise / 100));
      setOpeningBalanceRupees(String(customer.opening_balance_paise / 100));
      setOpeningBalanceDate(customer.opening_balance_date || '');
      setPriceTier(customer.price_tier as PriceTier);
      setDiscountPercent(String(customer.discount_percent));
      setPrefPayment(customer.preferred_payment_method as PaymentMethodType);
      setPrefDeliveryTime(customer.preferred_delivery_time || '');
      setManualTier(customer.manual_tier || 'auto');
      setPreferredTimeSlot(customer.preferred_time_slot || 'flexible');
      setNotes(customer.notes || '');
      setDeliveryNotes(customer.delivery_notes || '');
    } else {
      // Clear form for new customer
      setName('');
      setBusinessName('');
      setGstin('');
      setPan('');
      setPhone('');
      setPhone2('');
      setWhatsapp('');
      setEmail('');
      setStatus('active');
      setLinkedSupplierId('');
      setBillingLine1('');
      setBillingLine2('');
      setBillingCity('');
      setBillingState('');
      setBillingPincode('');
      setShippingSameAsBilling(true);
      setShippingLine1('');
      setShippingLine2('');
      setShippingCity('');
      setShippingState('');
      setShippingPincode('');
      setPreferredCut('Any');
      setSkinPreference('Any');
      setCuttingPreference('Curry Cut');
      setTypicalQuantity('1 kg');
      setDeliveryPreference('Counter Pickup');
      setPackagingPreference('Standard');
      setSpecialInstructions('');
      setCategory('Retail');
      setGroupId('');
      setCreditAllowed(false);
      setCreditLimitRupees('0');
      setOpeningBalanceRupees('0');
      setOpeningBalanceDate('');
      setPriceTier('standard');
      setDiscountPercent('0');
      setPrefPayment('cash');
      setPrefDeliveryTime('');
      setManualTier('auto');
      setPreferredTimeSlot('flexible');
      setNotes('');
      setDeliveryNotes('');
    }
    setErrors({});
    setDuplicates([]);
    setShowDuplicateWarning(false);
    setBypassDuplicateWarning(false);
    setActiveTab('basic');
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const sanitizeCustomerPayload = (raw: Record<string, any>) => {
    const sanitized: Record<string, any> = {};
    for (const [key, val] of Object.entries(raw)) {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        sanitized[key] = trimmed === '' ? null : trimmed;
      } else if (key === 'credit_allowed' || key === 'allow_face_recognition') {
        sanitized[key] = Boolean(val);
      } else {
        sanitized[key] = val;
      }
    }
    return sanitized;
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Customer name is required';
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      errs.gstin = 'GSTIN format is invalid (e.g. 22AAAAA1111A1Z1)';
    }
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
      errs.pan = 'PAN format is invalid (e.g. ABCDE1234F)';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCopyPhoneToWhatsapp = () => {
    setWhatsapp(phone);
  };

  const handleSave = async (e?: React.FormEvent, forceBypass = false) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    // Check for duplicates if creating new customer or changing phone on existing
    if (!customer && !bypassDuplicateWarning && !forceBypass && (phone.trim() || whatsapp.trim())) {
      try {
        const checkRes = await checkDuplicates.mutateAsync({
          phone: phone.trim() || null,
          whatsapp: whatsapp.trim() || null,
          name: name.trim() || null,
          excludeId: customer ? (customer as Customer).id : null,
        });

        if (checkRes.hasDuplicate && checkRes.duplicates.length > 0) {
          setDuplicates(checkRes.duplicates);
          setShowDuplicateWarning(true);
          return;
        }
      } catch (err) {
        console.error('Error during duplicate check:', err);
      }
    }

    setIsSubmitting(true);
    const billingPayload = {
      billing_address_line1: billingLine1,
      billing_address_line2: billingLine2,
      billing_city: billingCity,
      billing_state: billingState,
      billing_pincode: billingPincode,
    };
    const shippingPayload = shippingSameAsBilling
      ? {
          shipping_address_line1: billingLine1,
          shipping_address_line2: billingLine2,
          shipping_city: billingCity,
          shipping_state: billingState,
          shipping_pincode: billingPincode,
        }
      : {
          shipping_address_line1: shippingLine1,
          shipping_address_line2: shippingLine2,
          shipping_city: shippingCity,
          shipping_state: shippingState,
          shipping_pincode: shippingPincode,
        };

    const rawPayload = {
      name,
      business_name: businessName,
      gstin,
      pan,
      phone,
      phone2,
      whatsapp,
      email,
      status,
      linked_supplier_id: linkedSupplierId ? Number(linkedSupplierId) : null,
      ...billingPayload,
      ...shippingPayload,
      category,
      group_id: groupId ? Number(groupId) : null,
      credit_allowed: creditAllowed,
      credit_limit_paise: Math.round(parseFloat(creditLimitRupees || '0') * 100),
      opening_balance_paise: Math.round(parseFloat(openingBalanceRupees || '0') * 100),
      opening_balance_date: openingBalanceDate,
      preferred_payment_method: prefPayment,
      preferred_delivery_time: prefDeliveryTime,
      price_tier: priceTier,
      manual_tier: manualTier === 'auto' ? null : manualTier,
      preferred_time_slot: preferredTimeSlot === 'flexible' ? null : preferredTimeSlot,
      discount_percent: parseFloat(discountPercent || '0'),
      preferred_cut: preferredCut,
      skin_preference: skinPreference,
      cutting_preference: cuttingPreference,
      typical_quantity: typicalQuantity,
      delivery_preference: deliveryPreference,
      packaging_preference: packagingPreference,
      special_instructions: specialInstructions,
      notes,
      delivery_notes: deliveryNotes,
    };

    const payload = sanitizeCustomerPayload(rawPayload);

    try {
      if (customer) {
        await updateCustomer.mutateAsync({ id: customer.id, fields: payload });
      } else {
        await createCustomer.mutateAsync(payload);
      }
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrors({ api: err.message || 'Saving failed' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-panel border border-border-subtle rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-card/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-500 font-bold">
              <User size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-extrabold text-text-primary">
                  {customer ? `Edit Profile: ${customer.name}` : 'Create New Customer Account'}
                </h3>
                {linkedSupplierId && (
                  <span className="px-2.5 py-0.5 bg-indigo-500/15 border border-indigo-500/40 text-indigo-700 dark:text-indigo-300 rounded-full text-[10px] font-extrabold inline-flex items-center gap-1">
                    <Link2 size={11} />
                    <span>
                      🔗 Linked Supplier: {linkedSupplierObj ? (linkedSupplierObj.company_name || linkedSupplierObj.name) : ((customer as any)?.linked_supplier_name || `#${linkedSupplierId}`)}
                    </span>
                  </span>
                )}
              </div>
              <p className="text-xs text-text-secondary">
                {customer ? `${customer.customer_code} • Update contact details, cutting preferences & credit` : 'Fill in profile, preferences, and credit account settings'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border-subtle bg-surface-card/30 px-6 gap-2">
          {[
            { id: 'basic', label: 'Basic Info', icon: <User size={14} /> },
            { id: 'preferences', label: 'Preferences & Cutting', icon: <UtensilsCrossed size={14} /> },
            { id: 'address', label: 'Address Details', icon: <MapPin size={14} /> },
            { id: 'credit', label: 'Credit & Accounts', icon: <Shield size={14} /> },
            { id: 'notes', label: 'Notes', icon: <Info size={14} /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as Tab)}
              className={`flex items-center gap-2 py-3 px-4 border-b-2 font-bold text-xs transition-colors ${
                activeTab === t.id
                  ? 'border-brand-500 text-brand-600 dark:text-brand-400 bg-brand-500/10'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={(e) => handleSave(e)} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errors.api && (
            <div className="p-3 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800/50 rounded-xl text-xs text-red-800 dark:text-red-400 font-semibold flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>{errors.api}</span>
            </div>
          )}

          {/* Auto-detected Supplier Match Banner */}
          {suggestedSupplier && (
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/35 rounded-xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs">
                <Link2 size={16} className="text-indigo-500 flex-shrink-0" />
                <div>
                  <span className="font-extrabold text-indigo-800 dark:text-indigo-300">
                    Dual-Role Match Found:
                  </span>{' '}
                  <span className="text-text-secondary">
                    Supplier <strong>{suggestedSupplier.company_name || suggestedSupplier.name}</strong> ({suggestedSupplier.code || `#${suggestedSupplier.id}`}) shares the same name/phone.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLinkedSupplierId(String(suggestedSupplier.id))}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-extrabold whitespace-nowrap cursor-pointer"
              >
                🔗 Link Supplier Account
              </button>
            </div>
          )}

          {/* TAB 1: BASIC INFO */}
          {activeTab === 'basic' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Customer Name */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">
                    Customer Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma, Al-Madina Hotel"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                    autoFocus
                  />
                  {errors.name && <p className="text-[11px] text-red-500 mt-1 font-semibold">{errors.name}</p>}
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Customer Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CustomerCategory)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  >
                    <option value="Retail">Retail (Walk-in)</option>
                    <option value="Wholesale">Wholesale (Bulk)</option>
                    <option value="Hotel">Hotel</option>
                    <option value="Restaurant">Restaurant</option>
                    <option value="Catering">Catering</option>
                    <option value="Distributor">Distributor</option>
                    <option value="Contract">Contract</option>
                  </select>
                </div>

                {/* Customer Tier (Lifecycle Bar / Manual Override) */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Customer Tier</label>
                  <select
                    value={manualTier}
                    onChange={(e) => setManualTier(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  >
                    <option value="auto">Auto (Move based on purchases)</option>
                    <option value="vip">⭐ VIP Customer</option>
                    <option value="regular">🟢 Regular Customer</option>
                    <option value="new">🆕 New Customer</option>
                    <option value="rare">⏳ Rare / Infrequent</option>
                    <option value="wholesale">📦 Wholesale Partner</option>
                    <option value="restaurant">🍽️ Restaurant / Hotel</option>
                  </select>
                </div>

                {/* Usual Store Visit Time Window */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Usual Visit Time Window</label>
                  <select
                    value={preferredTimeSlot}
                    onChange={(e) => setPreferredTimeSlot(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  >
                    <option value="flexible">Auto (Analyzes Invoice Timestamps)</option>
                    <option value="morning">🌅 Morning (6 AM - 12 PM)</option>
                    <option value="afternoon">☀️ Afternoon (12 PM - 5 PM)</option>
                    <option value="evening">🌙 Evening (5 PM+)</option>
                  </select>
                </div>

                {/* Primary Phone */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1 flex items-center justify-between">
                    <span>Primary Phone</span>
                    <span className="text-[10px] text-text-muted">Primary search key</span>
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm font-mono text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>

                {/* WhatsApp */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1 flex items-center justify-between">
                    <span>WhatsApp Number</span>
                    {phone && (
                      <button
                        type="button"
                        onClick={handleCopyPhoneToWhatsapp}
                        className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline font-semibold"
                      >
                        Same as Phone
                      </button>
                    )}
                  </label>
                  <input
                    type="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="WhatsApp contact"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm font-mono text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>

                {/* Secondary Phone */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Secondary / Landline</label>
                  <input
                    type="tel"
                    value={phone2}
                    onChange={(e) => setPhone2(e.target.value)}
                    placeholder="Alternate phone number"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm font-mono text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="customer@example.com"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>

                {/* Business / Enterprise Name */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Business / Firm Name (Optional)</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Royal Caterers Pvt Ltd"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>

                {/* Status */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Account Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="blocked">Blocked / Suspended</option>
                  </select>
                </div>

                {/* Dual-Role Linked Supplier */}
                <div className="md:col-span-2 bg-indigo-500/5 border border-indigo-500/25 rounded-xl p-3.5">
                  <label className="block text-xs font-extrabold text-indigo-700 dark:text-indigo-300 mb-1.5 flex items-center gap-1.5">
                    <Link2 size={14} />
                    <span>🔗 Linked Supplier Account (Dual-Role Customer + Supplier)</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <select
                      value={linkedSupplierId}
                      onChange={(e) => setLinkedSupplierId(e.target.value)}
                      className="flex-1 bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2 text-xs text-text-primary focus:border-indigo-500 focus:outline-none font-bold"
                    >
                      <option value="">— Not Linked to a Supplier —</option>
                      {suppliersList.map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.company_name || s.name} ({s.code || `#${s.id}`}){s.phone ? ` • ${s.phone}` : ''}
                        </option>
                      ))}
                    </select>
                    {linkedSupplierId && (
                      <button
                        type="button"
                        onClick={() => setLinkedSupplierId('')}
                        className="px-3 py-2 bg-surface-card hover:bg-red-500/15 border border-border-subtle text-red-500 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Unlink
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-text-muted mt-1">
                    Link if this customer also supplies goods to your shop (keeps both accounts distinct while cross-linking them).
                  </p>
                </div>

                {/* GSTIN */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">GSTIN</label>
                  <input
                    type="text"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="22AAAAA1111A1Z1"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm font-mono text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                  {errors.gstin && <p className="text-[11px] text-red-500 mt-1 font-semibold">{errors.gstin}</p>}
                </div>

                {/* PAN */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">PAN Number</label>
                  <input
                    type="text"
                    value={pan}
                    onChange={(e) => setPan(e.target.value.toUpperCase())}
                    placeholder="ABCDE1234F"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm font-mono text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                  {errors.pan && <p className="text-[11px] text-red-500 mt-1 font-semibold">{errors.pan}</p>}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: STRUCTURED PREFERENCES & CUTTING */}
          {activeTab === 'preferences' && (
            <div className="space-y-5">
              <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-4 flex items-start gap-3 shadow-sm">
                <Sparkles className="text-brand-500 flex-shrink-0 mt-0.5" size={18} />
                <div className="text-xs">
                  <p className="font-extrabold text-text-primary">Billing-Time Meat Shop Preferences</p>
                  <p className="text-text-secondary mt-0.5">
                    These preferences are automatically displayed to the butcher & cashier in a top banner the moment this customer is selected at billing.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Preferred Cut */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1.5">Preferred Cut</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Bone', 'Boneless', 'Any'].map((cut) => (
                      <button
                        key={cut}
                        type="button"
                        onClick={() => setPreferredCut(cut as any)}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                          preferredCut === cut
                            ? 'bg-brand-500/20 border-brand-500 text-brand-600 dark:text-brand-400 shadow-sm'
                            : 'bg-surface-card border-border-subtle text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {cut}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Skin Preference */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1.5">Skin Preference</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Skin', 'No Skin', 'Any'].map((skin) => (
                      <button
                        key={skin}
                        type="button"
                        onClick={() => setSkinPreference(skin as any)}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                          skinPreference === skin
                            ? 'bg-brand-500/20 border-brand-500 text-brand-600 dark:text-brand-400 shadow-sm'
                            : 'bg-surface-card border-border-subtle text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        {skin}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cutting Style Preference */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Cutting Style Preference</label>
                  <select
                    value={cuttingPreference}
                    onChange={(e) => setCuttingPreference(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  >
                    <option value="Curry Cut">Curry Cut (Medium)</option>
                    <option value="Biryani Cut">Biryani Cut (Large)</option>
                    <option value="Small Pieces">Small Pieces / Fry Cut</option>
                    <option value="Keema / Minced">Keema / Minced</option>
                    <option value="Fillet / Breast Slices">Fillet / Breast Slices</option>
                    <option value="Whole Bird / Dressed">Whole Bird / Dressed</option>
                    <option value="Soup Bones / Ribs">Soup Bones / Ribs</option>
                    <option value="Custom Cut">Custom (See Instructions)</option>
                  </select>
                </div>

                {/* Typical Quantity */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Typical Order Quantity</label>
                  <select
                    value={typicalQuantity}
                    onChange={(e) => setTypicalQuantity(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  >
                    <option value="500g">500g</option>
                    <option value="1 kg">1.0 kg</option>
                    <option value="1.5 kg">1.5 kg</option>
                    <option value="2 kg">2.0 kg</option>
                    <option value="3 kg">3.0 kg</option>
                    <option value="5 kg">5.0 kg</option>
                    <option value="10 kg+">10 kg+ (Wholesale)</option>
                  </select>
                </div>

                {/* Preferred Payment Method */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Preferred Payment Method</label>
                  <select
                    value={prefPayment}
                    onChange={(e) => setPrefPayment(e.target.value as PaymentMethodType)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI / QR</option>
                    <option value="card">Debit / Credit Card</option>
                    <option value="credit">Credit / Pay Later</option>
                    <option value="bank_transfer">Bank Transfer / NEFT</option>
                  </select>
                </div>

                {/* Delivery Preference */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Delivery Preference</label>
                  <select
                    value={deliveryPreference}
                    onChange={(e) => setDeliveryPreference(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  >
                    <option value="Counter Pickup">Counter Pickup</option>
                    <option value="Home Delivery">Home Delivery</option>
                    <option value="Bulk Store Drop">Bulk Store Drop</option>
                  </select>
                </div>

                {/* Packaging Preference */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Packaging Preference</label>
                  <select
                    value={packagingPreference}
                    onChange={(e) => setPackagingPreference(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  >
                    <option value="Standard">Standard Polybag</option>
                    <option value="Double Polybag">Double Polybag (Leakproof)</option>
                    <option value="Paper Wrapped">Paper Wrapped</option>
                    <option value="Vacuum Sealed">Vacuum Sealed</option>
                  </select>
                </div>

                {/* Preferred Delivery Time */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Preferred Time / Slot</label>
                  <input
                    type="text"
                    value={prefDeliveryTime}
                    onChange={(e) => setPrefDeliveryTime(e.target.value)}
                    placeholder="e.g. Morning 8-10 AM, Sunday Evening"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>

                {/* Special Instructions */}
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-text-secondary mb-1">
                    Special Preparation Instructions
                  </label>
                  <textarea
                    value={specialInstructions}
                    onChange={(e) => setSpecialInstructions(e.target.value)}
                    rows={2}
                    placeholder="e.g. Keep liver separate, clean fat thoroughly, include extra masala packet"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl p-3 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ADDRESS DETAILS */}
          {activeTab === 'address' && (
            <div className="space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-brand-500">Billing Address</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-text-secondary mb-1">Address Line 1</label>
                  <input
                    type="text"
                    value={billingLine1}
                    onChange={(e) => setBillingLine1(e.target.value)}
                    placeholder="Street address, shop number, building"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-xs font-bold text-text-secondary mb-1">Address Line 2</label>
                  <input
                    type="text"
                    value={billingLine2}
                    onChange={(e) => setBillingLine2(e.target.value)}
                    placeholder="Area, landmark"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">City</label>
                  <input
                    type="text"
                    value={billingCity}
                    onChange={(e) => setBillingCity(e.target.value)}
                    placeholder="City"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">State</label>
                  <input
                    type="text"
                    value={billingState}
                    onChange={(e) => setBillingState(e.target.value)}
                    placeholder="State"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">Pincode</label>
                  <input
                    type="text"
                    value={billingPincode}
                    onChange={(e) => setBillingPincode(e.target.value)}
                    placeholder="6-digit pincode"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm font-mono text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CREDIT & ACCOUNTS */}
          {activeTab === 'credit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-surface-card border border-border-subtle rounded-xl shadow-sm">
                <div>
                  <p className="text-sm font-bold text-text-primary">Enable Credit / Pay Later</p>
                  <p className="text-xs text-text-secondary">Allow this customer to purchase goods on credit balance</p>
                </div>
                <input
                  type="checkbox"
                  checked={creditAllowed}
                  onChange={(e) => setCreditAllowed(e.target.checked)}
                  className="w-5 h-5 accent-brand-500 rounded cursor-pointer"
                />
              </div>

              {creditAllowed && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-text-secondary mb-1">Credit Limit (₹)</label>
                    <input
                      type="number"
                      value={creditLimitRupees}
                      onChange={(e) => setCreditLimitRupees(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm font-mono text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-secondary mb-1">Opening Outstanding (₹)</label>
                    <input
                      type="number"
                      value={openingBalanceRupees}
                      onChange={(e) => setOpeningBalanceRupees(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm font-mono text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-secondary mb-1">Price Tier</label>
                    <select
                      value={priceTier}
                      onChange={(e) => setPriceTier(e.target.value as PriceTier)}
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                    >
                      <option value="standard">Standard Retail</option>
                      <option value="wholesale">Wholesale Discounted</option>
                      <option value="vip">VIP Special</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-text-secondary mb-1">Default Discount %</label>
                    <input
                      type="number"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(e.target.value)}
                      min="0"
                      max="100"
                      step="0.5"
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3.5 py-2.5 text-sm font-mono text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-text-secondary mb-1">Internal Notes & History</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Record customer preferences, relationship notes, or historical remarks..."
                  className="w-full bg-surface-card border border-border-subtle rounded-xl p-3.5 text-sm text-text-primary focus:border-brand-500 focus:outline-none shadow-sm font-medium"
                />
              </div>
            </div>
          )}
        </form>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-between bg-surface-card/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => handleSave()}
            className="btn-primary px-6 py-2 text-xs font-bold flex items-center gap-2"
          >
            <Save size={15} />
            <span>{isSubmitting ? 'Saving...' : customer ? 'Update Profile' : 'Save Customer'}</span>
          </button>
        </div>

        {/* DUPLICATE WARNING MODAL */}
        {showDuplicateWarning && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-surface-card border-2 border-amber-500/50 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3 text-amber-500">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center font-bold">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h4 className="text-base font-extrabold text-text-primary">Possible Duplicate Customer Found</h4>
                  <p className="text-xs text-text-secondary">A customer with matching phone number or details already exists</p>
                </div>
              </div>

              <div className="bg-surface-panel border border-border-subtle rounded-xl p-3 divide-y divide-border-subtle">
                {duplicates.map((dup) => (
                  <div key={dup.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-extrabold text-text-primary">{dup.name}</p>
                      <p className="text-xs text-text-secondary mt-0.5">
                        {dup.customer_code} • Phone: <span className="font-mono text-amber-700 dark:text-amber-300 font-bold">{dup.phone || dup.whatsapp}</span> • {dup.category}
                      </p>
                      {dup.matchReason && (
                        <span className="inline-block mt-1 text-[10px] bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded font-semibold border border-amber-300 dark:border-amber-500/30">
                          {dup.matchReason}
                        </span>
                      )}
                    </div>
                    {onSelectExisting && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowDuplicateWarning(false);
                          onClose();
                          onSelectExisting(dup);
                        }}
                        className="px-3 py-1.5 bg-brand-500/20 hover:bg-brand-500 text-brand-700 dark:text-brand-300 hover:text-white rounded-lg text-xs font-bold transition-all"
                      >
                        Select Existing
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDuplicateWarning(false)}
                  className="px-4 py-2 border border-border-subtle rounded-xl text-xs font-bold text-text-secondary hover:text-text-primary"
                >
                  Edit Number
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBypassDuplicateWarning(true);
                    setShowDuplicateWarning(false);
                    handleSave(undefined, true);
                  }}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  Proceed & Save Anyway
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
