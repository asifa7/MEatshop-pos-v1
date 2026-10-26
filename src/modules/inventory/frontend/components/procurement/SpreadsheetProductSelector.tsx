import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProductVariant } from '../../../../billing/frontend/types/billing.types';

interface SpreadsheetProductSelectorProps {
  variants: ProductVariant[];
  selectedVariantId: number | null;
  onSelectVariant: (variant: ProductVariant | null) => void;
  onItemSelected?: (variant: ProductVariant) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}

function isProductCodeLookup(query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  if (/^\d+$/.test(q)) return true;
  if (/^prd-/i.test(q)) return true;
  if (/\d/.test(q) && /^[a-zA-Z0-9-]+$/.test(q) && q.length >= 3) return true;
  return false;
}

export default function SpreadsheetProductSelector({
  variants,
  selectedVariantId,
  onSelectVariant,
  onItemSelected,
  onKeyDown,
  inputRef,
}: SpreadsheetProductSelectorProps) {
  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selectedVariant = variants.find((v) => v.id === selectedVariantId);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const internalInputRef = useRef<HTMLInputElement | null>(null);

  // Sync display text with selected variant name when dropdown is closed
  useEffect(() => {
    if (!isOpen) {
      if (selectedVariant) {
        setSearch(selectedVariant.product_name);
      } else if (!selectedVariantId) {
        setSearch('');
      }
    }
  }, [selectedVariant?.id, selectedVariantId, isOpen]);

  const filtered = useMemo(() => {
    const trimmed = search.trim();
    if (!trimmed || (selectedVariant && trimmed === selectedVariant.product_name && !isOpen)) {
      return variants;
    }
    const q = trimmed.toLowerCase();
    const codeMode = isProductCodeLookup(trimmed);

    const matches = variants.filter((v) => {
      const code = (v.product_code || '').toLowerCase();
      const name = (v.product_name || '').toLowerCase();
      const cat = (v.category || '').toLowerCase();
      if (codeMode) {
        return code === q || code.startsWith(q) || code.endsWith(q) || code.includes(q) || name.includes(q);
      }
      return name.includes(q) || code.includes(q) || cat.includes(q);
    });

    // Sort exact product_code match first, then code prefix, then name prefix
    return [...matches].sort((a, b) => {
      const aCode = (a.product_code || '').toLowerCase();
      const bCode = (b.product_code || '').toLowerCase();
      const aName = (a.product_name || '').toLowerCase();
      const bName = (b.product_name || '').toLowerCase();

      const aExactCode = aCode === q ? 1 : 0;
      const bExactCode = bCode === q ? 1 : 0;
      if (aExactCode !== bExactCode) return bExactCode - aExactCode;

      const aStartsCode = aCode.startsWith(q) ? 1 : 0;
      const bStartsCode = bCode.startsWith(q) ? 1 : 0;
      if (aStartsCode !== bStartsCode) return bStartsCode - aStartsCode;

      const aStartsName = aName.startsWith(q) ? 1 : 0;
      const bStartsName = bName.startsWith(q) ? 1 : 0;
      if (aStartsName !== bStartsName) return bStartsName - aStartsName;

      return aName.localeCompare(bName);
    });
  }, [variants, search, selectedVariant, isOpen]);

  const commitVariantSelection = (variant: ProductVariant, e?: React.KeyboardEvent<HTMLInputElement>) => {
    onSelectVariant(variant);
    setSearch(variant.product_name);
    setIsOpen(false);
    if (onItemSelected) {
      onItemSelected(variant);
    } else if (e) {
      onKeyDown(e);
    }
  };

  const handleLocalKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (!isOpen) {
        setIsOpen(true);
        setHighlightedIndex(0);
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const nextIdx = Math.min(highlightedIndex + 1, Math.max(0, filtered.length - 1));
      setHighlightedIndex(nextIdx);
      setTimeout(() => {
        const activeEl = dropdownRef.current?.querySelector(`[data-index="${nextIdx}"]`);
        if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
      }, 10);
    } else if (e.key === 'ArrowUp') {
      if (isOpen) {
        e.preventDefault();
        const prevIdx = Math.max(highlightedIndex - 1, 0);
        setHighlightedIndex(prevIdx);
        setTimeout(() => {
          const activeEl = dropdownRef.current?.querySelector(`[data-index="${prevIdx}"]`);
          if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
        }, 10);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // Single-Enter selection: immediately pick highlighted or best match AND move focus to Quantity
      if (isOpen && filtered[highlightedIndex]) {
        commitVariantSelection(filtered[highlightedIndex], e);
        return;
      }
      if (filtered.length > 0 && search.trim()) {
        const q = search.trim().toLowerCase();
        const exact = filtered.find(
          (v) => (v.product_code || '').toLowerCase() === q || (v.product_name || '').toLowerCase() === q
        );
        commitVariantSelection(exact || filtered[0], e);
        return;
      }
      if (selectedVariant) {
        commitVariantSelection(selectedVariant, e);
        return;
      }
      onKeyDown(e);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === 'Tab') {
      if (isOpen && filtered[highlightedIndex]) {
        onSelectVariant(filtered[highlightedIndex]);
        setSearch(filtered[highlightedIndex].product_name);
        setIsOpen(false);
      }
      onKeyDown(e);
    } else {
      onKeyDown(e);
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const [openUpward, setOpenUpward] = useState(false);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 260);
    }
  }, [isOpen]);

  const handleBlur = () => {
    setTimeout(() => {
      if (dropdownRef.current && dropdownRef.current.contains(document.activeElement)) {
        return;
      }
      setIsOpen(false);
    }, 150);
  };

  return (
    <div ref={containerRef} className="relative w-full h-full min-h-[48px] flex items-center">
      <input
        ref={(el) => {
          internalInputRef.current = el;
          inputRef(el);
        }}
        type="text"
        value={search}
        onChange={(e) => {
          const val = e.target.value;
          setSearch(val);
          setHighlightedIndex(0);

          if (!val.trim()) {
            onSelectVariant(null);
            setIsOpen(false);
            return;
          }

          setIsOpen(true);
        }}
        onFocus={(e) => {
          e.currentTarget.select();
        }}
        onBlur={handleBlur}
        onKeyDown={handleLocalKeyDown}
        placeholder="Type item code (e.g. 1) or name & press Enter..."
        className="product-search-input w-full h-full min-h-[48px] bg-transparent px-3.5 text-sm sm:text-base font-semibold text-text-primary placeholder:text-text-muted/70 focus:outline-none focus:bg-brand-500/10 focus:ring-2 focus:ring-brand-500 rounded-lg"
      />
      {isOpen && filtered.length > 0 && (
        <div
          ref={dropdownRef}
          className={`absolute left-0 w-full min-w-[360px] max-h-72 overflow-y-auto bg-surface-card border border-border-subtle rounded-xl shadow-2xl z-50 divide-y divide-border-subtle/50 ${
            openUpward ? 'bottom-full mb-2' : 'top-full mt-1'
          }`}
        >
          {filtered.map((v, idx) => {
            const isHighlighted = idx === highlightedIndex;
            return (
              <div
                key={v.id}
                data-index={idx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitVariantSelection(v);
                }}
                className={`px-4 py-3 cursor-pointer text-sm transition-colors flex items-center justify-between gap-3 ${
                  isHighlighted
                    ? 'bg-brand-500/20 text-brand-300 font-bold'
                    : 'hover:bg-surface-hover text-text-primary'
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="font-bold truncate text-sm sm:text-base">{v.product_name}</div>
                  <div className="text-xs text-text-muted flex flex-wrap gap-3">
                    <span className="font-mono font-bold text-brand-400">Code: {v.product_code || '-'}</span>
                    <span>Cat: {v.category || 'General'}</span>
                    <span>Unit: {v.unit_type === 'weight' ? 'Kg' : 'Pcs'}</span>
                  </div>
                </div>
                <div className="text-right font-mono text-xs font-bold text-emerald-400 shrink-0">
                  ₹{((v.current_rate_paise_per_unit || 0) / 100).toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
