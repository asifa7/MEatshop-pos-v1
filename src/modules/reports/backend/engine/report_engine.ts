import { db } from '../../../../core/backend/db';
import {
  ReportQueryOptions,
  ReportQueryResult,
  ReportGroupSummary,
  ActiveFilterChip,
  ReportFilterOptions,
  ReportDefinition,
  CustomReportBuilderConfig,
  PivotTableConfig,
  PivotResult,
  RolePermissionContext,
} from '../../types/reports.types';
import { reportDefinitionsRegistry, getReportDefinition } from './report_definitions';
import { dataSourcesCatalog } from './report_data_sources';

import { assertValidDateRange } from '../../../../core/utils/date_validation';

export class ReportEngine {
  /**
   * Run a report with parameterized multi-filter query, dynamic dimensions,
   * grouping, subtotals, sorting, grand totals, and pagination.
   */
  public runReport(options: ReportQueryOptions): ReportQueryResult {
    if (options.filters) {
      assertValidDateRange(options.filters.startDate, options.filters.endDate);
    }
    const reportDef = this.getDefinition(options.reportId);
    if (!reportDef) {
      throw new Error(`Report definition not found for id: ${options.reportId}`);
    }

    const dataSource = dataSourcesCatalog[reportDef.dataSource];
    if (!dataSource) {
      throw new Error(`Data source not found for id: ${reportDef.dataSource}`);
    }

    const page = options.page || 1;
    const pageSize = options.pageSize !== undefined ? options.pageSize : (reportDef.pageSize || 50);
    const sortBy = options.sortBy && options.sortBy.length > 0 ? options.sortBy : (reportDef.defaultSortBy || []);
    const groupByDims = options.groupBy && options.groupBy.length > 0 ? options.groupBy : (reportDef.defaultGroupBy || []);

    // Filter active dimensions & measures from default columns or query
    const activeDimIds = reportDef.availableDimensions;
    const activeMeasureIds = reportDef.availableMeasures;

    const activeDimensions = dataSource.dimensions.filter(d => activeDimIds.includes(d.id));
    const activeMeasures = dataSource.measures.filter(m => activeMeasureIds.includes(m.id));

    // Build base query
    const { fromClause, whereClause, params } = dataSource.getBaseQuery(options.filters);

    // Helper for measure SQL aggregation
    const buildMeasureSelect = (m: any) => {
      if (dataSource.id === 'sales_transactions') {
        if (m.id === 'margin_percent') {
          return `
            ROUND(
              CAST(
                (
                  SUM(ii.line_subtotal_paise) - 
                  SUM(
                    COALESCE(
                      NULLIF(ii.real_cogs_paise, 0),
                      NULLIF(ii.estimated_cogs_paise, 0),
                      CASE 
                        WHEN p.unit_type = 'weight' AND ii.quantity_grams > 0 THEN 
                          CAST(ROUND((COALESCE(NULLIF(pv.weighted_average_cost, 0), NULLIF(pv.last_purchase_cost, 0), pv.cost_price_paise_per_unit, 0) * ii.quantity_grams) / 1000.0) AS INTEGER)
                        WHEN p.unit_type = 'piece' AND ii.quantity_units > 0 THEN
                          (COALESCE(NULLIF(pv.weighted_average_cost, 0), NULLIF(pv.last_purchase_cost, 0), pv.cost_price_paise_per_unit, 0) * ii.quantity_units)
                        ELSE 0
                      END
                    )
                  )
                ) AS REAL
              ) / NULLIF(SUM(ii.line_subtotal_paise), 0) * 100.0, 
              2
            ) as margin_percent
          `;
        }
        if (m.id === 'cost_per_kg_paise') {
          return `
            ROUND(
              CAST(SUM(COALESCE(NULLIF(ii.real_cogs_paise, 0), NULLIF(ii.estimated_cogs_paise, 0), (COALESCE(NULLIF(pv.weighted_average_cost, 0), NULLIF(pv.last_purchase_cost, 0), pv.cost_price_paise_per_unit, 0) * ii.quantity_grams) / 1000.0, 0)) AS REAL) * 1000.0 / NULLIF(SUM(ii.quantity_grams), 0)
            ) as cost_per_kg_paise
          `;
        }
        if (m.id === 'selling_price_per_kg_paise') {
          return `
            ROUND(
              CAST(SUM(ii.line_subtotal_paise) AS REAL) * 1000.0 / NULLIF(SUM(ii.quantity_grams), 0)
            ) as selling_price_per_kg_paise
          `;
        }
        if (m.id === 'profit_per_kg_paise') {
          return `
            ROUND(
              CAST((SUM(ii.line_subtotal_paise) - SUM(COALESCE(NULLIF(ii.real_cogs_paise, 0), NULLIF(ii.estimated_cogs_paise, 0), (COALESCE(NULLIF(pv.weighted_average_cost, 0), NULLIF(pv.last_purchase_cost, 0), pv.cost_price_paise_per_unit, 0) * ii.quantity_grams) / 1000.0, 0))) AS REAL) * 1000.0 / NULLIF(SUM(ii.quantity_grams), 0)
            ) as profit_per_kg_paise
          `;
        }
      }
      if (m.aggregation === 'count_distinct') {
        return `COUNT(DISTINCT ${m.dbExpression}) as ${m.id}`;
      }
      if (m.aggregation === 'count') {
        return `COUNT(${m.dbExpression}) as ${m.id}`;
      }
      return `COALESCE(${m.aggregation.toUpperCase()}(${m.dbExpression}), 0) as ${m.id}`;
    };

    // 1. Calculate Grand Totals and KPIs across all matched records
    const grandTotalSelects = activeMeasures.map(buildMeasureSelect);

    const totalStatsQuery = `
      SELECT 
        COUNT(*) as total_rows
        ${grandTotalSelects.length > 0 ? ', ' + grandTotalSelects.join(', ') : ''}
      ${fromClause}
      ${whereClause}
    `;

    const totalStats = db.prepare(totalStatsQuery).get(...params) as any || {};
    const totalRows = Number(totalStats.total_rows || 0);

    const grandTotals: Record<string, number> = {};
    activeMeasures.forEach(m => {
      grandTotals[m.id] = Number(totalStats[m.id] || 0);
    });

    // 2. Fetch Data Quality Warnings
    const qualityWarningHelper = dataSource.getDataQualityWarnings(options.filters);
    const qualityRow = db.prepare(qualityWarningHelper.query).get(...qualityWarningHelper.params) as any;
    const warningMsg = qualityWarningHelper.buildWarning(qualityRow);
    const dataQualityWarnings: string[] = warningMsg ? [warningMsg] : [];

    // 3. Build Select list for actual rows
    const selectFields: string[] = [];
    activeDimensions.forEach(d => {
      selectFields.push(`${d.dbColumn} as ${d.id}`);
    });
    activeMeasures.forEach(m => {
      selectFields.push(`${m.dbExpression} as ${m.id}`);
    });

    // Sorting clause
    let orderClause = '';
    if (sortBy.length > 0) {
      const orderClauses = sortBy.map(s => {
        return `${s.field} ${s.direction.toUpperCase()}`;
      });
      orderClause = `ORDER BY ${orderClauses.join(', ')}`;
    }

    let rows: any[] = [];
    let groupedData: ReportGroupSummary[] | undefined = undefined;

    if (groupByDims.length > 0) {
      // Grouping query: Group by the primary group dimension
      const primaryGroupDimId = groupByDims[0];
      const groupDim = dataSource.dimensions.find(d => d.id === primaryGroupDimId);
      const groupCol = groupDim ? groupDim.dbColumn : primaryGroupDimId;

      let groupOrderClause = 'ORDER BY count DESC';
      if (sortBy.length > 0) {
        const groupOrderClauses = sortBy.map(s => {
          if (s.field === primaryGroupDimId) {
            return `group_value ${s.direction.toUpperCase()}`;
          }
          return `${s.field} ${s.direction.toUpperCase()}`;
        });
        groupOrderClause = `ORDER BY ${groupOrderClauses.join(', ')}`;
      }

      const groupMeasureSelects = activeMeasures.map(buildMeasureSelect);

      const groupQuery = `
        SELECT 
          ${groupCol} as group_value,
          COUNT(*) as count
          ${groupMeasureSelects.length > 0 ? ', ' + groupMeasureSelects.join(', ') : ''}
        ${fromClause}
        ${whereClause}
        GROUP BY ${groupCol}
        ${groupOrderClause}
      `;

      const groupRows = db.prepare(groupQuery).all(...params) as any[];

      // Fetch child item rows for each group
      const allRowsQuery = `
        SELECT 
          ROW_NUMBER() OVER () as _row_id,
          ${selectFields.join(', ')}
        ${fromClause}
        ${whereClause}
        ${orderClause}
      `;
      const allDetailRows = db.prepare(allRowsQuery).all(...params) as any[];

      // Group detail rows by group value
      const groupMap = new Map<string, any[]>();
      allDetailRows.forEach(r => {
        const val = String(r[primaryGroupDimId] ?? 'Uncategorized');
        if (!groupMap.has(val)) {
          groupMap.set(val, []);
        }
        groupMap.get(val)!.push(r);
      });

      groupedData = groupRows.map(g => {
        const groupValStr = String(g.group_value ?? 'Uncategorized');
        const subtotals: Record<string, number> = {};
        activeMeasures.forEach(m => {
          subtotals[m.id] = Number(g[m.id] || 0);
        });

        return {
          groupKey: `${primaryGroupDimId}:${groupValStr}`,
          groupValue: g.group_value,
          groupLabel: groupValStr,
          count: g.count,
          subtotals,
          rows: groupMap.get(groupValStr) || [],
          isExpanded: false,
        };
      });

      // Flatten rows for standard table viewing
      rows = allDetailRows;
    } else {
      // Standard Flat Rows query with pagination
      let limitOffsetClause = '';
      if (pageSize > 0) {
        const offset = (page - 1) * pageSize;
        limitOffsetClause = `LIMIT ${pageSize} OFFSET ${offset}`;
      }

      const rowsQuery = `
        SELECT 
          ROW_NUMBER() OVER () as _row_id,
          ${selectFields.join(', ')}
        ${fromClause}
        ${whereClause}
        ${orderClause}
        ${limitOffsetClause}
      `;

      rows = db.prepare(rowsQuery).all(...params) as any[];
    }

    // 4. Shop info
    const shopSettings = db.prepare("SELECT key, value FROM system_settings WHERE key LIKE 'shop_%' OR key = 'currency'").all() as { key: string; value: string }[];
    const shopMap = new Map(shopSettings.map(s => [s.key, s.value]));

    const shopInfo = {
      name: shopMap.get('shop_name') || 'PREMIUM MEAT SHOP',
      address: shopMap.get('shop_address') || '123 Market Road',
      phone: shopMap.get('shop_phone') || '+91 98765 43210',
      gstin: shopMap.get('shop_gstin') || shopMap.get('gstin') || '29ABCDE1234F1Z5',
      currency: shopMap.get('currency') || '₹',
    };

    // 5. Active filter chips
    const activeFilterChips: ActiveFilterChip[] = [];
    if (options.filters) {
      if (options.filters.startDate && options.filters.endDate) {
        activeFilterChips.push({
          id: 'date_range',
          key: 'date',
          label: 'Date Range',
          value: `${options.filters.startDate} to ${options.filters.endDate}`
        });
      }
      if (options.filters.categoryId && options.filters.categoryId !== 'all') {
        activeFilterChips.push({
          id: 'category',
          key: 'category',
          label: 'Category',
          value: options.filters.categoryId
        });
      }
      if (options.filters.paymentMethod && options.filters.paymentMethod !== 'all') {
        activeFilterChips.push({
          id: 'payment_method',
          key: 'paymentMethod',
          label: 'Payment Method',
          value: options.filters.paymentMethod.toUpperCase()
        });
      }
      if (options.filters.cashierId && options.filters.cashierId !== 'all') {
        activeFilterChips.push({
          id: 'cashier',
          key: 'cashierId',
          label: 'Cashier ID',
          value: String(options.filters.cashierId)
        });
      }
      if (options.filters.customerId && options.filters.customerId !== 'all') {
        activeFilterChips.push({
          id: 'customer',
          key: 'customerId',
          label: 'Customer ID',
          value: String(options.filters.customerId)
        });
      }
      if (options.filters.searchTerm && options.filters.searchTerm.trim() !== '') {
        activeFilterChips.push({
          id: 'search',
          key: 'searchTerm',
          label: 'Search',
          value: `"${options.filters.searchTerm.trim()}"`
        });
      }
    }

    // 6. KPI Summary
    const kpiSummary = {
      totalTransactions: Number(grandTotals.invoice_count || grandTotals.return_count || grandTotals.payment_count || grandTotals.transaction_count || totalRows),
      totalRevenuePaise: Number(grandTotals.net_amount_paise || grandTotals.amount_paise || grandTotals.refund_amount_paise || grandTotals.stock_valuation_paise || 0),
      totalGrossProfitPaise: Number(grandTotals.gross_profit_paise || 0),
      avgMarginPercent: Number(grandTotals.margin_percent || 0),
      totalWeightGrams: Number(grandTotals.weight_grams || (grandTotals.weight_kg ? grandTotals.weight_kg * 1000 : 0) || (grandTotals.stock_weight_kg ? grandTotals.stock_weight_kg * 1000 : 0)),
      totalDiscountsPaise: Number(grandTotals.discount_paise || 0),
      totalTaxPaise: Number(grandTotals.tax_paise || 0),
    };

    const totalPages = pageSize > 0 ? Math.ceil(totalRows / pageSize) : 1;

    return {
      reportId: reportDef.id,
      reportName: reportDef.name,
      description: reportDef.description,
      dataSource: reportDef.dataSource,
      columns: (reportDef.defaultColumns || []) as any,
      rows,
      groupedData,
      totalRows,
      page,
      pageSize,
      totalPages,
      grandTotals,
      kpiSummary,
      dataQualityWarnings,
      shopInfo,
      generatedAt: new Date().toISOString(),
      generatedBy: 'System',
      filterSummary: {
        startDate: options.filters?.startDate || '',
        endDate: options.filters?.endDate || '',
        activeFilterChips,
      },
    };
  }

