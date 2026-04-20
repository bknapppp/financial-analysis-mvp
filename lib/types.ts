import type { DealStage, DealStageAssessment } from "./deal-stage.ts";

export type StatementType = "income" | "balance_sheet";

export type FinancialSourceType = "reported_financials" | "tax_return";

export type FinancialSourceConfidence = "high" | "medium" | "low" | "unknown";

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
  stage: DealStage;
  stage_updated_at: string | null;
  stage_notes: string | null;
  created_at: string;
};

export type ReportingPeriod = {
  id: string;
  company_id: string;
  label: string;
  period_date: string;
  created_at: string;
};

export type SourceDocument = {
  id: string;
  company_id: string;
  source_type: FinancialSourceType;
  source_file_name: string | null;
  upload_id: string | null;
  source_currency: string | null;
  source_confidence: FinancialSourceConfidence | null;
  created_at: string;
};

export type SourceReportingPeriod = {
  id: string;
  source_document_id: string | null;
  label: string;
  period_date: string;
  source_period_label: string | null;
  source_year: number | null;
  created_at: string;
  source_type: FinancialSourceType;
  source_file_name: string | null;
  upload_id: string | null;
  source_currency: string | null;
  source_confidence: FinancialSourceConfidence | null;
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

export type SourceFinancialEntry = {
  id: string;
  account_name: string;
  statement_type: StatementType;
  amount: number;
  category: NormalizedCategory;
  addback_flag: boolean;
  matched_by?: AuditMatchedBy | null;
  confidence?: AuditConfidence | null;
  mapping_explanation?: string | null;
  created_at: string;
  source_period_id: string;
  source_document_id: string | null;
  source_type: FinancialSourceType;
  source_file_name: string | null;
  upload_id: string | null;
  source_period_label: string | null;
  source_year: number | null;
  source_currency: string | null;
  source_confidence: FinancialSourceConfidence | null;
};

export type SourceFinancialContext = {
  sourceType: FinancialSourceType;
  periods: SourceReportingPeriod[];
  entries: SourceFinancialEntry[];
  documents: SourceDocument[];
};

export type AccountMapping = {
  id: string;
  company_id: string | null;
  account_name: string;
  account_name_key: string;
  normalized_label?: string | null;
  concept?: string | null;
  category: NormalizedCategory;
  statement_type: StatementType;
  source_type?: FinancialSourceType | null;
  confidence?: string | null;
  source?: string | null;
  usage_count?: number | null;
  last_used_at?: string | null;
  mapping_method?: string | null;
  mapping_explanation?: string | null;
  matched_rule?: string | null;
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
  value: number | null;
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
  value: number | null;
  kind: NormalizedStatementRowKind;
  rollupKey?: string;
};

export type NormalizedStatement =
  | {
      statementKey: "income_statement";
      title: "Income Statement";
      rows: NormalizedStatementRow[];
      footerLabel: "EBITDA" | "Adjusted EBITDA";
      footerValue: number | null;
    }
  | {
      statementKey: "balance_sheet";
      title: "Balance Sheet";
      rows: NormalizedStatementRow[];
      footerLabel: "Working Capital";
      footerValue: number | null;
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
  revenue: number | null;
  cogs: number | null;
  grossProfit: number | null;
  operatingExpenses: number | null;
  depreciationAndAmortization?: number | null;
  nonOperating?: number | null;
  taxExpense?: number | null;
  netIncome?: number | null;
  ebit?: number | null;
  reportedOperatingIncome?: number | null;
  reportedEbitda?: number | null;
  ebitda: number | null;
  acceptedAddBacks: number;
  adjustedEbitda: number | null;
  grossMarginPercent: number | null;
  ebitdaMarginPercent: number | null;
  adjustedEbitdaMarginPercent: number | null;
  currentAssets: number;
  currentLiabilities: number;
  workingCapital: number;
  revenueGrowthPercent: number | null;
  ebitdaGrowthPercent: number | null;
  adjustedEbitdaGrowthPercent: number | null;
  grossMarginChange: number | null;
  ebitdaMarginChange: number | null;
  incomeStatementDebug?: IncomeStatementAggregationDebug;
  incomeStatementMetricDebug?: IncomeStatementMetricDebug;
  ebitdaExplainability?: EbitdaExplainability;
};

export type IncomeStatementAggregationSource =
  | "components"
  | "subtotal_fallback"
  | "none";

export type IncomeStatementAggregationFamilyKey =
  | "revenue"
  | "cogs"
  | "operatingExpenses"
  | "depreciationAndAmortization"
  | "nonOperating"
  | "taxExpense"
  | "netIncome"
  | "operatingIncome"
  | "ebitda";

export type IncomeStatementAggregationFamilyDebug = {
  source: IncomeStatementAggregationSource;
  total: number;
  selectedLabels: string[];
  excludedLabels: string[];
  componentCount: number;
  subtotalCount: number;
  detailTotal: number | null;
  subtotalTotal: number | null;
  detailCoverageRatio: number | null;
};

export type IncomeStatementAggregationDebug = Record<
  IncomeStatementAggregationFamilyKey,
  IncomeStatementAggregationFamilyDebug
>;

export type IncomeStatementMetricSource =
  | "computed_operations"
  | "bottom_up"
  | "reported_fallback"
  | "none";

export type IncomeStatementMetricDebug = {
  ebit: {
    source: IncomeStatementMetricSource;
    selectedLabels: string[];
    excludedLabels: string[];
  };
  ebitda: {
    source: IncomeStatementMetricSource;
    selectedLabels: string[];
    excludedLabels: string[];
  };
};

export type EbitdaExplainabilityBasis =
  | "computed"
  | "reported_fallback"
  | "incomplete";

export type EbitdaExplainability = {
  basis: EbitdaExplainabilityBasis;
  basisLabel:
    | "Computed from bottom-up inputs"
    | "Using reported EBITDA (fallback)"
    | "Insufficient bottom-up inputs";
  note: string;
  netIncome: number | null;
  interestAddBack: number | null;
  taxAddBack: number | null;
  depreciationAndAmortizationAddBack: number | null;
  computedEbitda: number | null;
  reportedEbitda: number | null;
  selectedLabels: string[];
  excludedLabels: string[];
  missingComponents: string[];
};

export type UnderwritingEbitdaBasis = "computed" | "adjusted";

export type DashboardSeriesPoint = {
  label: string;
  revenue: number;
  reportedEbitda: number | null;
  adjustedEbitda: number | null;
};

export type SimilarDeal = {
  companyId: string;
  companyName: string;
  revenue: number | null;
  ebitda: number | null;
  ebitdaMarginPercent: number | null;
  adjustedEbitda: number | null;
  acceptedAddBacks: number | null;
  addBacksPercent: number | null;
  decision: "approve" | "caution" | "decline";
  primaryRisk: string | null;
};

export type CreditScenarioInputs = {
  loanAmount: number | null;
  annualInterestRatePercent: number | null;
  loanTermYears: number | null;
  amortizationYears: number | null;
  collateralValue: number | null;
};

export type CreditScenarioMetricStatus =
  | "strong"
  | "moderate"
  | "weak"
  | "insufficient";

export type CreditScenarioMetric = {
  label: string;
  value: number | null;
  display: string;
  description: string;
  status: CreditScenarioMetricStatus;
  statusLabel: "Strong" | "Moderate" | "Weak" | "Insufficient data";
};

export type CreditScenarioResult = {
  annualInterestExpense: number | null;
  annualPrincipalPayment: number | null;
  annualDebtService: number | null;
  balanceAtMaturity: number | null;
  canComputeDebtService: boolean;
  adverseSignals: string[];
  metrics: {
    dscr: CreditScenarioMetric;
    debtToEbitda: CreditScenarioMetric;
    interestCoverage: CreditScenarioMetric;
    ltv: CreditScenarioMetric;
  };
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

export type TaxSourceComparisonStatus = "not_loaded" | "partial" | "ready";

export type TaxSourceStatus = {
  documentCount: number;
  periodCount: number;
  rowCount: number;
  mappedLineCount: number;
  lowConfidenceLineCount: number;
  broadClassificationCount: number;
  hasMatchingPeriod: boolean;
  matchingPeriodLabel: string | null;
  comparisonStatus: TaxSourceComparisonStatus;
  comparisonComputable: boolean;
  missingComponents: string[];
  notes: string[];
  revenueDeltaPercent: number | null;
  computedEbitdaDeltaPercent: number | null;
  adjustedEbitdaDeltaPercent: number | null;
};

export type DiligenceIssueSourceType = "system" | "manual";

export type DiligenceIssueCategory =
  | "source_data"
  | "financials"
  | "underwriting"
  | "reconciliation"
  | "validation"
  | "credit"
  | "tax"
  | "diligence_request"
  | "other";

export type DiligenceIssueSeverity = "low" | "medium" | "high" | "critical";

export type DiligenceIssueStatus = "open" | "in_review" | "resolved" | "waived";

export type DiligenceIssueLinkedPage =
  | "overview"
  | "financials"
  | "underwriting"
  | "source_data";

export type DiligenceIssueCode =
  | "missing_revenue"
  | "missing_cogs"
  | "required_mappings_incomplete"
  | "source_coverage_incomplete"
  | "low_mapping_confidence"
  | "balance_sheet_out_of_balance"
  | "ebitda_basis_unavailable"
  | "gross_profit_reconciliation_mismatch"
  | "ebitda_reconciliation_mismatch"
  | "adjusted_ebitda_reconciliation_mismatch"
  | "working_capital_reconciliation_mismatch"
  | "source_reconciliation_incomplete"
  | "ebitda_non_positive"
  | "adjusted_ebitda_unavailable"
  | "dscr_not_meaningful_non_positive_earnings"
  | "debt_sizing_outputs_unavailable"
  | "underwriting_inputs_incomplete"
  | "add_back_review_incomplete";

export type DiligenceIssue = {
  id: string;
  company_id: string;
  period_id: string | null;
  source_type: DiligenceIssueSourceType;
  issue_code: DiligenceIssueCode | null;
  title: string;
  description: string;
  category: DiligenceIssueCategory;
  severity: DiligenceIssueSeverity;
  status: DiligenceIssueStatus;
  linked_page: DiligenceIssueLinkedPage;
  linked_field: string | null;
  linked_route: string | null;
  dedupe_key: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  waived_at: string | null;
  created_by: string | null;
  owner: string | null;
};

export type DiligenceIssueSummary = {
  total: number;
  open: number;
  inReview: number;
  resolved: number;
  waived: number;
  criticalOpen: number;
  bySeverity: Record<DiligenceIssueSeverity, number>;
  byPage: Record<DiligenceIssueLinkedPage, number>;
  topOpenIssue: DiligenceIssue | null;
};

export type DiligenceIssueGroupKey =
  | "source_data"
  | "financial_validation"
  | "reconciliation"
  | "underwriting"
  | "credit"
  | "adjustments"
  | "tax"
  | "other";

export type DiligenceIssueGroup = {
  groupKey: DiligenceIssueGroupKey;
  groupLabel: string;
  issueCount: number;
  criticalCount: number;
  highCount: number;
  topIssueTitle: string | null;
  primaryIssue: DiligenceIssue | null;
  remainingIssueCount: number;
  hasMoreIssues: boolean;
  orderedIssues: DiligenceIssue[];
  issues: DiligenceIssue[];
};

export type DiligenceIssueGroupSummary = {
  totalGroups: number;
  totalActiveIssues: number;
  topGroup: DiligenceIssueGroup | null;
  groups: DiligenceIssueGroup[];
};

export type DiligenceIssueActionTarget = {
  linkedPage: DiligenceIssueLinkedPage;
  linkedRoute: string | null;
  linkedField: string | null;
  actionLabel: string | null;
  isActionable: boolean;
};

export type DiligenceReadinessState =
  | "not_ready"
  | "needs_validation"
  | "under_review"
  | "structurally_ready"
  | "ready_for_ic"
  | "ready_for_lender"
  | "completed";

export type DiligenceReadiness = {
  state: DiligenceReadinessState;
  readinessLabel: string;
  readinessReason: string;
  readinessPriorityRank: number;
  blockingGroupKey: DiligenceIssueGroupKey | null;
  blockerGroups: DiligenceIssueGroupKey[];
  blockerGroupLabels: string[];
  blockerIssueTitles: string[];
  blockerIssueIds: string[];
  blockerCount: number;
  primaryBlockerGroup: DiligenceIssueGroupKey | null;
  primaryBlockerLabel: string | null;
  primaryBlockerIssueTitle: string | null;
  primaryBlockerIssueId: string | null;
  activeIssueCount: number;
  criticalIssueCount: number;
  highIssueCount: number;
};

export type DiligenceIssueFeedback = {
  resolvedIssueTitles: string[];
  resolvedIssueCount: number;
  reopenedIssueTitles: string[];
  reopenedIssueCount: number;
  readinessChanged: boolean;
  previousReadinessLabel: string | null;
  currentReadinessLabel: string | null;
};

export type UnderwritingCompletionStatus = "ready" | "in_progress" | "blocked";

export type UnderwritingCompletionSectionStatus =
  | "complete"
  | "in_progress"
  | "blocked";

export type UnderwritingCompletionSectionKey =
  | "financial_inputs"
  | "mapping_completeness"
  | "tax_source_readiness"
  | "structure_inputs"
  | "underwriting_readiness";

export type UnderwritingCompletionItem = {
  key: string;
  label: string;
  detail?: string;
  isComplete: boolean;
  isBlocking: boolean;
  nextAction?: string;
};

export type UnderwritingCompletionSection = {
  key: UnderwritingCompletionSectionKey;
  title: string;
  weight: number;
  completionPercent: number;
  status: UnderwritingCompletionSectionStatus;
  completedCount: number;
  totalCount: number;
  items: UnderwritingCompletionItem[];
};

export type UnderwritingCompletionSummary = {
  completionPercent: number;
  completionStatus: UnderwritingCompletionStatus;
  blockers: string[];
  missingItems: string[];
  completedItems: string[];
  nextActions: string[];
  sections: UnderwritingCompletionSection[];
};

export type InvestmentOverviewSectionKey =
  | "earnings_quality"
  | "financial_integrity"
  | "structure_readiness"
  | "key_underwriting_gaps";

export type InvestmentOverviewSection = {
  key: InvestmentOverviewSectionKey;
  title: string;
  items: string[];
};

export type InvestmentOverviewSummary = {
  title: "Investment Overview";
  summary: string;
  sections: InvestmentOverviewSection[];
};

export type UnderwritingAnalysis = {
  ebitdaBasis: UnderwritingEbitdaBasis;
  selectedEbitda: number | null;
  underwritingInputs: CreditScenarioInputs;
  missingInputs: string[];
  acceptedAddBackTotal: number;
  creditScenario: CreditScenarioResult;
  completionSummary: UnderwritingCompletionSummary;
  investmentOverview: InvestmentOverviewSummary;
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
  canonicalEbitda: number | null;
  reportedEbitdaReference: number | null;
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
  reportedEbitda: number | null;
  acceptedAddBacks: number;
  adjustedEbitda: number | null;
  grossMarginPercent: number | null;
  reportedEbitdaMarginPercent: number | null;
  adjustedEbitdaMarginPercent: number | null;
  reportedEbitdaGrowthPercent: number | null;
  adjustedEbitdaGrowthPercent: number | null;
  reconciliation: ReconciliationReport;
  bridge: EbitdaBridge | null;
  incomeStatementDebug?: IncomeStatementAggregationDebug;
  incomeStatementMetricDebug?: IncomeStatementMetricDebug;
  ebitdaExplainability?: EbitdaExplainability;
};

export type DashboardData = {
  companies: Company[];
  company: Company | null;
  stage: DealStage;
  stageAssessment: DealStageAssessment;
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
  similarDeals: SimilarDeal[];
  dataQuality: DataQualityReport;
  readiness: DataReadiness;
  taxSourceStatus: TaxSourceStatus;
  diligenceIssues: DiligenceIssue[];
  diligenceIssueSummary: DiligenceIssueSummary;
  diligenceIssueGroups: DiligenceIssueGroup[];
  diligenceReadiness: DiligenceReadiness;
  diligenceIssueFeedback: DiligenceIssueFeedback;
  completionSummary: UnderwritingCompletionSummary;
  ebitdaBridge: EbitdaBridge | null;
  reconciliation: ReconciliationReport;
  normalizedPeriods: NormalizedPeriodOutput[];
  normalizedOutput: NormalizedPeriodOutput | null;
};
