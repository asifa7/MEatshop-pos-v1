// src/modules/inventory/backend/service/inventory_consistency_checker.ts
// Comprehensive Inventory Consistency Checker & Discrepancy Report

import { db, dbManager } from '../../../../core/backend/db';
import { logger } from '../../../../core/backend/logger';

export interface ConsistencyIssue {
  issue_type: 
    | 'LEDGER_MISMATCH'
    | 'ACTIVE_BATCH_ZERO_QTY'
    | 'NEGATIVE_STOCK'
    | 'INVOICE_MISSING_DEDUCTION'
    | 'PURCHASE_MISSING_ADDITION'
    | 'UNTRACKED_PRODUCT_IN_LEDGER';
  severity: 'high' | 'medium' | 'low';
  product_variant_id?: number;
  product_name?: string;
  variant_name?: string;
  reference_id?: number;
  description: string;
  expected_value?: any;
  actual_value?: any;
}

export interface ConsistencyCheckReport {
  timestamp: string;
  total_checked_variants: number;
  total_issues_found: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  issues: ConsistencyIssue[];
  summary: {
    ledger_mismatches: number;
    stale_active_batches: number;
    negative_stock_items: number;
    missing_invoice_deductions: number;
    missing_purchase_additions: number;
  };
}

export class InventoryConsistencyChecker {
  /**
   * Run full health check across all inventory tables
   */
  public runConsistencyCheck(): ConsistencyCheckReport {
    const issues: ConsistencyIssue[] = [];
    const timestamp = new Date().toISOString();

    // 1. Check: Sum of all movements = Current Stock (stock_ledger vs inventory_ledger)
    const trackedVariants = db.prepare(`
      SELECT pv.id as variant_id, pv.variant_name, p.name as product_name, p.unit_type,
             COALESCE(sl.quantity_grams, 0) as stock_grams,
             COALESCE(sl.quantity_units, 0) as stock_units
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      LEFT JOIN stock_ledger sl ON sl.product_variant_id = pv.id
      WHERE pv.is_active = 1 AND p.is_active = 1 AND COALESCE(pv.track_in_inventory, 1) = 1 AND COALESCE(p.is_inventory_tracked, 1) = 1
    `).all() as any[];

    let ledgerMismatches = 0;
    let negativeStockItems = 0;

    for (const tv of trackedVariants) {
      const isWeight = tv.unit_type === 'weight' || tv.unit_type === 'live_dual';

      // Sum from inventory_ledger
      const sumRow = db.prepare(`
        SELECT 
          SUM(COALESCE(quantity_grams, 0)) as sum_grams,
          SUM(COALESCE(quantity_units, 0)) as sum_units
        FROM inventory_ledger
        WHERE product_variant_id = ?
      `).get(tv.variant_id) as any;

      const hasLedgerRows = db.prepare(`SELECT 1 FROM inventory_ledger WHERE product_variant_id = ? LIMIT 1`).get(tv.variant_id);

      if (hasLedgerRows) {
        if (isWeight && sumRow?.sum_grams !== tv.stock_grams) {
          ledgerMismatches++;
          issues.push({
            issue_type: 'LEDGER_MISMATCH',
            severity: 'high',
            product_variant_id: tv.variant_id,
            product_name: tv.product_name,
            variant_name: tv.variant_name,
            description: `Stock ledger (${tv.stock_grams / 1000} kg) differs from movement ledger sum (${(sumRow?.sum_grams || 0) / 1000} kg)`,
            expected_value: (sumRow?.sum_grams || 0) / 1000,
            actual_value: tv.stock_grams / 1000,
          });
        } else if (!isWeight && sumRow?.sum_units !== tv.stock_units) {
          ledgerMismatches++;
          issues.push({
            issue_type: 'LEDGER_MISMATCH',
            severity: 'high',
            product_variant_id: tv.variant_id,
            product_name: tv.product_name,
            variant_name: tv.variant_name,
            description: `Stock ledger (${tv.stock_units} pcs) differs from movement ledger sum (${sumRow?.sum_units || 0} pcs)`,
            expected_value: sumRow?.sum_units || 0,
            actual_value: tv.stock_units,
          });
        }
      }

      // Check negative stock
      if (isWeight && tv.stock_grams < 0) {
        negativeStockItems++;
        issues.push({
          issue_type: 'NEGATIVE_STOCK',
          severity: 'medium',
          product_variant_id: tv.variant_id,
          product_name: tv.product_name,
          variant_name: tv.variant_name,
          description: `Product has negative physical stock (${tv.stock_grams / 1000} kg)`,
          actual_value: tv.stock_grams / 1000,
        });
      } else if (!isWeight && tv.stock_units < 0) {
        negativeStockItems++;
        issues.push({
          issue_type: 'NEGATIVE_STOCK',
          severity: 'medium',
          product_variant_id: tv.variant_id,
          product_name: tv.product_name,
          variant_name: tv.variant_name,
          description: `Product has negative physical stock (${tv.stock_units} pcs)`,
          actual_value: tv.stock_units,
        });
      }
    }

    // 2. Check: No active batches with qty <= 0
    const staleBatches = db.prepare(`
      SELECT b.id, b.batch_number, b.product_variant_id, b.current_quantity_grams, b.current_quantity_units,
             pv.variant_name, p.name as product_name
      FROM product_stock_batches b
      JOIN product_variants pv ON b.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE b.status = 'active' AND (
        (b.current_quantity_grams IS NOT NULL AND b.current_quantity_grams <= 0) OR
        (b.current_quantity_units IS NOT NULL AND b.current_quantity_units <= 0)
      )
    `).all() as any[];

    for (const sb of staleBatches) {
      issues.push({
        issue_type: 'ACTIVE_BATCH_ZERO_QTY',
        severity: 'low',
        product_variant_id: sb.product_variant_id,
        product_name: sb.product_name,
        variant_name: sb.variant_name,
        description: `Batch #${sb.batch_number} is marked active but has 0 remaining quantity`,
      });
    }

    // 3. Check: Invoices have matching ledger deductions
    const missingInvoiceMovements = db.prepare(`
      SELECT i.id as invoice_id, i.invoice_number
      FROM invoices i
      WHERE i.status = 'completed' AND NOT EXISTS (
        SELECT 1 FROM inventory_ledger il
        WHERE (il.reference_type = 'invoice' AND il.reference_id = i.id)
           OR il.reference_number = i.invoice_number
      )
    `).all() as any[];

    for (const inv of missingInvoiceMovements) {
      issues.push({
        issue_type: 'INVOICE_MISSING_DEDUCTION',
        severity: 'medium',
        reference_id: inv.invoice_id,
        description: `Completed invoice #${inv.invoice_number} has no corresponding inventory ledger deduction`,
      });
    }

    // 4. Check: Purchases have matching ledger additions
    const missingPurchaseMovements = db.prepare(`
      SELECT p.id as purchase_id
      FROM purchases p
      WHERE NOT EXISTS (
        SELECT 1 FROM inventory_ledger il
        WHERE il.reference_type = 'purchase' AND il.reference_id = p.id
      )
    `).all() as any[];

    for (const pur of missingPurchaseMovements) {
      issues.push({
        issue_type: 'PURCHASE_MISSING_ADDITION',
        severity: 'medium',
        reference_id: pur.purchase_id,
        description: `Purchase #${pur.purchase_id} has no corresponding inventory ledger entry`,
      });
    }

    const reportStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL' = 
      ledgerMismatches > 0 ? 'CRITICAL' : 
      issues.length > 0 ? 'WARNING' : 'HEALTHY';

    return {
      timestamp,
      total_checked_variants: trackedVariants.length,
      total_issues_found: issues.length,
      status: reportStatus,
      issues,
      summary: {
        ledger_mismatches: ledgerMismatches,
        stale_active_batches: staleBatches.length,
        negative_stock_items: negativeStockItems,
        missing_invoice_deductions: missingInvoiceMovements.length,
        missing_purchase_additions: missingPurchaseMovements.length,
      }
    };
  }

  /**
   * Automatic repair: syncs stock_ledger with inventory_ledger for all mismatched variants
   * and exhausts zero-qty batches
   */
  public repairInconsistencies(): { repairedCount: number } {
    const report = this.runConsistencyCheck();
    let repairedCount = 0;

    dbManager.transaction(() => {
      // 1. Sync ledger mismatches
      for (const issue of report.issues) {
        if (issue.issue_type === 'LEDGER_MISMATCH' && issue.product_variant_id) {
          const { inventoryLedgerService } = require('./inventory_ledger_service');
          inventoryLedgerService.recalculateStockFromLedger(issue.product_variant_id);
          repairedCount++;
        }
      }

      // 2. Mark zero-qty active batches as exhausted
      const res = db.prepare(`
        UPDATE product_stock_batches
        SET status = 'exhausted', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active' AND (
          (current_quantity_grams IS NOT NULL AND current_quantity_grams <= 0) OR
          (current_quantity_units IS NOT NULL AND current_quantity_units <= 0)
        )
      `).run();
      repairedCount += res.changes;
    });

    return { repairedCount };
  }
}

export const inventoryConsistencyChecker = new InventoryConsistencyChecker();
