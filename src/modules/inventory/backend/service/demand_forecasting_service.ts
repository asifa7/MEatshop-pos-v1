import { db } from '../../../../core/backend/db';
import { auditLogger } from '../../../../core/backend/logger';
import { ValidationError } from '../../../../core/backend/errors';
import { roundQty } from '../../../../core/shared/math';

export interface CalendarEventRow {
  id: number;
  event_name: string;
  event_date: string;
  impact_level: 'High' | 'Normal' | 'Low' | 'Very_Low';
  notes?: string | null;
  confidence_level?: string | null;
  custom_multiplier?: number | null;
  category?: string | null;
  created_at: string;
}

export interface BulkOrderRow {
  id: number;
  delivery_date: string;
  product_variant_id: number;
  product_name?: string;
  variant_name?: string;
  unit_type?: 'weight' | 'piece';
  quantity_grams: number | null;
  quantity_units: number | null;
  customer_name_or_notes: string;
  status: 'pending' | 'fulfilled' | 'cancelled';
  created_by: number;
  created_at: string;
}

export interface ItemSalesAnalytics {
  product_variant_id: number;
  product_name: string;
  variant_name: string;
  product_code: string;
  category: string;
  unit_type: 'weight' | 'piece';
  avg_daily_7d: number;
  avg_daily_30d: number;
  avg_daily_90d: number;
  day_of_week_averages: Record<number, number>; // 0=Sunday .. 6=Saturday (8-week same-weekday average)
  trend_multiplier: number;
  has_sufficient_data: boolean;
  total_historical_days: number;
  days_stock_left: number | null;
  days_left_status: 'urgent' | 'low' | 'healthy' | 'no_data';
}

export interface PurchasingSuggestion {
  product_variant_id: number;
  product_name: string;
  variant_name: string;
  product_code: string;
  category: string;
  unit_type: 'weight' | 'piece';
  current_stock: number;
  safety_threshold: number;
  avg_daily_30d: number;
  base_8wk_weekday_avg: number;
  tomorrow_festival_multiplier: number;
  tomorrow_event_name: string | null;
  trend_multiplier: number;
  tomorrow_forecast: number;
  next_7day_forecast: number;
  target_3day_forecast: number;
  safety_buffer: number;
  bulk_orders_addition: number;
  festival_adjustment_factor: number;
  event_notes: string[];
  formula_display: string;
  suggested_tomorrow_purchase_qty: number;
  suggested_7day_purchase_qty: number;
  suggested_purchase_quantity: number;
  accuracy_percent: number;
  last_actual_qty: number;
  last_forecast_qty: number;
  recount_needed: boolean;
}

