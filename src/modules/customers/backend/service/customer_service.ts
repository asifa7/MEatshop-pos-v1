import { db } from '../../../../core/backend/db';
import { ValidationError, NotFoundError, ConflictError } from '../../../../core/backend/errors';
import { CreateCustomerSchema, UpdateCustomerSchema, CreateReminderSchema } from '../../../../core/validation/customer_schemas';
import { logger, auditLogger } from '../../../../core/backend/logger';
import { authService } from '../../../auth/backend/service/auth_service';
import { customerIntelligenceService } from './customer_intelligence_service';

export interface CustomerReminderRow {
  id: number;
  customer_id: number;
  channel: string;
  template_type: string;
  message: string;
  outstanding_paise: number | null;
  status: string;
  scheduled_for: string | null;
  sent_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface CustomerPurchaseItem {
  id: number;
  product_variant_id: number;
  product_name: string;
  variant_name: string;
  unit_type: string;
  quantity: number;
  unit_label: string;
  rate_paise: number;
  line_total_paise: number;
}

export interface CustomerPurchaseInvoice {
  id: number;
  invoice_number: string;
  created_at: string;
  status: string;
  payment_status: string;
  is_gst_invoice: number;
  subtotal_paise: number;
  discount_paise: number;
  total_paise: number;
  payment_methods: string[];
  items_summary: string;
  items_count: number;
  items: CustomerPurchaseItem[];
}

export interface CustomerOverviewSummary {
  customer_id: number;
  total_purchases_paise: number;
  total_visits: number;
  total_payments_paise: number;
  last_purchase_date: string | null;
  last_purchase_amount_paise: number;
  last_purchase_items: string | null;
  last_payment_date: string | null;
  last_payment_amount_paise: number;
  outstanding_balance_paise: number;
  advance_balance_paise: number;
  credit_limit_paise: number;
  available_credit_paise: number;
}

export function normalizeIndianPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.substring(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.substring(2);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
}

export class CustomerService {
  private get includeTestData(): boolean {
    try {
      return customerIntelligenceService.getIncludeTestData();
    } catch (_) {
      return false;
    }
  }

  private getCurrentUserId(): number {
    return authService.getCurrentUserId() || 1;
  }

  public getAllCustomers(includeInactive = false, options?: { includeTest?: boolean; includeSystem?: boolean }): any[] {
    const testClause = options?.includeTest ? '' : ' AND (c.is_test = 0 OR c.is_test IS NULL)';
    const systemClause = options?.includeSystem ? '' : ' AND (c.is_system = 0 OR c.is_system IS NULL)';

    const query = includeInactive
      ? `SELECT c.*, cg.name as group_name, cac.segment as customer_segment,
                COALESCE(s.company_name, s.name) as linked_supplier_name, s.code as linked_supplier_code
         FROM customers c 
         LEFT JOIN customer_groups cg ON c.group_id = cg.id 
         LEFT JOIN customer_analytics_cache cac ON c.id = cac.customer_id
         LEFT JOIN suppliers s ON c.linked_supplier_id = s.id
         WHERE (c.status != 'merged' OR c.status IS NULL)${testClause}${systemClause}
         ORDER BY c.name ASC`
      : `SELECT c.*, cg.name as group_name, cac.segment as customer_segment,
                COALESCE(s.company_name, s.name) as linked_supplier_name, s.code as linked_supplier_code
         FROM customers c 
         LEFT JOIN customer_groups cg ON c.group_id = cg.id 
         LEFT JOIN customer_analytics_cache cac ON c.id = cac.customer_id
         LEFT JOIN suppliers s ON c.linked_supplier_id = s.id
         WHERE c.is_active = 1 AND (c.status = 'active' OR c.status IS NULL)${testClause}${systemClause}
         ORDER BY c.name ASC`;
    return db.prepare(query).all();
  }

  public getCustomerById(id: number): any {
    const row = db.prepare(`
      SELECT c.*, cg.name as group_name, cac.segment as customer_segment,
             COALESCE(s.company_name, s.name) as linked_supplier_name, s.code as linked_supplier_code
      FROM customers c 
      LEFT JOIN customer_groups cg ON c.group_id = cg.id 
      LEFT JOIN customer_analytics_cache cac ON c.id = cac.customer_id
      LEFT JOIN suppliers s ON c.linked_supplier_id = s.id
      WHERE c.id = ?
    `).get(id);
    if (!row) {
      throw new NotFoundError(`Customer with id ${id} not found`);
    }
    return row;
  }

  public searchCustomers(searchQuery: string, limit = 25, options?: { includeTest?: boolean; includeSystem?: boolean }): any[] {
    if (!searchQuery || !searchQuery.trim()) {
      return this.getAllCustomers(false, options).slice(0, limit);
    }

    const raw = searchQuery.trim();
    const likeQuery = `%${raw}%`;
    const digitsOnly = raw.replace(/\D/g, '');
    const phonePattern = digitsOnly.length >= 3 ? `%${digitsOnly}%` : likeQuery;
    const testClause = options?.includeTest ? '' : ' AND (c.is_test = 0 OR c.is_test IS NULL)';
    const systemClause = options?.includeSystem ? '' : ' AND (c.is_system = 0 OR c.is_system IS NULL)';

    return db.prepare(`
      SELECT c.*, cg.name as group_name, cac.segment as customer_segment,
             COALESCE(s.company_name, s.name) as linked_supplier_name, s.code as linked_supplier_code
      FROM customers c 
      LEFT JOIN customer_groups cg ON c.group_id = cg.id 
      LEFT JOIN customer_analytics_cache cac ON c.id = cac.customer_id
      LEFT JOIN suppliers s ON c.linked_supplier_id = s.id
      WHERE c.is_active = 1 
        AND (c.status != 'merged' OR c.status IS NULL)
        ${testClause}
        ${systemClause}
        AND (
          c.name LIKE ? 
          OR c.phone LIKE ? 
          OR c.phone_normalized LIKE ?
          OR c.whatsapp LIKE ?
          OR c.business_name LIKE ? 
          OR c.customer_code LIKE ?
          OR c.category LIKE ?
        )
      ORDER BY 
        CASE 
          WHEN c.phone_normalized = ? THEN 1
          WHEN c.phone = ? THEN 2
          WHEN c.customer_code = ? THEN 3
          WHEN c.name LIKE ? THEN 4
          ELSE 5
        END,
        c.name ASC
      LIMIT ?
    `).all(
      likeQuery, phonePattern, phonePattern, phonePattern, likeQuery, likeQuery, likeQuery,
      digitsOnly, raw, raw, `${raw}%`,
      limit
    );
  }

  /**
   * Check for duplicate customers by phone, whatsapp, email, or close name before saving.
   * Also checks suppliers for same name/phone to offer dual-role linking.
   */
  public checkDuplicateCustomers(criteria: {
    phone?: string | null;
    whatsapp?: string | null;
    name?: string | null;
    email?: string | null;
    excludeId?: number | null;
  }): { hasDuplicate: boolean; duplicates: any[]; matchingSuppliers?: any[] } {
    const duplicates: any[] = [];
    const matchingSuppliers: any[] = [];
    const excludeId = criteria.excludeId || 0;

    // 1. Phone match (normalized or raw)
    if (criteria.phone && criteria.phone.trim()) {
      const cleanPhone = criteria.phone.replace(/\D/g, '');
      const normPhone = normalizeIndianPhone(criteria.phone);
      if (cleanPhone.length >= 6) {
        const rows = db.prepare(`
          SELECT id, customer_code, name, phone, phone_normalized, whatsapp, category, outstanding_balance_paise, is_active, status, linked_supplier_id
          FROM customers 
          WHERE (phone LIKE ? OR whatsapp LIKE ? OR phone = ? OR phone_normalized = ?) 
            AND id != ? 
            AND (status != 'merged' OR status IS NULL)
        `).all(`%${cleanPhone}%`, `%${cleanPhone}%`, criteria.phone.trim(), normPhone || cleanPhone, excludeId) as any[];

        for (const r of rows) {
          if (!duplicates.some(d => d.id === r.id)) {
            duplicates.push({ ...r, matchReason: `Phone match (${r.phone || r.phone_normalized || r.whatsapp})` });
          }
        }

        try {
          const supRows = db.prepare(`
            SELECT id, code, COALESCE(company_name, name) as name, phone, whatsapp, linked_customer_id
            FROM suppliers
            WHERE (phone LIKE ? OR whatsapp LIKE ? OR contact LIKE ?)
          `).all(`%${cleanPhone}%`, `%${cleanPhone}%`, `%${cleanPhone}%`) as any[];
          for (const s of supRows) {
            if (!matchingSuppliers.some(ms => ms.id === s.id)) {
              matchingSuppliers.push({ ...s, matchReason: `Phone match (${s.phone || s.whatsapp})` });
            }
          }
        } catch (_) {}
      }
    }

    // 2. WhatsApp match (if distinct from phone)
    if (criteria.whatsapp && criteria.whatsapp.trim()) {
      const cleanWa = criteria.whatsapp.replace(/\D/g, '');
      if (cleanWa.length >= 6) {
        const rows = db.prepare(`
          SELECT id, customer_code, name, phone, whatsapp, category, outstanding_balance_paise, is_active, status, linked_supplier_id
          FROM customers 
          WHERE (whatsapp LIKE ? OR phone LIKE ?) AND id != ? AND (status != 'merged' OR status IS NULL)
        `).all(`%${cleanWa}%`, `%${cleanWa}%`, excludeId) as any[];

        for (const r of rows) {
          if (!duplicates.some(d => d.id === r.id)) {
            duplicates.push({ ...r, matchReason: `WhatsApp match (${r.whatsapp})` });
          }
        }
      }
    }

    // 3. Name match (case-insensitive exact or high similarity)
    if (criteria.name && criteria.name.trim().length >= 3) {
      const rows = db.prepare(`
        SELECT id, customer_code, name, phone, whatsapp, category, outstanding_balance_paise, is_active, status, linked_supplier_id
        FROM customers 
        WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND id != ? AND (status != 'merged' OR status IS NULL)
      `).all(criteria.name.trim(), excludeId) as any[];

      for (const r of rows) {
        if (!duplicates.some(d => d.id === r.id)) {
          duplicates.push({ ...r, matchReason: `Exact Name match (${r.name})` });
        }
      }

      try {
        const supRows = db.prepare(`
          SELECT id, code, COALESCE(company_name, name) as name, phone, whatsapp, linked_customer_id
          FROM suppliers
          WHERE LOWER(TRIM(COALESCE(company_name, name))) = LOWER(TRIM(?))
             OR LOWER(TRIM(COALESCE(owner_name, ''))) = LOWER(TRIM(?))
        `).all(criteria.name.trim(), criteria.name.trim()) as any[];
        for (const s of supRows) {
          if (!matchingSuppliers.some(ms => ms.id === s.id)) {
            matchingSuppliers.push({ ...s, matchReason: `Same Supplier Name (${s.name})` });
          }
        }
      } catch (_) {}
    }

    return {
      hasDuplicate: duplicates.length > 0,
      duplicates,
      matchingSuppliers,
    };
  }

