export type DealMemoryReconciliationStatus =
  | "balanced"
  | "partial"
  | "broken"
  | "unknown";

export type DealMemoryCurrentStage =
  | "ingestion"
  | "financials"
  | "underwriting"
  | "loi"
  | "closed";

export type DealMemoryFinancialsConfidence = "low" | "medium" | "high";

export type DealAddbackSummaryItem = {
  type: string | null;
  amount: number | null;
  status?: string | null;
};

export type DealFinancialOutputs = {
  companyId?: string | null;
  revenue?: number | null;
  ebitda?: number | null;
  adjustedEbitda?: number | null;
  ebitdaMargin?: number | null;
  industry?: string | null;
  businessModel?: string | null;
  reconciliationStatus?: string | null;
  financialsConfidence?: DealMemoryFinancialsConfidence | null;
};

export type DealAddbackSummary = {
  items?: DealAddbackSummaryItem[] | null;
  addbackCount?: number | null;
  addbackValue?: number | null;
  addbackTypes?: string[] | null;
};

export type DealRiskSummary = {
  riskFlags?: unknown[] | null;
  blockerCount?: number | null;
};

export type DealWorkflowState = {
  companyId?: string | null;
  industry?: string | null;
  businessModel?: string | null;
  completionPercent?: number | null;
  currentStage?: string | null;
  snapshotReason?: string | null;
};

export type DealDataQualitySummary = {
  sourceCompletenessScore?: number | null;
  hasTaxReturns?: boolean | null;
  hasFinancialStatements?: boolean | null;
  financialsConfidence?: DealMemoryFinancialsConfidence | null;
  reconciliationStatus?: string | null;
  isSnapshotReady?: boolean | null;
  isBenchmarkEligible?: boolean | null;
  snapshotReason?: string | null;
};

export type DealMemorySnapshot = {
  dealId: string;
  companyId: string;
  snapshotAt: string;
  revenue: number | null;
  ebitda: number | null;
  adjustedEbitda: number | null;
  ebitdaMargin: number | null;
  industry: string | null;
  businessModel: string | null;
  revenueBand: string | null;
  sourceCompletenessScore: number | null;
  hasTaxReturns: boolean;
  hasFinancialStatements: boolean;
  reconciliationStatus: DealMemoryReconciliationStatus;
  addbackCount: number;
  addbackValue: number | null;
  addbackTypes: string[];
  riskFlags: unknown[];
  blockerCount: number;
  completionPercent: number;
  currentStage: DealMemoryCurrentStage;
  isSnapshotReady: boolean;
  isBenchmarkEligible: boolean;
  financialsConfidence: DealMemoryFinancialsConfidence;
  snapshotReason: string | null;
};

export type DealMemoryInsertRow = {
  id?: string;
  deal_id: string;
  company_id: string;
  snapshot_at: string;
  revenue: number | null;
  ebitda: number | null;
  adjusted_ebitda: number | null;
  ebitda_margin: number | null;
  industry: string | null;
  business_model: string | null;
  revenue_band: string | null;
  source_completeness_score: number | null;
  has_tax_returns: boolean;
  has_financial_statements: boolean;
  reconciliation_status: DealMemoryReconciliationStatus;
  addback_count: number;
  addback_value: number | null;
  addback_types: string[];
  risk_flags: unknown[];
  blocker_count: number;
  completion_percent: number;
  current_stage: DealMemoryCurrentStage;
  is_snapshot_ready: boolean;
  is_benchmark_eligible: boolean;
  financials_confidence: DealMemoryFinancialsConfidence;
  snapshot_reason: string | null;
  created_at?: string;
};

export type DealMemoryHelpers = {
  getDealFinancialOutputs: (dealId: string) => Promise<DealFinancialOutputs>;
  getDealAddbackSummary: (dealId: string) => Promise<DealAddbackSummary>;
  getDealRiskSummary: (dealId: string) => Promise<DealRiskSummary>;
  getDealWorkflowState: (dealId: string) => Promise<DealWorkflowState>;
  getDealDataQualitySummary: (dealId: string) => Promise<DealDataQualitySummary>;
  now: () => Date;
};

type RealRiskFlag = {
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  metric?: string;
};

