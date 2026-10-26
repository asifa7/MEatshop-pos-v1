import {
  IInvoiceRepository,
  IPurchaseRepository,
} from '../../../../core/database/repositories/repository_interfaces';
import {
  ReportQueryOptions,
  ReportQueryResult,
  ReportDefinition,
  ReportFilterOptions,
  ReportExportRequest,
} from '../../types/reports.types';
import { reportEngine } from '../engine/report_engine';
import { getAllReportDefinitions, getReportDefinition } from '../engine/report_definitions';
import { savedReportsService } from './saved_reports_service';
import { reportAlertsService } from './report_alerts_service';
import { assertValidDateRange } from '../../../../core/utils/date_validation';
import { db } from '../../../../core/backend/db';
import { roundQty, formatQty, formatMoney } from '../../../../core/shared/math';

export interface SalesSummary {
  totalInvoices: number;
  totalRevenuePaise: number;
  totalTaxPaise: number;
  subtotalPaise: number;
  gstRevenuePaise: number;
  nonGstRevenuePaise: number;
  totalDiscountPaise: number;
  paymentSplit?: {
    cashPaise: number;
    upiPaise: number;
    cardPaise: number;
    creditPaise: number;
  };
}

export interface ProfitSummary {
  totalSalesRevenuePaise: number;
  totalCostPaise: number;
  grossProfitPaise: number;
  profitMarginPercent: number;
}

export interface CategorySales {
  category: string;
  revenuePaise: number;
  grams: number;
  units: number;
}

export type CoreReportId = 'sales' | 'purchases' | 'delivery' | 'inventory';

export class ReportsService {
  constructor(
    private invoiceRepo: IInvoiceRepository,
    private purchaseRepo: IPurchaseRepository
  ) {}

  // 1. Core Report Engine Methods
  public runReport(options: ReportQueryOptions): ReportQueryResult {
    const id = (options?.reportId || '').toLowerCase();
    if (
      id === 'sales' ||
      id === 'purchases' ||
      id === 'delivery' ||
      id === 'inventory' ||
      id === 'simple_sales' ||
      id === 'simple_purchases' ||
      id === 'simple_delivery' ||
      id === 'simple_inventory'
    ) {
      const normalizedId = id.replace(/^simple_/, '') as CoreReportId;
      return this.runModularCoreReport(normalizedId, options);
    }
    return reportEngine.runReport(options);
  }

  private getInvoiceItemsData(invoiceIds: number[]): {
    summaryMap: Map<number, string>;
    detailsMap: Map<number, any[]>;
  } {
    const summaryMap = new Map<number, string>();
    const detailsMap = new Map<number, any[]>();
    if (!invoiceIds.length) return { summaryMap, detailsMap };
    try {
      const placeholders = invoiceIds.map(() => '?').join(',');
      const rows = db
        .prepare(
          `SELECT
             ii.invoice_id,
             ii.id as item_id,
             p.id as product_id,
             p.name as product_name,
             COALESCE(p.category, 'Uncategorized') as category,
             pv.id as variant_id,
             pv.variant_name,
             COALESCE(p.unit_type, 'weight') as unit_type,
             COALESCE(ii.quantity_grams, 0) as quantity_grams,
             COALESCE(ii.quantity_units, 0) as quantity_units,
             COALESCE(ii.rate_paise_snapshot, pv.current_rate_paise_per_unit, 0) as unit_price_paise,
             COALESCE(ii.line_total_paise, 0) as line_total_paise
           FROM invoice_items ii
           JOIN product_variants pv ON ii.product_variant_id = pv.id
           JOIN products p ON pv.product_id = p.id
           WHERE ii.invoice_id IN (${placeholders})
           ORDER BY ii.id ASC`
        )
        .all(...invoiceIds) as any[];

      for (const r of rows) {
        const invId = Number(r.invoice_id);
        const name =
          r.variant_name &&
          r.variant_name.toLowerCase() !== 'standard' &&
          r.variant_name.toLowerCase() !== r.product_name?.toLowerCase()
            ? `${r.product_name} (${r.variant_name})`
            : r.product_name;
        const isWeight = r.unit_type === 'weight' || r.unit_type === 'live_dual';
        const qty = isWeight
          ? roundQty(Number(r.quantity_grams || 0) / 1000, 3)
          : roundQty(Number(r.quantity_units || 0), 0);
        const unit = isWeight ? 'kg' : 'pcs';
        const formattedQty = formatQty(qty, { unit, maxDecimals: isWeight ? 3 : 0 });
        const lineTotal = Number(r.line_total_paise || 0) || Math.round(qty * Number(r.unit_price_paise || 0));

        const itemObj = {
          item_id: r.item_id,
          product_id: r.product_id,
          product_name: r.product_name,
          variant_name: r.variant_name || '',
          display_name: name,
          category: r.category || 'Uncategorized',
          unit,
          quantity: qty,
          formatted_qty: formattedQty,
          unit_price_paise: Number(r.unit_price_paise || 0),
          line_total_paise: lineTotal,
        };

        if (!detailsMap.has(invId)) detailsMap.set(invId, []);
        detailsMap.get(invId)!.push(itemObj);
      }

      detailsMap.forEach((items, invId) => {
        summaryMap.set(
          invId,
          items.map((it) => `${it.display_name} ${it.formatted_qty}`).join(', ')
        );
      });
    } catch {
      // Ignore non-fatal item lookup errors
    }
    return { summaryMap, detailsMap };
  }

