export type StatementType = "income" | "balance_sheet";

export type NormalizedCategory =
  | "Revenue"
  | "COGS"
  | "Gross Profit"
  | "Operating Expenses"
  | "Depreciation / Amortization"
  | "EBITDA"
  | "Operating Income"
  | "Pre-tax"
  | "Net Income"
  | "Tax Expense"
  | "Non-operating"
  | "current_assets"
  | "current_assets.cash"
  | "current_assets.accounts_receivable"
  | "current_assets.inventory"
  | "current_assets.other"
  | "non_current_assets"
  | "non_current_assets.ppe"
  | "non_current_assets.other"
  | "current_liabilities"
  | "current_liabilities.accounts_payable"
  | "current_liabilities.short_term_debt"
  | "current_liabilities.other"
  | "non_current_liabilities"
  | "non_current_liabilities.long_term_debt"
  | "non_current_liabilities.other"
  | "equity"
  | "equity.common_stock"
  | "equity.retained_earnings"
  | "equity.other"
  | "Assets"
  | "Liabilities"
  | "Equity";

export type Company = {
  id: string;
  name: string;
  industry: string | null;
  base_currency: string;
  created_at: string;
};

export type ReportingPeriod = {
  id: string;
  company_id: string;
  label: string;
  period_date: string;
  created_at: string;
};

export type FinancialEntry = {
  id: string;
  account_name: string;
  statement_type: StatementType;
  amount: number;
  period_id: string;
  category: NormalizedCategory;
  addback_flag: boolean;
  matched_by?: AuditMatchedBy | null;
  confidence?: AuditConfidence | null;
  mapping_explanation?: string | null;
  created_at: string;
};

export type AccountMapping = {
  id: string;
  company_id: string | null;
  account_name: string;
  account_name_key: string;
  category: NormalizedCategory;
  statement_type: StatementType;
  created_at: string;
  updated_at: string;
};

export type AddBackType =
  | "owner_related"
  | "non_recurring"
  | "discretionary"
  | "non_operating"
  | "accounting_normalization"
  | "run_rate_adjustment";

export type AddBackStatus = "suggested" | "accepted" | "rejected";

export type AddBackSource = "system" | "user";

export type AddBackClassificationConfidence = "high" | "medium" | "low";

export type AddBack = {
  id: string;
  company_id: string;
  period_id: string;
  linked_entry_id: string | null;
  type: AddBackType;
  description: string;
  amount: number;
  classification_confidence: AddBackClassificationConfidence;
  source: AddBackSource;
  status: AddBackStatus;
  justification: string;
  supporting_reference: string | null;
  created_at: string;
  updated_at: string;
};

export type StatementRow = {
  label: string;
  value: number;
};

export type NormalizedMappingProvenance =
  | "saved_mapping"
  | "keyword_mapping"
  | "inferred_mapping"
  | "manual_mapping"
  | "source_provided";

export type NormalizedMappedLine = {
  entryId: string;
  periodId: string;
  accountName: string;
  normalizedCategory: NormalizedCategory;
  statementType: StatementType;
  mappingProvenance: NormalizedMappingProvenance;
  confidence: AuditConfidence;
  mappingExplanation: string;
  amount: number;
  addbackFlag: boolean;
};

export type NormalizedStatementRowKind = "line_item" | "subtotal" | "metric";

export type NormalizedStatementRow = {
  key: string;
  label: string;
  value: number;
  kind: NormalizedStatementRowKind;
  rollupKey?: string;
};

export type NormalizedStatement =
  | {
      statementKey: "income_statement";
      title: "Income Statement";
      rows: NormalizedStatementRow[];
      footerLabel: "Reported EBITDA" | "Adjusted EBITDA";
      footerValue: number;
    }
  | {
      statementKey: "balance_sheet";
      title: "Balance Sheet";
      rows: NormalizedStatementRow[];
      footerLabel: "Working Capital";
      footerValue: number;
    };

export type ReconciliationIssueSeverity = "critical" | "warning" | "info";

