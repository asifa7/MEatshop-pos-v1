export interface AdminVariantRateHistory {
  id: number;
  product_id?: number;
  variant_id?: number;
  old_rate_paise_per_unit?: number;
  rate_paise_per_unit: number;
  effective_from: string;
  set_by: number;
  set_by_name?: string;
}

export interface AdminProductVariant {
  id: number;
  product_id: number;
  variant_name: string;
  current_rate_paise_per_unit: number;
  cost_price_paise_per_unit?: number;
  buying_rate_paise?: number;
  last_purchase_cost_paise?: number;
  barcode?: string | null;
  effective_from: string;
  is_active: number;
  track_in_inventory?: number;
  rateHistory: AdminVariantRateHistory[];
  hasInvoiceHistory: boolean;
  parent_variant_id?: number | null;
  yield_ratio?: number | null;
}

export interface AdminProduct {
  id: number;
  product_code: string;
  name: string;
  unit_type: 'weight' | 'piece' | 'live_dual' | string;
  category: string;
  type: string; // e.g. "Unprocessed", "Processed", etc.
  is_active: number;
  is_processed_cut?: number;
  stock_classification?: 'live_yield' | 'refrigerator_direct' | string;
  track_in_inventory?: number;
  current_rate_paise_per_unit: number;
  cost_price_paise_per_unit?: number;
  buying_rate_paise?: number;
  last_purchase_cost_paise?: number;
  created_at: string;
  updated_at: string;
  stock_mode?: 'OWN' | 'LINKED' | 'NONE';
  parent_product_id?: number | null;
  link_mode?: 'YIELD' | 'PACK' | null;
  yield_g_per_kg?: number | null;
  parent_units_per_sale_unit?: number | null;
  variants: AdminProductVariant[];
  hasInvoiceHistory: boolean;
  hasSalesHistory?: boolean;
  rateHistory: AdminVariantRateHistory[];
}

export const FIXED_CATEGORIES = ['Chicken', 'Mutton', 'Seafood', 'Eggs'] as const;
export type ProductCategory = string;