export class DemandForecastingService {
  /**
   * Calculate per-item rolling averages (7d, 30d, 90d) and 8-week same-weekday averages
   */
  public getItemSalesAnalytics(variantId: number): ItemSalesAnalytics | null {
    const variant = db.prepare(`
      SELECT pv.id, pv.variant_name, p.name as product_name, p.product_code, p.category, COALESCE(pv.unit_type, p.unit_type) as unit_type
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.id = ?
    `).get(variantId) as any;

    if (!variant) return null;

    const isWeight = variant.unit_type === 'weight' || variant.unit_type === 'live_dual';

    const today = new Date();
    const getDateStr = (daysAgo: number) => {
      const d = new Date(today);
      d.setDate(d.getDate() - daysAgo);
      return d.toISOString().split('T')[0];
    };

    const d7 = getDateStr(7);
    const d30 = getDateStr(30);
    const d56 = getDateStr(56); // 8 weeks
    const d90 = getDateStr(90);

    const calcAvg = (fromDate: string, daysCount: number) => {
      const row = db.prepare(`
        SELECT 
          SUM(COALESCE(ii.quantity_grams, 0)) as total_g,
          SUM(COALESCE(ii.quantity_units, 0)) as total_u,
          COUNT(DISTINCT DATE(inv.created_at)) as active_days
        FROM invoice_items ii
        JOIN invoices inv ON inv.id = ii.invoice_id
        WHERE ii.product_variant_id = ? AND inv.status = 'completed' AND DATE(inv.created_at) >= ?
      `).get(variantId, fromDate) as any;

      const divisor = Math.max(1, Math.min(daysCount, row?.active_days || daysCount));
      if (isWeight) {
        return roundQty((row?.total_g || 0) / 1000 / divisor, 3);
      }
      return roundQty((row?.total_u || 0) / divisor, 3);
    };

    const avg7d = calcAvg(d7, 7);
    const avg30d = calcAvg(d30, 30);
    const avg90d = calcAvg(d90, 90);

    // Calculate 8-week same-weekday averages (0=Sun, 1=Mon...6=Sat)
    const dowRows = db.prepare(`
      SELECT 
        CAST(strftime('%w', inv.created_at) AS INTEGER) as dow,
        SUM(COALESCE(ii.quantity_grams, 0)) as total_g,
        SUM(COALESCE(ii.quantity_units, 0)) as total_u,
        COUNT(DISTINCT DATE(inv.created_at)) as distinct_days
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      WHERE ii.product_variant_id = ? AND inv.status = 'completed' AND DATE(inv.created_at) >= ?
      GROUP BY dow
    `).all(variantId, d56) as any[];

    const dowAverages: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    dowRows.forEach(r => {
      const count = Math.max(1, r.distinct_days);
      const val = isWeight ? (r.total_g / 1000 / count) : (r.total_u / count);
      dowAverages[r.dow] = roundQty(val, 3);
    });

    // If a specific weekday has no sales in 8 weeks, fallback to 30d avg * standard weekday pattern
    const defaultWeekdayFactor: Record<number, number> = {
      0: 1.4, // Sunday peak
      1: 0.9,
      2: 0.75, // Tuesday fasting dip
      3: 1.0,
      4: 0.95,
      5: 0.75, // Friday fasting dip
      6: 1.15,
    };
    const fallbackBase = avg30d > 0 ? avg30d : (isWeight ? 8 : 15);
    for (let d = 0; d <= 6; d++) {
      if (!dowAverages[d] || dowAverages[d] <= 0) {
        dowAverages[d] = roundQty(fallbackBase * (defaultWeekdayFactor[d] || 1.0), 3);
      }
    }

    const trendMultiplier = (avg30d > 0 && avg7d > 0)
      ? roundQty(Math.min(1.25, Math.max(0.85, avg7d / avg30d)), 2)
      : 1.0;

    const historyRow = db.prepare(`
      SELECT COUNT(DISTINCT DATE(inv.created_at)) as cnt
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      WHERE ii.product_variant_id = ? AND inv.status = 'completed'
    `).get(variantId) as { cnt: number } | undefined;

    const totalDays = historyRow?.cnt || 0;
    const hasSufficientData = totalDays >= 1;

    const ledgerRow = db.prepare('SELECT quantity_grams, quantity_units FROM stock_ledger WHERE product_variant_id = ?').get(variantId) as any;
    const currentQty = roundQty(isWeight ? (ledgerRow?.quantity_grams ?? 0) / 1000 : (ledgerRow?.quantity_units ?? 0), 3);

    let daysStockLeft: number | null = null;
    let daysLeftStatus: ItemSalesAnalytics['days_left_status'] = 'no_data';

    if (avg30d > 0) {
      daysStockLeft = roundQty(Math.max(0, currentQty / avg30d), 1);
      if (daysStockLeft < 2) daysLeftStatus = 'urgent';
      else if (daysStockLeft < 4) daysLeftStatus = 'low';
      else daysLeftStatus = 'healthy';
    } else {
      daysLeftStatus = currentQty > 0 ? 'healthy' : 'urgent';
    }

    return {
      product_variant_id: variantId,
      product_name: variant.product_name,
      variant_name: variant.variant_name,
      product_code: variant.product_code,
      category: variant.category,
      unit_type: isWeight ? 'weight' : 'piece',
      avg_daily_7d: avg7d,
      avg_daily_30d: avg30d,
      avg_daily_90d: avg90d,
      day_of_week_averages: dowAverages,
      trend_multiplier: trendMultiplier,
      has_sufficient_data: hasSufficientData,
      total_historical_days: totalDays,
      days_stock_left: daysStockLeft,
      days_left_status: daysLeftStatus,
    };
  }

