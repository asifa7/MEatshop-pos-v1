import { ValidationError, ConflictError } from '../../../../core/backend/errors';
import { logger, auditLogger } from '../../../../core/backend/logger';
import { pricingService } from './pricing_service';
import { invoiceNumberingService } from './invoice_numbering_service';
import { creditService } from '../../../customers/backend/service/credit_service';
import { cashBoxService } from '../../../cashbox/backend/service/cashbox_service';
import { fifoService } from '../../../inventory/backend/service/fifo_service';
import { db } from '../../../../core/backend/db';
import { roundHalfUp } from '../../../../core/shared/math';
import {
  CreateInvoiceSchema,
  VoidInvoiceSchema,
  ToggleGstSchema,
  AddInvoiceItemSchema,
  RecordPaymentSchema
} from '../../../../core/validation/billing_schemas';

import {
  IInvoiceRepository,
  IProductRepository,
  IInventoryRepository,
  ISettingsRepository,
  ICashRepository,
  Invoice,
  InvoiceDetail
} from '../../../../core/database/repositories/repository_interfaces';

import { authService } from '../../../auth/backend/service/auth_service';
import { inventoryLedgerService } from '../../../inventory/backend/service/inventory_ledger_service';
import { configService } from '../../../../core/config/config_service';

const DEFAULT_GST_RATE_BPS = 500;

export class InvoiceService {
  constructor(
    private invoiceRepo: IInvoiceRepository,
    private productRepo: IProductRepository,
    private inventoryRepo: IInventoryRepository,
    private settingsRepo: ISettingsRepository,
    private cashRepo: ICashRepository
  ) {}

  private getCurrentUserId(): number {
    return authService.getCurrentUserId();
  }

  public createDraft(input: {
    is_gst_invoice?: boolean;
    gst_number_snapshot?: string | null;
    customer_id?: number | null;
  }) {
    const parsed = CreateInvoiceSchema.safeParse({
      created_by: this.getCurrentUserId(),
      ...input,
    });
    if (!parsed.success) {
      throw new ValidationError('Invalid invoice creation input', parsed.error.flatten());
    }
    const invoice = this.invoiceRepo.create({
      created_by: parsed.data.created_by,
      is_gst_invoice: parsed.data.is_gst_invoice ? 1 : 0,
      gst_number_snapshot: parsed.data.gst_number_snapshot ?? null,
      customer_id: parsed.data.customer_id ?? null,
    });
    logger.info('Draft invoice created', { invoiceId: invoice.id });
    return invoice;
  }

  public getTodayBills(): any[] {
    const invoices = (this.invoiceRepo as any).getTodayBills();
    return invoices.map((inv: any) => this.getInvoice(inv.id));
  }

  public getInvoice(invoiceId: number): InvoiceDetail {
    const detail = this.invoiceRepo.findById(invoiceId);
    if (detail?.invoice && (detail.invoice.status === 'draft' || detail.invoice.status === 'held') && !detail.invoice.invoice_number) {
      const peek = invoiceNumberingService.peekNextNumber();
      (detail.invoice as any).next_continuous_number = typeof peek === 'number' ? peek : (peek as any)?.invoiceNumber ?? peek;
    }
    return detail;
  }

  public getActiveDraft(): InvoiceDetail {
    const draft = this.invoiceRepo.findLatestDraft();
    if (draft) {
      if (!draft.invoice.invoice_number) {
        const peek = invoiceNumberingService.peekNextNumber();
        (draft.invoice as any).next_continuous_number = typeof peek === 'number' ? peek : (peek as any)?.invoiceNumber ?? peek;
      }
      return draft;
    }
    const newInvoice = this.createDraft({});
    return this.getInvoice(newInvoice.id);
  }

  public getLastCompletedInvoice(): InvoiceDetail | null {
    return this.invoiceRepo.findLatestCompleted();
  }

  public addItem(input: {
    invoice_id: number;
    product_variant_id: number;
    quantity_grams: number | null;
    quantity_units: number | null;
    override_rate_paise?: number | null;
    override_reason?: string | null;
    overridden_by?: number | null;
    stock_source?: 'processed_chicken' | 'mutton_regular' | 'refrigerator' | 'none';
    refrigerator_stock_id?: number | null;
  }) {
    const { invoice } = this.invoiceRepo.findById(input.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Items can only be added to draft or held invoices');
    }

    const variant = this.productRepo.findVariantById(input.product_variant_id);
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(variant.product_id) as any;

    let stockSource = input.stock_source;
    if (!stockSource) {
      if (product?.category?.toLowerCase().includes('chicken') || product?.name?.toLowerCase().includes('chicken')) {
        stockSource = 'processed_chicken';
      } else if (product?.category?.toLowerCase().includes('mutton') || product?.name?.toLowerCase().includes('mutton')) {
        stockSource = 'mutton_regular';
      } else {
        stockSource = 'none';
      }
    }

    const hasOverride = input.override_rate_paise !== null && 
      input.override_rate_paise !== undefined && 
      input.override_rate_paise !== variant.current_rate_paise_per_unit;
    const ratePaiseSnapshot = (input.override_rate_paise !== null && input.override_rate_paise !== undefined) 
      ? input.override_rate_paise! 
      : variant.current_rate_paise_per_unit;

    const unitType = variant.unit_type;
    const lineSubtotalPaise = pricingService.calculateLineSubtotal(
      unitType, input.quantity_grams, input.quantity_units, ratePaiseSnapshot
    );

    const gstRateSnapshot = invoice.is_gst_invoice === 1 ? DEFAULT_GST_RATE_BPS : null;
    const { lineTaxPaise } = pricingService.calculateLineTax(lineSubtotalPaise, gstRateSnapshot);
    const lineTotalPaise = lineSubtotalPaise + lineTaxPaise;

    const validationInput = {
      invoice_id: input.invoice_id,
      product_variant_id: input.product_variant_id,
      quantity_grams: input.quantity_grams ?? null,
      quantity_units: input.quantity_units ?? null,
      rate_paise_snapshot: ratePaiseSnapshot,
      gst_rate_percent_snapshot: gstRateSnapshot,
      override_applied: hasOverride,
      override_reason: hasOverride ? (input.override_reason ?? 'Manual price override') : null,
      overridden_by: hasOverride ? (input.overridden_by ?? this.getCurrentUserId() ?? 1) : null,
      unit_type: unitType,
    };

    const parsed = AddInvoiceItemSchema.safeParse(validationInput);
    if (!parsed.success) {
      throw new ValidationError('Invalid invoice item input', parsed.error.flatten());
    }

    const item = this.invoiceRepo.addItem({
      invoice_id: input.invoice_id,
      product_variant_id: input.product_variant_id,
      quantity_grams: input.quantity_grams,
      quantity_units: input.quantity_units,
      rate_paise_snapshot: ratePaiseSnapshot,
      line_subtotal_paise: lineSubtotalPaise,
      gst_rate_percent_snapshot: gstRateSnapshot,
      line_total_paise: lineTotalPaise,
      override_applied: hasOverride ? 1 : 0,
      override_reason: hasOverride ? (input.override_reason ?? null) : null,
      overridden_by: hasOverride ? (input.overridden_by ?? null) : null,
      stock_source: stockSource,
      refrigerator_stock_id: input.refrigerator_stock_id ?? null,
    });

    logger.info('Item added to invoice', { invoiceId: input.invoice_id, itemId: item.id, stockSource });
    return this.getInvoice(input.invoice_id);
  }

  public updateItemQuantity(itemId: number, quantityGrams: number | null, quantityUnits: number | null) {
    const dbItem = this.invoiceRepo.findItemById(itemId);
    const { invoice } = this.invoiceRepo.findById(dbItem.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Items can only be modified on draft or held invoices');
    }

    const variant = this.productRepo.findVariantById(dbItem.product_variant_id);
    const unitType = variant.unit_type;

    const lineSubtotalPaise = pricingService.calculateLineSubtotal(
      unitType, quantityGrams, quantityUnits, dbItem.rate_paise_snapshot
    );

    const gstRateSnapshot = invoice.is_gst_invoice === 1 ? dbItem.gst_rate_percent_snapshot : null;
    const { lineTaxPaise } = pricingService.calculateLineTax(lineSubtotalPaise, gstRateSnapshot);
    const lineTotalPaise = lineSubtotalPaise + lineTaxPaise;

    this.invoiceRepo.updateItemQty(
      itemId, quantityGrams, quantityUnits, lineSubtotalPaise, lineTotalPaise
    );

    return this.getInvoice(dbItem.invoice_id);
  }

  public updateItemRate(itemId: number, ratePaise: number, reason?: string) {
    const dbItem = this.invoiceRepo.findItemById(itemId);
    const { invoice } = this.invoiceRepo.findById(dbItem.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Items can only be modified on draft or held invoices');
    }

    const variant = this.productRepo.findVariantById(dbItem.product_variant_id);
    const unitType = variant.unit_type;

    const lineSubtotalPaise = pricingService.calculateLineSubtotal(
      unitType, dbItem.quantity_grams, dbItem.quantity_units, ratePaise
    );

    const gstRateSnapshot = invoice.is_gst_invoice === 1 ? dbItem.gst_rate_percent_snapshot : null;
    const { lineTaxPaise } = pricingService.calculateLineTax(lineSubtotalPaise, gstRateSnapshot);
    const lineTotalPaise = lineSubtotalPaise + lineTaxPaise;

    this.invoiceRepo.updateItemRate(
      itemId, ratePaise, lineSubtotalPaise, lineTotalPaise, reason || 'Manual price override'
    );

    return this.getInvoice(dbItem.invoice_id);
  }

