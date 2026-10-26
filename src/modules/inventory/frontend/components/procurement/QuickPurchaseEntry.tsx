import React, { useState, useRef } from 'react';
import { Trash2, Save, Building2, DollarSign, Clock, CheckCircle2, AlertCircle, Paperclip } from 'lucide-react';
import {
  useSuppliersProfile,
  useRecordQuickPurchase,
  useSupplierSnapshot,
  usePassbookLedger,
  useEditPurchaseRecord,
  useLastPurchaseRate,
} from '../../hooks/useSupplierProcurement';
import { useActiveRates } from '../../../../billing/frontend/hooks/useActiveRates';
import { formatPaise, formatDate, PassbookLedgerEntry } from '../../types/supplier.types';
import { QuickPurchaseSchema } from '../../validation/supplier_procurement.schema';
import InvoiceTemplateModal, { InvoiceTemplateData } from './InvoiceTemplateModal';
import { useQuickPurchaseStore } from '../../hooks/useQuickPurchaseStore';
import { IPC_CHANNELS } from '../../../../../core/ipc/channels';
import { formatMoney, formatQty, roundQty, rupeesToPaise, paiseToRupees } from '../../../../../core/shared/math';

import SearchableSupplierCombobox from '../suppliers/SearchableSupplierCombobox';
import SpreadsheetProductSelector from './SpreadsheetProductSelector';
import SupplierForm from '../suppliers/SupplierForm';

function RateHint({
  supplierId,
  variantId,
  unitType,
  rate,
}: {
  supplierId?: number;
  variantId?: number;
  unitType?: string;
  rate?: number;
}) {
  const { data: lastRatePaise } = useLastPurchaseRate(supplierId, variantId);

  const isYield = unitType === 'live_dual' || unitType === 'weight';
  // Standard dressed yield conversion ratio is approximately 1.60 (live kg / 1.60 = dressed kg, or dressed cost = rate * 1.60)
  const effectiveCostPerKg = isYield && rate && rate > 0 ? (rate * 1.60).toFixed(2) : null;

  if (!lastRatePaise && !effectiveCostPerKg) return null;

  return (
    <div className="flex flex-col gap-0.5 mt-0.5 select-none leading-tight">
      {lastRatePaise !== null && lastRatePaise !== undefined && (
        <span className="text-[9px] text-brand-400 font-mono">
          Last: ₹{(lastRatePaise / 100).toFixed(2)}
        </span>
      )}
      {effectiveCostPerKg && (
        <span className="text-[9px] text-amber-400 font-mono" title="Estimated dressed cost per kg (1.6x yield)">
          Dressed: ~₹{effectiveCostPerKg}/kg
        </span>
      )}
    </div>
  );
}

