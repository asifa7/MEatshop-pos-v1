import { db } from '../../../../core/backend/db';
import { NotFoundError } from '../../../../core/backend/errors';
import { customerService } from './customer_service';

export interface AgingBucketConfig {
  index: number;
  label: string;
  shortLabel: string;
  min_days: number;
  max_days: number | null;
  key: string;
}

export interface AgingReportRowInvoice {
  id: number;
  invoice_number: string;
  completed_at: string;
  total_paise: number;
  paid_paise: number;
  remaining_paise: number;
  days_overdue: number;
  bucket_index: number;
}

export interface DynamicAgingReportRow {
  customer_id: number;
  customer_code: string;
  name: string;
  phone: string | null;
  category: string;
  outstanding_paise: number;
  bucket_values: number[]; // Array indexed corresponding to buckets
  // Backward compatibility fields for 4 standard buckets:
  current_paise: number;
  days_1_30_paise: number;
  days_31_60_paise: number;
  days_61_90_paise: number;
  days_91_180_paise: number;
  days_180_plus_paise: number;
  last_payment_date: string | null;
  credit_limit_paise: number;
  available_credit_paise: number;
  risk_level: 'low' | 'medium' | 'high';
  invoices: AgingReportRowInvoice[];
}

export interface AgingReportResult {
  asOfDate: string;
  boundaries: number[];
  buckets: AgingBucketConfig[];
  rows: DynamicAgingReportRow[];
  totals: {
    outstanding_paise: number;
    bucket_totals: number[];
    customer_count: number;
  };
}

export class ARReportsService {
  /**
   * Helper to retrieve Shop Info from system_settings
   */
  public getShopInfo() {
    try {
      const rows = db.prepare('SELECT key, value FROM system_settings').all() as { key: string; value: string }[];
      const map = new Map(rows.map((r) => [r.key, r.value]));
      return {
        name: map.get('shop_name') || 'Premium Meat Shop',
        address: map.get('shop_address') || map.get('address') || 'Main Market, City Center',
        phone: map.get('shop_phone') || map.get('phone') || '+91 98765 43210',
        gstin: map.get('gstin') || map.get('shop_gstin') || '29AAAAA0000A1Z5',
        email: map.get('shop_email') || map.get('email') || 'contact@meatpos.local',
        currency: map.get('currency') || 'INR',
      };
    } catch {
      return {
        name: 'Premium Meat Shop',
        address: 'Main Market, City Center',
        phone: '+91 98765 43210',
        gstin: '29AAAAA0000A1Z5',
        email: 'contact@meatpos.local',
        currency: 'INR',
      };
    }
  }

  /**
   * Get configured aging bucket boundaries (default [15, 30, 60])
   */
  public getAgingSettings(): { boundaries: number[]; defaultBoundaries: number[] } {
    const defaultBoundaries = [15, 30, 60];
    try {
      const row = db.prepare('SELECT value FROM system_settings WHERE key = ?').get('aging_bucket_boundaries') as { value: string } | undefined;
      if (row?.value) {
        const parts = row.value.split(',').map((v) => parseInt(v.trim(), 10)).filter((v) => !isNaN(v) && v > 0);
        if (parts.length >= 2) {
          parts.sort((a, b) => a - b);
          return { boundaries: parts, defaultBoundaries };
        }
      }
    } catch (e) {
      // fallback
    }
    return { boundaries: defaultBoundaries, defaultBoundaries };
  }

