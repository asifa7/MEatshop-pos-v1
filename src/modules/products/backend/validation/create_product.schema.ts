import { z } from 'zod';

export const PRODUCT_CATEGORIES = ['Chicken', 'Mutton', 'Seafood', 'Eggs'] as const;
export type ProductCategory = string;

export const createProductSchema = z.object({
  name: z.string().min(1, 'Product name is required').max(120),
  category: z.string().min(1, 'Category is required'),
  unit_type: z.enum(['weight', 'piece', 'live_dual'], {
    errorMap: () => ({ message: 'Unit type must be weight, piece, or live_dual' }),
  }),
  product_code: z.string().min(1).max(50).optional(),
  type: z.string().optional(),
  is_processed_cut: z.number().int().min(0).max(1).optional().default(0),
  rate_paise: z.number().int().positive('Selling rate must be greater than 0'),
  cost_price_paise: z.number().int().nonnegative().optional().default(0),
  track_in_inventory: z.number().int().min(0).max(1).optional().default(1),
  stock_mode: z.enum(['OWN', 'LINKED', 'NONE']).optional().default('OWN'),
  parent_product_id: z.number().int().positive().nullable().optional(),
  link_mode: z.enum(['YIELD', 'PACK']).nullable().optional(),
  yield_g_per_kg: z.number().int().positive().nullable().optional(),
  parent_units_per_sale_unit: z.number().int().positive().nullable().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  category: z.string().min(1).optional(),
  unit_type: z.enum(['weight', 'piece', 'live_dual']).optional(),
  product_code: z.string().min(1).max(50).optional(),
  type: z.string().optional(),
  is_processed_cut: z.number().int().min(0).max(1).optional(),
  rate_paise: z.number().int().positive('Selling rate must be greater than 0').optional(),
  cost_price_paise: z.number().int().nonnegative().optional(),
  track_in_inventory: z.number().int().min(0).max(1).optional(),
  stock_mode: z.enum(['OWN', 'LINKED', 'NONE']).optional(),
  parent_product_id: z.number().int().positive().nullable().optional(),
  link_mode: z.enum(['YIELD', 'PACK']).nullable().optional(),
  yield_g_per_kg: z.number().int().positive().nullable().optional(),
  parent_units_per_sale_unit: z.number().int().positive().nullable().optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