  public removeItem(itemId: number) {
    const item = this.invoiceRepo.findItemById(itemId);
    const { invoice } = this.invoiceRepo.findById(item.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Items can only be removed from draft or held invoices');
    }

    this.invoiceRepo.removeItem(itemId);
    logger.info('Item removed from invoice', { invoiceId: item.invoice_id, itemId });
    return this.getInvoice(item.invoice_id);
  }

  public holdInvoice(invoiceId: number) {
    const { invoice } = this.invoiceRepo.findById(invoiceId);
    if (invoice.status !== 'draft') {
      throw new ConflictError('Only draft invoices can be held');
    }
    // We can define updateStatus in invoiceRepo or implement it in completeInvoice
    // Let's add setStatus to invoice repo interface.
    this.invoiceRepo.setStatus(invoiceId, 'held');
    logger.info('Invoice held', { invoiceId });
    return this.invoiceRepo.findById(invoiceId);
  }

  public resumeInvoice(invoiceId: number) {
    const { invoice } = this.invoiceRepo.findById(invoiceId);
    if (invoice.status !== 'held') {
      throw new ConflictError('Only held invoices can be resumed');
    }
    this.invoiceRepo.setStatus(invoiceId, 'draft');
    logger.info('Invoice resumed from held', { invoiceId });
    return this.getInvoice(invoiceId);
  }

  public verifyActionPassword(password: string): boolean {
    return configService.verifyBillActionPassword(password);
  }

  public reopenCompletedInvoice(invoiceId: number, password?: string, reason?: string) {
    if (password) {
      if (!configService.verifyBillActionPassword(password)) {
        throw new ConflictError('Invalid authorization password. Reopen denied.');
      }
    }

    const databaseProvider = (this.invoiceRepo as any).dbProvider;
    return databaseProvider.transaction(() => {
      const { invoice, items, payments } = this.invoiceRepo.findById(invoiceId);
      if (invoice.status !== 'completed' && invoice.status !== 'held') {
        throw new ConflictError('Only completed invoices can be reopened for editing');
      }

      // Snapshot completed bill state before changing to draft
      const oldSnapshot = {
        invoice: { ...invoice },
        items: items.map(it => ({ ...it })),
        payments: (payments || []).map(p => ({ ...p }))
      };

      this.invoiceRepo.setStatus(invoiceId, 'draft');

      try {
        db.prepare(`
          UPDATE invoices 
          SET edit_snapshot_json = ?,
              edit_reason = ?
          WHERE id = ?
        `).run(JSON.stringify(oldSnapshot), reason || 'Reopened for bill edit', invoiceId);
      } catch (err: any) {
        logger.warn('Failed to record edit snapshot on invoice reopen', { error: String(err) });
      }

      // Atomically restore stock in ledger & batches so subsequent completion re-deducts cleanly
      for (const item of items) {

        let targetVariantId = item.product_variant_id;
        let revGrams = item.quantity_grams;
        let revUnits = item.quantity_units;



        try {
          inventoryLedgerService.recordMovement({
            product_variant_id: targetVariantId,
            branch_id: 1,
            action_type: 'STOCK_ADJUSTMENT',
            quantity_grams: revGrams,
            quantity_units: revUnits,
            reference_type: 'invoice_reopen',
            reference_id: invoiceId,
            reference_number: invoice.invoice_number || `INV-${invoiceId}`,
            notes: `Stock restored for edit/reopen of invoice #${invoice.invoice_number || invoiceId}`,
          });
        } catch (e: any) {
          logger.warn(`Notice on stock restoration for variant #${targetVariantId}: ${e.message}`);
        }
      }

      logger.info('Completed invoice reopened for editing', { invoiceId });
      return this.getInvoice(invoiceId);
    });
  }

  public deleteInvoice(input: { invoice_id: number; reason: string; password?: string }) {
    if (input.password) {
      if (!configService.verifyBillActionPassword(input.password)) {
        throw new ConflictError('Invalid authorization password. Delete denied.');
      }
    }

    const databaseProvider = (this.invoiceRepo as any).dbProvider;
    return databaseProvider.transaction(() => {
      const { invoice, items } = this.invoiceRepo.findById(input.invoice_id);
      
      // 1. Restore stock if invoice was completed
      if (invoice.status === 'completed') {
        for (const item of items) {

          let targetVariantId = item.product_variant_id;
          let revGrams = item.quantity_grams;
          let revUnits = item.quantity_units;



          try {
            inventoryLedgerService.recordMovement({
              product_variant_id: targetVariantId,
              branch_id: 1,
              action_type: 'STOCK_ADJUSTMENT',
              quantity_grams: revGrams,
              quantity_units: revUnits,
              reference_type: 'invoice_delete',
              reference_id: input.invoice_id,
              reference_number: invoice.invoice_number || `INV-${input.invoice_id}`,
              notes: `Stock restored from deleted invoice #${invoice.invoice_number || input.invoice_id}: ${input.reason}`,
            });
          } catch (e: any) {
            logger.warn(`Failed to restore stock on bill delete for variant #${targetVariantId}: ${e.message}`);
          }
        }
      }

      // 2. Reverse customer credit sale if customer paid on credit
      if (invoice.customer_id) {
        try {
          const creditSaleRow = db.prepare("SELECT debit_paise FROM customer_ledger WHERE customer_id = ? AND ref_type = 'invoice' AND ref_id = ?").get(invoice.customer_id, input.invoice_id) as { debit_paise: number } | undefined;
          if (creditSaleRow && creditSaleRow.debit_paise > 0) {
            creditService.createCreditNote(invoice.customer_id, input.invoice_id, creditSaleRow.debit_paise, `Reversal of deleted invoice #${invoice.invoice_number || input.invoice_id}: ${input.reason}`);
          }
        } catch (e: any) {
          logger.warn(`Customer ledger reversal notice on invoice delete: ${e.message}`);
        }
      }

      // 3. Mark invoice void/deleted with reason and audit trail
      db.prepare(`
        UPDATE invoices SET
          status = 'void',
          payment_status = 'unpaid',
          void_reason = ?,
          voided_at = CURRENT_TIMESTAMP,
          narration = ?
        WHERE id = ?
      `).run(input.reason, `DELETED: ${input.reason}`, input.invoice_id);

      // 4. Cancel linked delivery order if any
      try {
        db.prepare("UPDATE deliveries SET status = 'cancelled' WHERE invoice_id = ?").run(input.invoice_id);
      } catch (e) {}

      // 5. Audit Logging
      try {
        auditLogger.log(authService.getCurrentUserId() || 1, 'INVOICE_DELETED', {
          invoice_id: input.invoice_id,
          invoice_number: invoice.invoice_number,
          total_paise: invoice.total_paise,
          reason: input.reason,
        });
      } catch (e) {}

      logger.info('Invoice deleted successfully', { invoiceId: input.invoice_id, reason: input.reason });
      return { success: true, invoice_id: input.invoice_id };
    });
  }

  public toggleGst(input: { invoice_id: number; is_gst_invoice: boolean; gst_number_snapshot?: string | null }) {
    const parsed = ToggleGstSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid GST toggle input', parsed.error.flatten());
    }

    const { invoice, items } = this.invoiceRepo.findById(parsed.data.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('GST can only be toggled on draft or held invoices');
    }

    this.invoiceRepo.toggleGst(
      parsed.data.invoice_id,
      parsed.data.is_gst_invoice ? 1 : 0,
      parsed.data.gst_number_snapshot ?? null
    );

    const gstRateSnapshot = parsed.data.is_gst_invoice ? DEFAULT_GST_RATE_BPS : null;
    for (const item of items) {
      const { lineTaxPaise } = pricingService.calculateLineTax(item.line_subtotal_paise, gstRateSnapshot);
      const lineTotalPaise = item.line_subtotal_paise + lineTaxPaise;
      this.invoiceRepo.updateItemGst(item.id, gstRateSnapshot, lineTotalPaise);
    }