export type ReconciliationIssue = {
  key:
    | "ebitda_formula"
    | "adjusted_ebitda_formula"
    | "gross_profit_formula"
    | "working_capital_formula"
    | "statement_rollup"
    | "mapping_conflict"
    | "missing_component"
    | "low_confidence_component"
    | "legacy_adjustment_source";
  severity: ReconciliationIssueSeverity;
  section:
    | "income_statement"
    | "balance_sheet"
    | "ebitda_bridge"
    | "mapping"
    | "export_alignment";
  metric: string;
  message: string;
  difference?: number;
  tolerance?: number;
};

export type ReconciliationStatus = "reconciled" | "warning" | "failed";

export type ReconciliationReport = {
  status: ReconciliationStatus;
  label: "Reconciles" | "Reconciles with warnings" | "Does not reconcile";
  summaryMessage: string;
  withinTolerance: boolean;
  issues: ReconciliationIssue[];
};

export type PeriodSnapshot = {
  periodId: string;
  label: string;
  periodDate?: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  ebitda: number;
  adjustedEbitda: number;
  grossMarginPercent: number;
  ebitdaMarginPercent: number;
  adjustedEbitdaMarginPercent: number;
  currentAssets: number;
  currentLiabilities: number;
  workingCapital: number;
  revenueGrowthPercent: number | null;
  ebitdaGrowthPercent: number | null;
  adjustedEbitdaGrowthPercent: number | null;
  grossMarginChange: number | null;
  ebitdaMarginChange: number | null;
};

export type DashboardSeriesPoint = {
  label: string;
  revenue: number;
  reportedEbitda: number;
  adjustedEbitda: number;
};

export type KpiDelta = {
  revenueGrowthPercent: number | null;
  ebitdaGrowthPercent: number | null;
  grossMarginChange: number | null;
  ebitdaMarginChange: number | null;
};

export type Insight = {
  type: "revenue_change" | "margin_compression" | "expense_spike";
  message: string;
};

export type VarianceMetric = {
  absolute: number;
  percent: number | null;
};

export type PeriodDriverAnalysis = {
  previousLabel: string;
  currentLabel: string;
  revenueVariance: VarianceMetric;
  cogsVariance: VarianceMetric;
  operatingExpensesVariance: VarianceMetric;
  ebitdaVariance: VarianceMetric;
  revenueImpactOnEbitda: number;
  cogsImpactOnEbitda: number;
  operatingExpenseImpactOnEbitda: number;
  insights: string[];
};

export type ActionRecommendation = {
  message: string;
  priority: number;
};

export type MappingClassification =
  | "saved_mapping"
  | "keyword_mapping"
  | "manual_mapping"
  | "unmapped";

export type AuditMetricKey =
  | "revenue"
  | "cogs"
  | "operatingExpenses"
  | "ebitda";

export type AuditMatchedBy =
  | "memory"
  | "saved_mapping"
  | "keyword"
  | "keyword_rule"
  | "manual"
  | "csv_value"
  | "csv";

export type AuditConfidence = "high" | "medium" | "low";

export type TraceableEntry = {
  id: string;
  accountName: string;
  amount: number;
  displayAmount: number;
  category: NormalizedCategory;
  statementType: StatementType;
  addbackFlag: boolean;
  matchedBy: AuditMatchedBy;
  confidence: AuditConfidence;
  mappingExplanation: string;
};

export type AuditGroup = {
  label: string;
  subtotal: number;
  rows: TraceableEntry[];
};

export type KpiTraceabilityBadge = {
  label: "Partial mapping" | "Unmapped data" | "Low confidence";
  tone: "amber" | "rose" | "slate";
};

export type AuditMetric = {
  key: AuditMetricKey;
  label: string;
  total: number;
  groups: AuditGroup[];
  rowCount: number;
  mappedCount: number;
  manualCount: number;
  badge: KpiTraceabilityBadge | null;
};

export type MappingConsistencyIssue = {
  accountName: string;
  message: string;
  mappings: Array<{
    periodLabel: string;
    category: NormalizedCategory;
    statementType: StatementType;
  }>;
};

