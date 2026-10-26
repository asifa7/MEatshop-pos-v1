// Reports Engine Type Definitions (Section 53 Architecture)

export type DimensionType = 'string' | 'date' | 'datetime' | 'number' | 'boolean';
export type MeasureType = 'currency' | 'number' | 'percent' | 'weight' | 'count';
export type AggregationType = 'sum' | 'count' | 'count_distinct' | 'avg' | 'min' | 'max' | 'computed';

export interface DimensionDefinition {
  id: string;
  name: string;
  type: DimensionType;
  dbColumn: string;
  groupable?: boolean;
  filterable?: boolean;
  sortable?: boolean;
  description?: string;
}

export interface MeasureDefinition {
  id: string;
  name: string;
  type: MeasureType;
  aggregation: AggregationType;
  dbExpression: string;
  description?: string;
  prefix?: string;
  suffix?: string;
  precision?: number;
  computeFn?: string; // Custom client/server compute rule
}

export interface ReportColumnDefinition {
  id: string;
  name: string;
  type: DimensionType | MeasureType;
  isMeasure?: boolean;
  align?: 'left' | 'center' | 'right';
  pinned?: boolean;
  visibleDefault?: boolean;
  format?: (value: any) => string;
}

export interface ReportDefinition {
  id: string;
  name: string;
  category: 'sales' | 'inventory' | 'customers' | 'operations' | 'compliance' | 'financial' | 'profitability' | 'payments' | string;
  description: string;
  dataSource: string;
  defaultDimensions?: string[];
  defaultMeasures?: string[];
  defaultColumns?: ReportColumnDefinition[] | { id: string; label: string; visible: boolean; width?: number; pinned?: boolean }[];
  defaultGroupBy?: string[];
  defaultSortBy?: { field: string; direction: 'asc' | 'desc' }[];
  defaultFilters?: Record<string, any>;
  availableDimensions: string[];
  availableMeasures: string[];
  allowedGroupingDimensions?: string[];
  drillDownTarget?: string;
  permissionRequired?: string;
  pageSize?: number;
}

export interface DatePresetOption {
  id: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'this_year' | 'custom';
  label: string;
}

export interface GlobalFilterState {
  datePreset?: string;
  startDate?: string;
  endDate?: string;
  locationId?: number | 'all';
  categoryId?: string | 'all';
  productId?: number | 'all';
  variantId?: number | 'all';
  customerId?: number | 'all';
  customerCategory?: string | 'all';
  customerGroupId?: number | 'all';
  cashierId?: number | 'all';
  paymentMethod?: string | 'all';
  shiftId?: number | 'all';
  searchTerm?: string;
  // Metric range filters
  minAmountPaise?: number;
  maxAmountPaise?: number;
  minWeightGrams?: number;
  maxWeightGrams?: number;
  minMarginPercent?: number;
  maxMarginPercent?: number;
  [key: string]: any;
}

export interface ReportQueryOptions {
  reportId: string;
  filters?: GlobalFilterState;
  selectedDimensions?: string[];
  selectedMeasures?: string[];
  groupBy?: string[];
  sortBy?: { field: string; direction: 'asc' | 'desc' }[];
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface ReportGroupSummary {
  groupKey: string;
  groupValue: any;
  groupLabel: string;
  count: number;
  subtotals: Record<string, number>;
  rows?: any[];
  isExpanded?: boolean;
}

export interface ActiveFilterChip {
  id: string;
  key: string;
  label: string;
  value: string;
}

export interface ReportQueryResult {
  reportId: string;
  reportName: string;
  description: string;
  dataSource?: string;
  generatedAt: string;
  generatedBy: string;
  shopInfo: {
    name: string;
    address: string;
    phone: string;
    gstin: string;
    currency: string;
  };
  filterSummary: {
    startDate: string;
    endDate: string;
    activeFilterChips: ActiveFilterChip[];
  };
  dataQualityWarnings: string[];
  columns: ReportColumnDefinition[];
  rows: any[];
  groupedData?: ReportGroupSummary[];
  grandTotals: Record<string, any>;
  totalRows: number;
  page: number;
  pageSize: number;
  totalPages: number;
  productBreakdown?: any[];
  paymentBreakdown?: any[];
  kpiSummary?: {
    totalTransactions: number;
    totalRevenuePaise: number;
    totalGrossProfitPaise: number;
    avgMarginPercent: number;
    totalWeightGrams: number;
    totalDiscountsPaise: number;
    totalTaxPaise: number;
  };
}

export interface ReportFilterOptions {
  branches: { id: number; name: string; code?: string }[];
  categories: string[];
  products?: { id: number; name: string; category?: string }[];
  productVariants?: { id: number; name: string; productId?: number }[];
  customers?: { id: number; name: string; phone?: string; customer_code?: string; category?: string }[];
  customerCategories?: string[];
  customerGroups?: (string | { id: number; name: string })[];
  cashiers: { id: number; name: string; username?: string }[];
  paymentMethods: string[];
  shifts?: { id: number; label?: string }[];
}

export interface ReportExportRequest {
  reportId: string;
  format: 'csv' | 'excel' | 'pdf';
  scope: 'current_page' | 'all_data' | 'selected_rows';
  filters?: GlobalFilterState;
  selectedDimensions?: string[];
  selectedMeasures?: string[];
  groupBy?: string[];
  sortBy?: { field: string; direction: 'asc' | 'desc' }[];
  selectedRowIds?: (string | number)[];
}

// ============================================================================
// Phase 6 Types: Custom Builder, Pivot, Saved Reports, Security & Alerts
// ============================================================================

export interface PivotTableConfig {
  rowDimension: string;
  columnDimension: string;
  valueMeasure: string;
}

export interface PivotResult {
  rowKeys: string[];
  colKeys: string[];
  matrix: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
  rowDimName: string;
  colDimName: string;
  valueMeasureName: string;
  valueType: MeasureType;
}

export interface CustomReportBuilderConfig {
  id?: string;
  name: string;
  description?: string;
  dataSource: string;
  dimensions: string[];
  measures: string[];
  groupBy?: string[];
  sortBy?: { field: string; direction: 'asc' | 'desc' }[];
  filters?: GlobalFilterState;
  viewMode?: 'table' | 'pivot' | 'chart';
  pivotConfig?: PivotTableConfig;
  chartConfig?: {
    chartType: 'bar' | 'line' | 'pie';
    dimension: string;
    measure: string;
  };
}

export interface SavedReport {
  id: number;
  name: string;
  description?: string;
  category: string;
  dataSource: string;
  configuration: CustomReportBuilderConfig;
  isFavorite: boolean;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface RecentReportItem {
  reportId: string;
  reportName: string;
  category: string;
  lastAccessedAt: string;
  isCustom?: boolean;
}

export interface ReportAlert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  targetReportId: string;
  targetFilters?: GlobalFilterState;
  metricValue?: number | string;
  thresholdValue?: number | string;
}

export interface RolePermissionContext {
  userId?: number;
  role?: string; // 'ADMIN' | 'MANAGER' | 'CASHIER' | 'OWNER' | 'ACCOUNTANT'
  locationId?: number;
  accessibleCategories?: string[];
  restrictedFields?: string[];
}

export interface MetricDefinition {
  id: string;
  name: string;
  formula: string;
  description: string;
  reconciliationTip?: string;
}