  public runModularCoreReport(
    reportId: CoreReportId,
    options: ReportQueryOptions
  ): ReportQueryResult {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = options.filters?.startDate || today;
    const endDate = options.filters?.endDate || today;
    const search = (options.filters?.searchTerm || '').trim().toLowerCase();

    // High-powered filter options
    const targetCategory = (
      options.filters?.category && options.filters.category !== 'all' ? options.filters.category : ''
    ).trim().toLowerCase();
    const targetItem = (options.filters?.itemFilter || '').trim().toLowerCase();
    const itemFilterTerm = targetItem || targetCategory;
    const paymentModeFilter = (options.filters?.paymentMode || 'all').trim().toLowerCase();

    const activeFilterChips = [
      { id: 'date', key: 'date', label: 'Period', value: `${startDate} → ${endDate}` },
    ];
    if (itemFilterTerm) {
      activeFilterChips.push({
        id: 'item',
        key: 'item',
        label: 'Item / Category',
        value: itemFilterTerm.toUpperCase(),
      });
    }
    if (paymentModeFilter !== 'all') {
      activeFilterChips.push({
        id: 'mode',
        key: 'mode',
        label: 'Payment Mode',
        value: paymentModeFilter.toUpperCase(),
      });
    }

    const baseMeta = {
      description: `${reportId.toUpperCase()} Core Operational Report`,
      generatedAt: new Date().toISOString(),
      generatedBy: 'System Cashier',
      shopInfo: {
        name: 'Fresh Meat & Poultry POS',
        address: 'Retail Counter',
        phone: '',
        gstin: '',
        currency: 'INR',
      },
      filterSummary: {
        startDate,
        endDate,
        activeFilterChips,
      },
      dataQualityWarnings: [],
      kpiCards: [],
    };

    if (reportId === 'sales') {
      const rawRows = db
        .prepare(
          `SELECT
             inv.id as invoice_id,
             inv.invoice_number,
             COALESCE(inv.completed_at, inv.created_at) as bill_timestamp,
             COALESCE(c.name, 'Walk-in Customer') as customer_name,
             COALESCE(c.phone, '') as customer_phone,
             inv.payment_status,
             inv.total_paise,
             COALESCE(pmt.methods, CASE WHEN inv.payment_status = 'unpaid' THEN 'CREDIT' ELSE 'CASH' END) as payment_mode,
             COALESCE(pmt.cash_paise, 0) as cash_paise,
             COALESCE(pmt.upi_paise, 0) as upi_paise,
             COALESCE(pmt.card_paise, 0) as card_paise
           FROM invoices inv
           LEFT JOIN customers c ON inv.customer_id = c.id
           LEFT JOIN (
             SELECT
               invoice_id,
               GROUP_CONCAT(DISTINCT UPPER(method)) as methods,
               SUM(CASE WHEN LOWER(method) = 'cash' THEN amount_paise ELSE 0 END) as cash_paise,
               SUM(CASE WHEN LOWER(method) IN ('upi', 'paytm', 'gpay', 'google pay', 'googlepay', 'phonepe', 'qr') THEN amount_paise ELSE 0 END) as upi_paise,
               SUM(CASE WHEN LOWER(method) IN ('card', 'pos', 'debit card', 'credit card') THEN amount_paise ELSE 0 END) as card_paise
             FROM payments
             GROUP BY invoice_id
           ) pmt ON inv.id = pmt.invoice_id
           WHERE inv.status = 'completed'
             AND SUBSTR(COALESCE(inv.completed_at, inv.created_at), 1, 10) >= ?
             AND SUBSTR(COALESCE(inv.completed_at, inv.created_at), 1, 10) <= ?
           ORDER BY COALESCE(inv.completed_at, inv.created_at) DESC, inv.id DESC`
        )
        .all(startDate, endDate) as any[];

      const { summaryMap, detailsMap } = this.getInvoiceItemsData(
        rawRows.map((r) => Number(r.invoice_id))
      );

      let rows = rawRows.map((r) => {
        const billNo =
          (r.invoice_number || '').split('_')[0] || r.invoice_number || `#${r.invoice_id}`;
        const dt = r.bill_timestamp ? new Date(r.bill_timestamp) : null;
        const timeStr =
          dt && !isNaN(dt.getTime())
            ? `${r.bill_timestamp.slice(0, 10)} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : String(r.bill_timestamp || '-');
        const itemsList = detailsMap.get(Number(r.invoice_id)) || [];
        const itemsSummary = summaryMap.get(Number(r.invoice_id)) || 'Standard Bill Items';
        const totalPaise = Number(r.total_paise || 0);
        const rawCash = Number(r.cash_paise || 0);
        const resolvedCash =
          rawCash > 0
            ? rawCash
            : String(r.payment_mode || '').toUpperCase().includes('CASH') && r.payment_status === 'paid'
            ? totalPaise
            : 0;

        // If an item/category filter is specified, check matching items
        const matchingItems = itemFilterTerm
          ? itemsList.filter(
              (it) =>
                it.category.toLowerCase().includes(itemFilterTerm) ||
                it.product_name.toLowerCase().includes(itemFilterTerm) ||
                it.variant_name.toLowerCase().includes(itemFilterTerm) ||
                it.display_name.toLowerCase().includes(itemFilterTerm)
            )
          : itemsList;

        const filteredQty = roundQty(
          matchingItems.reduce((a, it) => a + it.quantity, 0),
          matchingItems[0]?.unit === 'kg' ? 3 : 0
        );
        const filteredRevenuePaise = matchingItems.reduce((a, it) => a + it.line_total_paise, 0);
        const filteredUnit = matchingItems[0]?.unit || 'kg';
        const filteredSummary =
          matchingItems.length > 0
            ? matchingItems.map((it) => `${it.display_name} ${it.formatted_qty}`).join(', ')
            : '';

        return {
          _row_id: r.invoice_id,
          bill_no: billNo,
          time: timeStr,
          customer: r.customer_name || 'Walk-in Customer',
          customer_phone: r.customer_phone || '',
          mode: String(r.payment_mode || 'CASH').toUpperCase(),
          payment_status: r.payment_status || 'paid',
          items: itemFilterTerm && filteredSummary ? filteredSummary : itemsSummary,
          items_detail: itemsList,
          matching_items: matchingItems,
          total_paise: totalPaise,
          total: formatMoney(totalPaise),
          cash_paise: resolvedCash,
          upi_paise: Number(r.upi_paise || 0),
          card_paise: Number(r.card_paise || 0),
          filtered_item_qty: filteredQty,
          filtered_item_unit: filteredUnit,
          filtered_item_revenue_paise: itemFilterTerm ? filteredRevenuePaise : totalPaise,
        };
      });

      // 1. Filter by Item / Category (e.g. Chicken, Mutton, Eggs)
      if (itemFilterTerm) {
        rows = rows.filter((r) => r.matching_items.length > 0);
      }

      // 2. Filter by Payment Mode
      if (paymentModeFilter && paymentModeFilter !== 'all') {
        if (paymentModeFilter === 'cash') {
          rows = rows.filter(
            (r) => r.cash_paise > 0 || String(r.mode).toUpperCase().includes('CASH')
          );
        } else if (paymentModeFilter === 'upi') {
          rows = rows.filter(
            (r) =>
              r.upi_paise > 0 ||
              r.card_paise > 0 ||
              ['UPI', 'GPAY', 'PAYTM', 'PHONEPE', 'QR', 'CARD'].some((m) =>
                String(r.mode).toUpperCase().includes(m)
              )
          );
        } else if (paymentModeFilter === 'credit') {
          rows = rows.filter(
            (r) =>
              r.payment_status === 'unpaid' ||
              r.payment_status === 'partial' ||
              String(r.mode).toUpperCase().includes('CREDIT')
          );
        }
      }

      // 3. Search query filter
      if (search) {
        rows = rows.filter(
          (r) =>
            r.bill_no.toLowerCase().includes(search) ||
            r.customer.toLowerCase().includes(search) ||
            r.customer_phone.toLowerCase().includes(search) ||
            r.mode.toLowerCase().includes(search) ||
            r.items.toLowerCase().includes(search) ||
            r.items_detail.some((it: any) =>
              it.display_name.toLowerCase().includes(search) ||
              it.category.toLowerCase().includes(search)
            )
        );
      }

      // 4. Construct Product-wise Sales Breakdown aggregation
      const productAggMap = new Map<
        string,
        {
          product_name: string;
          variant_name: string;
          display_name: string;
          category: string;
          unit: string;
          total_qty: number;
          total_revenue_paise: number;
          invoices_set: Set<number>;
        }
      >();

      for (const row of rows) {
        const relevantItems = itemFilterTerm
          ? (row.matching_items || [])
          : (row.items_detail || []);

        for (const it of relevantItems) {
          const key = `${it.product_name}___${it.variant_name || 'standard'}`;
          if (!productAggMap.has(key)) {
            productAggMap.set(key, {
              product_name: it.product_name,
              variant_name: it.variant_name,
              display_name: it.display_name,
              category: it.category,
              unit: it.unit,
              total_qty: 0,
              total_revenue_paise: 0,
              invoices_set: new Set<number>(),
            });
          }
          const agg = productAggMap.get(key)!;
          agg.total_qty = roundQty(agg.total_qty + it.quantity, it.unit === 'kg' ? 3 : 0);
          agg.total_revenue_paise += it.line_total_paise;
          agg.invoices_set.add(row._row_id);
        }
      }

      const productBreakdown = Array.from(productAggMap.values())
        .map((p) => {
          const avgRate = p.total_qty > 0 ? Math.round(p.total_revenue_paise / p.total_qty) : 0;
          return {
            key: `${p.product_name}-${p.variant_name}`,
            product_name: p.product_name,
            variant_name: p.variant_name,
            display_name: p.display_name,
            category: p.category,
            unit: p.unit,
            total_qty: p.total_qty,
            formatted_qty: formatQty(p.total_qty, {
              unit: p.unit,
              maxDecimals: p.unit === 'kg' ? 3 : 0,
            }),
            total_revenue_paise: p.total_revenue_paise,
            avg_rate_paise: avgRate,
            invoice_count: p.invoices_set.size,
          };
        })
        .sort((a, b) => b.total_revenue_paise - a.total_revenue_paise);

      // 5. Payment Tender Breakdown
      const paymentBreakdown = [
        {
          mode: 'CASH',
          label: 'Cash Collections',
          amount_paise: rows.reduce((acc, r) => acc + (r.cash_paise || 0), 0),
          count: rows.filter((r) => (r.cash_paise || 0) > 0 || String(r.mode).includes('CASH')).length,
        },
        {
          mode: 'UPI',
          label: 'UPI / Digital / QR',
          amount_paise: rows.reduce((acc, r) => acc + (r.upi_paise || 0), 0),
          count: rows.filter(
            (r) =>
              (r.upi_paise || 0) > 0 ||
              ['UPI', 'GPAY', 'PAYTM', 'PHONEPE', 'QR'].some((m) =>
                String(r.mode).toUpperCase().includes(m)
              )
          ).length,
        },
        {
          mode: 'CARD',
          label: 'Debit / Credit Card',
          amount_paise: rows.reduce((acc, r) => acc + (r.card_paise || 0), 0),
          count: rows.filter(
            (r) => (r.card_paise || 0) > 0 || String(r.mode).toUpperCase().includes('CARD')
          ).length,
        },
        {
          mode: 'CREDIT',
          label: 'Credit (Udhaar)',
          amount_paise: rows
            .filter(
              (r) =>
                r.payment_status === 'unpaid' ||
                r.payment_status === 'partial' ||
                String(r.mode).toUpperCase().includes('CREDIT')
            )
            .reduce((acc, r) => acc + r.total_paise, 0),
          count: rows.filter(
            (r) =>
              r.payment_status === 'unpaid' ||
              r.payment_status === 'partial' ||
              String(r.mode).toUpperCase().includes('CREDIT')
          ).length,
        },
      ];

      const totalSalesPaise = rows.reduce((acc, r) => acc + r.total_paise, 0);
      const cashTotalPaise = rows.reduce((acc, r) => acc + r.cash_paise, 0);
      const digitalTotalPaise = rows.reduce((acc, r) => acc + r.upi_paise + r.card_paise, 0);
      const filteredItemRevenuePaise = rows.reduce(
        (acc, r) => acc + (r.filtered_item_revenue_paise || r.total_paise),
        0
      );
      const filteredItemTotalQty = roundQty(
        rows.reduce((acc, r) => acc + (r.filtered_item_qty || 0), 0)
      );
      const filteredItemUnit = rows[0]?.filtered_item_unit || 'kg';

      return {
        ...baseMeta,
        reportId: 'sales',
        reportName: 'Sales Report',
        columns: [
          { id: 'bill_no', name: 'Bill No', type: 'string', isMeasure: false },
          { id: 'time', name: 'Time', type: 'string', isMeasure: false },
          { id: 'customer', name: 'Customer', type: 'string', isMeasure: false },
          { id: 'mode', name: 'Mode', type: 'string', isMeasure: false },
          { id: 'items', name: 'Items', type: 'string', isMeasure: false },
          { id: 'total_paise', name: 'Total', type: 'currency', isMeasure: true },
        ],
        rows,
        totalRows: rows.length,
        page: 1,
        pageSize: rows.length || 50,
        totalPages: 1,
        productBreakdown,
        paymentBreakdown,
        grandTotals: {
          total_paise: totalSalesPaise,
          cash_paise: cashTotalPaise,
          digital_paise: digitalTotalPaise,
          filtered_item_name: itemFilterTerm ? itemFilterTerm.toUpperCase() : 'ALL',
          filtered_item_qty: filteredItemTotalQty,
          filtered_item_formatted_qty: formatQty(filteredItemTotalQty, {
            unit: filteredItemUnit,
            maxDecimals: filteredItemUnit === 'kg' ? 3 : 0,
          }),
          filtered_item_revenue_paise: filteredItemRevenuePaise,
          filtered_item_unit: filteredItemUnit,
          total_product_revenue_paise: productBreakdown.reduce(
            (a, p) => a + p.total_revenue_paise,
            0
          ),
          total_product_qty: productBreakdown.reduce((a, p) => a + p.total_qty, 0),
          count: rows.length,
        },
      };
    }

    if (reportId === 'purchases') {
      const piRows = db
        .prepare(
          `SELECT
             pi.id,
             COALESCE(pi.invoice_date, SUBSTR(pi.created_at, 1, 10)) as purchase_date,
             COALESCE(s.company_name, s.name, 'Supplier') as supplier_name,
             COALESCE(NULLIF(pi.supplier_invoice_number, ''), NULLIF(pi.purchase_ref_number, ''), pi.invoice_number) as ref_no,
             COALESCE(pi.total_amount_paise, 0) as total_paise,
             COALESCE(NULLIF(pi.paid_amount_paise, 0), MAX(0, COALESCE(pi.total_amount_paise, 0) - COALESCE(pi.outstanding_amount_paise, 0))) as paid_paise,
             COALESCE(pi.outstanding_amount_paise, 0) as balance_paise
           FROM purchase_invoices pi
           LEFT JOIN suppliers s ON pi.supplier_id = s.id
           WHERE COALESCE(pi.status, 'approved') != 'rejected'
             AND SUBSTR(COALESCE(pi.invoice_date, pi.created_at), 1, 10) >= ?
             AND SUBSTR(COALESCE(pi.invoice_date, pi.created_at), 1, 10) <= ?
           ORDER BY COALESCE(pi.invoice_date, pi.created_at) DESC, pi.id DESC`
        )
        .all(startDate, endDate) as any[];

      let sourceRows = piRows;
      if (sourceRows.length === 0) {
        // Fallback to legacy purchases table if no purchase_invoices rows exist in period
        sourceRows = db
          .prepare(
            `SELECT
               pur.id,
               SUBSTR(pur.created_at, 1, 10) as purchase_date,
               COALESCE(s.company_name, s.name, 'Supplier') as supplier_name,
               'PUR-' || pur.id as ref_no,
               COALESCE(pur.cost_paise, 0) as total_paise,
               COALESCE(pur.cost_paise, 0) as paid_paise,
               0 as balance_paise
             FROM purchases pur
             LEFT JOIN suppliers s ON pur.supplier_id = s.id
             WHERE SUBSTR(pur.created_at, 1, 10) >= ?
               AND SUBSTR(pur.created_at, 1, 10) <= ?
             ORDER BY pur.created_at DESC, pur.id DESC`
          )
          .all(startDate, endDate) as any[];
      }

      let rows = sourceRows.map((r) => ({
        _row_id: r.id,
        date: r.purchase_date || '-',
        supplier: r.supplier_name || 'Supplier',
        ref: r.ref_no || `PUR-${r.id}`,
        total_paise: Number(r.total_paise || 0),
        paid_paise: Number(r.paid_paise || 0),
        balance_paise: Number(r.balance_paise || 0),
      }));

      if (itemFilterTerm) {
        rows = rows.filter(
          (r) =>
            r.supplier.toLowerCase().includes(itemFilterTerm) ||
            r.ref.toLowerCase().includes(itemFilterTerm)
        );
      }
      if (search) {
        rows = rows.filter(
          (r) =>
            r.date.toLowerCase().includes(search) ||
            r.supplier.toLowerCase().includes(search) ||
            r.ref.toLowerCase().includes(search)
        );
      }

      const totalPaise = rows.reduce((a, r) => a + r.total_paise, 0);
      const paidPaise = rows.reduce((a, r) => a + r.paid_paise, 0);
      const balancePaise = rows.reduce((a, r) => a + r.balance_paise, 0);

      return {
        ...baseMeta,
        reportId: 'purchases',
        reportName: 'Purchases Report',
        columns: [
          { id: 'date', name: 'Date', type: 'date', isMeasure: false },
          { id: 'supplier', name: 'Supplier', type: 'string', isMeasure: false },
          { id: 'ref', name: 'Ref', type: 'string', isMeasure: false },
          { id: 'total_paise', name: 'Total', type: 'currency', isMeasure: true },
          { id: 'paid_paise', name: 'Paid', type: 'currency', isMeasure: true },
          { id: 'balance_paise', name: 'Balance', type: 'currency', isMeasure: true },
        ],
        rows,
        totalRows: rows.length,
        page: 1,
        pageSize: rows.length || 50,
        totalPages: 1,
        grandTotals: {
          total_paise: totalPaise,
          paid_paise: paidPaise,
          balance_paise: balancePaise,
          count: rows.length,
        },
      };
    }

    if (reportId === 'delivery') {
      const delRows = db
        .prepare(
          `SELECT
             d.id,
             COALESCE(NULLIF(d.requested_date, ''), SUBSTR(d.created_at, 1, 10)) as del_date,
             COALESCE(inv.invoice_number, d.delivery_number, '#' || d.id) as bill_no,
             COALESCE(NULLIF(d.customer_name, ''), c.name, 'Walk-in Customer') as customer_name,
             d.status,
             d.delivered,
             d.payment_received,
             d.payment_status,
             COALESCE(d.total_paise, inv.total_paise, 0) as amount_paise,
             d.cod_collected_paise,
             d.amount_paid_now_paise
           FROM deliveries d
           LEFT JOIN invoices inv ON d.invoice_id = inv.id
           LEFT JOIN customers c ON d.customer_id = c.id
           WHERE SUBSTR(COALESCE(NULLIF(d.requested_date, ''), d.created_at), 1, 10) >= ?
             AND SUBSTR(COALESCE(NULLIF(d.requested_date, ''), d.created_at), 1, 10) <= ?
           ORDER BY COALESCE(NULLIF(d.requested_date, ''), DATE(d.created_at)) DESC, d.id DESC`
        )
        .all(startDate, endDate) as any[];

      let rows = delRows.map((r) => {
        const isDelivered = Boolean(r.delivered === 1 || r.status === 'delivered');
        const isPaid = Boolean(r.payment_received === 1 || r.payment_status === 'paid');
        const statusLabel =
          isDelivered && isPaid
            ? 'Closed'
            : isDelivered
            ? 'Delivered (Payment Pending)'
            : r.status === 'out_for_delivery'
            ? 'Out for Delivery'
            : 'Open';
        const amountPaise = Number(r.amount_paise || 0);
        const collectedPaise = isPaid
          ? amountPaise
          : Number(r.cod_collected_paise || r.amount_paid_now_paise || 0);

        return {
          _row_id: r.id,
          date: r.del_date || '-',
          bill: String(r.bill_no || `#${r.id}`).split('_')[0],
          customer: r.customer_name || 'Walk-in Customer',
          status: statusLabel,
          amount_paise: amountPaise,
          collected_paise: collectedPaise,
        };
      });

      if (search) {
        rows = rows.filter(
          (r) =>
            r.date.toLowerCase().includes(search) ||
            r.bill.toLowerCase().includes(search) ||
            r.customer.toLowerCase().includes(search) ||
            r.status.toLowerCase().includes(search)
        );
      }

      const totalAmountPaise = rows.reduce((a, r) => a + r.amount_paise, 0);
      const totalCollectedPaise = rows.reduce((a, r) => a + r.collected_paise, 0);

      return {
        ...baseMeta,
        reportId: 'delivery',
        reportName: 'Delivery Report',
        columns: [
          { id: 'date', name: 'Date', type: 'date', isMeasure: false },
          { id: 'bill', name: 'Bill', type: 'string', isMeasure: false },
          { id: 'customer', name: 'Customer', type: 'string', isMeasure: false },
          { id: 'status', name: 'Status', type: 'string', isMeasure: false },
          { id: 'amount_paise', name: 'Amount', type: 'currency', isMeasure: true },
          { id: 'collected_paise', name: 'Collected', type: 'currency', isMeasure: true },
        ],
        rows,
        totalRows: rows.length,
        page: 1,
        pageSize: rows.length || 50,
        totalPages: 1,
        grandTotals: {
          amount_paise: totalAmountPaise,
          collected_paise: totalCollectedPaise,
          count: rows.length,
        },
      };
    }

