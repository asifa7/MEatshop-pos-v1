import React, { useState, useMemo } from 'react';
import {
  Wallet,
  Landmark,
  Search,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  Printer,
  Calendar,
  DollarSign,
  RotateCcw,
  History,
  FileText,
  Clock,
  Plus,
  Building2,
  CreditCard,
  X,
  Check,
  ChevronRight,
  ShieldCheck,
  AlertTriangle,
  Sliders,
  RefreshCw,
} from 'lucide-react';
import {
  useLiquidBalances,
  usePaymentRegister,
  useRecordPaymentReceipt,
  useReversePayment,
  useVendorPayablesSummary,
  useRecordVendorPayment,
  useCheckPayablesHealth,
  useSupplierCreditDays,
  useUpdateSupplierCreditDays,
  PaymentReceiptVoucher,
  VendorTileData,
  VendorBillItem,
  PayablesHealthReport,
} from '../hooks/usePaymentEngine';
import { useSuppliersProfile } from '../../../inventory/frontend/hooks/useSupplierProcurement';
import { useCustomers } from '../../../customers/frontend/hooks/useCustomers';
import { formatMoney, rupeesToPaise } from '../../../../core/shared/math';
import ContraTransferModal from './ContraTransferModal';
import VoucherPrintModal from './VoucherPrintModal';
import BillHistoryModal from './BillHistoryModal';

const EXPENSE_CATEGORIES = [
  'Electricity & Utilities',
  'Shop Rent',
  'Staff Wages / Salary',
  'Packaging & Bags',
  'Ice & Refrigeration Salt',
  'Equipment Maintenance & Repairs',
  'Cleaning & Sanitization',
  'Transportation & Logistics',
  'Tea, Snacks & Refreshments',
  'Other Miscellaneous Expense',
];

const INCOME_CATEGORIES = [
  'Scrap & By-Product Sales',
  'Skin / Feather / Offal Sales',
  'Discount Received',
  'Interest Income',
  'Miscellaneous Receipt',
];

type MainTab = 'pending' | 'history' | 'voucher' | 'health_settings';

