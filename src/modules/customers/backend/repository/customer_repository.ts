import { Database } from 'better-sqlite3';
import { IDatabaseProvider } from '../../../../core/database/database_provider';
import { NotFoundError } from '../../../../core/backend/errors';

export interface FullCustomerRow {
  id: number;
  customer_code: string;
  name: string;
  business_name: string | null;
  gstin: string | null;
  pan: string | null;
  phone: string | null;
  phone2: string | null;
  whatsapp: string | null;
  email: string | null;
  billing_address_line1: string | null;
  billing_address_line2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_pincode: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_pincode: string | null;
  delivery_notes: string | null;
  group_id: number | null;
  category: string;
  is_active: number;
  credit_allowed: number;
  credit_limit_paise: number;
  outstanding_balance_paise: number;
  advance_balance_paise: number;
  opening_balance_paise: number;
  opening_balance_date: string | null;
  preferred_payment_method: string;
  preferred_delivery_time: string | null;
  price_tier: string;
  manual_tier?: string | null;
  preferred_time_slot?: string | null;
  discount_percent: number;
  notes: string | null;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  // joined
  group_name?: string;
}

export interface CreateCustomerInput {
  name: string;
  business_name?: string | null;
  gstin?: string | null;
  pan?: string | null;
  phone?: string | null;
  phone2?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  billing_address_line1?: string | null;
  billing_address_line2?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_pincode?: string | null;
  category?: string;
  group_id?: number | null;
  credit_allowed?: boolean;
  credit_limit_paise?: number;
  opening_balance_paise?: number;
  opening_balance_date?: string | null;
  preferred_payment_method?: string;
  price_tier?: string;
  manual_tier?: string | null;
  preferred_time_slot?: string | null;
  discount_percent?: number;
  notes?: string | null;
  created_by?: number | null;
}

const CUSTOMER_SELECT = `
  SELECT c.*, cg.name AS group_name
  FROM customers c
  LEFT JOIN customer_groups cg ON c.group_id = cg.id
`;

export class CustomerRepository {
  constructor(private dbProvider: IDatabaseProvider) {}

  private get db(): Database {
    return this.dbProvider.getRawConnection();
  }

  public findAll(includeInactive = false): FullCustomerRow[] {
    const whereClause = includeInactive ? '' : 'WHERE c.is_active = 1';
    return this.db
      .prepare(`${CUSTOMER_SELECT} ${whereClause} ORDER BY c.name`)
      .all() as FullCustomerRow[];
  }

  public findById(id: number): FullCustomerRow {
    const row = this.db
      .prepare(`${CUSTOMER_SELECT} WHERE c.id = ?`)
      .get(id) as FullCustomerRow | undefined;
    if (!row) throw new NotFoundError(`Customer with id ${id} not found`);
    return row;
  }

  public findByPhone(phone: string): FullCustomerRow | undefined {
    return this.db
      .prepare(`${CUSTOMER_SELECT} WHERE c.phone = ?`)
      .get(phone) as FullCustomerRow | undefined;
  }

  public findByCode(code: string): FullCustomerRow | undefined {
    return this.db
      .prepare(`${CUSTOMER_SELECT} WHERE c.customer_code = ?`)
      .get(code) as FullCustomerRow | undefined;
  }

  public search(query: string, limit = 20): FullCustomerRow[] {
    const pattern = `%${query}%`;
    return this.db
      .prepare(
        `${CUSTOMER_SELECT}
         WHERE c.is_active = 1
           AND (c.name LIKE ? OR c.phone LIKE ? OR c.business_name LIKE ?)
         ORDER BY c.name
         LIMIT ?`
      )
      .all(pattern, pattern, pattern, limit) as FullCustomerRow[];
  }

