import { db, dbManager } from '../../../../core/backend/db';
import type { Transaction } from 'better-sqlite3';
import { ConflictError, ValidationError } from '../../../../core/backend/errors';
import { productsRepository, type ProductRow } from '../../../billing/backend/repository/products_repository';
import { productVariantsRepository, type ProductVariantRow } from '../../../billing/backend/repository/product_variants_repository';
import { createProductSchema, updateProductSchema, type CreateProductInput, type UpdateProductInput } from '../validation/create_product.schema';
import { createVariantSchema, updateVariantSchema, type CreateVariantInput } from '../validation/create_variant.schema';
import { updateRateSchema, type UpdateRateInput } from '../validation/update_rate.schema';
import { authService } from '../../../auth/backend/service/auth_service';
import { logger, auditLogger } from '../../../../core/backend/logger';

/** Auto-generate a unique product code as a plain integer string (e.g. 1, 2, 3...) */
function generateProductCode(): string {
  const variants = db.prepare('SELECT product_code FROM product_variants').all() as { product_code?: string }[];
  let maxCode = 0;
  for (const v of variants) {
    if (v.product_code) {
      const clean = v.product_code.replace(/^prd-0*/i, '').replace(/^0+/, '');
      const num = parseInt(clean, 10);
      if (!isNaN(num) && num > maxCode) {
        maxCode = num;
      }
    }
  }
  return String(maxCode > 0 ? maxCode + 1 : variants.length + 1);
}

export interface AdminProductVariant extends ProductVariantRow {
  rateHistory: { id: number; rate_paise_per_unit: number; effective_from: string; set_by: number }[];
  hasInvoiceHistory: boolean;
}

export interface AdminProduct extends ProductRow {
  variants: AdminProductVariant[];
  hasInvoiceHistory: boolean;
  variant_name?: string;
  type?: string;
  current_rate_paise_per_unit: number;
  cost_price_paise_per_unit?: number;
  rateHistory: { id: number; rate_paise_per_unit: number; effective_from: string; set_by: number }[];
}