    logger.info('GST toggled on invoice', { invoiceId: parsed.data.invoice_id, isGst: parsed.data.is_gst_invoice });
    return this.getInvoice(parsed.data.invoice_id);
  }

  public recordPayment(input: {
    invoice_id: number;
    method: 'cash' | 'upi' | 'card' | 'split';
    amount_paise: number;
    reference_number?: string | null;
  }) {
    const parsed = RecordPaymentSchema.safeParse(input);
    if (!parsed.success) {
      throw new ValidationError('Invalid payment input', parsed.error.flatten());
    }

    // Clear previous payments for draft/held invoice to prevent duplicate payments on retry
    const invoiceDetail = this.invoiceRepo.findById(parsed.data.invoice_id);
    if (invoiceDetail && (invoiceDetail.invoice.status === 'draft' || invoiceDetail.invoice.status === 'held')) {
      db.prepare('DELETE FROM payments WHERE invoice_id = ?').run(parsed.data.invoice_id);
    }

    this.invoiceRepo.addPayment({
      invoice_id: parsed.data.invoice_id,
      method: parsed.data.method,
      amount_paise: parsed.data.amount_paise,
      reference_number: parsed.data.reference_number ?? null,
    });
    logger.info('Payment recorded', { invoiceId: parsed.data.invoice_id, method: parsed.data.method, amountPaise: parsed.data.amount_paise });
    return this.getInvoice(parsed.data.invoice_id);
  }

  public completeInvoice(input: {
    invoiceId?: number;
    invoice_id?: number;
    payments?: Array<{ method: string; amount_paise: number; reference_number?: string | null }>;
    allow_negative_stock_override?: boolean;
    manager_pin?: string;
    override_reason?: string;
    discount_percent?: number;
    flat_deduction_paise?: number;
    dressing_charge_paise?: number;
    round_off_paise?: number;
    narration?: string | null;
    print_delivery_token?: boolean;
    is_delivery?: boolean | number;
    delivery_charge_paise?: number;
  }) {
    const invoiceId = (input.invoiceId ?? input.invoice_id)!;
    // Run the checkout transaction sequence safely
    const databaseProvider = (this.invoiceRepo as any).dbProvider; // Fetch provider reference from repo
    return databaseProvider.transaction(() => {
      if (input.payments && Array.isArray(input.payments)) {
        for (const p of input.payments) {
          this.invoiceRepo.addPayment({
            invoice_id: invoiceId,
            method: p.method as any,
            amount_paise: p.amount_paise,
            reference_number: p.reference_number ?? null,
          });
        }
      }

      const { invoice, items, payments } = this.invoiceRepo.findById(invoiceId);
      if (invoice.status !== 'draft' && invoice.status !== 'held') {
        throw new ConflictError('Only draft or held invoices can be completed');
      }

      if (items.length === 0) {
        throw new ValidationError('Cannot complete an invoice with no items');
      }

      let subtotalPaise = 0;
      let cgstPaiseTotal = 0;
      let sgstPaiseTotal = 0;
      let taxPaiseTotal = 0;

      for (const item of items) {
        if (item.override_applied === 1) {
          if (!item.override_reason) item.override_reason = 'Manual price override';
          if (!item.overridden_by) item.overridden_by = 1;
        }

        subtotalPaise += item.line_subtotal_paise;

        const { lineTaxPaise, cgstPaise, sgstPaise } = pricingService.calculateLineTax(
          item.line_subtotal_paise, item.gst_rate_percent_snapshot
        );

        cgstPaiseTotal += cgstPaise;
        sgstPaiseTotal += sgstPaise;
        taxPaiseTotal += lineTaxPaise;
      }

      const discountPercent = input.discount_percent ?? (invoice.discount_percent || 0);
      const discountPaise = discountPercent > 0 ? Math.round(subtotalPaise * (discountPercent / 100)) : (invoice.discount_paise || 0);
      const flatDeductionPaise = input.flat_deduction_paise ?? (invoice.flat_deduction_paise || 0);
      const dressingChargePaise = input.dressing_charge_paise ?? (invoice.dressing_charge_paise || 0);

      const exactTotalPaise = Math.max(0, subtotalPaise - discountPaise - flatDeductionPaise + taxPaiseTotal + dressingChargePaise);
      const exactRupees = exactTotalPaise / 100;
      const roundedRupees = Math.round(exactRupees);
      const finalNetTotalPaise = roundedRupees * 100;
      const roundOffPaise = finalNetTotalPaise - exactTotalPaise;

      const { invoiceNumber, financialYear } = invoiceNumberingService.generateNextNumber();

      let paidAmount = payments.reduce((acc, p) => acc + p.amount_paise, 0);
      let creditAmount = finalNetTotalPaise - paidAmount;

      // 1. Auto-apply customer advance balance if customer is selected and has advance
      if (invoice.customer_id && creditAmount > 0) {
        const customer = db.prepare('SELECT id, name, advance_balance_paise FROM customers WHERE id = ?').get(invoice.customer_id) as { id: number; name: string; advance_balance_paise: number } | undefined;
        if (customer && customer.advance_balance_paise > 0) {
          const applyAdvance = Math.min(customer.advance_balance_paise, creditAmount);
          creditService.applyAdvanceToInvoice(invoice.customer_id, invoiceId, applyAdvance);
          creditAmount -= applyAdvance;
          paidAmount += applyAdvance;
          // Record adjustment payment log so that invoice-level receipts reflect it
          db.prepare(`
            INSERT INTO payments (invoice_id, method, amount_paise, reference_number)
            VALUES (?, 'split', ?, 'ADV-AUTO-APPLIED')
          `).run(invoiceId, applyAdvance);
        }
      }

      // 2. Process credit sale remainder
      if (creditAmount > 0) {
        if (!invoice.customer_id) {
          throw new ConflictError('Cannot checkout on credit without selecting a customer');
        }

        // Validate credit terms
        const valRes = creditService.validateCreditSale(invoice.customer_id, creditAmount, this.getCurrentUserId());
        if (!valRes.allowed) {
          throw new ConflictError(`Credit sale rejected: ${valRes.message}`);
        }

        if (valRes.requiresOverride) {
          const user = db.prepare('SELECT role FROM users WHERE id = ?').get(this.getCurrentUserId()) as { role: string } | undefined;
          if (!user || (user.role !== 'ADMIN' && user.role !== 'MANAGER')) {
            throw new ConflictError(`Credit limit warning: ${valRes.message}. Requires Manager override permission.`);
          }
        }

        // Place on credit and record in ledger
        creditService.createCreditSale(invoiceId, invoice.customer_id, creditAmount, invoiceNumber);
      }

      let paymentStatus: 'unpaid' | 'partial' | 'paid' = 'unpaid';
      if (paidAmount >= finalNetTotalPaise) {
        paymentStatus = 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      }

      const shopInfo = this.settingsRepo.getShopInfo();

      this.invoiceRepo.completeInvoice(invoiceId, {
        invoice_number: invoiceNumber,
        financial_year: financialYear,
        subtotal_paise: subtotalPaise,
        cgst_paise: cgstPaiseTotal,
        sgst_paise: sgstPaiseTotal,
        tax_paise: taxPaiseTotal,
        total_paise: finalNetTotalPaise,
        payment_status: paymentStatus,
        discount_paise: discountPaise,
        discount_reason: invoice.discount_reason,
        discount_applied_by: invoice.discount_applied_by,
        discount_percent: discountPercent,
        flat_deduction_paise: flatDeductionPaise,
        dressing_charge_paise: dressingChargePaise,
        round_off_paise: roundOffPaise,
        narration: input.narration ?? invoice.narration ?? null,
        print_delivery_token: input.print_delivery_token ? 1 : (invoice.print_delivery_token || 0),
        is_delivery: input.is_delivery !== undefined ? (input.is_delivery ? 1 : 0) : ((invoice as any).is_delivery || 0),
        delivery_charge_paise: input.delivery_charge_paise ?? ((invoice as any).delivery_charge_paise || 0),
        shop_name_snapshot: shopInfo.name,
        shop_address_snapshot: shopInfo.address,
      });

      // Cash is derived solely from recorded cash payment rows. This runs in the
      // same database transaction as invoice completion, inventory and receipt data.
      const cashPaidPaise = payments.filter(payment => payment.method === 'cash')
        .reduce((total, payment) => total + payment.amount_paise, 0);
      cashBoxService.recordCashSale(invoiceId, invoiceNumber, cashPaidPaise, this.getCurrentUserId());

      // Post balanced Double-Entry Ledger rows for completed sale
      if (finalNetTotalPaise > 0) {
        try {
          const voucherGroupId = `SALE-${invoiceId}-${Date.now()}`;
          const entryDate = new Date().toISOString().slice(0, 10);
          const custRow = invoice.customer_id
            ? (db.prepare('SELECT name FROM customers WHERE id = ?').get(invoice.customer_id) as { name: string } | undefined)
            : undefined;
          const partyName = custRow?.name || 'Walk-in Customer';
          const insertLedger = db.prepare(`
            INSERT INTO accounting_daily_ledger (
              date, reference_id, description,
              debit_paise, credit_paise, account_type, created_by,
              voucher_group_id, party_type, party_id, party_name, source_module
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Customer', ?, ?, 'BILLING')
          `);

          // Credit Sales Revenue
          insertLedger.run(
            entryDate,
            `INV-${invoiceNumber}`,
            `POS Sale Bill #${invoiceNumber} (${partyName})`,
            0,
            finalNetTotalPaise,
            'Sales',
            this.getCurrentUserId() || 1,
            voucherGroupId,
            invoice.customer_id ?? null,
            partyName
          );

          // Debit Cash / Bank / Customer Accounts Receivable
          const nonCashPaidPaise = Math.max(0, paidAmount - cashPaidPaise);
          if (cashPaidPaise > 0) {
            insertLedger.run(
              entryDate,
              `INV-${invoiceNumber}`,
              `Cash received for Bill #${invoiceNumber}`,
              Math.min(cashPaidPaise, finalNetTotalPaise),
              0,
              'Cash',
              this.getCurrentUserId() || 1,
              voucherGroupId,
              invoice.customer_id ?? null,
              partyName
            );
          }
          if (nonCashPaidPaise > 0) {
            insertLedger.run(
              entryDate,
              `INV-${invoiceNumber}`,
              `UPI/Card received for Bill #${invoiceNumber}`,
              nonCashPaidPaise,
              0,
              'Bank',
              this.getCurrentUserId() || 1,
              voucherGroupId,
              invoice.customer_id ?? null,
              partyName
            );
          }
          if (creditAmount > 0) {
            insertLedger.run(
              entryDate,
              `INV-${invoiceNumber}`,
              `Udhaar / Credit receivable for Bill #${invoiceNumber} (${partyName})`,
              creditAmount,
              0,
              'Customer',
              this.getCurrentUserId() || 1,
              voucherGroupId,
              invoice.customer_id ?? null,
              partyName
            );
          }
        } catch (ledgerErr) {
          logger.warn('Failed to post double-entry sale ledger rows', { error: String(ledgerErr) });
        }
      }

      for (const item of items) {
        // Target Design C: Resolve product stock mode and stock product
        const prodInfo = db.prepare(`
          SELECT p.id as product_id, p.name as product_name, p.stock_mode, p.parent_product_id,
                 p.link_mode, p.yield_g_per_kg, p.parent_units_per_sale_unit,
                 pv.unit_type, pv.variant_name
          FROM product_variants pv
          JOIN products p ON p.id = pv.product_id
          WHERE pv.id = ?
        `).get(item.product_variant_id) as any;

        if (!prodInfo) {
          throw new ValidationError(`Product not found for line item variant #${item.product_variant_id}`);
        }

        const isWeight = prodInfo.unit_type === 'weight' || prodInfo.unit_type === 'live_dual' || prodInfo.unit_type === 'kg' || prodInfo.unit_type === 'g';

        let stockProductId: number | null = null;
        let stockLinkMode: string = prodInfo.stock_mode || 'OWN';
        let conversionRateUsed: number = 0;
        let deductedQty: number = 0; // integer grams or pieces

        if (prodInfo.stock_mode === 'NONE') {
          stockProductId = null;
          stockLinkMode = 'NONE';
          conversionRateUsed = 0;
          deductedQty = 0;
        } else if (prodInfo.stock_mode === 'LINKED') {
          if (!prodInfo.parent_product_id) {
            throw new ValidationError(`Linked product "${prodInfo.product_name}" is missing a parent product.`);
          }
          const parent = db.prepare('SELECT id, name, stock_mode, is_active, unit_type FROM products WHERE id = ?').get(prodInfo.parent_product_id) as any;
          if (!parent || parent.is_active === 0 || parent.stock_mode !== 'OWN') {
            throw new ValidationError(`Parent product for "${prodInfo.product_name}" is invalid or not an active OWN product.`);
          }
          stockProductId = parent.id;
          stockLinkMode = prodInfo.link_mode || 'YIELD';

          if (stockLinkMode === 'YIELD') {
            conversionRateUsed = prodInfo.yield_g_per_kg || 0;
            if (conversionRateUsed <= 0) {
              throw new ValidationError(`Product "${prodInfo.product_name}" has invalid yield ratio (${conversionRateUsed} g/kg).`);
            }
            const soldGrams = isWeight ? Math.abs(item.quantity_grams ?? 0) : Math.abs(item.quantity_units ?? 0) * 1000;
            // Formula: Parent grams deducted = ROUND_HALF_UP(sold_g * 1000 / yield_g_per_kg)
            deductedQty = roundHalfUp((soldGrams * 1000) / conversionRateUsed);
          } else if (stockLinkMode === 'PACK') {
            conversionRateUsed = prodInfo.parent_units_per_sale_unit || 0;
            if (conversionRateUsed <= 0) {
              throw new ValidationError(`Product "${prodInfo.product_name}" has invalid pack size (${conversionRateUsed}).`);
            }
            const soldUnits = !isWeight ? Math.abs(item.quantity_units ?? 0) : Math.round(Math.abs(item.quantity_grams ?? 0) / 1000);
            deductedQty = soldUnits * conversionRateUsed;
          } else {
            throw new ValidationError(`Unknown link_mode "${stockLinkMode}" for product "${prodInfo.product_name}".`);
          }
        } else {
          // 'OWN' mode (default)
          stockProductId = prodInfo.product_id;
          stockLinkMode = 'OWN';
          conversionRateUsed = 1000;
          deductedQty = isWeight ? Math.abs(item.quantity_grams ?? 0) : Math.abs(item.quantity_units ?? 0);
        }

        // Negative stock check on stock_movements ledger
        if (stockProductId && deductedQty > 0) {
          const smRow = db.prepare('SELECT COALESCE(SUM(qty_delta), 0) as on_hand FROM stock_movements WHERE product_id = ?').get(stockProductId) as any;
          const currentOnHand = smRow ? Number(smRow.on_hand) : 0;

          if (currentOnHand < deductedQty) {
            const policyRow = db.prepare("SELECT value FROM system_settings WHERE key = 'negative_stock_policy'").get() as { value: string } | undefined;
            const negativePolicy = policyRow?.value || 'block'; // Default BLOCK

            if (negativePolicy === 'block' && !input.allow_negative_stock_override) {
              const targetProd = db.prepare('SELECT name, unit_type FROM products WHERE id = ?').get(stockProductId) as any;
              const isTargetWeight = targetProd?.unit_type === 'weight' || targetProd?.unit_type === 'kg' || targetProd?.unit_type === 'live_dual';
              const availStr = isTargetWeight ? (Math.max(0, currentOnHand) / 1000).toFixed(3) + ' kg' : Math.max(0, currentOnHand) + ' pcs';
              const reqStr = isTargetWeight ? (deductedQty / 1000).toFixed(3) + ' kg' : deductedQty + ' pcs';
              throw new ValidationError(
                `Insufficient stock for "${targetProd?.name || prodInfo.product_name}": stock is ${availStr}, selling ${reqStr}. Blocked by negative stock policy.`
              );
            }

            const managerId = this.getCurrentUserId() || 1;
            const reason = input.override_reason || 'Stock shortage approved by manager';
            const shortfall = Math.max(0, deductedQty - currentOnHand);

            try {
              this.inventoryRepo.logOversold({
                invoice_id: invoiceId,
                invoice_item_id: item.id,
                product_variant_id: item.product_variant_id,
                shortfall_grams: isWeight ? shortfall : null,
                shortfall_units: !isWeight ? shortfall : null,
                manager_id: managerId,
                override_reason: reason
              });
            } catch (e) {}
          }

          // Write movement to stock_movements ledger
          db.prepare(`
            INSERT INTO stock_movements (
              product_id, qty_delta, movement_type, ref_type, ref_id, invoice_line_id, reason_code, note, user_id, created_at
            ) VALUES (?, ?, 'SALE', 'invoice_line', ?, ?, 'sale', ?, ?, CURRENT_TIMESTAMP)
          `).run(
            stockProductId,
            -deductedQty,
            item.id,
            item.id,
            `POS Sale Bill #${invoiceNumber}`,
            this.getCurrentUserId() || 1
          );
        }

        // Snapshot to invoice_items
        db.prepare(`
          UPDATE invoice_items
          SET stock_product_id = ?,
              stock_link_mode = ?,
              conversion_rate_used = ?,
              deducted_qty = ?
          WHERE id = ?
        `).run(
          stockProductId,
          stockLinkMode,
          conversionRateUsed,
          deductedQty,
          item.id
        );

        let deductGrams = item.quantity_grams;
        let deductUnits = item.quantity_units;

        const manualAllocations = (item as any).manual_batch_allocations;
        let isManualSelected = 0;
        let totalItemCogsPaise = 0;
        let realCogsPaise = 0;
        let estimatedCogsPaise = 0;
        let isEstimatedCogs = 0;

        let targetVariantId = item.product_variant_id;
        let drawGrams = deductGrams;
        let drawUnits = deductUnits;
        // Check if product is mapped to a live animal in live_yield_ratios
        const yieldRatioRow = db.prepare(`
          SELECT lyr.*, layc.live_tracking_enabled, layc.track_byproducts
          FROM live_yield_ratios lyr
          JOIN live_animal_yield_configs layc ON layc.animal_key = lyr.animal_key
          WHERE lyr.variant_id = ?
        `).get(item.product_variant_id) as any;

        const isMainCut = yieldRatioRow && yieldRatioRow.role === 'MAIN_CUT' && yieldRatioRow.live_tracking_enabled === 1 && yieldRatioRow.grams_per_kg_live > 0;

        if (isMainCut) {
          // Rule: Use product's own on-hand stock first (no live deduction for that portion)
          // For weight cuts: soldGrams = quantity_grams; For piece cuts: soldGrams = quantity_units * grams_per_kg_live
          const soldGrams = isWeight 
            ? Math.abs(item.quantity_grams ?? 0) 
            : Math.abs(item.quantity_units ?? 0) * yieldRatioRow.grams_per_kg_live;
          const soldUnits = !isWeight ? Math.abs(item.quantity_units ?? 0) : null;

          const ownOnHandGrams = inventoryLedgerService.getStockOnHand(item.product_variant_id).quantity_grams ?? 0;
          const ownOnHandUnits = inventoryLedgerService.getStockOnHand(item.product_variant_id).quantity_units ?? 0;
          const ownAvailable = isWeight ? Math.max(0, ownOnHandGrams) : Math.max(0, ownOnHandUnits);
          const requested = isWeight ? soldGrams : (soldUnits ?? 0);
          const drawFromOwn = Math.min(ownAvailable, requested);
          const remainingRequested = Math.max(0, requested - drawFromOwn);

          const drawFromOwnGrams = isWeight ? drawFromOwn : (drawFromOwn * yieldRatioRow.grams_per_kg_live);
          const remainingSoldGrams = isWeight ? remainingRequested : (remainingRequested * yieldRatioRow.grams_per_kg_live);

          // 1. Draw down own stock if any
          if (drawFromOwn > 0) {
            const fifoOwn = fifoService.drawdownFifo(item.product_variant_id, isWeight ? drawFromOwn : null, !isWeight ? drawFromOwn : null);
            totalItemCogsPaise += fifoOwn.total_cogs_paise;
            realCogsPaise += fifoOwn.real_cogs_paise;
            estimatedCogsPaise += fifoOwn.estimated_cogs_paise;
            if (fifoOwn.is_estimated_cogs) isEstimatedCogs = 1;

            const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
            inventoryLedgerService.recordEntry({
              product_variant_id: item.product_variant_id,
              branch_id: 1,
              action_type: 'sale',
              quantity_grams: isWeight ? -drawFromOwn : null,
              quantity_units: !isWeight ? -drawFromOwn : null,
              unit_cost_paise: item.rate_paise_snapshot,
              reference_type: 'invoice',
              reference_id: invoiceId,
              reference_number: invoiceNumber,
              notes: `POS Sale Bill #${invoiceNumber} (from own stock)`,
              created_by: this.getCurrentUserId(),
            });

            this.inventoryRepo.createTransaction({
              product_variant_id: item.product_variant_id,
              transaction_type: 'sale_deduction',
              quantity_grams: isWeight ? -drawFromOwn : null,
              quantity_units: !isWeight ? -drawFromOwn : null,
              reference_id: invoiceId
            });
          }

          // 2. Remaining grams deducted from live pool of animal_key
          if (remainingSoldGrams > 0) {
            // live_grams = roundHalfUp(sold_grams * 1000 / grams_per_kg_live)
            const liveGramsToDeduct = roundHalfUp((remainingSoldGrams * 1000) / yieldRatioRow.grams_per_kg_live);
            let unfulfilledLiveGrams = liveGramsToDeduct;

            // Draw FIFO from live_chicken_batches for animal_type
            const liveBatches = db.prepare(`
              SELECT * FROM live_chicken_batches
              WHERE animal_type = ? AND status = 'active' AND remaining_weight_grams > 0
              ORDER BY purchase_date ASC, id ASC
            `).all(yieldRatioRow.animal_key) as any[];

            for (const b of liveBatches) {
              if (unfulfilledLiveGrams <= 0) break;
              const deductGramsFromBatch = Math.min(b.remaining_weight_grams, unfulfilledLiveGrams);
              const ratio = deductGramsFromBatch / (b.remaining_weight_grams || 1);
              const currentMilli = (b.remaining_count_milli !== null && b.remaining_count_milli !== undefined) ? b.remaining_count_milli : (b.remaining_count * 1000);
              const deductMilli = Math.round(currentMilli * ratio);

              const newWeight = b.remaining_weight_grams - deductGramsFromBatch;
              const newCountMilli = Math.max(0, currentMilli - deductMilli);
              const newCount = Math.floor(newCountMilli / 1000);
              const newStatus = (newWeight <= 0) ? 'exhausted' : 'active';

              db.prepare(`
                UPDATE live_chicken_batches
                SET remaining_weight_grams = ?, remaining_count = ?, remaining_count_milli = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(newWeight, newCount, newCountMilli, newStatus, b.id);

              const batchCogs = Math.round((deductGramsFromBatch / 1000) * b.cost_per_kg_paise);
              totalItemCogsPaise += batchCogs;
              realCogsPaise += batchCogs;

              // Insert exact per-sale deduction row
              const soldGramsPortion = roundHalfUp((deductGramsFromBatch * yieldRatioRow.grams_per_kg_live) / 1000);
              db.prepare(`
                INSERT INTO live_animal_sale_deductions (
                  invoice_id, invoice_item_id, batch_id, animal_type, sold_product_variant_id,
                  sold_grams, live_grams_deducted, count_milli_deducted, ratio_snapshot_used
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                invoiceId,
                item.id,
                b.id,
                yieldRatioRow.animal_key,
                item.product_variant_id,
                soldGramsPortion,
                deductGramsFromBatch,
                deductMilli,
                yieldRatioRow.grams_per_kg_live
              );

              unfulfilledLiveGrams -= deductGramsFromBatch;
            }

            // If pool is short: still save bill, allow negative pool on the latest batch or create negative batch
            if (unfulfilledLiveGrams > 0) {
              const lastBatch = db.prepare(`SELECT id, remaining_weight_grams, remaining_count, cost_per_kg_paise FROM live_chicken_batches WHERE animal_type = ? ORDER BY id DESC LIMIT 1`).get(yieldRatioRow.animal_key) as any;
              let deficitBatchId = lastBatch?.id;
              let costPaise = lastBatch?.cost_per_kg_paise || 0;

              if (lastBatch) {
                db.prepare(`
                  UPDATE live_chicken_batches
                  SET remaining_weight_grams = remaining_weight_grams - ?, status = 'active', updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `).run(unfulfilledLiveGrams, lastBatch.id);
              } else {
                const batchNum = `NEG-${yieldRatioRow.animal_key.toUpperCase()}-${Date.now().toString().slice(-6)}`;
                const insRes = db.prepare(`
                  INSERT INTO live_chicken_batches (
                    batch_number, animal_type, supplier_id, purchase_date,
                    cost_per_kg_paise, initial_weight_grams, initial_count,
                    remaining_weight_grams, remaining_count, remaining_count_milli, status, notes
                  ) VALUES (?, ?, 1, CURRENT_TIMESTAMP, 0, 0, 0, ?, 0, 0, 'active', 'Auto-created negative pool')
                `).run(batchNum, yieldRatioRow.animal_key, -unfulfilledLiveGrams);
                deficitBatchId = Number(insRes.lastInsertRowid);
              }

              const soldGramsPortion = roundHalfUp((unfulfilledLiveGrams * yieldRatioRow.grams_per_kg_live) / 1000);
              db.prepare(`
                INSERT INTO live_animal_sale_deductions (
                  invoice_id, invoice_item_id, batch_id, animal_type, sold_product_variant_id,
                  sold_grams, live_grams_deducted, count_milli_deducted, ratio_snapshot_used
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                invoiceId,
                item.id,
                deficitBatchId,
                yieldRatioRow.animal_key,
                item.product_variant_id,
                soldGramsPortion,
                unfulfilledLiveGrams,
                0,
                yieldRatioRow.grams_per_kg_live
              );

              estimatedCogsPaise += Math.round((unfulfilledLiveGrams / 1000) * costPaise);
              isEstimatedCogs = 1;
              totalItemCogsPaise += Math.round((unfulfilledLiveGrams / 1000) * costPaise);
            }

            // Synchronize mapped live animal product variant in stock ledger
            const liveConfig = db.prepare('SELECT live_variant_id FROM live_animal_yield_configs WHERE animal_key = ?').get(yieldRatioRow.animal_key) as any;
            if (liveConfig?.live_variant_id) {
              const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
              inventoryLedgerService.recordMovement({
                product_variant_id: liveConfig.live_variant_id,
                branch_id: 1,
                action_type: 'YIELD_OUT',
                quantity_grams: -liveGramsToDeduct,
                quantity_units: null,
                reference_type: 'invoice',
                reference_id: invoiceId,
                reference_number: invoiceNumber,
                notes: `Live animal consumption (${yieldRatioRow.animal_key}) for Cut #${item.product_variant_id} on POS Sale #${invoiceNumber}`,
                created_by: this.getCurrentUserId(),
              });
            }

            // By-product credit: when live grams are consumed, credit each BYPRODUCT product's stock at its ratio
            if (yieldRatioRow.track_byproducts === 1) {
              const byproducts = db.prepare(`
                SELECT * FROM live_yield_ratios
                WHERE animal_key = ? AND role = 'BYPRODUCT' AND grams_per_kg_live > 0
              `).all(yieldRatioRow.animal_key) as any[];

              const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
              for (const bp of byproducts) {
                const bpVariant = db.prepare('SELECT unit_type FROM product_variants WHERE id = ?').get(bp.variant_id) as any;
                const isBpWeight = bpVariant?.unit_type === 'weight' || bpVariant?.unit_type === 'live_dual';
                const bpGrams = isBpWeight ? roundHalfUp((liveGramsToDeduct * bp.grams_per_kg_live) / 1000) : null;
                const bpUnits = !isBpWeight ? roundHalfUp((liveGramsToDeduct * bp.grams_per_kg_live) / 1000) : null;

                if ((bpGrams && bpGrams > 0) || (bpUnits && bpUnits > 0)) {
                  inventoryLedgerService.recordMovement({
                    product_variant_id: bp.variant_id,
                    branch_id: 1,
                    action_type: 'STOCK_ADJUSTMENT',
                    quantity_grams: bpGrams,
                    quantity_units: bpUnits,
                    reference_type: 'yield_byproduct',
                    reference_id: invoiceId,
                    reference_number: invoiceNumber,
                    notes: `Byproduct credit (${yieldRatioRow.animal_key}) from POS Sale #${invoiceNumber}`,
                    created_by: this.getCurrentUserId(),
                  });
                }
              }
            }
          }
        } else {
          // Standard / Direct item drawdown
          if (manualAllocations && Array.isArray(manualAllocations) && manualAllocations.length > 0 && targetVariantId === item.product_variant_id) {
            isManualSelected = 1;
            for (const alloc of manualAllocations) {
              const batch = db.prepare('SELECT * FROM product_stock_batches WHERE id = ?').get(alloc.batch_id) as any;
              if (!batch) continue;

              const allocDrawGrams = isWeight ? Math.abs(alloc.quantity_grams ?? 0) : null;
              const allocDrawUnits = !isWeight ? Math.abs(alloc.quantity_units ?? 0) : null;

              const newGrams = isWeight ? Math.max(0, (batch.current_quantity_grams ?? 0) - (allocDrawGrams ?? 0)) : null;
              const newUnits = !isWeight ? Math.max(0, (batch.current_quantity_units ?? 0) - (allocDrawUnits ?? 0)) : null;

              const isExhausted = (isWeight && newGrams! <= 0) || (!isWeight && newUnits! <= 0);

              db.prepare(`
                UPDATE product_stock_batches
                SET current_quantity_grams = ?, current_quantity_units = ?, status = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(newGrams, newUnits, isExhausted ? 'exhausted' : 'active', batch.id);

              const batchCogs = isWeight ? Math.round(((allocDrawGrams ?? 0) / 1000) * batch.unit_cost_paise) : ((allocDrawUnits ?? 0) * batch.unit_cost_paise);
              realCogsPaise += batchCogs;

              try {
                db.prepare(`
                  INSERT INTO invoice_item_batch_allocations (
                    invoice_item_id, batch_id, quantity_grams, quantity_units, unit_cost_paise
                  ) VALUES (?, ?, ?, ?, ?)
                `).run(item.id, batch.id, allocDrawGrams, allocDrawUnits, batch.unit_cost_paise);
              } catch (e) {}
            }

            totalItemCogsPaise = realCogsPaise;
            fifoService.syncLedgerBalance(item.product_variant_id);
          } else {
            // Execute FIFO Drawdown across active batches
            const fifoRes = fifoService.drawdownFifo(targetVariantId, isWeight ? drawGrams : null, !isWeight ? drawUnits : null);
            totalItemCogsPaise = fifoRes.total_cogs_paise;
            realCogsPaise = fifoRes.real_cogs_paise;
            estimatedCogsPaise = fifoRes.estimated_cogs_paise;
            isEstimatedCogs = fifoRes.is_estimated_cogs;
          }

          const deltaGrams = isWeight ? -(Math.abs(deductGrams ?? 0)) : null;
          const deltaUnits = !isWeight ? -(Math.abs(deductUnits ?? 0)) : null;

          // Track transaction log
          this.inventoryRepo.createTransaction({
            product_variant_id: item.product_variant_id,
            transaction_type: 'sale_deduction',
            quantity_grams: deltaGrams,
            quantity_units: deltaUnits,
            reference_id: invoiceId
          });

          // Record unified inventory_ledger entry
          const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
          inventoryLedgerService.recordEntry({
            product_variant_id: item.product_variant_id,
            branch_id: 1,
            action_type: 'sale',
            quantity_grams: deltaGrams,
            quantity_units: deltaUnits,
            unit_cost_paise: item.rate_paise_snapshot,
            reference_type: 'invoice',
            reference_id: invoiceId,
            reference_number: invoiceNumber,
            notes: `POS Sale Bill #${invoiceNumber}`,
            created_by: this.getCurrentUserId(),
          });
        }

        // Update fifo_cogs_paise, real_cogs_paise, estimated_cogs_paise, is_estimated_cogs, and is_manual_batch_selected on invoice_item
        try {
          db.prepare(`
            UPDATE invoice_items
            SET fifo_cogs_paise = ?,
                real_cogs_paise = ?,
                estimated_cogs_paise = ?,
                is_estimated_cogs = ?,
                is_manual_batch_selected = ?
            WHERE id = ?
          `).run(totalItemCogsPaise, realCogsPaise, estimatedCogsPaise, isEstimatedCogs, isManualSelected, item.id);
        } catch (e) {
          db.prepare(`
            UPDATE invoice_items
            SET fifo_cogs_paise = ?, is_manual_batch_selected = ?
            WHERE id = ?
          `).run(totalItemCogsPaise, isManualSelected, item.id);
        }
      }

      auditLogger.log(
        this.getCurrentUserId(),
        'INVOICE_COMPLETED',
        { invoiceNumber, totalPaise: finalNetTotalPaise, itemCount: items.length }
      );

      logger.info('Invoice completed', { invoiceId, invoiceNumber, totalPaise: finalNetTotalPaise });

      const completedResult = this.getInvoice(invoiceId);

      // If invoice was reopened and edited, record audit log diff
      try {
        const invRow = db.prepare('SELECT edit_snapshot_json, edit_reason FROM invoices WHERE id = ?').get(invoiceId) as any;
        if (invRow?.edit_snapshot_json) {
          const newSnapshot = {
            invoice: { ...completedResult.invoice },
            items: (completedResult.items || []).map((it: any) => ({ ...it })),
            payments: (completedResult.payments || []).map((p: any) => ({ ...p }))
          };

          db.prepare(`
            INSERT INTO sale_edit_audit_logs (
              invoice_id, edited_by, edit_reason, old_values_json, new_values_json
            ) VALUES (?, ?, ?, ?, ?)
          `).run(
            invoiceId,
            this.getCurrentUserId() || 1,
            invRow.edit_reason || 'Reopened and edited completed invoice',
            invRow.edit_snapshot_json,
            JSON.stringify(newSnapshot)
          );

          db.prepare('UPDATE invoices SET edit_snapshot_json = NULL, edit_reason = NULL WHERE id = ?').run(invoiceId);
          logger.info('Recorded sales invoice edit audit log', { invoiceId });
        }
      } catch (auditErr: any) {
        logger.error('Failed to write sale edit audit log', auditErr);
      }

      // Trigger Customer Intelligence calculation event
      if (invoice.customer_id) {
        try {
          const { customerIntelligenceService } = require('../../../customers/backend/service/customer_intelligence_service');
          customerIntelligenceService.handleCustomerTransactionEvent(invoice.customer_id);
        } catch (e) {
          logger.warn('Failed to trigger customer intelligence calculation on invoice complete', { customerId: invoice.customer_id });
        }
      }

      return completedResult;
    });
  }

  public voidInvoice(input: { invoice_id: number; voided_by?: number; void_reason: string }) {
    authService.requireRole(['ADMIN', 'MANAGER', 'CASHIER']);
    const parsed = VoidInvoiceSchema.safeParse({
      invoice_id: input.invoice_id,
      voided_by: input.voided_by ?? this.getCurrentUserId(),
      void_reason: input.void_reason,
    });
    if (!parsed.success) {
      throw new ValidationError('Invalid void input', parsed.error.flatten());
    }

    const databaseProvider = (this.invoiceRepo as any).dbProvider;
    return databaseProvider.transaction(() => {
      const { invoice, items } = this.invoiceRepo.findById(parsed.data.invoice_id);
      if (invoice.status !== 'completed') {
        throw new ConflictError('Only completed invoices can be voided');
      }

      this.invoiceRepo.voidInvoice(parsed.data.invoice_id, parsed.data.voided_by, parsed.data.void_reason);

      for (const item of items) {
        let targetVariantId = item.product_variant_id;
        let revGrams = item.quantity_grams;
        let revUnits = item.quantity_units;

        // Check if item had live animal deductions
        const liveDeductions = db.prepare(`
          SELECT * FROM live_animal_sale_deductions WHERE invoice_item_id = ?
        `).all(item.id) as any[];

        if (liveDeductions && liveDeductions.length > 0) {
          let totalLiveGramsRestored = 0;
          let animalKey = liveDeductions[0].animal_type;

          for (const ld of liveDeductions) {
            // Restore exact live_grams_deducted and count_milli_deducted into the exact batch_id
            db.prepare(`
              UPDATE live_chicken_batches SET
                remaining_weight_grams = remaining_weight_grams + ?,
                remaining_count_milli = COALESCE(remaining_count_milli, remaining_count * 1000) + ?,
                remaining_count = CASE 
                  WHEN remaining_count_milli IS NOT NULL THEN (remaining_count_milli + ?) / 1000 
                  ELSE remaining_count + (? / 1000) 
                END,
                status = 'active',
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(ld.live_grams_deducted, ld.count_milli_deducted, ld.count_milli_deducted, ld.count_milli_deducted, ld.batch_id);

            totalLiveGramsRestored += ld.live_grams_deducted;
          }

          // Reverse any byproduct credits granted by this sale
          const byproducts = db.prepare(`
            SELECT * FROM live_yield_ratios WHERE animal_key = ? AND role = 'BYPRODUCT' AND grams_per_kg_live > 0
          `).all(animalKey) as any[];

          const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
          for (const bp of byproducts) {
            const bpGrams = roundHalfUp((totalLiveGramsRestored * bp.grams_per_kg_live) / 1000);
            if (bpGrams > 0) {
              inventoryLedgerService.recordMovement({
                product_variant_id: bp.variant_id,
                branch_id: 1,
                action_type: 'STOCK_ADJUSTMENT',
                quantity_grams: -bpGrams,
                quantity_units: null,
                reference_type: 'yield_byproduct_reversal',
                reference_id: parsed.data.invoice_id,
                reference_number: invoice.invoice_number,
                notes: `Byproduct reversal (${animalKey}) for voided invoice #${invoice.invoice_number}`,
                created_by: parsed.data.voided_by,
              });
            }
          }

          // If item also drew from own stock (total sold_grams > live deductions converted):
          const totalSoldViaLive = liveDeductions.reduce((sum, d) => sum + d.sold_grams, 0);
          const ownDrawnGrams = Math.max(0, (revGrams || 0) - totalSoldViaLive);
          if (ownDrawnGrams > 0) {
            inventoryLedgerService.recordMovement({
              product_variant_id: targetVariantId,
              branch_id: 1,
              action_type: 'STOCK_ADJUSTMENT',
              quantity_grams: ownDrawnGrams,
              quantity_units: null,
              reference_type: 'invoice',
              reference_id: parsed.data.invoice_id,
              reference_number: invoice.invoice_number,
              reason_code: 'unrecorded_sale',
              notes: `Reversal of own stock portion of voided invoice #${invoice.invoice_number}`,
              created_by: parsed.data.voided_by,
            });
          }
        } else {
          // Standard item atomic stock reversal
          const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
          inventoryLedgerService.recordMovement({
            product_variant_id: targetVariantId,
            branch_id: 1,
            action_type: 'STOCK_ADJUSTMENT',
            quantity_grams: revGrams,
            quantity_units: revUnits,
            reference_type: 'invoice',
            reference_id: parsed.data.invoice_id,
            reference_number: invoice.invoice_number,
            reason_code: 'unrecorded_sale',
            notes: `Reversal of voided invoice #${invoice.invoice_number}: ${parsed.data.void_reason}`,
            created_by: parsed.data.voided_by,
          });

          // Restore batch stock if allocations existed
          try {
            const allocs = db.prepare('SELECT * FROM invoice_item_batch_allocations WHERE invoice_item_id = ?').all(item.id) as any[];
            for (const al of allocs) {
              db.prepare(`
                UPDATE product_stock_batches SET
                  current_quantity_grams = CASE WHEN current_quantity_grams IS NOT NULL THEN current_quantity_grams + ? ELSE NULL END,
                  current_quantity_units = CASE WHEN current_quantity_units IS NOT NULL THEN current_quantity_units + ? ELSE NULL END,
                  status = 'active',
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(al.quantity_grams || 0, al.quantity_units || 0, al.batch_id);
            }
          } catch (e) {}
        }

        // Target Design C: Reverse saved stock_movements snapshot if recorded
        if (item.stock_product_id && item.deducted_qty && item.deducted_qty > 0) {
          try {
            db.prepare(`
              INSERT INTO stock_movements (
                product_id, qty_delta, movement_type, ref_type, ref_id, invoice_line_id, reason_code, note, user_id, created_at
              ) VALUES (?, ?, 'SALE_CANCEL', 'invoice_line', ?, ?, 'void', ?, ?, CURRENT_TIMESTAMP)
            `).run(
              item.stock_product_id,
              item.deducted_qty, // exact positive reversal
              item.id,
              item.id,
              `Reversal of voided invoice #${invoice.invoice_number}`,
              parsed.data.voided_by || 1
            );
          } catch (e) {
            logger.warn('Failed to insert stock_movement for void reversal', { error: String(e) });
          }
        }
      }

      auditLogger.log(
        parsed.data.voided_by,
        'INVOICE_VOIDED',
        { invoice_id: parsed.data.invoice_id, reason: parsed.data.void_reason }
      );

      // Reverse customer credit sale if customer paid on credit
      if (invoice.customer_id) {
        const creditSaleRow = db.prepare("SELECT debit_paise FROM customer_ledger WHERE customer_id = ? AND ref_type = 'invoice' AND ref_id = ?").get(invoice.customer_id, parsed.data.invoice_id) as { debit_paise: number } | undefined;
        if (creditSaleRow && creditSaleRow.debit_paise > 0) {
          creditService.createCreditNote(invoice.customer_id, parsed.data.invoice_id, creditSaleRow.debit_paise, `Reversal of voided invoice #${invoice.invoice_number}`);
        }
      }

      logger.info('Invoice voided', { invoiceId: parsed.data.invoice_id, reason: parsed.data.void_reason });
      return this.invoiceRepo.findById(parsed.data.invoice_id);
    });
  }

  public returnInvoice(input: {
    date?: string;
    invoice_id?: number | null;
    reference?: string;
    reason: string;
    stock_resolution: 'discarded' | 'restored';
    refund_given: boolean;
    refund_method?: 'cash' | 'credit_balance' | 'credit_note' | 'none';
    items?: Array<{
      invoice_item_id?: number | null;
      product_variant_id: number;
      quantity_grams: number | null;
      quantity_units: number | null;
      unit_rate_paise: number;
      refund_total_paise: number;
    }>;
  }) {
    // 1. Authorize role: allow cashier, admin, or manager
    authService.requireRole(['ADMIN', 'MANAGER', 'CASHIER']);

    const databaseProvider = (this.invoiceRepo as any).dbProvider;
    return databaseProvider.transaction(() => {
      let targetInvoiceId = input.invoice_id;
      let originalInvoiceNumber = input.reference || null;
      let customerId = null;

      // Calculate total refund amount from payload
      let totalRefundPaise = 0;
      const returnItems = input.items || [];
      returnItems.forEach(i => {
        totalRefundPaise += i.refund_total_paise;
      });

      if (targetInvoiceId) {
        const originalInvoice = this.invoiceRepo.findById(targetInvoiceId);
        if (originalInvoice.invoice.status !== 'completed') {
          throw new ConflictError('Only completed invoices can be returned');
        }
        originalInvoiceNumber = originalInvoice.invoice.invoice_number ?? String(targetInvoiceId);
        customerId = originalInvoice.invoice.customer_id;
        // set status to returned
        this.invoiceRepo.setStatus(targetInvoiceId, 'returned');
      } else {
        // standalone return. Create a dummy negative invoice to account for it
        const created = this.invoiceRepo.create({
          created_by: authService.getCurrentUserId(),
          is_gst_invoice: 0,
        });
        targetInvoiceId = created.id;
        
        for (const item of returnItems) {
           this.invoiceRepo.addItem({
             invoice_id: targetInvoiceId,
             product_variant_id: item.product_variant_id,
             quantity_grams: item.quantity_grams ? -item.quantity_grams : null,
             quantity_units: item.quantity_units ? -item.quantity_units : null,
             rate_paise_snapshot: item.unit_rate_paise,
             line_subtotal_paise: -item.refund_total_paise,
             gst_rate_percent_snapshot: null,
             line_total_paise: -item.refund_total_paise,
             override_applied: 0,
             override_reason: null,
             overridden_by: null,
           });
        }
        const refStr = input.reference ? `Ref: ${input.reference}` : 'Direct Return';
        
        const returnUpdateStmt = db.prepare(`
          UPDATE invoices SET
            invoice_number = @invoice_number,
            financial_year = @financial_year,
            status = 'returned',
            subtotal_paise = @subtotal_paise,
            cgst_paise = 0,
            sgst_paise = 0,
            tax_paise = 0,
            total_paise = @total_paise,
            payment_status = 'paid',
            discount_paise = 0,
            discount_percent = 0,
            flat_deduction_paise = 0,
            dressing_charge_paise = 0,
            round_off_paise = 0,
            print_delivery_token = 0,
            narration = @narration,
            shop_name_snapshot = 'Return',
            shop_address_snapshot = '',
            completed_at = CURRENT_TIMESTAMP
          WHERE id = @id
        `);
        returnUpdateStmt.run({
           id: targetInvoiceId,
           invoice_number: `RET-${targetInvoiceId}`,
           financial_year: '23-24',
           subtotal_paise: -totalRefundPaise,
           total_paise: -totalRefundPaise,
           narration: refStr
        });
      }

      let managerId = authService.getCurrentUserId();

      // 2. Handle stock
      if (input.stock_resolution === 'restored') {
        for (const item of returnItems) {
          const isWeight = item.quantity_grams !== null;
          let deltaGrams = isWeight ? Math.abs(item.quantity_grams ?? 0) : null;
          let deltaUnits = !isWeight ? Math.abs(item.quantity_units ?? 0) : null;
          let targetVariantId = item.product_variant_id;

          // Target Design C: Restore stock using the SAVED deduction in proportion
          // (saved_deduction * returned_qty / sold_qty, round half up)
          if (item.invoice_item_id) {
            const origItem = db.prepare('SELECT * FROM invoice_items WHERE id = ?').get(item.invoice_item_id) as any;
            if (origItem && origItem.stock_product_id && origItem.deducted_qty > 0) {
              const origSold = origItem.quantity_grams ?? origItem.quantity_units ?? 1;
              const retQty = item.quantity_grams ?? item.quantity_units ?? 0;
              const restoredStockQty = roundHalfUp((origItem.deducted_qty * Math.abs(retQty)) / Math.max(1, Math.abs(origSold)));
              if (restoredStockQty > 0) {
                try {
                  db.prepare(`
                    INSERT INTO stock_movements (
                      product_id, qty_delta, movement_type, ref_type, ref_id, invoice_line_id, reason_code, note, user_id, created_at
                    ) VALUES (?, ?, 'SALE_RETURN', 'invoice_line', ?, ?, 'return', ?, ?, CURRENT_TIMESTAMP)
                  `).run(
                    origItem.stock_product_id,
                    restoredStockQty,
                    item.invoice_item_id,
                    item.invoice_item_id,
                    `Sales return restoration for #${originalInvoiceNumber || targetInvoiceId}`,
                    managerId || 1
                  );
                } catch (smErr) {
                  logger.warn('Failed to insert stock_movement for sales return', { error: String(smErr) });
                }
              }
            }
          }

          // Check if the original invoice item had live animal deductions
          let liveDeductions: any[] = [];
          if (item.invoice_item_id) {
            liveDeductions = db.prepare(`
              SELECT * FROM live_animal_sale_deductions WHERE invoice_item_id = ?
            `).all(item.invoice_item_id) as any[];
          } else if (targetInvoiceId) {
            liveDeductions = db.prepare(`
              SELECT * FROM live_animal_sale_deductions 
              WHERE invoice_id = ? AND sold_product_variant_id = ?
            `).all(targetInvoiceId, targetVariantId) as any[];
          }

          if (liveDeductions && liveDeductions.length > 0) {
            let totalLiveGramsRestored = 0;
            let animalKey = liveDeductions[0].animal_type;

            for (const ld of liveDeductions) {
              db.prepare(`
                UPDATE live_chicken_batches SET
                  remaining_weight_grams = remaining_weight_grams + ?,
                  remaining_count_milli = COALESCE(remaining_count_milli, remaining_count * 1000) + ?,
                  remaining_count = CASE 
                    WHEN remaining_count_milli IS NOT NULL THEN (remaining_count_milli + ?) / 1000 
                    ELSE remaining_count + (? / 1000) 
                  END,
                  status = 'active',
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
              `).run(ld.live_grams_deducted, ld.count_milli_deducted, ld.count_milli_deducted, ld.count_milli_deducted, ld.batch_id);

              totalLiveGramsRestored += ld.live_grams_deducted;
            }

            // Reverse byproduct credits
            const byproducts = db.prepare(`
              SELECT * FROM live_yield_ratios WHERE animal_key = ? AND role = 'BYPRODUCT' AND grams_per_kg_live > 0
            `).all(animalKey) as any[];

            const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
            for (const bp of byproducts) {
              const bpGrams = roundHalfUp((totalLiveGramsRestored * bp.grams_per_kg_live) / 1000);
              if (bpGrams > 0) {
                inventoryLedgerService.recordMovement({
                  product_variant_id: bp.variant_id,
                  branch_id: 1,
                  action_type: 'STOCK_ADJUSTMENT',
                  quantity_grams: -bpGrams,
                  quantity_units: null,
                  reference_type: 'yield_byproduct_reversal',
                  reference_id: targetInvoiceId,
                  reference_number: originalInvoiceNumber,
                  notes: `Byproduct reversal (${animalKey}) for returned invoice #${originalInvoiceNumber}`,
                  created_by: managerId,
                });
              }
            }
          } else {
            // Normal product stock return
            const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
            inventoryLedgerService.recordMovement({
              product_variant_id: targetVariantId,
              branch_id: 1,
              action_type: 'SALE_RETURN',
              quantity_grams: deltaGrams,
              quantity_units: deltaUnits,
              unit_cost_paise: item.unit_rate_paise,
              reference_type: 'invoice',
              reference_id: targetInvoiceId,
              reference_number: originalInvoiceNumber,
              reason_code: 'other',
              notes: `Sales return restored (${originalInvoiceNumber}) - ${input.reason || 'Restocked'}`,
              created_by: managerId,
            });

            // Also activate a batch in product_stock_batches for FIFO availability
            try {
              const cleanDate = new Date().toISOString().slice(0, 10).replace(/[^0-9]/g, '');
              const retBatchNo = `BAT-RET-${cleanDate}-${targetInvoiceId}-${targetVariantId}-${Math.floor(Math.random()*1000)}`;
              db.prepare(`
                INSERT INTO product_stock_batches (
                  batch_number, product_variant_id, received_date, original_batch_date,
                  initial_quantity_grams, initial_quantity_units,
                  current_quantity_grams, current_quantity_units,
                  unit_cost_paise, source_type, source_ref_id, status, location_id
                ) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?, 'adjustment', ?, 'active', 1)
              `).run(
                retBatchNo,
                targetVariantId,
                deltaGrams,
                deltaUnits,
                deltaGrams,
                deltaUnits,
                item.unit_rate_paise,
                targetInvoiceId
              );
            } catch (e) {}
          }
        }
      } else {
        // Discarded / Spoilage return: log audit movement to ledger without adding back to saleable stock
        for (const item of returnItems) {
          const { inventoryLedgerService } = require('../../../inventory/backend/service/inventory_ledger_service');
          inventoryLedgerService.recordMovement({
            product_variant_id: item.product_variant_id,
            branch_id: 1,
            action_type: 'WASTAGE',
            quantity_grams: 0,
            quantity_units: 0,
            unit_cost_paise: item.unit_rate_paise,
            reference_type: 'invoice',
            reference_id: targetInvoiceId,
            reference_number: originalInvoiceNumber,
            reason_code: 'spoilage',
            notes: `Sales return discarded/spoilage (${originalInvoiceNumber}) - ${input.reason || 'Spoilage'}`,
            created_by: managerId,
          });
        }
      }

      // 3. Log Audit Trail
      auditLogger.log(
        managerId,
        'INVOICE_RETURNED',
        { 
          invoice_id: targetInvoiceId, 
          reason: input.reason, 
          resolution: input.stock_resolution, 
          refundGiven: input.refund_given, 
          refundMethod: input.refund_method, 
          totalRefundPaise, 
          authorizedBy: managerId 
        }
      );

      // 4. Record Cash Box Outflow / CRM Credit
      if (input.refund_given) {
        if (input.refund_method === 'cash' && totalRefundPaise > 0) {
          cashBoxService.recordCashRefund(targetInvoiceId, originalInvoiceNumber ?? String(targetInvoiceId), totalRefundPaise, input.reason, managerId);
        } else if (input.refund_method === 'credit_balance' && customerId) {
          creditService.depositAdvance({
            customer_id: customerId,
            amount_paise: totalRefundPaise,
            payment_method: 'credit_note',
            reference_number: `Return Refund ${originalInvoiceNumber}`,
            collected_by: managerId,
          });
        }
      }

      logger.info('Invoice returned successfully', { invoiceId: targetInvoiceId, resolutionType: input.stock_resolution, refundMethod: input.refund_method, totalRefundPaise });
      return this.invoiceRepo.findById(targetInvoiceId);
    });
  }

  public listHeld() {
    return this.invoiceRepo.listHeld();
  }

  public applyDiscount(input: { invoice_id: number; discount_paise: number; discount_reason: string; discount_applied_by: number }) {
    const { invoice } = this.invoiceRepo.findById(input.invoice_id);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Discount can only be applied to draft or held invoices');
    }
    if (input.discount_paise < 0) {
      throw new ValidationError('Discount cannot be negative');
    }
    if (input.discount_paise > 0 && (!input.discount_reason?.trim() || !input.discount_applied_by)) {
      throw new ValidationError('Reason and applied_by are mandatory for non-zero discount');
    }
    this.invoiceRepo.applyDiscount(
      input.invoice_id,
      input.discount_paise,
      input.discount_reason || null,
      input.discount_applied_by || null
    );
    return this.getInvoice(input.invoice_id);
  }

  public deleteDraft(invoiceId: number) {
    const { invoice } = this.invoiceRepo.findById(invoiceId);
    if (invoice.status !== 'draft' && invoice.status !== 'held') {
      throw new ConflictError('Only draft or held invoices can be deleted');
    }
    // Delete payments and items first in invoice repo or cascade delete (foreign key matches)
    this.invoiceRepo.deleteInvoice(invoiceId);
    logger.info('Draft invoice deleted', { invoiceId });
  }

  public linkCustomer(invoiceId: number, customerId: number | null) {
    db.prepare('UPDATE invoices SET customer_id = ? WHERE id = ?').run(customerId, invoiceId);
    return this.getInvoice(invoiceId);
  }
}

import { container } from '../../../../core/di/container';
export const invoiceService = container.invoiceService;
export default invoiceService;