  /**
   * Update aging bucket boundaries in system_settings
   */
  public updateAgingSettings(boundaries: number[]) {
    if (!Array.isArray(boundaries) || boundaries.length < 2) {
      throw new Error('Aging boundaries must contain at least 2 positive numbers');
    }
    const cleanBoundaries = [...boundaries]
      .map((b) => Number(b))
      .filter((b) => !isNaN(b) && b > 0)
      .sort((a, b) => a - b);

    if (cleanBoundaries.length < 2) {
      throw new Error('Invalid aging boundaries specified');
    }

    const valueStr = cleanBoundaries.join(',');
    db.prepare(`
      INSERT INTO system_settings (key, value, updated_at) 
      VALUES ('aging_bucket_boundaries', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(valueStr);

    return { success: true, boundaries: cleanBoundaries };
  }

  /**
   * Build bucket configuration array from boundaries
   */
  public buildBuckets(boundaries: number[]): AgingBucketConfig[] {
    const sorted = [...boundaries].sort((a, b) => a - b);
    const buckets: AgingBucketConfig[] = [];

    // Bucket 0: 0 - boundaries[0]
    buckets.push({
      index: 0,
      label: `0–${sorted[0]} Days`,
      shortLabel: `0–${sorted[0]}d`,
      min_days: 0,
      max_days: sorted[0],
      key: 'b0',
    });

    // Intermediate buckets
    for (let i = 0; i < sorted.length - 1; i++) {
      const min = sorted[i] + 1;
      const max = sorted[i + 1];
      buckets.push({
        index: i + 1,
        label: `${min}–${max} Days`,
        shortLabel: `${min}–${max}d`,
        min_days: min,
        max_days: max,
        key: `b${i + 1}`,
      });
    }

    // Last bucket: > last boundary
    const lastBoundary = sorted[sorted.length - 1];
    buckets.push({
      index: sorted.length,
      label: `${lastBoundary}+ Days`,
      shortLabel: `${lastBoundary}d+`,
      min_days: lastBoundary + 1,
      max_days: null,
      key: `b${sorted.length}`,
    });

    return buckets;
  }

  public getCustomerLedger(customerId: number, opts: { startDate?: string; endDate?: string; limit?: number; offset?: number } = {}) {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    let baseQuery = 'SELECT * FROM customer_ledger WHERE customer_id = ?';
    const params: any[] = [customerId];

    if (opts.startDate) {
      baseQuery += ' AND entry_date >= ?';
      params.push(opts.startDate);
    }
    if (opts.endDate) {
      baseQuery += ' AND entry_date <= ?';
      params.push(opts.endDate);
    }

    baseQuery += ' ORDER BY id ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return db.prepare(baseQuery).all(...params);
  }

  public getCustomerStatement(customerId: number, startDate: string, endDate: string) {
    const customer = customerService.getCustomerById(customerId) as any;
    if (!customer) {
      throw new NotFoundError(`Customer #${customerId} not found`);
    }

    const shopInfo = this.getShopInfo();

    // 1. Get opening balance (running balance of the last entry before startDate)
    const lastPriorEntry = db.prepare(`
      SELECT running_balance_paise FROM customer_ledger 
      WHERE customer_id = ? AND entry_date < ? 
      ORDER BY id DESC LIMIT 1
    `).get(customerId, startDate) as { running_balance_paise: number } | undefined;

    const opening_balance_paise = lastPriorEntry ? lastPriorEntry.running_balance_paise : (customer.opening_balance_paise || 0);

    // 2. Get entries in period
    const entries = db.prepare(`
      SELECT * FROM customer_ledger 
      WHERE customer_id = ? AND entry_date BETWEEN ? AND ? 
      ORDER BY entry_date ASC, id ASC
    `).all(customerId, startDate, endDate) as any[];

    // 3. Calculate summary metrics
    let total_debits_paise = 0;
    let total_credits_paise = 0;
    for (const entry of entries) {
      total_debits_paise += entry.debit_paise;
      total_credits_paise += entry.credit_paise;
    }

    const closing_balance_paise = entries.length > 0 
      ? entries[entries.length - 1].running_balance_paise 
      : (opening_balance_paise + total_debits_paise - total_credits_paise);

    return {
      shopInfo,
      customer,
      opening_balance_paise,
      entries,
      closing_balance_paise,
      total_debits_paise,
      total_credits_paise,
      startDate,
      endDate
    };
  }

