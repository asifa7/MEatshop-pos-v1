import { db } from '../../../../core/backend/db';
import { logger } from '../../../../core/backend/logger';
import { customerIntelligenceService } from './customer_intelligence_service';
import { normalizeIndianPhone } from './customer_service';

export interface SeedGenerationResult {
  customers_created: number;
  invoices_created: number;
  invoice_items_created: number;
  payments_created: number;
  ledger_entries_created: number;
  upi_identities_created: number;
  peak_sunday_bills: number;
  days_span: number;
}

export class CustomerSeedService {
  /**
   * Generates ~150 test customers, phone collision pairs, multi-UPI identities,
   * credit ledger accounts, and 60 days of bills including a 400-bill peak Sunday.
   * All generated records are strictly flagged is_test = 1.
   */
  public generatePhase3SeedData(): SeedGenerationResult {
    logger.info('[SEED] Starting Phase 3 CRM Seed Data Generation...');

    // Fetch existing product variants for realistic cart items
    const variants = db.prepare(`
      SELECT pv.id, pv.variant_name, pv.current_rate_paise_per_unit, p.unit_type, p.name as product_name
      FROM product_variants pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.is_active = 1
      LIMIT 12
    `).all() as any[];

    if (variants.length === 0) {
      throw new Error('Cannot seed: no active product variants found in database.');
    }

    const localities = [
      'Indiranagar', 'Koramangala', 'Jayanagar', 'Whitefield', 'Malleshwaram',
      'HSR Layout', 'BTM Layout', 'JP Nagar', 'Hebbal', 'Rajajinagar',
      'Basavanagudi', 'Marathahalli', 'Electronic City', 'Frazer Town', 'Kammanahalli'
    ];

    const firstNames = [
      'Ramesh', 'Suresh', 'Mahesh', 'Ganesh', 'Venkatesh', 'Manjunath', 'Anand',
      'Praveen', 'Karthik', 'Sanjay', 'Santosh', 'Vijay', 'Deepak', 'Arun', 'Kiran',
      'Mohammed', 'Syed', 'Imran', 'Irfan', 'Farhan', 'Salman', 'Zubair', 'Nadeem',
      'John', 'David', 'Peter', 'Anthony', 'Joseph', 'George', 'Thomas',
      'Priya', 'Lakshmi', 'Sunita', 'Kavitha', 'Geetha', 'Ananya', 'Divya', 'Deepa',
      'Rajesh', 'Balaji', 'Harish', 'Naveen', 'Chetan', 'Raghu', 'Sunil', 'Pradeep'
    ];

    const lastNames = [
      'Kumar', 'Rao', 'Sharma', 'Reddy', 'Gowda', 'Shetty', 'Patil', 'Babu',
      'Khan', 'Ahmed', 'Ali', 'Hussain', 'Pasha', 'Fernandes', 'D\'Souza', 'Menon',
      'Nair', 'Iyer', 'Pillai', 'Verma', 'Singh', 'Gupta', 'Joshi', 'Hegde'
    ];

    const upiHandles = ['okaxis', 'okhdfcbank', 'okicici', 'ybl', 'paytm', 'upi', 'axl', 'ibl'];

    const insertCustomerStmt = db.prepare(`
      INSERT INTO customers (
        customer_code, name, business_name, phone, phone_normalized, whatsapp,
        category, billing_address_line1, billing_city, credit_allowed,
        credit_limit_paise, outstanding_balance_paise, advance_balance_paise,
        preferred_payment_method, whatsapp_bill_consent, marketing_consent,
        is_active, is_test, is_system, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, 'Bengaluru', ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?
      )
    `);

    const insertUpiStmt = db.prepare(`
      INSERT INTO customer_upi_identities (
        customer_id, vpa, payer_name, verified_count, auto_link, last_seen_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertInvoiceStmt = db.prepare(`
      INSERT INTO invoices (
        invoice_number, financial_year, customer_id, status, is_gst_invoice,
        subtotal_paise, cgst_paise, sgst_paise, tax_paise, total_paise,
        total_amount_paise, payment_status, created_by, created_at,
        completed_at, invoice_date, is_test
      ) VALUES (
        ?, '2026-27', ?, 'completed', 0,
        ?, 0, 0, 0, ?,
        ?, 'paid', 1, ?,
        ?, ?, 1
      )
    `);

    const insertItemStmt = db.prepare(`
      INSERT INTO invoice_items (
        invoice_id, product_variant_id, quantity_grams, quantity_units,
        rate_paise_snapshot, line_subtotal_paise, line_total_paise, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPaymentStmt = db.prepare(`
      INSERT INTO payments (
        invoice_id, method, amount_paise, reference_number, received_at
      ) VALUES (?, ?, ?, ?, ?)
    `);

    const insertLedgerStmt = db.prepare(`
      INSERT INTO customer_ledger (
        customer_id, entry_date, ref_type, ref_id, invoice_number,
        description, debit_paise, credit_paise, running_balance_paise, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);

    let createdCustomers = 0;
    let createdInvoices = 0;
    let createdItems = 0;
    let createdPayments = 0;
    let createdLedger = 0;
    let createdUpi = 0;
    let peakSundayBills = 0;

    const seedTransaction = db.transaction(() => {
      // 1. Generate ~150 Customers
      const customerIds: number[] = [];
      const customerRecords: Array<{
        id: number;
        name: string;
        phone: string;
        creditAllowed: boolean;
        marketingConsent: boolean;
      }> = [];

      // Known collision suffixes to test disambiguation
      const collisionSuffixes = ['1234', '9876', '4321', '1122', '3344'];

      for (let i = 1; i <= 150; i++) {
        const fn = firstNames[(i * 7) % firstNames.length];
        const ln = lastNames[(i * 11) % lastNames.length];
        const name = `${fn} ${ln}`;
        const locality = localities[i % localities.length];
        const code = `TEST-CUST-${String(i).padStart(4, '0')}`;

        // Generate phone with deliberate collision clusters
        let phone: string;
        if (i <= 10) {
          // 5 pairs sharing last 4 digits
          const suffixIndex = (i - 1) % 5;
          const prefix = i <= 5 ? '984500' : '988600';
          phone = `${prefix}${collisionSuffixes[suffixIndex]}`;
        } else {
          phone = `9${String(800000000 + i * 3791).slice(0, 9)}`;
        }
        const phoneNorm = normalizeIndianPhone(phone) || phone;

        // Attributes
        const isCredit = i % 5 === 0; // 30 credit customers
        const creditLimitPaise = isCredit ? (10000 + (i % 5) * 10000) * 100 : 0;
        const marketingConsent = i % 3 !== 0 ? 1 : 0; // ~66% opted in
        const whatsappConsent = i % 4 !== 0 ? 1 : 0;  // ~75% opted in
        const preferredPayment = isCredit ? 'credit' : (i % 2 === 0 ? 'upi' : 'cash');
        const category = isCredit ? (i % 2 === 0 ? 'Hotel' : 'Restaurant') : 'Retail';
        const businessName = isCredit ? `${fn}'s Kitchen & Catering` : null;

        const custCreatedAt = new Date(Date.now() - 65 * 24 * 60 * 60 * 1000).toISOString();

        const res = insertCustomerStmt.run(
          code, name, businessName, phone, phoneNorm, phone,
          category, `${locality} Main Road`, creditLimitPaise > 0 ? 1 : 0,
          creditLimitPaise, 0, 0,
          preferredPayment, whatsappConsent, marketingConsent,
          custCreatedAt, custCreatedAt
        );

        const newCustId = Number(res.lastInsertRowid);
        customerIds.push(newCustId);
        customerRecords.push({
          id: newCustId,
          name,
          phone,
          creditAllowed: isCredit,
          marketingConsent: marketingConsent === 1,
        });
        createdCustomers++;

        // Add multi-UPI identities for 20 customers
        if (i <= 20) {
          const cleanName = name.toLowerCase().replace(/[^a-z]/g, '');
          const handle1 = upiHandles[i % upiHandles.length];
          const vpa1 = `${cleanName}@${handle1}`;
          insertUpiStmt.run(newCustId, vpa1, name, 3, 1, new Date().toISOString(), new Date().toISOString());
          createdUpi++;

          if (i <= 10) {
            // Second UPI alias
            const handle2 = upiHandles[(i + 3) % upiHandles.length];
            const vpa2 = `${phone}@${handle2}`;
            insertUpiStmt.run(newCustId, vpa2, name, 2, 0, new Date().toISOString(), new Date().toISOString());
            createdUpi++;
          }
        }
      }

      // 2. Generate 60 Days of Historical Invoices
      // 60 days ago to today
      const today = new Date();
      const peakSundayDaysAgo = 14; // 2 weeks ago Sunday was the 400-bill peak day

      for (let dayOffset = 60; dayOffset >= 1; dayOffset--) {
        const targetDate = new Date(today.getTime() - dayOffset * 24 * 60 * 60 * 1000);
        const dayOfWeek = targetDate.getDay(); // 0 is Sunday
        const dateStr = targetDate.toISOString().slice(0, 10);

        const isPeakSunday = (dayOffset === peakSundayDaysAgo) || (dayOfWeek === 0 && dayOffset === 21);
        const billsForToday = isPeakSunday ? 400 : (dayOfWeek === 0 ? 80 : 18);

        if (isPeakSunday) {
          peakSundayBills = billsForToday;
        }

        for (let seq = 1; seq <= billsForToday; seq++) {
          const invNumber = `TEST-${seq}_${dateStr}`;
          
          // Customer selection:
          // In peak Sunday, 70% linked to customers, 30% anonymous walk-in
          const isAnonymous = isPeakSunday ? (seq % 3 === 0) : (seq % 5 === 0);
          const custIdx = (seq * 13 + dayOffset * 7) % customerRecords.length;
          const assignedCustomer = isAnonymous ? null : customerRecords[custIdx];

          // Hours distribution: Morning rush 8 AM to 1 PM, evening rush 5 PM to 8 PM
          const hour = seq % 2 === 0 ? 8 + (seq % 5) : 17 + (seq % 4);
          const minute = (seq * 3) % 60;
          const second = (seq * 7) % 60;
          const billTime = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}Z`;

          // Generate 1 to 3 items per invoice
          const numItems = (seq % 3) + 1;
          let invoiceTotalPaise = 0;
          const itemPayloads: Array<{
            variantId: number;
            grams: number | null;
            units: number | null;
            rate: number;
            lineTotal: number;
          }> = [];

          for (let it = 0; it < numItems; it++) {
            const v = variants[(seq + it * 3) % variants.length];
            const isWeight = v.unit_type === 'weight' || v.unit_type === 'live_dual' || !v.unit_type;
            const rate = v.current_rate_paise_per_unit || 25000;

            if (isWeight) {
              const grams = [750, 1000, 1250, 1500, 2000][(seq + it) % 5];
              const lineTotal = Math.round((grams / 1000) * rate);
              invoiceTotalPaise += lineTotal;
              itemPayloads.push({ variantId: v.id, grams, units: null, rate, lineTotal });
            } else {
              const units = ((seq + it) % 4) + 1;
              const lineTotal = units * rate;
              invoiceTotalPaise += lineTotal;
              itemPayloads.push({ variantId: v.id, grams: null, units, rate, lineTotal });
            }
          }

          // Insert invoice
          const invRes = insertInvoiceStmt.run(
            invNumber, assignedCustomer ? assignedCustomer.id : null,
            invoiceTotalPaise, invoiceTotalPaise, invoiceTotalPaise,
            billTime, billTime, dateStr
          );
          const invId = Number(invRes.lastInsertRowid);
          createdInvoices++;

          // Insert items
          for (const item of itemPayloads) {
            insertItemStmt.run(
              invId, item.variantId, item.grams, item.units,
              item.rate, item.lineTotal, item.lineTotal, billTime
            );
            createdItems++;
          }

          // Payment mode
          const payMethod = assignedCustomer?.creditAllowed && (seq % 4 === 0)
            ? 'credit'
            : (seq % 2 === 0 ? 'upi' : 'cash');

          if (payMethod === 'credit' && assignedCustomer) {
            // Log in credit ledger
            insertLedgerStmt.run(
              assignedCustomer.id, dateStr, 'invoice', invId, invNumber,
              `Sale Invoice #${invNumber}`, invoiceTotalPaise, 0, invoiceTotalPaise, billTime
            );
            createdLedger++;

            // Periodically log credit payments to maintain healthy and realistic ledger balance
            if (seq % 2 === 0) {
              const payoffPaise = Math.round(invoiceTotalPaise * 0.85);
              const payTime = new Date(new Date(billTime).getTime() + 4 * 24 * 60 * 60 * 1000).toISOString();
              insertLedgerStmt.run(
                assignedCustomer.id, dateStr, 'payment', null, null,
                'Customer Payment Received (UPI/Bank)', 0, payoffPaise, invoiceTotalPaise - payoffPaise, payTime
              );
              createdLedger++;
            }
          } else {
            insertPaymentStmt.run(
              invId, payMethod, invoiceTotalPaise,
              payMethod === 'upi' ? `UPI-${dateStr.replace(/-/g, '')}-${seq}` : null,
              billTime
            );
            createdPayments++;
          }
        }
      }

