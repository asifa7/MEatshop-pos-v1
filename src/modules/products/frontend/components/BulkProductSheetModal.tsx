import React, { useState, useRef, useEffect, useMemo, KeyboardEvent, ClipboardEvent, ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  X,
  Save,
  AlertTriangle,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  CheckCircle2,
  Download,
  Upload,
  Trash2,
  ClipboardPaste,
} from 'lucide-react';
import { IPC_CHANNELS } from '../../../../core/ipc/channels';
import { useAdminProducts } from '../hooks/useProducts';
import { FIXED_CATEGORIES } from '../../types/products.types';

export interface BulkProductSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export type StandardUnitOption = 'kg' | 'g' | 'pcs' | 'tray' | 'pack';

export interface BulkSheetRow {
  name: string;
  category: string;
  unit: StandardUnitOption;
  buying_rate_rupees: string;
  selling_rate_rupees: string;
  product_code: string;
  track_in_inventory: boolean;
}

const STANDARD_UNITS: { value: StandardUnitOption; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'pcs', label: 'pcs' },
  { value: 'tray', label: 'tray' },
  { value: 'pack', label: 'pack' },
];

const CATEGORIES = FIXED_CATEGORIES?.length
  ? [...FIXED_CATEGORIES]
  : ['Chicken', 'Mutton', 'Seafood', 'Eggs', 'Cold Cuts', 'Masalas', 'General'];

const normalizeUnit = (raw?: string): StandardUnitOption => {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'g' || s === 'gram' || s === 'grams') return 'g';
  if (s === 'pcs' || s === 'pc' || s === 'piece' || s === 'pieces' || s === 'unit') return 'pcs';
  if (s === 'tray' || s === 'trays') return 'tray';
  if (s === 'pack' || s === 'packet' || s === 'pkt') return 'pack';
  return 'kg';
};