  /**
   * Section A: Configurable Aging Schedule
   * Guaranteed consistency: Customer bucket values sum strictly to cust.outstanding_balance_paise
   */
  public getAgingReport(opts?: { asOfDate?: string; boundaries?: number[] } | string): AgingReportResult {
    let targetDate = new Date().toISOString().split('T')[0];
    let customBoundaries: number[] | undefined;

    if (typeof opts === 'string') {
      targetDate = opts || targetDate;
    } else if (opts && typeof opts === 'object') {
      if (opts.asOfDate) targetDate = opts.asOfDate;
      if (opts.boundaries && Array.isArray(opts.boundaries) && opts.boundaries.length >= 2) {
        customBoundaries = opts.boundaries;
      }
    }

    const boundaries = customBoundaries || this.getAgingSettings().boundaries;
    const buckets = this.buildBuckets(boundaries);

    // Read all customers with outstanding balance or credit accounts
    const customers = db.prepare(`
      SELECT c.id, c.customer_code, c.name, c.phone, c.category, c.outstanding_balance_paise, c.credit_limit_paise, 
             cca.is_frozen, cca.is_blacklisted
      FROM customers c
      LEFT JOIN customer_credit_accounts cca ON c.id = cca.customer_id
      WHERE (c.outstanding_balance_paise > 0 OR c.credit_allowed = 1)
        AND (c.is_test = 0 OR c.is_test IS NULL)
        AND (c.is_system = 0 OR c.is_system IS NULL)
        AND (c.status != 'merged' OR c.status IS NULL)
      ORDER BY c.outstanding_balance_paise DESC
    `).all() as any[];

    const rows: DynamicAgingReportRow[] = [];
    const bucketTotals = new Array(buckets.length).fill(0);
    let totalOutstanding = 0;

    for (const cust of customers) {
      const custOutstanding = cust.outstanding_balance_paise || 0;

      // Find all unpaid invoices
      const unpaidRaw = db.prepare(`
        SELECT id, invoice_number, completed_at, total_paise,
          COALESCE((SELECT SUM(amount_paise) FROM payments WHERE invoice_id = invoices.id), 0) as direct_paid_paise,
          COALESCE((SELECT SUM(allocated_paise) FROM customer_payment_allocations WHERE invoice_id = invoices.id), 0) as allocated_paise
        FROM invoices
        WHERE customer_id = ? AND status = 'completed' AND completed_at <= ? AND payment_status IN ('unpaid', 'partial')
        ORDER BY completed_at ASC, id ASC
      `).all(cust.id, targetDate + ' 23:59:59') as any[];

      const bucketValues = new Array(buckets.length).fill(0);
      const invoiceDetails: AgingReportRowInvoice[] = [];
      let sumCalculatedInvoices = 0;

      for (const inv of unpaidRaw) {
        const totalPaid = inv.direct_paid_paise + inv.allocated_paise;
        const remaining = Math.max(0, inv.total_paise - totalPaid);
        if (remaining <= 0) continue;

        const diffMs = new Date(targetDate).getTime() - new Date(inv.completed_at).getTime();
        const days = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        // Find which bucket this invoice falls in
        let assignedBucketIdx = buckets.length - 1; // default to oldest
        for (let b = 0; b < buckets.length; b++) {
          const cfg = buckets[b];
          if (cfg.max_days !== null) {
            if (days <= cfg.max_days) {
              assignedBucketIdx = b;
              break;
            }
          }
        }

        bucketValues[assignedBucketIdx] += remaining;
        sumCalculatedInvoices += remaining;

        invoiceDetails.push({
          id: inv.id,
          invoice_number: inv.invoice_number || `INV-${inv.id}`,
          completed_at: inv.completed_at,
          total_paise: inv.total_paise,
          paid_paise: totalPaid,
          remaining_paise: remaining,
          days_overdue: days,
          bucket_index: assignedBucketIdx,
        });
      }

      // Reconcile bucket values with customer's live outstanding_balance_paise
      // (ensuring exact mathematical consistency with Outstanding Dashboard)
      if (custOutstanding > 0) {
        if (sumCalculatedInvoices === 0) {
          // No active invoices found (e.g. legacy opening balance), assign directly to oldest bucket
          bucketValues[bucketValues.length - 1] = custOutstanding;
        } else if (sumCalculatedInvoices !== custOutstanding) {
          const delta = custOutstanding - sumCalculatedInvoices;
          if (delta > 0) {
            // Opening balance or unaccounted debt: assign delta to oldest bucket
            bucketValues[bucketValues.length - 1] += delta;
          } else {
            // Scale down from newest to oldest if allocations reduced outstanding
            let toReduce = -delta;
            for (let b = bucketValues.length - 1; b >= 0; b--) {
              if (toReduce <= 0) break;
              const reduce = Math.min(bucketValues[b], toReduce);
              bucketValues[b] -= reduce;
              toReduce -= reduce;
            }
          }
        }
      } else {
        // If customer has 0 outstanding balance, all buckets are 0
        bucketValues.fill(0);
      }

      // Accumulate totals
      totalOutstanding += custOutstanding;
      for (let b = 0; b < buckets.length; b++) {
        bucketTotals[b] += bucketValues[b];
      }

      // Find last payment date
      const lastPay = db.prepare(`
        SELECT payment_date FROM customer_payment_records 
        WHERE customer_id = ? AND payment_date <= ?
        ORDER BY payment_date DESC LIMIT 1
      `).get(cust.id, targetDate) as { payment_date: string } | undefined;

      // Risk estimation based on overdue age & account status
      let risk_level: 'low' | 'medium' | 'high' = 'low';
      const oldestBucketValue = bucketValues[bucketValues.length - 1] || 0;
      const middleBucketsValue = bucketValues.slice(1, bucketValues.length - 1).reduce((a, b) => a + b, 0);

      if (cust.is_blacklisted === 1 || cust.is_frozen === 1 || oldestBucketValue > 0) {
        risk_level = 'high';
      } else if (middleBucketsValue > 0) {
        risk_level = 'medium';
      }

      rows.push({
        customer_id: cust.id,
        customer_code: cust.customer_code,
        name: cust.name,
        phone: cust.phone,
        category: cust.category || 'Retail',
        outstanding_paise: custOutstanding,
        bucket_values: bucketValues,
        // Backward-compatible properties for 4 buckets:
        current_paise: bucketValues[0] || 0,
        days_1_30_paise: bucketValues[1] || 0,
        days_31_60_paise: bucketValues[2] || 0,
        days_61_90_paise: bucketValues[3] || 0,
        days_91_180_paise: 0,
        days_180_plus_paise: 0,
        last_payment_date: lastPay ? lastPay.payment_date : null,
        credit_limit_paise: cust.credit_limit_paise || 0,
        available_credit_paise: Math.max(0, (cust.credit_limit_paise || 0) - custOutstanding),
        risk_level,
        invoices: invoiceDetails,
      });
    }

    return {
      asOfDate: targetDate,
      boundaries,
      buckets,
      rows,
      totals: {
        outstanding_paise: totalOutstanding,
        bucket_totals: bucketTotals,
        customer_count: rows.length,
      },
    };
  }