type RealPortfolioDealState = {
  status:
    | "Needs source data"
    | "Needs workbook review"
    | "Needs mapping"
    | "Needs source completion"
    | "Needs underwriting inputs"
    | "Underwriting in progress"
    | "Ready for structure"
    | "Ready for output";
  currentBlocker: string | null;
  nextAction: string;
  nextActionHref: string;
  hasCriticalInputsMissing: boolean;
  hasAddBacks: boolean;
  addBacksPercentOfEbitda: number | null;
  addBacksAboveThreshold: boolean;
};

type DealMemoryRuntimeSnapshot = {
  periodId: string;
  revenue: number;
  ebitda: number | null;
  adjustedEbitda: number | null;
  ebitdaMarginPercent: number | null;
  acceptedAddBacks: number;
};

type DealMemoryRuntimeData = {
  company: {
    id: string;
    industry: string | null;
  };
  periods: Array<{ id: string }>;
  entries: Array<{ id: string }>;
  snapshot: DealMemoryRuntimeSnapshot;
  addBackReviewItems: Array<{
    periodId: string;
    status: string;
    type: string;
    amount: number;
  }>;
  dataQuality: {
    confidenceScore: number;
    confidenceLabel: "High" | "Medium" | "Low";
    summaryMessage: string;
  };
  readiness: {
    status: "ready" | "caution" | "blocked";
    label: "Ready" | "Use with caution" | "Not reliable";
    blockingReasons: string[];
    cautionReasons: string[];
    summaryMessage: string;
  };
  reconciliation: {
    status: "reconciled" | "warning" | "failed";
    summaryMessage: string;
  };
  taxSourceStatus: {
    documentCount: number;
    rowCount: number;
    comparisonStatus: "not_loaded" | "partial" | "ready";
  };
  completionSummary: {
    completionPercent: number;
    completionStatus: "ready" | "in_progress" | "blocked";
    blockers: string[];
  };
};

export type DealMemoryRuntimeContext = {
  dealId: string;
  data: DealMemoryRuntimeData;
  acceptedAddBackItems: Array<{
    periodId: string;
    status: string;
    type: string;
    amount: number;
  }>;
  riskFlags: RealRiskFlag[];
  portfolioState: RealPortfolioDealState;
};

function isFiniteNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeConfidenceLabel(
  label: "High" | "Medium" | "Low" | null | undefined
): DealMemoryFinancialsConfidence | null {
  if (label === "High") {
    return "high";
  }

  if (label === "Medium") {
    return "medium";
  }

  if (label === "Low") {
    return "low";
  }

  return null;
}

function clampPercent(value: number | null | undefined, fallback = 0) {
  if (!isFiniteNumber(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, value));
}

export function computeEbitdaMargin(
  ebitda: number | null | undefined,
  revenue: number | null | undefined
) {
  if (!isFiniteNumber(ebitda) || !isFiniteNumber(revenue)) {
    return null;
  }

  if (revenue === 0) {
    return ebitda === 0 ? 0 : null;
  }

  return (ebitda / revenue) * 100;
}

export function deriveRevenueBand(revenue: number | null | undefined) {
  if (!isFiniteNumber(revenue)) {
    return null;
  }

  if (revenue < 1_000_000) {
    return "<1M";
  }

  if (revenue < 5_000_000) {
    return "1–5M";
  }

  if (revenue < 10_000_000) {
    return "5–10M";
  }

  return "10M+";
}

function normalizeReconciliationStatus(
  status: string | null | undefined
): DealMemoryReconciliationStatus {
  switch (status) {
    case "balanced":
    case "partial":
    case "broken":
    case "unknown":
      return status;
    case "reconciled":
      return "balanced";
    case "warning":
      return "partial";
    case "failed":
      return "broken";
    default:
      return "unknown";
  }
}

function normalizeCurrentStage(stage: string | null | undefined): DealMemoryCurrentStage {
  switch (stage) {
    case "ingestion":
    case "financials":
    case "underwriting":
    case "loi":
    case "closed":
      return stage;
    default:
      return "ingestion";
  }
}