    // 4. Inventory Report: Product, Opening, In, Out, Wastage, Closing, Value
    const invRows = db
      .prepare(
        `SELECT
           pv.id as variant_id,
           p.name as product_name,
           pv.variant_name,
           COALESCE(p.category, 'Uncategorized') as category,
           p.unit_type,
           COALESCE(NULLIF(pv.weighted_average_cost, 0), NULLIF(pv.last_purchase_cost, 0), NULLIF(pv.cost_price_paise_per_unit, 0), pv.current_rate_paise_per_unit, 0) as unit_cost_paise,
           COALESCE(sl.quantity_grams, 0) as current_grams,
           COALESCE(sl.quantity_units, 0) as current_units,
           COALESCE(mov.in_grams, 0) as in_grams,
           COALESCE(mov.in_units, 0) as in_units,
           COALESCE(mov.out_grams, 0) as out_grams,
           COALESCE(mov.out_units, 0) as out_units,
           COALESCE(mov.wastage_grams, 0) as wastage_grams,
           COALESCE(mov.wastage_units, 0) as wastage_units
         FROM product_variants pv
         JOIN products p ON pv.product_id = p.id
         LEFT JOIN stock_ledger sl ON pv.id = sl.product_variant_id
         LEFT JOIN (
           SELECT
             il.product_variant_id,
             SUM(CASE WHEN LOWER(il.action_type) IN ('purchase', 'transfer_in', 'fridge_removal', 'yield_in', 'return') OR (LOWER(il.action_type) = 'audit_adjustment' AND COALESCE(il.quantity_grams, il.quantity_units, 0) > 0) THEN ABS(COALESCE(il.quantity_grams, 0)) ELSE 0 END) as in_grams,
             SUM(CASE WHEN LOWER(il.action_type) IN ('purchase', 'transfer_in', 'fridge_removal', 'yield_in', 'return') OR (LOWER(il.action_type) = 'audit_adjustment' AND COALESCE(il.quantity_grams, il.quantity_units, 0) > 0) THEN ABS(COALESCE(il.quantity_units, 0)) ELSE 0 END) as in_units,
             SUM(CASE WHEN LOWER(il.action_type) IN ('sale', 'transfer_out', 'fridge_deposit', 'yield_out') THEN ABS(COALESCE(il.quantity_grams, 0)) ELSE 0 END) as out_grams,
             SUM(CASE WHEN LOWER(il.action_type) IN ('sale', 'transfer_out', 'fridge_deposit', 'yield_out') THEN ABS(COALESCE(il.quantity_units, 0)) ELSE 0 END) as out_units,
             SUM(CASE WHEN LOWER(il.action_type) = 'wastage' THEN ABS(COALESCE(il.quantity_grams, 0)) ELSE 0 END) as wastage_grams,
             SUM(CASE WHEN LOWER(il.action_type) = 'wastage' THEN ABS(COALESCE(il.quantity_units, 0)) ELSE 0 END) as wastage_units
           FROM inventory_ledger il
           WHERE SUBSTR(il.created_at, 1, 10) >= ?
             AND SUBSTR(il.created_at, 1, 10) <= ?
           GROUP BY il.product_variant_id
         ) mov ON pv.id = mov.product_variant_id
         WHERE pv.is_active = 1 AND p.is_active = 1 AND COALESCE(p.is_inventory_tracked, pv.track_in_inventory, 1) = 1
         ORDER BY p.name ASC`
      )
      .all(startDate, endDate) as any[];