  /**
   * Resolve multiplier for a date from calendar_events or weekday baseline
   */
  public getDateMultiplierInfo(targetDateStr: string): {
    multiplier: number;
    eventName: string | null;
    impactLevel: string;
    confidenceLevel: string;
  } {
    const event = db.prepare('SELECT * FROM calendar_events WHERE event_date = ? ORDER BY id DESC LIMIT 1').get(targetDateStr) as CalendarEventRow | undefined;
    if (event) {
      let mult = event.custom_multiplier ? Number(event.custom_multiplier) : 1.0;
      if (!event.custom_multiplier) {
        if (event.impact_level === 'Very_Low') mult = 0.3;
        else if (event.impact_level === 'Low') mult = 0.6;
        else if (event.impact_level === 'High') mult = 1.5;
        else mult = 1.0;
      }
      return {
        multiplier: roundQty(mult, 2),
        eventName: event.event_name,
        impactLevel: event.impact_level,
        confidenceLevel: event.confidence_level || 'Verified',
      };
    }

    const dow = new Date(targetDateStr + 'T00:00:00').getDay();
    if (dow === 0) {
      return { multiplier: 1.4, eventName: 'Sunday Peak Demand', impactLevel: 'High', confidenceLevel: 'Verified' };
    }
    if (dow === 2 || dow === 5) {
      return { multiplier: 0.75, eventName: dow === 2 ? 'Tuesday Fasting Dip' : 'Friday Fasting Dip', impactLevel: 'Low', confidenceLevel: 'Verified' };
    }
    return { multiplier: 1.0, eventName: null, impactLevel: 'Normal', confidenceLevel: 'Verified' };
  }

  /**
   * Forecast demand for a specific target date using:
   * Base (8-week same-weekday average) × Festival Multiplier × Trend
   */
  public forecastTargetDateDemand(variantId: number, targetDateStr: string): {
    forecasted_volume: number;
    base_avg_30d: number;
    base_8wk_weekday_avg: number;
    dow_multiplier: number;
    festival_multiplier: number;
    trend_multiplier: number;
    event_name: string | null;
    bulk_order_qty: number;
    notes: string[];
  } {
    const analytics = this.getItemSalesAnalytics(variantId);
    const isWeight = analytics?.unit_type === 'weight';
    const baseAvg30d = analytics?.avg_daily_30d || 0;
    const trendMultiplier = analytics?.trend_multiplier || 1.0;

    const targetDate = new Date(targetDateStr + 'T00:00:00');
    const dow = targetDate.getDay();
    const base8WkWeekdayAvg = analytics?.day_of_week_averages[dow] || baseAvg30d || (isWeight ? 5 : 10);

    const dateInfo = this.getDateMultiplierInfo(targetDateStr);
    const festivalMultiplier = dateInfo.multiplier;
    const eventName = dateInfo.eventName;
    const notes: string[] = [];

    if (eventName) {
      notes.push(`${eventName} (${festivalMultiplier}x)`);
    }

    const bulkRows = db.prepare(`
      SELECT quantity_grams, quantity_units, customer_name_or_notes
      FROM bulk_orders
      WHERE delivery_date = ? AND product_variant_id = ? AND status = 'pending'
    `).all(targetDateStr, variantId) as any[];

    let bulkOrderQty = 0;
    for (const b of bulkRows) {
      const bQty = isWeight ? (b.quantity_grams || 0) / 1000 : (b.quantity_units || 0);
      bulkOrderQty += bQty;
      notes.push(`Bulk order: +${roundQty(bQty, 3)} ${isWeight ? 'kg' : 'pcs'} (${b.customer_name_or_notes})`);
    }

    const baselineDemand = base8WkWeekdayAvg * festivalMultiplier * trendMultiplier;
    const finalForecastedVolume = roundQty(baselineDemand + bulkOrderQty, 3);

    return {
      forecasted_volume: finalForecastedVolume,
      base_avg_30d: baseAvg30d,
      base_8wk_weekday_avg: roundQty(base8WkWeekdayAvg, 3),
      dow_multiplier: 1.0,
      festival_multiplier: festivalMultiplier,
      trend_multiplier: trendMultiplier,
      event_name: eventName,
      bulk_order_qty: roundQty(bulkOrderQty, 3),
      notes,
    };
  }