function archiveVariantSnapshot(variantId: number, userId: number, username: string): void {
  try {
    const variant = db.prepare(`
      SELECT pv.*, p.name as product_name, p.category, p.unit_type as p_unit_type,
             p.is_processed_cut as p_is_processed_cut
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ?
    `).get(variantId) as any;

    if (!variant) return;

    let rateHistory: any[] = [];
    try {
      rateHistory = db.prepare('SELECT * FROM product_variant_rate_history WHERE product_variant_id = ?').all(variantId);
    } catch (e) {}

    let stockLedger: any[] = [];
    try {
      stockLedger = db.prepare('SELECT * FROM stock_ledger WHERE product_variant_id = ?').all(variantId);
    } catch (e) {}

    let invoiceCount = 0;
    try {
      const invCountRow = db.prepare('SELECT COUNT(*) as cnt FROM invoice_items WHERE product_variant_id = ?').get(variantId) as any;
      invoiceCount = invCountRow?.cnt || 0;
    } catch (e) {}

    const snapshot = {
      variant,
      parentProduct: {
        id: variant.product_id,
        name: variant.product_name,
        category: variant.category,
        unit_type: variant.unit_type || variant.p_unit_type,
        is_processed_cut: variant.is_processed_cut ?? variant.p_is_processed_cut ?? 0,
        track_in_inventory: variant.track_in_inventory ?? variant.p_track_in_inventory ?? 1,
      },
      rateHistory,
      stockLedger,
      invoiceCount,
    };

    db.prepare(`
      INSERT INTO deleted_products_archive (
        entity_type, original_id, original_parent_id, product_code, name, category,
        unit_type, is_processed_cut, track_in_inventory, current_rate_paise,
        cost_price_paise, snapshot_json, deleted_by, deleted_by_username
      ) VALUES (
        'variant', ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      variant.id,
      variant.product_id,
      variant.product_code || String(variant.id),
      variant.variant_name || variant.product_name,
      variant.category || 'General',
      variant.unit_type || variant.p_unit_type || 'weight',
      variant.is_processed_cut ?? variant.p_is_processed_cut ?? 0,
      variant.track_in_inventory ?? variant.p_track_in_inventory ?? 1,
      variant.current_rate_paise_per_unit || 0,
      variant.cost_price_paise_per_unit || 0,
      JSON.stringify(snapshot),
      userId,
      username
    );
  } catch (err) {
    logger.error('Failed to archive deleted product snapshot', err);
  }
}

const productManagementService = {
  /**
   * Returns all sellable products (including inactive) with their rates, codes, and history.
   * Directly unifies Billing and Product Catalogue to share the EXACT same single product list.
   */
  getAllProducts(): AdminProduct[] {
    const rows = db.prepare(`
      SELECT 
        pv.id,
        pv.product_id,
        COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS product_code,
        p.name AS product_name,
        pv.variant_name,
        COALESCE(p.category, 'General') AS category,
        COALESCE(pv.unit_type, p.unit_type, 'weight') AS unit_type,
        pv.current_rate_paise_per_unit,
        COALESCE(pv.cost_price_paise_per_unit, 0) AS cost_price_paise_per_unit,
        pv.barcode,
        pv.effective_from,
        pv.is_active,
        pv.is_processed_cut,
        COALESCE(pv.track_in_inventory, 1) AS track_in_inventory,
        pv.last_purchase_cost,
        pv.weighted_average_cost,
        pv.fifo_current_cost,
        pv.current_stock,
        pv.inventory_value,
        pv.parent_variant_id,
        pv.yield_ratio,
        p.created_at,
        p.updated_at,
        COALESCE(p.stock_mode, 'OWN') AS stock_mode,
        p.parent_product_id,
        p.link_mode,
        p.yield_g_per_kg,
        p.parent_units_per_sale_unit
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      ORDER BY CAST(COALESCE(pv.product_code, CAST(pv.id AS TEXT)) AS INTEGER) ASC
    `).all() as any[];

    return rows.map(r => {
      const rateHistory = productVariantsRepository.getRateHistory(r.id);
      const hasInvoiceHistory = productVariantsRepository.hasInvoiceHistory(r.id);
      const isProcessed = r.is_processed_cut === 1;
      const type = isProcessed ? 'Processed (Cut/Minced)' : 'Unprocessed (Raw)';

      let displayName = r.variant_name;
      if (r.product_name && r.variant_name) {
        const pLower = r.product_name.toLowerCase().trim();
        const vLower = r.variant_name.toLowerCase().trim();
        if (pLower === vLower) {
          displayName = r.product_name;
        } else if (vLower.includes(pLower)) {
          displayName = r.variant_name;
        } else {
          displayName = `${r.product_name} - ${r.variant_name}`;
        }
      }

      return {
        id: r.id, // Primary key of sellable item (variant id)
        product_code: r.product_code,
        name: displayName,
        variant_name: r.variant_name,
        category: r.category,
        unit_type: r.unit_type,
        type,
        is_active: r.is_active,
        is_processed_cut: r.is_processed_cut,
        track_in_inventory: r.track_in_inventory !== undefined && r.track_in_inventory !== null ? r.track_in_inventory : (r.is_processed_cut === 0 ? 1 : 0),
        stock_mode: r.stock_mode || 'OWN',
        parent_product_id: r.parent_product_id,
        link_mode: r.link_mode,
        yield_g_per_kg: r.yield_g_per_kg,
        parent_units_per_sale_unit: r.parent_units_per_sale_unit,
        current_rate_paise_per_unit: r.current_rate_paise_per_unit,
        cost_price_paise_per_unit: r.cost_price_paise_per_unit,
        created_at: r.created_at,
        updated_at: r.updated_at,
        hasInvoiceHistory,
        rateHistory,
        variants: [],
      } as AdminProduct;
    });
  },

  /**
   * Create a new sellable product with unified code, category, rate, and inventory tracking.
   * Automatically adds to both product catalogue and billing grid.
   */
  createProduct(raw: unknown): any {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const input = createProductSchema.parse(raw) as CreateProductInput;
    let code = input.product_code?.trim() || generateProductCode();
    if (/^0+[0-9]+$/.test(code)) {
      code = code.replace(/^0+/, '');
    } else if (/^prd-0*[0-9]+$/i.test(code)) {
      code = code.replace(/^prd-0*/i, '');
    }

    // Ensure uniqueness in product_variants
    const existingVariant = db.prepare('SELECT id FROM product_variants WHERE product_code = ?').get(code) as any;
    if (existingVariant) {
      code = generateProductCode();
    }

    const userId = authService.getCurrentUserId() || 1;
    const isProcessedCut = input.is_processed_cut ?? (input.type?.toLowerCase().includes('process') ? 1 : 0);
    const trackInInv = input.track_in_inventory ?? (isProcessedCut === 0 ? 1 : 0);
    const stockMode = input.stock_mode || (isProcessedCut === 1 ? 'LINKED' : 'OWN');

    if (stockMode === 'LINKED') {
      if (!input.parent_product_id) {
        throw new ValidationError('A parent product must be selected for linked stock deduction.');
      }
      const parent = db.prepare('SELECT * FROM products WHERE id = ?').get(input.parent_product_id) as any;
      if (!parent || parent.stock_mode !== 'OWN' || parent.is_active !== 1) {
        throw new ValidationError('Selected parent product must be an active product with its own stock (OWN).');
      }
      if (input.link_mode === 'YIELD' && (!input.yield_g_per_kg || input.yield_g_per_kg <= 0)) {
        throw new ValidationError('Yield ratio must be greater than 0 grams per kg.');
      }
      if (input.link_mode === 'PACK' && (!input.parent_units_per_sale_unit || input.parent_units_per_sale_unit <= 0)) {
        throw new ValidationError('Pack size must be greater than 0 units.');
      }
    }

    let createdId = 0;

    const createTx = db.transaction(() => {
      // Find or create parent product by category
      let parentProduct = db.prepare('SELECT * FROM products WHERE category = ? LIMIT 1').get(input.category) as any;
      if (!parentProduct) {
        parentProduct = productsRepository.create({
          product_code: `CAT-${code}`,
          name: input.name,
          unit_type: input.unit_type,
          category: input.category,
          is_processed_cut: isProcessedCut,
        });
      }

      // Update product stock mode & linking
      db.prepare(`
        UPDATE products SET
          stock_mode = @stock_mode,
          parent_product_id = @parent_product_id,
          link_mode = @link_mode,
          yield_g_per_kg = @yield_g_per_kg,
          parent_units_per_sale_unit = @parent_units_per_sale_unit,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = @product_id
      `).run({
        stock_mode: stockMode,
        parent_product_id: input.parent_product_id || null,
        link_mode: input.link_mode || null,
        yield_g_per_kg: input.yield_g_per_kg || null,
        parent_units_per_sale_unit: input.parent_units_per_sale_unit || null,
        product_id: parentProduct.id,
      });

      // Create variant
      const vRes = db.prepare(`
        INSERT INTO product_variants (
          product_id, variant_name, product_code, current_rate_paise_per_unit,
          cost_price_paise_per_unit, unit_type, is_processed_cut, track_in_inventory,
          effective_from, is_active
        ) VALUES (
          @product_id, @variant_name, @product_code, @current_rate_paise_per_unit,
          @cost_price_paise_per_unit, @unit_type, @is_processed_cut, @track_in_inventory,
          CURRENT_TIMESTAMP, 1
        )
      `).run({
        product_id: parentProduct.id,
        variant_name: input.name,
        product_code: code,
        current_rate_paise_per_unit: input.rate_paise,
        cost_price_paise_per_unit: input.cost_price_paise || 0,
        unit_type: input.unit_type,
        is_processed_cut: isProcessedCut,
        track_in_inventory: trackInInv,
      });

      createdId = vRes.lastInsertRowid as number;

      if (input.parent_product_id) {
        const parentVar = db.prepare('SELECT id FROM product_variants WHERE product_id = ? LIMIT 1').get(input.parent_product_id) as any;
        if (parentVar) {
          db.prepare('UPDATE product_variants SET parent_variant_id = ?, yield_ratio = ? WHERE id = ?').run(
            parentVar.id,
            input.yield_g_per_kg ? input.yield_g_per_kg / 10.0 : null,
            createdId
          );
        }
      }

      // Insert initial rate history
      productVariantsRepository.insertRateHistory(createdId, input.rate_paise, userId);
      productVariantsRepository.syncVariantCostCache(createdId);
    });

    createTx();

    return { id: createdId, product_code: code, name: input.name };
  },

  /**
   * Update a sellable product's details, rate, code, and category.
   */
  updateProduct(id: number, raw: unknown): any {
    authService.requireRole(['ADMIN', 'MANAGER', 'CASHIER']);
    const input = updateProductSchema.parse(raw) as UpdateProductInput;
    const variant = db.prepare(`
      SELECT pv.*, p.category, p.unit_type as p_unit_type 
      FROM product_variants pv 
      JOIN products p ON pv.product_id = p.id 
      WHERE pv.id = ?
    `).get(id) as any;
    if (!variant) {
      throw new ConflictError(`Product with id ${id} not found.`);
    }

    let code = input.product_code ? input.product_code.trim() : variant.product_code;
    if (code) {
      if (/^0+[0-9]+$/.test(code)) {
        code = code.replace(/^0+/, '');
      } else if (/^prd-0*[0-9]+$/i.test(code)) {
        code = code.replace(/^prd-0*/i, '');
      }
      const existing = db.prepare('SELECT id, variant_name FROM product_variants WHERE product_code = ? AND id != ?').get(code, id) as any;
      if (existing) {
        throw new ConflictError(`Product code "${code}" is already in use by product "${existing.variant_name}".`);
      }
    }

    const userId = authService.getCurrentUserId() || 1;
    const isProcessedCut = input.is_processed_cut !== undefined 
      ? input.is_processed_cut 
      : (input.type ? (input.type.toLowerCase().includes('process') ? 1 : 0) : variant.is_processed_cut);
    const trackInInv = input.track_in_inventory !== undefined ? input.track_in_inventory : variant.track_in_inventory;
    const variantName = input.name ? input.name.trim() : variant.variant_name;
    const unitType = input.unit_type || variant.unit_type || variant.p_unit_type || 'weight';
    const costPrice = input.cost_price_paise !== undefined ? input.cost_price_paise : variant.cost_price_paise_per_unit;

    const stockMode = input.stock_mode !== undefined ? input.stock_mode : undefined;
    if (stockMode === 'LINKED') {
      if (!input.parent_product_id) {
        throw new ValidationError('A parent product must be selected for linked stock deduction.');
      }
      if (variant.product_id === input.parent_product_id) {
        throw new ValidationError('A product cannot link to itself.');
      }
      const parent = db.prepare('SELECT * FROM products WHERE id = ?').get(input.parent_product_id) as any;
      if (!parent || parent.stock_mode !== 'OWN' || parent.is_active !== 1) {
        throw new ValidationError('Selected parent product must be an active product with its own stock (OWN).');
      }
      if (input.link_mode === 'YIELD' && (!input.yield_g_per_kg || input.yield_g_per_kg <= 0)) {
        throw new ValidationError('Yield ratio must be greater than 0 grams per kg.');
      }
      if (input.link_mode === 'PACK' && (!input.parent_units_per_sale_unit || input.parent_units_per_sale_unit <= 0)) {
        throw new ValidationError('Pack size must be greater than 0 units.');
      }
    }

    const updateTx = db.transaction(() => {
      // If rate changed, insert into rate history and update current rate
      if (input.rate_paise !== undefined && input.rate_paise !== variant.current_rate_paise_per_unit) {
        productVariantsRepository.insertRateHistory(id, input.rate_paise, userId);
        db.prepare('UPDATE product_variants SET current_rate_paise_per_unit = ?, effective_from = CURRENT_TIMESTAMP WHERE id = ?').run(input.rate_paise, id);
      }

      // Update variant details
      db.prepare(`
        UPDATE product_variants 
        SET variant_name = @variant_name,
            product_code = @product_code,
            cost_price_paise_per_unit = @cost_price_paise_per_unit,
            unit_type = @unit_type,
            is_processed_cut = @is_processed_cut,
            track_in_inventory = @track_in_inventory
        WHERE id = @id
      `).run({
        id,
        variant_name: variantName,
        product_code: code,
        cost_price_paise_per_unit: costPrice,
        unit_type: unitType,
        is_processed_cut: isProcessedCut,
        track_in_inventory: trackInInv,
      });

      // Synchronize parent product unit_type
      db.prepare('UPDATE products SET unit_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(unitType, variant.product_id);

      // Update parent product category if changed
      if (input.category && input.category !== variant.category) {
        db.prepare('UPDATE products SET category = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(input.category, variant.product_id);
      }

      if (stockMode !== undefined) {
        db.prepare(`
          UPDATE products SET
            stock_mode = @stock_mode,
            parent_product_id = @parent_product_id,
            link_mode = @link_mode,
            yield_g_per_kg = @yield_g_per_kg,
            parent_units_per_sale_unit = @parent_units_per_sale_unit,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = @product_id
        `).run({
          stock_mode: stockMode,
          parent_product_id: input.parent_product_id || null,
          link_mode: input.link_mode || null,
          yield_g_per_kg: input.yield_g_per_kg || null,
          parent_units_per_sale_unit: input.parent_units_per_sale_unit || null,
          product_id: variant.product_id,
        });

        if (input.parent_product_id) {
          const parentVar = db.prepare('SELECT id FROM product_variants WHERE product_id = ? LIMIT 1').get(input.parent_product_id) as any;
          if (parentVar) {
            db.prepare('UPDATE product_variants SET parent_variant_id = ?, yield_ratio = ? WHERE id = ?').run(
              parentVar.id,
              input.yield_g_per_kg ? input.yield_g_per_kg / 10.0 : null,
              id
            );
          }
        } else if (stockMode === 'OWN' || stockMode === 'NONE') {
          db.prepare('UPDATE product_variants SET parent_variant_id = NULL, yield_ratio = NULL WHERE id = ?').run(id);
        }
      }

      productVariantsRepository.syncVariantCostCache(id);
    });

    updateTx();

    return { id, product_code: code, name: variantName };
  },

  /**
   * Deactivate a single product / variant.
   */
  deactivateProduct(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const variantRow = db.prepare('SELECT id, product_id FROM product_variants WHERE id = ?').get(id) as { id: number; product_id: number } | undefined;
    if (variantRow) {
      productVariantsRepository.deactivate(id);
    } else {
      db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(id);
      db.prepare('UPDATE product_variants SET is_active = 0 WHERE product_id = ?').run(id);
    }
  },

  /**
   * Reactivate a single product / variant.
   */
  reactivateProduct(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const variant = db.prepare('SELECT id, product_id FROM product_variants WHERE id = ?').get(id) as { id: number; product_id: number } | undefined;
    if (variant) {
      const reactivateTx = db.transaction(() => {
        productVariantsRepository.reactivate(id);
        if (variant.product_id) {
          db.prepare('UPDATE products SET is_active = 1 WHERE id = ?').run(variant.product_id);
        }
      });
      reactivateTx();
    } else {
      db.prepare('UPDATE products SET is_active = 1 WHERE id = ?').run(id);
      db.prepare('UPDATE product_variants SET is_active = 1 WHERE product_id = ?').run(id);
    }
  },

  /**
   * Delete a single product or variant permanently with full audit archive snapshot.
   */
  deleteProduct(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const userId = authService.getCurrentUserId() || 1;
    let username = 'admin';
    try {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
      if (user?.username) username = user.username;
    } catch (e) {}

    const variantRow = db.prepare('SELECT id, product_id FROM product_variants WHERE id = ?').get(id) as { id: number; product_id: number } | undefined;
    if (variantRow) {
      archiveVariantSnapshot(variantRow.id, userId, username);
      productVariantsRepository.hardDelete(variantRow.id);
    } else {
      const variants = db.prepare('SELECT id FROM product_variants WHERE product_id = ?').all(id) as { id: number }[];
      for (const v of variants) {
        archiveVariantSnapshot(v.id, userId, username);
      }
      productsRepository.hardDelete(id);
    }
  },

  /**
   * Deactivate all products in a specific category.
   */
  deactivateCategory(category: string): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE product_variants SET is_active = 0 
        WHERE product_id IN (SELECT id FROM products WHERE category = ?)
      `).run(category);
      db.prepare('UPDATE products SET is_active = 0 WHERE category = ?').run(category);
    });
    tx();
  },

  /**
   * Reactivate all products in a specific category.
   */
  reactivateCategory(category: string): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const tx = db.transaction(() => {
      db.prepare(`
        UPDATE product_variants SET is_active = 1 
        WHERE product_id IN (SELECT id FROM products WHERE category = ?)
      `).run(category);
      db.prepare('UPDATE products SET is_active = 1 WHERE category = ?').run(category);
    });
    tx();
  },

  /**
   * Permanently delete all products and variants in a specific category with audit archive snapshot.
   */
  deleteCategory(category: string): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const userId = authService.getCurrentUserId() || 1;
    let username = 'admin';
    try {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
      if (user?.username) username = user.username;
    } catch (e) {}

    const variants = db.prepare(`
      SELECT pv.id FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE p.category = ?
    `).all(category) as { id: number }[];

    for (const v of variants) {
      archiveVariantSnapshot(v.id, userId, username);
    }

    const productRows = db.prepare('SELECT id FROM products WHERE category = ?').all(category) as { id: number }[];
    const tx = db.transaction(() => {
      for (const p of productRows) {
        productsRepository.hardDelete(p.id);
      }
      db.prepare('DELETE FROM products WHERE category = ?').run(category);
    });
    tx();
  },

  /**
   * Get all archived deleted products for audit and retrieval.
   */
  getDeletedArchive(): any[] {
    authService.requireRole(['ADMIN', 'MANAGER']);
    return db.prepare(`
      SELECT * FROM deleted_products_archive 
      ORDER BY deleted_at DESC
    `).all();
  },

  /**
   * Restore an archived deleted product back into the active catalogue.
   */
  restoreDeletedProduct(archiveId: number): any {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const archiveRow = db.prepare('SELECT * FROM deleted_products_archive WHERE id = ?').get(archiveId) as any;
    if (!archiveRow) {
      throw new ConflictError('Archived deleted record not found.');
    }

    const userId = authService.getCurrentUserId() || 1;
    let snapshot: any = {};
    try {
      snapshot = JSON.parse(archiveRow.snapshot_json);
    } catch (e) {
      snapshot = {};
    }

    const tx = db.transaction(() => {
      const parentName = snapshot.parentProduct?.name || archiveRow.name;
      const category = snapshot.parentProduct?.category || archiveRow.category || 'General';
      const unitType = archiveRow.unit_type || snapshot.parentProduct?.unit_type || 'weight';
      const isProcessedCut = archiveRow.is_processed_cut ?? snapshot.parentProduct?.is_processed_cut ?? 0;
      const trackInInv = archiveRow.track_in_inventory ?? snapshot.parentProduct?.track_in_inventory ?? 1;

      // 1. Check or recreate parent product
      let parentProduct = db.prepare('SELECT id FROM products WHERE name = ? AND category = ?').get(parentName, category) as any;
      if (!parentProduct) {
        const pRes = db.prepare(`
          INSERT INTO products (name, category, unit_type, is_active, is_processed_cut)
          VALUES (?, ?, ?, 1, ?)
        `).run(parentName, category, unitType, isProcessedCut);
        parentProduct = { id: pRes.lastInsertRowid };
      } else {
        db.prepare('UPDATE products SET is_active = 1 WHERE id = ?').run(parentProduct.id);
      }

      // 2. Ensure product_code is unique
      let code = archiveRow.product_code;
      if (code) {
        const codeTaken = db.prepare('SELECT id FROM product_variants WHERE product_code = ?').get(code);
        if (codeTaken) {
          const maxRow = db.prepare("SELECT MAX(CAST(product_code AS INTEGER)) as max_code FROM product_variants WHERE product_code GLOB '[0-9]*'").get() as any;
          code = String((maxRow?.max_code || 0) + 1);
        }
      }

      // 3. Create restored variant
      const vRes = db.prepare(`
        INSERT INTO product_variants (
          product_id, variant_name, product_code, current_rate_paise_per_unit,
          cost_price_paise_per_unit, unit_type, is_processed_cut, track_in_inventory, is_active
        ) VALUES (
          ?, ?, ?, ?,
          ?, ?, ?, ?, 1
        )
      `).run(
        parentProduct.id,
        archiveRow.name,
        code,
        archiveRow.current_rate_paise || 0,
        archiveRow.cost_price_paise || 0,
        unitType,
        isProcessedCut,
        trackInInv
      );

      const newVariantId = vRes.lastInsertRowid as number;

      // 4. Insert rate history
      productVariantsRepository.insertRateHistory(newVariantId, archiveRow.current_rate_paise || 0, userId);
      productVariantsRepository.syncVariantCostCache(newVariantId);

      // 5. Initialize stock ledger entry if tracked
      if (trackInInv) {
        db.prepare(`
          INSERT OR IGNORE INTO stock_ledger (product_variant_id, location_id, quantity_grams, quantity_units)
          VALUES (?, 1, 0, 0)
        `).run(newVariantId);
      }

      // 6. Mark archive row as restored
      db.prepare(`
        UPDATE deleted_products_archive 
        SET restored_at = CURRENT_TIMESTAMP, restored_by = ? 
        WHERE id = ?
      `).run(userId, archiveId);

      return { id: newVariantId, name: archiveRow.name, product_code: code };
    });

    return tx();
  },

  /**
   * Create a variant under an existing product.
   * The initial rate IS the first row in product_variant_rate_history.
   * Both writes happen in a single transaction.
   */
  createVariant(raw: unknown, setBy?: number): ProductVariantRow {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const input = createVariantSchema.parse(raw) as CreateVariantInput;
    // Verify product exists and get its processed cut status
    const parentProduct = productsRepository.findById(input.product_id);
    const userId = setBy ?? authService.getCurrentUserId();

    let newVariant: ProductVariantRow;
    const insert = db.transaction(() => {
      newVariant = productVariantsRepository.create({
        product_id: input.product_id,
        variant_name: input.variant_name,
        current_rate_paise_per_unit: input.rate_paise,
        is_processed_cut: (parentProduct as any).is_processed_cut ?? 0,
      });
      productVariantsRepository.insertRateHistory(newVariant.id, input.rate_paise, userId);
    });
    insert();
    return newVariant!;
  },

  /**
   * Update a variant's name.
   */
  updateVariantName(variantId: number, raw: unknown): void {
    authService.requireRole(['ADMIN', 'MANAGER', 'CASHIER']);
    const input = updateVariantSchema.parse(raw);
    if (input.variant_name) {
      productVariantsRepository.updateName(variantId, input.variant_name);
    }
  },

  /**
   * Change a variant's pricing rate.
   * Inserts a new product_variant_rate_history row — NEVER silently overwrites.
   * Updates product_variants.current_rate_paise_per_unit — both in one transaction.
   * effective_from is always "now" in this pass (scheduling future rates is a future feature).
   */
  updateVariantRate(raw: unknown): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const input = updateRateSchema.parse(raw) as UpdateRateInput;
    const userId = authService.getCurrentUserId();
    const update = db.transaction(() => {
      productVariantsRepository.insertRateHistory(input.variant_id, input.new_rate_paise, userId);
      productVariantsRepository.updateRate(input.variant_id, input.new_rate_paise);
    });
    update();
  },

  /**
   * Deactivate a single variant. Does not affect the parent product or siblings.
   */
  deactivateVariant(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    productVariantsRepository.deactivate(id);
  },

  /**
   * Reactivate a variant. If the parent product is inactive, reactivates it too — atomically.
   */
  reactivateVariant(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const variant = productVariantsRepository.findById(id);
    const reactivate = db.transaction(() => {
      productVariantsRepository.reactivate(id);
      // If parent product was inactive, wake it up too
      const product = productsRepository.findById(variant.product_id);
      if (product.is_active === 0) {
        productsRepository.update(product.id, { is_active: 1 });
      }
    });
    reactivate();
  },

  /**
   * Hard-delete a variant and its rate history with audit archive snapshot.
   */
  deleteVariant(id: number): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    const userId = authService.getCurrentUserId() || 1;
    let username = 'admin';
    try {
      const user = db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any;
      if (user?.username) username = user.username;
    } catch (e) {}

    archiveVariantSnapshot(id, userId, username);
    productVariantsRepository.hardDelete(id);
  },

  getRateHistory(variantId: number) {
    return productVariantsRepository.getRateHistory(variantId);
  },

  updateVariantYield(variantId: number, parentVariantId: number | null, yieldRatio: number | null): void {
    authService.requireRole(['ADMIN', 'MANAGER']);
    dbManager.transaction(() => {
      db.prepare(`
        UPDATE product_variants 
        SET parent_variant_id = ?, yield_ratio = ? 
        WHERE id = ?
      `).run(parentVariantId, yieldRatio, variantId);
    });
  },

  /**
   * Preview bulk import rows without persisting any data.
   * Returns per‑row validation results.
   */
  previewImportRows(rows: Array<any>): Array<{ rowIndex: number; status: 'Valid' | 'New' | 'Update' | 'Error'; messages?: string[] }> {
    const results: Array<{ rowIndex: number; status: 'Valid' | 'New' | 'Update' | 'Error'; messages?: string[] }> = [];
    const seenCodes = new Set<string>();
    const seenNames = new Set<string>();

    const existingVariants = db.prepare('SELECT id, product_code, LOWER(TRIM(variant_name)) as v_name FROM product_variants WHERE is_active = 1').all() as any[];
    const existingCodeMap = new Map<string, any>();
    const existingNameSet = new Set<string>();
    for (const v of existingVariants) {
      if (v.product_code) existingCodeMap.set(String(v.product_code).trim().toLowerCase(), v);
      if (v.v_name) existingNameSet.add(v.v_name);
    }

    rows.forEach((row, idx) => {
      const messages: string[] = [];
      const name = (row.name || '').trim();
      const category = (row.category || '').trim();
      const rawUnit = String(row.unit || row.unit_type || 'kg').trim().toLowerCase();
      const code = String(row.product_code || row.code || '').trim();
      const priceVal = Number(row.selling_rate_rupees ?? row.price_rupees ?? 0);
      const costVal = Number(row.buying_rate_rupees ?? row.cost_price_rupees ?? row.cost_rupees ?? 0);

      if (!name) {
        messages.push('Missing product name');
      } else {
        const nameLower = name.toLowerCase();
        if (seenNames.has(nameLower)) {
          messages.push(`Duplicate product name "${name}" in sheet`);
        }
        seenNames.add(nameLower);
        if (existingNameSet.has(nameLower) && !row.allowUpdate) {
          messages.push(`Product "${name}" already exists in catalogue`);
        }
      }

      if (!category) {
        messages.push('Missing category');
      }

      if (code) {
        const codeLower = code.toLowerCase();
        if (seenCodes.has(codeLower)) {
          messages.push(`Duplicate code "${code}" in sheet`);
        }
        seenCodes.add(codeLower);
        if (existingCodeMap.has(codeLower) && !row.allowUpdate) {
          messages.push(`Code "${code}" already exists in catalogue`);
        }
      }

      const validUnits = ['kg', 'g', 'pcs', 'tray', 'pack', 'weight', 'piece'];
      if (!validUnits.includes(rawUnit)) {
        messages.push(`Invalid unit "${rawUnit}" (use kg, g, pcs, tray, pack)`);
      }

      if (isNaN(priceVal) || priceVal <= 0) {
        messages.push('Selling rate must be greater than ₹0');
      }
      if (isNaN(costVal) || costVal < 0) {
        messages.push('Buying rate cannot be negative');
      }
      if (priceVal > 0 && costVal > 0 && priceVal <= costVal) {
        messages.push(`Selling rate (₹${priceVal}) ≤ Buying rate (₹${costVal})`);
      }

      if (messages.length > 0) {
        results.push({ rowIndex: idx, status: 'Error', messages });
        return;
      }

      const isExisting = (code && existingCodeMap.has(code.toLowerCase())) || existingNameSet.has(name.toLowerCase());
      results.push({ rowIndex: idx, status: isExisting ? 'Update' : 'New' });
    });
    return results;
  },

  /**
   * Perform the actual bulk import after preview validation.
   * Rows flagged as Error are skipped and reported in errorRows with reasons.
   */
  bulkImportProducts(rows: Array<any>): { createdCount: number; updatedCount: number; errorRows: Array<{ rowIndex: number; messages: string[] }> } {
    authService.requireRole(['ADMIN', 'MANAGER', 'CASHIER']);
    let createdCount = 0;
    let updatedCount = 0;
    const errorRows: Array<{ rowIndex: number; messages: string[] }> = [];
    const userId = authService.getCurrentUserId() || 1;

    const seenCodes = new Set<string>();
    const seenNames = new Set<string>();

    const existingVariants = db.prepare(`
      SELECT pv.id, pv.product_id, pv.product_code, LOWER(TRIM(pv.variant_name)) as v_name
      FROM product_variants pv
      WHERE pv.is_active = 1
    `).all() as any[];

    const existingByCode = new Map<string, any>();
    const existingByName = new Map<string, any>();
    for (const v of existingVariants) {
      if (v.product_code) existingByCode.set(String(v.product_code).trim().toLowerCase(), v);
      if (v.v_name) existingByName.set(v.v_name, v);
    }

    rows.forEach((row, idx) => {
      const messages: string[] = [];
      const name = String(row.name || '').trim();
      const category = String(row.category || 'Chicken').trim() || 'Chicken';
      const rawUnit = String(row.unit || row.unit_type || 'kg').trim().toLowerCase();
      const unitType: 'weight' | 'piece' = ['pcs', 'tray', 'pack', 'piece'].includes(rawUnit) ? 'piece' : 'weight';

      const priceVal = Number(row.selling_rate_rupees ?? row.price_rupees ?? 0);
      const costVal = Number(row.buying_rate_rupees ?? row.cost_price_rupees ?? row.cost_rupees ?? 0);
      const rawCode = String(row.product_code || row.code || '').trim();
      const cleanCode = rawCode.replace(/^prd-0*/i, '').replace(/^0+/, '');
      const isProcessedCut = row.is_processed_cut !== undefined
        ? (row.is_processed_cut ? 1 : 0)
        : (row.type?.toLowerCase().includes('process') ? 1 : 0);
      const trackInInv = row.track_in_inventory !== undefined
        ? (row.track_in_inventory ? 1 : 0)
        : 1;

      if (!name) {
        messages.push('Missing product name');
      } else {
        const nameLower = name.toLowerCase();
        if (seenNames.has(nameLower)) {
          messages.push(`Duplicate product name "${name}" in batch`);
        }
        seenNames.add(nameLower);
        if (existingByName.has(nameLower) && !row.allowUpdate) {
          messages.push(`Duplicate name "${name}" already exists in catalogue`);
        }
      }

      if (cleanCode) {
        const codeLower = cleanCode.toLowerCase();
        if (seenCodes.has(codeLower)) {
          messages.push(`Duplicate code "${cleanCode}" in batch`);
        }
        seenCodes.add(codeLower);
        if (existingByCode.has(codeLower) && !row.allowUpdate) {
          messages.push(`Duplicate code "${cleanCode}" already exists in catalogue`);
        }
      }

      if (isNaN(priceVal) || priceVal <= 0) {
        messages.push('Selling rate must be a valid number > ₹0');
      }
      if (isNaN(costVal) || costVal < 0) {
        messages.push('Buying rate cannot be negative');
      }

      if (messages.length > 0) {
        errorRows.push({ rowIndex: idx, messages });
        return;
      }

      const ratePaise = Math.round(priceVal * 100);
      const costPaise = !isNaN(costVal) && costVal >= 0 ? Math.round(costVal * 100) : 0;

      try {
        const existingMatch = (cleanCode && existingByCode.get(cleanCode.toLowerCase())) || existingByName.get(name.toLowerCase());
        const transaction = db.transaction(() => {
          if (existingMatch && row.allowUpdate) {
            db.prepare(`
              UPDATE product_variants
              SET variant_name = ?,
                  current_rate_paise_per_unit = ?,
                  cost_price_paise_per_unit = ?,
                  unit_type = ?,
                  is_processed_cut = ?,
                  track_in_inventory = ?,
                  effective_from = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(name, ratePaise, costPaise, unitType, isProcessedCut, trackInInv, existingMatch.id);

            db.prepare('UPDATE products SET name = ?, category = ?, unit_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(name, category, unitType, existingMatch.product_id);

            productVariantsRepository.insertRateHistory(existingMatch.id, ratePaise, userId);
            productVariantsRepository.syncVariantCostCache(existingMatch.id);
            updatedCount++;
          } else {
            const finalCode = cleanCode && !existingByCode.has(cleanCode.toLowerCase())
              ? cleanCode
              : generateProductCode();

            let parentProduct = db.prepare('SELECT * FROM products WHERE category = ? LIMIT 1').get(category) as any;
            if (!parentProduct) {
              parentProduct = productsRepository.create({
                product_code: `CAT-${finalCode}-${Date.now().toString().slice(-3)}`,
                name,
                unit_type: unitType,
                category,
                is_processed_cut: isProcessedCut,
              });
            }

            const vRes = db.prepare(`
              INSERT INTO product_variants (
                product_id, variant_name, product_code, current_rate_paise_per_unit,
                cost_price_paise_per_unit, unit_type, is_processed_cut, track_in_inventory,
                effective_from, is_active
              ) VALUES (
                ?, ?, ?, ?,
                ?, ?, ?, ?,
                CURRENT_TIMESTAMP, 1
              )
            `).run(
              parentProduct.id,
              name,
              finalCode,
              ratePaise,
              costPaise,
              unitType,
              isProcessedCut,
              trackInInv
            );

            const createdVariantId = Number(vRes.lastInsertRowid);
            productVariantsRepository.insertRateHistory(createdVariantId, ratePaise, userId);
            productVariantsRepository.syncVariantCostCache(createdVariantId);

            existingByCode.set(finalCode.toLowerCase(), { id: createdVariantId, product_id: parentProduct.id });
            existingByName.set(name.toLowerCase(), { id: createdVariantId, product_id: parentProduct.id });
            createdCount++;
          }
        });
        transaction();
      } catch (err: any) {
        errorRows.push({
          rowIndex: idx,
          messages: [err?.message || 'Database error saving product row'],
        });
      }
    });

    auditLogger.log(userId, 'BULK_PRODUCT_IMPORT', {
      createdCount,
      updatedCount,
      errorRows,
    });
    return { createdCount, updatedCount, errorRows };
  },

  /**
   * Update product inventory tracking mode (reason is optional)
   */
  updateProductTracking(id: number, trackInInventory: boolean, reason?: string, userId?: number): void {
    const variant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(id) as any;
    const pId = variant ? variant.product_id : id;
    const oldVal = variant ? (variant.track_in_inventory ?? (variant.is_processed_cut === 0 ? 1 : 0)) : 1;
    const newVal = trackInInventory ? 1 : 0;

    const transaction = db.transaction(() => {
      // 1. Update product and all its variants
      db.prepare('UPDATE product_variants SET track_in_inventory = ? WHERE product_id = ? OR id = ?').run(newVal, pId, id);
      try {
        db.prepare('UPDATE products SET is_inventory_tracked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newVal, pId);
      } catch {}

      // 2. Insert audit log
      const user = userId ? db.prepare('SELECT username FROM users WHERE id = ?').get(userId) as any : null;
      db.prepare(`
        INSERT INTO product_tracking_change_log (
          product_id, old_track_in_inventory, new_track_in_inventory, reason, changed_by, changed_by_name
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        pId,
        oldVal,
        newVal,
        reason && reason.trim() ? reason.trim() : (newVal === 1 ? 'Tracking enabled' : 'Tracking disabled (derived product)'),
        userId || null,
        user?.username || 'Cashier'
      );
    });
    transaction();
  },

  /**
   * Bulk update tracking mode for multiple products
   */
  bulkUpdateProductTracking(ids: number[], trackInInventory: boolean, reason?: string, userId?: number): { updatedCount: number } {
    const tx = db.transaction(() => {
      for (const id of ids) {
        this.updateProductTracking(id, trackInInventory, reason || 'Bulk tracking mode toggle', userId);
      }
    });
    tx();
    return { updatedCount: ids.length };
  },

  /**
   * Get tracking history audit records for a product
   */
  getProductTrackingHistory(productId: number): any[] {
    const variant = db.prepare('SELECT product_id FROM product_variants WHERE id = ?').get(productId) as any;
    const pId = variant?.product_id || productId;
    return db.prepare(`
      SELECT * FROM product_tracking_change_log 
      WHERE product_id = ? 
      ORDER BY created_at DESC
    `).all(pId);
  },
};

export { productManagementService };