    let rows = invRows.map((r) => {
      const isWeight = r.unit_type === 'weight' || r.unit_type === 'live_dual';
      const unitLabel = isWeight ? 'kg' : 'pcs';

      const closingQty = isWeight
        ? roundQty(Number(r.current_grams || 0) / 1000)
        : roundQty(Number(r.current_units || 0), 0);
      const inQty = isWeight
        ? roundQty(Number(r.in_grams || 0) / 1000)
        : roundQty(Number(r.in_units || 0), 0);
      const outQty = isWeight
        ? roundQty(Number(r.out_grams || 0) / 1000)
        : roundQty(Number(r.out_units || 0), 0);
      const wastageQty = isWeight
        ? roundQty(Number(r.wastage_grams || 0) / 1000)
        : roundQty(Number(r.wastage_units || 0), 0);

      const openingQty = roundQty(
        Math.max(0, closingQty - inQty + outQty + wastageQty),
        isWeight ? 3 : 0
      );

      const unitCostPaise = Number(r.unit_cost_paise || 0);
      const valuePaise = Math.max(0, Math.round(closingQty * unitCostPaise));

      const productName =
        r.variant_name &&
        r.variant_name.toLowerCase() !== 'standard' &&
        r.variant_name.toLowerCase() !== r.product_name?.toLowerCase()
          ? `${r.product_name} (${r.variant_name})`
          : r.product_name;

      return {
        _row_id: r.variant_id,
        product: productName,
        unit: unitLabel,
        opening_qty: openingQty,
        in_qty: inQty,
        out_qty: outQty,
        wastage_qty: wastageQty,
        closing_qty: closingQty,
        opening: formatQty(openingQty, { unit: unitLabel, maxDecimals: isWeight ? 3 : 0 }),
        in: formatQty(inQty, { unit: unitLabel, maxDecimals: isWeight ? 3 : 0 }),
        out: formatQty(outQty, { unit: unitLabel, maxDecimals: isWeight ? 3 : 0 }),
        wastage: formatQty(wastageQty, { unit: unitLabel, maxDecimals: isWeight ? 3 : 0 }),
        closing: formatQty(closingQty, { unit: unitLabel, maxDecimals: isWeight ? 3 : 0 }),
        value_paise: valuePaise,
        category: r.category || 'Uncategorized',
      };
    });

