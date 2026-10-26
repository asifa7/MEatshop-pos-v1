import { db } from '../../../../core/backend/db';
import { logger } from '../../../../core/backend/logger';

export type CustomerSegmentType =
  | 'VIP'
  | 'Regular'
  | 'Due'
  | 'At Risk'
  | 'Inactive'
  | 'Credit Customer'
  | 'Business Customer'
  | 'New';

export interface TypicalBasketItem {
  product_variant_id: number;
  product_name: string;
  variant_name: string;
  unit_type: string;
  unit_label: string;
  typical_quantity_grams: number | null;
  typical_quantity_units: number | null;
  typical_qty_display: string;
  rate_paise: number;
}

export interface FavoriteProduct {
  product_variant_id: number;
  product_name: string;
  variant_name: string;
  unit_type: string;
  unit_label: string;
  purchase_count: number;
  total_quantity: number;
  total_spend_paise: number;
}

export interface FavoriteCategory {
  category_name: string;
  purchase_count: number;
  total_spend_paise: number;
}

export interface PaymentReliability {
  score: number; // 0 - 100
  avg_days_to_pay: number;
  rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' | 'N/A';
  total_credit_purchases: number;
  total_payments_logged: number;
}

export interface CustomerIntelligence {
  customer_id: number;
  customer_code: string;
  name: string;
  category: string;
  last_purchase_date: string | null;
  days_since_last_purchase: number | null;
  total_visits: number;
  total_spend_paise: number;
  average_bill_paise: number;
  average_visit_interval: number | null;
  median_visit_interval: number | null;
  expected_next_visit: string | null;
  days_overdue: number;
  purchase_frequency_label: string;
  total_weight_grams: number;
  average_weight_grams_per_visit: number;
  favorite_products: FavoriteProduct[];
  favorite_categories: FavoriteCategory[];
  typical_basket: TypicalBasketItem[];
  typical_basket_summary: string;
  preferred_payment_method: string;
  preferred_visit_day: string;
  preferred_visit_time: string;
  customer_lifetime_value_paise: number;
  customer_segment: CustomerSegmentType;
  tags?: string[];
  is_credit_customer?: boolean;
  has_credit_due?: boolean;
  credit_status?: string;
  segment_health_summary: string;
  credit_limit_paise: number;
  outstanding_balance_paise: number;
  advance_balance_paise: number;
  payment_reliability: PaymentReliability;
  calculated_at: string;
}

export class CustomerIntelligenceService {
  private includeTestData = false;

  public setIncludeTestData(include: boolean): void {
    this.includeTestData = include;
  }

  public getIncludeTestData(): boolean {
    return this.includeTestData;
  }

  /**
   * Primary method: Get intelligence for a customer from cache or compute live.
   */
  public getIntelligence(customerId: number, forceRefresh = false): CustomerIntelligence {
    if (!forceRefresh) {
      const cached = db.prepare('SELECT metrics_json FROM customer_analytics_cache WHERE customer_id = ?').get(customerId) as { metrics_json: string } | undefined;
      if (cached && cached.metrics_json) {
        try {
          return JSON.parse(cached.metrics_json) as CustomerIntelligence;
        } catch (e) {
          logger.warn('Failed to parse cached intelligence, recalculating live', { customerId });
        }
      }
    }

    return this.calculateAndCache(customerId);
  }

  /**
   * Recompute customer intelligence and update cache.
   */
  public calculateAndCache(customerId: number): CustomerIntelligence {
    const intelligence = this.computeCustomerIntelligence(customerId);
    
    try {
      db.prepare(`
        INSERT INTO customer_analytics_cache (customer_id, segment, metrics_json, last_calculated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(customer_id) DO UPDATE SET
          segment = excluded.segment,
          metrics_json = excluded.metrics_json,
          last_calculated_at = CURRENT_TIMESTAMP
      `).run(customerId, intelligence.customer_segment, JSON.stringify(intelligence));
    } catch (err) {
      logger.error('Failed to store customer intelligence cache', { customerId, error: err });
    }

    return intelligence;
  }