export default function PaymentsReceiptsView() {
  const [activeTab, setActiveTab] = useState<MainTab>('pending');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isContraOpen, setIsContraOpen] = useState<boolean>(false);
  const [selectedVoucherForPrint, setSelectedVoucherForPrint] = useState<PaymentReceiptVoucher | null>(null);

  // Vendor Pay Flow Modal State
  const [payingVendor, setPayingVendor] = useState<VendorTileData | null>(null);
  const [payAmountRupees, setPayAmountRupees] = useState<string>('');
  const [payMode, setPayMode] = useState<'cash' | 'bank' | 'upi'>('cash');
  const [payReference, setPayReference] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [isManualAlloc, setIsManualAlloc] = useState<boolean>(false);
  const [manualAllocations, setManualAllocations] = useState<Record<number, string>>({});
  const [payError, setPayError] = useState<string | null>(null);
  const [isSubmittingPay, setIsSubmittingPay] = useState<boolean>(false);

  // View Bills Drawer State
  const [viewBillsVendor, setViewBillsVendor] = useState<VendorTileData | null>(null);
  const [viewBillsTab, setViewBillsTab] = useState<'pending' | 'paid' | 'all'>('pending');
  const [selectedBillForHistory, setSelectedBillForHistory] = useState<any | null>(null);

  // Reversal Dialog State
  const [reversingVoucher, setReversingVoucher] = useState<PaymentReceiptVoucher | null>(null);
  const [reversalReason, setReversalReason] = useState<string>('');
  const [reversalError, setReversalError] = useState<string | null>(null);

  // Settings & Health State
  const [creditDaysInput, setCreditDaysInput] = useState<string>('0');
  const [healthReport, setHealthReport] = useState<PayablesHealthReport | null>(null);

  // General Voucher State
  const [vchDirection, setVchDirection] = useState<'payment' | 'receipt'>('payment');
  const [vchPartyType, setVchPartyType] = useState<'supplier' | 'customer' | 'expense' | 'income'>('expense');
  const [vchPartyId, setVchPartyId] = useState<number | undefined>(undefined);
  const [vchCategory, setVchCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [vchAmountRupees, setVchAmountRupees] = useState<string>('');
  const [vchMode, setVchMode] = useState<'cash' | 'upi' | 'bank'>('cash');
  const [vchReference, setVchReference] = useState<string>('');
  const [vchDate, setVchDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [vchNarration, setVchNarration] = useState<string>('');
  const [vchError, setVchError] = useState<string | null>(null);

  // Banner Feedback
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Queries
  const { data: balances, refetch: refetchBalances } = useLiquidBalances();
  const {
    data: payablesData,
    isLoading: isPayablesLoading,
    refetch: refetchPayables,
  } = useVendorPayablesSummary({ search: searchQuery });
  const { data: creditDaysSetting, refetch: refetchCreditDays } = useSupplierCreditDays();
  const { data: suppliers = [] } = useSuppliersProfile();
  const { data: customers = [] } = useCustomers();

  // Payment History Register Query
  const [historyStartDate, setHistoryStartDate] = useState<string>(
    new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
  );
  const [historyEndDate, setHistoryEndDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [historySearch, setHistorySearch] = useState<string>('');
  const [historyModeFilter, setHistoryModeFilter] = useState<string>('all');

  const {
    data: registerData,
    isLoading: isRegisterLoading,
    refetch: refetchRegister,
  } = usePaymentRegister({
    startDate: historyStartDate,
    endDate: historyEndDate,
    paymentMethod: historyModeFilter,
    search: historySearch,
  });

  const recordPaymentMutation = useRecordPaymentReceipt();
  const recordVendorPaymentMutation = useRecordVendorPayment();
  const reversePaymentMutation = useReversePayment();
  const checkHealthMutation = useCheckPayablesHealth();
  const updateCreditDaysMutation = useUpdateSupplierCreditDays();

  // Keep creditDaysInput in sync with fetched setting
  React.useEffect(() => {
    if (creditDaysSetting !== undefined) {
      setCreditDaysInput(String(creditDaysSetting));
    }
  }, [creditDaysSetting]);

  // Derived Summary & Vendor Lists
  const summary = payablesData?.summary ?? {
    total_payable_paise: 0,
    vendors_count: 0,
    pending_bills_count: 0,
    supplier_credit_days: 0,
  };

  const pendingVendors = payablesData?.vendors ?? [];

  // Open Pay Modal for a Vendor
  const handleOpenPayModal = (vendor: VendorTileData) => {
    setPayingVendor(vendor);
    const balanceRupees = (vendor.total_outstanding_paise / 100).toFixed(2);
    setPayAmountRupees(balanceRupees);
    setPayMode('cash');
    setPayReference('');
    setPayDate(new Date().toISOString().slice(0, 10));
    setIsManualAlloc(false);
    setManualAllocations({});
    setPayError(null);
    setIsSubmittingPay(false);
  };

  // Open View Bills Drawer for a Vendor
  const handleOpenViewBills = (vendor: VendorTileData) => {
    setViewBillsVendor(vendor);
    setViewBillsTab('pending');
  };

  // Live Allocation Preview Math (Calculates FIFO or Manual breakdown)
  const enteredPayPaise = useMemo(() => {
    const val = parseFloat(payAmountRupees);
    if (!Number.isFinite(val) || val <= 0) return 0;
    return rupeesToPaise(val);
  }, [payAmountRupees]);

  const allocationPreviewRows = useMemo(() => {
    if (!payingVendor) return [];

    const pendingBills = payingVendor.bills.filter((b) => b.outstanding_balance_paise > 0);

    if (!isManualAlloc) {
      // FIFO allocation
      let remaining = enteredPayPaise;
      return pendingBills.map((bill) => {
        const payingNow = Math.min(Math.max(0, remaining), bill.outstanding_balance_paise);
        remaining -= payingNow;
        const balanceAfter = Math.max(0, bill.outstanding_balance_paise - payingNow);
        const result: 'Cleared' | 'Partly paid' | 'Not touched' =
          payingNow === 0 ? 'Not touched' : balanceAfter === 0 ? 'Cleared' : 'Partly paid';

        return {
          billId: bill.id,
          billNumber: bill.supplier_invoice_number || bill.purchase_ref_number || bill.invoice_number,
          billDate: bill.invoice_date,
          balanceBefore: bill.outstanding_balance_paise,
          payingNow,
          balanceAfter,
          result,
        };
      });
    } else {
      // Manual allocation mode
      return pendingBills.map((bill) => {
        const inputStr = manualAllocations[bill.id] || '';
        const inputNum = parseFloat(inputStr);
        const payingNow = Number.isFinite(inputNum) && inputNum > 0 ? rupeesToPaise(inputNum) : 0;
        const balanceAfter = Math.max(0, bill.outstanding_balance_paise - payingNow);
        const result: 'Cleared' | 'Partly paid' | 'Not touched' =
          payingNow === 0 ? 'Not touched' : balanceAfter === 0 ? 'Cleared' : 'Partly paid';

        return {
          billId: bill.id,
          billNumber: bill.supplier_invoice_number || bill.purchase_ref_number || bill.invoice_number,
          billDate: bill.invoice_date,
          balanceBefore: bill.outstanding_balance_paise,
          payingNow,
          balanceAfter,
          result,
        };
      });
    }
  }, [payingVendor, enteredPayPaise, isManualAlloc, manualAllocations]);

  // Total manually allocated in paise
  const manualTotalAllocatedPaise = useMemo(() => {
    if (!isManualAlloc) return enteredPayPaise;
    return allocationPreviewRows.reduce((sum, r) => sum + r.payingNow, 0);
  }, [isManualAlloc, allocationPreviewRows, enteredPayPaise]);

  // Validation Checks for Pay Flow
  const payValidationError = useMemo(() => {
    if (!payingVendor) return null;
    if (enteredPayPaise <= 0) {
      return 'Enter a payment amount greater than zero.';
    }
    if (enteredPayPaise > payingVendor.total_outstanding_paise) {
      return `Amount cannot exceed vendor total outstanding of ${formatMoney(payingVendor.total_outstanding_paise)}.`;
    }
    if (isManualAlloc) {
      if (manualTotalAllocatedPaise !== enteredPayPaise) {
        return `Sum of manual allocations (${formatMoney(manualTotalAllocatedPaise)}) must equal payment amount (${formatMoney(enteredPayPaise)}).`;
      }
      for (const r of allocationPreviewRows) {
        if (r.payingNow > r.balanceBefore) {
          return `Allocation on bill ${r.billNumber} (${formatMoney(r.payingNow)}) exceeds its balance of ${formatMoney(r.balanceBefore)}.`;
        }
      }
    }
    return null;
  }, [payingVendor, enteredPayPaise, isManualAlloc, manualTotalAllocatedPaise, allocationPreviewRows]);

  // Handle Pay Form Submission
  const handleConfirmVendorPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingVendor || isSubmittingPay) return;

    if (payValidationError) {
      setPayError(payValidationError);
      return;
    }

    setIsSubmittingPay(true);
    setPayError(null);

    try {
      let manualArr: Array<{ bill_id: number; allocated_amount_paise: number }> | undefined;
      if (isManualAlloc) {
        manualArr = allocationPreviewRows
          .filter((r) => r.payingNow > 0)
          .map((r) => ({
            bill_id: r.billId,
            allocated_amount_paise: r.payingNow,
          }));
      }

      const res = await recordVendorPaymentMutation.mutateAsync({
        supplier_id: payingVendor.supplier_id,
        amount_paise: enteredPayPaise,
        payment_method: payMode,
        payment_date: payDate,
        reference_number: payReference.trim() || undefined,
        manual_allocations: manualArr,
      });

      setBannerMessage({
        type: 'success',
        text: res.message,
      });

      setPayingVendor(null);
      refetchPayables();
      refetchBalances();
      refetchRegister();
    } catch (err: any) {
      setPayError(err.message || 'Failed to process payment');
    } finally {
      setIsSubmittingPay(false);
    }
  };

  // Reversal Confirmation
  const handleConfirmReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingVoucher) return;
    if (!reversalReason.trim()) {
      setReversalError('A mandatory reason is required to reverse this payment.');
      return;
    }

    try {
      const res = await reversePaymentMutation.mutateAsync({
        payment_receipt_id: reversingVoucher.id,
        reason: reversalReason.trim(),
      });

      setBannerMessage({
        type: 'success',
        text: res.message || 'Payment voucher reversed successfully.',
      });

      setReversingVoucher(null);
      setReversalReason('');
      setReversalError(null);
      refetchPayables();
      refetchBalances();
      refetchRegister();
    } catch (err: any) {
      setReversalError(err.message || 'Failed to reverse payment');
    }
  };

  // General Voucher Creation
  const handleCreateGeneralVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setVchError(null);

    const amountNum = parseFloat(vchAmountRupees);
    if (!amountNum || amountNum <= 0) {
      setVchError('Please enter a valid amount greater than zero');
      return;
    }
    const amountPaise = rupeesToPaise(amountNum);

    let partyType: 'supplier' | 'customer' | 'other' = 'other';
    let partyId: number | null = null;
    let partyName: string | null = null;
    let category: string | null = null;

    if (vchPartyType === 'supplier') {
      partyType = 'supplier';
      partyId = vchPartyId || null;
      const supp = suppliers.find((s) => s.id === partyId);
      partyName = supp ? supp.company_name || supp.owner_name : null;
      category = 'Supplier Payment';
    } else if (vchPartyType === 'customer') {
      partyType = 'customer';
      partyId = vchPartyId || null;
      const cust = customers.find((c) => c.id === partyId);
      partyName = cust ? cust.name : null;
      category = 'Customer Receipt';
    } else {
      category = vchCategory;
    }

    try {
      const res = await recordPaymentMutation.mutateAsync({
        direction: vchDirection,
        payment_method: vchMode,
        party_type: partyType,
        party_id: partyId,
        party_name: partyName,
        category,
        amount_paise: amountPaise,
        payment_date: vchDate,
        narration: vchNarration || null,
        reference_number: vchReference || null,
      });

      setBannerMessage({
        type: 'success',
        text: `${vchDirection === 'payment' ? 'Payment' : 'Receipt'} Voucher #${res.voucher_number} (${formatMoney(
          amountPaise
        )}) recorded successfully.`,
      });

      setVchAmountRupees('');
      setVchNarration('');
      setVchReference('');
      refetchPayables();
      refetchBalances();
      refetchRegister();
    } catch (err: any) {
      setVchError(err.message || 'Failed to record voucher');
    }
  };

  // Run Health Check
  const handleRunHealthCheck = async (autoRepair = false) => {
    try {
      const report = await checkHealthMutation.mutateAsync({ autoRepair });
      setHealthReport(report);
      if (report.is_healthy) {
        setBannerMessage({
          type: 'success',
          text: `Payables Health Check Passed: All ${report.checked_bills_count} bills match allocations perfectly with 0 drift.`,
        });
      }
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err.message || 'Health check failed',
      });
    }
  };

  // Save Credit Days Setting
  const handleSaveCreditDays = async () => {
    const days = parseInt(creditDaysInput, 10) || 0;
    try {
      await updateCreditDaysMutation.mutateAsync(days);
      setBannerMessage({
        type: 'success',
        text: `Supplier credit days setting saved: ${days === 0 ? 'Disabled (0 days)' : `${days} days`}.`,
      });
      refetchCreditDays();
      refetchPayables();
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err.message || 'Failed to update credit days setting',
      });
    }
  };

  const vouchers = registerData?.vouchers ?? [];

  return (
    <div className="flex flex-col h-full bg-surface-base text-text-primary p-4 sm:p-6 space-y-4 overflow-hidden">
      {/* 1. TOP HEADER & LIQUID METRICS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-panel border border-border-subtle rounded-2xl p-4 shrink-0 shadow-elevation">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-brand-500/15 text-brand-400">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="text-xl font-black text-text-primary tracking-tight">Payments & Receipts</h1>
            <p className="text-xs text-text-muted">
              Supplier Payables • FIFO Allocation • Shift Cash & Double-Entry Ledger
            </p>
          </div>
        </div>

        {/* Global Liquid Funds & Payables Summary */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Total Payables Outstanding */}
          <div className="bg-surface-card border border-rose-500/20 px-3.5 py-2 rounded-xl flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-rose-500/15 text-rose-400">
              <Clock size={16} />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                Total Payable
              </span>
              <span className="text-sm font-black font-mono text-rose-400 block">
                {formatMoney(summary.total_payable_paise)}
              </span>
            </div>
          </div>

          {/* Shift Cash in Hand */}
          <div className="bg-surface-card border border-border-subtle px-3.5 py-2 rounded-xl flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
              <Wallet size={16} />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                Cash in Hand
              </span>
              <span className="text-sm font-black font-mono text-emerald-400 block">
                {formatMoney(balances?.cashInHandPaise)}
              </span>
            </div>
          </div>

          {/* Bank / UPI Balance */}
          <div className="bg-surface-card border border-border-subtle px-3.5 py-2 rounded-xl flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400">
              <Landmark size={16} />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                Bank / UPI
              </span>
              <span className="text-sm font-black font-mono text-cyan-400 block">
                {formatMoney(balances?.bankBalancePaise)}
              </span>
            </div>
          </div>

          {/* Contra Cash/Bank Transfer Button */}
          <button
            type="button"
            onClick={() => setIsContraOpen(true)}
            className="px-3 py-2 rounded-xl bg-surface-card hover:bg-surface-hover border border-border-subtle text-text-primary text-xs font-black flex items-center gap-1.5 transition-all shadow-sm"
          >
            <ArrowRightLeft size={14} className="text-brand-400" />
            <span>Contra Transfer</span>
          </button>
        </div>
      </div>

      {/* BANNER NOTIFICATION */}
      {bannerMessage && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between gap-3 text-xs font-bold animate-in fade-in duration-150 ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {bannerMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{bannerMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="p-1 hover:bg-white/10 rounded-lg text-text-muted hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 2. TABS & SEARCH BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-panel border border-border-subtle rounded-2xl p-3 shrink-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'pending', label: 'Pending Vendors', count: summary.vendors_count, color: 'text-rose-400' },
            { id: 'history', label: 'Payment History', count: vouchers.length, color: 'text-cyan-400' },
            { id: 'voucher', label: 'General Voucher', count: undefined, color: 'text-brand-400' },
            { id: 'health_settings', label: 'Settings & Health', count: undefined, color: 'text-emerald-400' },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as MainTab)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                  isActive
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-surface-card text-text-muted hover:text-text-primary hover:bg-surface-hover'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${
                      isActive ? 'bg-white/20 text-white' : `bg-surface-app ${tab.color}`
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeTab === 'pending' && (
          <div className="relative min-w-[260px] flex-1 max-w-md">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search vendor name, company, or bill #..."
              className="w-full bg-surface-card border border-border-subtle rounded-xl pl-9 pr-4 py-2 text-xs font-bold text-text-primary placeholder:text-text-muted focus:outline-none focus:border-brand-500"
            />
          </div>
        )}
      </div>

      {/* 3. MAIN CONTENT AREA */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {/* TAB 1: PENDING VENDORS (ONLY ONE TILE PER VENDOR) */}
        {activeTab === 'pending' && (
          <>
            {isPayablesLoading ? (
              <div className="p-12 text-center text-sm text-text-muted font-bold">
                Loading vendor payables...
              </div>
            ) : pendingVendors.length === 0 ? (
              <div className="p-12 bg-surface-panel border border-border-subtle rounded-2xl text-center space-y-2">
                <CheckCircle2 size={40} className="mx-auto text-emerald-400/70" />
                <div className="text-base font-black text-text-primary">All Supplier Bills Fully Settled</div>
                <p className="text-xs text-text-muted max-w-md mx-auto">
                  {searchQuery
                    ? 'No outstanding vendor matches your search query.'
                    : 'There are no pending purchase balances. All vendors are currently at zero balance.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-6">
                {pendingVendors.map((vendor) => {
                  const isCreditOverdue = vendor.is_overdue;
                  const primaryName = vendor.supplier_company || vendor.supplier_name;
                  const secondaryName =
                    vendor.supplier_company && vendor.supplier_name !== vendor.supplier_company
                      ? vendor.supplier_name
                      : null;

                  return (
                    <div
                      key={vendor.supplier_id}
                      className={`bg-surface-panel border-2 rounded-2xl p-5 shadow-elevation flex flex-col justify-between gap-4 transition-all ${
                        isCreditOverdue
                          ? 'border-rose-500/50 bg-rose-500/[0.03]'
                          : 'border-border-subtle hover:border-brand-500/50'
                      }`}
                    >
                      {/* Tile Header: Vendor Name & Overdue Badge */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-black uppercase tracking-wider text-text-muted">
                            Vendor
                          </div>
                          <h3 className="text-base sm:text-lg font-black text-text-primary truncate mt-0.5">
                            {primaryName}
                          </h3>
                          {secondaryName && (
                            <span className="text-xs text-text-secondary truncate block">
                              {secondaryName}
                            </span>
                          )}
                          {vendor.phone && (
                            <span className="text-[11px] font-mono text-text-muted block mt-0.5">
                              📞 {vendor.phone}
                            </span>
                          )}
                        </div>

                        {isCreditOverdue ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide shrink-0 border bg-rose-500/15 text-rose-400 border-rose-500/30 flex items-center gap-1">
                            <AlertTriangle size={12} />
                            <span>Overdue (&gt;{vendor.credit_days}d)</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide shrink-0 border bg-amber-500/15 text-amber-400 border-amber-500/30">
                            {vendor.pending_bills_count} Pending
                          </span>
                        )}
                      </div>

                      {/* Large Outstanding Amount Card */}
                      <div className="bg-surface-card border border-rose-500/20 rounded-xl p-3.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted block">
                          Total Outstanding
                        </span>
                        <div className="text-2xl font-black font-mono text-rose-400 mt-1">
                          {formatMoney(vendor.total_outstanding_paise)}
                        </div>
                        <div className="text-[10px] text-text-muted font-bold mt-1">
                          Purchased: {formatMoney(vendor.total_purchased_paise)} across {vendor.total_bills_count} bills
                        </div>
                      </div>

                      {/* Metadata: Oldest Bill Age & Last Payment Info */}
                      <div className="grid grid-cols-2 gap-2 bg-surface-card/60 border border-border-subtle rounded-xl p-3 text-xs">
                        <div>
                          <span className="text-[10px] font-bold uppercase text-text-muted block">
                            Oldest Bill
                          </span>
                          <span className="font-mono font-bold text-text-primary text-xs block mt-0.5">
                            {vendor.oldest_bill_date || '—'}
                          </span>
                          <span
                            className={`text-[10px] font-black block mt-0.5 ${
                              isCreditOverdue ? 'text-rose-400' : 'text-text-muted'
                            }`}
                          >
                            {vendor.oldest_bill_days} days old
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] font-bold uppercase text-text-muted block">
                            Last Payment
                          </span>
                          {vendor.last_payment_date ? (
                            <>
                              <span className="font-mono font-bold text-emerald-400 text-xs block mt-0.5">
                                {formatMoney(vendor.last_payment_amount_paise)}
                              </span>
                              <span className="text-[10px] text-text-muted block mt-0.5">
                                {vendor.last_payment_date}
                              </span>
                            </>
                          ) : (
                            <span className="text-[11px] text-text-muted block mt-1">No payments yet</span>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons: [ Pay ] and [ View Bills ] */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleOpenPayModal(vendor)}
                          className="py-2.5 px-3 rounded-xl bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-black text-xs shadow-md shadow-brand-500/20 flex items-center justify-center gap-1.5 transition-all"
                        >
                          <DollarSign size={15} />
                          <span>Pay</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenViewBills(vendor)}
                          className="py-2.5 px-3 rounded-xl bg-surface-card hover:bg-surface-hover border border-border-subtle text-text-primary font-black text-xs flex items-center justify-center gap-1.5 transition-all"
                        >
                          <FileText size={14} className="text-brand-400" />
                          <span>View Bills</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TAB 2: PAYMENT HISTORY (AUDIT REGISTER) */}
        {activeTab === 'history' && (
          <div className="bg-surface-panel border border-border-subtle rounded-2xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 bg-surface-card border border-border-subtle rounded-xl px-3 py-1.5 text-xs">
                  <Calendar size={13} className="text-text-muted" />
                  <input
                    type="date"
                    value={historyStartDate}
                    onChange={(e) => setHistoryStartDate(e.target.value)}
                    className="bg-transparent text-text-primary font-mono outline-none"
                  />
                  <span className="text-text-muted">to</span>
                  <input
                    type="date"
                    value={historyEndDate}
                    onChange={(e) => setHistoryEndDate(e.target.value)}
                    className="bg-transparent text-text-primary font-mono outline-none"
                  />
                </div>

                <div className="flex items-center gap-1">
                  {['all', 'cash', 'bank', 'upi'].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setHistoryModeFilter(m)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all ${
                        historyModeFilter === m
                          ? 'bg-brand-500 text-white'
                          : 'bg-surface-card text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative min-w-[220px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Filter register..."
                  className="w-full bg-surface-card border border-border-subtle rounded-xl pl-8 pr-3 py-1.5 text-xs text-text-primary outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {isRegisterLoading ? (
              <div className="p-8 text-center text-xs text-text-muted">Loading payment records...</div>
            ) : vouchers.length === 0 ? (
              <div className="p-8 text-center text-xs text-text-muted">
                No payment vouchers found for the selected date range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-surface-card border-b border-border-subtle text-[10px] font-bold uppercase text-text-muted">
                    <tr>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5">Voucher #</th>
                      <th className="p-3.5">Type</th>
                      <th className="p-3.5">Party / Category</th>
                      <th className="p-3.5">Mode</th>
                      <th className="p-3.5">Reference / Note</th>
                      <th className="p-3.5 text-right">Amount</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {vouchers.map((v) => {
                      const isReversed = v.is_reversed === 1;
                      const isReversalEntry = !!v.reversed_payment_id;
                      return (
                        <tr
                          key={v.id}
                          className={`hover:bg-surface-card/40 ${isReversed ? 'opacity-60' : ''}`}
                        >
                          <td className="p-3.5 font-bold whitespace-nowrap">{v.payment_date?.slice(0, 10)}</td>
                          <td className="p-3.5 font-black text-brand-400 whitespace-nowrap">
                            {v.voucher_number}
                          </td>
                          <td className="p-3.5 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                v.direction === 'payment'
                                  ? 'bg-rose-500/15 text-rose-400'
                                  : 'bg-emerald-500/15 text-emerald-400'
                              }`}
                            >
                              {v.direction}
                            </span>
                          </td>
                          <td className="p-3.5 font-sans font-bold text-text-primary">
                            {v.party_name || v.category || '-'}
                          </td>
                          <td className="p-3.5 uppercase font-bold">{v.payment_method}</td>
                          <td className="p-3.5 font-sans text-text-secondary max-w-xs truncate">
                            {v.narration || '-'}
                            {v.reversal_reason && (
                              <span className="block text-[10px] text-rose-400">
                                Reason: {v.reversal_reason}
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-right font-black text-sm whitespace-nowrap">
                            {formatMoney(v.amount_paise)}
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            {isReversed ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                Reversed
                              </span>
                            ) : isReversalEntry ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                                Reversal Entry
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => setSelectedVoucherForPrint(v)}
                                className="px-2.5 py-1 rounded-lg bg-surface-card hover:bg-surface-hover border border-border-subtle text-text-secondary text-xs font-bold flex items-center gap-1"
                                title="Print Voucher"
                              >
                                <Printer size={12} /> Print
                              </button>
                              {!isReversed && !isReversalEntry && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setReversingVoucher(v);
                                    setReversalReason('');
                                    setReversalError(null);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-xs font-bold flex items-center gap-1"
                                >
                                  <RotateCcw size={12} /> Reverse
                                </button>
                              )}
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
        )}

        {/* TAB 3: GENERAL VOUCHER (FOR SHOP EXPENSES & NON-PURCHASE PAYMENTS) */}
        {activeTab === 'voucher' && (
          <div className="max-w-2xl mx-auto bg-surface-panel border border-border-subtle rounded-2xl p-6 space-y-5">
            <div className="border-b border-border-subtle pb-3">
              <h2 className="text-base font-black text-text-primary">Create General Voucher</h2>
              <p className="text-xs text-text-muted">
                Record shop expenses, wages, scrap sales, or miscellaneous cash/bank movements
              </p>
            </div>

            {vchError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{vchError}</span>
              </div>
            )}

            <form onSubmit={handleCreateGeneralVoucher} className="space-y-4 text-xs font-bold">
              {/* Direction: Payment vs Receipt */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setVchDirection('payment');
                    setVchPartyType('expense');
                    setVchCategory(EXPENSE_CATEGORIES[0]);
                  }}
                  className={`py-3 rounded-xl border text-xs font-black transition-all ${
                    vchDirection === 'payment'
                      ? 'bg-rose-500 text-white border-rose-500 shadow-md'
                      : 'bg-surface-card border-border-subtle text-text-muted'
                  }`}
                >
                  Payment (Money Out)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVchDirection('receipt');
                    setVchPartyType('income');
                    setVchCategory(INCOME_CATEGORIES[0]);
                  }}
                  className={`py-3 rounded-xl border text-xs font-black transition-all ${
                    vchDirection === 'receipt'
                      ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                      : 'bg-surface-card border-border-subtle text-text-muted'
                  }`}
                >
                  Receipt (Money In)
                </button>
              </div>

              {/* Category */}
              <div>
                <label className="block uppercase text-text-secondary text-[10px] mb-1">Category *</label>
                <select
                  value={vchCategory}
                  onChange={(e) => setVchCategory(e.target.value)}
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-text-primary outline-none focus:border-brand-500"
                >
                  {(vchDirection === 'payment' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount & Mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block uppercase text-text-secondary text-[10px] mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={vchAmountRupees}
                    onChange={(e) => setVchAmountRupees(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 font-mono text-sm text-text-primary outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block uppercase text-text-secondary text-[10px] mb-1">Mode *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['cash', 'upi', 'bank'].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setVchMode(m as any)}
                        className={`py-2 rounded-lg text-xs font-black uppercase transition-all ${
                          vchMode === m
                            ? 'bg-brand-500 text-white'
                            : 'bg-surface-card border border-border-subtle text-text-muted'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Date & Reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block uppercase text-text-secondary text-[10px] mb-1">Date</label>
                  <input
                    type="date"
                    value={vchDate}
                    onChange={(e) => setVchDate(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 font-mono text-text-primary outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block uppercase text-text-secondary text-[10px] mb-1">Reference / UTR</label>
                  <input
                    type="text"
                    value={vchReference}
                    onChange={(e) => setVchReference(e.target.value)}
                    placeholder="Optional Ref / Cheque #"
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-text-primary outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Narration */}
              <div>
                <label className="block uppercase text-text-secondary text-[10px] mb-1">Narration / Notes</label>
                <input
                  type="text"
                  value={vchNarration}
                  onChange={(e) => setVchNarration(e.target.value)}
                  placeholder="Reason or notes..."
                  className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-text-primary outline-none focus:border-brand-500"
                />
              </div>

              <button
                type="submit"
                disabled={recordPaymentMutation.isPending}
                className="w-full py-3 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-black text-sm shadow-md transition-all"
              >
                {recordPaymentMutation.isPending ? 'Saving Voucher...' : 'Save Voucher'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: SETTINGS & PAYABLES HEALTH CHECK */}
        {activeTab === 'health_settings' && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Setting: Supplier Credit Days */}
            <div className="bg-surface-panel border border-border-subtle rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2 text-brand-400 font-black text-sm">
                <Sliders size={18} />
                <span>Supplier Credit Days Policy</span>
              </div>
              <p className="text-xs text-text-muted">
                Define the maximum credit threshold (in days) before an unpaid supplier bill turns red and triggers an
                overdue warning badge. Set to 0 to disable highlighting.
              </p>
              <div className="flex items-center gap-3 max-w-sm pt-2">
                <input
                  type="number"
                  min="0"
                  value={creditDaysInput}
                  onChange={(e) => setCreditDaysInput(e.target.value)}
                  className="bg-surface-card border border-border-subtle rounded-xl px-4 py-2 font-mono text-sm text-text-primary outline-none focus:border-brand-500 w-32"
                />
                <span className="text-xs font-bold text-text-secondary">days</span>
                <button
                  type="button"
                  onClick={handleSaveCreditDays}
                  disabled={updateCreditDaysMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-black shadow-sm"
                >
                  {updateCreditDaysMutation.isPending ? 'Saving...' : 'Save Policy'}
                </button>
              </div>
            </div>

            {/* Health Check: Balance Integrity Audit */}
            <div className="bg-surface-panel border border-border-subtle rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
                  <ShieldCheck size={18} />
                  <span>Payables Health & Reconciliation Check</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRunHealthCheck(false)}
                  disabled={checkHealthMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-black flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw size={14} className={checkHealthMutation.isPending ? 'animate-spin' : ''} />
                  <span>Run Health Check</span>
                </button>
              </div>

              <p className="text-xs text-text-muted">
                Verifies that every stored bill balance in the database matches the sum of its actual payment
                allocations and that zero balance drift has occurred.
              </p>

              {healthReport && (
                <div className="pt-2 space-y-3">
                  <div
                    className={`p-3.5 rounded-xl border flex items-center justify-between text-xs font-bold ${
                      healthReport.is_healthy
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {healthReport.is_healthy ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                      <span>
                        {healthReport.is_healthy
                          ? `All ${healthReport.checked_bills_count} bills verified healthy with 0 discrepancies.`
                          : `Found ${healthReport.discrepancies_count} bills with balance discrepancies!`}
                      </span>
                    </div>
                    {!healthReport.is_healthy && (
                      <button
                        type="button"
                        onClick={() => handleRunHealthCheck(true)}
                        className="px-3 py-1 rounded-lg bg-rose-500 text-white text-xs font-black"
                      >
                        Auto Repair All
                      </button>
                    )}
                  </div>

                  {healthReport.discrepancies.length > 0 && (
                    <div className="border border-border-subtle rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="bg-surface-card text-[10px] uppercase text-text-muted">
                          <tr>
                            <th className="p-2.5">Bill #</th>
                            <th className="p-2.5">Total</th>
                            <th className="p-2.5">Stored Bal</th>
                            <th className="p-2.5">Actual Bal</th>
                            <th className="p-2.5">Diff</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {healthReport.discrepancies.map((d) => (
                            <tr key={d.bill_id}>
                              <td className="p-2.5 font-bold">{d.invoice_number}</td>
                              <td className="p-2.5">{formatMoney(d.total_amount_paise)}</td>
                              <td className="p-2.5 text-rose-400">{formatMoney(d.stored_outstanding_paise)}</td>
                              <td className="p-2.5 text-emerald-400">{formatMoney(d.calculated_outstanding_paise)}</td>
                              <td className="p-2.5 font-bold text-amber-400">{formatMoney(d.difference_paise)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 4. CASHIER-FRIENDLY VENDOR PAY FLOW DIALOG (FIFO & Live Allocation Preview) */}
      {payingVendor && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-surface-panel border-2 border-border-subtle rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-2xl text-text-primary max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle pb-3 shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-brand-400">
                  Vendor Bill Settlement
                </span>
                <h3 className="text-lg font-black text-text-primary mt-0.5">
                  {payingVendor.supplier_company || payingVendor.supplier_name}
                </h3>
                <p className="text-xs text-text-muted">
                  Total Outstanding:{' '}
                  <strong className="font-mono text-rose-400">
                    {formatMoney(payingVendor.total_outstanding_paise)}
                  </strong>{' '}
                  across {payingVendor.pending_bills_count} pending bill(s)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayingVendor(null)}
                className="p-1.5 rounded-lg bg-surface-card text-text-muted hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            {/* Error Message */}
            {payError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2 shrink-0">
                <AlertCircle size={15} />
                <span>{payError}</span>
              </div>
            )}

            {/* Shift Cash Warning */}
            {payMode === 'cash' &&
              balances?.cashInHandPaise !== undefined &&
              enteredPayPaise > balances.cashInHandPaise && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center gap-2 shrink-0">
                  <AlertTriangle size={15} />
                  <span>
                    Warning: Payment amount ({formatMoney(enteredPayPaise)}) exceeds current cash in hand (
                    {formatMoney(balances.cashInHandPaise)}). Cashier may need a cash-in or float.
                  </span>
                </div>
              )}

            <form onSubmit={handleConfirmVendorPayment} className="space-y-4 overflow-y-auto pr-1">
              {/* Payment Amount with "Pay Full" Quick Button */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-black uppercase text-text-secondary">
                    Payment Amount (₹) *
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setPayAmountRupees((payingVendor.total_outstanding_paise / 100).toFixed(2))
                    }
                    className="px-2.5 py-1 rounded-lg bg-brand-500/15 hover:bg-brand-500/25 border border-brand-500/30 text-brand-400 text-xs font-black"
                  >
                    Pay Full ({formatMoney(payingVendor.total_outstanding_paise)})
                  </button>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  autoFocus
                  value={payAmountRupees}
                  onChange={(e) => setPayAmountRupees(e.target.value)}
                  className="w-full bg-surface-card border-2 border-border-subtle focus:border-brand-500 rounded-xl px-4 py-2.5 text-xl font-mono font-black text-text-primary outline-none"
                />
              </div>

              {/* Payment Mode Selector: Cash / Bank / UPI */}
              <div>
                <label className="block text-xs font-black uppercase text-text-secondary mb-1.5">
                  Payment Mode *
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { id: 'cash', label: 'Cash', icon: Wallet },
                    { id: 'bank', label: 'Bank / Transfer', icon: Landmark },
                    { id: 'upi', label: 'UPI / QR', icon: CreditCard },
                  ].map((m) => {
                    const Icon = m.icon;
                    const active = payMode === m.id;
                    return (
                      <button
                        type="button"
                        key={m.id}
                        onClick={() => setPayMode(m.id as any)}
                        className={`py-2.5 px-3 rounded-xl border-2 text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
                          active
                            ? 'bg-brand-500 text-white border-brand-500 shadow-md'
                            : 'bg-surface-card border-border-subtle text-text-muted hover:text-text-primary'
                        }`}
                      >
                        <Icon size={14} />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reference & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {payMode !== 'cash' && (
                  <div>
                    <label className="block text-xs font-bold uppercase text-text-secondary mb-1">
                      Reference / UTR / Cheque # *
                    </label>
                    <input
                      type="text"
                      required
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="e.g. UTR / Transaction ID"
                      className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs font-bold text-text-primary outline-none focus:border-brand-500"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold uppercase text-text-secondary mb-1">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full bg-surface-card border border-border-subtle rounded-xl px-3 py-2 text-xs font-mono font-bold text-text-primary outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Allocation Mode Switch: Automatic FIFO vs Manual */}
              <div className="flex items-center justify-between border-t border-border-subtle pt-3">
                <div>
                  <span className="text-xs font-black text-text-primary block">
                    {isManualAlloc ? 'Manual Bill Allocation' : 'Automatic FIFO Allocation (Oldest Bills First)'}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    {isManualAlloc
                      ? 'Specify exact amounts for each bill'
                      : 'Automatically settles the oldest pending bills in chronological order'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsManualAlloc(!isManualAlloc)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-black transition-all ${
                    isManualAlloc
                      ? 'bg-brand-500/15 border-brand-500 text-brand-400'
                      : 'bg-surface-card border-border-subtle text-text-muted hover:text-text-primary'
                  }`}
                >
                  {isManualAlloc ? 'Switch to Auto FIFO' : 'Choose bills myself'}
                </button>
              </div>

              {/* LIVE PREVIEW ALLOCATION TABLE */}
              <div className="border border-border-subtle rounded-xl overflow-hidden bg-surface-card/60">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-surface-card text-[10px] font-bold uppercase text-text-muted border-b border-border-subtle">
                    <tr>
                      <th className="p-2.5">Bill #</th>
                      <th className="p-2.5">Date</th>
                      <th className="p-2.5 text-right">Bal Before</th>
                      <th className="p-2.5 text-right">Paying Now</th>
                      <th className="p-2.5 text-right">Bal After</th>
                      <th className="p-2.5 text-center">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {allocationPreviewRows.map((row) => (
                      <tr key={row.billId} className="hover:bg-surface-hover/30">
                        <td className="p-2.5 font-bold text-brand-400">{row.billNumber}</td>
                        <td className="p-2.5">{row.billDate}</td>
                        <td className="p-2.5 text-right">{formatMoney(row.balanceBefore)}</td>
                        <td className="p-2.5 text-right">
                          {isManualAlloc ? (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={(row.balanceBefore / 100).toFixed(2)}
                              value={manualAllocations[row.billId] ?? ''}
                              onChange={(e) =>
                                setManualAllocations({
                                  ...manualAllocations,
                                  [row.billId]: e.target.value,
                                })
                              }
                              placeholder="0.00"
                              className="w-24 bg-surface-card border border-border-subtle rounded-lg px-2 py-1 text-right font-mono text-xs font-bold text-emerald-400 outline-none focus:border-brand-500"
                            />
                          ) : (
                            <span
                              className={`font-black ${
                                row.payingNow > 0 ? 'text-emerald-400' : 'text-text-muted'
                              }`}
                            >
                              {formatMoney(row.payingNow)}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-bold text-text-primary">
                          {formatMoney(row.balanceAfter)}
                        </td>
                        <td className="p-2.5 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              row.result === 'Cleared'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : row.result === 'Partly paid'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : 'bg-surface-card text-text-muted'
                            }`}
                          >
                            {row.result}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Submit Button */}
              <div className="pt-2 shrink-0">
                <button
                  type="submit"
                  disabled={isSubmittingPay || recordVendorPaymentMutation.isPending || !!payValidationError}
                  className="w-full py-3.5 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-sm shadow-lg shadow-brand-500/20 flex items-center justify-center gap-2 transition-all"
                >
                  <DollarSign size={16} />
                  <span>
                    {isSubmittingPay
                      ? 'Processing Payment...'
                      : `Confirm & Pay ${formatMoney(enteredPayPaise)}`}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. VIEW BILLS DRAWER (For inspecting individual bills of a vendor) */}
      {viewBillsVendor && (
        <div className="fixed inset-0 z-50 bg-black/80 flex justify-end">
          <div className="bg-surface-panel border-l border-border-subtle w-full max-w-2xl h-full p-6 space-y-4 shadow-2xl flex flex-col text-text-primary animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-start justify-between gap-3 border-b border-border-subtle pb-4 shrink-0">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-brand-400">
                  Purchase Bills Register
                </span>
                <h3 className="text-xl font-black text-text-primary mt-0.5">
                  {viewBillsVendor.supplier_company || viewBillsVendor.supplier_name}
                </h3>
                <div className="flex items-center gap-3 text-xs mt-1">
                  <span>
                    Outstanding:{' '}
                    <strong className="font-mono text-rose-400">
                      {formatMoney(viewBillsVendor.total_outstanding_paise)}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Purchased:{' '}
                    <strong className="font-mono text-text-primary">
                      {formatMoney(viewBillsVendor.total_purchased_paise)}
                    </strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewBillsVendor(null)}
                className="p-1.5 rounded-lg bg-surface-card text-text-muted hover:text-text-primary"
              >
                <X size={18} />
              </button>
            </div>

            {/* Filter Tabs inside Drawer: Pending / Paid / All */}
            <div className="flex items-center gap-2 shrink-0">
              {[
                {
                  id: 'pending',
                  label: 'Pending Bills',
                  count: viewBillsVendor.bills.filter((b) => b.outstanding_balance_paise > 0).length,
                },
                {
                  id: 'paid',
                  label: 'Settled Bills',
                  count: viewBillsVendor.bills.filter((b) => b.outstanding_balance_paise === 0).length,
                },
                {
                  id: 'all',
                  label: 'All Bills',
                  count: viewBillsVendor.bills.length,
                },
              ].map((tab) => {
                const active = viewBillsTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setViewBillsTab(tab.id as any)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 ${
                      active
                        ? 'bg-brand-500 text-white'
                        : 'bg-surface-card text-text-muted hover:text-text-primary'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className="text-[10px] opacity-80">({tab.count})</span>
                  </button>
                );
              })}
            </div>

            {/* Bills List Table */}
            <div className="flex-1 min-h-0 overflow-y-auto border border-border-subtle rounded-xl">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-surface-card text-[10px] font-bold uppercase text-text-muted border-b border-border-subtle sticky top-0">
                  <tr>
                    <th className="p-3">Bill #</th>
                    <th className="p-3">Date</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Paid</th>
                    <th className="p-3 text-right">Balance</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {viewBillsVendor.bills
                    .filter((b) => {
                      if (viewBillsTab === 'pending') return b.outstanding_balance_paise > 0;
                      if (viewBillsTab === 'paid') return b.outstanding_balance_paise === 0;
                      return true;
                    })
                    .map((bill) => {
                      const isPaid = bill.outstanding_balance_paise === 0;
                      const billNo =
                        bill.supplier_invoice_number || bill.purchase_ref_number || bill.invoice_number;

                      return (
                        <tr
                          key={bill.id}
                          onClick={() => setSelectedBillForHistory(bill)}
                          className="hover:bg-surface-card/60 cursor-pointer transition-all"
                          title="Click to view payment history for this bill"
                        >
                          <td className="p-3 font-bold text-brand-400 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <span>{billNo}</span>
                              <ChevronRight size={12} className="text-text-muted opacity-50" />
                            </div>
                          </td>
                          <td className="p-3 whitespace-nowrap">
                            <span>{bill.invoice_date}</span>
                            <span className="block text-[10px] text-text-muted">{bill.days_old}d ago</span>
                          </td>
                          <td className="p-3 text-right whitespace-nowrap">
                            {formatMoney(bill.total_amount_paise)}
                          </td>
                          <td className="p-3 text-right text-emerald-400 whitespace-nowrap">
                            {formatMoney(bill.paid_amount_paise)}
                          </td>
                          <td className="p-3 text-right font-black whitespace-nowrap">
                            <span className={bill.outstanding_balance_paise > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                              {formatMoney(bill.outstanding_balance_paise)}
                            </span>
                          </td>
                          <td className="p-3 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                isPaid
                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                  : bill.paid_amount_paise > 0
                                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                              }`}
                            >
                              {bill.computed_payment_status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {/* Bottom Pay Action */}
            {viewBillsVendor.total_outstanding_paise > 0 && (
              <div className="pt-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const v = viewBillsVendor;
                    setViewBillsVendor(null);
                    handleOpenPayModal(v);
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-black text-xs shadow-md flex items-center justify-center gap-2"
                >
                  <DollarSign size={15} />
                  <span>Settle Balance ({formatMoney(viewBillsVendor.total_outstanding_paise)})</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 6. INDIVIDUAL BILL PAYMENT HISTORY & REVERSAL MODAL */}
      {selectedBillForHistory && (
        <BillHistoryModal
          bill={selectedBillForHistory}
          onClose={() => setSelectedBillForHistory(null)}
          onPaymentReversed={() => {
            refetchPayables();
            refetchBalances();
            refetchRegister();
          }}
        />
      )}

      {/* 7. PAYMENT REVERSAL CONFIRMATION MODAL */}
      {reversingVoucher && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-surface-panel border-2 border-rose-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl text-text-primary">
            <div className="flex items-center gap-2.5 text-rose-400 font-black text-base border-b border-border-subtle pb-3">
              <RotateCcw size={18} />
              <span>Reverse Payment Voucher #{reversingVoucher.voucher_number}</span>
            </div>

            <p className="text-xs text-text-muted">
              Reversing this voucher will create an immutable linked reversal entry, restore original bill balances,
              re-adjust supplier and daily ledgers, and credit the cash/bank accounts.
            </p>

            <div className="p-3 bg-surface-card rounded-xl border border-border-subtle text-xs">
              <div>
                Amount: <strong className="font-mono text-text-primary">{formatMoney(reversingVoucher.amount_paise)}</strong>{' '}
                via {reversingVoucher.payment_method.toUpperCase()}
              </div>
              <div className="text-text-muted mt-0.5">Party: {reversingVoucher.party_name || 'General Expense'}</div>
            </div>

            {reversalError && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold">
                {reversalError}
              </div>
            )}

            <form onSubmit={handleConfirmReversal} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-text-secondary mb-1">
                  Mandatory Reversal Reason *
                </label>
                <textarea
                  required
                  rows={3}
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  placeholder="e.g. Wrong amount entered / payment cancelled by cashier..."
                  className="w-full bg-surface-card border border-border-subtle rounded-xl p-3 text-xs text-text-primary outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReversingVoucher(null)}
                  className="px-4 py-2 rounded-xl bg-surface-card text-text-secondary hover:text-text-primary text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reversePaymentMutation.isPending}
                  className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-black shadow-md"
                >
                  {reversePaymentMutation.isPending ? 'Reversing...' : 'Confirm Reversal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. CONTRA CASH/BANK TRANSFER MODAL */}
      <ContraTransferModal
        isOpen={isContraOpen}
        onClose={() => {
          setIsContraOpen(false);
          refetchBalances();
          refetchRegister();
        }}
      />

      {/* 9. VOUCHER PRINT MODAL */}
      <VoucherPrintModal
        isOpen={!!selectedVoucherForPrint}
        voucher={selectedVoucherForPrint}
        onClose={() => setSelectedVoucherForPrint(null)}
      />
    </div>
  );
}