  /**
   * Drill-down: Get all overdue/unpaid invoices for a specific customer
   */
  public getCustomerOverdueInvoices(customerId: number, asOfDate?: string) {
    const targetDate = asOfDate || new Date().toISOString().split('T')[0];

    const customer = db.prepare('SELECT id, customer_code, name, phone, outstanding_balance_paise FROM customers WHERE id = ?').get(customerId) as any;
    if (!customer) {
      throw new NotFoundError(`Customer #${customerId} not found`);
    }

    const invoices = db.prepare(`
      SELECT i.id, i.invoice_number, i.completed_at, i.total_paise, i.subtotal_paise, i.tax_paise, i.payment_status,
        COALESCE((SELECT SUM(amount_paise) FROM payments WHERE invoice_id = i.id), 0) as direct_paid_paise,
        COALESCE((SELECT SUM(allocated_paise) FROM customer_payment_allocations WHERE invoice_id = i.id), 0) as allocated_paise
      FROM invoices i
      WHERE i.customer_id = ? AND i.status = 'completed' AND i.completed_at <= ? AND i.payment_status IN ('unpaid', 'partial')
      ORDER BY i.completed_at ASC, i.id ASC
    `).all(customerId, targetDate + ' 23:59:59') as any[];

    return {
      customer,
      asOfDate: targetDate,
      invoices: invoices.map((inv) => {
        const totalPaid = inv.direct_paid_paise + inv.allocated_paise;
        const remaining = Math.max(0, inv.total_paise - totalPaid);
        const diffMs = new Date(targetDate).getTime() - new Date(inv.completed_at).getTime();
        const daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

        return {
          id: inv.id,
          invoice_number: inv.invoice_number || `INV-${inv.id}`,
          completed_at: inv.completed_at,
          total_paise: inv.total_paise,
          paid_paise: totalPaid,
          remaining_paise: remaining,
          days_overdue: daysOverdue,
          payment_status: inv.payment_status,
        };
      }),
    };
  }