function deriveFinancialsConfidence(params: {
  explicitConfidence: DealMemoryFinancialsConfidence | null;
  sourceCompletenessScore: number | null;
  reconciliationStatus: DealMemoryReconciliationStatus;
  revenue: number | null;
  ebitda: number | null;
}) {
  if (params.explicitConfidence) {
    return params.explicitConfidence;
  }

  if (
    isFiniteNumber(params.sourceCompletenessScore) &&
    params.sourceCompletenessScore >= 80 &&
    params.reconciliationStatus === "balanced" &&
    isFiniteNumber(params.revenue) &&
    isFiniteNumber(params.ebitda)
  ) {
    return "high";
  }

  if (
    isFiniteNumber(params.sourceCompletenessScore) &&
    params.sourceCompletenessScore >= 50 &&
    (params.reconciliationStatus === "balanced" ||
      params.reconciliationStatus === "partial") &&
    isFiniteNumber(params.revenue) &&
    isFiniteNumber(params.ebitda)
  ) {
    return "medium";
  }

  return "low";
}

function summarizeAcceptedAddbacks(addbackSummary: DealAddbackSummary) {
  const explicitTypes = Array.isArray(addbackSummary.addbackTypes)
    ? Array.from(
        new Set(
          addbackSummary.addbackTypes
            .map((value) => normalizeText(value))
            .filter((value): value is string => value !== null)
        )
      ).sort((left, right) => left.localeCompare(right))
    : null;
  const explicitCount =
    Number.isInteger(addbackSummary.addbackCount) &&
    (addbackSummary.addbackCount ?? 0) >= 0
      ? (addbackSummary.addbackCount ?? 0)
      : null;
  const explicitValue = isFiniteNumber(addbackSummary.addbackValue)
    ? addbackSummary.addbackValue
    : addbackSummary.addbackValue === 0
      ? 0
      : null;

  if (explicitCount !== null || explicitTypes !== null || explicitValue !== null) {
    return {
      addbackCount: explicitCount ?? 0,
      addbackValue: explicitValue,
      addbackTypes: explicitTypes ?? []
    };
  }

  const items = Array.isArray(addbackSummary.items) ? addbackSummary.items : [];
  const acceptedItems = items.filter((item) => item.status === "accepted");

  if (acceptedItems.length === 0) {
    return {
      addbackCount: 0,
      addbackValue: items.length === 0 ? null : 0,
      addbackTypes: [] as string[]
    };
  }

  const addbackTypes = Array.from(
    new Set(
      acceptedItems
        .map((item) => normalizeText(item.type))
        .filter((value): value is string => value !== null)
    )
  ).sort((left, right) => left.localeCompare(right));

  return {
    addbackCount: acceptedItems.length,
    addbackValue: acceptedItems.reduce((total, item) => {
      return total + (isFiniteNumber(item.amount) ? item.amount : 0);
    }, 0),
    addbackTypes
  };
}

function summarizeBlockingReasons(context: DealMemoryRuntimeContext) {
  return Array.from(
    new Set(
      [
        ...context.data.completionSummary.blockers,
        ...context.data.readiness.blockingReasons
      ]
        .map((value) => normalizeText(value))
        .filter((value): value is string => value !== null)
    )
  );
}

function summarizeSnapshotReason(context: DealMemoryRuntimeContext) {
  const blockerReason = summarizeBlockingReasons(context)[0] ?? null;
  if (blockerReason) {
    return blockerReason;
  }

  const cautionReason =
    context.data.readiness.cautionReasons
      .map((value) => normalizeText(value))
      .find((value): value is string => value !== null) ?? null;

  if (cautionReason) {
    return cautionReason;
  }

  if (
    context.portfolioState.currentBlocker &&
    context.portfolioState.status !== "Ready for output" &&
    context.portfolioState.status !== "Ready for structure"
  ) {
    return context.portfolioState.currentBlocker;
  }

  return null;
}

function mapPortfolioStatusToStage(
  status: RealPortfolioDealState["status"]
): DealMemoryCurrentStage {
  if (
    status === "Needs source data" ||
    status === "Needs workbook review" ||
    status === "Needs source completion"
  ) {
    return "ingestion";
  }

  if (status === "Needs mapping") {
    return "financials";
  }

  return "underwriting";
}