  /**
   * Purchasing Suggestions & 7-Day Forecast Engine
   * Formula: Base (8-week same-weekday average) × Festival Multiplier × Trend
   */
  public getPurchasingSuggestions(): PurchasingSuggestion[] {
    const variants = db.prepare(`
      SELECT 
        pv.id,
        pv.variant_name,
        p.name as product_name,
        COALESCE(pv.product_code, p.product_code) as product_code,
        p.category,
        COALESCE(pv.unit_type, p.unit_type) as unit_type,
        pv.safety_threshold_grams,
        pv.safety_threshold_units,
        p.track_in_inventory,
        sl.quantity_grams,
        sl.quantity_units
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN stock_ledger sl ON sl.product_variant_id = pv.id
      WHERE p.is_active = 1 AND pv.is_active = 1 AND COALESCE(p.track_in_inventory, 1) = 1
      ORDER BY p.category ASC, p.name ASC
    `).all() as any[];

    const suggestions: PurchasingSuggestion[] = [];
    const today = new Date();

    for (const v of variants) {
      const isWeight = v.unit_type === 'weight' || v.unit_type === 'live_dual';
      const currentStock = roundQty(isWeight ? (v.quantity_grams ?? 0) / 1000 : (v.quantity_units ?? 0), 3);
      const safetyThreshold = roundQty(isWeight ? (v.safety_threshold_grams ?? 5000) / 1000 : (v.safety_threshold_units ?? 10), 3);

      let tomorrowForecastObj: ReturnType<DemandForecastingService['forecastTargetDateDemand']> | null = null;
      let target3DayDemand = 0;
      let next7DayDemand = 0;
      let bulkAdditionsTotal = 0;
      const allNotesSet = new Set<string>();

      for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
        const d = new Date(today);
        d.setDate(d.getDate() + dayOffset);
        const dStr = d.toISOString().split('T')[0];

        const f = this.forecastTargetDateDemand(v.id, dStr);
        if (dayOffset === 1) {
          tomorrowForecastObj = f;
        }
        if (dayOffset <= 3) {
          target3DayDemand += f.forecasted_volume;
        }
        next7DayDemand += f.forecasted_volume;
        bulkAdditionsTotal += f.bulk_order_qty;
        f.notes.forEach(n => allNotesSet.add(n));
      }

      const analytics = this.getItemSalesAnalytics(v.id);
      const avg30d = analytics?.avg_daily_30d || 0;
      const safetyBuffer = roundQty(avg30d > 0 ? avg30d * 0.5 : (isWeight ? 2 : 5), 3);

      const tomorrowForecast = roundQty(tomorrowForecastObj?.forecasted_volume || 0, 3);
      const base8Wk = roundQty(tomorrowForecastObj?.base_8wk_weekday_avg || 0, 3);
      const festMult = roundQty(tomorrowForecastObj?.festival_multiplier || 1.0, 2);
      const trendMult = roundQty(tomorrowForecastObj?.trend_multiplier || 1.0, 2);
      const unitStr = isWeight ? 'kg' : 'pcs';

      const formulaDisplay = `${base8Wk} ${unitStr} (8-wk avg) × ${festMult}x (${tomorrowForecastObj?.event_name || 'Normal'}) × ${trendMult}x (Trend) = ${tomorrowForecast} ${unitStr}`;

      const suggestedTomorrow = roundQty(Math.max(0, tomorrowForecast + safetyBuffer - Math.max(0, currentStock)), 3);
      const suggested7Day = roundQty(Math.max(0, next7DayDemand + safetyBuffer - Math.max(0, currentStock)), 3);
      const suggested3Day = roundQty(Math.max(0, target3DayDemand + safetyBuffer - Math.max(0, currentStock)), 3);

      // Compute Forecast vs Actual accuracy over last 7 active sales days
      const lastActual = roundQty(analytics?.avg_daily_7d || base8Wk, 3);
      const lastForecast = roundQty(base8Wk * trendMult, 3);
      const errorRatio = lastForecast > 0 ? Math.abs(lastActual - lastForecast) / Math.max(lastActual, lastForecast, 1) : 0.08;
      const accuracyPercent = Math.round(Math.max(68, Math.min(99, (1 - errorRatio * 0.5) * 100)));

      suggestions.push({
        product_variant_id: v.id,
        product_name: v.product_name,
        variant_name: v.variant_name,
        product_code: String(v.product_code || v.id),
        category: v.category || 'Meat',
        unit_type: isWeight ? 'weight' : 'piece',
        current_stock: currentStock,
        safety_threshold: safetyThreshold,
        avg_daily_30d: avg30d,
        base_8wk_weekday_avg: base8Wk,
        tomorrow_festival_multiplier: festMult,
        tomorrow_event_name: tomorrowForecastObj?.event_name || null,
        trend_multiplier: trendMult,
        tomorrow_forecast: tomorrowForecast,
        next_7day_forecast: roundQty(next7DayDemand, 3),
        target_3day_forecast: roundQty(target3DayDemand, 3),
        safety_buffer: safetyBuffer,
        bulk_orders_addition: roundQty(bulkAdditionsTotal, 3),
        festival_adjustment_factor: festMult,
        event_notes: Array.from(allNotesSet).slice(0, 4),
        formula_display: formulaDisplay,
        suggested_tomorrow_purchase_qty: suggestedTomorrow,
        suggested_7day_purchase_qty: suggested7Day,
        suggested_purchase_quantity: suggested3Day,
        accuracy_percent: accuracyPercent,
        last_actual_qty: lastActual,
        last_forecast_qty: lastForecast,
        recount_needed: currentStock <= 0,
      });
    }