  /**
   * Section A: Run a dynamic custom report configured at runtime
   */
  public runCustomReport(
    config: CustomReportBuilderConfig,
    userContext?: RolePermissionContext
  ): ReportQueryResult {
    const dataSource = dataSourcesCatalog[config.dataSource];
    if (!dataSource) {
      throw new Error(`Data source not found: ${config.dataSource}`);
    }

    // Role-based security enforcement
    this.enforceSecurity({
      dataSource: config.dataSource,
      requestedMeasures: config.measures,
      requestedDimensions: config.dimensions,
    }, userContext);

    const runtimeColumns = [
      ...config.dimensions.map((dimId: string) => {
        const d = dataSource.dimensions.find(dim => dim.id === dimId);
        return {
          id: dimId,
          label: d?.name || dimId,
          visible: true,
          width: 140,
        };
      }),
      ...config.measures.map((mId: string) => {
        const m = dataSource.measures.find(meas => meas.id === mId);
        return {
          id: mId,
          label: m?.name || mId,
          visible: true,
          width: 130,
        };
      })
    ];

    const tempReportDef: ReportDefinition = {
      id: config.id || `custom_${Date.now()}`,
      name: config.name || 'Custom Report',
      description: config.description || 'User-defined dynamic report',
      dataSource: config.dataSource,
      category: 'Custom',
      availableDimensions: config.dimensions,
      availableMeasures: config.measures,
      defaultColumns: runtimeColumns,
      defaultGroupBy: config.groupBy,
      defaultSortBy: config.sortBy || (config.measures.length > 0 ? [{ field: config.measures[0], direction: 'desc' }] : undefined),
      pageSize: 50,
    };

    // Temporarily register in memory if not already registered
    const existingIdx = reportDefinitionsRegistry.findIndex(r => r.id === tempReportDef.id);
    if (existingIdx >= 0) {
      reportDefinitionsRegistry[existingIdx] = tempReportDef;
    } else {
      reportDefinitionsRegistry.push(tempReportDef);
    }

    // Apply location scoping if user is restricted to branch
    const effectiveFilters = { ...(config.filters || {}) };
    if (userContext?.locationId && userContext.role !== 'ADMIN' && userContext.role !== 'OWNER') {
      effectiveFilters.locationId = userContext.locationId;
    }

    return this.runReport({
      reportId: tempReportDef.id,
      filters: effectiveFilters,
      groupBy: config.groupBy,
      sortBy: config.sortBy,
      pageSize: 50,
    });
  }

