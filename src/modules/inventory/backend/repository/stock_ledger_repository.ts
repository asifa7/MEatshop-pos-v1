import { db } from '../../../../core/backend/db';
import { NotFoundError } from '../../../../core/backend/errors';

export interface StockLedgerRow {
  id: number;
  product_variant_id: number;
  quantity_grams: number | null;
  quantity_units: number | null;
  safety_threshold_grams: number | null;
  safety_threshold_units: number | null;
  updated_at: string;
}

export interface StockStatusRow extends StockLedgerRow {
  variant_name: string;
  product_name: string;
  product_code: string;
  category: string;
  unit_type: 'weight' | 'piece';
  track_in_inventory?: number;
  is_inventory_tracked?: number;
}

export const stockLedgerRepository = {
  findByVariantId(productVariantId: number): StockLedgerRow | undefined {
    return db.prepare('SELECT * FROM stock_ledger WHERE product_variant_id = ?').get(productVariantId) as StockLedgerRow | undefined;
  },

  updateStock(productVariantId: number, deltaGrams: number | null, deltaUnits: number | null): void {
    const existing = this.findByVariantId(productVariantId);
    if (!existing) {
      // If not in ledger, fetch unit type to insert a default row
      const variant = db.prepare(`
        SELECT pv.id, p.unit_type 
        FROM product_variants pv 
        JOIN products p ON pv.product_id = p.id 
        WHERE pv.id = ?
      `).get(productVariantId) as { unit_type: 'weight' | 'piece' } | undefined;

      if (!variant) {
        throw new NotFoundError(`Product variant with id ${productVariantId} not found`);
      }

      if (variant.unit_type === 'weight') {
        db.prepare(`
          INSERT INTO stock_ledger (product_variant_id, quantity_grams, quantity_units, safety_threshold_grams, safety_threshold_units)
          VALUES (?, ?, NULL, 5000, NULL)
        `).run(productVariantId, deltaGrams ?? 0);
      } else {
        db.prepare(`
          INSERT INTO stock_ledger (product_variant_id, quantity_grams, quantity_units, safety_threshold_grams, safety_threshold_units)
          VALUES (?, NULL, ?, NULL, 10)
        `).run(productVariantId, deltaUnits ?? 0);
      }
    } else {
      if (existing.quantity_grams !== null && deltaGrams !== null) {
        db.prepare(`
          UPDATE stock_ledger 
          SET quantity_grams = quantity_grams + @delta, updated_at = CURRENT_TIMESTAMP 
          WHERE product_variant_id = @variantId
        `).run({ delta: deltaGrams, variantId: productVariantId });
      } else if (existing.quantity_units !== null && deltaUnits !== null) {
        db.prepare(`
          UPDATE stock_ledger 
          SET quantity_units = quantity_units + @delta, updated_at = CURRENT_TIMESTAMP 
          WHERE product_variant_id = @variantId
        `).run({ delta: deltaUnits, variantId: productVariantId });
      }
    }
  },

  findAll(): StockStatusRow[] {
    return db.prepare(`
      SELECT COALESCE(sl.id, 0) as id,
             pv.id as product_variant_id,
             sl.quantity_grams,
             sl.quantity_units,
             sl.safety_threshold_grams,
             sl.safety_threshold_units,
             COALESCE(sl.updated_at, pv.updated_at, CURRENT_TIMESTAMP) as updated_at,
             pv.variant_name,
             p.name as product_name,
             COALESCE(pv.product_code, p.product_code) as product_code,
             COALESCE(p.category, 'General') as category,
             COALESCE(pv.unit_type, p.unit_type, 'weight') as unit_type,
             p.is_inventory_tracked,
             COALESCE(pv.track_in_inventory, 1) as track_in_inventory,
             pv.cost_price_paise_per_unit,
             pv.current_rate_paise_per_unit,
             pv.last_purchase_cost,
             pv.weighted_average_cost,
             (
               SELECT unit_cost_paise 
               FROM product_stock_batches 
               WHERE product_variant_id = pv.id AND status = 'active' 
               ORDER BY received_date DESC, id DESC 
               LIMIT 1
             ) as latest_purchase_rate_paise,
             (
               SELECT unit_cost_paise 
               FROM product_stock_batches 
               WHERE product_variant_id = pv.id AND status = 'active' 
               ORDER BY received_date DESC, id DESC 
               LIMIT 1 OFFSET 1
             ) as previous_purchase_rate_paise
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN stock_ledger sl ON sl.product_variant_id = pv.id
      WHERE pv.is_active = 1 AND p.is_active = 1 AND COALESCE(pv.track_in_inventory, 1) = 1 AND COALESCE(p.is_inventory_tracked, 1) = 1
      ORDER BY p.name ASC, pv.variant_name ASC
    `).all() as StockStatusRow[];
  },

  getLowStock(): StockStatusRow[] {
    return db.prepare(`
      SELECT sl.*, pv.variant_name, p.name as product_name, p.product_code, p.category, p.unit_type, p.is_inventory_tracked,
             pv.cost_price_paise_per_unit, pv.current_rate_paise_per_unit, pv.last_purchase_cost, pv.weighted_average_cost,
             COALESCE(pv.track_in_inventory, 1) as track_in_inventory,
             (
               SELECT unit_cost_paise 
               FROM product_stock_batches 
               WHERE product_variant_id = pv.id AND status = 'active' 
               ORDER BY received_date DESC, id DESC 
               LIMIT 1
             ) as latest_purchase_rate_paise,
             (
               SELECT unit_cost_paise 
               FROM product_stock_batches 
               WHERE product_variant_id = pv.id AND status = 'active' 
               ORDER BY received_date DESC, id DESC 
               LIMIT 1 OFFSET 1
             ) as previous_purchase_rate_paise
      FROM stock_ledger sl
      JOIN product_variants pv ON sl.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE pv.is_active = 1 AND p.is_active = 1 AND COALESCE(pv.track_in_inventory, 1) = 1 AND COALESCE(p.is_inventory_tracked, 1) = 1 AND (
        (p.unit_type = 'weight' AND sl.safety_threshold_grams > 0 AND sl.quantity_grams <= sl.safety_threshold_grams) OR
        (p.unit_type = 'piece' AND sl.safety_threshold_units > 0 AND sl.quantity_units <= sl.safety_threshold_units) OR
        (p.unit_type = 'weight' AND (sl.quantity_grams IS NULL OR sl.quantity_grams <= 0)) OR
        (p.unit_type = 'piece' AND (sl.quantity_units IS NULL OR sl.quantity_units <= 0))
      )
      ORDER BY p.name ASC, pv.variant_name ASC
    `).all() as StockStatusRow[];
  },

  getMetadata(key: string): string | null {
    try {
      const row = db.prepare('SELECT value FROM inventory_metadata WHERE key = ?').get(key) as { value: string } | undefined;
      return row ? row.value : null;
    } catch {
      return null;
    }
  },

  setMetadata(key: string, value: string): void {
    db.prepare(`
      INSERT INTO inventory_metadata (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  },

  getSidebarSummary() {
    const all = this.findAll();
    let ok = 0;
    let low = 0;
    let critical = 0;

    const itemsWithStatus = all.map(item => {
      const isTracked = (item as any).track_in_inventory !== 0 && item.is_inventory_tracked !== 0;
      const isWeight = item.unit_type === 'weight';
      const current = isWeight ? (item.quantity_grams ?? 0) : (item.quantity_units ?? 0);
      const rawThreshold = isWeight ? item.safety_threshold_grams : item.safety_threshold_units;
      const hasDefinedThreshold = rawThreshold !== null && rawThreshold !== undefined && rawThreshold > 0;
      const threshold = hasDefinedThreshold ? rawThreshold! : 0;

      let status: 'ok' | 'low' | 'critical' = 'ok';
      let reason: string | undefined;

      if (!isTracked) {
        status = 'ok'; // Untracked products never flagged as low or critical
      } else if (current <= 0) {
        status = 'critical';
        critical++;
        reason = current < 0 ? 'Negative stock' : 'Out of stock';
      } else if (hasDefinedThreshold && current <= threshold) {
        status = current <= (threshold * 0.5) ? 'critical' : 'low';
        if (status === 'critical') critical++; else low++;
        reason = 'Below safety threshold';
      } else {
        ok++;
      }

      const ratio = hasDefinedThreshold ? (current / threshold) : (current <= 0 ? 0 : 2);

      return {
        ...item,
        currentQty: isTracked ? current : null,
        thresholdQty: isTracked ? threshold : null,
        ratio: isTracked ? ratio : 999,
        status,
        attention_reason: reason,
        is_tracked: isTracked,
      };
    });

    const needsAttention = itemsWithStatus
      .filter(i => (i as any).is_tracked && i.status !== 'ok')
      .sort((a, b) => a.ratio - b.ratio)
      .slice(0, 10);

    const trackedTotal = all.filter(i => (i as any).track_in_inventory !== 0 && i.is_inventory_tracked !== 0).length;

    const recentMovements = db.prepare(`
      SELECT il.*, pv.variant_name, p.name as product_name, p.unit_type
      FROM inventory_ledger il
      JOIN product_variants pv ON il.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      ORDER BY il.created_at DESC, il.id DESC
      LIMIT 5
    `).all() as any[];

    return {
      statusCounts: { ok, low, critical, total: trackedTotal },
      needsAttention,
      recentMovements,
    };
  }
};