  public create(input: CreateCustomerInput, createdBy: number): FullCustomerRow {
    const createFn = this.db.transaction(() => {
      const maxRow = this.db
        .prepare('SELECT MAX(id) as maxId FROM customers')
        .get() as { maxId: number | null };
      const nextId = (maxRow.maxId ?? 0) + 1;
      const customerCode = `CUST-${String(nextId).padStart(6, '0')}`;

      const stmt = this.db.prepare(`
        INSERT INTO customers (
          customer_code, name, business_name, gstin, pan,
          phone, phone2, whatsapp, email,
          billing_address_line1, billing_address_line2,
          billing_city, billing_state, billing_pincode,
          category, group_id,
          credit_allowed, credit_limit_paise,
          outstanding_balance_paise, advance_balance_paise,
          opening_balance_paise, opening_balance_date,
          preferred_payment_method, price_tier, discount_percent,
          notes, created_by, updated_by
        ) VALUES (
          @customer_code, @name, @business_name, @gstin, @pan,
          @phone, @phone2, @whatsapp, @email,
          @billing_address_line1, @billing_address_line2,
          @billing_city, @billing_state, @billing_pincode,
          @category, @group_id,
          @credit_allowed, @credit_limit_paise,
          0, 0,
          @opening_balance_paise, @opening_balance_date,
          @preferred_payment_method, @price_tier, @discount_percent,
          @notes, @created_by, @created_by
        )
      `);

      const result = stmt.run({
        customer_code: customerCode,
        name: input.name,
        business_name: input.business_name ?? null,
        gstin: input.gstin ?? null,
        pan: input.pan ?? null,
        phone: input.phone ?? null,
        phone2: input.phone2 ?? null,
        whatsapp: input.whatsapp ?? null,
        email: input.email ?? null,
        billing_address_line1: input.billing_address_line1 ?? null,
        billing_address_line2: input.billing_address_line2 ?? null,
        billing_city: input.billing_city ?? null,
        billing_state: input.billing_state ?? null,
        billing_pincode: input.billing_pincode ?? null,
        category: input.category ?? 'general',
        group_id: input.group_id ?? null,
        credit_allowed: input.credit_allowed ? 1 : 0,
        credit_limit_paise: input.credit_limit_paise ?? 0,
        opening_balance_paise: input.opening_balance_paise ?? 0,
        opening_balance_date: input.opening_balance_date ?? null,
        preferred_payment_method: input.preferred_payment_method ?? 'cash',
        price_tier: input.price_tier ?? 'standard',
        discount_percent: input.discount_percent ?? 0,
        notes: input.notes ?? null,
        created_by: createdBy,
      });

      return result.lastInsertRowid as number;
    });

    const newId = createFn();
    return this.findById(newId);
  }

