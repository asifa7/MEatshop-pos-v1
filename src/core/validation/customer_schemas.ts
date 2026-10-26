import { z } from 'zod';

const optionalField = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((val) => (val === '' ? null : val), schema.nullish());

export const CreateCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required').max(200),
  business_name: optionalField(z.string().max(200)),
  gstin: optionalField(
    z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format (e.g. 22AAAAA0000A1Z5)')
  ),
  pan: optionalField(
    z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format (e.g. ABCDE1234F)')
  ),
  phone: optionalField(
    z.string().min(10, 'Phone number must be at least 10 digits').max(15)
  ),
  phone2: optionalField(
    z.string().min(10, 'Phone number must be at least 10 digits').max(15)
  ),
  whatsapp: optionalField(
    z.string().min(10, 'WhatsApp number must be at least 10 digits').max(15)
  ),
  email: optionalField(
    z.string().email('Invalid email address format')
  ),
  billing_address_line1: optionalField(z.string().max(300)),
  billing_address_line2: optionalField(z.string().max(300)),
  billing_city: optionalField(z.string().max(100)),
  billing_state: optionalField(z.string().max(100)),
  billing_pincode: optionalField(z.string().max(10)),
  shipping_address_line1: optionalField(z.string().max(300)),
  shipping_address_line2: optionalField(z.string().max(300)),
  shipping_city: optionalField(z.string().max(100)),
  shipping_state: optionalField(z.string().max(100)),
  shipping_pincode: optionalField(z.string().max(10)),
  delivery_notes: optionalField(z.string().max(500)),
  group_id: z.number().int().positive().nullable().optional(),
  category: z.enum(['Hotel', 'Restaurant', 'Retail', 'Wholesale', 'Catering', 'Distributor', 'Contract']).default('Retail'),
  status: z.enum(['active', 'inactive', 'blocked', 'merged']).default('active'),
  credit_allowed: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)).default(false),
  allow_face_recognition: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)).default(false),
  credit_limit_paise: z.number().int().min(0).default(0),
  opening_balance_paise: z.number().int().min(0).default(0),
  opening_balance_date: optionalField(z.string()),
  preferred_payment_method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'credit']).default('cash'),
  preferred_delivery_time: optionalField(z.string().max(100)),
  price_tier: z.enum(['standard', 'wholesale', 'vip']).default('standard'),
  discount_percent: z.number().min(0).max(100).default(0),
  preferred_cut: optionalField(z.string().max(100)),
  skin_preference: optionalField(z.string().max(100)),
  cutting_preference: optionalField(z.string().max(100)),
  typical_quantity: optionalField(z.string().max(100)),
  delivery_preference: optionalField(z.string().max(100)),
  packaging_preference: optionalField(z.string().max(100)),
  special_instructions: optionalField(z.string().max(1000)),
  notes: optionalField(z.string().max(1000)),
  is_test: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)).optional(),
  is_system: z.union([z.boolean(), z.number()]).transform(val => Boolean(val)).optional(),
});

export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

export const UpdateCustomerSchema = CreateCustomerSchema.partial();

export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;

export const RecordCustomerPaymentSchema = z.object({
  customer_id: z.number().int().positive(),
  amount_paise: z.number().int().positive(),
  method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'cheque', 'advance_adjustment']),
  reference_number: z.string().max(100).nullable().optional(),
  cheque_number: z.string().max(50).nullable().optional(),
  cheque_date: z.string().nullable().optional(),
  bank_name: z.string().max(100).nullable().optional(),
  payment_date: z.string().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type RecordCustomerPaymentInput = z.infer<typeof RecordCustomerPaymentSchema>;

export const DepositAdvanceSchema = z.object({
  customer_id: z.number().int().positive(),
  amount_paise: z.number().int().positive(),
  method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'cheque']),
  reference_number: z.string().max(100).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export type DepositAdvanceInput = z.infer<typeof DepositAdvanceSchema>;

export const WriteOffSchema = z.object({
  customer_id: z.number().int().positive(),
  amount_paise: z.number().int().positive(),
  reason: z.string().min(5).max(500),
});

export type WriteOffInput = z.infer<typeof WriteOffSchema>;

export const CreditNoteSchema = z.object({
  customer_id: z.number().int().positive(),
  original_invoice_id: z.number().int().positive().nullable().optional(),
  amount_paise: z.number().int().positive(),
  reason: z.string().min(3).max(500),
});

export type CreditNoteInput = z.infer<typeof CreditNoteSchema>;

export const UpdateCreditAccountSchema = z.object({
  customer_id: z.number().int().positive(),
  credit_limit_paise: z.number().int().min(0).optional(),
  soft_limit_paise: z.number().int().min(0).optional(),
  hard_limit_paise: z.number().int().min(0).optional(),
  grace_days: z.number().int().min(0).max(365).optional(),
  max_overdue_days: z.number().int().min(1).max(3650).optional(),
  interest_rate_percent: z.number().min(0).max(100).optional(),
});

export type UpdateCreditAccountInput = z.infer<typeof UpdateCreditAccountSchema>;

export const CreateReminderSchema = z.object({
  customer_id: z.number().int().positive(),
  channel: z.enum(['sms', 'whatsapp', 'email', 'manual']),
  template_type: z.enum(['payment_due', 'overdue', 'credit_limit', 'custom']),
  message: z.string().min(1).max(1000),
  scheduled_for: z.string().nullable().optional(),
});

export type CreateReminderInput = z.infer<typeof CreateReminderSchema>;

export const GetLedgerSchema = z.object({
  customer_id: z.number().int().positive(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.number().int().min(1).max(500).default(100),
  offset: z.number().int().min(0).default(0),
});

export type GetLedgerInput = z.infer<typeof GetLedgerSchema>;

export const GetStatementSchema = z.object({
  customer_id: z.number().int().positive(),
  startDate: z.string(),
  endDate: z.string(),
});

export type GetStatementInput = z.infer<typeof GetStatementSchema>;

export const DateRangeSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
});

export type DateRangeInput = z.infer<typeof DateRangeSchema>;
