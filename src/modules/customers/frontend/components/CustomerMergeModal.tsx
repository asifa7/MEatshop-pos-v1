import { useState } from 'react';
import { X, GitMerge, AlertTriangle, ArrowRight, Check, Search } from 'lucide-react';
import { useMergeCustomers, useCustomers } from '../hooks/useCustomers';
import { formatPaise, getCategoryBadgeColor } from '../types/customer.types';
import type { Customer } from '../types/customer.types';

interface CustomerMergeModalProps {
  sourceCustomer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CustomerMergeModal({
  sourceCustomer,
  isOpen,
  onClose,
  onSuccess,
}: CustomerMergeModalProps) {
  const [targetQuery, setTargetQuery] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<Customer | null>(null);
  const [mergeReason, setMergeReason] = useState('Duplicate customer record merge');
  const [isConfirmStep, setIsConfirmStep] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { data: allCustomers } = useCustomers(false);
  const mergeCustomers = useMergeCustomers();

  if (!isOpen || !sourceCustomer) return null;

  // Filter possible target customers (exclude source customer)
  const filteredTargets = (allCustomers || []).filter((c) => {
    if (c.id === sourceCustomer.id) return false;
    if (!targetQuery.trim()) return true;
    const q = targetQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.whatsapp && c.whatsapp.includes(q)) ||
      c.customer_code.toLowerCase().includes(q)
    );
  }).slice(0, 8);

  const handleMerge = async () => {
    if (!selectedTarget) return;
    setErrorMessage('');
    try {
      await mergeCustomers.mutateAsync({
        source_customer_id: sourceCustomer.id,
        target_customer_id: selectedTarget.id,
        reason: mergeReason.trim() || undefined,
      });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Merge error:', err);
      setErrorMessage(err.message || 'Failed to merge customers');
    }
  };

  const combinedOutstanding = (sourceCustomer.outstanding_balance_paise || 0) + (selectedTarget?.outstanding_balance_paise || 0);
  const combinedAdvance = (sourceCustomer.advance_balance_paise || 0) + (selectedTarget?.advance_balance_paise || 0);

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-panel border border-border-subtle rounded-2xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150 text-text-primary">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex items-center justify-between bg-surface-card/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center font-bold">
              <GitMerge size={20} />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-text-primary">Merge Customer Records</h3>
              <p className="text-xs text-text-secondary">
                Combine two customer accounts into a single surviving profile
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMessage && (
            <div className="p-3 bg-red-100 dark:bg-red-950/40 border border-red-300 dark:border-red-800/50 rounded-xl text-xs text-red-800 dark:text-red-400 font-semibold flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          {!isConfirmStep ? (
            <>
              {/* Side-by-Side Selector */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* SOURCE CARD (To be merged away) */}
                <div className="bg-surface-card border border-red-300 dark:border-red-500/30 rounded-2xl p-4 space-y-3 relative overflow-hidden shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-red-100 dark:bg-red-500/20 text-red-800 dark:text-red-400 border border-red-300 dark:border-red-500/30">
                      Record To Merge (Away)
                    </span>
                    <span className="text-xs font-mono text-text-secondary">{sourceCustomer.customer_code}</span>
                  </div>

                  <div>
                    <h4 className="text-base font-extrabold text-text-primary">{sourceCustomer.name}</h4>
                    <p className="text-xs text-text-secondary mt-0.5 font-mono">
                      Phone: {sourceCustomer.phone || sourceCustomer.whatsapp || '—'}
                    </p>
                    <span className={`inline-block mt-2 px-2 py-0.5 border rounded-full text-[10px] ${getCategoryBadgeColor(sourceCustomer.category)}`}>
                      {sourceCustomer.category}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-border-subtle grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] text-text-muted font-medium">Outstanding</p>
                      <p className="font-mono font-bold text-red-600 dark:text-red-400">{formatPaise(sourceCustomer.outstanding_balance_paise)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-text-muted font-medium">Advance Balance</p>
                      <p className="font-mono font-bold text-brand-600 dark:text-brand-400">{formatPaise(sourceCustomer.advance_balance_paise)}</p>
                    </div>
                  </div>
                </div>

                {/* TARGET CARD (Surviving Record) */}
                <div className="bg-surface-card border border-brand-300 dark:border-brand-500/30 rounded-2xl p-4 space-y-3 relative overflow-hidden flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-brand-100 dark:bg-brand-500/20 text-brand-800 dark:text-brand-400 border border-brand-300 dark:border-brand-500/30">
                        Surviving Record (Keep)
                      </span>
                      {selectedTarget && (
                        <span className="text-xs font-mono text-text-secondary">{selectedTarget.customer_code}</span>
                      )}
                    </div>

                    {selectedTarget ? (
                      <div className="mt-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-base font-extrabold text-text-primary">{selectedTarget.name}</h4>
                          <button
                            type="button"
                            onClick={() => setSelectedTarget(null)}
                            className="text-[10px] text-brand-600 dark:text-brand-400 hover:underline font-bold"
                          >
                            Change
                          </button>
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5 font-mono">
                          Phone: {selectedTarget.phone || selectedTarget.whatsapp || '—'}
                        </p>
                        <span className={`inline-block mt-2 px-2 py-0.5 border rounded-full text-[10px] ${getCategoryBadgeColor(selectedTarget.category)}`}>
                          {selectedTarget.category}
                        </span>

                        <div className="pt-2 mt-3 border-t border-border-subtle grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <p className="text-[10px] text-text-muted font-medium">Outstanding</p>
                            <p className="font-mono font-bold text-red-600 dark:text-red-400">{formatPaise(selectedTarget.outstanding_balance_paise)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-text-muted font-medium">Advance Balance</p>
                            <p className="font-mono font-bold text-brand-600 dark:text-brand-400">{formatPaise(selectedTarget.advance_balance_paise)}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs font-bold text-text-primary">Select the customer record to keep:</p>
                        <div className="relative">
                          <Search size={14} className="absolute left-3 top-3 text-text-muted" />
                          <input
                            type="text"
                            value={targetQuery}
                            onChange={(e) => setTargetQuery(e.target.value)}
                            placeholder="Search by name, phone or code..."
                            className="w-full bg-surface-panel border border-border-subtle rounded-xl pl-9 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none font-medium"
                            autoFocus
                          />
                        </div>

                        {/* Search Results List */}
                        <div className="max-h-44 overflow-y-auto space-y-1 pt-1">
                          {filteredTargets.length === 0 ? (
                            <p className="text-[11px] text-text-muted text-center py-3">No matching customers found</p>
                          ) : (
                            filteredTargets.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setSelectedTarget(t)}
                                className="w-full text-left p-2 rounded-lg hover:bg-brand-500/10 border border-transparent hover:border-brand-500/30 flex items-center justify-between transition-colors"
                              >
                                <div>
                                  <p className="text-xs font-extrabold text-text-primary">{t.name}</p>
                                  <p className="text-[10px] text-text-secondary font-mono">
                                    {t.customer_code} • {t.phone || t.whatsapp || 'No phone'}
                                  </p>
                                </div>
                                <span className="text-[10px] text-brand-600 dark:text-brand-400 font-bold">Select</span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Merge Details Form */}
              {selectedTarget && (
                <div className="space-y-3 bg-surface-card border border-border-subtle rounded-2xl p-4 shadow-sm">
                  <div>
                    <label className="block text-xs font-bold text-text-secondary mb-1">
                      Reason / Reference Note for Merge
                    </label>
                    <input
                      type="text"
                      value={mergeReason}
                      onChange={(e) => setMergeReason(e.target.value)}
                      placeholder="e.g. Duplicate account created during rush hour"
                      className="w-full bg-surface-panel border border-border-subtle rounded-xl px-3.5 py-2.5 text-xs text-text-primary placeholder:text-text-muted focus:border-brand-500 focus:outline-none font-medium"
                    />
                  </div>
                </div>
              )}
            </>
          ) : (
            /* PREVIEW & CONFIRMATION STEP */
            <div className="space-y-5">
              <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" size={20} />
                <div className="text-xs">
                  <p className="font-extrabold text-text-primary text-sm">Please Confirm Customer Merge</p>
                  <p className="text-text-secondary mt-1 leading-relaxed">
                    This action will reassign all historical invoices, payments, credit records, and ledger entries from <strong className="text-text-primary font-bold">{sourceCustomer.name} ({sourceCustomer.customer_code})</strong> into <strong className="text-text-primary font-bold">{selectedTarget?.name} ({selectedTarget?.customer_code})</strong>.
                  </p>
                </div>
              </div>

              {/* Combined Impact Summary */}
              <div className="bg-surface-card border border-border-subtle rounded-2xl p-5 space-y-4 shadow-sm">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                  Combined Financial Totals After Merge
                </h4>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-surface-panel border border-border-subtle rounded-xl p-3">
                    <p className="text-[10px] text-text-muted font-medium">Combined Outstanding</p>
                    <p className="text-sm font-mono font-extrabold text-red-600 dark:text-red-400 mt-1">{formatPaise(combinedOutstanding)}</p>
                  </div>
                  <div className="bg-surface-panel border border-border-subtle rounded-xl p-3">
                    <p className="text-[10px] text-text-muted font-medium">Combined Advance</p>
                    <p className="text-sm font-mono font-extrabold text-brand-600 dark:text-brand-400 mt-1">{formatPaise(combinedAdvance)}</p>
                  </div>
                  <div className="bg-surface-panel border border-border-subtle rounded-xl p-3">
                    <p className="text-[10px] text-text-muted font-medium">Surviving Code</p>
                    <p className="text-sm font-mono font-extrabold text-text-primary mt-1">{selectedTarget?.customer_code}</p>
                  </div>
                </div>

                <div className="text-xs text-text-secondary space-y-1.5 pt-2">
                  <p className="flex items-center gap-2">
                    <Check size={14} className="text-brand-500" />
                    <span>Invoices, visits, and payments are safely transferred to {selectedTarget?.name}.</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <Check size={14} className="text-brand-500" />
                    <span>Source record {sourceCustomer.customer_code} is retained as an inactive reference pointing to {selectedTarget?.customer_code}.</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border-subtle flex items-center justify-between bg-surface-card/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>

          {!isConfirmStep ? (
            <button
              type="button"
              disabled={!selectedTarget}
              onClick={() => setIsConfirmStep(true)}
              className="btn-primary px-6 py-2 text-xs font-bold flex items-center gap-2 disabled:opacity-40"
            >
              <span>Preview Merge</span>
              <ArrowRight size={14} />
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsConfirmStep(false)}
                className="px-4 py-2 text-xs font-bold border border-border-subtle rounded-xl text-text-secondary hover:text-text-primary"
              >
                Back
              </button>
              <button
                type="button"
                disabled={mergeCustomers.isPending}
                onClick={handleMerge}
                className="px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-amber-900/40 transition-all"
              >
                <GitMerge size={15} />
                <span>{mergeCustomers.isPending ? 'Merging...' : 'Confirm & Complete Merge'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