  public createCustomer(rawInput: unknown) {
    const parsed = CreateCustomerSchema.safeParse(rawInput);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const fieldName = issue.path.length > 0 ? ` (${issue.path.join('.')})` : '';
      throw new ValidationError(`Validation failed: ${issue.message}${fieldName}`, parsed.error.flatten());
    }
    const data = parsed.data;
    const rawLinkedSupplierId = (rawInput as any)?.linked_supplier_id;
    const linkedSupplierId = rawLinkedSupplierId != null && Number(rawLinkedSupplierId) > 0 ? Number(rawLinkedSupplierId) : null;
    
    // Check phone uniqueness using normalized 10-digit number
    const phoneNormalized = normalizeIndianPhone(data.phone);
    if (phoneNormalized) {
      const existing = db.prepare(`
        SELECT id, customer_code, name 
        FROM customers 
        WHERE (phone_normalized = ? OR phone = ?) AND (status != 'merged' OR status IS NULL)
      `).get(phoneNormalized, data.phone) as { id: number; customer_code: string; name: string } | undefined;
      if (existing) {
        throw new ConflictError(`Customer with phone number ${data.phone} already exists (${existing.name} / ${existing.customer_code})`);
      }
    }

    const userId = this.getCurrentUserId();

    const insertResult = db.transaction(() => {
      // 1. Get next code sequence atomically from customer_sequences
      let nextCodeNum = 1;
      try {
        const seqRow = db.prepare(`
          UPDATE customer_sequences 
          SET last_number = last_number + 1, updated_at = CURRENT_TIMESTAMP 
          WHERE sequence_key = 'CUSTOMER_CODE' 
          RETURNING last_number
        `).get() as { last_number: number } | undefined;

        if (seqRow && seqRow.last_number) {
          nextCodeNum = seqRow.last_number;
        } else {
          const maxRow = db.prepare(`
            SELECT MAX(CAST(SUBSTR(customer_code, 6) AS INTEGER)) as max_num 
            FROM customers 
            WHERE customer_code LIKE 'CUST-%' AND length(customer_code) = 10
          `).get() as { max_num: number | null };
          nextCodeNum = (maxRow?.max_num || 0) + 1;
          db.prepare(`
            INSERT INTO customer_sequences (sequence_key, last_number, updated_at) 
            VALUES ('CUSTOMER_CODE', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(sequence_key) DO UPDATE SET last_number = excluded.last_number, updated_at = CURRENT_TIMESTAMP
          `).run(nextCodeNum);
        }
      } catch (seqErr: any) {
        logger.warn('Failed to update customer_sequences, fallback to max code logic', { error: seqErr?.message || String(seqErr) });
        const maxRow = db.prepare(`
          SELECT MAX(CAST(SUBSTR(customer_code, 6) AS INTEGER)) as max_num 
          FROM customers 
          WHERE customer_code LIKE 'CUST-%'
        `).get() as { max_num: number | null };
        nextCodeNum = (maxRow?.max_num || 0) + 1;
      }

      const code = `CUST-${String(nextCodeNum).padStart(5, '0')}`;

      // 2. Insert customer profile
      const stmt = db.prepare(`
        INSERT INTO customers (
          customer_code, name, business_name, gstin, pan, phone, phone_normalized, phone2, whatsapp, email,
          billing_address_line1, billing_address_line2, billing_city, billing_state, billing_pincode,
          shipping_address_line1, shipping_address_line2, shipping_city, shipping_state, shipping_pincode,
          delivery_notes, group_id, category, status, is_active, credit_allowed, credit_limit_paise,
          outstanding_balance_paise, advance_balance_paise, opening_balance_paise, opening_balance_date,
          preferred_payment_method, preferred_delivery_time, price_tier, discount_percent,
          preferred_cut, skin_preference, cutting_preference, typical_quantity,
          delivery_preference, packaging_preference, special_instructions,
          notes, is_test, is_system, linked_supplier_id, created_by, updated_by
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, 1, ?, ?,
          ?, 0, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?
        )
      `);

      const creditAllowedVal = data.credit_allowed ? 1 : 0;
      const outstandingVal = data.opening_balance_paise ?? 0;
      const statusVal = data.status || 'active';
      const isTestVal = data.is_test ? 1 : 0;
      const isSystemVal = data.is_system ? 1 : 0;
      
      const res = stmt.run(
        code, data.name, data.business_name ?? null, data.gstin ?? null, data.pan ?? null, data.phone ?? null, phoneNormalized ?? null, data.phone2 ?? null, data.whatsapp ?? null, data.email ?? null,
        data.billing_address_line1 ?? null, data.billing_address_line2 ?? null, data.billing_city ?? null, data.billing_state ?? null, data.billing_pincode ?? null,
        data.shipping_address_line1 ?? null, data.shipping_address_line2 ?? null, data.shipping_city ?? null, data.shipping_state ?? null, data.shipping_pincode ?? null,
        data.delivery_notes ?? null, data.group_id ?? null, data.category, statusVal, creditAllowedVal, data.credit_limit_paise,
        outstandingVal, data.opening_balance_paise ?? 0, data.opening_balance_date ?? null,
        data.preferred_payment_method, data.preferred_delivery_time ?? null, data.price_tier, data.discount_percent,
        data.preferred_cut ?? null, data.skin_preference ?? null, data.cutting_preference ?? null, data.typical_quantity ?? null,
        data.delivery_preference ?? null, data.packaging_preference ?? null, data.special_instructions ?? null,
        data.notes ?? null, isTestVal, isSystemVal, linkedSupplierId,
        userId, userId
      );

      const customerId = res.lastInsertRowid as number;

      if (linkedSupplierId) {
        try {
          db.prepare('UPDATE suppliers SET linked_customer_id = ? WHERE id = ?').run(customerId, linkedSupplierId);
        } catch (_) {}
      }

      // 3. Setup credit account defaults
      db.prepare(`
        INSERT INTO customer_credit_accounts (
          customer_id, credit_limit_paise, soft_limit_paise, hard_limit_paise,
          grace_days, max_overdue_days, interest_rate_percent, is_frozen, is_blacklisted
        ) VALUES (?, ?, ?, ?, 7, 30, 0, 0, 0)
      `).run(customerId, data.credit_limit_paise, Math.round(data.credit_limit_paise * 0.9), data.credit_limit_paise);

      // 4. Record opening balance in ledger if outstanding > 0
      if (outstandingVal > 0) {
        db.prepare(`
          INSERT INTO customer_ledger (
            customer_id, ref_type, ref_id, invoice_number, description, debit_paise, credit_paise, running_balance_paise, created_by
          ) VALUES (?, 'opening_balance', NULL, NULL, 'Opening balance record', ?, 0, ?, ?)
        `).run(customerId, outstandingVal, outstandingVal, userId);
      }

      // Log activity
      db.prepare(`
        INSERT INTO customer_activity_logs (customer_id, action, details, performed_by)
        VALUES (?, 'create', 'Customer profile created', ?)
      `).run(customerId, userId);

      return customerId;
    })();

    auditLogger.log(userId, 'CUSTOMER_CREATED', { customerId: insertResult });
    return this.getCustomerById(insertResult);
  }

  public updateCustomer(id: number, rawFields: unknown) {
    const customer = this.getCustomerById(id);
    const parsed = UpdateCustomerSchema.parse(rawFields);
    const userId = this.getCurrentUserId();
    const hasLinkedSupplierField = rawFields && typeof rawFields === 'object' && 'linked_supplier_id' in (rawFields as any);
    const rawLinkedSupplierId = (rawFields as any)?.linked_supplier_id;
    const nextLinkedSupplierId = rawLinkedSupplierId != null && Number(rawLinkedSupplierId) > 0 ? Number(rawLinkedSupplierId) : null;

    db.transaction(() => {
      // Dynamic updates build
      const sets: string[] = [];
      const values: any[] = [];
      
      for (const [key, value] of Object.entries(parsed)) {
        if (value !== undefined) {
          if (key === 'phone') {
            const normPhone = normalizeIndianPhone(value as string);
            if (normPhone) {
              const existing = db.prepare(`
                SELECT id, customer_code, name 
                FROM customers 
                WHERE (phone_normalized = ? OR phone = ?) AND id != ? AND (status != 'merged' OR status IS NULL)
              `).get(normPhone, value, id) as { id: number; customer_code: string; name: string } | undefined;
              if (existing) {
                throw new ConflictError(`Another customer with phone number ${value} already exists (${existing.name} / ${existing.customer_code})`);
              }
            }
            sets.push('phone = ?');
            values.push(value);
            sets.push('phone_normalized = ?');
            values.push(normPhone);
          } else {
            sets.push(`${key} = ?`);
            values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
          }
        }
      }

      if (hasLinkedSupplierField) {
        sets.push('linked_supplier_id = ?');
        values.push(nextLinkedSupplierId);
      }

      if (sets.length > 0) {
        sets.push('updated_by = ?');
        values.push(userId);
        sets.push('updated_at = CURRENT_TIMESTAMP');
        
        values.push(id);
        const query = `UPDATE customers SET ${sets.join(', ')} WHERE id = ?`;
        db.prepare(query).run(...values);
      }

      if (hasLinkedSupplierField) {
        try {
          if (customer.linked_supplier_id && customer.linked_supplier_id !== nextLinkedSupplierId) {
            db.prepare('UPDATE suppliers SET linked_customer_id = NULL WHERE id = ? AND linked_customer_id = ?').run(customer.linked_supplier_id, id);
          }
          if (nextLinkedSupplierId) {
            db.prepare('UPDATE suppliers SET linked_customer_id = ? WHERE id = ?').run(id, nextLinkedSupplierId);
          }
        } catch (_) {}
      }

      // Check if credit limits updated, update customer_credit_accounts
      if (parsed.credit_limit_paise !== undefined) {
        db.prepare(`
          UPDATE customer_credit_accounts
          SET credit_limit_paise = ?, soft_limit_paise = ?, hard_limit_paise = ?
          WHERE customer_id = ?
        `).run(parsed.credit_limit_paise, Math.round(parsed.credit_limit_paise * 0.9), parsed.credit_limit_paise, id);
      }

      db.prepare(`
        INSERT INTO customer_activity_logs (customer_id, action, details, performed_by)
        VALUES (?, 'update', 'Customer profile updated', ?)
      `).run(id, userId);
    })();

    return this.getCustomerById(id);
  }

  public deactivateCustomer(id: number) {
    const customer = this.getCustomerById(id);
    if (customer.outstanding_balance_paise > 0) {
      throw new ConflictError('Cannot deactivate customer with an outstanding balance');
    }
    const userId = this.getCurrentUserId();
    db.transaction(() => {
      db.prepare("UPDATE customers SET is_active = 0, status = 'inactive', updated_by = ? WHERE id = ?").run(userId, id);
      db.prepare(`
        INSERT INTO customer_activity_logs (customer_id, action, details, performed_by)
        VALUES (?, 'deactivate', 'Customer deactivated', ?)
      `).run(id, userId);
    })();
  }