  /**
   * Section A: Cross-Tabulation Pivot Table Builder
   */
  public buildPivot(
    options: ReportQueryOptions,
    pivotConfig: PivotTableConfig,
    userContext?: RolePermissionContext
  ): PivotResult {
    const reportDef = this.getDefinition(options.reportId);
    if (!reportDef) {
      throw new Error(`Report definition not found for id: ${options.reportId}`);
    }

    const dataSource = dataSourcesCatalog[reportDef.dataSource];
    if (!dataSource) {
      throw new Error(`Data source not found for id: ${reportDef.dataSource}`);
    }

    // Enforce permissions on pivot value measure
    this.enforceSecurity({
      dataSource: reportDef.dataSource,
      requestedMeasures: [pivotConfig.valueMeasure],
      requestedDimensions: [pivotConfig.rowDimension, pivotConfig.columnDimension],
    }, userContext);

    // Apply location scoping if user is restricted to branch
    const effectiveFilters = { ...(options.filters || {}) };
    if (userContext?.locationId && userContext.role !== 'ADMIN' && userContext.role !== 'OWNER') {
      effectiveFilters.locationId = userContext.locationId;
    }

    // Fetch all records for pivot (up to 5000)
    const { fromClause, whereClause, params } = dataSource.getBaseQuery(effectiveFilters);

    const rowDim = dataSource.dimensions.find(d => d.id === pivotConfig.rowDimension);
    const colDim = dataSource.dimensions.find(d => d.id === pivotConfig.columnDimension);
    const valMeasure = dataSource.measures.find(m => m.id === pivotConfig.valueMeasure);

    if (!rowDim || !colDim || !valMeasure) {
      throw new Error(`Invalid pivot configuration: row (${pivotConfig.rowDimension}), column (${pivotConfig.columnDimension}), or value (${pivotConfig.valueMeasure}) not found.`);
    }

    const pivotQuery = `
      SELECT 
        ${rowDim.dbColumn} as row_key,
        ${colDim.dbColumn} as col_key,
        ${valMeasure.aggregation.toUpperCase()}(${valMeasure.dbExpression}) as val
      ${fromClause}
      ${whereClause}
      GROUP BY ${rowDim.dbColumn}, ${colDim.dbColumn}
      ORDER BY row_key ASC, col_key ASC
      LIMIT 5000
    `;

    const rawPivotRows = db.prepare(pivotQuery).all(...params) as any[];

    const rowKeySet = new Set<string>();
    const colKeySet = new Set<string>();
    const matrix: Record<string, Record<string, number>> = {};
    const rowTotals: Record<string, number> = {};
    const colTotals: Record<string, number> = {};
    let grandTotal = 0;

    rawPivotRows.forEach(r => {
      const rowKey = String(r.row_key ?? 'Unspecified');
      const colKey = String(r.col_key ?? 'Unspecified');
      const val = Number(r.val || 0);

      rowKeySet.add(rowKey);
      colKeySet.add(colKey);

      if (!matrix[rowKey]) matrix[rowKey] = {};
      matrix[rowKey][colKey] = val;

      rowTotals[rowKey] = (rowTotals[rowKey] || 0) + val;
      colTotals[colKey] = (colTotals[colKey] || 0) + val;
      grandTotal += val;
    });

    const rowKeys = Array.from(rowKeySet);
    const colKeys = Array.from(colKeySet);

    return {
      rowKeys,
      colKeys,
      matrix,
      rowTotals,
      colTotals,
      grandTotal,
      rowDimName: rowDim.name,
      colDimName: colDim.name,
      valueMeasureName: valMeasure.name,
      valueType: valMeasure.type,
    };
  }

