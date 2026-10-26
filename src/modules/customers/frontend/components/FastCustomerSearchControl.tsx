import React, { useState, useEffect, useRef } from 'react';
import { Search, UserCheck, AlertTriangle, UserPlus, Phone, MapPin, Clock, ShoppingBag, X, Check, ArrowRight } from 'lucide-react';
import { useFastCustomerLookup, useRecentCustomers, useQuickAddCustomer } from '../hooks/useCustomers';
import { FastCustomerLookupResult, RecentCustomerItem } from '../types/customer.types';

interface FastCustomerSearchControlProps {
  selectedCustomer: any | null;
  onSelectCustomer: (customer: any) => void;
  onClearCustomer: () => void;
  autoFocus?: boolean;
}

export default function FastCustomerSearchControl({
  selectedCustomer,
  onSelectCustomer,
  onClearCustomer,
  autoFocus = false,
}: FastCustomerSearchControlProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Quick Add Form state
  const [quickAddName, setQuickAddName] = useState('');
  const [whatsappConsent, setWhatsappConsent] = useState(true);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [isQuickAdding, setIsQuickAdding] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isDigits = /^\d+$/.test(query.trim());
  const cleanDigits = query.trim().replace(/\D/g, '');
  const isTenDigits = cleanDigits.length === 10;

  // Fast Lookup Query (requires >= 4 chars)
  const { data: lookupData, isLoading: isLookupLoading } = useFastCustomerLookup(query.trim(), 8);
  const { data: recents = [] } = useRecentCustomers(10);
  const quickAddMutation = useQuickAddCustomer();

  const results = lookupData?.results || [];
  const totalMatches = lookupData?.totalMatches || 0;
  const collision = lookupData?.collision || false;
  const hint = lookupData?.hint;

  // Show quick add if 10 digits typed and 0 results found
  const showQuickAdd = isTenDigits && results.length === 0 && !isLookupLoading;

  // Reset selected index on results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation: Arrows, Enter, Escape
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
      return;
    }

    if (showQuickAdd) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleQuickAddSubmit();
      }
      return;
    }

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }

    // When showing search results
    if (results.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // Exact 10 digit match or single result can be selected directly
        const target = results[selectedIndex] || results[0];
        if (target) {
          handleSelect(target);
        }
      }
    } else if (query.trim().length === 0 && recents.length > 0) {
      // Navigating recents
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % recents.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + recents.length) % recents.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = recents[selectedIndex] || recents[0];
        if (target) {
          handleSelect(target);
        }
      }
    }
  };

  const handleSelect = (cust: FastCustomerLookupResult | RecentCustomerItem | any) => {
    onSelectCustomer(cust);
    setIsOpen(false);
    setQuery('');
  };

  const handleQuickAddSubmit = async () => {
    if (!isTenDigits) return;
    setIsQuickAdding(true);
    setQuickAddError(null);
    try {
      const created = await quickAddMutation.mutateAsync({
        phone: cleanDigits,
        name: quickAddName.trim() || undefined,
        whatsapp_bill_consent: whatsappConsent,
        marketing_consent: marketingConsent,
      });
      onSelectCustomer(created);
      setIsOpen(false);
      setQuery('');
      setQuickAddName('');
    } catch (err: any) {
      setQuickAddError(err.message || 'Failed to register customer');
    } finally {
      setIsQuickAdding(false);
    }
  };

  // Highlight matched digits inside masked phone
  const renderMaskedPhone = (maskedPhone: string, matchedDigits: string | null) => {
    if (!matchedDigits || !maskedPhone.includes(matchedDigits)) {
      return <span className="font-mono text-gray-600 dark:text-gray-300">{maskedPhone}</span>;
    }
    const parts = maskedPhone.split(matchedDigits);
    return (
      <span className="font-mono text-gray-600 dark:text-gray-300">
        {parts[0]}
        <strong className="text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 px-0.5 rounded font-bold">
          {matchedDigits}
        </strong>
        {parts[1]}
      </span>
    );
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* ── Input Bar ── */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Mobile (4+ digits) or Name (2+ letters)..."
          className="w-full rounded-xl border border-gray-200 dark:border-border-subtle pl-9 pr-9 py-2 text-xs placeholder:text-gray-400 bg-white dark:bg-surface-panel outline-none focus:border-[#0d6e53] focus:ring-1 focus:ring-[#0d6e53] transition-all shadow-2xs font-medium"
        />
        <Search size={14} className="absolute left-3 text-gray-400 pointer-events-none" />

        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-0.5"
            title="Clear search"
          >
            <X size={13} />
          </button>
        ) : selectedCustomer ? (
          <button
            type="button"
            onClick={onClearCustomer}
            className="absolute right-2.5 text-gray-400 hover:text-red-500 p-0.5"
            title="Unlink Customer (Revert to Walk-in)"
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      {/* ── Dropdown Results / Quick Add ── */}
      {isOpen && (
        <div className="absolute top-11 left-0 right-0 z-50 bg-white dark:bg-surface-card border border-gray-200 dark:border-border-subtle rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 divide-y divide-gray-100 dark:divide-border-subtle max-h-[380px] flex flex-col">
          
          {/* Collision Warning Banner (Section 8 item 3) */}
          {collision && (
            <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 px-3.5 py-2 flex items-center gap-2 text-amber-800 dark:text-amber-300 text-[11px] font-bold">
              <AlertTriangle size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                <strong>{totalMatches} customers match</strong>. Verify details before selecting.
              </span>
            </div>
          )}

          {/* Hint if typed < 4 digits */}
          {query.trim().length > 0 && query.trim().length < 4 && (
            <div className="p-3 text-center text-gray-500 text-xs">
              <p className="font-semibold">{hint || 'Type at least 4 digits or letters to search'}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">e.g. last 4 digits of phone number or customer name</p>
            </div>
          )}

          {/* Loading Indicator */}
          {isLookupLoading && (
            <div className="p-4 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
              <span>Searching customer records...</span>
            </div>
          )}

          {/* ── Results List ── */}
          {results.length > 0 && (
            <div className="overflow-y-auto divide-y divide-gray-100 dark:divide-border-subtle">
              {results.map((cust, idx) => {
                const isSelected = idx === selectedIndex;
                const isVip = cust.segment === 'VIP';
                const isDue = cust.outstanding_balance_paise > 0;

                return (
                  <div
                    key={cust.id}
                    onClick={() => handleSelect(cust)}
                    className={`p-3 cursor-pointer transition-colors flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-[#0d6e53]'
                        : 'hover:bg-gray-50 dark:hover:bg-surface-panel'
                    }`}
                  >
                    {/* Top Row: Name, Locality, Segment Badge */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-black text-gray-900 dark:text-white text-xs truncate">
                          {cust.name}
                        </span>
                        {cust.locality && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-0.5 shrink-0">
                            <MapPin size={10} />
                            {cust.locality}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isVip && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                            VIP
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                          {cust.segment}
                        </span>
                      </div>
                    </div>

                    {/* Middle Row: Phone with Highlighted Matched Digits, Last Visit, Visits */}
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        {renderMaskedPhone(cust.masked_phone, cust.matched_digits)}
                        <span className="text-gray-300 dark:text-gray-600">•</span>
                        <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Clock size={10} />
                          {cust.last_visit_relative}
                        </span>
                        <span className="text-gray-300 dark:text-gray-600">•</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {cust.visit_count} {cust.visit_count === 1 ? 'visit' : 'visits'}
                        </span>
                      </div>

                      {/* Outstanding Balance Badge */}
                      {isDue && (
                        <span className="text-[10px] font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-900/60">
                          Due ₹{(cust.outstanding_balance_paise / 100).toFixed(0)}
                        </span>
                      )}
                    </div>

                    {/* Bottom Row: Usual items or preferences */}
                    {(cust.usual_item_summary || cust.cutting_preference) && (
                      <div className="text-[10px] text-emerald-700 dark:text-emerald-400 flex items-center gap-1 truncate mt-0.5">
                        <ShoppingBag size={10} className="shrink-0" />
                        <span className="truncate">
                          {cust.usual_item_summary || cust.cutting_preference}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Inline Quick-Add Card (Section 8 item 6) ── */}
          {showQuickAdd && (
            <div className="p-3.5 bg-gradient-to-b from-emerald-50/60 to-white dark:from-emerald-950/30 dark:to-surface-card space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-black text-xs">
                  <UserPlus size={15} />
                  <span>Quick Register & Link to Bill</span>
                </div>
                <span className="text-[10px] font-mono text-gray-500 bg-white dark:bg-surface-panel px-2 py-0.5 rounded border border-gray-200 dark:border-border-subtle">
                  +91 {cleanDigits}
                </span>
              </div>

              {quickAddError && (
                <div className="p-2 rounded bg-red-50 text-red-600 text-[11px] font-bold">
                  {quickAddError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-600 dark:text-gray-300">
                  Customer Name (Optional)
                </label>
                <input
                  type="text"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  placeholder={`e.g. Customer ...${cleanDigits.slice(-4)}`}
                  className="w-full rounded-lg border border-gray-200 dark:border-border-subtle px-2.5 py-1.5 text-xs bg-white dark:bg-surface-panel outline-none focus:border-[#0d6e53]"
                  autoFocus
                />
              </div>

              {/* Consent Checkboxes */}
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={whatsappConsent}
                    onChange={(e) => setWhatsappConsent(e.target.checked)}
                    className="rounded text-[#0d6e53] focus:ring-0"
                  />
                  <span>Send invoice bills on WhatsApp (default on)</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-gray-500 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={(e) => setMarketingConsent(e.target.checked)}
                    className="rounded text-[#0d6e53] focus:ring-0"
                  />
                  <span>Opt-in for weekly specials & reminder offers</span>
                </label>
              </div>

              <button
                type="button"
                onClick={handleQuickAddSubmit}
                disabled={isQuickAdding}
                className="w-full mt-2 py-2 rounded-xl bg-[#0d6e53] hover:bg-[#0a5641] text-white text-xs font-black flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.99] transition-all cursor-pointer"
              >
                {isQuickAdding ? (
                  <span>Registering...</span>
                ) : (
                  <>
                    <span>Confirm & Attach to Bill [Enter ↵]</span>
                    <ArrowRight size={13} />
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── Recents List (Section 8 item 7) ── */}
          {query.trim().length === 0 && recents.length > 0 && (
            <div className="p-2 space-y-1">
              <p className="px-2 py-1 text-[10px] font-black uppercase tracking-wider text-gray-400">
                Recent Customers at this Counter
              </p>
              <div className="divide-y divide-gray-100 dark:divide-border-subtle overflow-y-auto max-h-[220px]">
                {recents.map((rc, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <div
                      key={rc.id}
                      onClick={() => handleSelect(rc)}
                      className={`px-2.5 py-1.5 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors ${
                        isSelected ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-white font-bold' : 'hover:bg-gray-50 dark:hover:bg-surface-panel'
                      }`}
                    >
                      <div>
                        <span className="font-bold">{rc.name}</span>
                        <span className="text-[10px] text-gray-400 font-mono ml-2">
                          {rc.masked_phone}
                        </span>
                      </div>
                      {rc.outstanding_balance_paise > 0 ? (
                        <span className="text-[10px] font-bold text-red-500">
                          Due: ₹{(rc.outstanding_balance_paise / 100).toFixed(0)}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          {rc.segment}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* No results message */}
          {query.trim().length >= 4 && !isTenDigits && results.length === 0 && !isLookupLoading && (
            <div className="p-4 text-center text-gray-400 text-xs">
              <p>No customers match "{query}".</p>
              <p className="text-[10px] mt-0.5 text-gray-400">
                Type full 10-digit number to quick-add new customer.
              </p>
            </div>
          )}

        </div>
      )}
    </div>
  );
}
