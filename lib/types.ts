export type StatementType = "income" | "balance_sheet";

export type NormalizedCategory =
  | "Revenue"
  | "COGS"
  | "Operating Expenses"
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
  company_id: string;
  account_name: string;
  account_name_key: string;
  category: NormalizedCategory;
  statement_type: StatementType;
  created_at: string;
  updated_at: string;
};

export type StatementRow = {
  label: string;
  value: number;
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
  currentAssets: number;
  currentLiabilities: number;
  workingCapital: number;
  revenueGrowthPercent: number | null;
  ebitdaGrowthPercent: number | null;
  grossMarginChange: number | null;
  ebitdaMarginChange: number | null;
};

export type DashboardSeriesPoint = {
  label: string;
  revenue: number;
  ebitda: number;
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

export type DashboardData = {
  companies: Company[];
  company: Company | null;
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  accountMappings: AccountMapping[];
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
};