function deriveSnapshotReadiness(params: {
  blockerCount: number;
  completionPercent: number;
  reconciliationStatus: DealMemoryReconciliationStatus;
  sourceCompletenessScore: number | null;
  hasFinancialStatements: boolean;
  revenue: number | null;
  adjustedEbitda: number | null;
}) {
  const checks = [
    params.blockerCount === 0,
    params.completionPercent >= 70,
    params.reconciliationStatus !== "broken",
    isFiniteNumber(params.sourceCompletenessScore) && params.sourceCompletenessScore >= 60,
    params.hasFinancialStatements,
    isFiniteNumber(params.revenue),
    isFiniteNumber(params.adjustedEbitda)
  ];

  return checks.every(Boolean);
}

export function explainBenchmarkEligibility(params: {
  isSnapshotReady: boolean;
  revenue: number | null;
  adjustedEbitda: number | null;
  industry: string | null;
  blockerCount: number;
  financialsConfidence: DealMemoryFinancialsConfidence;
  reconciliationStatus: DealMemoryReconciliationStatus;
  hasFinancialStatements: boolean;
}) {
  if (!params.isSnapshotReady) {
    return {
      eligible: false,
      reason: "Snapshot is not ready for benchmarking."
    };
  }

  if (!isFiniteNumber(params.revenue)) {
    return {
      eligible: false,
      reason: "Revenue is missing, so the deal cannot be benchmarked."
    };
  }

  if (!isFiniteNumber(params.adjustedEbitda)) {
    return {
      eligible: false,
      reason: "Adjusted EBITDA is missing, so the deal cannot be benchmarked."
    };
  }

  if (!normalizeText(params.industry)) {
    return {
      eligible: false,
      reason: "Industry is missing, so peer benchmarking would not be comparable."
    };
  }

  if (!params.hasFinancialStatements) {
    return {
      eligible: false,
      reason: "Financial statements are missing, so benchmark inputs are incomplete."
    };
  }

  if (params.blockerCount > 0) {
    return {
      eligible: false,
      reason: "Open blockers remain, so the benchmark set would not be decision-grade."
    };
  }

  if (params.financialsConfidence === "low") {
    return {
      eligible: false,
      reason: "Financial confidence is low, so the benchmark set would be unreliable."
    };
  }

  if (
    params.reconciliationStatus !== "balanced" &&
    params.reconciliationStatus !== "partial"
  ) {
    return {
      eligible: false,
      reason: "Financials do not reconcile well enough for benchmark use."
    };
  }

  return {
    eligible: true,
    reason: "Snapshot is benchmark-eligible because core financial and classification inputs are complete."
  };
}

export function buildDealFinancialOutputsFromRuntime(
  context: DealMemoryRuntimeContext
): DealFinancialOutputs {
  const hasSnapshot = Boolean(context.data.snapshot.periodId);

  return {
    companyId: context.data.company.id,
    revenue: hasSnapshot ? context.data.snapshot.revenue : null,
    ebitda: hasSnapshot ? context.data.snapshot.ebitda : null,
    adjustedEbitda: hasSnapshot ? context.data.snapshot.adjustedEbitda : null,
    ebitdaMargin: hasSnapshot ? context.data.snapshot.ebitdaMarginPercent : null,
    industry: context.data.company.industry,
    businessModel: null,
    reconciliationStatus: context.data.reconciliation.status,
    financialsConfidence: normalizeConfidenceLabel(context.data.dataQuality.confidenceLabel)
  };
}

export function buildDealAddbackSummaryFromRuntime(
  context: DealMemoryRuntimeContext
): DealAddbackSummary {
  const items = context.acceptedAddBackItems.map((item) => ({
    type: item.type,
    amount: item.amount,
    status: item.status
  }));

  const addbackTypes = Array.from(
    new Set(items.map((item) => item.type).filter((value): value is string => Boolean(value)))
  ).sort((left, right) => left.localeCompare(right));

  return {
    items,
    addbackCount: items.length,
    addbackValue: items.length === 0
      ? null
      : items.reduce((total, item) => total + (isFiniteNumber(item.amount) ? item.amount : 0), 0),
    addbackTypes
  };
}