      // Re-synchronize balances for credit customers
      for (const cust of customerRecords) {
        if (cust.creditAllowed) {
          const balRow = db.prepare(`
            SELECT 
              COALESCE(SUM(debit_paise), 0) - COALESCE(SUM(credit_paise), 0) as balance_paise
            FROM customer_ledger WHERE customer_id = ?
          `).get(cust.id) as any;

          const bal = Math.max(0, balRow?.balance_paise || 0);
          db.prepare('UPDATE customers SET outstanding_balance_paise = ? WHERE id = ?').run(bal, cust.id);
        }
      }
    });

    seedTransaction();

    logger.info('[SEED] Phase 3 Seed Generation completed successfully!', {
      createdCustomers,
      createdInvoices,
      createdItems,
      createdPayments,
      createdLedger,
      createdUpi,
    });

    return {
      customers_created: createdCustomers,
      invoices_created: createdInvoices,
      invoice_items_created: createdItems,
      payments_created: createdPayments,
      ledger_entries_created: createdLedger,
      upi_identities_created: createdUpi,
      peak_sunday_bills: peakSundayBills,
      days_span: 60,
    };
  }

  /**
   * Safe, complete and idempotent removal of all Phase 3 test seed data.
   */
  public clearTestSeedData(): {
    deleted_customers: number;
    deleted_invoices: number;
    deleted_items: number;
    deleted_payments: number;
    deleted_ledger: number;
    deleted_upi: number;
  } {
    logger.info('[SEED] Cleaning up all test data (is_test = 1)...');

    let deletedCusts = 0;
    let deletedInvs = 0;
    let deletedItems = 0;
    let deletedPays = 0;
    let deletedLedger = 0;
    let deletedUpi = 0;

    const cleanupTx = db.transaction(() => {
      // Find all Phase 3 seeded test invoices
      const testInvoices = db.prepare("SELECT id FROM invoices WHERE invoice_number LIKE 'TEST-%'").all() as { id: number }[];
      const invIds = testInvoices.map(i => i.id);

      if (invIds.length > 0) {
        // Chunk deletion to stay well under SQLite parameter limits
        const chunkSize = 400;
        for (let i = 0; i < invIds.length; i += chunkSize) {
          const chunk = invIds.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => '?').join(',');

          const delItemsRes = db.prepare(`DELETE FROM invoice_items WHERE invoice_id IN (${placeholders})`).run(...chunk);
          deletedItems += delItemsRes.changes;

          const delPaysRes = db.prepare(`DELETE FROM payments WHERE invoice_id IN (${placeholders})`).run(...chunk);
          deletedPays += delPaysRes.changes;
        }

        const delInvsRes = db.prepare("DELETE FROM invoices WHERE invoice_number LIKE 'TEST-%'").run();
        deletedInvs = delInvsRes.changes;
      }

      // Find all Phase 3 seeded test customers
      const testCustomers = db.prepare("SELECT id FROM customers WHERE customer_code LIKE 'TEST-%'").all() as { id: number }[];
      const custIds = testCustomers.map(c => c.id);

      if (custIds.length > 0) {
        const chunkSize = 400;
        for (let i = 0; i < custIds.length; i += chunkSize) {
          const chunk = custIds.slice(i, i + chunkSize);
          const placeholders = chunk.map(() => '?').join(',');

          const delLedgerRes = db.prepare(`DELETE FROM customer_ledger WHERE customer_id IN (${placeholders})`).run(...chunk);
          deletedLedger += delLedgerRes.changes;

          const delUpiRes = db.prepare(`DELETE FROM customer_upi_identities WHERE customer_id IN (${placeholders})`).run(...chunk);
          deletedUpi += delUpiRes.changes;

          db.prepare(`DELETE FROM customer_analytics_cache WHERE customer_id IN (${placeholders})`).run(...chunk);
        }

        const delCustRes = db.prepare("DELETE FROM customers WHERE customer_code LIKE 'TEST-%'").run();
        deletedCusts = delCustRes.changes;
      }
    });

    cleanupTx();

    logger.info('[SEED] Test cleanup finished cleanly.', {
      deleted_customers: deletedCusts,
      deleted_invoices: deletedInvs,
      deleted_items: deletedItems,
      deleted_payments: deletedPays,
      deleted_ledger: deletedLedger,
      deleted_upi: deletedUpi,
    });

    return {
      deleted_customers: deletedCusts,
      deleted_invoices: deletedInvs,
      deleted_items: deletedItems,
      deleted_payments: deletedPays,
      deleted_ledger: deletedLedger,
      deleted_upi: deletedUpi,
    };
  }
}

export const customerSeedService = new CustomerSeedService();