    if (itemFilterTerm) {
      rows = rows.filter(
        (r) =>
          r.product.toLowerCase().includes(itemFilterTerm) ||
          r.category.toLowerCase().includes(itemFilterTerm)
      );
    }

    if (search) {
      rows = rows.filter(
        (r) =>
          r.product.toLowerCase().includes(search) ||
          r.category.toLowerCase().includes(search)
      );
    }

    const totalOpening = roundQty(rows.reduce((a, r) => a + r.opening_qty, 0));
    const totalIn = roundQty(rows.reduce((a, r) => a + r.in_qty, 0));
    const totalOut = roundQty(rows.reduce((a, r) => a + r.out_qty, 0));
    const totalWastage = roundQty(rows.reduce((a, r) => a + r.wastage_qty, 0));
    const totalClosing = roundQty(rows.reduce((a, r) => a + r.closing_qty, 0));
    const totalValuePaise = rows.reduce((a, r) => a + r.value_paise, 0);

    return {
      ...baseMeta,
      reportId: 'inventory',
      reportName: 'Inventory Report',
      columns: [
        { id: 'product', name: 'Product', type: 'string', isMeasure: false },
        { id: 'opening', name: 'Opening', type: 'string', isMeasure: false },
        { id: 'in', name: 'In', type: 'string', isMeasure: false },
        { id: 'out', name: 'Out', type: 'string', isMeasure: false },
        { id: 'wastage', name: 'Wastage', type: 'string', isMeasure: false },
        { id: 'closing', name: 'Closing', type: 'string', isMeasure: false },
        { id: 'value_paise', name: 'Value', type: 'currency', isMeasure: true },
      ],
      rows,
      totalRows: rows.length,
      page: 1,
      pageSize: rows.length || 50,
      totalPages: 1,
      grandTotals: {
        opening_qty: totalOpening,
        in_qty: totalIn,
        out_qty: totalOut,
        wastage_qty: totalWastage,
        closing_qty: totalClosing,
        opening: formatQty(totalOpening),
        in: formatQty(totalIn),
        out: formatQty(totalOut),
        wastage: formatQty(totalWastage),
        closing: formatQty(totalClosing),
        value_paise: totalValuePaise,
        count: rows.length,
      },
    };
  }

  public runCustomReport(config: any, userContext?: any): ReportQueryResult {
    return reportEngine.runCustomReport(config, userContext);
  }

  public buildPivot(options: ReportQueryOptions, pivotConfig: any, userContext?: any): any {
    return reportEngine.buildPivot(options, pivotConfig, userContext);
  }

  public saveReport(input: any) {
    return savedReportsService.saveReport(input);
  }

  public getSavedReports(userId?: number) {
    return savedReportsService.getSavedReports(userId);
  }

  public toggleFavorite(userId: number, reportId: string) {
    return savedReportsService.toggleFavorite(userId, reportId);
  }

  public getFavoriteReportIds(userId: number) {
    return savedReportsService.getFavoriteReportIds(userId);
  }

  public recordRecentReport(input: any) {
    return savedReportsService.recordRecentReport(input);
  }

  public getRecentReports(userId: number, limit?: number) {
    return savedReportsService.getRecentReports(userId, limit);
  }

  public getReportAlerts() {
    return reportAlertsService.generateReportAlerts();
  }

  public getReportDefinitions(): ReportDefinition[] {
    return getAllReportDefinitions();
  }

  public getReportDefinitionById(id: string): ReportDefinition | undefined {
    return getReportDefinition(id);
  }

  public getFilterOptions(): ReportFilterOptions {
    return reportEngine.getFilterOptions();
  }

  public exportReport(req: ReportExportRequest): {
    filename: string;
    mimeType: string;
    content: string;
  } {
    const page = 1;
    const pageSize = req.scope === 'all_data' ? -1 : 50;

    const result = this.runReport({
      reportId: req.reportId,
      filters: req.filters,
      selectedDimensions: req.selectedDimensions,
      selectedMeasures: req.selectedMeasures,
      groupBy: req.groupBy,
      sortBy: req.sortBy,
      page,
      pageSize,
    });

    let rowsToExport = result.rows;
    if (req.scope === 'selected_rows' && req.selectedRowIds && req.selectedRowIds.length > 0) {
      const idSet = new Set(req.selectedRowIds.map(String));
      rowsToExport = result.rows.filter(r => idSet.has(String(r._row_id || r.invoice_id)));
    }

    const headers = result.columns.map(c => `"${String(c.name || (c as any).label || c.id).replace(/"/g, '""')}"`);
    const csvRows = rowsToExport.map(row => {
      return result.columns.map(c => {
        const val = row[c.id];
        if (val === undefined || val === null) return '""';
        if (c.type === 'currency') {
          return (Number(val) / 100).toFixed(2);
        }
        if (c.type === 'weight') {
          return typeof val === 'number' ? val.toFixed(3) : val;
        }
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(',');
    });

    const totalRow = result.columns.map((c, idx) => {
      if (idx === 0) return '"GRAND TOTAL"';
      if (result.grandTotals[c.id] !== undefined) {
        const val = result.grandTotals[c.id];
        if (c.type === 'currency') return (Number(val) / 100).toFixed(2);
        if (c.type === 'percent') return `${val}%`;
        return `"${String(val).replace(/"/g, '""')}"`;
      }
      return '""';
    }).join(',');

    const fileHeader = [
      `"${result.shopInfo.name}"`,
      `"Report: ${result.reportName}"`,
      `"Generated: ${result.generatedAt}"`,
      `"Filters: ${result.filterSummary.activeFilterChips.map(f => `${f.label}=${f.value}`).join(' | ') || 'None'}"`,
      '',
    ].join('\n');

    const csvContent = `${fileHeader}\n${headers.join(',')}\n${csvRows.join('\n')}\n${totalRow}`;
    const filename = `${result.reportId}_${new Date().toISOString().split('T')[0]}.csv`;

    return {
      filename,
      mimeType: 'text/csv',
      content: csvContent,
    };
  }

  // 2. Legacy / Quick Analytics Summary Helpers
  public getSalesSummary(startDate: string, endDate: string): SalesSummary {
    assertValidDateRange(startDate, endDate);
    const row = this.invoiceRepo.getSalesSummaryByDate(startDate, endDate);
    return {
      totalInvoices: row.total_invoices,
      totalRevenuePaise: row.total_revenue,
      totalTaxPaise: row.total_tax,
      subtotalPaise: row.subtotal,
      gstRevenuePaise: row.gst_revenue,
      nonGstRevenuePaise: row.non_gst_revenue,
      totalDiscountPaise: row.total_discount,
    };
  }

  public getCategorySales(startDate: string, endDate: string): CategorySales[] {
    assertValidDateRange(startDate, endDate);
    const items = this.invoiceRepo.getInvoiceItemsByDate(startDate, endDate);
    const categoryMap = new Map<string, { revenue: number; grams: number; units: number }>();

    for (const item of items) {
      const category = (item as any).category || 'Uncategorized';
      const unitType = (item as any).unit_type || item.unit_type;

      if (!categoryMap.has(category)) {
        categoryMap.set(category, { revenue: 0, grams: 0, units: 0 });
      }

      const catObj = categoryMap.get(category)!;
      catObj.revenue += (item as any).line_total_paise || (item.line_subtotal_paise + Math.round(item.line_subtotal_paise * 0.05));
      if (unitType === 'weight' && item.quantity_grams !== null) {
        catObj.grams += item.quantity_grams;
      } else if (unitType === 'piece' && item.quantity_units !== null) {
        catObj.units += item.quantity_units;
      }
    }

    const result: CategorySales[] = [];
    categoryMap.forEach((val, category) => {
      result.push({
        category,
        revenuePaise: val.revenue,
        grams: val.grams,
        units: val.units,
      });
    });

    return result.sort((a, b) => b.revenuePaise - a.revenuePaise);
  }

  public getProfitSummary(startDate: string, endDate: string): ProfitSummary {
    assertValidDateRange(startDate, endDate);
    const items = this.invoiceRepo.getInvoiceItemsByDate(startDate, endDate);
    if (items.length === 0) {
      return {
        totalSalesRevenuePaise: 0,
        totalCostPaise: 0,
        grossProfitPaise: 0,
        profitMarginPercent: 0,
      };
    }

    const uniqueVariantIds = Array.from(new Set(items.map(item => item.product_variant_id)));
    const purchaseRecords = this.purchaseRepo.getAverageCostForVariants(uniqueVariantIds);
    const avgCostMap = new Map<number, { costPerGram: number; costPerUnit: number }>();
    purchaseRecords.forEach(p => {
      const costPerGram = p.total_grams ? p.total_cost / p.total_grams : 0;
      const costPerUnit = p.total_units ? p.total_cost / p.total_units : 0;
      avgCostMap.set(p.product_variant_id, { costPerGram, costPerUnit });
    });

    let totalSalesRevenuePaise = 0;
    let totalCostPaise = 0;

    items.forEach(item => {
      totalSalesRevenuePaise += item.line_subtotal_paise;
      
      const avgCost = avgCostMap.get(item.product_variant_id);
      if (avgCost) {
        if (item.unit_type === 'weight' && item.quantity_grams !== null) {
          totalCostPaise += Math.round(item.quantity_grams * avgCost.costPerGram);
        } else if (item.unit_type === 'piece' && item.quantity_units !== null) {
          totalCostPaise += Math.round(item.quantity_units * avgCost.costPerUnit);
        }
      } else {
        totalCostPaise += Math.round(item.line_subtotal_paise * 0.65);
      }
    });

    const grossProfitPaise = totalSalesRevenuePaise - totalCostPaise;
    const profitMarginPercent = totalSalesRevenuePaise > 0 
      ? Math.round((grossProfitPaise / totalSalesRevenuePaise) * 10000) / 100
      : 0;

    return {
      totalSalesRevenuePaise,
      totalCostPaise,
      grossProfitPaise,
      profitMarginPercent,
    };
  }
}

import { container } from '../../../../core/di/container';
export const reportsService = container.reportsService;
export default reportsService;