export function buildDealRiskSummaryFromRuntime(
  context: DealMemoryRuntimeContext
): DealRiskSummary {
  return {
    riskFlags: context.riskFlags,
    blockerCount: summarizeBlockingReasons(context).length
  };
}

export function buildDealWorkflowStateFromRuntime(
  context: DealMemoryRuntimeContext
): DealWorkflowState {
  return {
    companyId: context.data.company.id,
    industry: context.data.company.industry,
    businessModel: null,
    completionPercent: context.data.completionSummary.completionPercent,
    currentStage: mapPortfolioStatusToStage(context.portfolioState.status),
    snapshotReason: summarizeSnapshotReason(context)
  };
}

export function buildDealDataQualitySummaryFromRuntime(
  context: DealMemoryRuntimeContext
): DealDataQualitySummary {
  const financialOutputs = buildDealFinancialOutputsFromRuntime(context);
  const blockerCount = summarizeBlockingReasons(context).length;
  const hasTaxReturns =
    context.data.taxSourceStatus.documentCount > 0 &&
    context.data.taxSourceStatus.rowCount > 0;
  const hasFinancialStatements =
    context.data.periods.length > 0 && context.data.entries.length > 0;
  const sourceCompletenessScore = context.data.dataQuality.confidenceScore;
  const financialsConfidence =
    normalizeConfidenceLabel(context.data.dataQuality.confidenceLabel) ?? "low";
  const isSnapshotReady =
    context.data.completionSummary.completionStatus !== "blocked" &&
    context.data.readiness.status !== "blocked" &&
    context.data.reconciliation.status !== "failed" &&
    Boolean(context.data.snapshot.periodId);
  const benchmarkEligibility = explainBenchmarkEligibility({
    isSnapshotReady,
    revenue: financialOutputs.revenue ?? null,
    adjustedEbitda: financialOutputs.adjustedEbitda ?? null,
    industry: financialOutputs.industry ?? null,
    blockerCount,
    financialsConfidence,
    reconciliationStatus: normalizeReconciliationStatus(
      financialOutputs.reconciliationStatus
    ),
    hasFinancialStatements
  });

  return {
    sourceCompletenessScore,
    hasTaxReturns,
    hasFinancialStatements,
    financialsConfidence,
    reconciliationStatus: financialOutputs.reconciliationStatus,
    isSnapshotReady,
    isBenchmarkEligible: benchmarkEligibility.eligible,
    snapshotReason: summarizeSnapshotReason(context) ?? benchmarkEligibility.reason
  };
}

const dealMemoryRuntimeContextCache = new Map<string, Promise<DealMemoryRuntimeContext>>();

async function loadDealMemoryRuntimeContext(
  dealId: string
): Promise<DealMemoryRuntimeContext> {
  const existing = dealMemoryRuntimeContextCache.get(dealId);
  if (existing) {
    return existing;
  }

  const pending = (async () => {
    const [{ getDashboardData }, { buildCreditScenario }, { buildRiskFlags }, { derivePortfolioDealState }] =
      await Promise.all([
        import("./data.ts"),
        import("./credit-scenario.ts"),
        import("./risk-flags.ts"),
        import("./portfolio-deal-state.ts")
      ]);

    const data = (await getDashboardData(dealId)) as DealMemoryRuntimeData;

    if (!data.company || data.company.id !== dealId) {
      throw new Error(`Unable to load deal memory context for ${dealId}.`);
    }

    const acceptedAddBackItems = data.addBackReviewItems.filter(
      (item) => item.periodId === data.snapshot.periodId && item.status === "accepted"
    );
    const creditScenario = buildCreditScenario({
      inputs: {
        loanAmount: null,
        annualInterestRatePercent: null,
        loanTermYears: null,
        amortizationYears: null,
        collateralValue: null
      },
      ebitda: data.snapshot.adjustedEbitda
    });
    const riskFlags = buildRiskFlags({
      snapshot: data.snapshot,
      creditScenario,
      readiness: data.readiness,
      dataQuality: data.dataQuality,
      acceptedAddBackItems
    }) as RealRiskFlag[];
    const portfolioState = derivePortfolioDealState({
      companyId: data.company.id,
      completionSummary: data.completionSummary,
      readiness: data.readiness,
      taxSourceStatus: data.taxSourceStatus,
      snapshot: data.snapshot
    }) as RealPortfolioDealState;

    return {
      dealId,
      data,
      acceptedAddBackItems,
      riskFlags,
      portfolioState
    };
  })();

  dealMemoryRuntimeContextCache.set(dealId, pending);

  try {
    return await pending;
  } catch (error) {
    dealMemoryRuntimeContextCache.delete(dealId);
    throw error;
  }
}