  public getOutstandingReport(filters: { category?: string; minOutstanding?: number } = {}) {
    let query = `
      SELECT c.*, cg.name as group_name 
      FROM customers c 
      LEFT JOIN customer_groups cg ON c.group_id = cg.id 
      WHERE c.outstanding_balance_paise > 0
        AND (c.is_test = 0 OR c.is_test IS NULL)
        AND (c.is_system = 0 OR c.is_system IS NULL)
        AND (c.status != 'merged' OR c.status IS NULL)
    `;
    const params: any[] = [];

    if (filters.category) {
      query += ' AND c.category = ?';
      params.push(filters.category);
    }
    if (filters.minOutstanding) {
      query += ' AND c.outstanding_balance_paise >= ?';
      params.push(filters.minOutstanding);
    }

    query += ' ORDER BY c.outstanding_balance_paise DESC';
    return db.prepare(query).all(...params);
  }

  /**
   * Section C: Filterable Collection Report with invoice allocation tracking
   */
  public getCollectionReport(opts: { startDate: string; endDate: string; customerId?: number; method?: string; receivedBy?: number } | string, endDateParam?: string) {
    let startDate = '';
    let endDate = '';
    let customerId: number | undefined;
    let method: string | undefined;
    let receivedBy: number | undefined;

    if (typeof opts === 'string') {
      startDate = opts;
      endDate = endDateParam || opts;
    } else if (opts && typeof opts === 'object') {
      startDate = opts.startDate;
      endDate = opts.endDate;
      customerId = opts.customerId;
      method = opts.method;
      receivedBy = opts.receivedBy;
    }

    let sql = `
      SELECT p.*, c.name as customer_name, c.customer_code, u.username as received_by_name
      FROM customer_payment_records p
      JOIN customers c ON p.customer_id = c.id
      LEFT JOIN users u ON p.received_by = u.id
      WHERE p.payment_date BETWEEN ? AND ?
    `;
    const params: any[] = [startDate, endDate];

    if (customerId) {
      sql += ' AND p.customer_id = ?';
      params.push(customerId);
    }
    if (method && method !== 'all') {
      sql += ' AND p.method = ?';
      params.push(method);
    }
    if (receivedBy) {
      sql += ' AND p.received_by = ?';
      params.push(receivedBy);
    }

    sql += ' ORDER BY p.payment_date DESC, p.id DESC';

    const payments = db.prepare(sql).all(...params) as any[];

    // Fetch allocations for each payment record
    const by_method: Record<string, { count: number; total_paise: number }> = {
      cash: { count: 0, total_paise: 0 },
      upi: { count: 0, total_paise: 0 },
      card: { count: 0, total_paise: 0 },
      bank_transfer: { count: 0, total_paise: 0 },
      cheque: { count: 0, total_paise: 0 },
      advance_adjustment: { count: 0, total_paise: 0 },
    };

    let total_collected_paise = 0;
    let total_allocated_paise = 0;
    let total_unallocated_paise = 0;

    const enrichedPayments = payments.map((p) => {
      total_collected_paise += p.amount_paise;

      const m = p.method as string;
      if (!by_method[m]) {
        by_method[m] = { count: 0, total_paise: 0 };
      }
      by_method[m].count += 1;
      by_method[m].total_paise += p.amount_paise;

      // Query allocations for this payment
      const allocations = db.prepare(`
        SELECT cpa.allocated_paise, i.id as invoice_id, i.invoice_number, i.completed_at as invoice_date
        FROM customer_payment_allocations cpa
        JOIN invoices i ON cpa.invoice_id = i.id
        WHERE cpa.payment_id = ?
        ORDER BY cpa.id ASC
      `).all(p.id) as { allocated_paise: number; invoice_id: number; invoice_number: string; invoice_date: string }[];

      const paymentAllocated = allocations.reduce((sum, a) => sum + a.allocated_paise, 0);
      const unallocated = Math.max(0, p.amount_paise - paymentAllocated);

      total_allocated_paise += paymentAllocated;
      total_unallocated_paise += unallocated;

      return {
        ...p,
        allocations,
        allocated_paise: paymentAllocated,
        unallocated_paise: unallocated,
        is_on_account: unallocated > 0,
        received_by_display: p.received_by_name || (p.received_by ? `User #${p.received_by}` : 'Staff'),
      };
    });

    return {
      startDate,
      endDate,
      total_collected_paise,
      total_allocated_paise,
      total_unallocated_paise,
      transaction_count: enrichedPayments.length,
      by_method,
      payments: enrichedPayments,
    };
  }

