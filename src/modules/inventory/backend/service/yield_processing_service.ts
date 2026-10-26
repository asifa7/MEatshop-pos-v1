import { db } from '../../../../core/backend/db';
import { container } from '../../../../core/di/container';
import { fifoService } from './fifo_service';
import { stockBatchRepository } from '../repository/stock_batch_repository';
import { ValidationError } from '../../../../core/backend/errors';

export interface ExecuteYieldRunInput {
  raw_input_variant_id: number;
  input_quantity: number; // in kg (if weight) or units (if piece)
  input_count?: number; // count/animals (if live_dual)
  outputs: Array<{
    output_variant_id: number;
    quantity: number; // in kg or units
    cost_share_percent?: number; // optional custom ratio (0-100)
  }>;
  wastage_quantity: number; // in kg or units
  notes?: string;
}

export class YieldProcessingService {
  public executeYieldProcessing(input: ExecuteYieldRunInput, userId: number): any {
    const rawVariant = db.prepare(`
      SELECT pv.*, p.unit_type
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ?
    `).get(input.raw_input_variant_id) as any;
    if (!rawVariant) throw new ValidationError(`Input variant ${input.raw_input_variant_id} not found`);

    const isLiveDual = rawVariant.unit_type === 'live_dual';
    const isRawWeight = rawVariant.unit_type === 'weight' || isLiveDual;
    const inputGrams = isRawWeight ? Math.round(input.input_quantity * 1000) : null;
    const inputUnits = rawVariant.unit_type === 'piece' ? Math.round(input.input_quantity) : null;
    const inputCount = isLiveDual ? (input.input_count ?? null) : null;

    if ((isRawWeight && (!inputGrams || inputGrams <= 0)) || (!isRawWeight && (!inputUnits || inputUnits <= 0))) {
      throw new ValidationError('Input quantity must be a positive number');
    }

    const databaseProvider = container.databaseProvider;
    return databaseProvider.transaction(() => {
      // 1. Draw down raw input carcass using FIFO
      const fifoRes = fifoService.drawdownFifo(input.raw_input_variant_id, inputGrams, inputUnits, inputCount);
      const totalInputCostPaise = fifoRes.total_cogs_paise || (input.input_quantity * (rawVariant.cost_price_paise_per_unit || 0));

      // Generate Yield Run Number
      const cleanDate = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 8);
      const countRuns = db.prepare('SELECT COUNT(*) as cnt FROM yield_processing_runs').get() as { cnt: number };
      const runSeq = String(countRuns.cnt + 1).padStart(3, '0');
      const runNumber = `YLD-${cleanDate}-${runSeq}`;

      const wastageGrams = isRawWeight ? Math.round(input.wastage_quantity * 1000) : 0;
      const wastageUnits = !isRawWeight ? Math.round(input.wastage_quantity) : 0;

      // 2. Create Yield Processing Run Record
      const runStmt = db.prepare(`
        INSERT INTO yield_processing_runs (
          run_number, raw_input_variant_id, input_quantity_grams, input_quantity_units, input_count,
          total_input_cost_paise, wastage_quantity_grams, wastage_quantity_units,
          processed_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const runRes = runStmt.run(
        runNumber,
        input.raw_input_variant_id,
        inputGrams,
        inputUnits,
        inputCount,
        totalInputCostPaise,
        wastageGrams,
        wastageUnits,
        userId,
        input.notes || null
      );
      const runId = runRes.lastInsertRowid as number;

      // Calculate total saleable weight/units to allocate costs proportionally if custom ratio not supplied
      let totalSaleableQty = 0;
      input.outputs.forEach(o => { totalSaleableQty += o.quantity; });
      if (totalSaleableQty <= 0) throw new ValidationError('At least one output cut quantity must be greater than zero');

      const createdOutputs: any[] = [];

      // 3. Process each output cut
      input.outputs.forEach((out, idx) => {
        const outVariant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(out.output_variant_id) as any;
        if (!outVariant) throw new ValidationError(`Output variant ${out.output_variant_id} not found`);

        const isOutWeight = outVariant.unit_type === 'weight';
        const outGrams = isOutWeight ? Math.round(out.quantity * 1000) : null;
        const outUnits = !isOutWeight ? Math.round(out.quantity) : null;

        // Determine cost allocation
        let sharePct = out.cost_share_percent;
        if (sharePct === undefined || sharePct === null) {
          sharePct = (out.quantity / totalSaleableQty) * 100;
        }

        const allocatedCostPaise = Math.round(totalInputCostPaise * (sharePct / 100));
        const unitCostPaise = Math.round(allocatedCostPaise / (out.quantity || 1));

        // Create new batch for this output cut
        const batchNum = `BAT-YLD-${cleanDate}-${runId}-${idx + 1}`;
        const outputBatch = stockBatchRepository.createBatch({
          batch_number: batchNum,
          product_variant_id: out.output_variant_id,
          received_date: new Date().toISOString(),
          quantity_grams: outGrams,
          quantity_units: outUnits,
          unit_cost_paise: unitCostPaise,
          source_type: 'yield_processing',
          source_ref_id: runId,
        });

        // Update stock ledger & transaction
        container.inventoryRepository.updateLedgerStock(out.output_variant_id, outGrams, outUnits);
        container.inventoryRepository.createTransaction({
          product_variant_id: out.output_variant_id,
          transaction_type: 'manual_adjustment',
          quantity_grams: outGrams,
          quantity_units: outUnits,
          reference_id: runId,
        });

        db.prepare(`
          INSERT INTO yield_processing_outputs (
            yield_run_id, output_variant_id, output_quantity_grams, output_quantity_units,
            allocated_cost_paise, unit_cost_paise, output_batch_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(runId, out.output_variant_id, outGrams, outUnits, allocatedCostPaise, unitCostPaise, outputBatch.id);

        const { inventoryLedgerService } = require('./inventory_ledger_service');
        inventoryLedgerService.recordEntry({
          product_variant_id: out.output_variant_id,
          branch_id: 1,
          action_type: 'yield_in',
          quantity_grams: isOutWeight ? outGrams : null,
          quantity_units: !isOutWeight ? outUnits : null,
          unit_cost_paise: unitCostPaise,
          reference_type: 'yield_batch',
          reference_id: runId,
          reference_number: runNumber,
          notes: `Yield cut output (${runNumber})`,
          created_by: userId,
        });

        createdOutputs.push({
          output_variant_id: out.output_variant_id,
          quantity: out.quantity,
          unit_cost_paise: unitCostPaise,
          batch_number: batchNum,
        });
      });

      // 4. Auto-log Wastage/Loss into Phase 1 stock_adjustments if wastage > 0
      if (input.wastage_quantity > 0) {
        db.prepare(`
          INSERT INTO stock_adjustments (
            product_variant_id, adjustment_type, quantity_grams, quantity_units,
            reason, adjusted_by
          ) VALUES (?, 'wastage', ?, ?, ?, ?)
        `).run(
          input.raw_input_variant_id,
          wastageGrams,
          wastageUnits,
          `Yield Loss (${runNumber})`,
          userId
        );

        const { inventoryLedgerService } = require('./inventory_ledger_service');
        inventoryLedgerService.recordEntry({
          product_variant_id: input.raw_input_variant_id,
          branch_id: 1,
          action_type: 'wastage',
          quantity_grams: isRawWeight ? -wastageGrams : null,
          quantity_units: !isRawWeight ? -wastageUnits : null,
          reference_type: 'yield_batch',
          reference_id: runId,
          reference_number: runNumber,
          notes: `Yield processing loss/wastage (${runNumber})`,
          created_by: userId,
        });
      }

      // Record yield_out for raw input
      const { inventoryLedgerService } = require('./inventory_ledger_service');
      inventoryLedgerService.recordEntry({
        product_variant_id: input.raw_input_variant_id,
        branch_id: 1,
        action_type: 'yield_out',
        quantity_grams: isRawWeight ? -inputGrams! : null,
        quantity_units: !isRawWeight ? -inputUnits! : null,
        reference_type: 'yield_batch',
        reference_id: runId,
        reference_number: runNumber,
        notes: `Yield conversion raw input (${runNumber})`,
        created_by: userId,
      });

      const { auditLogger } = require('../../../../core/backend/logger');
      auditLogger.log(userId, 'YIELD_PROCESSING_EXECUTED', {
        runId,
        runNumber,
        rawInputVariantId: input.raw_input_variant_id,
        totalInputCostPaise,
        wastageQuantity: input.wastage_quantity,
        outputCount: createdOutputs.length,
      });

      return {
        runId,
        runNumber,
        rawInputVariantId: input.raw_input_variant_id,
        totalInputCostPaise,
        wastageQuantity: input.wastage_quantity,
        outputs: createdOutputs,
      };
    });
  }

  public processLiveChickenBatch(input: {
    batch_id: number;
    live_weight_grams: number;
    live_count: number;
    processed_weight_grams: number;
    yield_ratio_used: number;
    processed_variant_id: number;
    notes?: string;
  }, userId: number = 1): any {
    if (input.live_weight_grams <= 0) throw new ValidationError('Live weight used must be greater than 0 grams');
    if (input.live_count <= 0) throw new ValidationError('Live bird count used must be greater than 0');
    if (input.processed_weight_grams <= 0) throw new ValidationError('Processed weight yielded must be greater than 0 grams');
    if (input.yield_ratio_used <= 0) throw new ValidationError('Yield ratio must be greater than 0');

    const batch = db.prepare('SELECT * FROM live_chicken_batches WHERE id = ?').get(input.batch_id) as any;
    if (!batch) throw new ValidationError(`Live chicken batch #${input.batch_id} not found`);

    // Insufficient-stock guard
    if (input.live_weight_grams > batch.remaining_weight_grams) {
      throw new ValidationError(
        `Requested live weight ${(input.live_weight_grams / 1000).toFixed(2)} kg exceeds batch remaining ${(batch.remaining_weight_grams / 1000).toFixed(2)} kg`
      );
    }
    if (input.live_count > batch.remaining_count) {
      throw new ValidationError(
        `Requested live bird count ${input.live_count} exceeds batch remaining count ${batch.remaining_count}`
      );
    }

    const processedVariant = db.prepare('SELECT * FROM product_variants WHERE id = ?').get(input.processed_variant_id) as any;
    if (!processedVariant) throw new ValidationError(`Processed chicken variant #${input.processed_variant_id} not found`);

    const databaseProvider = container.databaseProvider;
    return databaseProvider.transaction(() => {
      // 1. Cost propagation: liveCostPaise = (cost_per_kg_paise / 1000) * live_weight_grams
      const liveCostPaise = (batch.cost_per_kg_paise / 1000) * input.live_weight_grams;
      const costPerGramProcessed = liveCostPaise / input.processed_weight_grams;
      const unitCostPaisePerKg = Math.round(costPerGramProcessed * 1000);

      // 2. Decrement Live Chicken Batch
      const newWeight = Math.max(0, batch.remaining_weight_grams - input.live_weight_grams);
      const newCount = Math.max(0, batch.remaining_count - input.live_count);
      const newStatus = (newWeight <= 0 || newCount <= 0) ? 'exhausted' : 'active';

      db.prepare(`
        UPDATE live_chicken_batches
        SET remaining_weight_grams = ?,
            remaining_count = ?,
            status = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newWeight, newCount, newStatus, batch.id);

      // 3. Generate Event and Batch Numbers
      const cleanDate = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 8);
      const countRow = db.prepare('SELECT COUNT(*) as cnt FROM processing_events').get() as { cnt: number };
      const seq = String(countRow.cnt + 1).padStart(4, '0');
      const eventNumber = `PRC-CHK-${cleanDate}-${seq}`;
      const outputBatchNumber = `BAT-PRC-${cleanDate}-${seq}`;

      // 4. Create stock batch in Processed Chicken (Sellable Pool)
      const outputBatch = stockBatchRepository.createBatch({
        batch_number: outputBatchNumber,
        product_variant_id: input.processed_variant_id,
        received_date: new Date().toISOString(),
        quantity_grams: input.processed_weight_grams,
        quantity_units: null,
        unit_cost_paise: unitCostPaisePerKg,
        source_type: 'yield_processing',
        source_ref_id: batch.id,
      });

      // 5. Update stock_ledger & transaction
      container.inventoryRepository.updateLedgerStock(input.processed_variant_id, input.processed_weight_grams, null);
      container.inventoryRepository.createTransaction({
        product_variant_id: input.processed_variant_id,
        transaction_type: 'manual_adjustment',
        quantity_grams: input.processed_weight_grams,
        quantity_units: null,
        reference_id: outputBatch.id,
      });

      // 6. Insert Processing Event audit record
      const insertStmt = db.prepare(`
        INSERT INTO processing_events (
          event_number, batch_id, live_weight_grams, live_count,
          processed_weight_grams, yield_ratio_used, cost_per_gram_processed_paise,
          processed_variant_id, destination_batch_id, created_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const insertRes = insertStmt.run(
        eventNumber,
        batch.id,
        input.live_weight_grams,
        input.live_count,
        input.processed_weight_grams,
        input.yield_ratio_used,
        costPerGramProcessed,
        input.processed_variant_id,
        outputBatch.id,
        userId || 1,
        input.notes || null
      );

      // Also record inventory_ledger entry
      const { inventoryLedgerService } = require('./inventory_ledger_service');
      inventoryLedgerService.recordEntry({
        product_variant_id: input.processed_variant_id,
        branch_id: 1,
        action_type: 'yield_in',
        quantity_grams: input.processed_weight_grams,
        quantity_units: null,
        unit_cost_paise: unitCostPaisePerKg,
        reference_type: 'processing_event',
        reference_id: Number(insertRes.lastInsertRowid),
        reference_number: eventNumber,
        notes: `Processed Chicken from Batch ${batch.batch_number}`,
        created_by: userId || 1,
      });

      return {
        success: true,
        event_number: eventNumber,
        batch_number: outputBatchNumber,
        processed_weight_grams: input.processed_weight_grams,
        cost_per_kg_paise: unitCostPaisePerKg,
      };
    });
  }

  public listProcessingEvents(limit: number = 50): any[] {
    return db.prepare(`
      SELECT pe.*,
        lcb.batch_number as live_batch_number,
        pv.variant_name as processed_variant_name,
        p.name as processed_product_name,
        u.username as created_by_user
      FROM processing_events pe
      JOIN live_chicken_batches lcb ON lcb.id = pe.batch_id
      LEFT JOIN product_variants pv ON pv.id = pe.processed_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      LEFT JOIN users u ON u.id = pe.created_by
      ORDER BY pe.created_at DESC
      LIMIT ?
    `).all(limit);
  }

  public listYieldRuns(): any[] {
    return db.prepare(`
      SELECT ypr.*, pv.variant_name as raw_variant_name, p.name as raw_product_name, u.username as processed_by_user
      FROM yield_processing_runs ypr
      JOIN product_variants pv ON pv.id = ypr.raw_input_variant_id
      JOIN products p ON p.id = pv.product_id
      JOIN users u ON u.id = ypr.processed_by
      ORDER BY ypr.created_at DESC
    `).all();
  }

  public getYieldRunDetails(runId: number): any {
    const run = db.prepare(`
      SELECT ypr.*, pv.variant_name as raw_variant_name, p.name as raw_product_name
      FROM yield_processing_runs ypr
      JOIN product_variants pv ON pv.id = ypr.raw_input_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE ypr.id = ?
    `).get(runId);
    if (!run) throw new ValidationError('Yield run not found');

    const outputs = db.prepare(`
      SELECT ypo.*, pv.variant_name as output_variant_name, p.name as output_product_name
      FROM yield_processing_outputs ypo
      JOIN product_variants pv ON pv.id = ypo.output_variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE ypo.yield_run_id = ?
    `).all(runId);

    return { ...run, outputs };
  }

  /**
   * Get Live Chicken Yield Settings
   */
  public getLiveChickenYieldSettings(): any {
    const row = db.prepare('SELECT * FROM live_chicken_yield_settings WHERE id = 1').get() as any;
    if (!row) {
      return {
        yield_enabled: 1,
        track_liver_gizzard: 1,
        whole_chicken_grams: 625,
        liver_grams: 30,
        gizzard_grams: 40,
        custom_product_ratios: {},
      };
    }
    let customRatios = {};
    try {
      customRatios = JSON.parse(row.custom_product_ratios_json || '{}');
    } catch (e) {}

    return {
      yield_enabled: Boolean(row.yield_enabled),
      track_liver_gizzard: Boolean(row.track_liver_gizzard),
      whole_chicken_grams: row.whole_chicken_grams,
      liver_grams: row.liver_grams,
      gizzard_grams: row.gizzard_grams,
      custom_product_ratios: customRatios,
    };
  }

  /**
   * Update Live Chicken Yield Settings
   */
  public updateLiveChickenYieldSettings(input: {
    yield_enabled?: boolean;
    track_liver_gizzard?: boolean;
    whole_chicken_grams?: number;
    liver_grams?: number;
    gizzard_grams?: number;
    custom_product_ratios?: Record<string, number>;
  }): any {
    const current = this.getLiveChickenYieldSettings();
    const yieldEnabled = input.yield_enabled !== undefined ? (input.yield_enabled ? 1 : 0) : (current.yield_enabled ? 1 : 0);
    const trackLiverGizzard = input.track_liver_gizzard !== undefined ? (input.track_liver_gizzard ? 1 : 0) : (current.track_liver_gizzard ? 1 : 0);
    const wholeGrams = input.whole_chicken_grams !== undefined ? Math.round(input.whole_chicken_grams) : current.whole_chicken_grams;
    const liverGrams = input.liver_grams !== undefined ? Math.round(input.liver_grams) : current.liver_grams;
    const gizzardGrams = input.gizzard_grams !== undefined ? Math.round(input.gizzard_grams) : current.gizzard_grams;
    const customJson = input.custom_product_ratios ? JSON.stringify(input.custom_product_ratios) : JSON.stringify(current.custom_product_ratios);

    db.prepare(`
      INSERT INTO live_chicken_yield_settings (
        id, yield_enabled, track_liver_gizzard, whole_chicken_grams, liver_grams, gizzard_grams, custom_product_ratios_json, updated_at
      ) VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        yield_enabled = excluded.yield_enabled,
        track_liver_gizzard = excluded.track_liver_gizzard,
        whole_chicken_grams = excluded.whole_chicken_grams,
        liver_grams = excluded.liver_grams,
        gizzard_grams = excluded.gizzard_grams,
        custom_product_ratios_json = excluded.custom_product_ratios_json,
        updated_at = CURRENT_TIMESTAMP
    `).run(yieldEnabled, trackLiverGizzard, wholeGrams, liverGrams, gizzardGrams, customJson);

    return this.getLiveChickenYieldSettings();
  }

  /**
   * Live Chicken Pool Summary
   * Uses getAnimalPoolSummary('chicken') so stock_ledger and live_chicken_batches stay 100% consistent across all screens.
   */
  public getLiveChickenPoolSummary(): {
    total_live_weight_grams: number;
    total_live_weight_kg: number;
    total_bird_count: number;
    estimated_dressed_kg: number;
    estimated_skinless_kg: number;
    active_batch_count: number;
  } {
    const summary = this.getAnimalPoolSummary('chicken');
    return {
      total_live_weight_grams: summary.total_live_weight_grams ?? 0,
      total_live_weight_kg: summary.total_live_weight_kg ?? 0,
      total_bird_count: summary.total_bird_count ?? 0,
      estimated_dressed_kg: summary.estimated_dressed_kg ?? 0,
      estimated_skinless_kg: summary.estimated_skinless_kg ?? 0,
      active_batch_count: summary.active_batch_count ?? 0,
    };
  }

  /**
   * Simple Live Chicken Yield Processor
   * One transaction:
   * - Deducts live weight and bird count from live chicken batches (FIFO order)
   * - Increments stock of Whole Chicken (and Liver/Gizzard if enabled) and other chicken-tagged products
   * - Creates yield_batch / processing_event audit record
   * - Validates live weight <= available live stock
   */
  public processSimpleLiveYield(input: {
    live_weight_grams: number;
    bird_count?: number;
    overrides?: {
      whole_chicken_grams?: number;
      liver_grams?: number;
      gizzard_grams?: number;
      custom_product_outputs?: Record<number, number>; // variantId -> output_grams
    };
    notes?: string;
  }, userId: number = 1): any {
    if (input.live_weight_grams <= 0) {
      throw new ValidationError('Live weight to process must be greater than zero grams');
    }

    const livePool = this.getLiveChickenPoolSummary();
    if (input.live_weight_grams > livePool.total_live_weight_grams) {
      throw new ValidationError(
        `Requested live weight ${(input.live_weight_grams / 1000).toFixed(2)} kg exceeds available live stock ${(livePool.total_live_weight_grams / 1000).toFixed(2)} kg`
      );
    }

    const settings = this.getLiveChickenYieldSettings();
    const liveKg = input.live_weight_grams / 1000;

    // Calculate outputs per 1 kg live ratio
    const wholeRate = input.overrides?.whole_chicken_grams ?? settings.whole_chicken_grams;
    const liverRate = input.overrides?.liver_grams ?? settings.liver_grams;
    const gizzardRate = input.overrides?.gizzard_grams ?? settings.gizzard_grams;

    const expectedWholeGrams = Math.round(liveKg * wholeRate);
    const expectedLiverGrams = settings.track_liver_gizzard ? Math.round(liveKg * liverRate) : 0;
    const expectedGizzardGrams = settings.track_liver_gizzard ? Math.round(liveKg * gizzardRate) : 0;

    // Find target variants for chicken products
    const chickenVariants = db.prepare(`
      SELECT pv.id as variant_id, pv.variant_name, p.name as product_name, p.category, pv.cost_price_paise_per_unit
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE LOWER(p.category) LIKE '%chicken%' OR LOWER(p.name) LIKE '%chicken%'
    `).all() as any[];

    // Match Whole Chicken variant
    const wholeVariant = chickenVariants.find(v => 
      v.variant_name.toLowerCase().includes('whole') || v.product_name.toLowerCase().includes('whole')
    ) || chickenVariants[0];

    // Match Liver variant
    const liverVariant = chickenVariants.find(v => 
      v.variant_name.toLowerCase().includes('liver') || v.product_name.toLowerCase().includes('liver')
    );

    // Match Gizzard variant
    const gizzardVariant = chickenVariants.find(v => 
      v.variant_name.toLowerCase().includes('gizzard') || v.product_name.toLowerCase().includes('gizzard')
    );

    const outputsToCreate: Array<{ variant_id: number; name: string; grams: number }> = [];

    if (wholeVariant && expectedWholeGrams > 0) {
      outputsToCreate.push({ variant_id: wholeVariant.variant_id, name: 'Whole Chicken', grams: expectedWholeGrams });
    }
    if (settings.track_liver_gizzard && liverVariant && expectedLiverGrams > 0) {
      outputsToCreate.push({ variant_id: liverVariant.variant_id, name: 'Liver', grams: expectedLiverGrams });
    }
    if (settings.track_liver_gizzard && gizzardVariant && expectedGizzardGrams > 0) {
      outputsToCreate.push({ variant_id: gizzardVariant.variant_id, name: 'Gizzard', grams: expectedGizzardGrams });
    }

    // Custom product outputs overrides if any
    if (input.overrides?.custom_product_outputs) {
      for (const [varIdStr, grams] of Object.entries(input.overrides.custom_product_outputs)) {
        const vId = Number(varIdStr);
        const match = chickenVariants.find(v => v.variant_id === vId);
        if (match && grams > 0) {
          const existing = outputsToCreate.find(o => o.variant_id === vId);
          if (existing) {
            existing.grams = Math.round(grams);
          } else {
            outputsToCreate.push({ variant_id: vId, name: `${match.product_name} (${match.variant_name})`, grams: Math.round(grams) });
          }
        }
      }
    }

    const totalOutputGrams = outputsToCreate.reduce((sum, o) => sum + o.grams, 0);
    const unaccountedWeightGrams = Math.max(0, input.live_weight_grams - totalOutputGrams);

    return container.databaseProvider.transaction(() => {
      // 1. Deduct live chicken batches FIFO
      let remainingToDeduct = input.live_weight_grams;
      let birdsToDeduct = input.bird_count ?? 0;
      let totalCostPaise = 0;
      let primaryBatchId = 0;

      const activeBatches = db.prepare(`
        SELECT * FROM live_chicken_batches
        WHERE status = 'active' AND remaining_weight_grams > 0
        ORDER BY purchase_date ASC, id ASC
      `).all() as any[];

      for (const b of activeBatches) {
        if (remainingToDeduct <= 0) break;
        if (!primaryBatchId) primaryBatchId = b.id;

        const deductFromBatch = Math.min(b.remaining_weight_grams, remainingToDeduct);
        const ratio = deductFromBatch / (b.remaining_weight_grams || 1);
        const deductBirds = birdsToDeduct > 0 ? Math.min(b.remaining_count, Math.max(1, Math.round(b.remaining_count * ratio))) : 0;

        const newWeight = Math.max(0, b.remaining_weight_grams - deductFromBatch);
        const newCount = Math.max(0, b.remaining_count - deductBirds);
        const newStatus = (newWeight <= 0) ? 'exhausted' : 'active';

        db.prepare(`
          UPDATE live_chicken_batches
          SET remaining_weight_grams = ?,
              remaining_count = ?,
              status = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(newWeight, newCount, newStatus, b.id);

        totalCostPaise += Math.round((b.cost_per_kg_paise / 1000) * deductFromBatch);
        remainingToDeduct -= deductFromBatch;
        birdsToDeduct -= deductBirds;
      }

      // 2. Generate run numbers
      const cleanDate = new Date().toISOString().slice(0, 10).replace(/[^0-9]/g, '');
      const countRuns = db.prepare('SELECT COUNT(*) as cnt FROM yield_processing_runs').get() as { cnt: number };
      const runSeq = String((countRuns?.cnt || 0) + 1).padStart(4, '0');
      const runNumber = `YLD-CHK-${cleanDate}-${runSeq}`;

      // 3. Create yield_processing_runs record storing exact ratios
      const runRes = db.prepare(`
        INSERT INTO yield_processing_runs (
          run_number, raw_input_variant_id, input_quantity_grams, input_count,
          total_input_cost_paise, wastage_quantity_grams, processed_by, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        runNumber,
        wholeVariant ? wholeVariant.variant_id : 1,
        input.live_weight_grams,
        input.bird_count || null,
        totalCostPaise,
        unaccountedWeightGrams,
        userId,
        input.notes || `Simple live yield: whole ${wholeRate}g, liver ${liverRate}g, gizzard ${gizzardRate}g`
      );
      const runId = Number(runRes.lastInsertRowid);

      // 4. Create and update stock for each processed product
      const { inventoryLedgerService } = require('./inventory_ledger_service');
      const outputsResult: any[] = [];

      outputsToCreate.forEach((out, idx) => {
        const sharePct = totalOutputGrams > 0 ? (out.grams / totalOutputGrams) : (1 / outputsToCreate.length);
        const allocatedCostPaise = Math.round(totalCostPaise * sharePct);
        const unitCostPaisePerKg = out.grams > 0 ? Math.round((allocatedCostPaise / out.grams) * 1000) : 0;

        // Create product stock batch
        const batchNum = `BAT-YLD-${cleanDate}-${runId}-${idx + 1}`;
        const createdBatch = stockBatchRepository.createBatch({
          batch_number: batchNum,
          product_variant_id: out.variant_id,
          received_date: new Date().toISOString(),
          quantity_grams: out.grams,
          quantity_units: null,
          unit_cost_paise: unitCostPaisePerKg,
          source_type: 'yield_processing',
          source_ref_id: runId,
        });

        // Record stock ledger movement (YIELD_IN)
        inventoryLedgerService.recordMovement({
          product_variant_id: out.variant_id,
          branch_id: 1,
          action_type: 'YIELD_IN',
          quantity_grams: out.grams,
          quantity_units: null,
          unit_cost_paise: unitCostPaisePerKg,
          batch_id: createdBatch.id,
          reference_type: 'yield_batch',
          reference_id: runId,
          reference_number: runNumber,
          notes: `Yield cut: ${out.name} (${runNumber})`,
          created_by: userId,
        });

        // Record in yield_processing_outputs
        db.prepare(`
          INSERT INTO yield_processing_outputs (
            yield_run_id, output_variant_id, output_quantity_grams, output_quantity_units,
            allocated_cost_paise, unit_cost_paise, output_batch_id
          ) VALUES (?, ?, ?, NULL, ?, ?, ?)
        `).run(runId, out.variant_id, out.grams, allocatedCostPaise, unitCostPaisePerKg, createdBatch.id);

        outputsResult.push({
          variant_id: out.variant_id,
          name: out.name,
          quantity_grams: out.grams,
          quantity_kg: Math.round((out.grams / 1000) * 1000) / 1000,
          batch_number: batchNum,
          unit_cost_paise: unitCostPaisePerKg,
        });
      });

      // Also record processing_events for compatibility
      if (primaryBatchId) {
        db.prepare(`
          INSERT INTO processing_events (
            event_number, batch_id, live_weight_grams, live_count,
            processed_weight_grams, yield_ratio_used, cost_per_gram_processed_paise,
            processed_variant_id, created_by, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          runNumber,
          primaryBatchId,
          input.live_weight_grams,
          input.bird_count || 0,
          totalOutputGrams,
          wholeRate / 1000,
          totalOutputGrams > 0 ? (totalCostPaise / totalOutputGrams) : 0,
          wholeVariant ? wholeVariant.variant_id : null,
          userId,
          input.notes || null
        );
      }

      return {
        success: true,
        run_number: runNumber,
        run_id: runId,
        live_weight_used_grams: input.live_weight_grams,
        total_output_grams: totalOutputGrams,
        unaccounted_weight_grams: unaccountedWeightGrams,
        outputs: outputsResult,
      };
    });
  }

  /**
   * Get all animal yield configs with mapped product details
   */
  public getAnimalYieldConfigs(): any[] {
    return db.prepare(`
      SELECT 
        c.*,
        COALESCE(pv.product_code, p.product_code) as mapped_product_code,
        p.name as mapped_product_name,
        pv.variant_name as mapped_variant_name
      FROM live_animal_yield_configs c
      LEFT JOIN product_variants pv ON pv.id = c.live_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      ORDER BY c.id ASC
    `).all();
  }

  /**
   * Update animal yield config, supporting live_variant_id or product_code
   */
  public updateAnimalYieldConfig(animalKeyOrInput: string | any, maybeInput?: any): any {
    const animalKey = typeof animalKeyOrInput === 'string' ? animalKeyOrInput : (animalKeyOrInput?.animal_key);
    const input = typeof animalKeyOrInput === 'string' ? (maybeInput || {}) : animalKeyOrInput;
    if (!animalKey) throw new ValidationError('animal_key is required');

    const existing = db.prepare('SELECT * FROM live_animal_yield_configs WHERE animal_key = ?').get(animalKey) as any;
    if (!existing) throw new ValidationError(`Animal config ${animalKey} not found`);

    const liveTracking = input.live_tracking_enabled !== undefined ? (input.live_tracking_enabled ? 1 : 0) : existing.live_tracking_enabled;
    const trackByproducts = input.track_byproducts !== undefined ? (input.track_byproducts ? 1 : 0) : existing.track_byproducts;
    const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : existing.is_active;
    const showInInventory = input.show_in_inventory !== undefined ? (input.show_in_inventory ? 1 : 0) : (existing.show_in_inventory ?? 1);
    const displayName = input.display_name !== undefined ? String(input.display_name).trim() : existing.display_name;
    const iconKey = input.icon_key !== undefined ? String(input.icon_key).trim() : (existing.icon_key || 'chicken');
    const unitName = input.unit_name !== undefined ? String(input.unit_name).trim() : (existing.unit_name || 'head');
    const stockMode = input.stock_mode !== undefined ? String(input.stock_mode).trim() : (existing.stock_mode || 'dual');

    let resolvedVariantId = existing.live_variant_id;
    if (input.product_code !== undefined) {
      const codeStr = String(input.product_code || '').trim();
      if (!codeStr || codeStr === '0' || codeStr.toLowerCase() === 'none' || codeStr.toLowerCase() === 'unmap') {
        resolvedVariantId = null;
      } else {
        const found = db.prepare(`
          SELECT pv.id 
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          WHERE TRIM(LOWER(pv.product_code)) = TRIM(LOWER(?)) OR TRIM(LOWER(p.product_code)) = TRIM(LOWER(?))
          LIMIT 1
        `).get(codeStr, codeStr) as any;
        if (!found) {
          throw new ValidationError(`No product found with product code "${codeStr}"`);
        }
        resolvedVariantId = found.id;
      }
    } else if (input.live_variant_id !== undefined) {
      resolvedVariantId = input.live_variant_id ? Number(input.live_variant_id) : null;
    }

    db.prepare(`
      UPDATE live_animal_yield_configs
      SET display_name = ?,
          icon_key = ?,
          unit_name = ?,
          show_in_inventory = ?,
          stock_mode = ?,
          live_tracking_enabled = ?,
          track_byproducts = ?,
          is_active = ?,
          live_variant_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE animal_key = ?
    `).run(displayName, iconKey, unitName, showInInventory, stockMode, liveTracking, trackByproducts, isActive, resolvedVariantId, animalKey);

    return db.prepare(`
      SELECT 
        c.*,
        COALESCE(pv.product_code, p.product_code) as mapped_product_code,
        p.name as mapped_product_name,
        pv.variant_name as mapped_variant_name
      FROM live_animal_yield_configs c
      LEFT JOIN product_variants pv ON pv.id = c.live_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE c.animal_key = ?
    `).get(animalKey);
  }

  /**
   * Create brand new animal yield config
   */
  public createAnimalYieldConfig(input: {
    animal_key: string;
    display_name: string;
    icon_key?: string;
    unit_name?: string;
    show_in_inventory?: number;
    stock_mode?: 'dual' | 'weight_only' | 'count_only';
    live_tracking_enabled?: number;
    track_byproducts?: number;
    product_code?: string;
    live_variant_id?: number;
  }): any {
    const rawKey = (input.animal_key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!rawKey) throw new ValidationError('animal_key is required and must contain alphanumeric characters');
    const displayName = (input.display_name || '').trim();
    if (!displayName) throw new ValidationError('display_name is required');

    const existing = db.prepare('SELECT * FROM live_animal_yield_configs WHERE animal_key = ?').get(rawKey);
    if (existing) throw new ValidationError(`Animal category '${rawKey}' already exists`);

    let resolvedVariantId: number | null = null;
    if (input.product_code !== undefined && String(input.product_code).trim() !== '') {
      const codeStr = String(input.product_code).trim();
      const found = db.prepare(`
        SELECT pv.id 
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE TRIM(LOWER(pv.product_code)) = TRIM(LOWER(?)) OR TRIM(LOWER(p.product_code)) = TRIM(LOWER(?))
        LIMIT 1
      `).get(codeStr, codeStr) as any;
      if (!found) {
        throw new ValidationError(`No product found with product code "${codeStr}"`);
      }
      resolvedVariantId = found.id;
    } else if (input.live_variant_id) {
      resolvedVariantId = Number(input.live_variant_id);
    }

    const iconKey = (input.icon_key || 'chicken').trim();
    const unitName = (input.unit_name || 'head').trim();
    const showInInventory = input.show_in_inventory !== undefined ? (input.show_in_inventory ? 1 : 0) : 1;
    const stockMode = input.stock_mode || 'dual';
    const liveTracking = input.live_tracking_enabled !== undefined ? (input.live_tracking_enabled ? 1 : 0) : 0;
    const trackByproducts = input.track_byproducts !== undefined ? (input.track_byproducts ? 1 : 0) : 1;

    db.prepare(`
      INSERT INTO live_animal_yield_configs (
        animal_key, display_name, icon_key, unit_name, show_in_inventory, stock_mode,
        live_tracking_enabled, track_byproducts, is_active, live_variant_id, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, CURRENT_TIMESTAMP)
    `).run(rawKey, displayName, iconKey, unitName, showInInventory, stockMode, liveTracking, trackByproducts, resolvedVariantId);

    return db.prepare(`
      SELECT 
        c.*,
        COALESCE(pv.product_code, p.product_code) as mapped_product_code,
        p.name as mapped_product_name,
        pv.variant_name as mapped_variant_name
      FROM live_animal_yield_configs c
      LEFT JOIN product_variants pv ON pv.id = c.live_variant_id
      LEFT JOIN products p ON p.id = pv.product_id
      WHERE c.animal_key = ?
    `).get(rawKey);
  }

  /**
   * Delete or unlink a ratio cut from an animal
   */
  public deleteYieldRatio(ratioId: number, userId: number = 1): any {
    const existing = db.prepare('SELECT * FROM live_yield_ratios WHERE id = ?').get(ratioId) as any;
    if (!existing) throw new ValidationError('Yield ratio mapping not found');

    db.prepare(`
      INSERT INTO live_yield_ratio_audit (
        animal_key, variant_id, old_role, new_role, old_grams_per_kg, new_grams_per_kg, changed_by
      ) VALUES (?, ?, ?, 'DELETED', ?, 0, ?)
    `).run(existing.animal_key, existing.variant_id, existing.role, existing.grams_per_kg_live, userId);

    db.prepare('DELETE FROM live_yield_ratios WHERE id = ?').run(ratioId);
    return { success: true, deleted_id: ratioId };
  }

  /**
   * Get yield ratios for a specific animal with product and variant metadata
   */
  public getYieldRatiosForAnimal(animalKey?: string): any[] {
    if (!animalKey || animalKey === 'all') {
      return db.prepare(`
        SELECT 
          lyr.id,
          lyr.animal_key,
          lyr.product_id,
          lyr.variant_id,
          lyr.role,
          lyr.grams_per_kg_live,
          lyr.updated_at,
          p.name as product_name,
          COALESCE(pv.product_code, p.product_code) as product_code,
          p.category,
          pv.variant_name,
          pv.unit_type
        FROM live_yield_ratios lyr
        JOIN products p ON p.id = lyr.product_id
        JOIN product_variants pv ON pv.id = lyr.variant_id
        ORDER BY lyr.animal_key, lyr.role, p.name ASC
      `).all();
    }
    return db.prepare(`
      SELECT 
        lyr.id,
        lyr.animal_key,
        lyr.product_id,
        lyr.variant_id,
        lyr.role,
        lyr.grams_per_kg_live,
        lyr.updated_at,
        p.name as product_name,
        COALESCE(pv.product_code, p.product_code) as product_code,
        p.category,
        pv.variant_name,
        pv.unit_type
      FROM live_yield_ratios lyr
      JOIN products p ON p.id = lyr.product_id
      JOIN product_variants pv ON pv.id = lyr.variant_id
      WHERE lyr.animal_key = ?
      ORDER BY 
        CASE lyr.role WHEN 'MAIN_CUT' THEN 1 WHEN 'BYPRODUCT' THEN 2 ELSE 3 END,
        p.name ASC
    `).all(animalKey);
  }

  /**
   * Update or insert yield ratio with audit logging
   */
  public setYieldRatio(input: {
    animal_key: string;
    product_id: number;
    variant_id: number;
    role: 'MAIN_CUT' | 'BYPRODUCT' | 'DIRECT';
    grams_per_kg_live: number;
  }, userId: number = 1): any {
    const existing = db.prepare(`
      SELECT * FROM live_yield_ratios WHERE animal_key = ? AND variant_id = ?
    `).get(input.animal_key, input.variant_id) as any;

    const oldRole = existing?.role ?? null;
    const oldGrams = existing?.grams_per_kg_live ?? null;

    db.prepare(`
      INSERT INTO live_yield_ratios (
        animal_key, product_id, variant_id, role, grams_per_kg_live, updated_at
      ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(animal_key, variant_id) DO UPDATE SET
        role = excluded.role,
        grams_per_kg_live = excluded.grams_per_kg_live,
        updated_at = CURRENT_TIMESTAMP
    `).run(input.animal_key, input.product_id, input.variant_id, input.role, Math.round(input.grams_per_kg_live));

    // Audit log
    db.prepare(`
      INSERT INTO live_yield_ratio_audit (
        animal_key, variant_id, old_role, new_role, old_grams_per_kg, new_grams_per_kg, changed_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(input.animal_key, input.variant_id, oldRole, input.role, oldGrams, Math.round(input.grams_per_kg_live), userId);

    return db.prepare('SELECT * FROM live_yield_ratios WHERE animal_key = ? AND variant_id = ?').get(input.animal_key, input.variant_id);
  }

  /**
   * Get Animal Pool Summary (Weight, Count, Estimated Dressed)
   * If animal is mapped to a product (live_variant_id), stock_ledger is the single source of truth.
   */
  public getAnimalPoolSummary(animalKey: string = 'chicken'): any {
    if (animalKey === 'all') {
      const configs = db.prepare('SELECT * FROM live_animal_yield_configs WHERE is_active = 1').all() as any[];
      const map: Record<string, any> = {};

      for (const cfg of configs) {
        let totalGrams = 0;
        let totalCount = 0;
        let batchCount = 0;

        if (cfg.live_variant_id) {
          const ledgerStock = db.prepare(`
            SELECT quantity_grams, quantity_units, quantity_count 
            FROM stock_ledger 
            WHERE product_variant_id = ?
          `).get(cfg.live_variant_id) as any;

          if (ledgerStock) {
            totalGrams = ledgerStock.quantity_grams ?? 0;
            totalCount = (ledgerStock.quantity_count !== null && ledgerStock.quantity_count !== undefined)
              ? Math.round(ledgerStock.quantity_count)
              : (ledgerStock.quantity_units ?? 0);
          }

          const bCount = db.prepare(`
            SELECT COUNT(*) as cnt 
            FROM live_chicken_batches 
            WHERE animal_type = ? AND (status = 'active' OR remaining_weight_grams < 0) AND remaining_weight_grams != 0
          `).get(cfg.animal_key) as any;
          batchCount = bCount?.cnt ?? 0;
        } else {
          const row = db.prepare(`
            SELECT 
              COALESCE(SUM(remaining_weight_grams), 0) as total_grams,
              COALESCE(SUM(remaining_count), 0) as total_count,
              COUNT(CASE WHEN (status = 'active' OR remaining_weight_grams < 0) AND remaining_weight_grams != 0 THEN 1 END) as batch_count
            FROM live_chicken_batches
            WHERE animal_type = ? AND (status = 'active' OR remaining_weight_grams < 0)
          `).get(cfg.animal_key) as any;
          totalGrams = row?.total_grams ?? 0;
          totalCount = row?.total_count ?? 0;
          batchCount = row?.batch_count ?? 0;
        }

        const mainCut = db.prepare(`
          SELECT lyr.grams_per_kg_live
          FROM live_yield_ratios lyr
          LEFT JOIN products p ON p.id = lyr.product_id
          LEFT JOIN product_variants pv ON pv.id = lyr.variant_id
          WHERE lyr.animal_key = ? AND (LOWER(p.name) LIKE '%dressed%' OR LOWER(pv.variant_name) LIKE '%dressed%' OR lyr.role = 'MAIN_CUT')
          ORDER BY CASE WHEN LOWER(p.name) LIKE '%dressed%' THEN 0 ELSE 1 END, lyr.grams_per_kg_live DESC LIMIT 1
        `).get(cfg.animal_key) as any;
        const skinlessCut = db.prepare(`
          SELECT lyr.grams_per_kg_live
          FROM live_yield_ratios lyr
          JOIN products p ON p.id = lyr.product_id
          JOIN product_variants pv ON pv.id = lyr.variant_id
          WHERE lyr.animal_key = ? AND (LOWER(p.name) LIKE '%skinless%' OR LOWER(pv.variant_name) LIKE '%skinless%')
          ORDER BY lyr.grams_per_kg_live DESC LIMIT 1
        `).get(cfg.animal_key) as any;

        const dressedRatio = mainCut?.grams_per_kg_live || (cfg.animal_key === 'chicken' ? 625 : 600);
        const skinlessRatio = skinlessCut?.grams_per_kg_live || (cfg.animal_key === 'chicken' ? 550 : dressedRatio);
        const liveKg = totalGrams !== 0 ? Math.round((totalGrams / 1000) * 1000) / 1000 : 0;
        const estDressedKg = totalGrams > 0 ? Math.round((liveKg * (dressedRatio / 1000)) * 1000) / 1000 : 0;
        const estSkinlessKg = totalGrams > 0 ? Math.round((liveKg * (skinlessRatio / 1000)) * 1000) / 1000 : 0;

        map[cfg.animal_key] = {
          animal_key: cfg.animal_key,
          total_live_weight_grams: Math.round(totalGrams),
          total_live_weight_kg: liveKg,
          total_bird_count: Math.round(totalCount),
          estimated_dressed_kg: estDressedKg,
          estimated_skinless_kg: estSkinlessKg,
          dressed_ratio_grams_per_kg: dressedRatio,
          skinless_ratio_grams_per_kg: skinlessRatio,
          active_batch_count: batchCount,
          is_negative: totalGrams < 0,
        };
      }
      return map;
    }

    const cfg = db.prepare('SELECT * FROM live_animal_yield_configs WHERE animal_key = ?').get(animalKey) as any;
    let totalGrams = 0;
    let totalCount = 0;
    let batchCount = 0;

    if (cfg?.live_variant_id) {
      const ledgerStock = db.prepare(`
        SELECT quantity_grams, quantity_units, quantity_count 
        FROM stock_ledger 
        WHERE product_variant_id = ?
      `).get(cfg.live_variant_id) as any;

      if (ledgerStock) {
        totalGrams = ledgerStock.quantity_grams ?? 0;
        totalCount = (ledgerStock.quantity_count !== null && ledgerStock.quantity_count !== undefined)
          ? Math.round(ledgerStock.quantity_count)
          : (ledgerStock.quantity_units ?? 0);
      }

      const bCount = db.prepare(`
        SELECT COUNT(*) as cnt 
        FROM live_chicken_batches 
        WHERE animal_type = ? AND (status = 'active' OR remaining_weight_grams < 0) AND remaining_weight_grams != 0
      `).get(animalKey) as any;
      batchCount = bCount?.cnt ?? 0;
    } else {
      const row = db.prepare(`
        SELECT 
          COALESCE(SUM(remaining_weight_grams), 0) as total_grams,
          COALESCE(SUM(remaining_count), 0) as total_count,
          COUNT(CASE WHEN (status = 'active' OR remaining_weight_grams < 0) AND remaining_weight_grams != 0 THEN 1 END) as batch_count
        FROM live_chicken_batches
        WHERE animal_type = ? AND (status = 'active' OR remaining_weight_grams < 0)
      `).get(animalKey) as any;
      totalGrams = row?.total_grams ?? 0;
      totalCount = row?.total_count ?? 0;
      batchCount = row?.batch_count ?? 0;
    }

    const mainCut = db.prepare(`
      SELECT lyr.grams_per_kg_live
      FROM live_yield_ratios lyr
      LEFT JOIN products p ON p.id = lyr.product_id
      LEFT JOIN product_variants pv ON pv.id = lyr.variant_id
      WHERE lyr.animal_key = ? AND (LOWER(p.name) LIKE '%dressed%' OR LOWER(pv.variant_name) LIKE '%dressed%' OR lyr.role = 'MAIN_CUT')
      ORDER BY CASE WHEN LOWER(p.name) LIKE '%dressed%' THEN 0 ELSE 1 END, lyr.grams_per_kg_live DESC LIMIT 1
    `).get(animalKey) as any;
    const skinlessCut = db.prepare(`
      SELECT lyr.grams_per_kg_live
      FROM live_yield_ratios lyr
      JOIN products p ON p.id = lyr.product_id
      JOIN product_variants pv ON pv.id = lyr.variant_id
      WHERE lyr.animal_key = ? AND (LOWER(p.name) LIKE '%skinless%' OR LOWER(pv.variant_name) LIKE '%skinless%')
      ORDER BY lyr.grams_per_kg_live DESC LIMIT 1
    `).get(animalKey) as any;

    const dressedRatio = mainCut?.grams_per_kg_live || (animalKey === 'chicken' ? 625 : 600);
    const skinlessRatio = skinlessCut?.grams_per_kg_live || (animalKey === 'chicken' ? 550 : dressedRatio);
    const liveKg = totalGrams !== 0 ? Math.round((totalGrams / 1000) * 1000) / 1000 : 0;
    const estDressedKg = totalGrams > 0 ? Math.round((liveKg * (dressedRatio / 1000)) * 1000) / 1000 : 0;
    const estSkinlessKg = totalGrams > 0 ? Math.round((liveKg * (skinlessRatio / 1000)) * 1000) / 1000 : 0;

    return {
      animal_key: animalKey,
      total_live_weight_grams: Math.round(totalGrams),
      total_live_weight_kg: liveKg,
      total_bird_count: Math.round(totalCount),
      estimated_dressed_kg: estDressedKg,
      estimated_skinless_kg: estSkinlessKg,
      dressed_ratio_grams_per_kg: dressedRatio,
      skinless_ratio_grams_per_kg: skinlessRatio,
      active_batch_count: batchCount,
      is_negative: totalGrams < 0,
    };
  }

  /**
   * Adjust Live Stock (Mortality, Weight Loss, Count Correction, Staff Use)
   */
  public adjustLiveStock(input: {
    animal_key: string;
    adjustment_type: 'mortality' | 'weight_loss' | 'count_correction' | 'staff_use' | 'other';
    weight_grams_delta?: number; // negative for reduction, positive for addition
    count_delta?: number;
    notes?: string;
  }, userId: number = 1): any {
    const animalKey = input.animal_key || 'chicken';
    const weightDelta = input.weight_grams_delta !== undefined ? Math.round(input.weight_grams_delta) : 0;
    const countDelta = input.count_delta !== undefined ? Math.round(input.count_delta) : 0;

    if (weightDelta === 0 && countDelta === 0) {
      throw new ValidationError('Adjustment must specify non-zero weight or count change');
    }

    return container.databaseProvider.transaction(() => {
      // 1. If deducting weight, draw down FIFO from active batches
      if (weightDelta < 0) {
        let remainingToDeduct = Math.abs(weightDelta);
        let birdsToDeduct = Math.abs(countDelta);

        const batches = db.prepare(`
          SELECT * FROM live_chicken_batches
          WHERE animal_type = ? AND status = 'active' AND remaining_weight_grams > 0
          ORDER BY purchase_date ASC, id ASC
        `).all(animalKey) as any[];

        for (const b of batches) {
          if (remainingToDeduct <= 0) break;
          const deductWeight = Math.min(b.remaining_weight_grams, remainingToDeduct);
          const currentCountMilli = (b.remaining_count_milli !== null && b.remaining_count_milli !== undefined) ? b.remaining_count_milli : (b.remaining_count * 1000);
          const deductBirdsMilli = birdsToDeduct > 0 
            ? Math.min(currentCountMilli, birdsToDeduct * 1000)
            : (b.remaining_weight_grams > 0 ? Math.min(currentCountMilli, Math.round((deductWeight / b.remaining_weight_grams) * currentCountMilli)) : 0);

          const newWeight = b.remaining_weight_grams - deductWeight;
          const newCountMilli = Math.max(0, currentCountMilli - deductBirdsMilli);
          const newCount = Math.floor(newCountMilli / 1000);
          const newStatus = (newWeight <= 0) ? 'exhausted' : 'active';

          db.prepare(`
            UPDATE live_chicken_batches
            SET remaining_weight_grams = ?, remaining_count = ?, remaining_count_milli = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(newWeight, newCount, newCountMilli, newStatus, b.id);

          remainingToDeduct -= deductWeight;
          birdsToDeduct -= Math.floor(deductBirdsMilli / 1000);
        }

        // If pool was exhausted and still remaining, reduce oldest or insert negative batch
        if (remainingToDeduct > 0) {
          const lastBatch = db.prepare(`SELECT id, remaining_weight_grams FROM live_chicken_batches WHERE animal_type = ? ORDER BY id DESC LIMIT 1`).get(animalKey) as any;
          if (lastBatch) {
            db.prepare(`UPDATE live_chicken_batches SET remaining_weight_grams = remaining_weight_grams - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(remainingToDeduct, lastBatch.id);
          }
        }
      } else if (weightDelta > 0) {
        // Adding weight / count (e.g. physical count recovery or adjustment in)
        const batchNum = `ADJ-LIVE-${Date.now().toString().slice(-6)}`;
        const initialCount = Math.max(0, countDelta);
        const initialCountMilli = initialCount * 1000;
        db.prepare(`
          INSERT INTO live_chicken_batches (
            batch_number, animal_type, supplier_id, purchase_date,
            cost_per_kg_paise, initial_weight_grams, initial_count,
            remaining_weight_grams, remaining_count, remaining_count_milli, status, notes
          ) VALUES (?, ?, 1, CURRENT_TIMESTAMP, 0, ?, ?, ?, ?, ?, 'active', ?)
        `).run(batchNum, animalKey, weightDelta, initialCount, weightDelta, initialCount, initialCountMilli, input.notes || `Live stock adjustment (+${weightDelta}g)`);
      }

      // 2. Record ledger movement if live variant exists
      const config = db.prepare('SELECT live_variant_id FROM live_animal_yield_configs WHERE animal_key = ?').get(animalKey) as any;
      if (config?.live_variant_id) {
        const { inventoryLedgerService } = require('./inventory_ledger_service');
        const action = input.adjustment_type === 'mortality' ? 'WASTAGE' : (weightDelta < 0 ? 'STOCK_ADJUSTMENT' : 'OTHER_IN');
        inventoryLedgerService.recordMovement({
          product_variant_id: config.live_variant_id,
          branch_id: 1,
          action_type: action,
          quantity_grams: weightDelta,
          quantity_units: countDelta,
          reference_type: 'stock_adjustment',
          reason_code: input.adjustment_type,
          notes: `Live animal adjustment [${animalKey}]: ${input.adjustment_type} - ${input.notes || ''}`,
          created_by: userId,
        });
      }

      return this.getAnimalPoolSummary(animalKey);
    });
  }
}

export const yieldProcessingService = new YieldProcessingService();
