import { z } from 'zod';

export const CreateSupplierProfileSchema = z.object({
  company_name: z.string().min(1, 'Company name is required'),
  owner_name: z.string().nullish(),
  gstin: z.string().nullish(),
  pan: z.string().nullish(),
  phone: z.string().nullish(),
  whatsapp: z.string().nullish(),
  email: z.string().nullish(),
  category_id: z.number().int().positive().nullish(),
  is_preferred: z.union([z.boolean(), z.number().int()]).transform(val => typeof val === 'boolean' ? (val ? 1 : 0) : val).optional(),
  credit_limit_paise: z.number().int().min(0).optional(),
  opening_balance_paise: z.number().int().optional(),
  opening_balance_date: z.string().nullish(),
  preferred_payment_method: z.string().nullish(),
  notes: z.string().nullish(),
  tags: z.string().nullish(),
});

export const UpdateSupplierProfileSchema = CreateSupplierProfileSchema.partial();

export const CreatePurchaseOrderSchema = z.object({
  supplier_id: z.number().int().positive('Supplier ID is required'),
  order_date: z.string().min(1, 'Order date is required'),
  expected_delivery_date: z.string().nullish(),
  notes: z.string().nullish(),
  items: z.array(
    z.object({
      product_variant_id: z.number().int().positive('Product variant ID is required'),
      quantity_ordered: z.number().int().positive('Quantity must be greater than zero'),
      unit_type: z.enum(['weight', 'piece']),
      unit_price_paise: z.number().int().nonnegative('Unit price must be non-negative'),
    })
  ).min(1, 'Purchase order must have at least one item'),
});

export const GoodsReceiptSchema = z.object({
  purchase_order_id: z.number().int().positive().nullish(),
  supplier_id: z.number().int().positive('Supplier ID is required'),
  delivery_note_number: z.string().nullish(),
  received_date: z.string().min(1, 'Received date is required'),
  notes: z.string().nullish(),
  items: z.array(
    z.object({
      purchase_order_item_id: z.number().int().positive().nullish(),
      product_variant_id: z.number().int().positive('Product variant ID is required'),
      quantity_accepted: z.number().int().nonnegative('Quantity accepted must be non-negative'),
      quantity_rejected: z.number().int().nonnegative().optional(),
      rejection_reason: z.string().nullish(),
      batch_number: z.string().nullish(),
      expiry_date: z.string().nullish(),
    })
  ).min(1, 'Goods receipt must have at least one item'),
});

export const PurchaseInvoiceSchema = z.object({
  supplier_invoice_number: z.string().min(1, 'Supplier invoice number is required'),
  purchase_order_id: z.number().int().positive().nullish(),
  goods_receipt_id: z.number().int().positive().nullish(),
  supplier_id: z.number().int().positive('Supplier ID is required'),
  invoice_date: z.string().min(1, 'Invoice date is required'),
  subtotal_paise: z.number().int().nonnegative(),
  gst_paise: z.number().int().nonnegative().optional(),
  cgst_paise: z.number().int().nonnegative().optional(),
  sgst_paise: z.number().int().nonnegative().optional(),
  igst_paise: z.number().int().nonnegative().optional(),
  freight_charges_paise: z.number().int().nonnegative().optional(),
  loading_charges_paise: z.number().int().nonnegative().optional(),
  packing_charges_paise: z.number().int().nonnegative().optional(),
  other_charges_paise: z.number().int().nonnegative().optional(),
  discount_paise: z.number().int().nonnegative().optional(),
  round_off_paise: z.number().int().optional(),
  total_amount_paise: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      product_variant_id: z.number().int().positive('Product variant ID is required'),
      quantity: z.number().int().positive('Quantity must be greater than zero'),
      unit_price_paise: z.number().int().nonnegative(),
      gst_rate_bps: z.number().int().nonnegative().optional(),
      gst_amount_paise: z.number().int().nonnegative().optional(),
      total_amount_paise: z.number().int().nonnegative(),
    })
  ).min(1, 'Invoice must have at least one item'),
});

export const PurchaseReturnSchema = z.object({
  purchase_invoice_id: z.number().int().positive().nullish(),
  supplier_id: z.number().int().positive('Supplier ID is required'),
  return_date: z.string().min(1, 'Return date is required'),
  reason: z.string().nullish(),
  total_refund_amount_paise: z.number().int().nonnegative(),
  resolved_via: z.enum(['refund', 'replacement', 'debit_note']),
  items: z.array(
    z.object({
      product_variant_id: z.number().int().positive('Product variant ID is required'),
      quantity: z.number().int().positive('Quantity must be greater than zero'),
      unit_price_paise: z.number().int().nonnegative(),
      gst_amount_paise: z.number().int().nonnegative().optional(),
      total_amount_paise: z.number().int().nonnegative(),
    })
  ).min(1, 'Purchase return must have at least one item'),
});

export const SupplierPaymentSchema = z.object({
  supplier_id: z.number().int().positive('Supplier ID is required'),
  amount_paise: z.number().int().positive('Amount must be positive'),
  payment_method: z.enum(['cash', 'upi', 'card', 'cheque', 'bank_transfer']),
  reference_number: z.string().nullish(),
  cheque_number: z.string().nullish(),
  cheque_date: z.string().nullish(),
  bank_name: z.string().nullish(),
  payment_date: z.string().min(1, 'Payment date is required'),
  notes: z.string().nullish(),
  is_advance: z.union([z.boolean(), z.number().int()]).transform(val => typeof val === 'boolean' ? (val ? 1 : 0) : val).optional(),
});

export const QuickPurchaseSchema = z.object({
  supplier_id: z.number().int().positive(),
  received_date: z.string().min(1, 'Received date is required'),
  bill_amount_paise: z.number().int().nonnegative(),
  bill_photo_path: z.string().nullish(),
  bill_number: z.string().nullish(),
  supplier_invoice_number: z.string().nullish(),
  notes: z.string().nullish(),
  payment_method: z.enum(['cash', 'upi', 'card', 'credit', 'partial']).default('credit'),
  paid_amount_paise: z.number().int().nonnegative().default(0),
  expected_payment_date: z.string().nullish(),
  discount_paise: z.number().int().nonnegative().default(0),
  tax_paise: z.number().int().nonnegative().default(0),
  freight_charges_paise: z.number().int().nonnegative().default(0),
  other_charges_paise: z.number().int().nonnegative().default(0),
  is_draft: z.boolean().default(false),
  items: z.array(z.object({
    product_variant_id: z.number().int().positive(),
    quantity: z.number().positive(),
    count: z.number().positive().optional(),
    unit_type: z.enum(['weight', 'piece', 'live_dual']),
    unit_price_paise: z.number().int().nonnegative(),
    subtotal_paise: z.number().int().nonnegative(),
  })).min(1, 'At least one item is required'),
});

export type CreateSupplierProfileInput = z.infer<typeof CreateSupplierProfileSchema>;
export type UpdateSupplierProfileInput = z.infer<typeof UpdateSupplierProfileSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderSchema>;
export type GoodsReceiptInput = z.infer<typeof GoodsReceiptSchema>;
export type PurchaseInvoiceInput = z.infer<typeof PurchaseInvoiceSchema>;
export type PurchaseReturnInput = z.infer<typeof PurchaseReturnSchema>;
export type SupplierPaymentInput = z.infer<typeof SupplierPaymentSchema>;
export type QuickPurchaseInput = z.infer<typeof QuickPurchaseSchema>;