export default function QuickPurchaseEntry() {

  const { data: suppliers, refetch: refetchSuppliers } = useSuppliersProfile();
  const { data: variants } = useActiveRates();
  const recordQuickPurchase = useRecordQuickPurchase();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State and persisted Draft session (Zustand)
  const { draft, setDraftField, setItems, resetDraft } = useQuickPurchaseStore();
  const {
    supplierId,
    receivedDate,
    billNumber,
    supplierInvoiceNumber,
    notes,
    billPhotoPath,
    paymentMethod,
    paidAmount,
    expectedPaymentDate,
    discount,
    tax,
    freight,
    otherCharges,
    editingInvoiceId,
    items,
  } = draft;

  const setSupplierId = (val: string) => setDraftField('supplierId', val);
  const setReceivedDate = (val: string) => setDraftField('receivedDate', val);
  const setSupplierInvoiceNumber = (val: string) => setDraftField('supplierInvoiceNumber', val);
  const setNotes = (val: string) => setDraftField('notes', val);
  const setBillPhotoPath = (val: string | null) => setDraftField('billPhotoPath', val);
  const setPaymentMethod = (val: 'cash' | 'upi' | 'card' | 'credit' | 'partial') => setDraftField('paymentMethod', val);
  const setPaidAmount = (val: string) => setDraftField('paidAmount', val);
  const setDiscount = (val: string) => setDraftField('discount', val);
  const setTax = (val: string) => setDraftField('tax', val);
  const setFreight = (val: string) => setDraftField('freight', val);
  const setOtherCharges = (val: string) => setDraftField('otherCharges', val);

  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showNotesInput, setShowNotesInput] = useState(false);
  
  // Note toggle sync
  React.useEffect(() => {
    if (notes) {
      setShowNotesInput(true);
    }
  }, [notes]);

  // Password confirmation for edits
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [editReason, setEditReason] = useState('');

  const editPurchaseRecord = useEditPurchaseRecord();

  // Auto-initialize items with at least one blank row on mount
  React.useEffect(() => {
    if (items.length === 0) {
      setItems([
        {
          product_variant_id: '',
          quantity: '',
          unit_type: 'weight',
          unit_price: '',
          subtotal: 0
        }
      ]);
    }
  }, []);

  const [errorMsg, setErrorMsg] = useState('');
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [successMsg, setSuccessMsg] = useState('');
  const [invoiceModalData, setInvoiceModalData] = useState<InvoiceTemplateData | null>(null);
  const todayCleanDate = (receivedDate || new Date().toISOString().slice(0, 10)).replace(/[^0-9]/g, '').slice(0, 8);
  const [nextRefNum, setNextRefNum] = useState<string>(`PUR-${todayCleanDate}-001`);

  React.useEffect(() => {
    let active = true;
    const fetchRef = async () => {
      try {
        const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.GET_NEXT_PURCHASE_REF, { receivedDate });
        if (res.success && active) {
          setNextRefNum(res.data);
        }
      } catch (err) {
        console.error('Failed to fetch next purchase ref:', err);
      }
    };
    
    if (editingInvoiceId !== null) {
      setNextRefNum(`PUR-[ID: ${editingInvoiceId}]`);
    } else {
      fetchRef();
    }
    
    return () => { active = false; };
  }, [receivedDate, editingInvoiceId]);

  // Sidebar queries
  const selectedSupplierIdNum = supplierId ? Number(supplierId) : undefined;
  const { data: supplierSnapshot } = useSupplierSnapshot(selectedSupplierIdNum);
  const { data: ledgerData } = usePassbookLedger({
    supplierId: selectedSupplierIdNum,
  });

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('File size exceeds 5MB limit.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      alert('Only JPG, PNG, and PDF files are allowed.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setBillPhotoPath((file as any).path);
  };

  const handleRemoveCommittedItem = (index: number) => {
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const calculatedItemsTotal = items.reduce((acc, cur) => acc + cur.subtotal, 0);
  const totalQty = items.reduce((acc, cur) => acc + (parseFloat(cur.quantity) || 0), 0);

  // Financial calculations
  const discountPaise = Math.round((parseFloat(discount) || 0) * 100);
  const taxPaise = Math.round((parseFloat(tax) || 0) * 100);
  const freightPaise = Math.round((parseFloat(freight) || 0) * 100);
  const otherChargesPaise = Math.round((parseFloat(otherCharges) || 0) * 100);
  const finalTotalPaise = Math.max(0, calculatedItemsTotal - discountPaise + taxPaise + freightPaise + otherChargesPaise);

  let paidPaise = 0;
  if (['cash', 'upi', 'card'].includes(paymentMethod)) {
    paidPaise = paidAmount ? Math.round((parseFloat(paidAmount) || 0) * 100) : finalTotalPaise;
  } else if (paymentMethod === 'partial') {
    paidPaise = Math.min(Math.round((parseFloat(paidAmount) || 0) * 100), finalTotalPaise);
  } else {
    paidPaise = 0; // credit
  }

  const outstandingPaise = Math.max(0, finalTotalPaise - paidPaise);

  // Derived purchase status
  const derivedPurchaseStatus: 'paid' | 'partial' | 'received' | 'draft' =
    outstandingPaise === 0 && finalTotalPaise > 0
      ? 'paid'
      : paidPaise > 0
      ? 'partial'
      : 'received';

  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [showDuplicateConfirmModal, setShowDuplicateConfirmModal] = useState(false);

  // Real-time duplicate check
  React.useEffect(() => {
    let active = true;
    const checkDuplicate = async () => {
      if (!supplierId || !supplierInvoiceNumber || !supplierInvoiceNumber.trim()) {
        setDuplicateWarning(null);
        return;
      }
      try {
        const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.CHECK_DUPLICATE_SUPPLIER_INVOICE, {
          supplier_id: Number(supplierId),
          supplier_invoice_number: supplierInvoiceNumber.trim(),
        });
        if (active && res.success && res.data) {
          setDuplicateWarning(`Warning: Supplier invoice "${supplierInvoiceNumber.trim()}" already exists for this supplier!`);
        } else if (active) {
          setDuplicateWarning(null);
        }
      } catch (err) {
        // non-fatal
      }
    };

    const timer = setTimeout(checkDuplicate, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [supplierId, supplierInvoiceNumber]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (duplicateWarning) {
      setShowDuplicateConfirmModal(true);
      return;
    }
    doSubmitPurchase(false);
  };

  const handleSaveDraft = async () => {
    doSubmitPurchase(true);
  };

  const doSubmitPurchase = async (isDraft: boolean) => {
    setErrorMsg('');
    setSuccessMsg('');
    setValidationErrors({});

    if (!supplierId) {
      setErrorMsg('Please select a supplier');
      return;
    }

    const itemsMapped = items
      .filter(item => item.product_variant_id && item.quantity)
      .map(item => ({
        product_variant_id: parseInt(item.product_variant_id),
        quantity: roundQty(parseFloat(item.quantity) || 0),
        unit_type: item.unit_type,
        unit_price_paise: rupeesToPaise(parseFloat(item.unit_price) || 0),
        subtotal_paise: item.subtotal,
      }));

    if (itemsMapped.length === 0) {
      setErrorMsg('Please add at least one valid item');
      return;
    }

    const payload = {
      supplier_id: parseInt(supplierId),
      received_date: receivedDate,
      bill_amount_paise: finalTotalPaise,
      bill_number: billNumber || undefined,
      supplier_invoice_number: supplierInvoiceNumber.trim() || undefined,
      notes: notes || undefined,
      bill_photo_path: billPhotoPath || undefined,
      payment_method: paymentMethod,
      paid_amount_paise: paidPaise,
      expected_payment_date: expectedPaymentDate || undefined,
      discount_paise: discountPaise,
      tax_paise: taxPaise,
      freight_charges_paise: freightPaise,
      other_charges_paise: otherChargesPaise,
      is_draft: isDraft,
      items: itemsMapped,
    };

    const parsed = QuickPurchaseSchema.safeParse(payload);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      parsed.error.errors.forEach(err => {
        if (err.path[0]) {
          errors[err.path[0].toString()] = err.message;
        }
      });
      setValidationErrors(errors);
      setErrorMsg('Please correct validation errors below');
      return;
    }

    if (editingInvoiceId !== null) {
      // In Edit Mode, trigger password override modal before mutate
      setShowPasswordPrompt(true);
      return;
    }

    try {
      const result = await recordQuickPurchase.mutateAsync(payload);

      setSuccessMsg(
        isDraft
          ? 'Quick Purchase draft saved successfully!'
          : 'Quick Purchase entry submitted successfully! Stock, Payable Bills, and Double-Entry Ledger updated.'
      );

      // Auto-open printable invoice if not draft
      if (!isDraft) {
        const supp = suppliers?.find(s => String(s.id) === supplierId);
        setInvoiceModalData({
          invoiceNumber: result?.invoice?.supplier_invoice_number || supplierInvoiceNumber || `BILL-${Date.now()}`,
          invoiceDate: receivedDate,
          poNumber: result?.invoice?.purchase_ref_number || `PUR-${result?.invoice?.id}`,
          fromName: supp?.company_name || 'Supplier',
          billToName: 'Meat Shop Store',
          items: itemsMapped.map(i => {
            const v = variants?.find((x: any) => x.id === i.product_variant_id);
            return {
              qty: i.quantity,
              description: v ? `${v.product_name} (${v.variant_name})` : `Item #${i.product_variant_id}`,
              unitPricePaise: i.unit_price_paise,
              amountPaise: i.subtotal_paise,
            };
          }),
          subtotalPaise: payload.bill_amount_paise,
          totalPaise: payload.bill_amount_paise,
        });
      }

      // Reset form
      resetDraft();
      if (fileInputRef.current) fileInputRef.current.value = '';
      setItems([
        {
          product_variant_id: '',
          quantity: '',
          unit_type: 'weight',
          unit_price: '',
          subtotal: 0
        }
      ]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record purchase entry');
    }
  };

  const handleSaveEditConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    if (!passwordInput.trim()) {
      alert('Please enter your password.');
      return;
    }
    if (!editReason.trim()) {
      alert('Please enter a mandatory reason for this correction.');
      return;
    }

    try {
      // 1. Verify password via IPC
      const verifyRes = await window.api.invoke(IPC_CHANNELS.AUTH.VERIFY_PASSWORD, { password: passwordInput });
      if (!verifyRes.success || !verifyRes.data) {
        alert('Invalid password. Authentication failed.');
        return;
      }

      // 2. Map items and build payload
      const itemsMapped = items
        .filter(item => item.product_variant_id && item.quantity)
        .map(item => ({
          product_variant_id: parseInt(item.product_variant_id),
          quantity: roundQty(parseFloat(item.quantity) || 0),
          unit_type: item.unit_type,
          unit_price_paise: rupeesToPaise(parseFloat(item.unit_price) || 0),
          subtotal_paise: item.subtotal,
        }));

      const payload = {
        supplier_id: parseInt(supplierId),
        received_date: receivedDate,
        bill_amount_paise: calculatedItemsTotal,
        bill_number: billNumber || undefined,
        notes: notes || undefined,
        bill_photo_path: billPhotoPath || undefined,
        payment_method: paymentMethod,
        items: itemsMapped,
      };

      await editPurchaseRecord.mutateAsync({
        invoiceId: editingInvoiceId!,
        updateData: payload,
        reason: editReason.trim()
      });

      setShowPasswordPrompt(false);
      setPasswordInput('');
      setEditReason('');
      
      setSuccessMsg('Purchase invoice corrected and audited successfully!');
      
      // Auto-open print layout
      const supp = suppliers?.find(s => String(s.id) === supplierId);
      setInvoiceModalData({
        invoiceNumber: billNumber || `BILL-${Date.now()}`,
        invoiceDate: receivedDate,
        poNumber: `PUR-${editingInvoiceId}`,
        fromName: supp?.company_name || 'Supplier',
        billToName: 'Meat Shop Store',
        items: itemsMapped.map(i => {
          const v = variants?.find((x: any) => x.id === i.product_variant_id);
          return {
            qty: i.quantity,
            description: v ? `${v.product_name} (${v.variant_name})` : `Item #${i.product_variant_id}`,
            unitPricePaise: i.unit_price_paise,
            amountPaise: i.subtotal_paise,
          };
        }),
        subtotalPaise: payload.bill_amount_paise,
        totalPaise: payload.bill_amount_paise,
      });

      resetDraft();
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      alert(err.message || 'Failed to save audit correction');
    }
  };

  const handleRecentRowClick = (entry: PassbookLedgerEntry) => {
    const invData: InvoiceTemplateData = {
      invoiceNumber: entry.supplier_bill_number || `INV-${entry.ref_id}`,
      invoiceDate: entry.entry_date,
      poNumber: entry.purchase_ref_number,
      fromName: entry.supplier_name,
      billToName: 'Meat Shop Store',
      items: [
        {
          qty: 1,
          description: entry.items_summary || entry.description,
          unitPricePaise: entry.amount_paise,
          amountPaise: entry.amount_paise,
        },
      ],
      subtotalPaise: entry.amount_paise,
      totalPaise: entry.amount_paise,
    };
    setInvoiceModalData(invData);
  };

  const recentPurchases = ledgerData?.entries?.filter(e => e.type === 'IN').slice(0, 10) || [];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-app p-4 sm:p-6 text-text-primary overflow-hidden">
      {/* Page Title */}
      <div className="mb-2 shrink-0">
        <h2 className="text-sm font-bold font-outfit text-text-primary uppercase tracking-wide">Quick Purchase Entry</h2>
      </div>

      {/* 2-Column Workspace Layout */}
      <div className="flex-1 flex flex-col xl:flex-row gap-6 min-h-0 overflow-hidden">
        
        {/* LEFT COLUMN: Main Form (~75% width) */}
        <div className="w-full xl:w-[75%] flex flex-col min-h-0 overflow-hidden">
          <div className="bg-surface-panel border border-border-subtle rounded-xl p-5 shadow-sm flex-1 flex flex-col min-h-0">
            
            {errorMsg && (
              <div className="bg-red-950/40 border border-red-800/60 text-red-300 p-3 rounded-lg text-xs font-semibold flex items-center gap-2">
                <AlertCircle size={16} />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="bg-green-950/40 border border-green-800/60 text-green-300 p-3 rounded-lg text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 space-y-4 overflow-hidden">
              {/* Edit Mode Banner */}
              {editingInvoiceId !== null && (
                <div className="bg-amber-950/40 border border-amber-800/60 text-amber-300 p-3 rounded-lg text-xs font-semibold flex items-center justify-between shrink-0">
                  <span className="flex items-center gap-2">
                    <Clock size={16} />
                    <span>Editing Purchase Record (ID: #{editingInvoiceId}) — Original Bill Ref: {billNumber}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      resetDraft();
                      setSuccessMsg('');
                      setErrorMsg('');
                    }}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded text-[10px]"
                  >
                    Cancel Edit
                  </button>
                </div>
              )}

              {/* Form Header Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 shrink-0">
                {/* Supplier (Wide) */}
                <div className="sm:col-span-2 md:col-span-2 lg:col-span-2">
                  <label className="block text-xs font-bold text-text-secondary mb-1">
                    Supplier Name *
                  </label>
                  <SearchableSupplierCombobox
                    suppliers={suppliers || []}
                    selectedSupplierId={supplierId ? Number(supplierId) : null}
                    onSelectSupplier={(id) => setSupplierId(String(id))}
                    onAddNewSupplier={() => setShowAddSupplierModal(true)}
                  />
                  {validationErrors.supplier_id && (
                    <span className="text-[10px] text-red-400 font-semibold">{validationErrors.supplier_id}</span>
                  )}
                </div>

                {/* Received Date */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">
                    Received Date *
                  </label>
                  <input
                    type="date"
                    value={receivedDate}
                    onChange={e => setReceivedDate(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-brand-500 min-h-[42px] font-medium"
                  />
                  {validationErrors.received_date && (
                    <span className="text-[10px] text-red-400 font-semibold">{validationErrors.received_date}</span>
                  )}
                </div>

                {/* System Purchase Ref No. (Read Only) */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">
                    System Purchase Ref
                  </label>
                  <div className="w-full bg-surface-panel border border-border-subtle/60 text-text-primary rounded-xl px-3 py-2 text-xs font-mono font-bold select-all min-h-[42px] flex items-center box-border">
                    {nextRefNum || `PUR-${todayCleanDate}-001`}
                  </div>
                </div>

                {/* Supplier Invoice Number (User Entered) */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">
                    Supplier Invoice No.
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. INV-88421"
                    value={supplierInvoiceNumber}
                    onChange={e => setSupplierInvoiceNumber(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:border-brand-500 min-h-[42px]"
                  />
                  {duplicateWarning && (
                    <span className="text-[10px] text-amber-400 font-medium block mt-0.5 leading-tight">{duplicateWarning}</span>
                  )}
                </div>

                {/* Payment Mode */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">
                    Payment Mode *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={e => {
                      const mode = e.target.value as 'cash' | 'upi' | 'card' | 'credit' | 'partial';
                      setPaymentMethod(mode);
                      if (mode === 'credit') {
                        setPaidAmount('0');
                      } else if (['cash', 'upi', 'card'].includes(mode)) {
                        setPaidAmount(formatMoney(paiseToRupees(finalTotalPaise)));
                      }
                    }}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-brand-500 min-h-[42px]"
                  >
                    <option value="credit">Credit (Outstanding)</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="partial">Partial Payment</option>
                  </select>
                </div>

                {/* Paid Amount */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">
                    Paid Amount (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    disabled={paymentMethod === 'credit'}
                    value={paymentMethod === 'credit' ? '0.00' : paidAmount}
                    onChange={e => setPaidAmount(e.target.value)}
                    className="w-full bg-surface-card disabled:bg-surface-panel disabled:opacity-70 border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono text-right text-text-primary focus:outline-none focus:border-brand-500 min-h-[42px]"
                  />
                </div>

                {/* Outstanding & Status */}
                <div>
                  <label className="block text-xs font-bold text-text-secondary mb-1">
                    Outstanding (₹)
                  </label>
                  <div className={`w-full bg-surface-panel border border-border-subtle/60 rounded-xl px-3 py-2 text-xs font-mono font-bold min-h-[42px] flex items-center justify-between ${outstandingPaise > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-sans font-extrabold ${
                      derivedPurchaseStatus === 'paid'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                        : derivedPurchaseStatus === 'partial'
                        ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                    }`}>
                      {derivedPurchaseStatus}
                    </span>
                    <span>₹{formatMoney(paiseToRupees(outstandingPaise))}</span>
                  </div>
                </div>
              </div>

              {/* Attach Bill & Notes Actions Row (Compact) */}
              <div className="flex flex-wrap items-center gap-4 shrink-0 border-t border-border-subtle pt-3 text-xs font-semibold text-text-primary">
                {/* Attach Bill Button */}
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/jpeg,image/png,application/pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded-lg text-xs font-bold text-text-primary flex items-center gap-1.5 transition-all shrink-0"
                  >
                    <Paperclip size={14} className="text-brand-500" />
                    <span>{billPhotoPath ? billPhotoPath.split('\\').pop()?.split('/').pop() : 'Attach Purchase Bill'}</span>
                  </button>
                  {billPhotoPath && (
                    <button
                      type="button"
                      onClick={() => setBillPhotoPath(null)}
                      className="text-text-muted hover:text-red-400 text-xs font-bold px-1"
                      title="Remove Attachment"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Notes Toggle Button */}
                <div className="flex items-center gap-2">
                  {!showNotesInput ? (
                    <button
                      type="button"
                      onClick={() => setShowNotesInput(true)}
                      className="px-3 py-1.5 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded-lg text-xs font-bold text-text-primary flex items-center gap-1.5 transition-all shrink-0"
                    >
                      + Add Note / Batch Info
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        placeholder="e.g. Morning fresh stock batch"
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        className="bg-surface-card border border-border-subtle rounded-lg px-2.5 py-1 text-xs text-text-primary focus:outline-none focus:border-brand-500 w-[240px]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setNotes('');
                          setShowNotesInput(false);
                        }}
                        className="text-text-muted hover:text-red-400 text-xs font-bold px-1"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Received Items Entry (Wide, Tall, Touch-Friendly) */}
              <div className="border-t border-border-subtle pt-4 space-y-3 flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex items-center justify-between shrink-0">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                    Items Received (Type Item Code or Name → Enter → Quantity → Enter → Rate → Enter)
                  </h3>
                </div>

                <div className="border border-border-subtle rounded-xl overflow-hidden shadow-sm bg-surface-panel/5 flex-1 flex flex-col min-h-0">
                  {/* Wide Touch-Friendly Headers */}
                  <div className="grid grid-cols-[44px_minmax(280px,4fr)_1.2fr_75px_1.2fr_1.4fr_48px] items-center gap-2.5 bg-surface-panel border-b border-border-subtle text-xs uppercase font-bold text-text-muted py-3 px-3 select-none shrink-0">
                    <div className="text-center">#</div>
                    <div>Item Variant (Code / Name)</div>
                    <div className="text-right">Quantity</div>
                    <div className="text-center">Unit</div>
                    <div className="text-right">Rate (₹)</div>
                    <div className="text-right">Subtotal (₹)</div>
                    <div className="text-center">Action</div>
                  </div>

                  {/* Committed Items List - Inline Editable */}
                  <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-border-subtle bg-surface-card/30">
                    {items.length === 0 ? (
                      <div className="py-8 text-center text-text-muted text-sm select-none">
                        No items entered yet. Click "+ Add Item Row" below to get started.
                      </div>
                    ) : (
                      items.map((item, idx) => {
                        const unitLabel = item.unit_type === 'weight' ? 'Kg' : (item.unit_type === 'live_dual' ? 'Kg/Pcs' : 'Pcs');

                        const focusRowQty = () => {
                          setTimeout(() => {
                            const allRows = document.querySelectorAll('.item-row');
                            const rowEl = allRows[idx];
                            const qtyInput = rowEl?.querySelector('.qty-input') as HTMLInputElement | null;
                            if (qtyInput) {
                              qtyInput.focus();
                              qtyInput.select();
                            }
                          }, 10);
                        };

                        return (
                          <div
                            key={idx}
                            className="item-row grid grid-cols-[44px_minmax(280px,4fr)_1.2fr_75px_1.2fr_1.4fr_48px] items-center gap-2.5 py-2.5 px-3 hover:bg-surface-hover/20 transition-colors"
                          >
                            {/* Row Index */}
                            <div className="text-center text-sm text-text-muted font-mono font-bold select-none">{idx + 1}</div>
                            
                            {/* Product Selector (Wide, Tall, Touch-Friendly) */}
                            <div className="min-h-[48px] relative bg-surface-card border border-border-subtle rounded-lg overflow-visible flex items-center">
                              <SpreadsheetProductSelector
                                variants={variants || []}
                                selectedVariantId={item.product_variant_id ? Number(item.product_variant_id) : null}
                                onSelectVariant={(variant) => {
                                  const updated = [...items];
                                  updated[idx] = {
                                    ...updated[idx],
                                    product_variant_id: variant ? String(variant.id) : '',
                                    unit_type: variant ? variant.unit_type : 'weight',
                                    unit_price: variant ? String(paiseToRupees(variant.current_rate_paise_per_unit || 0)) : '',
                                  };
                                  const qty = roundQty(parseFloat(updated[idx].quantity) || 0);
                                  const rate = parseFloat(updated[idx].unit_price) || 0;
                                  updated[idx].subtotal = rupeesToPaise(qty * rate);
                                  setItems(updated);
                                }}
                                onItemSelected={() => {
                                  focusRowQty();
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    focusRowQty();
                                  }
                                }}
                                inputRef={() => {}}
                              />
                            </div>

                            {/* Quantity Input */}
                            <div className="min-h-[48px] bg-surface-card border border-border-subtle rounded-lg overflow-hidden flex items-center">
                              <input
                                type="number"
                                step="0.001"
                                placeholder="0.000"
                                value={item.quantity}
                                onChange={e => {
                                  const updated = [...items];
                                  updated[idx] = {
                                    ...updated[idx],
                                    quantity: e.target.value
                                  };
                                  const qty = roundQty(parseFloat(updated[idx].quantity) || 0);
                                  const rate = parseFloat(updated[idx].unit_price) || 0;
                                  updated[idx].subtotal = rupeesToPaise(qty * rate);
                                  setItems(updated);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const rowEl = e.currentTarget.closest('.item-row');
                                    const rateInput = rowEl?.querySelector('.rate-input') as HTMLInputElement;
                                    rateInput?.focus();
                                    rateInput?.select();
                                  }
                                }}
                                className="qty-input w-full h-full min-h-[48px] bg-transparent px-3 text-sm sm:text-base font-mono font-bold text-text-primary text-right focus:outline-none focus:bg-brand-500/10 focus:ring-2 focus:ring-brand-500 rounded-lg"
                              />
                            </div>

                            {/* Unit */}
                            <div className="text-center text-sm text-text-muted font-bold select-none">
                              {item.product_variant_id ? unitLabel : '-'}
                            </div>

                            {/* Rate Input & Hints */}
                            <div className="flex flex-col">
                              <div className="min-h-[48px] bg-surface-card border border-border-subtle rounded-lg overflow-hidden flex items-center">
                                <input
                                  type="number"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={item.unit_price}
                                  onChange={e => {
                                    const updated = [...items];
                                    updated[idx] = {
                                      ...updated[idx],
                                      unit_price: e.target.value
                                    };
                                    const qty = roundQty(parseFloat(updated[idx].quantity) || 0);
                                    const rate = parseFloat(updated[idx].unit_price) || 0;
                                    updated[idx].subtotal = rupeesToPaise(qty * rate);
                                    setItems(updated);
                                  }}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const isLastRow = idx === items.length - 1;
                                      if (isLastRow) {
                                        setItems(prev => [
                                          ...prev,
                                          {
                                            product_variant_id: '',
                                            quantity: '',
                                            unit_type: 'weight',
                                            unit_price: '',
                                            subtotal: 0
                                          }
                                        ]);
                                        setTimeout(() => {
                                          const allRows = document.querySelectorAll('.item-row');
                                          const lastRow = allRows[allRows.length - 1];
                                          const productInput = lastRow?.querySelector('input[type="text"]') as HTMLInputElement;
                                          productInput?.focus();
                                        }, 50);
                                      } else {
                                        const allRows = document.querySelectorAll('.item-row');
                                        const nextRow = allRows[idx + 1];
                                        const productInput = nextRow?.querySelector('input[type="text"]') as HTMLInputElement;
                                        productInput?.focus();
                                      }
                                    }
                                  }}
                                  className="rate-input w-full h-full min-h-[48px] bg-transparent px-3 text-sm sm:text-base font-mono font-bold text-text-primary text-right focus:outline-none focus:bg-brand-500/10 focus:ring-2 focus:ring-brand-500 rounded-lg"
                                />
                              </div>
                              <RateHint
                                supplierId={selectedSupplierIdNum}
                                variantId={item.product_variant_id ? Number(item.product_variant_id) : undefined}
                                unitType={item.unit_type}
                                rate={parseFloat(item.unit_price) || 0}
                              />
                            </div>

                            {/* Subtotal */}
                            <div className="text-right px-3 font-mono text-sm sm:text-base font-black text-brand-400 select-none">
                              ₹{formatMoney((parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0))}
                            </div>

                            {/* Delete Action */}
                            <div className="text-center select-none flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveCommittedItem(idx)}
                                className="text-text-muted hover:text-red-400 p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                                title="Remove Item"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Add Row Button Row */}
                  <div className="p-3 bg-surface-panel/10 border-t border-border-subtle shrink-0 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setItems(prev => [
                          ...prev,
                          {
                            product_variant_id: '',
                            quantity: '',
                            unit_type: 'weight',
                            unit_price: '',
                            subtotal: 0
                          }
                        ]);
                        setTimeout(() => {
                          const allRows = document.querySelectorAll('.item-row');
                          const lastRow = allRows[allRows.length - 1];
                          const productInput = lastRow?.querySelector('input[type="text"]') as HTMLInputElement;
                          productInput?.focus();
                        }, 50);
                      }}
                      className="px-4 py-2 bg-surface-card hover:bg-surface-hover border border-border-subtle text-xs sm:text-sm font-bold text-brand-500 rounded-lg flex items-center gap-1.5 transition-all w-fit min-h-[42px]"
                    >
                      + Add Item Row
                    </button>
                  </div>

                  {/* Live Totals Row */}
                  {items.length > 0 && (
                    <div className="grid grid-cols-[44px_minmax(280px,4fr)_1.2fr_75px_1.2fr_1.4fr_48px] items-center gap-2.5 bg-surface-panel border-t border-border-subtle font-bold text-sm text-text-primary py-3 px-3 select-none shrink-0">
                      <div className="text-center"></div>
                      <div className="text-right text-text-muted uppercase text-xs tracking-wider font-extrabold">Total</div>
                      <div className="text-right font-mono">{formatQty(totalQty)}</div>
                      <div></div>
                      <div></div>
                      <div className="text-right font-mono text-brand-400 text-base font-black">
                        ₹{formatMoney(paiseToRupees(calculatedItemsTotal))}
                      </div>
                      <div></div>
                    </div>
                  )}
                </div>
              </div>

              {/* Totals & Charges Section */}
              <div className="bg-surface-panel/40 border border-border-subtle rounded-xl p-3 shrink-0 space-y-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                  Additional Charges & Taxes
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-text-muted mb-1">
                      Discount (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={discount}
                      onChange={e => setDiscount(e.target.value)}
                      className="w-full bg-surface-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-mono text-right text-text-primary focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-muted mb-1">
                      Tax / GST (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={tax}
                      onChange={e => setTax(e.target.value)}
                      className="w-full bg-surface-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-mono text-right text-text-primary focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-muted mb-1">
                      Freight Charges (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={freight}
                      onChange={e => setFreight(e.target.value)}
                      className="w-full bg-surface-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-mono text-right text-text-primary focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-text-muted mb-1">
                      Other Charges (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={otherCharges}
                      onChange={e => setOtherCharges(e.target.value)}
                      className="w-full bg-surface-card border border-border-subtle rounded-lg px-2.5 py-1.5 text-xs font-mono text-right text-text-primary focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                {/* Financial Summary Strip */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border-subtle/50 text-xs">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-text-muted">Subtotal: </span>
                      <span className="font-mono font-semibold text-text-primary">
                        {formatPaise(calculatedItemsTotal)}
                      </span>
                    </div>
                    {discountPaise > 0 && (
                      <div>
                        <span className="text-text-muted">Discount: </span>
                        <span className="font-mono font-semibold text-rose-400">
                          -{formatPaise(discountPaise)}
                        </span>
                      </div>
                    )}
                    {(taxPaise > 0 || freightPaise > 0 || otherChargesPaise > 0) && (
                      <div>
                        <span className="text-text-muted">Charges & Tax: </span>
                        <span className="font-mono font-semibold text-amber-400">
                          +{formatPaise(taxPaise + freightPaise + otherChargesPaise)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-6">
                    <div>
                      <span className="text-text-muted">Final Total: </span>
                      <span className="font-mono font-bold text-text-primary text-sm">
                        {formatPaise(finalTotalPaise)}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted">Paid: </span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        {formatPaise(paidPaise)}
                      </span>
                    </div>
                    <div>
                      <span className="text-text-muted">Outstanding: </span>
                      <span className={`font-mono font-bold text-sm ${outstandingPaise > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {formatPaise(outstandingPaise)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-border-subtle shrink-0">
                <div className="text-xs">
                  <span className="text-text-muted">Final Bill Total: </span>
                  <span className="font-mono font-bold text-brand-400 text-base">
                    {formatPaise(finalTotalPaise)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={recordQuickPurchase.isPending}
                    className="px-4 py-2.5 bg-surface-card hover:bg-surface-hover border border-border-subtle text-text-secondary hover:text-text-primary rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    Save as Draft
                  </button>

                  <button
                    type="submit"
                    disabled={recordQuickPurchase.isPending}
                    className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg disabled:opacity-50 transition-all"
                  >
                    <Save size={16} />
                    {recordQuickPurchase.isPending ? 'Saving...' : 'Submit & Receive Purchase'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Sidebar Dashboard Panel (~25% width, Sticky) */}
        <div className="w-full xl:w-[25%] space-y-5 xl:sticky xl:top-6 self-start">
          
          {/* 1. Selected Supplier Snapshot */}
          <div className="bg-surface-panel border border-border-subtle rounded-xl p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <Building2 size={14} className="text-brand-500" />
              Selected Supplier Snapshot
            </h3>

            {supplierSnapshot ? (
              <div className="space-y-2.5 text-xs">
                <div className="bg-surface-card p-3 rounded-lg border border-border-subtle flex justify-between items-center">
                  <span className="text-text-muted">Outstanding Owed:</span>
                  <span className="font-mono font-bold text-rose-400 text-sm">
                    {formatPaise(supplierSnapshot.outstanding_balance_paise)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-surface-card p-2.5 rounded-lg border border-border-subtle">
                    <span className="text-text-muted block text-[10px]">Last Purchase</span>
                    <span className="font-bold text-text-primary block mt-0.5">
                      {supplierSnapshot.last_purchase_date ? formatDate(supplierSnapshot.last_purchase_date) : '-'}
                    </span>
                    <span className="font-mono text-brand-400">
                      {supplierSnapshot.last_purchase_amount_paise ? formatPaise(supplierSnapshot.last_purchase_amount_paise) : '-'}
                    </span>
                  </div>

                  <div className="bg-surface-card p-2.5 rounded-lg border border-border-subtle">
                    <span className="text-text-muted block text-[10px]">Last Payment</span>
                    <span className="font-bold text-text-primary block mt-0.5">
                      {supplierSnapshot.last_payment_date ? formatDate(supplierSnapshot.last_payment_date) : '-'}
                    </span>
                    <span className="font-mono text-green-400">
                      {supplierSnapshot.last_payment_amount_paise ? formatPaise(supplierSnapshot.last_payment_amount_paise) : '-'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-surface-card border border-border-subtle rounded-lg text-center text-text-muted text-xs font-medium">
                Select a supplier above to see their live outstanding balance and purchase history.
              </div>
            )}
          </div>

          {/* 2. This Month at a Glance */}
          <div className="bg-surface-panel border border-border-subtle rounded-xl p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <DollarSign size={14} className="text-green-400" />
              This Month at a Glance
            </h3>

            {ledgerData?.summary && (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-surface-card p-2.5 rounded-lg border border-border-subtle">
                  <span className="text-[10px] text-text-muted block">Purchased</span>
                  <span className="font-mono font-bold text-text-primary mt-0.5 block">
                    {formatPaise(ledgerData.summary.total_purchased_paise)}
                  </span>
                </div>

                <div className="bg-surface-card p-2.5 rounded-lg border border-border-subtle">
                  <span className="text-[10px] text-text-muted block">Paid</span>
                  <span className="font-mono font-bold text-green-400 mt-0.5 block">
                    {formatPaise(ledgerData.summary.total_paid_paise)}
                  </span>
                </div>

                <div className="bg-surface-card p-2.5 rounded-lg border border-border-subtle">
                  <span className="text-[10px] text-text-muted block">Total Outstanding</span>
                  <span className="font-mono font-bold text-rose-400 mt-0.5 block">
                    {formatPaise(ledgerData.summary.total_outstanding_paise)}
                  </span>
                </div>
              </div>
            )}
          </div>
            {/* 3. Recent Purchases List */}
          <div className="bg-surface-panel border border-border-subtle rounded-xl p-4 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock size={14} className="text-brand-400" />
                Recent Purchases
              </span>
              <span className="text-[10px] text-text-muted lowercase font-normal">(click to view)</span>
            </h3>

            {recentPurchases.length === 0 ? (
              <div className="p-3 text-center text-text-muted text-xs">No recent purchases recorded.</div>
            ) : (
              <div className="space-y-2 text-xs max-h-[320px] overflow-y-auto pr-1">
                {recentPurchases.slice(0, 10).map(entry => (
                  <div
                    key={entry.id}
                    onClick={() => handleRecentRowClick(entry)}
                    className="p-2.5 bg-surface-card hover:bg-surface-hover/80 border border-border-subtle rounded-lg cursor-pointer transition-colors flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-text-primary flex items-center gap-1.5">
                        <span>{entry.supplier_name}</span>
                      </div>
                      <div className="text-[10px] text-text-muted mt-0.5 flex items-center gap-2">
                        <span>{formatDate(entry.entry_date)}</span>
                        <span>•</span>
                        <span className="font-mono text-brand-400">{entry.purchase_ref_number}</span>
                      </div>
                    </div>

                    <div className="text-right font-mono font-bold text-text-primary text-xs">
                      {formatPaise(entry.amount_paise)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Printable Invoice Modal */}
      {invoiceModalData && (
        <InvoiceTemplateModal
          data={invoiceModalData}
          onClose={() => setInvoiceModalData(null)}
        />
      )}

      {/* Audit Edit Password Confirmation Modal */}
      {showPasswordPrompt && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl text-text-primary">
            <div>
              <h3 className="text-base font-bold font-outfit text-amber-400 flex items-center gap-2">
                ⚠️ Authorize Purchase Corrections
              </h3>
              <p className="text-xs text-text-muted mt-1">
                A manager or admin password is required to save modifications to this purchase record. All changes are logged in the audit trail.
              </p>
            </div>

            <form onSubmit={handleSaveEditConfirm} className="space-y-4 text-xs font-semibold">
              <div>
                <label className="block text-text-secondary mb-1">Audit Edit Reason (Mandatory) *</label>
                <input
                  type="text"
                  required
                  value={editReason}
                  onChange={e => setEditReason(e.target.value)}
                  placeholder="e.g. Corrected quantity typo from physical bill"
                  className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-text-secondary mb-1">Confirm Manager/Admin Password *</label>
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={e => setPasswordInput(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-surface-card border border-border-subtle rounded-lg px-3 py-2 text-text-primary focus:outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordPrompt(false);
                    setPasswordInput('');
                    setEditReason('');
                  }}
                  className="px-4 py-2 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded-lg text-text-secondary font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-lg flex items-center gap-1.5"
                >
                  Confirm & Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Duplicate Invoice Number Confirmation Modal */}
      {showDuplicateConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl text-text-primary">
            <div>
              <h3 className="text-base font-bold font-outfit text-amber-400 flex items-center gap-2">
                <AlertCircle size={18} />
                Duplicate Invoice Warning
              </h3>
              <p className="text-xs text-text-muted mt-2 leading-relaxed">
                A purchase invoice with number <span className="font-mono font-bold text-amber-300">"{supplierInvoiceNumber.trim()}"</span> has already been recorded for this supplier.
              </p>
              <p className="text-xs text-text-secondary mt-1.5">
                Are you sure you want to proceed and save this purchase anyway?
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDuplicateConfirmModal(false)}
                className="px-4 py-2 bg-surface-card hover:bg-surface-hover border border-border-subtle rounded-lg text-text-secondary font-bold text-xs"
              >
                No, Change Invoice No.
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDuplicateConfirmModal(false);
                  doSubmitPurchase(false);
                }}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-lg text-xs flex items-center gap-1.5"
              >
                Yes, Proceed Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline Add New Supplier Modal */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-surface-panel border border-border-subtle rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl">
            <SupplierForm
              onSuccess={(newSupp) => {
                setShowAddSupplierModal(false);
                refetchSuppliers();
                if (newSupp?.id) setSupplierId(String(newSupp.id));
              }}
              onCancel={() => setShowAddSupplierModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