  public update(
    id: number,
    fields: Partial<CreateCustomerInput>,
    updatedBy: number
  ): FullCustomerRow {
    const existing = this.findById(id);

    this.db.prepare(`
      UPDATE customers SET
        name                   = @name,
        business_name          = @business_name,
        gstin                  = @gstin,
        pan                    = @pan,
        phone                  = @phone,
        phone2                 = @phone2,
        whatsapp               = @whatsapp,
        email                  = @email,
        billing_address_line1  = @billing_address_line1,
        billing_address_line2  = @billing_address_line2,
        billing_city           = @billing_city,
        billing_state          = @billing_state,
        billing_pincode        = @billing_pincode,
        category               = @category,
        group_id               = @group_id,
        credit_allowed         = @credit_allowed,
        credit_limit_paise     = @credit_limit_paise,
        opening_balance_paise  = @opening_balance_paise,
        opening_balance_date   = @opening_balance_date,
        preferred_payment_method = @preferred_payment_method,
        price_tier             = @price_tier,
        manual_tier            = @manual_tier,
        preferred_time_slot    = @preferred_time_slot,
        discount_percent       = @discount_percent,
        notes                  = @notes,
        updated_by             = @updated_by,
        updated_at             = CURRENT_TIMESTAMP
      WHERE id = @id
    `).run({
      id,
      name: fields.name ?? existing.name,
      business_name: fields.business_name !== undefined ? fields.business_name : existing.business_name,
      gstin: fields.gstin !== undefined ? fields.gstin : existing.gstin,
      pan: fields.pan !== undefined ? fields.pan : existing.pan,
      phone: fields.phone !== undefined ? fields.phone : existing.phone,
      phone2: fields.phone2 !== undefined ? fields.phone2 : existing.phone2,
      whatsapp: fields.whatsapp !== undefined ? fields.whatsapp : existing.whatsapp,
      email: fields.email !== undefined ? fields.email : existing.email,
      billing_address_line1: fields.billing_address_line1 !== undefined ? fields.billing_address_line1 : existing.billing_address_line1,
      billing_address_line2: fields.billing_address_line2 !== undefined ? fields.billing_address_line2 : existing.billing_address_line2,
      billing_city: fields.billing_city !== undefined ? fields.billing_city : existing.billing_city,
      billing_state: fields.billing_state !== undefined ? fields.billing_state : existing.billing_state,
      billing_pincode: fields.billing_pincode !== undefined ? fields.billing_pincode : existing.billing_pincode,
      category: fields.category ?? existing.category,
      group_id: fields.group_id !== undefined ? fields.group_id : existing.group_id,
      credit_allowed: fields.credit_allowed !== undefined
        ? (fields.credit_allowed ? 1 : 0)
        : existing.credit_allowed,
      credit_limit_paise: fields.credit_limit_paise ?? existing.credit_limit_paise,
      opening_balance_paise: fields.opening_balance_paise ?? existing.opening_balance_paise,
      opening_balance_date: fields.opening_balance_date !== undefined ? fields.opening_balance_date : existing.opening_balance_date,
      preferred_payment_method: fields.preferred_payment_method ?? existing.preferred_payment_method,
      price_tier: fields.price_tier ?? existing.price_tier,
      manual_tier: fields.manual_tier !== undefined ? fields.manual_tier : existing.manual_tier,
      preferred_time_slot: fields.preferred_time_slot !== undefined ? fields.preferred_time_slot : existing.preferred_time_slot,
      discount_percent: fields.discount_percent ?? existing.discount_percent,
      notes: fields.notes !== undefined ? fields.notes : existing.notes,
      updated_by: updatedBy,
    });

    return this.findById(id);
  }

  public deactivate(id: number): void {
    this.db
      .prepare('UPDATE customers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(id);
  }

  public reactivate(id: number): void {
    this.db
      .prepare('UPDATE customers SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(id);
  }

  public updateBalances(
    id: number,
    delta: { outstanding?: number; advance?: number }
  ): void {
    if (delta.outstanding !== undefined && delta.advance !== undefined) {
      this.db
        .prepare(
          `UPDATE customers
           SET outstanding_balance_paise = outstanding_balance_paise + @outstanding,
               advance_balance_paise     = advance_balance_paise + @advance,
               updated_at                = CURRENT_TIMESTAMP
           WHERE id = @id`
        )
        .run({ id, outstanding: delta.outstanding, advance: delta.advance });
    } else if (delta.outstanding !== undefined) {
      this.db
        .prepare(
          `UPDATE customers
           SET outstanding_balance_paise = outstanding_balance_paise + ?,
               updated_at                = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .run(delta.outstanding, id);
    } else if (delta.advance !== undefined) {
      this.db
        .prepare(
          `UPDATE customers
           SET advance_balance_paise = advance_balance_paise + ?,
               updated_at            = CURRENT_TIMESTAMP
           WHERE id = ?`
        )
        .run(delta.advance, id);
    }
  }

  public countAll(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM customers')
      .get() as { cnt: number } | undefined;
    return row?.cnt ?? 0;
  }

  public findWithOutstanding(): FullCustomerRow[] {
    return this.db
      .prepare(
        `${CUSTOMER_SELECT}
         WHERE c.outstanding_balance_paise > 0
         ORDER BY c.name`
      )
      .all() as FullCustomerRow[];
  }

  public findWithAdvance(): FullCustomerRow[] {
    return this.db
      .prepare(
        `${CUSTOMER_SELECT}
         WHERE c.advance_balance_paise > 0
         ORDER BY c.name`
      )
      .all() as FullCustomerRow[];
  }
}