  public reactivateCustomer(id: number) {
    this.getCustomerById(id);
    const userId = this.getCurrentUserId();
    db.transaction(() => {
      db.prepare("UPDATE customers SET is_active = 1, status = 'active', updated_by = ? WHERE id = ?").run(userId, id);
      db.prepare(`
        INSERT INTO customer_activity_logs (customer_id, action, details, performed_by)
        VALUES (?, 'reactivate', 'Customer reactivated', ?)
      `).run(id, userId);
    })();
  }

  /**
   * Get detailed purchase history for customer with itemized details and payment breakdown.
   */
  public getCustomerPurchaseHistory(customerId: number, options?: { limit?: number; offset?: number }): { invoices: CustomerPurchaseInvoice[]; total_count: number } {
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    const countRow = db.prepare(`
      SELECT COUNT(*) as count 
      FROM invoices 
      WHERE customer_id = ? AND status IN ('completed', 'returned')
    `).get(customerId) as any;

    const totalCount = countRow?.count || 0;

    const invoiceRows = db.prepare(`
      SELECT 
        id, invoice_number, created_at, status, payment_status, 
        is_gst_invoice, subtotal_paise, discount_paise, total_paise
      FROM invoices 
      WHERE customer_id = ? AND status IN ('completed', 'returned')
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(customerId, limit, offset) as any[];

    const invoices: CustomerPurchaseInvoice[] = invoiceRows.map((inv) => {
      // Fetch line items
      const rawItems = db.prepare(`
        SELECT 
          ii.id, ii.product_variant_id, ii.rate_paise_snapshot as rate_paise, ii.line_total_paise,
          ii.quantity_grams, ii.quantity_units,
          p.name as product_name, p.unit_type,
          pv.variant_name
        FROM invoice_items ii
        JOIN product_variants pv ON ii.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE ii.invoice_id = ?
        ORDER BY ii.id ASC
      `).all(inv.id) as any[];

      const items: CustomerPurchaseItem[] = rawItems.map((item) => {
        const isWeight = item.unit_type === 'weight' || item.unit_type === 'live_dual' || item.quantity_grams != null;
        const qty = isWeight ? (item.quantity_grams || 0) / 1000 : (item.quantity_units || 0);
        return {
          id: item.id,
          product_variant_id: item.product_variant_id,
          product_name: item.product_name,
          variant_name: item.variant_name,
          unit_type: item.unit_type,
          quantity: qty,
          unit_label: isWeight ? 'kg' : 'pcs',
          rate_paise: item.rate_paise,
          line_total_paise: item.line_total_paise,
        };
      });

      // Construct item summary string
      const summaryParts = items.slice(0, 3).map(
        i => `${i.product_name}${i.variant_name && i.variant_name !== 'Default' ? ` (${i.variant_name})` : ''} (${i.quantity.toFixed(i.unit_label === 'kg' ? 2 : 0)} ${i.unit_label})`
      );
      if (items.length > 3) summaryParts.push(`+${items.length - 3} more`);
      const itemsSummary = summaryParts.join(', ') || 'General purchase';

      // Fetch payment methods
      const paymentRows = db.prepare('SELECT DISTINCT method FROM payments WHERE invoice_id = ?').all(inv.id) as any[];
      const paymentMethods = paymentRows.map(p => p.method);

      return {
        id: inv.id,
        invoice_number: inv.invoice_number || `#${inv.id}`,
        created_at: inv.created_at,
        status: inv.status,
        payment_status: inv.payment_status,
        is_gst_invoice: inv.is_gst_invoice,
        subtotal_paise: inv.subtotal_paise || inv.total_paise,
        discount_paise: inv.discount_paise || 0,
        total_paise: inv.total_paise,
        payment_methods: paymentMethods.length > 0 ? paymentMethods : ['cash'],
        items_summary: itemsSummary,
        items_count: items.length,
        items,
      };
    });

    return {
      invoices,
      total_count: totalCount,
    };
  }

  /**
   * Get Customer Overview summary metrics (lifetime spend, visits, last purchase, balances).
   */
  public getCustomerOverviewSummary(customerId: number): CustomerOverviewSummary {
    const customer = this.getCustomerById(customerId);

    // Spend & visit stats from invoices
    const invoiceStats = db.prepare(`
      SELECT 
        COUNT(id) as total_visits,
        COALESCE(SUM(total_paise), 0) as total_purchases_paise
      FROM invoices
      WHERE customer_id = ? AND status IN ('completed', 'returned')
    `).get(customerId) as any;

    // Last invoice details
    const lastInvoice = db.prepare(`
      SELECT id, created_at, total_paise 
      FROM invoices 
      WHERE customer_id = ? AND status IN ('completed', 'returned')
      ORDER BY created_at DESC, id DESC 
      LIMIT 1
    `).get(customerId) as any;

    let lastPurchaseItems: string | null = null;
    if (lastInvoice) {
      const items = db.prepare(`
        SELECT p.name, pv.variant_name, ii.quantity_grams, ii.quantity_units, p.unit_type
        FROM invoice_items ii
        JOIN product_variants pv ON ii.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE ii.invoice_id = ?
        LIMIT 3
      `).all(lastInvoice.id) as any[];

      lastPurchaseItems = items.map((i) => {
        const isWeight = i.unit_type === 'weight' || i.unit_type === 'live_dual' || i.quantity_grams != null;
        const q = isWeight ? `${((i.quantity_grams || 0) / 1000).toFixed(1)}kg` : `${i.quantity_units}pc`;
        return `${i.name} (${q})`;
      }).join(', ');
    }

    // Payment stats from payments table and customer_ledger
    const paymentStats = db.prepare(`
      SELECT 
        COALESCE(SUM(credit_paise), 0) as total_payments_paise
      FROM customer_ledger
      WHERE customer_id = ? AND ref_type = 'payment'
    `).get(customerId) as any;

    const lastPayment = db.prepare(`
      SELECT created_at, credit_paise as amount_paise
      FROM customer_ledger
      WHERE customer_id = ? AND ref_type = 'payment'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).get(customerId) as any;

    const creditLimit = customer.credit_limit_paise || 0;
    const outstanding = customer.outstanding_balance_paise || 0;
    const availableCredit = Math.max(0, creditLimit - outstanding);

    return {
      customer_id: customerId,
      total_purchases_paise: invoiceStats?.total_purchases_paise || 0,
      total_visits: invoiceStats?.total_visits || 0,
      total_payments_paise: paymentStats?.total_payments_paise || 0,
      last_purchase_date: lastInvoice?.created_at || null,
      last_purchase_amount_paise: lastInvoice?.total_paise || 0,
      last_purchase_items: lastPurchaseItems,
      last_payment_date: lastPayment?.created_at || null,
      last_payment_amount_paise: lastPayment?.amount_paise || 0,
      outstanding_balance_paise: outstanding,
      advance_balance_paise: customer.advance_balance_paise || 0,
      credit_limit_paise: creditLimit,
      available_credit_paise: availableCredit,
    };
  }

  /**
   * Merge Source Customer into Target (Surviving) Customer.
   * Atomically transfers all invoices, ledger records, payments, credit notes, reminders, visits, and related references across all 21 tables.
   * Preserves a single chosen credit limit (does NOT sum limits).
   */
  public mergeCustomers(
    sourceCustomerId: number, 
    targetCustomerId: number, 
    options?: { reason?: string; chosenCreditLimitPaise?: number }
  ): any {
    if (sourceCustomerId === targetCustomerId) {
      throw new ValidationError('Cannot merge a customer into themselves');
    }

    const source = this.getCustomerById(sourceCustomerId);
    const target = this.getCustomerById(targetCustomerId);

    if (source.status === 'merged') {
      throw new ConflictError(`Source customer ${source.name} is already merged`);
    }

    const userId = this.getCurrentUserId();
    const reason = options?.reason || `Merged customer #${source.customer_code} into #${target.customer_code}`;

    const mergeResult = db.transaction(() => {
      // 1. Reassign Invoices
      const invoiceUpdate = db.prepare('UPDATE invoices SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId);

      // 2. Reassign Customer Ledger entries
      db.prepare('UPDATE customer_ledger SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId);

      // 3. Reassign Customer Payment Records
      db.prepare('UPDATE customer_payment_records SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId);

      // 4. Reassign Customer Payments (if exists)
      try { db.prepare('UPDATE customer_payments SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 5. Reassign Customer Advance Payments
      try { db.prepare('UPDATE customer_advance_payments SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 6. Reassign Customer Credit Transactions
      try { db.prepare('UPDATE customer_credit_transactions SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 7. Reassign Customer Credit Notes
      try { db.prepare('UPDATE customer_credit_notes SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 8. Reassign Credit Notes
      try { db.prepare('UPDATE credit_notes SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 9. Reassign Sales Returns
      try { db.prepare('UPDATE sales_returns SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 10. Reassign Customer Visits
      try { db.prepare('UPDATE customer_visits SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 11. Reassign Customer Notes
      try { db.prepare('UPDATE customer_notes SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 12. Reassign Customer Reminders
      try { db.prepare('UPDATE customer_reminders SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 13. Reassign Customer Communication Log
      try { db.prepare('UPDATE customer_communication_log SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 14. Reassign Customer Contacts
      try { db.prepare('UPDATE customer_contacts SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 15. Reassign Customer UPI Identities (handle UNIQUE constraint conflict)
      try {
        db.prepare('UPDATE OR IGNORE customer_upi_identities SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId);
        db.prepare('DELETE FROM customer_upi_identities WHERE customer_id = ?').run(sourceCustomerId);
      } catch (_) {}

      // 16. Reassign Customer Addresses
      try { db.prepare('UPDATE customer_addresses SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 17. Reassign Deliveries
      try { db.prepare('UPDATE deliveries SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 18. Reassign Customer Face Profiles
      try { db.prepare('UPDATE customer_face_profiles SET customer_id = ? WHERE customer_id = ?').run(targetCustomerId, sourceCustomerId); } catch (_) {}

      // 19. Clean up cache for source
      try { db.prepare('DELETE FROM customer_analytics_cache WHERE customer_id = ?').run(sourceCustomerId); } catch (_) {}

      // 20. Customer Credit Accounts (UNIQUE customer_id constraint)
      try { db.prepare('DELETE FROM customer_credit_accounts WHERE customer_id = ?').run(sourceCustomerId); } catch (_) {}

      // 21. Re-point any previous merge pointers
      db.prepare('UPDATE customers SET merged_into_customer_id = ? WHERE merged_into_customer_id = ?').run(targetCustomerId, sourceCustomerId);

      // Financial balance & Credit limit handling
      // DO NOT sum credit limits! Keep one chosen limit (target's limit by default, or explicit chosenCreditLimitPaise)
      const finalCreditLimit = options?.chosenCreditLimitPaise !== undefined 
        ? options.chosenCreditLimitPaise 
        : (target.credit_limit_paise || 0);

      const combinedOutstanding = (target.outstanding_balance_paise || 0) + (source.outstanding_balance_paise || 0);
      const combinedAdvance = (target.advance_balance_paise || 0) + (source.advance_balance_paise || 0);

      // Ledger balancing: Ensure the latest ledger running balance equals combinedOutstanding
      const latestLedger = db.prepare(`SELECT running_balance_paise FROM customer_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT 1`).get(targetCustomerId) as { running_balance_paise: number } | undefined;
      const currentLedgerBal = latestLedger ? (latestLedger.running_balance_paise || 0) : 0;
      const ledgerDiff = combinedOutstanding - currentLedgerBal;
      if (ledgerDiff !== 0) {
        if (ledgerDiff > 0) {
          db.prepare(`
            INSERT INTO customer_ledger (
              customer_id, ref_type, ref_id, invoice_number, description, debit_paise, credit_paise, running_balance_paise, created_by
            ) VALUES (?, 'adjustment', NULL, NULL, ?, ?, 0, ?, ?)
          `).run(targetCustomerId, `Balance consolidated from merge with ${source.customer_code} (${source.name})`, ledgerDiff, combinedOutstanding, userId);
        } else {
          db.prepare(`
            INSERT INTO customer_ledger (
              customer_id, ref_type, ref_id, invoice_number, description, debit_paise, credit_paise, running_balance_paise, created_by
            ) VALUES (?, 'adjustment', NULL, NULL, ?, 0, ?, ?, ?)
          `).run(targetCustomerId, `Advance consolidated from merge with ${source.customer_code} (${source.name})`, Math.abs(ledgerDiff), combinedOutstanding, userId);
        }
      }

      // Update target (surviving) customer
      const targetNotes = target.notes ? `${target.notes}\n[Merged with ${source.customer_code} (${source.name}): ${reason}]` : `[Merged with ${source.customer_code} (${source.name}): ${reason}]`;
      db.prepare(`
        UPDATE customers 
        SET 
          outstanding_balance_paise = ?,
          advance_balance_paise = ?,
          credit_limit_paise = ?,
          notes = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(combinedOutstanding, combinedAdvance, finalCreditLimit, targetNotes, userId, targetCustomerId);

      // Update credit account limits for target (or insert if target had no credit account row)
      const targetCreditAcct = db.prepare('SELECT id FROM customer_credit_accounts WHERE customer_id = ?').get(targetCustomerId);
      if (targetCreditAcct) {
        db.prepare(`
          UPDATE customer_credit_accounts
          SET credit_limit_paise = ?, soft_limit_paise = ?, hard_limit_paise = ?
          WHERE customer_id = ?
        `).run(finalCreditLimit, Math.round(finalCreditLimit * 0.9), finalCreditLimit, targetCustomerId);
      } else if (finalCreditLimit > 0 || target.credit_allowed) {
        try {
          db.prepare(`
            INSERT INTO customer_credit_accounts (customer_id, credit_limit_paise, soft_limit_paise, hard_limit_paise, is_frozen)
            VALUES (?, ?, ?, ?, 0)
          `).run(targetCustomerId, finalCreditLimit, Math.round(finalCreditLimit * 0.9), finalCreditLimit);
        } catch (_) {}
      }

      // Update source customer (mark merged, 0 balances, inactive)
      const sourceNotes = source.notes ? `${source.notes}\n[MERGED INTO ${target.customer_code} (${target.name}) on ${new Date().toISOString()}]` : `[MERGED INTO ${target.customer_code} (${target.name}) on ${new Date().toISOString()}]`;
      db.prepare(`
        UPDATE customers
        SET 
          status = 'merged',
          is_active = 0,
          merged_into_customer_id = ?,
          outstanding_balance_paise = 0,
          advance_balance_paise = 0,
          notes = ?,
          updated_by = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(targetCustomerId, sourceNotes, userId, sourceCustomerId);

      // Record audit logs on both customers
      db.prepare(`
        INSERT INTO customer_activity_logs (customer_id, action, details, performed_by)
        VALUES (?, 'merge', ?, ?)
      `).run(targetCustomerId, `Merged customer #${source.customer_code} (${source.name}) into this record. Reassigned ${invoiceUpdate.changes} invoices.`, userId);

      db.prepare(`
        INSERT INTO customer_activity_logs (customer_id, action, details, performed_by)
        VALUES (?, 'merged_away', ?, ?)
      `).run(sourceCustomerId, `This customer record was merged into #${target.customer_code} (${target.name}).`, userId);

      auditLogger.log(userId, 'CUSTOMER_MERGED', {
        sourceCustomerId,
        targetCustomerId,
        invoicesTransferred: invoiceUpdate.changes,
        combinedOutstanding,
        finalCreditLimit,
      });

      return {
        success: true,
        message: `Successfully merged ${source.name} (${source.customer_code}) into ${target.name} (${target.customer_code}).`,
        targetCustomer: this.getCustomerById(targetCustomerId),
        invoicesTransferred: invoiceUpdate.changes,
        combinedOutstanding,
        finalCreditLimit,
      };
    })();

    // Recompute analytics cache for the surviving target customer
    try {
      customerIntelligenceService.calculateAndCache(targetCustomerId);
    } catch (cacheErr) {
      logger.warn('Failed to recompute customer intelligence cache after merge', { targetCustomerId, error: cacheErr });
    }

    return mergeResult;
  }

  public getCustomerGroups() {
    return db.prepare('SELECT * FROM customer_groups ORDER BY name ASC').all();
  }

  public getActivityLog(customerId: number, limit = 50) {
    return db.prepare(`
      SELECT l.*, u.username as performer_name 
      FROM customer_activity_logs l 
      LEFT JOIN users u ON l.performed_by = u.id 
      WHERE l.customer_id = ? 
      ORDER BY l.created_at DESC 
      LIMIT ?
    `).all(customerId, limit);
  }

  // Reminders
  public createReminder(rawInput: unknown) {
    const parsed = CreateReminderSchema.parse(rawInput);
    const userId = this.getCurrentUserId();
    const customer = this.getCustomerById(parsed.customer_id);

    const reminderId = db.transaction(() => {
      const res = db.prepare(`
        INSERT INTO customer_reminders (
          customer_id, channel, template_type, message, outstanding_paise, status, scheduled_for, created_by
        ) VALUES (?, ?, ?, ?, ?, 'sent', ?, ?)
      `).run(
        parsed.customer_id,
        parsed.channel,
        parsed.template_type,
        parsed.message,
        customer.outstanding_balance_paise,
        parsed.scheduled_for ?? new Date().toISOString(),
        userId
      );

      db.prepare(`
        INSERT INTO customer_activity_logs (customer_id, action, details, performed_by)
        VALUES (?, 'send_reminder', ?, ?)
      `).run(parsed.customer_id, `Reminder sent via ${parsed.channel}`, userId);

      return res.lastInsertRowid as number;
    })();

    return db.prepare('SELECT * FROM customer_reminders WHERE id = ?').get(reminderId);
  }

  public getReminders(customerId: number) {
    return db.prepare('SELECT * FROM customer_reminders WHERE customer_id = ? ORDER BY created_at DESC').all();
  }

  // Timestamped Customer Notes
  public addCustomerNote(customerId: number, note: string, category = 'preference') {
    const userId = this.getCurrentUserId();
    const res = db.prepare(`
      INSERT INTO customer_notes (customer_id, note, category, created_by)
      VALUES (?, ?, ?, ?)
    `).run(customerId, note, category, userId);
    return db.prepare('SELECT * FROM customer_notes WHERE id = ?').get(res.lastInsertRowid);
  }

  public getCustomerNotes(customerId: number) {
    return db.prepare('SELECT * FROM customer_notes WHERE customer_id = ? ORDER BY created_at DESC').all(customerId);
  }

  // Communication Log
  public logCommunication(customerId: number, channel: string, message: string, templateType?: string, status = 'sent') {
    const userId = this.getCurrentUserId();
    const res = db.prepare(`
      INSERT INTO customer_communication_log (customer_id, channel, template_type, message, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(customerId, channel, templateType ?? null, message, status, userId);
    return db.prepare('SELECT * FROM customer_communication_log WHERE id = ?').get(res.lastInsertRowid);
  }

  public getCommunicationLog(customerId: number) {
    return db.prepare('SELECT * FROM customer_communication_log WHERE customer_id = ? ORDER BY sent_at DESC').all(customerId);
  }

  /**
   * Builds a unified chronological timeline for a customer merging:
   * 1. Purchases (invoices with items, amount, payment method)
   * 2. Direct Payments (payment records, advance deposits)
   * 3. Credit transactions & notes (customer_ledger entries)
   * 4. Profile & audit logs (customer_activity_logs)
   */
  public getCustomerUnifiedTimeline(customerId: number, limit = 100): any[] {
    const timeline: any[] = [];

    // 1. Invoices (Purchases)
    const invoices = db.prepare(`
      SELECT id, invoice_number, created_at, total_paise, payment_status, status
      FROM invoices
      WHERE customer_id = ? AND status IN ('completed', 'returned', 'voided')
      ORDER BY created_at DESC
      LIMIT ?
    `).all(customerId, limit) as any[];

    for (const inv of invoices) {
      // Fetch line items summary
      const items = db.prepare(`
        SELECT ii.quantity_grams, ii.quantity_units, p.name as product_name, p.unit_type, pv.variant_name
        FROM invoice_items ii
        JOIN product_variants pv ON ii.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE ii.invoice_id = ?
      `).all(inv.id) as any[];

      const itemsSummary = items.map(it => {
        const isWeight = it.unit_type === 'weight' || it.quantity_grams != null;
        const qStr = isWeight ? `${((it.quantity_grams || 0) / 1000).toFixed(2)} kg` : `${it.quantity_units || 1} pcs`;
        return `${it.product_name}${it.variant_name !== 'Default' ? ` (${it.variant_name})` : ''} (${qStr})`;
      }).join(', ') || 'POS Meat Items';

      // Fetch payment methods
      const payMethods = db.prepare(`
        SELECT DISTINCT method FROM payments WHERE invoice_id = ?
      `).all(inv.id) as { method: string }[];
      const methodLabel = payMethods.map(m => m.method.toUpperCase()).join(', ') || 'CASH';

      timeline.push({
        id: `purchase-${inv.id}`,
        type: 'purchase',
        title: `Purchase #${inv.invoice_number}`,
        description: itemsSummary,
        amount_paise: inv.total_paise,
        badge: inv.status === 'voided' ? 'Voided' : inv.payment_status.toUpperCase(),
        timestamp: inv.created_at,
        metadata: {
          invoice_id: inv.id,
          invoice_number: inv.invoice_number,
          payment_methods: payMethods.map(m => m.method),
          method_label: methodLabel,
          items_count: items.length,
        },
      });
    }

    // 2. Payments (Payment Records)
    const payments = db.prepare(`
      SELECT id, amount_paise, method, reference_number, is_advance, notes, created_at, payment_date
      FROM customer_payment_records
      WHERE customer_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(customerId, limit) as any[];

    for (const pay of payments) {
      timeline.push({
        id: `payment-${pay.id}`,
        type: 'payment',
        title: pay.is_advance === 1 ? 'Advance Deposit' : `Payment Received (${pay.method.toUpperCase()})`,
        description: pay.notes || (pay.reference_number ? `Ref #${pay.reference_number}` : `Direct ${pay.method.toUpperCase()} payment`),
        amount_paise: pay.amount_paise,
        badge: pay.is_advance === 1 ? 'ADVANCE' : pay.method.toUpperCase(),
        timestamp: pay.created_at || pay.payment_date,
        metadata: {
          payment_id: pay.id,
          method: pay.method,
          reference_number: pay.reference_number,
          is_advance: pay.is_advance === 1,
        },
      });
    }

    // 3. Ledger Credit/Debit rows (Credit Sales, Notes, Adjustments)
    const ledgerRows = db.prepare(`
      SELECT id, ref_type, ref_id, invoice_number, description, debit_paise, credit_paise, running_balance_paise, created_at
      FROM customer_ledger
      WHERE customer_id = ? AND ref_type NOT IN ('payment', 'advance_deposit')
      ORDER BY created_at DESC
      LIMIT ?
    `).all(customerId, limit) as any[];

    for (const ledg of ledgerRows) {
      const isDebit = ledg.debit_paise > 0;
      timeline.push({
        id: `credit-${ledg.id}`,
        type: 'credit',
        title: isDebit ? `Credit Sale Debit` : `Credit Adjustment / Note`,
        description: ledg.description || (ledg.invoice_number ? `Invoice #${ledg.invoice_number}` : ledg.ref_type),
        amount_paise: isDebit ? ledg.debit_paise : ledg.credit_paise,
        badge: ledg.ref_type.toUpperCase().replace('_', ' '),
        timestamp: ledg.created_at,
        metadata: {
          ledger_id: ledg.id,
          ref_type: ledg.ref_type,
          running_balance_paise: ledg.running_balance_paise,
        },
      });
    }

    // 4. Activity Logs (Profile changes, freeze, reminders, merge)
    const activityLogs = db.prepare(`
      SELECT id, action, details, created_at
      FROM customer_activity_logs
      WHERE customer_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(customerId, limit) as any[];

    for (const act of activityLogs) {
      timeline.push({
        id: `activity-${act.id}`,
        type: 'activity',
        title: `Account: ${act.action.replace('_', ' ').toUpperCase()}`,
        description: act.details || '',
        amount_paise: null,
        badge: 'AUDIT',
        timestamp: act.created_at,
        metadata: {
          activity_id: act.id,
          action: act.action,
        },
      });
    }

    // Sort combined feed newest first
    timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return timeline.slice(0, limit);
  }

  /**
   * Read-only report comparing customers.outstanding_balance_paise with latest customer_ledger.running_balance_paise.
   * Does NOT modify any data.
   */
  public getDriftReport(): Array<{
    customer_id: number;
    customer_code: string;
    name: string;
    stored_balance_paise: number;
    ledger_balance_paise: number;
    drift_paise: number;
    last_ledger_entry_at: string | null;
  }> {
    const customers = db.prepare(`
      SELECT id, customer_code, name, outstanding_balance_paise 
      FROM customers 
      WHERE (status != 'merged' OR status IS NULL)
      ORDER BY id ASC
    `).all() as Array<{ id: number; customer_code: string; name: string; outstanding_balance_paise: number }>;

    const driftRows: Array<{
      customer_id: number;
      customer_code: string;
      name: string;
      stored_balance_paise: number;
      ledger_balance_paise: number;
      drift_paise: number;
      last_ledger_entry_at: string | null;
    }> = [];

    for (const c of customers) {
      const latestLedger = db.prepare(`
        SELECT running_balance_paise, created_at 
        FROM customer_ledger 
        WHERE customer_id = ? 
        ORDER BY id DESC LIMIT 1
      `).get(c.id) as { running_balance_paise: number; created_at: string } | undefined;

      const ledgerBalance = latestLedger ? (latestLedger.running_balance_paise || 0) : 0;
      const storedBalance = c.outstanding_balance_paise || 0;
      const drift = storedBalance - ledgerBalance;

      if (drift !== 0) {
        driftRows.push({
          customer_id: c.id,
          customer_code: c.customer_code,
          name: c.name,
          stored_balance_paise: storedBalance,
          ledger_balance_paise: ledgerBalance,
          drift_paise: drift,
          last_ledger_entry_at: latestLedger?.created_at || null,
        });
      }
    }

    return driftRows;
  }

  /**
   * Authoritatively recompute and align customers.outstanding_balance_paise from customer_ledger.
   * Modifies customer records to match the ledger and logs an audit record for each correction.
   */
  public recomputeBalancesFromLedger(customerId?: number): Array<{
    customer_id: number;
    customer_code: string;
    name: string;
    before_balance_paise: number;
    after_balance_paise: number;
    fixed_drift_paise: number;
  }> {
    const userId = this.getCurrentUserId();
    const query = customerId
      ? `SELECT id, customer_code, name, outstanding_balance_paise FROM customers WHERE id = ?`
      : `SELECT id, customer_code, name, outstanding_balance_paise FROM customers WHERE (status != 'merged' OR status IS NULL)`;

    const customers = (customerId ? db.prepare(query).all(customerId) : db.prepare(query).all()) as Array<{
      id: number;
      customer_code: string;
      name: string;
      outstanding_balance_paise: number;
    }>;

    const results: Array<{
      customer_id: number;
      customer_code: string;
      name: string;
      before_balance_paise: number;
      after_balance_paise: number;
      fixed_drift_paise: number;
    }> = [];

    db.transaction(() => {
      for (const c of customers) {
        const latestLedger = db.prepare(`
          SELECT running_balance_paise 
          FROM customer_ledger 
          WHERE customer_id = ? 
          ORDER BY id DESC LIMIT 1
        `).get(c.id) as { running_balance_paise: number } | undefined;

        const ledgerBalance = latestLedger ? (latestLedger.running_balance_paise || 0) : 0;
        const storedBalance = c.outstanding_balance_paise || 0;
        const drift = storedBalance - ledgerBalance;

        if (drift !== 0) {
          db.prepare(`
            UPDATE customers 
            SET outstanding_balance_paise = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
          `).run(ledgerBalance, userId, c.id);

          db.prepare(`
            INSERT INTO customer_activity_logs (customer_id, action, details, performed_by)
            VALUES (?, 'balance_recompute', ?, ?)
          `).run(c.id, `Outstanding balance recomputed from ledger: ${storedBalance} -> ${ledgerBalance} (drift: ${drift})`, userId);

          results.push({
            customer_id: c.id,
            customer_code: c.customer_code,
            name: c.name,
            before_balance_paise: storedBalance,
            after_balance_paise: ledgerBalance,
            fixed_drift_paise: drift,
          });
        }
      }
    })();

    return results;
  }

  /**
   * Fast customer lookup at the counter (Section 8)
   * Responds in under 50ms with collision detection and rich metadata.
   */
  public fastCustomerLookup(query: string, limit = 8): {
    results: any[];
    totalMatches: number;
    collision: boolean;
    hint?: string;
  } {
    const raw = (query || '').trim();
    const isDigits = /^\d+$/.test(raw);
    const minChars = isDigits ? 4 : 2;

    if (!raw || raw.length < minChars) {
      return {
        results: [],
        totalMatches: 0,
        collision: false,
        hint: isDigits 
          ? 'Type at least 4 digits to search mobile number' 
          : 'Type at least 2 characters to search customer name',
      };
    }

    let whereClause = '';
    let params: any[] = [];

    if (isDigits) {
      whereClause = `
        (
          c.phone_normalized = ?
          OR c.phone_normalized LIKE ?
          OR c.phone_normalized LIKE ?
          OR c.phone LIKE ?
          OR c.customer_code LIKE ?
        )
      `;
      const suffixPattern = `%${raw}`;
      const containsPattern = `%${raw}%`;
      params = [raw, suffixPattern, containsPattern, containsPattern, containsPattern];
    } else {
      whereClause = `
        (
          c.name LIKE ?
          OR c.customer_code LIKE ?
          OR c.business_name LIKE ?
        )
      `;
      const containsPattern = `%${raw}%`;
      params = [containsPattern, containsPattern, containsPattern];
    }

    const baseFilter = `WHERE (c.status != 'merged' OR c.status IS NULL) AND (c.is_active = 1 OR c.is_active IS NULL)`;

    const countRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM customers c
      ${baseFilter} AND ${whereClause}
    `).get(...params) as { total: number };

    const totalMatches = countRow?.total || 0;

    const orderClause = isDigits
      ? `ORDER BY 
          CASE 
            WHEN c.phone_normalized = ? THEN 1
            WHEN c.phone_normalized LIKE ? THEN 2
            WHEN c.customer_code = ? THEN 3
            ELSE 4
          END,
          c.name ASC`
      : `ORDER BY 
          CASE 
            WHEN LOWER(c.name) = LOWER(?) THEN 1
            WHEN c.name LIKE ? THEN 2
            ELSE 3
          END,
          c.name ASC`;

    const orderParams = isDigits
      ? [raw, `%${raw}`, raw]
      : [raw, `${raw}%`];

    const rows = db.prepare(`
      SELECT 
        c.id,
        c.customer_code,
        c.name,
        c.phone,
        c.phone_normalized,
        c.whatsapp,
        c.billing_city,
        c.billing_address_line1,
        c.outstanding_balance_paise,
        c.advance_balance_paise,
        c.credit_allowed,
        c.credit_limit_paise,
        c.preferred_cut,
        c.cutting_preference,
        c.whatsapp_bill_consent,
        c.marketing_consent,
        cac.segment as customer_segment,
        (SELECT COUNT(DISTINCT DATE(inv.created_at)) FROM invoices inv WHERE inv.customer_id = c.id AND inv.status = 'completed') as total_visits,
        (SELECT MAX(created_at) FROM invoices inv WHERE inv.customer_id = c.id AND inv.status = 'completed') as last_purchase_date,
        c.preferred_cut as typical_basket_summary
      FROM customers c
      LEFT JOIN customer_analytics_cache cac ON c.id = cac.customer_id
      ${baseFilter} AND ${whereClause}
      ${orderClause}
      LIMIT ?
    `).all(...params, ...orderParams, limit) as any[];

    const results = rows.map(r => {
      const p = r.phone_normalized || r.phone || '';
      const maskedPhone = p.length >= 4 
        ? `${'*'.repeat(Math.max(0, p.length - 4))}${p.slice(-4)}`
        : p;

      let lastVisitText = 'No visits yet';
      if (r.last_purchase_date) {
        try {
          const diffMs = Date.now() - new Date(r.last_purchase_date).getTime();
          const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          if (diffDays === 0) lastVisitText = 'Today';
          else if (diffDays === 1) lastVisitText = 'Yesterday';
          else lastVisitText = `${diffDays} days ago`;
        } catch (_) {
          lastVisitText = String(r.last_purchase_date).split(' ')[0];
        }
      }

      return {
        id: r.id,
        customer_code: r.customer_code,
        name: r.name,
        phone: r.phone,
        phone_normalized: r.phone_normalized,
        masked_phone: maskedPhone,
        matched_digits: isDigits ? raw : null,
        locality: r.billing_city || r.billing_address_line1 || '',
        outstanding_balance_paise: r.outstanding_balance_paise || 0,
        advance_balance_paise: r.advance_balance_paise || 0,
        credit_allowed: r.credit_allowed ? 1 : 0,
        credit_limit_paise: r.credit_limit_paise || 0,
        segment: r.customer_segment || 'New',
        visit_count: r.total_visits || 0,
        last_visit_date: r.last_purchase_date,
        last_visit_relative: lastVisitText,
        usual_item_summary: r.typical_basket_summary || r.preferred_cut || '',
        cutting_preference: r.cutting_preference || r.preferred_cut || '',
        whatsapp_bill_consent: r.whatsapp_bill_consent ?? 1,
        marketing_consent: r.marketing_consent ?? 0,
      };
    });

    return {
      results,
      totalMatches,
      collision: totalMatches > 1,
    };
  }

  /**
   * Inline quick-add at the billing counter (Section 8 item 6)
   */
  public quickAddCustomer(data: {
    name?: string;
    phone: string;
    whatsapp_bill_consent?: boolean;
    marketing_consent?: boolean;
  }): any {
    const rawPhone = (data.phone || '').trim();
    const cleanDigits = rawPhone.replace(/\D/g, '');
    const normalized = cleanDigits.length === 10 ? cleanDigits : (cleanDigits.length === 12 && cleanDigits.startsWith('91') ? cleanDigits.slice(2) : null);

    if ((data as any).credit_allowed || (data as any).credit_limit_paise || (data as any).credit_limit) {
      throw new ValidationError('Credit privileges (credit limit, credit allowed) cannot be granted via counter Quick-Add. Admin/Manager customer management is required.');
    }

    if (!normalized || normalized.length !== 10) {
      throw new ValidationError('A valid 10-digit mobile number is required for quick-add.');
    }

    const existing = db.prepare(`
      SELECT id, customer_code, name, phone, phone_normalized, outstanding_balance_paise
      FROM customers 
      WHERE phone_normalized = ? AND (status != 'merged' OR status IS NULL)
    `).get(normalized) as any;

    if (existing) {
      return this.getCustomerById(existing.id);
    }

    const assignedName = (data.name && data.name.trim().length > 0)
      ? data.name.trim()
      : `Customer ...${normalized.slice(-4)}`;

    const userId = this.getCurrentUserId();

    return db.transaction(() => {
      let nextCodeNum = 1;
      const seqRow = db.prepare(`
        UPDATE customer_sequences 
        SET last_number = last_number + 1, updated_at = CURRENT_TIMESTAMP 
        WHERE sequence_key = 'CUSTOMER_CODE' 
        RETURNING last_number
      `).get() as { last_number: number } | undefined;

      if (seqRow && seqRow.last_number) {
        nextCodeNum = seqRow.last_number;
      } else {
        const maxRow = db.prepare(`
          SELECT MAX(CAST(SUBSTR(customer_code, 6) AS INTEGER)) as max_num 
          FROM customers 
          WHERE customer_code LIKE 'CUST-%' AND length(customer_code) = 10
        `).get() as { max_num: number | null };
        nextCodeNum = (maxRow?.max_num || 0) + 1;
        db.prepare(`
          INSERT INTO customer_sequences (sequence_key, last_number, updated_at) 
          VALUES ('CUSTOMER_CODE', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(sequence_key) DO UPDATE SET last_number = excluded.last_number, updated_at = CURRENT_TIMESTAMP
        `).run(nextCodeNum);
      }

      const customerCode = `CUST-${String(nextCodeNum).padStart(5, '0')}`;
      const waBillConsent = data.whatsapp_bill_consent !== false ? 1 : 0;
      const mktConsent = data.marketing_consent ? 1 : 0;

      const stmt = db.prepare(`
        INSERT INTO customers (
          customer_code, name, phone, phone_normalized, whatsapp,
          category, is_active, status, whatsapp_bill_consent, marketing_consent,
          created_by, updated_by
        ) VALUES (
          ?, ?, ?, ?, ?,
          'Retail', 1, 'active', ?, ?,
          ?, ?
        )
      `);

      const result = stmt.run(
        customerCode,
        assignedName,
        rawPhone,
        normalized,
        rawPhone,
        waBillConsent,
        mktConsent,
        userId,
        userId
      );

      const newId = Number(result.lastInsertRowid);

      db.prepare(`
        INSERT INTO customer_activity_logs (customer_id, action, details, performed_by)
        VALUES (?, 'quick_create', 'Created via Cashier Quick-Add at Billing Counter', ?)
      `).run(newId, userId);

      return this.getCustomerById(newId);
    })();
  }

  /**
   * Regulars strip on the billing page (Section 8 item 8)
   * Top regulars sorted by visit frequency, filterable by segment.
   */
  private ensureTierSettingsTable(): void {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS customer_tier_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          vip_min_spend_paise INTEGER NOT NULL DEFAULT 500000,
          vip_min_visits INTEGER NOT NULL DEFAULT 5,
          vip_criteria_mode TEXT NOT NULL DEFAULT 'either',
          regular_min_visits INTEGER NOT NULL DEFAULT 2,
          rare_inactive_days INTEGER NOT NULL DEFAULT 30,
          new_window_days INTEGER NOT NULL DEFAULT 14,
          at_risk_gap_multiplier REAL NOT NULL DEFAULT 2.0,
          wholesale_tags TEXT NOT NULL DEFAULT 'Wholesale,Distributor,Contract',
          restaurant_tags TEXT NOT NULL DEFAULT 'Restaurant,Hotel,Catering',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        INSERT OR IGNORE INTO customer_tier_settings (
          id, vip_min_spend_paise, vip_min_visits, vip_criteria_mode,
          regular_min_visits, rare_inactive_days, new_window_days,
          at_risk_gap_multiplier, wholesale_tags, restaurant_tags
        )
        VALUES (1, 500000, 5, 'either', 2, 30, 14, 2.0, 'Wholesale,Distributor,Contract', 'Restaurant,Hotel,Catering');
      `);
      try { db.exec(`ALTER TABLE customers ADD COLUMN manual_tier TEXT DEFAULT NULL`); } catch (_) {}
      try { db.exec(`ALTER TABLE customers ADD COLUMN preferred_time_slot TEXT DEFAULT NULL`); } catch (_) {}
      try { db.exec(`ALTER TABLE customers ADD COLUMN linked_supplier_id INTEGER DEFAULT NULL`); } catch (_) {}
      try { db.exec(`ALTER TABLE suppliers ADD COLUMN linked_customer_id INTEGER DEFAULT NULL`); } catch (_) {}
      try { db.exec(`ALTER TABLE customer_tier_settings ADD COLUMN new_window_days INTEGER NOT NULL DEFAULT 14`); } catch (_) {}
      try { db.exec(`ALTER TABLE customer_tier_settings ADD COLUMN at_risk_gap_multiplier REAL NOT NULL DEFAULT 2.0`); } catch (_) {}
      try { db.exec(`ALTER TABLE customer_tier_settings ADD COLUMN wholesale_tags TEXT NOT NULL DEFAULT 'Wholesale,Distributor,Contract'`); } catch (_) {}
      try { db.exec(`ALTER TABLE customer_tier_settings ADD COLUMN restaurant_tags TEXT NOT NULL DEFAULT 'Restaurant,Hotel,Catering'`); } catch (_) {}
    } catch (err) {
      logger.warn('Failed ensuring customer tier settings table', { error: err });
    }
  }

  public getTierSettings(): any {
    this.ensureTierSettingsTable();
    const defaults = {
      id: 1,
      vip_min_spend_paise: 500000,
      vip_min_visits: 5,
      vip_criteria_mode: 'either',
      regular_min_visits: 2,
      rare_inactive_days: 30,
      new_window_days: 14,
      at_risk_gap_multiplier: 2.0,
      wholesale_tags: 'Wholesale,Distributor,Contract',
      restaurant_tags: 'Restaurant,Hotel,Catering',
    };
    try {
      const row = db.prepare('SELECT * FROM customer_tier_settings WHERE id = 1').get() as any;
      if (row) return { ...defaults, ...row };
    } catch (_) {}
    return defaults;
  }

  public updateTierSettings(input: any): any {
    this.ensureTierSettingsTable();
    const current = this.getTierSettings();
    const vipMinSpendPaise = input.vip_min_spend_paise !== undefined ? Number(input.vip_min_spend_paise) : current.vip_min_spend_paise;
    const vipMinVisits = input.vip_min_visits !== undefined ? Number(input.vip_min_visits) : current.vip_min_visits;
    const vipCriteriaMode = input.vip_criteria_mode === 'both' ? 'both' : 'either';
    const regularMinVisits = input.regular_min_visits !== undefined ? Number(input.regular_min_visits) : current.regular_min_visits;
    const rareInactiveDays = input.rare_inactive_days !== undefined ? Number(input.rare_inactive_days) : current.rare_inactive_days;
    const newWindowDays = input.new_window_days !== undefined ? Number(input.new_window_days) : current.new_window_days;
    const atRiskGapMultiplier = input.at_risk_gap_multiplier !== undefined ? Number(input.at_risk_gap_multiplier) : current.at_risk_gap_multiplier;
    const wholesaleTags = input.wholesale_tags !== undefined ? String(input.wholesale_tags).trim() : current.wholesale_tags;
    const restaurantTags = input.restaurant_tags !== undefined ? String(input.restaurant_tags).trim() : current.restaurant_tags;

    db.prepare(`
      UPDATE customer_tier_settings SET
        vip_min_spend_paise = ?,
        vip_min_visits = ?,
        vip_criteria_mode = ?,
        regular_min_visits = ?,
        rare_inactive_days = ?,
        new_window_days = ?,
        at_risk_gap_multiplier = ?,
        wholesale_tags = ?,
        restaurant_tags = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(
      vipMinSpendPaise,
      vipMinVisits,
      vipCriteriaMode,
      regularMinVisits,
      rareInactiveDays,
      newWindowDays,
      atRiskGapMultiplier,
      wholesaleTags || 'Wholesale,Distributor,Contract',
      restaurantTags || 'Restaurant,Hotel,Catering'
    );

    this.recalculateCustomerTiers();

    return this.getTierSettings();
  }

  public setManualCustomerTier(customerId: number, tier: string | null, preferredTimeSlot?: string | null): any {
    this.ensureTierSettingsTable();
    const normalizedTier = tier && tier !== 'auto' ? tier.toLowerCase().trim() : null;

    db.prepare(`
      UPDATE customers SET
        manual_tier = ?,
        preferred_time_slot = COALESCE(?, preferred_time_slot),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(normalizedTier, preferredTimeSlot ?? null, customerId);

    if (normalizedTier === 'wholesale') {
      try {
        db.prepare(`UPDATE customers SET category = 'Wholesale', price_tier = 'wholesale' WHERE id = ?`).run(customerId);
      } catch (_) {}
    } else if (normalizedTier === 'restaurant') {
      try {
        db.prepare(`UPDATE customers SET category = 'Restaurant' WHERE id = ?`).run(customerId);
      } catch (_) {}
    } else if (normalizedTier === 'vip') {
      try {
        db.prepare(`UPDATE customers SET price_tier = 'vip' WHERE id = ?`).run(customerId);
      } catch (_) {}
    }

    try {
      customerIntelligenceService.calculateAndCache(customerId);
    } catch (_) {
      try {
        const displaySegment = normalizedTier ? normalizedTier.charAt(0).toUpperCase() + normalizedTier.slice(1) : 'Regular';
        db.prepare(`
          INSERT INTO customer_analytics_cache (customer_id, segment, metrics_json, last_calculated_at)
          VALUES (?, ?, '{}', CURRENT_TIMESTAMP)
          ON CONFLICT(customer_id) DO UPDATE SET
            segment = excluded.segment,
            last_calculated_at = CURRENT_TIMESTAMP
        `).run(customerId, displaySegment);
      } catch (__) {}
    }

    return { success: true, customer: this.getCustomerById(customerId) };
  }

  public recalculateCustomerTiers(): { updatedCount: number; summary: Record<string, number> } {
    this.ensureTierSettingsTable();
    const tierSettings = this.getTierSettings();
    const now = new Date();
    const wholesaleTagList = String(tierSettings.wholesale_tags || 'Wholesale,Distributor,Contract')
      .split(',')
      .map((t: string) => t.trim().toUpperCase())
      .filter(Boolean);
    const restaurantTagList = String(tierSettings.restaurant_tags || 'Restaurant,Hotel,Catering')
      .split(',')
      .map((t: string) => t.trim().toUpperCase())
      .filter(Boolean);

    const customers = db.prepare(`
      SELECT 
        c.id, c.category, c.price_tier, c.manual_tier, c.created_at,
        COUNT(DISTINCT CASE WHEN inv.status = 'completed' THEN DATE(inv.created_at) END) as total_visits,
        COALESCE(SUM(CASE WHEN inv.status = 'completed' THEN inv.total_paise ELSE 0 END), 0) as total_spend_paise,
        MAX(CASE WHEN inv.status = 'completed' THEN inv.created_at END) as last_purchase_date
      FROM customers c
      LEFT JOIN invoices inv ON inv.customer_id = c.id ${this.includeTestData ? '' : 'AND (inv.is_test = 0 OR inv.is_test IS NULL)'}
      WHERE (c.status != 'merged' OR c.status IS NULL)
        AND (c.is_active = 1 OR c.is_active IS NULL)
        AND (c.is_system = 0 OR c.is_system IS NULL)
      GROUP BY c.id
    `).all() as any[];

    const summary: Record<string, number> = {
      VIP: 0,
      Regular: 0,
      New: 0,
      Rare: 0,
      'At Risk': 0,
      Wholesale: 0,
      Restaurant: 0,
    };

    const updateStmt = db.prepare(`
      INSERT INTO customer_analytics_cache (customer_id, segment, metrics_json, last_calculated_at)
      VALUES (?, ?, '{}', CURRENT_TIMESTAMP)
      ON CONFLICT(customer_id) DO UPDATE SET
        segment = excluded.segment,
        last_calculated_at = CURRENT_TIMESTAMP
    `);

    const updateMany = db.transaction((rows: any[]) => {
      for (const row of rows) {
        const catUpper = (row.category || '').toUpperCase();
        const isWholesale = wholesaleTagList.some(tag => catUpper.includes(tag)) || row.price_tier === 'wholesale';
        const isRestaurant = restaurantTagList.some(tag => catUpper.includes(tag));
        const daysSinceLast = row.last_purchase_date ? Math.floor((now.getTime() - new Date(row.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24)) : null;

        let segment = 'New';
        if (row.manual_tier && row.manual_tier !== 'auto') {
          segment = row.manual_tier.charAt(0).toUpperCase() + row.manual_tier.slice(1).toLowerCase();
        } else if (isWholesale) {
          segment = 'Wholesale';
        } else if (isRestaurant) {
          segment = 'Restaurant';
        } else {
          const qualifiesVip = row.price_tier === 'vip' || (
            tierSettings.vip_criteria_mode === 'both'
              ? (row.total_spend_paise >= tierSettings.vip_min_spend_paise && row.total_visits >= tierSettings.vip_min_visits)
              : (row.total_spend_paise >= tierSettings.vip_min_spend_paise || row.total_visits >= tierSettings.vip_min_visits)
          );

          if (qualifiesVip) {
            segment = 'VIP';
          } else if (daysSinceLast !== null && daysSinceLast > tierSettings.rare_inactive_days) {
            segment = 'Rare';
          } else if (row.total_visits >= tierSettings.regular_min_visits) {
            segment = 'Regular';
          } else {
            segment = 'New';
          }
        }

        try {
          const intel = customerIntelligenceService.computeCustomerIntelligence(row.id);
          const finalSeg = (isWholesale && (!row.manual_tier || row.manual_tier === 'auto'))
            ? 'Wholesale'
            : (isRestaurant && (!row.manual_tier || row.manual_tier === 'auto'))
            ? 'Restaurant'
            : intel.customer_segment;
          db.prepare(`
            INSERT INTO customer_analytics_cache (customer_id, segment, metrics_json, last_calculated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(customer_id) DO UPDATE SET
              segment = excluded.segment,
              metrics_json = excluded.metrics_json,
              last_calculated_at = CURRENT_TIMESTAMP
          `).run(row.id, finalSeg, JSON.stringify({ ...intel, customer_segment: finalSeg }));
          segment = finalSeg;
        } catch (_) {
          updateStmt.run(row.id, segment);
        }

        if (!summary[segment]) summary[segment] = 0;
        summary[segment]++;
      }
    });

    updateMany(customers);

    return { updatedCount: customers.length, summary };
  }

  /**
   * Fast smart customer tiles used at POS Express Billing.
   * Time-aware: Customers whose usual shopping window matches current store time appear FIRST.
   * Segmentation: Configurable VIP / Regular / New / Rare / Wholesale / Restaurant.
   */
  public getRegulars(limit = 16, segmentFilter: string = 'all', timeSlotFilter?: string): any[] {
    this.ensureTierSettingsTable();
    const tierSettings = this.getTierSettings();
    const wholesaleTagList = String(tierSettings.wholesale_tags || 'Wholesale,Distributor,Contract')
      .split(',')
      .map((t: string) => t.trim().toUpperCase())
      .filter(Boolean);
    const restaurantTagList = String(tierSettings.restaurant_tags || 'Restaurant,Hotel,Catering')
      .split(',')
      .map((t: string) => t.trim().toUpperCase())
      .filter(Boolean);
    const now = new Date();
    const hour = now.getHours();
    const currentSlot: 'morning' | 'afternoon' | 'evening' = (hour >= 5 && hour < 12) ? 'morning' : (hour >= 12 && hour < 17) ? 'afternoon' : 'evening';

    const testClause = this.includeTestData ? '' : 'AND (c.is_test = 0 OR c.is_test IS NULL)';
    const invTestClause = this.includeTestData ? '' : 'AND (inv.is_test = 0 OR inv.is_test IS NULL)';

    const rows = db.prepare(`
      SELECT 
        c.id,
        c.customer_code,
        c.name,
        c.phone,
        c.phone_normalized,
        c.category,
        c.price_tier,
        c.manual_tier,
        c.preferred_time_slot,
        c.outstanding_balance_paise,
        c.credit_allowed,
        c.preferred_cut,
        c.cutting_preference,
        c.linked_supplier_id,
        cac.segment as cached_segment,
        cac.metrics_json,
        COUNT(DISTINCT CASE WHEN inv.status = 'completed' THEN DATE(inv.created_at) END) as total_visits,
        COALESCE(SUM(CASE WHEN inv.status = 'completed' THEN inv.total_paise ELSE 0 END), 0) as total_spend_paise,
        MAX(CASE WHEN inv.status = 'completed' THEN inv.created_at END) as last_purchase_date,
        SUM(CASE 
          WHEN inv.status = 'completed' AND CAST(strftime('%H', inv.created_at) AS INTEGER) >= 5 AND CAST(strftime('%H', inv.created_at) AS INTEGER) < 12 
          THEN 1 ELSE 0 END) as morning_invoices,
        SUM(CASE 
          WHEN inv.status = 'completed' AND CAST(strftime('%H', inv.created_at) AS INTEGER) >= 12 AND CAST(strftime('%H', inv.created_at) AS INTEGER) < 17 
          THEN 1 ELSE 0 END) as afternoon_invoices,
        SUM(CASE 
          WHEN inv.status = 'completed' AND (CAST(strftime('%H', inv.created_at) AS INTEGER) >= 17 OR CAST(strftime('%H', inv.created_at) AS INTEGER) < 5) 
          THEN 1 ELSE 0 END) as evening_invoices
      FROM customers c
      LEFT JOIN customer_analytics_cache cac ON c.id = cac.customer_id
      LEFT JOIN invoices inv ON inv.customer_id = c.id ${invTestClause}
      WHERE (c.status != 'merged' OR c.status IS NULL)
        AND (c.is_active = 1 OR c.is_active IS NULL)
        AND (c.is_system = 0 OR c.is_system IS NULL)
        ${testClause}
      GROUP BY c.id
    `).all() as any[];

    const mapped = rows.map(r => {
      const parts = (r.name || 'C').trim().split(/\s+/);
      const initials = parts.length >= 2 
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : (r.name ? r.name.slice(0, 2).toUpperCase() : 'CU');

      const m = r.morning_invoices || 0;
      const a = r.afternoon_invoices || 0;
      const e = r.evening_invoices || 0;

      let dominantTimeSlot: 'morning' | 'afternoon' | 'evening' | 'flexible' = 'flexible';
      if (r.preferred_time_slot && r.preferred_time_slot !== 'flexible') {
        dominantTimeSlot = r.preferred_time_slot;
      } else if (m > 0 || a > 0 || e > 0) {
        if (m >= a && m >= e) dominantTimeSlot = 'morning';
        else if (a >= m && a >= e) dominantTimeSlot = 'afternoon';
        else dominantTimeSlot = 'evening';
      }

      const isTimeMatch = (dominantTimeSlot === currentSlot);
      const daysSinceLast = r.last_purchase_date ? Math.floor((now.getTime() - new Date(r.last_purchase_date).getTime()) / (1000 * 60 * 60 * 24)) : null;

      let segment = 'New';
      const catUpper = (r.category || '').toUpperCase();
      const isWholesale = wholesaleTagList.some(tag => catUpper.includes(tag)) || r.price_tier === 'wholesale';
      const isRestaurant = restaurantTagList.some(tag => catUpper.includes(tag));

      if (r.manual_tier && r.manual_tier !== 'auto') {
        segment = r.manual_tier.charAt(0).toUpperCase() + r.manual_tier.slice(1).toLowerCase();
      } else if (isWholesale) {
        segment = 'Wholesale';
      } else if (isRestaurant) {
        segment = 'Restaurant';
      } else {
        const qualifiesVip = r.price_tier === 'vip' || (
          tierSettings.vip_criteria_mode === 'both'
            ? (r.total_spend_paise >= tierSettings.vip_min_spend_paise && r.total_visits >= tierSettings.vip_min_visits)
            : (r.total_spend_paise >= tierSettings.vip_min_spend_paise || r.total_visits >= tierSettings.vip_min_visits)
        );

        if (qualifiesVip) {
          segment = 'VIP';
        } else if (daysSinceLast !== null && daysSinceLast > tierSettings.rare_inactive_days) {
          segment = 'Rare';
        } else if (r.total_visits >= tierSettings.regular_min_visits) {
          segment = 'Regular';
        } else {
          segment = 'New';
        }
      }

      let usualItem = r.preferred_cut || r.cutting_preference || '';
      if (!usualItem && r.metrics_json) {
        try {
          const metrics = JSON.parse(r.metrics_json);
          if (metrics.typical_basket_summary) {
            usualItem = metrics.typical_basket_summary;
          }
        } catch (_) {}
      }

      // Time of day plays the role FIRST!
      let score = 0;
      if (isTimeMatch) {
        score += 100000; // Exact match for current store time window comes FIRST!
      } else if (dominantTimeSlot === 'flexible') {
        score += 25000;
      }

      if (segment === 'VIP') score += 10000;
      else if (segment === 'Regular') score += 6000;
      else if (segment === 'Wholesale' || segment === 'Restaurant') score += 4000;
      else if (segment === 'New') score += 2000;
      else if (segment === 'Rare') score += 500;

      score += (r.total_visits * 10) + Math.min(Math.floor(r.total_spend_paise / 10000), 2000);

      return {
        id: r.id,
        customer_code: r.customer_code,
        name: r.name,
        initials,
        phone: r.phone || null,
        phone_normalized: r.phone_normalized,
        segment,
        manual_tier: r.manual_tier,
        category: r.category,
        price_tier: r.price_tier,
        outstanding_balance_paise: r.outstanding_balance_paise || 0,
        visit_count: r.total_visits || 0,
        total_spend_paise: r.total_spend_paise || 0,
        last_visit_date: r.last_purchase_date,
        days_since_last_purchase: daysSinceLast,
        usual_time_slot: dominantTimeSlot,
        is_time_match: isTimeMatch,
        current_store_slot: currentSlot,
        morning_visits: m,
        afternoon_visits: a,
        evening_visits: e,
        usual_item_summary: usualItem,
        cutting_preference: r.cutting_preference || r.preferred_cut || '',
        _score: score,
      };
    });

    let filtered = mapped;
    if (segmentFilter && segmentFilter !== 'all') {
      const sf = segmentFilter.toLowerCase();
      filtered = filtered.filter(item => item.segment.toLowerCase() === sf);
    }

    if (timeSlotFilter && timeSlotFilter !== 'all') {
      const tf = timeSlotFilter.toLowerCase();
      if (tf === 'now') {
        filtered = filtered.filter(item => item.is_time_match);
      } else {
        filtered = filtered.filter(item => item.usual_time_slot.toLowerCase() === tf);
      }
    }

    filtered.sort((a, b) => b._score - a._score);

    return filtered.slice(0, limit);
  }

  /**
   * Recent customers used at the POS (Section 8 item 7)
   */
  public getRecentCustomers(limit = 10): any[] {
    const rows = db.prepare(`
      SELECT DISTINCT 
        c.id,
        c.customer_code,
        c.name,
        c.phone,
        c.phone_normalized,
        c.outstanding_balance_paise,
        c.credit_allowed,
        cac.segment as customer_segment,
        cac.typical_basket_summary,
        MAX(inv.id) as latest_inv_id
      FROM invoices inv
      JOIN customers c ON inv.customer_id = c.id
      LEFT JOIN customer_analytics_cache cac ON c.id = cac.customer_id
      WHERE (c.status != 'merged' OR c.status IS NULL)
        AND (c.is_system = 0 OR c.is_system IS NULL)
      GROUP BY c.id
      ORDER BY latest_inv_id DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(r => {
      const p = r.phone_normalized || r.phone || '';
      const maskedPhone = p.length >= 4 
        ? `${'*'.repeat(Math.max(0, p.length - 4))}${p.slice(-4)}`
        : p;

      return {
        id: r.id,
        customer_code: r.customer_code,
        name: r.name,
        phone: r.phone,
        phone_normalized: r.phone_normalized,
        masked_phone: maskedPhone,
        outstanding_balance_paise: r.outstanding_balance_paise || 0,
        segment: r.customer_segment || 'Regular',
        usual_item_summary: r.typical_basket_summary || '',
      };
    });
  }

  /**
   * Repeat last order (Section 9):
   * Proposes the customer's last bill or usual items.
   * Re-checks current prices, stock and product availability at the moment of proposal.
   * Flags unavailable items or price differences.
   */
  public getRepeatOrder(customerId: number): {
    hasOrder: boolean;
    lastInvoice?: any;
    items: Array<{
      product_variant_id: number;
      product_id: number;
      product_name: string;
      variant_name: string;
      unit_type: string;
      quantity_grams: number | null;
      quantity_units: number | null;
      display_qty: string;
      previous_rate_paise: number;
      current_rate_paise: number;
      price_changed: boolean;
      price_diff_paise: number;
      is_available: boolean;
      stock_warning?: string;
    }>;
    warnings: string[];
  } {
    const lastInvoice = (db.prepare(`
      SELECT id, invoice_number, total_paise, created_at
      FROM invoices
      WHERE customer_id = ? 
        AND status = 'completed'
        AND status NOT IN ('returned', 'void', 'cancelled')
        AND (is_test = 0 OR is_test IS NULL)
      ORDER BY id DESC
      LIMIT 1
    `).get(customerId) || db.prepare(`
      SELECT id, invoice_number, total_paise, created_at
      FROM invoices
      WHERE customer_id = ? 
        AND status = 'completed'
        AND status NOT IN ('returned', 'void', 'cancelled')
      ORDER BY id DESC
      LIMIT 1
    `).get(customerId)) as any;

    if (!lastInvoice) {
      return { hasOrder: false, items: [], warnings: ['No previous completed orders found for this customer.'] };
    }

    const invoiceItems = db.prepare(`
      SELECT 
        ii.product_variant_id,
        ii.quantity_grams,
        ii.quantity_units,
        COALESCE(ii.rate_paise_snapshot, 0) as unit_price_paise,
        pv.product_id,
        pv.variant_name,
        pv.is_active as variant_active,
        pv.current_rate_paise_per_unit,
        p.name as product_name,
        p.unit_type,
        p.is_active as product_active,
        sl.quantity_grams as stock_grams,
        sl.quantity_units as stock_units
      FROM invoice_items ii
      LEFT JOIN product_variants pv ON ii.product_variant_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      LEFT JOIN stock_ledger sl ON sl.product_variant_id = pv.id
      WHERE ii.invoice_id = ?
    `).all(lastInvoice.id) as any[];

    const warnings: string[] = [];
    const proposedItems = invoiceItems.map(item => {
      const isProductActive = item.product_active === 1 || item.product_active == null;
      const isVariantActive = item.variant_active === 1 || item.variant_active == null;
      const isAvailable = Boolean(isProductActive && isVariantActive);

      const previousRate = item.unit_price_paise || 0;
      const currentRate = item.current_rate_paise_per_unit ?? previousRate;
      const priceChanged = previousRate !== currentRate;
      const priceDiff = currentRate - previousRate;

      const isWeight = item.unit_type === 'weight' || item.unit_type === 'live_dual' || item.quantity_grams != null;
      const displayQty = isWeight 
        ? `${((item.quantity_grams || 0) / 1000).toFixed(2)} kg`
        : `${item.quantity_units || 1} units`;

      let stockWarning: string | undefined;
      if (!isAvailable) {
        stockWarning = `${item.product_name} (${item.variant_name}) is currently inactive/unavailable`;
        warnings.push(stockWarning);
      } else {
        // Stock level revalidation
        if (isWeight && item.stock_grams != null) {
          if (item.stock_grams <= 0) {
            stockWarning = `${item.product_name} is currently out of stock (0 kg available)`;
            warnings.push(stockWarning);
          } else if (item.stock_grams < (item.quantity_grams || 0)) {
            stockWarning = `${item.product_name} has low stock (${(item.stock_grams / 1000).toFixed(2)} kg available, last order was ${((item.quantity_grams || 0) / 1000).toFixed(2)} kg)`;
            warnings.push(stockWarning);
          }
        } else if (!isWeight && item.stock_units != null) {
          if (item.stock_units <= 0) {
            stockWarning = `${item.product_name} is currently out of stock (0 units available)`;
            warnings.push(stockWarning);
          } else if (item.stock_units < (item.quantity_units || 1)) {
            stockWarning = `${item.product_name} has low stock (${item.stock_units} units available, last order was ${item.quantity_units || 1} units)`;
            warnings.push(stockWarning);
          }
        }

        if (priceChanged) {
          const direction = priceDiff > 0 ? 'increased' : 'decreased';
          const diffAmt = (Math.abs(priceDiff) / 100).toFixed(2);
          warnings.push(`${item.product_name} price has ${direction} by ₹${diffAmt} (now ₹${(currentRate / 100).toFixed(2)})`);
        }
      }

      return {
        product_variant_id: item.product_variant_id,
        product_id: item.product_id,
        product_name: item.product_name || 'Item',
        variant_name: item.variant_name || 'Standard',
        unit_type: item.unit_type || 'weight',
        quantity_grams: item.quantity_grams,
        quantity_units: item.quantity_units,
        display_qty: displayQty,
        previous_rate_paise: previousRate,
        current_rate_paise: currentRate,
        price_changed: priceChanged,
        price_diff_paise: priceDiff,
        is_available: isAvailable,
        stock_warning: stockWarning,
      };
    });

    return {
      hasOrder: true,
      lastInvoice: {
        id: lastInvoice.id,
        invoice_number: lastInvoice.invoice_number,
        created_at: lastInvoice.created_at,
        total_paise: lastInvoice.total_paise,
      },
      items: proposedItems,
      warnings,
    };
  }

  /**
   * Record WhatsApp bill send attempt (Section 9)
   * Only stores phone suffix (last 4 digits) for privacy.
   */
  public recordWhatsAppAttempt(data: {
    invoice_id: number;
    customer_id?: number | null;
    phone: string;
  }): { success: boolean; logged_at: string } {
    const raw = (data.phone || '').trim();
    const digitsOnly = raw.replace(/\D/g, '');
    const suffix = digitsOnly.length >= 4 
      ? `******${digitsOnly.slice(-4)}`
      : '******';

    db.prepare(`
      INSERT INTO whatsapp_attempt_logs (
        invoice_id, customer_id, phone_suffix, attempt_type, status, attempted_at
      ) VALUES (?, ?, ?, 'wa_me_link', 'attempted', CURRENT_TIMESTAMP)
    `).run(data.invoice_id, data.customer_id || null, suffix);

    return {
      success: true,
      logged_at: new Date().toISOString(),
    };
  }

  /**
   * Update explicit privacy and communication consent.
   */
  public updateConsent(customerId: number, consent: { whatsapp_bill_consent?: number; marketing_consent?: number }): any {
    const cust = this.getCustomerById(customerId);
    const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const params: any[] = [];

    if (consent.whatsapp_bill_consent !== undefined) {
      updates.push('whatsapp_bill_consent = ?');
      params.push(consent.whatsapp_bill_consent ? 1 : 0);
    }
    if (consent.marketing_consent !== undefined) {
      updates.push('marketing_consent = ?');
      params.push(consent.marketing_consent ? 1 : 0);
    }

    params.push(customerId);
    db.prepare(`UPDATE customers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    return this.getCustomerById(customerId);
  }
}

export const customerService = new CustomerService();