  /**
   * Pure calculation layer: derive all metrics from raw SQLite tables.
   */
  public computeCustomerIntelligence(customerId: number): CustomerIntelligence {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId) as any;
    if (!customer) {
      throw new Error(`Customer with ID ${customerId} not found`);
    }

    // 1. Invoices chronological list
    const allowTestInvoices = customer.is_test === 1 || this.includeTestData;
    const testClause = allowTestInvoices ? '' : 'AND (is_test = 0 OR is_test IS NULL)';
    const invoices = db.prepare(`
      SELECT id, invoice_number, created_at, total_paise, discount_paise, status, payment_status, is_gst_invoice
      FROM invoices
      WHERE customer_id = ? AND status IN ('completed', 'returned')
        ${testClause}
      ORDER BY created_at ASC, id ASC
    `).all(customerId) as any[];

    // Extract distinct calendar visit dates (YYYY-MM-DD)
    const distinctDates = Array.from(new Set(invoices.map(inv => {
      const d = new Date(inv.created_at);
      return !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : String(inv.created_at || '').slice(0, 10);
    }).filter(Boolean))).sort();

    const totalVisits = distinctDates.length;
    const totalSpendPaise = invoices.reduce((sum, inv) => sum + (inv.total_paise || 0), 0);
    const averageBillPaise = invoices.length > 0 ? Math.round(totalSpendPaise / invoices.length) : 0;

    // 2. Visit Timing & Intervals (calculated strictly across distinct calendar days)
    let lastPurchaseDate: string | null = null;
    let daysSinceLastPurchase: number | null = null;
    let averageVisitInterval: number | null = null;
    let medianVisitInterval: number | null = null;
    let expectedNextVisit: string | null = null;
    let daysOverdue = 0;
    let purchaseFrequencyLabel = 'No Purchases';

    const now = Date.now();