export async function getDealFinancialOutputs(dealId: string): Promise<DealFinancialOutputs> {
  return buildDealFinancialOutputsFromRuntime(await loadDealMemoryRuntimeContext(dealId));
}

export async function getDealAddbackSummary(dealId: string): Promise<DealAddbackSummary> {
  return buildDealAddbackSummaryFromRuntime(await loadDealMemoryRuntimeContext(dealId));
}

export async function getDealRiskSummary(dealId: string): Promise<DealRiskSummary> {
  return buildDealRiskSummaryFromRuntime(await loadDealMemoryRuntimeContext(dealId));
}

export async function getDealWorkflowState(dealId: string): Promise<DealWorkflowState> {
  return buildDealWorkflowStateFromRuntime(await loadDealMemoryRuntimeContext(dealId));
}

export async function getDealDataQualitySummary(
  dealId: string
): Promise<DealDataQualitySummary> {
  return buildDealDataQualitySummaryFromRuntime(await loadDealMemoryRuntimeContext(dealId));
}

const defaultDealMemoryHelpers: DealMemoryHelpers = {
  getDealFinancialOutputs,
  getDealAddbackSummary,
  getDealRiskSummary,
  getDealWorkflowState,
  getDealDataQualitySummary,
  now: () => new Date()
};