export type DataQualityReport = {
  mappingCoveragePercent: number;
  mappingBreakdown: Record<MappingClassification, number>;
  missingCategories: string[];
  confidenceScore: number;
  confidenceLabel: "High" | "Medium" | "Low";
  hasSinglePeriodWarning: boolean;
  consistencyIssues: string[];
  summaryMessage: string;
  issueGroups: Array<{
    key: "completeness" | "consistency" | "sanity" | "mapping";
    title: "Completeness" | "Consistency" | "Sanity Checks" | "Mapping Coverage";
    issues: Array<{
      message: string;
      severity: "Critical" | "Warning" | "Info";
    }>;
  }>;
};

export type DataReadinessStatus = "ready" | "caution" | "blocked";

export type DataReadiness = {
  status: DataReadinessStatus;
  label: "Ready" | "Use with caution" | "Not reliable";
  blockingReasons: string[];
  cautionReasons: string[];
  summaryMessage: string;
};

export type AddBackSuggestion = {
  companyId: string;
  periodId: string;
  linkedEntryId: string | null;
  type: AddBackType;
  description: string;
  amount: number;
  classificationConfidence: AddBackClassificationConfidence;
  source: AddBackSource;
  status: AddBackStatus;
  justification: string;
  supportingReference: string | null;
};

export type AddBackReviewItem = {
  id: string | null;
  companyId: string;
  periodId: string;
  periodLabel: string;
  linkedEntryId: string | null;
  entryAccountName: string | null;
  entryCategory: NormalizedCategory | null;
  entryStatementType: StatementType | null;
  addbackFlag: boolean;
  matchedBy: AuditMatchedBy | null;
  confidence: AuditConfidence | null;
  mappingExplanation: string | null;
  type: AddBackType;
  description: string;
  amount: number;
  classificationConfidence: AddBackClassificationConfidence;
  source: AddBackSource;
  status: AddBackStatus;
  justification: string;
  supportingReference: string | null;
  isPersisted: boolean;
  dependsOnLowConfidenceMapping: boolean;
};

export type EbitdaBridgeCategoryGroup = {
  type: AddBackType;
  label: string;
  total: number;
  items: AddBackReviewItem[];
};

export type EbitdaBridge = {
  periodId: string;
  periodLabel: string;
  reportedEbitda: number;
  addBackTotal: number;
  adjustedEbitda: number | null;
  canComputeAdjustedEbitda: boolean;
  invalidReasons: string[];
  warnings: string[];
  groups: EbitdaBridgeCategoryGroup[];
};

export type NormalizedPeriodOutput = {
  periodId: string;
  label: string;
  periodDate: string;
  mappedLines: NormalizedMappedLine[];
  incomeStatement: Extract<NormalizedStatement, { statementKey: "income_statement" }>;
  balanceSheet: Extract<NormalizedStatement, { statementKey: "balance_sheet" }>;
  reportedEbitda: number;
  acceptedAddBacks: number;
  adjustedEbitda: number;
  grossMarginPercent: number;
  reportedEbitdaMarginPercent: number;
  adjustedEbitdaMarginPercent: number;
  reportedEbitdaGrowthPercent: number | null;
  adjustedEbitdaGrowthPercent: number | null;
  reconciliation: ReconciliationReport;
  bridge: EbitdaBridge | null;
};

export type DashboardData = {
  companies: Company[];
  company: Company | null;
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  accountMappings: AccountMapping[];
  addBacks: AddBack[];
  addBackReviewItems: AddBackReviewItem[];
  snapshots: PeriodSnapshot[];
  snapshot: PeriodSnapshot;
  series: DashboardSeriesPoint[];
  incomeStatement: StatementRow[];
  balanceSheet: StatementRow[];
  insights: Insight[];
  driverAnalyses: PeriodDriverAnalysis[];
  recommendedActions: ActionRecommendation[];
  executiveSummary: string | null;
  dataQuality: DataQualityReport;
  readiness: DataReadiness;
  ebitdaBridge: EbitdaBridge | null;
  reconciliation: ReconciliationReport;
  normalizedPeriods: NormalizedPeriodOutput[];
  normalizedOutput: NormalizedPeriodOutput | null;
};
