export interface StockStatus {
  id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  quantity_count?: number | null;
  safety_threshold_grams: number | null;
  safety_threshold_units: number | null;
  safety_threshold_count?: number | null;
  updated_at: string;
  variant_name: string;
  product_name: string;
  product_code: string;
  category: string;
  unit_type: 'weight' | 'piece' | 'live_dual';
  is_processed_cut?: number;
  parent_variant_id?: number | null;
  cost_price_paise_per_unit?: number;
  current_rate_paise_per_unit?: number;
  last_purchase_cost?: number;
  weighted_average_cost?: number;
  latest_purchase_rate_paise?: number | null;
  previous_purchase_rate_paise?: number | null;
  track_in_inventory?: number;
  is_inventory_tracked?: number;
  stock_mode?: 'OWN' | 'LINKED' | 'NONE' | string;
}

export interface StockTransaction {
  id: number;
  product_variant_id: number;
  transaction_type: 'sale_deduction' | 'sale_reversal' | 'manual_adjustment';
  quantity_grams: number | null;
  quantity_units: number | null;
  reference_id: number;
  created_at: string;
  variant_name: string;
  product_name: string;
  product_code: string;
  unit_type: 'weight' | 'piece';
}

export interface StockAdjustment {
  id: number;
  product_variant_id: number;
  adjustment_type: 'stock_in' | 'stock_out' | 'wastage' | 'damage';
  quantity_grams: number | null;
  quantity_units: number | null;
  reason: string;
  adjusted_by: number;
  created_at: string;
  variant_name: string;
  product_name: string;
  product_code: string;
  unit_type: 'weight' | 'piece';
  adjusted_by_username: string;
}

export interface Supplier {
  id: number;
  code: string;
  name: string;
  contact: string | null;
  created_at: string;
  updated_at: string;
}

export interface Purchase {
  id: number;
  supplier_id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  cost_paise: number;
  created_by: number;
  created_at: string;
  supplier_name: string;
  variant_name: string;
  product_name: string;
  created_by_username: string;
}