  /**
   * Section C: Role-Based Query-Level Security Enforcement
   */
  public enforceSecurity(
    req: { dataSource: string; requestedMeasures?: string[]; requestedDimensions?: string[] },
    userContext?: RolePermissionContext
  ): void {
    if (!userContext || !userContext.role) {
      return; // Internal / admin context
    }

    const role = userContext.role.toUpperCase();
    if (role === 'ADMIN' || role === 'OWNER') {
      return; // Full access
    }

    const RESTRICTED_FINANCIAL_MEASURES = [
      'cost_paise',
      'real_cogs_paise',
      'estimated_cogs_paise',
      'gross_profit_paise',
      'margin_percent',
      'cost_per_kg_paise',
      'profit_per_kg_paise',
      'cogs_paise',
      'gross_margin_percent',
      'margin_after_increase_percent'
    ];

    const RESTRICTED_DATA_SOURCES_FOR_CASHIER = [
      'cogs_inventory',
      'meat_yield_processing',
      'unified_audit_trail',
      'supplier_procurement_summary',
      'purchase_cost_variance',
    ];

    if (role === 'CASHIER') {
      if (RESTRICTED_DATA_SOURCES_FOR_CASHIER.includes(req.dataSource)) {
        throw new Error(`Permission Denied: Role CASHIER is not authorized to access data source '${req.dataSource}'.`);
      }

      if (req.requestedMeasures) {
        const prohibited = req.requestedMeasures.filter(m => RESTRICTED_FINANCIAL_MEASURES.includes(m));
        if (prohibited.length > 0) {
          throw new Error(`Permission Denied: Role CASHIER is not permitted to query restricted financial metric(s): ${prohibited.join(', ')}.`);
        }
      }
    }
  }