  public getAdvanceBalanceReport() {
    return db.prepare(`
      SELECT c.*, cg.name as group_name 
      FROM customers c 
      LEFT JOIN customer_groups cg ON c.group_id = cg.id 
      WHERE c.advance_balance_paise > 0
        AND (c.is_test = 0 OR c.is_test IS NULL)
        AND (c.is_system = 0 OR c.is_system IS NULL)
        AND (c.status != 'merged' OR c.status IS NULL)
      ORDER BY c.advance_balance_paise DESC
    `).all();
  }

  public getOverdueReport(asOfDate?: string) {
    const target = asOfDate || new Date().toISOString().split('T')[0];

    const customers = db.prepare(`
      SELECT c.id, c.customer_code, c.name, c.phone, c.outstanding_balance_paise
      FROM customers c
      WHERE c.outstanding_balance_paise > 0
        AND (c.is_test = 0 OR c.is_test IS NULL)
        AND (c.is_system = 0 OR c.is_system IS NULL)
        AND (c.status != 'merged' OR c.status IS NULL)
    `).all() as any[];

    const result: any[] = [];
    for (const cust of customers) {
      // Find the oldest invoice overdue by more than 30 days
      const oldest = db.prepare(`
        SELECT completed_at, invoice_number FROM invoices 
        WHERE customer_id = ? AND status = 'completed' AND payment_status IN ('unpaid', 'partial')
          AND (is_test = 0 OR is_test IS NULL)
        ORDER BY completed_at ASC LIMIT 1
      `).get(cust.id) as { completed_at: string; invoice_number: string } | undefined;

      if (oldest?.completed_at) {
        const days = Math.floor((new Date(target).getTime() - new Date(oldest.completed_at).getTime()) / (1000 * 60 * 60 * 24));
        if (days > 30) {
          // Get last reminder date
          const lastReminder = db.prepare(`
            SELECT created_at FROM customer_reminders 
            WHERE customer_id = ? AND status = 'sent' 
            ORDER BY created_at DESC LIMIT 1
          `).get(cust.id) as { created_at: string } | undefined;

          result.push({
            id: cust.id,
            customer_code: cust.customer_code,
            name: cust.name,
            phone: cust.phone,
            outstanding_balance_paise: cust.outstanding_balance_paise,
            days_overdue: days,
            oldest_invoice_number: oldest.invoice_number,
            oldest_invoice_date: oldest.completed_at,
            last_reminder_sent_at: lastReminder ? lastReminder.created_at : null
          });
        }
      }
    }
    // Sort by days overdue descending
    return result.sort((a, b) => b.days_overdue - a.days_overdue);
  }

  public getTopDebtors(limit = 10) {
    return db.prepare(`
      SELECT c.*, cg.name as group_name 
      FROM customers c 
      LEFT JOIN customer_groups cg ON c.group_id = cg.id 
      WHERE c.outstanding_balance_paise > 0
        AND (c.is_test = 0 OR c.is_test IS NULL)
        AND (c.is_system = 0 OR c.is_system IS NULL)
        AND (c.status != 'merged' OR c.status IS NULL)
      ORDER BY c.outstanding_balance_paise DESC
      LIMIT ?
    `).all(limit);
  }

  public getCreditLimitUtilization() {
    return db.prepare(`
      SELECT c.id, c.customer_code, c.name, c.outstanding_balance_paise, c.credit_limit_paise,
        (CAST(c.outstanding_balance_paise AS REAL) / c.credit_limit_paise * 100) as utilization_percent
      FROM customers c
      WHERE c.credit_allowed = 1 AND c.credit_limit_paise > 0
        AND (c.is_test = 0 OR c.is_test IS NULL)
        AND (c.is_system = 0 OR c.is_system IS NULL)
        AND (c.status != 'merged' OR c.status IS NULL)
      ORDER BY utilization_percent DESC
    `).all();
  }
}

export const arReportsService = new ARReportsService();