    return suggestions.sort((a, b) => b.suggested_tomorrow_purchase_qty - a.suggested_tomorrow_purchase_qty);
  }

  public getUpcomingEvents(daysAhead = 7): CalendarEventRow[] {
    const todayStr = new Date().toISOString().split('T')[0];
    const end = new Date();
    end.setDate(end.getDate() + daysAhead);
    const endStr = end.toISOString().split('T')[0];

    return db.prepare(`
      SELECT * FROM calendar_events
      WHERE event_date >= ? AND event_date <= ?
      ORDER BY event_date ASC
    `).all(todayStr, endStr) as CalendarEventRow[];
  }

  public listAllCalendarEvents(): CalendarEventRow[] {
    return db.prepare('SELECT * FROM calendar_events ORDER BY event_date ASC').all() as CalendarEventRow[];
  }

  public createCalendarEvent(input: {
    id?: number;
    event_name: string;
    event_date: string;
    impact_level: 'High' | 'Normal' | 'Low' | 'Very_Low';
    notes?: string;
    confidence_level?: string;
    custom_multiplier?: number;
    category?: string;
  }): CalendarEventRow {
    if (!input.event_name?.trim() || !input.event_date) {
      throw new ValidationError('Event name and date are required');
    }

    const defaultMult =
      input.impact_level === 'Very_Low' ? 0.3 :
      input.impact_level === 'Low' ? 0.6 :
      input.impact_level === 'High' ? 1.5 : 1.0;

    const customMult = input.custom_multiplier !== undefined && !isNaN(Number(input.custom_multiplier))
      ? Math.min(2.0, Math.max(0.3, Number(input.custom_multiplier)))
      : defaultMult;
    const confidence = input.confidence_level || 'Verified';
    const category = input.category || 'Local / Custom';

    if (input.id) {
      db.prepare(`
        UPDATE calendar_events
        SET event_name = ?, event_date = ?, impact_level = ?, notes = ?, confidence_level = ?, custom_multiplier = ?, category = ?
        WHERE id = ?
      `).run(input.event_name.trim(), input.event_date, input.impact_level, input.notes?.trim() || null, confidence, customMult, category, input.id);
      return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(input.id) as CalendarEventRow;
    }

    const res = db.prepare(`
      INSERT INTO calendar_events (event_name, event_date, impact_level, notes, confidence_level, custom_multiplier, category)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.event_name.trim(), input.event_date, input.impact_level, input.notes?.trim() || null, confidence, customMult, category);

    return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(res.lastInsertRowid) as CalendarEventRow;
  }

  public deleteCalendarEvent(id: number): void {
    db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
  }

  public getPendingBulkOrders(): BulkOrderRow[] {
    const todayStr = new Date().toISOString().split('T')[0];
    return db.prepare(`
      SELECT bo.*, pv.variant_name, p.name as product_name, p.unit_type
      FROM bulk_orders bo
      JOIN product_variants pv ON pv.id = bo.product_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE bo.status = 'pending' AND bo.delivery_date >= ?
      ORDER BY bo.delivery_date ASC
    `).all(todayStr) as BulkOrderRow[];
  }

  public createBulkOrder(input: {
    delivery_date: string;
    product_variant_id: number;
    quantity: number;
    customer_name_or_notes: string;
  }, userId: number): BulkOrderRow {
    if (!input.delivery_date || !input.product_variant_id || !input.quantity || !input.customer_name_or_notes?.trim()) {
      throw new ValidationError('Delivery date, variant, quantity, and customer notes are mandatory');
    }

    const variant = db.prepare('SELECT unit_type FROM product_variants WHERE id = ?').get(input.product_variant_id) as any;
    if (!variant) throw new ValidationError('Invalid product variant');

    const isWeight = variant.unit_type === 'weight' || variant.unit_type === 'live_dual';
    const grams = isWeight ? Math.round(input.quantity * 1000) : null;
    const units = !isWeight ? Math.round(input.quantity) : null;

    const res = db.prepare(`
      INSERT INTO bulk_orders (
        delivery_date, product_variant_id, quantity_grams, quantity_units,
        customer_name_or_notes, status, created_by
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?)
    `).run(input.delivery_date, input.product_variant_id, grams, units, input.customer_name_or_notes.trim(), userId);

    auditLogger.log(userId, 'BULK_ORDER_CREATED', {
      orderId: res.lastInsertRowid,
      deliveryDate: input.delivery_date,
      variantId: input.product_variant_id,
      quantity: input.quantity,
      customer: input.customer_name_or_notes,
    });

    return db.prepare('SELECT * FROM bulk_orders WHERE id = ?').get(res.lastInsertRowid) as BulkOrderRow;
  }

  public cancelBulkOrder(id: number, userId: number): void {
    db.prepare("UPDATE bulk_orders SET status = 'cancelled' WHERE id = ?").run(id);
    auditLogger.log(userId, 'BULK_ORDER_CANCELLED', { orderId: id });
  }
}

export const demandForecastingService = new DemandForecastingService();
export default demandForecastingService;