export default function BulkProductSheetModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkProductSheetModalProps) {
  const { data: existingProducts = [] } = useAdminProducts();
  const queryClient = useQueryClient();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<BulkSheetRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isPasteBoxOpen, setIsPasteBoxOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saveSummary, setSaveSummary] = useState<{
    createdCount: number;
    updatedCount: number;
    errorRows: Array<{ rowIndex: number; rowName?: string; messages: string[] }>;
  } | null>(null);

  // Compute highest existing numeric product code
  const highestExistingCode = useMemo(() => {
    let maxCode = 0;
    for (const p of existingProducts) {
      if (p.product_code) {
        const clean = String(p.product_code).replace(/^prd-0*/i, '').replace(/^0+/, '');
        const num = parseInt(clean, 10);
        if (!isNaN(num) && num > maxCode) {
          maxCode = num;
        }
      }
    }
    return maxCode;
  }, [existingProducts]);

  // Existing catalogue lookup sets for instant duplicate detection
  const existingCodeSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of existingProducts) {
      if (p.product_code) {
        s.add(String(p.product_code).trim().toLowerCase());
      }
    }
    return s;
  }, [existingProducts]);

  const existingNameSet = useMemo(() => {
    const s = new Set<string>();
    for (const p of existingProducts) {
      if (p.name) s.add(p.name.trim().toLowerCase());
      const vName = (p as any).variant_name;
      if (vName) s.add(String(vName).trim().toLowerCase());
    }
    return s;
  }, [existingProducts]);

  // Always open EMPTY (8 blank rows ready for entry — NO prefilled dummy/existing items)
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSaveSummary(null);
      setIsPasteBoxOpen(false);
      setPasteText('');

      const blankRows: BulkSheetRow[] = Array.from({ length: 8 }, (_, idx) => ({
        name: '',
        category: CATEGORIES[0] || 'Chicken',
        unit: 'kg',
        buying_rate_rupees: '',
        selling_rate_rupees: '',
        product_code: String(highestExistingCode + idx + 1),
        track_in_inventory: true,
      }));
      setRows(blankRows);
    }
  }, [isOpen, highestExistingCode]);

  // Row-level validation map
  const rowValidations = useMemo(() => {
    const codeCounts = new Map<string, number>();
    const nameCounts = new Map<string, number>();

    rows.forEach((r) => {
      const hasContent =
        r.name.trim() !== '' ||
        r.buying_rate_rupees.trim() !== '' ||
        r.selling_rate_rupees.trim() !== '';
      if (!hasContent) return;

      const c = r.product_code.trim().toLowerCase();
      if (c) codeCounts.set(c, (codeCounts.get(c) || 0) + 1);

      const n = r.name.trim().toLowerCase();
      if (n) nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
    });

    return rows.map((r) => {
      const hasContent =
        r.name.trim() !== '' ||
        r.buying_rate_rupees.trim() !== '' ||
        r.selling_rate_rupees.trim() !== '';

      if (!hasContent) {
        return {
          isEmpty: true,
          duplicateCode: false,
          duplicateName: false,
          lowMarginWarning: false,
          missingRequired: false,
          errors: [] as string[],
          warnings: [] as string[],
        };
      }

      const errors: string[] = [];
      const warnings: string[] = [];

      const nameTrimmed = r.name.trim();
      const codeTrimmed = r.product_code.trim();
      const buyVal = parseFloat(r.buying_rate_rupees);
      const sellVal = parseFloat(r.selling_rate_rupees);

      const duplicateNameInSheet =
        nameTrimmed !== '' && (nameCounts.get(nameTrimmed.toLowerCase()) || 0) > 1;
      const duplicateNameInCat =
        nameTrimmed !== '' && existingNameSet.has(nameTrimmed.toLowerCase());
      const duplicateName = duplicateNameInSheet || duplicateNameInCat;

      if (!nameTrimmed) {
        errors.push('Missing Name');
      } else if (duplicateNameInSheet) {
        errors.push('Duplicate Name in sheet');
      } else if (duplicateNameInCat) {
        errors.push('Name already exists in catalogue');
      }

      const duplicateCodeInSheet =
        codeTrimmed !== '' && (codeCounts.get(codeTrimmed.toLowerCase()) || 0) > 1;
      const duplicateCodeInCat =
        codeTrimmed !== '' && existingCodeSet.has(codeTrimmed.toLowerCase());
      const duplicateCode = duplicateCodeInSheet || duplicateCodeInCat;

      if (!codeTrimmed) {
        errors.push('Missing Code');
      } else if (duplicateCodeInSheet) {
        errors.push('Duplicate Code in sheet');
      } else if (duplicateCodeInCat) {
        errors.push('Code already exists in catalogue');
      }

      if (isNaN(sellVal) || sellVal <= 0) {
        errors.push('Selling Rate must be > ₹0');
      }

      if (r.buying_rate_rupees.trim() !== '' && (isNaN(buyVal) || buyVal < 0)) {
        errors.push('Invalid Buying Rate');
      }

      const lowMarginWarning =
        !isNaN(sellVal) &&
        sellVal > 0 &&
        !isNaN(buyVal) &&
        buyVal > 0 &&
        sellVal <= buyVal;

      if (lowMarginWarning) {
        warnings.push(`Sell (₹${sellVal}) ≤ Buy (₹${buyVal})`);
      }

      return {
        isEmpty: false,
        duplicateCode,
        duplicateName,
        lowMarginWarning,
        missingRequired: !nameTrimmed || isNaN(sellVal) || sellVal <= 0,
        errors,
        warnings,
      };
    });
  }, [rows, existingCodeSet, existingNameSet]);

  if (!isOpen) return null;

  const updateCell = <K extends keyof BulkSheetRow>(
    rowIndex: number,
    key: K,
    value: BulkSheetRow[K]
  ) => {
    setRows((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], [key]: value };
      return next;
    });
  };

  const getNextFreeCodeFromRows = (currentRows: BulkSheetRow[]): number => {
    let maxCode = highestExistingCode;
    for (const r of currentRows) {
      const n = parseInt(r.product_code, 10);
      if (!isNaN(n) && n > maxCode) maxCode = n;
    }
    return maxCode + 1;
  };

  const addRow = (count = 1) => {
    setRows((prev) => {
      let nextCode = getNextFreeCodeFromRows(prev);
      const added: BulkSheetRow[] = [];
      for (let i = 0; i < count; i++) {
        added.push({
          name: '',
          category: prev[prev.length - 1]?.category || CATEGORIES[0] || 'Chicken',
          unit: prev[prev.length - 1]?.unit || 'kg',
          buying_rate_rupees: '',
          selling_rate_rupees: '',
          product_code: String(nextCode++),
          track_in_inventory: true,
        });
      }
      return [...prev, ...added];
    });
  };

  const removeRow = (index: number) => {
    setRows((prev) => {
      if (prev.length <= 1) {
        return [
          {
            name: '',
            category: CATEGORIES[0] || 'Chicken',
            unit: 'kg',
            buying_rate_rupees: '',
            selling_rate_rupees: '',
            product_code: String(highestExistingCode + 1),
            track_in_inventory: true,
          },
        ];
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>, rowIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (rowIndex === rows.length - 1) {
        addRow(1);
      }
    }
  };

  // Parse multi-line TSV/CSV text into BulkSheetRow[]
  const parseDelimitedTextToRows = (rawText: string) => {
    const lines = rawText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    const delimiter = lines[0].includes('\t') ? '\t' : ',';
    const parsedLines = lines.map((line) =>
      line.split(delimiter).map((c) => c.replace(/^"(.*)"$/, '$1').trim())
    );

    // Skip header row if detected
    let startIdx = 0;
    const firstJoined = parsedLines[0].join(' ').toLowerCase();
    if (
      firstJoined.includes('name') ||
      firstJoined.includes('category') ||
      firstJoined.includes('selling') ||
      firstJoined.includes('buying')
    ) {
      startIdx = 1;
    }

    const dataRows = parsedLines.slice(startIdx);
    if (dataRows.length === 0) return;

    let nextCode = highestExistingCode + 1;
    const imported: BulkSheetRow[] = dataRows.map((cols) => {
      // Expected columns: Name | Category | Unit | Buying Rate | Selling Rate | Code | Inventory Tracking
      const name = cols[0] || '';
      const category = cols[1] || CATEGORIES[0] || 'Chicken';
      const unit = normalizeUnit(cols[2] || 'kg');
      const buyingRate = (cols[3] || '').replace(/[^0-9.]/g, '');
      const sellingRate = (cols[4] || cols[3] || '').replace(/[^0-9.]/g, '');
      const explicitCode = (cols[5] || '').replace(/[^0-9A-Za-z-]/g, '');
      const code = explicitCode || String(nextCode++);
      const trackStr = (cols[6] || 'true').toLowerCase();
      const track = !['false', '0', 'no', 'off'].includes(trackStr);

      return {
        name,
        category,
        unit,
        buying_rate_rupees: cols.length >= 5 ? buyingRate : '',
        selling_rate_rupees: sellingRate,
        product_code: code,
        track_in_inventory: track,
      };
    });

    if (imported.length > 0) {
      setRows(imported);
      setError(null);
      setSaveSummary(null);
      setIsPasteBoxOpen(false);
      setPasteText('');
    }
  };

  const handleGridPaste = (e: ClipboardEvent<HTMLTableElement>) => {
    const text = e.clipboardData.getData('Text');
    if (!text || (!text.includes('\n') && !text.includes('\t'))) return;
    e.preventDefault();
    parseDelimitedTextToRows(text);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = String(ev.target?.result || '');
      parseDelimitedTextToRows(content);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDownloadTemplate = () => {
    const csvContent = [
      'Name,Category,Unit,Buying Rate (INR),Selling Rate (INR),Code,Inventory Tracking',
      'Chicken Curry Cut,Chicken,kg,180,240,,true',
      'Chicken Breast Boneless,Chicken,kg,240,320,,true',
      'Farm Fresh Eggs (30 Tray),Eggs,tray,150,190,,true',
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'bulk_products_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSaveAll = async () => {
    setError(null);
    setSaveSummary(null);

    const nonEmptyEntries = rows
      .map((row, idx) => ({ row, idx, validation: rowValidations[idx] }))
      .filter((item) => !item.validation.isEmpty);

    if (nonEmptyEntries.length === 0) {
      setError('Please enter at least one product row before saving.');
      return;
    }

    const clientFailedRows: Array<{ rowIndex: number; rowName?: string; messages: string[] }> = [];
    const validPayloadRows: Array<any> = [];
    const validOriginalIndices: number[] = [];

    nonEmptyEntries.forEach(({ row, idx, validation }) => {
      if (validation.errors.length > 0) {
        clientFailedRows.push({
          rowIndex: idx + 1,
          rowName: row.name || `Row #${idx + 1}`,
          messages: validation.errors,
        });
      } else {
        const unitType: 'weight' | 'piece' = ['pcs', 'tray', 'pack'].includes(row.unit)
          ? 'piece'
          : 'weight';
        validPayloadRows.push({
          name: row.name.trim(),
          category: row.category.trim() || 'Chicken',
          unit: row.unit,
          unit_type: unitType,
          buying_rate_rupees: parseFloat(row.buying_rate_rupees || '0') || 0,
          cost_price_rupees: parseFloat(row.buying_rate_rupees || '0') || 0,
          selling_rate_rupees: parseFloat(row.selling_rate_rupees || '0') || 0,
          price_rupees: parseFloat(row.selling_rate_rupees || '0') || 0,
          product_code: row.product_code.trim(),
          track_in_inventory: row.track_in_inventory,
        });
        validOriginalIndices.push(idx + 1);
      }
    });

    if (validPayloadRows.length === 0) {
      setSaveSummary({
        createdCount: 0,
        updatedCount: 0,
        errorRows: clientFailedRows,
      });
      return;
    }

    setIsSaving(true);
    try {
      const res = await window.api.invoke(IPC_CHANNELS.INVENTORY.BULK_IMPORT_PRODUCTS, {
        rows: validPayloadRows,
      });
      if (!res?.success) {
        throw new Error(res?.error?.message || 'Failed to save bulk products');
      }

      const backendResult = res.data || { createdCount: 0, updatedCount: 0, errorRows: [] };
      const mappedBackendErrors = (backendResult.errorRows || []).map((er: any) => ({
        rowIndex: validOriginalIndices[er.rowIndex] || er.rowIndex + 1,
        rowName: validPayloadRows[er.rowIndex]?.name || `Row #${er.rowIndex + 1}`,
        messages: er.messages || ['Failed validation'],
      }));

      const combinedErrors = [...clientFailedRows, ...mappedBackendErrors];
      setSaveSummary({
        createdCount: Number(backendResult.createdCount || 0),
        updatedCount: Number(backendResult.updatedCount || 0),
        errorRows: combinedErrors,
      });

      await queryClient.invalidateQueries({ queryKey: ['adminProducts'] });
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err?.message || 'An unexpected error occurred while saving products');
    } finally {
      setIsSaving(false);
    }
  };

  const filledCount = rowValidations.filter((v) => !v.isEmpty).length;
  const errorCount = rowValidations.filter((v) => !v.isEmpty && v.errors.length > 0).length;
  const lowMarginCount = rowValidations.filter((v) => !v.isEmpty && v.lowMarginWarning).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-surface-card border border-border-subtle rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-border-subtle bg-surface-app shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-500/15 border border-brand-500/30 flex items-center justify-center text-brand-400">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-text-primary">
                Bulk Add Products (Spreadsheet Entry)
              </h2>
              <p className="text-xs text-text-muted">
                Starts empty • Auto-suggests next free numeric code • Checks duplicates & low/zero margins
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-hover cursor-pointer self-end sm:self-auto"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar Actions: + Add Row, Paste from Excel, Import CSV, Download CSV Template */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-border-subtle bg-surface-card shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => addRow(1)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-extrabold cursor-pointer shadow-xs transition-colors"
            >
              <Plus size={14} />
              <span>+ Add Row</span>
            </button>

            <button
              type="button"
              onClick={() => setIsPasteBoxOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-app hover:bg-surface-hover border border-border-subtle text-xs font-extrabold text-text-primary cursor-pointer transition-colors"
            >
              <ClipboardPaste size={14} className="text-purple-400" />
              <span>Paste from Excel</span>
            </button>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-app hover:bg-surface-hover border border-border-subtle text-xs font-extrabold text-text-primary cursor-pointer transition-colors"
            >
              <Upload size={14} className="text-blue-400" />
              <span>Import CSV</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />

            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-surface-app hover:bg-surface-hover border border-border-subtle text-xs font-extrabold text-text-primary cursor-pointer transition-colors"
            >
              <Download size={14} className="text-emerald-400" />
              <span>Download CSV Template</span>
            </button>
          </div>

          {/* Live Validation Counters */}
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="px-2.5 py-1 rounded-lg bg-surface-app border border-border-subtle text-text-secondary">
              Filled Rows: <strong className="text-text-primary">{filledCount}</strong>
            </span>
            {errorCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400">
                Duplicate / Errors: <strong>{errorCount}</strong>
              </span>
            )}
            {lowMarginCount > 0 && (
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300">
                ⚠️ Sell ≤ Buy: <strong>{lowMarginCount}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Optional Paste from Excel Drawer */}
        {isPasteBoxOpen && (
          <div className="px-5 py-3 bg-surface-app border-b border-border-subtle space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-text-primary">
                Paste multi-line rows from Excel / Google Sheets (Columns: Name, Category, Unit, Buying Rate, Selling Rate, Code)
              </span>
              <button
                type="button"
                onClick={() => setIsPasteBoxOpen(false)}
                className="text-xs text-text-muted hover:text-text-primary cursor-pointer"
              >
                Close
              </button>
            </div>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={4}
              placeholder="Paste tab-separated (Excel) or comma-separated lines here..."
              className="w-full p-2.5 rounded-xl bg-surface-card border border-border-subtle text-xs font-mono text-text-primary outline-none focus:border-brand-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => parseDelimitedTextToRows(pasteText)}
                className="px-3.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-xs font-extrabold cursor-pointer"
              >
                Apply Pasted Rows to Grid
              </button>
            </div>
          </div>
        )}

        {/* Save Result Summary Banner */}
        {saveSummary && (
          <div className="px-5 py-3 bg-surface-app border-b border-border-subtle space-y-2 shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-extrabold">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <span className="text-emerald-400">
                  Created {saveSummary.createdCount} product{saveSummary.createdCount === 1 ? '' : 's'}
                </span>
                <span className="text-text-muted">•</span>
                <span
                  className={
                    saveSummary.errorRows.length > 0 ? 'text-rose-400' : 'text-text-secondary'
                  }
                >
                  Failed {saveSummary.errorRows.length} row{saveSummary.errorRows.length === 1 ? '' : 's'}
                </span>
              </div>
              {saveSummary.errorRows.length === 0 && saveSummary.createdCount > 0 && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                >
                  Done & Close
                </button>
              )}
            </div>

            {saveSummary.errorRows.length > 0 && (
              <div className="max-h-28 overflow-y-auto space-y-1 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5 text-xs text-rose-300">
                {saveSummary.errorRows.map((er, i) => (
                  <div key={i} className="font-semibold">
                    • Row #{er.rowIndex} ({er.rowName || 'Unnamed'}): {er.messages.join(', ')}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-bold text-rose-400 flex items-center gap-2 shrink-0">
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        )}

        {/* Spreadsheet Grid */}
        <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-5">
          <div className="border border-border-subtle rounded-2xl overflow-hidden">
            <table className="w-full border-collapse text-left text-xs" onPaste={handleGridPaste}>
              <thead className="bg-surface-app border-b border-border-subtle text-[11px] font-black uppercase tracking-wider text-text-secondary sticky top-0 z-10">
                <tr>
                  <th className="p-2.5 w-10 text-center">#</th>
                  <th className="p-2.5 min-w-[200px]">Name *</th>
                  <th className="p-2.5 w-40">Category</th>
                  <th className="p-2.5 w-28">Unit</th>
                  <th className="p-2.5 w-36 text-right">Buying Rate (₹)</th>
                  <th className="p-2.5 w-36 text-right">Selling Rate (₹) *</th>
                  <th className="p-2.5 w-28">Code</th>
                  <th className="p-2.5 w-36 text-center">Inventory Tracking</th>
                  <th className="p-2.5 min-w-[160px]">Validation</th>
                  <th className="p-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/60">
                {rows.map((row, idx) => {
                  const v = rowValidations[idx];
                  const hasDupError = !v.isEmpty && (v.duplicateCode || v.duplicateName);
                  const hasLowMargin = !v.isEmpty && v.lowMarginWarning;

                  return (
                    <tr
                      key={idx}
                      className={`transition-colors ${
                        hasDupError || (!v.isEmpty && v.errors.length > 0)
                          ? 'bg-rose-500/10'
                          : hasLowMargin
                          ? 'bg-amber-500/10'
                          : 'hover:bg-surface-hover/40'
                      }`}
                    >
                      <td className="p-2 text-center font-mono font-bold text-text-muted">
                        {idx + 1}
                      </td>

                      {/* Name */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateCell(idx, 'name', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, idx)}
                          placeholder="e.g. Chicken Curry Cut"
                          className={`w-full px-2.5 py-1.5 rounded-lg bg-surface-app border text-xs font-bold text-text-primary outline-none ${
                            v.duplicateName
                              ? 'border-rose-500 text-rose-300'
                              : 'border-border-subtle focus:border-brand-500'
                          }`}
                        />
                      </td>

                      {/* Category */}
                      <td className="p-2">
                        <select
                          value={row.category}
                          onChange={(e) => updateCell(idx, 'category', e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface-app border border-border-subtle text-xs font-bold text-text-primary outline-none focus:border-brand-500"
                        >
                          {CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Unit (kg, g, pcs, tray, pack) */}
                      <td className="p-2">
                        <select
                          value={row.unit}
                          onChange={(e) =>
                            updateCell(idx, 'unit', e.target.value as StandardUnitOption)
                          }
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface-app border border-border-subtle text-xs font-mono font-bold text-text-primary outline-none focus:border-brand-500"
                        >
                          {STANDARD_UNITS.map((u) => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Buying Rate (₹) */}
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.buying_rate_rupees}
                          onChange={(e) => updateCell(idx, 'buying_rate_rupees', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, idx)}
                          placeholder="0.00"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface-app border border-border-subtle text-xs font-mono font-bold text-right text-text-primary outline-none focus:border-brand-500"
                        />
                      </td>

                      {/* Selling Rate (₹) */}
                      <td className="p-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.selling_rate_rupees}
                          onChange={(e) => updateCell(idx, 'selling_rate_rupees', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, idx)}
                          placeholder="0.00"
                          className={`w-full px-2.5 py-1.5 rounded-lg bg-surface-app border text-xs font-mono font-black text-right outline-none ${
                            hasLowMargin
                              ? 'border-amber-500 text-amber-300'
                              : 'border-border-subtle text-emerald-400 focus:border-brand-500'
                          }`}
                        />
                      </td>

                      {/* Code (Auto-suggested numeric code) */}
                      <td className="p-2">
                        <input
                          type="text"
                          value={row.product_code}
                          onChange={(e) => updateCell(idx, 'product_code', e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, idx)}
                          className={`w-full px-2.5 py-1.5 rounded-lg bg-surface-app border text-xs font-mono font-bold text-center outline-none ${
                            v.duplicateCode
                              ? 'border-rose-500 text-rose-300'
                              : 'border-border-subtle text-brand-400 focus:border-brand-500'
                          }`}
                        />
                      </td>

                      {/* Inventory Tracking Toggle */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() =>
                            updateCell(idx, 'track_in_inventory', !row.track_in_inventory)
                          }
                          className={`px-3 py-1 rounded-full text-[11px] font-extrabold border transition-colors cursor-pointer ${
                            row.track_in_inventory
                              ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                              : 'bg-surface-app text-text-muted border-border-subtle'
                          }`}
                        >
                          {row.track_in_inventory ? 'ON' : 'OFF'}
                        </button>
                      </td>

                      {/* Row Validation Status */}
                      <td className="p-2">
                        {v.isEmpty ? (
                          <span className="text-[11px] text-text-muted italic">Empty row</span>
                        ) : v.errors.length > 0 ? (
                          <div className="flex flex-col gap-0.5">
                            {v.errors.map((errStr, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 text-[11px] font-extrabold text-rose-400"
                              >
                                <AlertTriangle size={11} /> {errStr}
                              </span>
                            ))}
                          </div>
                        ) : v.lowMarginWarning ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-extrabold">
                            <AlertTriangle size={11} /> Sell ≤ Buy ({v.warnings[0]})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-400">
                            <CheckCircle2 size={12} /> Ready
                          </span>
                        )}
                      </td>

                      {/* Remove Row */}
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="p-1.5 rounded-lg text-text-muted hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                          title="Remove row"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer with Save All */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-border-subtle bg-surface-app shrink-0">
          <div className="text-xs text-text-muted">
            Tip: Press <kbd className="px-1.5 py-0.5 rounded bg-surface-card border border-border-subtle font-mono">Enter</kbd> on the last row to add a new row, or paste directly from Excel.
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-surface-card hover:bg-surface-hover border border-border-subtle text-xs font-bold text-text-secondary cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving || filledCount === 0}
              onClick={handleSaveAll}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-black cursor-pointer shadow-md transition-all"
            >
              {isSaving ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Saving Products...</span>
                </>
              ) : (
                <>
                  <Save size={14} />
                  <span>Save All ({filledCount})</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