export async function buildDealMemorySnapshotWithHelpers(
  dealId: string,
  helpers: DealMemoryHelpers
): Promise<DealMemorySnapshot> {
  const [
    financialOutputs,
    addbackSummary,
    riskSummary,
    workflowState,
    dataQualitySummary
  ] = await Promise.all([
    helpers.getDealFinancialOutputs(dealId),
    helpers.getDealAddbackSummary(dealId),
    helpers.getDealRiskSummary(dealId),
    helpers.getDealWorkflowState(dealId),
    helpers.getDealDataQualitySummary(dealId)
  ]);

  const companyId =
    normalizeText(financialOutputs.companyId) ?? normalizeText(workflowState.companyId);

  if (!companyId) {
    throw new Error(`Unable to build deal memory snapshot for ${dealId}: companyId is required.`);
  }

  const revenue = isFiniteNumber(financialOutputs.revenue)
    ? financialOutputs.revenue
    : null;
  const ebitda = isFiniteNumber(financialOutputs.ebitda)
    ? financialOutputs.ebitda
    : null;
  const adjustedEbitda = isFiniteNumber(financialOutputs.adjustedEbitda)
    ? financialOutputs.adjustedEbitda
    : null;
  const industry =
    normalizeText(financialOutputs.industry) ?? normalizeText(workflowState.industry);
  const businessModel =
    normalizeText(financialOutputs.businessModel) ??
    normalizeText(workflowState.businessModel);
  const reconciliationStatus = normalizeReconciliationStatus(
    financialOutputs.reconciliationStatus ?? dataQualitySummary.reconciliationStatus
  );
  const sourceCompletenessScore = isFiniteNumber(dataQualitySummary.sourceCompletenessScore)
    ? clampPercent(dataQualitySummary.sourceCompletenessScore, 0)
    : null;
  const hasTaxReturns = dataQualitySummary.hasTaxReturns === true;
  const hasFinancialStatements = dataQualitySummary.hasFinancialStatements === true;
  const financialsConfidence = deriveFinancialsConfidence({
    explicitConfidence:
      financialOutputs.financialsConfidence ?? dataQualitySummary.financialsConfidence ?? null,
    sourceCompletenessScore,
    reconciliationStatus,
    revenue,
    ebitda
  });
  const addbackRollup = summarizeAcceptedAddbacks(addbackSummary);
  const riskFlags = Array.isArray(riskSummary.riskFlags) ? riskSummary.riskFlags : [];
  const blockerCount = Number.isInteger(riskSummary.blockerCount)
    ? Math.max(0, riskSummary.blockerCount ?? 0)
    : 0;
  const completionPercent = clampPercent(workflowState.completionPercent, 0);
  const currentStage = normalizeCurrentStage(workflowState.currentStage);
  const isSnapshotReady =
    typeof dataQualitySummary.isSnapshotReady === "boolean"
      ? dataQualitySummary.isSnapshotReady
      : deriveSnapshotReadiness({
          blockerCount,
          completionPercent,
          reconciliationStatus,
          sourceCompletenessScore,
          hasFinancialStatements,
          revenue,
          adjustedEbitda
        });
  const benchmarkEligibility = explainBenchmarkEligibility({
    isSnapshotReady,
    revenue,
    adjustedEbitda,
    industry,
    blockerCount,
    financialsConfidence,
    reconciliationStatus,
    hasFinancialStatements
  });

  return {
    dealId,
    companyId,
    snapshotAt: helpers.now().toISOString(),
    revenue,
    ebitda,
    adjustedEbitda,
    ebitdaMargin: isFiniteNumber(financialOutputs.ebitdaMargin)
      ? financialOutputs.ebitdaMargin
      : computeEbitdaMargin(ebitda, revenue),
    industry,
    businessModel,
    revenueBand: deriveRevenueBand(revenue),
    sourceCompletenessScore,
    hasTaxReturns,
    hasFinancialStatements,
    reconciliationStatus,
    addbackCount: addbackRollup.addbackCount,
    addbackValue: addbackRollup.addbackValue,
    addbackTypes: addbackRollup.addbackTypes,
    riskFlags,
    blockerCount,
    completionPercent,
    currentStage,
    isSnapshotReady,
    isBenchmarkEligible:
      typeof dataQualitySummary.isBenchmarkEligible === "boolean"
        ? dataQualitySummary.isBenchmarkEligible
        : benchmarkEligibility.eligible,
    financialsConfidence,
    snapshotReason:
      typeof dataQualitySummary.isBenchmarkEligible === "boolean" &&
      typeof dataQualitySummary.snapshotReason === "string"
        ? normalizeText(dataQualitySummary.snapshotReason)
        : (typeof dataQualitySummary.isBenchmarkEligible === "boolean"
            ? dataQualitySummary.isBenchmarkEligible
            : benchmarkEligibility.eligible)
          ? normalizeText(dataQualitySummary.snapshotReason) ??
            normalizeText(workflowState.snapshotReason) ??
            benchmarkEligibility.reason
          : normalizeText(dataQualitySummary.snapshotReason) ?? benchmarkEligibility.reason
  };
}

export async function buildDealMemorySnapshot(dealId: string) {
  return buildDealMemorySnapshotWithHelpers(dealId, defaultDealMemoryHelpers);
}

export function mapDealMemorySnapshotToInsertRow(
  snapshot: DealMemorySnapshot
): DealMemoryInsertRow {
  return {
    deal_id: snapshot.dealId,
    company_id: snapshot.companyId,
    snapshot_at: snapshot.snapshotAt,
    revenue: snapshot.revenue,
    ebitda: snapshot.ebitda,
    adjusted_ebitda: snapshot.adjustedEbitda,
    ebitda_margin: snapshot.ebitdaMargin,
    industry: snapshot.industry,
    business_model: snapshot.businessModel,
    revenue_band: snapshot.revenueBand,
    source_completeness_score: snapshot.sourceCompletenessScore,
    has_tax_returns: snapshot.hasTaxReturns,
    has_financial_statements: snapshot.hasFinancialStatements,
    reconciliation_status: snapshot.reconciliationStatus,
    addback_count: snapshot.addbackCount,
    addback_value: snapshot.addbackValue,
    addback_types: snapshot.addbackTypes,
    risk_flags: snapshot.riskFlags,
    blocker_count: snapshot.blockerCount,
    completion_percent: snapshot.completionPercent,
    current_stage: snapshot.currentStage,
    is_snapshot_ready: snapshot.isSnapshotReady,
    is_benchmark_eligible: snapshot.isBenchmarkEligible,
    financials_confidence: snapshot.financialsConfidence,
    snapshot_reason: snapshot.snapshotReason
  };
}
