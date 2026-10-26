/**
 * Pure math calculations library for billing rates, subtotals, and taxes.
 * Enforces strict round-half-up rounding rules.
 */

export function calculateLineAmount(
  unitType: 'weight' | 'piece' | 'live_dual',
  quantityGrams: number | null,
  quantityUnits: number | null,
  ratePaiseSnapshot: number
): number {
  if ((unitType === 'weight' || unitType === 'live_dual') && quantityGrams !== null) {
    // Round half up: standard Math.round handles positive numbers
    return Math.round((quantityGrams * ratePaiseSnapshot) / 1000);
  }
  if (unitType === 'piece' && quantityUnits !== null) {
    return quantityUnits * ratePaiseSnapshot;
  }
  return 0;
}

export function calculateLineTax(
  lineSubtotalPaise: number,
  gstRateBpsSnapshot: number | null
): {
  lineTaxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
} {
  if (gstRateBpsSnapshot === null || gstRateBpsSnapshot === 0) {
    return { lineTaxPaise: 0, cgstPaise: 0, sgstPaise: 0 };
  }
  const lineTaxPaise = Math.round((lineSubtotalPaise * gstRateBpsSnapshot) / 10000);
  const cgstPaise = Math.round(lineTaxPaise / 2);
  const sgstPaise = lineTaxPaise - cgstPaise;
  return { lineTaxPaise, cgstPaise, sgstPaise };
}

/**
 * General round half up utility for numbers (weights, quantities, amounts).
 */
export function roundHalfUp(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value));
}

/**
 * Converts kg (float) to integer grams using round-half-up.
 */
export function kgToGrams(kg: number): number {
  return roundHalfUp(kg * 1000);
}

/**
 * Converts a float rupee value to integer paise using round-half-up.
 * Use this at every form boundary where users enter rupee amounts.
 * Never do inline multiplication by 100 — always call this shared function.
 */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || Math.abs(rupees) < 1e-9) return 0;
  const rounded = roundHalfUp(rupees * 100);
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Converts integer paise to rupees rounded to 2 decimal places.
 */
export function paiseToRupees(paise: number): number {
  if (!Number.isFinite(paise) || Math.abs(paise) < 1e-9) return 0;
  return roundMoney(paise / 100);
}

/**
 * Converts integer grams to kg rounded to max 3 decimal places.
 */
export function gramsToKg(grams: number): number {
  if (!Number.isFinite(grams) || Math.abs(grams) < 1e-9) return 0;
  return roundQty(grams / 1000);
}

/**
 * Rounds any weight/quantity float to at most 3 decimal places (or specified precision)
 * and eliminates -0.0 / IEEE-754 floating-point noise (e.g. 127.58999999999999 -> 127.59).
 */
export function roundQty(value: number | string | null | undefined, decimals = 3): number {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
  if (!Number.isFinite(num) || Math.abs(num) < 1e-6) return 0;
  const factor = Math.pow(10, decimals);
  const rounded = roundHalfUp(num * factor) / factor;
  return Object.is(rounded, -0) || Math.abs(rounded) < 1e-6 ? 0 : rounded;
}

/**
 * Rounds a rupee/monetary value to 2 decimal places and eliminates -0.0.
 */
export function roundMoney(value: number | string | null | undefined): number {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
  if (!Number.isFinite(num) || Math.abs(num) < 1e-4) return 0;
  const rounded = roundHalfUp(num * 100) / 100;
  return Object.is(rounded, -0) || Math.abs(rounded) < 1e-4 ? 0 : rounded;
}

/**
 * Formats a weight or quantity for display with at most 3 decimals (stripping trailing zeros by default
 * or keeping fixed decimals if requested) and never displaying "-0" or "-0.0" or raw floats.
 */
export function formatQty(
  value: number | string | null | undefined,
  options?: {
    unit?: string;
    decimals?: number;
    maxDecimals?: number;
    minDecimals?: number;
    fromGrams?: boolean;
  }
): string {
  const raw = typeof value === 'string' ? parseFloat(value) : Number(value ?? 0);
  if (!Number.isFinite(raw)) return options?.unit ? `0 ${options.unit}` : '0';
  const scaled = options?.fromGrams ? raw / 1000 : raw;
  const maxDec = options?.decimals ?? options?.maxDecimals ?? 3;
  const cleaned = roundQty(scaled, maxDec);
  const minDec = options?.minDecimals ?? 0;

  let formatted: string;
  if (minDec > 0) {
    formatted = cleaned.toFixed(maxDec);
    // Trim trailing zeros down to minDec
    if (maxDec > minDec && formatted.includes('.')) {
      while (formatted.endsWith('0') && formatted.split('.')[1].length > minDec) {
        formatted = formatted.slice(0, -1);
      }
      if (formatted.endsWith('.')) formatted = formatted.slice(0, -1);
    }
  } else {
    formatted = Number(cleaned.toFixed(maxDec)).toString();
  }

  if (formatted === '-0' || formatted === '-0.0' || formatted === '-0.00' || formatted === '-0.000') {
    formatted = (0).toFixed(minDec);
  }

  return options?.unit ? `${formatted} ${options.unit}` : formatted;
}