  public getDefinitions(): ReportDefinition[] {
    return reportDefinitionsRegistry;
  }

  public getDefinition(reportId: string): ReportDefinition | undefined {
    return getReportDefinition(reportId);
  }

  public getFilterOptions(): ReportFilterOptions {
    const categories = db.prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != '' ORDER BY category").all() as { category: string }[];
    const cashiers = db.prepare("SELECT id, username FROM users ORDER BY username").all() as { id: number; username: string }[];
    const branches = db.prepare("SELECT id, name FROM branches ORDER BY name").all() as { id: number; name: string }[];
    const paymentMethods = db.prepare("SELECT DISTINCT method FROM payments WHERE method IS NOT NULL ORDER BY method").all() as { method: string }[];
    const customerGroups = db.prepare("SELECT DISTINCT category as name FROM customers WHERE category IS NOT NULL AND category != '' ORDER BY category").all() as { name: string }[];

    // Ensure all standard payment methods are listed
    const methodSet = new Set(['cash', 'upi', 'card', 'credit', ...paymentMethods.map(p => p.method)]);

    return {
      categories: categories.map(c => c.category),
      cashiers: cashiers.map(c => ({ id: c.id, name: c.username, username: c.username })),
      branches: branches.length > 0 ? branches.map(b => ({ id: b.id, name: b.name, code: String(b.id) })) : [{ id: 1, name: 'Main Store', code: 'MAIN' }],
      paymentMethods: Array.from(methodSet),
      customerGroups: customerGroups.map(g => g.name),
    };
  }
}

export const reportEngine = new ReportEngine();