    if (distinctDates.length > 0) {
      lastPurchaseDate = invoices[invoices.length - 1].created_at;
      const lastDateStr = distinctDates[distinctDates.length - 1];
      const lastTime = new Date(`${lastDateStr}T12:00:00Z`).getTime();
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayTime = new Date(`${todayStr}T12:00:00Z`).getTime();
      daysSinceLastPurchase = Math.max(0, Math.round((todayTime - lastTime) / (1000 * 60 * 60 * 24)));

      if (distinctDates.length === 1) {
        purchaseFrequencyLabel = 'First Visit';
        expectedNextVisit = null;
        daysOverdue = 0;
      } else {
        // Calculate consecutive intervals across distinct calendar dates
        const intervals: number[] = [];
        for (let i = 1; i < distinctDates.length; i++) {
          const prev = new Date(`${distinctDates[i - 1]}T12:00:00Z`).getTime();
          const curr = new Date(`${distinctDates[i]}T12:00:00Z`).getTime();
          const gapDays = Math.max(1, Math.round((curr - prev) / (1000 * 60 * 60 * 24)));
          intervals.push(gapDays);
        }

        const sumGaps = intervals.reduce((a, b) => a + b, 0);
        averageVisitInterval = parseFloat((sumGaps / intervals.length).toFixed(1));

        // Median interval
        const sorted = [...intervals].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        medianVisitInterval = sorted.length % 2 !== 0
          ? parseFloat(sorted[mid].toFixed(1))
          : parseFloat(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1));

        // Expected next visit = last visit date + Math.round(averageVisitInterval) days
        const expectedTime = lastTime + Math.round(averageVisitInterval * 24 * 60 * 60 * 1000);
        expectedNextVisit = new Date(expectedTime).toISOString().slice(0, 10);

        if (todayTime > expectedTime) {
          daysOverdue = Math.max(0, Math.round((todayTime - expectedTime) / (1000 * 60 * 60 * 24)));
        }

        // Frequency classification
        if (averageVisitInterval <= 1.5) {
          purchaseFrequencyLabel = 'Daily';
        } else if (averageVisitInterval <= 3.5) {
          purchaseFrequencyLabel = '2–3x / week';
        } else if (averageVisitInterval <= 8) {
          purchaseFrequencyLabel = 'Weekly';
        } else if (averageVisitInterval <= 16) {
          purchaseFrequencyLabel = 'Bi-weekly';
        } else if (averageVisitInterval <= 35) {
          purchaseFrequencyLabel = 'Monthly';
        } else {
          purchaseFrequencyLabel = 'Irregular';
        }
      }
    }

    // 3. Products, Weights & Categories Analytics
    const invoiceIds = invoices.map(i => i.id);
    let totalWeightGrams = 0;
    const productStatsMap = new Map<number, {
      variantId: number;
      productName: string;
      variantName: string;
      unitType: string;
      unitLabel: string;
      count: number;
      quantities: number[];
      totalQuantity: number;
      totalSpendPaise: number;
      latestRatePaise: number;
    }>();

    const categoryStatsMap = new Map<string, { count: number; spendPaise: number }>();
    const dayOfWeekCounts: Record<string, number> = {
      Sunday: 0, Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0
    };
    const timeSlotCounts: Record<string, number> = {
      'Morning (6 AM - 12 PM)': 0,
      'Afternoon (12 PM - 5 PM)': 0,
      'Evening (5 PM - 9 PM)': 0,
      'Night (9 PM+)': 0,
    };

    if (invoiceIds.length > 0) {
      const placeholders = invoiceIds.map(() => '?').join(',');
      const itemRows = db.prepare(`
        SELECT 
          ii.invoice_id, ii.product_variant_id, ii.rate_paise_snapshot, ii.line_total_paise,
          ii.quantity_grams, ii.quantity_units,
          p.name as product_name, p.unit_type,
          pv.variant_name,
          COALESCE(p.category, 'General Meat') as category_name,
          i.created_at as invoice_created_at
        FROM invoice_items ii
        JOIN product_variants pv ON ii.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        JOIN invoices i ON ii.invoice_id = i.id
        WHERE ii.invoice_id IN (${placeholders})
        ORDER BY ii.id ASC
      `).all(...invoiceIds) as any[];

      for (const row of itemRows) {
        const isWeight = row.unit_type === 'weight' || row.unit_type === 'live_dual' || row.quantity_grams != null;
        const qty = isWeight ? (row.quantity_grams || 0) / 1000 : (row.quantity_units || 0);

        if (isWeight) {
          totalWeightGrams += (row.quantity_grams || 0);
        }

        // Product stats
        if (!productStatsMap.has(row.product_variant_id)) {
          productStatsMap.set(row.product_variant_id, {
            variantId: row.product_variant_id,
            productName: row.product_name,
            variantName: row.variant_name,
            unitType: row.unit_type || 'weight',
            unitLabel: isWeight ? 'kg' : 'pcs',
            count: 0,
            quantities: [],
            totalQuantity: 0,
            totalSpendPaise: 0,
            latestRatePaise: row.rate_paise_snapshot || 0,
          });
        }
        const pStat = productStatsMap.get(row.product_variant_id)!;
        pStat.count += 1;
        pStat.quantities.push(qty);
        pStat.totalQuantity += qty;
        pStat.totalSpendPaise += (row.line_total_paise || 0);
        pStat.latestRatePaise = row.rate_paise_snapshot || pStat.latestRatePaise;

        // Category stats
        const catName = row.category_name || 'General';
        const cStat = categoryStatsMap.get(catName) || { count: 0, spendPaise: 0 };
        cStat.count += 1;
        cStat.spendPaise += (row.line_total_paise || 0);
        categoryStatsMap.set(catName, cStat);
      }

      // Timing habits from invoice timestamps
      for (const inv of invoices) {
        const dateObj = new Date(inv.created_at);
        const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dateObj.getDay()];
        dayOfWeekCounts[dayName] = (dayOfWeekCounts[dayName] || 0) + 1;

        const hour = dateObj.getHours();
        if (hour >= 6 && hour < 12) timeSlotCounts['Morning (6 AM - 12 PM)'] += 1;
        else if (hour >= 12 && hour < 17) timeSlotCounts['Afternoon (12 PM - 5 PM)'] += 1;
        else if (hour >= 17 && hour < 21) timeSlotCounts['Evening (5 PM - 9 PM)'] += 1;
        else timeSlotCounts['Night (9 PM+)'] += 1;
      }
    }

    const averageWeightGramsPerVisit = totalVisits > 0 ? Math.round(totalWeightGrams / totalVisits) : 0;

    // 4. Favorite Products Ranked
    const favoriteProducts: FavoriteProduct[] = Array.from(productStatsMap.values())
      .sort((a, b) => b.count - a.count || b.totalQuantity - a.totalQuantity)
      .slice(0, 5)
      .map(p => ({
        product_variant_id: p.variantId,
        product_name: p.productName,
        variant_name: p.variantName,
        unit_type: p.unitType,
        unit_label: p.unitLabel,
        purchase_count: p.count,
        total_quantity: parseFloat(p.totalQuantity.toFixed(2)),
        total_spend_paise: p.totalSpendPaise,
      }));

    // Favorite Categories
    const favoriteCategories: FavoriteCategory[] = Array.from(categoryStatsMap.entries())
      .sort((a, b) => b[1].spendPaise - a[1].spendPaise)
      .slice(0, 4)
      .map(([name, stat]) => ({
        category_name: name,
        purchase_count: stat.count,
        total_spend_paise: stat.spendPaise,
      }));

    // 5. Typical Basket (Top frequent items with median quantities)
    const typicalBasket: TypicalBasketItem[] = favoriteProducts.slice(0, 3).map((fav) => {
      const stat = productStatsMap.get(fav.product_variant_id)!;
      const sortedQ = [...stat.quantities].sort((a, b) => a - b);
      const medianQ = sortedQ[Math.floor(sortedQ.length / 2)] || 1.0;
      const isWeight = fav.unit_label === 'kg';

      return {
        product_variant_id: fav.product_variant_id,
        product_name: fav.product_name,
        variant_name: fav.variant_name,
        unit_type: fav.unit_type,
        unit_label: fav.unit_label,
        typical_quantity_grams: isWeight ? Math.round(medianQ * 1000) : null,
        typical_quantity_units: !isWeight ? Math.round(medianQ) : null,
        typical_qty_display: isWeight ? `${medianQ.toFixed(medianQ % 1 === 0 ? 0 : 2)} kg` : `${Math.round(medianQ)} pcs`,
        rate_paise: stat.latestRatePaise,
      };
    });

    const typicalBasketSummary = typicalBasket.length > 0
      ? typicalBasket.map(b => `${b.typical_qty_display} ${b.product_name}${b.variant_name && b.variant_name !== 'Default' ? ` (${b.variant_name})` : ''}`).join(' + ')
      : 'No regular basket established';

    // 6. Preferred Habits
    let preferredVisitDay = 'Flexible';
    let maxDayCount = 0;
    for (const [day, count] of Object.entries(dayOfWeekCounts)) {
      if (count > maxDayCount) {
        maxDayCount = count;
        preferredVisitDay = day;
      }
    }

    let preferredVisitTime = 'Flexible';
    let maxTimeCount = 0;
    for (const [slot, count] of Object.entries(timeSlotCounts)) {
      if (count > maxTimeCount) {
        maxTimeCount = count;
        preferredVisitTime = slot;
      }
    }

    // Payment method frequency
    let preferredPaymentMethod = customer.preferred_payment_method || 'cash';
    if (invoiceIds.length > 0) {
      const placeholders = invoiceIds.map(() => '?').join(',');
      const payRows = db.prepare(`
        SELECT method, COUNT(id) as count, SUM(amount_paise) as total_amount
        FROM payments
        WHERE invoice_id IN (${placeholders})
        GROUP BY method
        ORDER BY count DESC, total_amount DESC
        LIMIT 1
      `).get(...invoiceIds) as any;

      if (payRows && payRows.method) {
        preferredPaymentMethod = payRows.method;
      }
    }

    // 7. Payment Reliability & Credit Health
    const creditLedgerInvoices = db.prepare(`
      SELECT id, debit_paise, created_at
      FROM customer_ledger
      WHERE customer_id = ? AND ref_type = 'invoice'
    `).all(customerId) as any[];

    const creditLedgerPayments = db.prepare(`
      SELECT id, credit_paise, created_at
      FROM customer_ledger
      WHERE customer_id = ? AND ref_type = 'payment'
    `).all(customerId) as any[];

    let paymentReliability: PaymentReliability = {
      score: 100,
      avg_days_to_pay: 0,
      rating: 'N/A',
      total_credit_purchases: creditLedgerInvoices.length,
      total_payments_logged: creditLedgerPayments.length,
    };

    if (creditLedgerInvoices.length > 0) {
      // Estimate clearance delay
      let totalDelayDays = 0;
      let countPairs = 0;

      for (const inv of creditLedgerInvoices) {
        const invTime = new Date(inv.created_at).getTime();
        const nextPayment = creditLedgerPayments.find(p => new Date(p.created_at).getTime() >= invTime);
        if (nextPayment) {
          const payTime = new Date(nextPayment.created_at).getTime();
          const delay = Math.max(0, (payTime - invTime) / (1000 * 60 * 60 * 24));
          totalDelayDays += delay;
          countPairs++;
        }
      }

      const avgDays = countPairs > 0 ? Math.round(totalDelayDays / countPairs) : (customer.outstanding_balance_paise > 0 ? 15 : 3);
      let rating: 'Excellent' | 'Good' | 'Fair' | 'Poor' = 'Good';
      let score = 85;

      if (avgDays <= 7) {
        rating = 'Excellent';
        score = 95;
      } else if (avgDays <= 15) {
        rating = 'Good';
        score = 80;
      } else if (avgDays <= 30) {
        rating = 'Fair';
        score = 65;
      } else {
        rating = 'Poor';
        score = 40;
      }

      paymentReliability = {
        score,
        avg_days_to_pay: avgDays,
        rating,
        total_credit_purchases: creditLedgerInvoices.length,
        total_payments_logged: creditLedgerPayments.length,
      };
    }

    // 8. Automated Customer Segmentation (Decoupled lifecycle & credit status)
    // 8. Automated Customer Segmentation with Configurable Criteria & Manual Override
    let customerSegment: CustomerSegmentType = 'New';
    let segmentHealthSummary = 'New customer — first visits recorded';

    // Load tier settings
    let tierSettings = {
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
      const tsRow = db.prepare('SELECT * FROM customer_tier_settings WHERE id = 1').get() as any;
      if (tsRow) {
        tierSettings = {
          ...tierSettings,
          ...tsRow,
        };
      }
    } catch (_) {}

    const categoryUpper = (customer.category || '').toUpperCase();
    const wholesaleTagList = String(tierSettings.wholesale_tags || 'Wholesale,Distributor,Contract')
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);
    const restaurantTagList = String(tierSettings.restaurant_tags || 'Restaurant,Hotel,Catering')
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);

    const isWholesale = wholesaleTagList.some(tag => categoryUpper.includes(tag)) || customer.price_tier === 'wholesale';
    const isRestaurant = restaurantTagList.some(tag => categoryUpper.includes(tag));
    const isBusiness = isWholesale || isRestaurant;

    const createdAtMs = customer.created_at ? new Date(customer.created_at).getTime() : NaN;
    const daysSinceAccountCreated = !isNaN(createdAtMs)
      ? Math.max(0, Math.round((now - createdAtMs) / (1000 * 60 * 60 * 24)))
      : 0;
    const isWithinNewWindow = daysSinceAccountCreated <= (tierSettings.new_window_days || 14);
    const atRiskMultiplier = Number(tierSettings.at_risk_gap_multiplier) > 0 ? Number(tierSettings.at_risk_gap_multiplier) : 2.0;

    // Priority 1: Manual override
    if (customer.manual_tier && customer.manual_tier !== 'auto') {
      const mt = customer.manual_tier.toLowerCase();
      if (mt === 'vip') {
        customerSegment = 'VIP';
        segmentHealthSummary = '⭐ Manually assigned VIP customer';
      } else if (mt === 'wholesale') {
        customerSegment = 'VIP';
        segmentHealthSummary = '📦 Wholesale B2B Partner Account';
      } else if (mt === 'restaurant') {
        customerSegment = 'VIP';
        segmentHealthSummary = '🍽️ Restaurant / Food Service Account';
      } else if (mt === 'rare') {
        customerSegment = 'Inactive';
        segmentHealthSummary = '⏳ Rare / Infrequent Buyer';
      } else if (mt === 'regular') {
        customerSegment = 'Regular';
        segmentHealthSummary = '🟢 Manually assigned Regular customer';
      } else if (mt === 'new') {
        customerSegment = 'New';
        segmentHealthSummary = '🆕 Account marked as New customer';
      }
    } else if (isWholesale) {
      customerSegment = 'VIP';
      segmentHealthSummary = '📦 Wholesale Bulk Account';
    } else if (isRestaurant) {
      customerSegment = 'VIP';
      segmentHealthSummary = '🍽️ Restaurant / Hotel Account';
    } else {
      // Dynamic criteria evaluation
      const qualifiesVip = customer.price_tier === 'vip' || (
        tierSettings.vip_criteria_mode === 'both'
          ? (totalSpendPaise >= tierSettings.vip_min_spend_paise && totalVisits >= tierSettings.vip_min_visits)
          : (totalSpendPaise >= tierSettings.vip_min_spend_paise || totalVisits >= tierSettings.vip_min_visits)
      );

      if (qualifiesVip) {
        customerSegment = 'VIP';
        segmentHealthSummary = `⭐ VIP Customer — Spend ₹${(totalSpendPaise / 100).toLocaleString('en-IN')} across ${totalVisits} visits`;
      } else if (totalVisits <= 1 && isWithinNewWindow) {
        customerSegment = 'New';
        segmentHealthSummary = totalVisits === 0 ? '🆕 New account — no purchases recorded yet' : '🆕 First-time visitor — building visit pattern';
      } else if ((daysSinceLastPurchase ?? 0) > tierSettings.rare_inactive_days) {
        customerSegment = 'Inactive';
        segmentHealthSummary = `⏳ Rare / Inactive — no purchases for ${daysSinceLastPurchase} days`;
      } else if (daysSinceLastPurchase != null && averageVisitInterval != null && daysSinceLastPurchase > averageVisitInterval * atRiskMultiplier) {
        customerSegment = 'At Risk';
        segmentHealthSummary = `🔴 At Risk of Churn — ${daysSinceLastPurchase} days since last purchase`;
      } else if (totalVisits >= tierSettings.regular_min_visits) {
        customerSegment = 'Regular';
        segmentHealthSummary = `🟢 Healthy Regular — ${totalVisits} visits, last visit ${daysSinceLastPurchase === 0 ? 'today' : `${daysSinceLastPurchase}d ago`}`;
      } else {
        customerSegment = 'New';
        segmentHealthSummary = '🆕 Building repeat habit';
      }
    }

    // Overlapping status tags
    const tags: string[] = [customerSegment];
    const isCreditCustomer = customer.credit_allowed === 1 || (customer.credit_limit_paise || 0) > 0 || creditLedgerInvoices.length > 0;
    const hasCreditDue = (customer.outstanding_balance_paise || 0) > 0;
    let creditStatus = 'No Credit';

    if (isCreditCustomer) {
      tags.push('Credit Customer');
      if (hasCreditDue) {
        creditStatus = paymentReliability.avg_days_to_pay > 30 ? 'Overdue' : 'Credit Due';
        tags.push(creditStatus);
      } else {
        creditStatus = 'Good Standing';
      }
    }
    if (isBusiness) {
      tags.push('Business');
    }

    return {
      customer_id: customerId,
      customer_code: customer.customer_code,
      name: customer.name,
      category: customer.category,
      last_purchase_date: lastPurchaseDate,
      days_since_last_purchase: daysSinceLastPurchase,
      total_visits: totalVisits,
      total_spend_paise: totalSpendPaise,
      average_bill_paise: averageBillPaise,
      average_visit_interval: averageVisitInterval,
      median_visit_interval: medianVisitInterval,
      expected_next_visit: expectedNextVisit,
      days_overdue: daysOverdue,
      purchase_frequency_label: purchaseFrequencyLabel,
      total_weight_grams: totalWeightGrams,
      average_weight_grams_per_visit: averageWeightGramsPerVisit,
      favorite_products: favoriteProducts,
      favorite_categories: favoriteCategories,
      typical_basket: typicalBasket,
      typical_basket_summary: typicalBasketSummary,
      preferred_payment_method: preferredPaymentMethod,
      preferred_visit_day: preferredVisitDay,
      preferred_visit_time: preferredVisitTime,
      customer_lifetime_value_paise: totalSpendPaise,
      customer_segment: customerSegment,
      tags,
      is_credit_customer: isCreditCustomer,
      has_credit_due: hasCreditDue,
      credit_status: creditStatus,
      segment_health_summary: segmentHealthSummary,
      credit_limit_paise: customer.credit_limit_paise || 0,
      outstanding_balance_paise: customer.outstanding_balance_paise || 0,
      advance_balance_paise: customer.advance_balance_paise || 0,
      payment_reliability: paymentReliability,
      calculated_at: new Date().toISOString(),
    };
  }

  /**
   * Shop-wide CRM intelligence metrics & alert summary.
   */
  public getShopCrmAlertsSummary(includeTest?: boolean): {
    total_customers: number;
    due_today_count: number;
    at_risk_count: number;
    vip_count: number;
    inactive_count: number;
    regular_count: number;
    shop_avg_visit_interval: number;
  } {
    const shouldIncludeTest = includeTest ?? this.includeTestData;
    const testClause = shouldIncludeTest ? '' : 'AND (is_test = 0 OR is_test IS NULL)';

    const customers = db.prepare(`
      SELECT id FROM customers 
      WHERE (status != 'merged' OR status IS NULL)
        ${testClause}
        AND (is_system = 0 OR is_system IS NULL)
    `).all() as { id: number }[];

    let dueToday = 0;
    let atRisk = 0;
    let vip = 0;
    let inactive = 0;
    let regular = 0;
    const intervals: number[] = [];

    const todayStr = new Date().toISOString().slice(0, 10);

    for (const c of customers) {
      const intel = this.getIntelligence(c.id);
      if (intel.customer_segment === 'VIP') vip++;
      else if (intel.customer_segment === 'At Risk') atRisk++;
      else if (intel.customer_segment === 'Inactive') inactive++;
      else if (intel.customer_segment === 'Regular') regular++;

      if (intel.expected_next_visit && (intel.expected_next_visit <= todayStr || intel.customer_segment === 'Due')) {
        dueToday++;
      }

      if (intel.average_visit_interval && intel.average_visit_interval > 0) {
        intervals.push(intel.average_visit_interval);
      }
    }

    const shopAvgInterval = intervals.length > 0
      ? parseFloat((intervals.reduce((a, b) => a + b, 0) / intervals.length).toFixed(1))
      : 0;

    return {
      total_customers: customers.length,
      due_today_count: dueToday,
      at_risk_count: atRisk,
      vip_count: vip,
      inactive_count: inactive,
      regular_count: regular,
      shop_avg_visit_interval: shopAvgInterval,
    };
  }

  /**
   * Returns list of customers needing retention attention (Overdue, Due, At Risk, or High-Value Inactive).
   */
  public getCustomersNeedingAttention(options?: {
    sortBy?: 'days_overdue' | 'lifetime_value';
    limit?: number;
    includeTest?: boolean;
  }): any[] {
    const sortBy = options?.sortBy || 'days_overdue';
    const limit = options?.limit || 100;
    const shouldIncludeTest = options?.includeTest ?? this.includeTestData;
    const testClause = shouldIncludeTest ? '' : 'AND (is_test = 0 OR is_test IS NULL)';

    const customers = db.prepare(`
      SELECT id, phone, whatsapp_bill_consent, marketing_consent FROM customers 
      WHERE is_active = 1 
        AND (status != 'merged' OR status IS NULL)
        ${testClause}
        AND (is_system = 0 OR is_system IS NULL)
    `).all() as any[];

    const attentionList: any[] = [];

    for (const c of customers) {
      const intel = this.getIntelligence(c.id);
      const isNeedingAttention =
        intel.customer_segment === 'Due' ||
        intel.customer_segment === 'At Risk' ||
        intel.days_overdue > 0 ||
        (intel.customer_segment === 'VIP' && (intel.days_since_last_purchase ?? 0) > 7) ||
        (intel.customer_segment === 'Inactive' && intel.total_spend_paise >= 500000);

      if (isNeedingAttention) {
        attentionList.push({
          customer_id: intel.customer_id,
          customer_code: intel.customer_code,
          name: intel.name,
          phone: c.phone || '',
          whatsapp_bill_consent: c.whatsapp_bill_consent ?? 0,
          marketing_consent: c.marketing_consent ?? 0,
          category: intel.category,
          customer_segment: intel.customer_segment,
          tags: intel.tags || [intel.customer_segment],
          is_credit_customer: intel.is_credit_customer,
          has_credit_due: intel.has_credit_due,
          credit_status: intel.credit_status,
          segment_health_summary: intel.segment_health_summary,
          average_visit_interval: intel.average_visit_interval,
          last_purchase_date: intel.last_purchase_date,
          days_since_last_purchase: intel.days_since_last_purchase,
          expected_next_visit: intel.expected_next_visit,
          days_overdue: intel.days_overdue,
          purchase_frequency_label: intel.purchase_frequency_label,
          customer_lifetime_value_paise: intel.customer_lifetime_value_paise,
          outstanding_balance_paise: intel.outstanding_balance_paise,
          advance_balance_paise: intel.advance_balance_paise,
          typical_basket_summary: intel.typical_basket_summary,
        });
      }
    }

    if (sortBy === 'lifetime_value') {
      attentionList.sort((a, b) => b.customer_lifetime_value_paise - a.customer_lifetime_value_paise);
    } else {
      attentionList.sort((a, b) => b.days_overdue - a.days_overdue || b.customer_lifetime_value_paise - a.customer_lifetime_value_paise);
    }

    return attentionList.slice(0, limit);
  }

  /**
   * Event trigger: Invalidate & recompute customer intelligence when invoice completes or payment is recorded.
   */
  public handleCustomerTransactionEvent(customerId: number | null | undefined): void {
    if (!customerId) return;
    try {
      this.calculateAndCache(customerId);
    } catch (err) {
      logger.error('Error updating customer intelligence on transaction event', { customerId, error: err });
    }
  }
}

export const customerIntelligenceService = new CustomerIntelligenceService();