/**
 * Formats a monetary value (from integer paise by default, or from rupees if isRupees=true)
 * into clean Indian Rupee formatting (e.g. "₹1,250.00") with zero float artifacts.
 */
export function formatMoney(
  amount: number | string | null | undefined,
  options?: {
    isRupees?: boolean;
    inPaise?: boolean;
    showSymbol?: boolean;
    symbol?: string;
    decimals?: number;
  }
): string {
  const raw = typeof amount === 'string' ? parseFloat(amount) : Number(amount ?? 0);
  const isRupees = options?.isRupees ?? (options?.inPaise !== undefined ? !options.inPaise : false);
  const rupees = Number.isFinite(raw) ? (isRupees ? roundMoney(raw) : roundMoney(raw / 100)) : 0;
  const safeRupees = Object.is(rupees, -0) || Math.abs(rupees) < 1e-4 ? 0 : rupees;
  const dec = options?.decimals ?? 2;
  const sym = options?.showSymbol === false ? '' : (options?.symbol ?? '₹');
  const isNeg = safeRupees < 0;
  const absFormatted = Math.abs(safeRupees).toLocaleString('en-IN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
  return isNeg ? `-${sym}${absFormatted}` : `${sym}${absFormatted}`;
}

export interface EggTraysInfo {
  trays: number;
  remainingPieces: number;
  totalPieces: number;
  display: string;
}

/**
 * Calculates egg trays as integer floor(units / 30) trays + (units % 30) eggs.
 * Guaranteed to never return or display "-0.0".
 */
export function unitsToTraysAndPieces(units: number | null | undefined): EggTraysInfo {
  const safeUnits = Math.max(0, Math.round(Number(units ?? 0)));
  const trays = Math.floor(safeUnits / 30);
  const remainingPieces = safeUnits % 30;
  let display = `${safeUnits} pcs`;
  if (trays > 0) {
    display += ` (${trays} tray${trays > 1 ? 's' : ''}${remainingPieces > 0 ? `, ${remainingPieces} pcs` : ''})`;
  } else {
    display += ` (0 trays)`;
  }
  return { trays, remainingPieces, totalPieces: safeUnits, display };
}

export type StockStatusType = 'OUT_OF_STOCK' | 'CRITICAL' | 'LOW' | 'NORMAL' | 'OVERSTOCKED';

export interface StockStatusInfo {
  status: StockStatusType;
  label: string;
  badgeClass: string;
  color: string;
  isPurchasingAlert: boolean;
}

/**
 * Single source of truth for product stock status.
 * Used identically across the Stock Table, Purchasing Reminders, and Product Tiles.
 */
export function getStockStatus(
  currentQty: number,
  safetyThreshold: number,
  maxThreshold?: number | null
): StockStatusInfo {
  const current = roundQty(currentQty, 3);
  const threshold = roundQty(safetyThreshold, 3);

  if (current <= 0) {
    return {
      status: 'OUT_OF_STOCK',
      label: 'Out of Stock',
      badgeClass: 'bg-red-600 text-white',
      color: '#dc2626',
      isPurchasingAlert: true,
    };
  }
  const criticalLimit = Math.max(0.001, threshold * 0.5);
  if (current <= criticalLimit) {
    return {
      status: 'CRITICAL',
      label: 'Critical Low',
      badgeClass: 'bg-red-500 text-white',
      color: '#ef4444',
      isPurchasingAlert: true,
    };
  }
  if (current <= threshold) {
    return {
      status: 'LOW',
      label: 'Low Stock',
      badgeClass: 'bg-amber-500 text-white',
      color: '#f59e0b',
      isPurchasingAlert: true,
    };
  }
  if (maxThreshold && maxThreshold > 0 && current > maxThreshold) {
    return {
      status: 'OVERSTOCKED',
      label: 'Overstocked',
      badgeClass: 'bg-blue-500 text-white',
      color: '#3b82f6',
      isPurchasingAlert: false,
    };
  }
  return {
    status: 'NORMAL',
    label: 'Adequate',
    badgeClass: 'bg-emerald-500 text-white',
    color: '#10b981',
    isPurchasingAlert: false,
  };
}

