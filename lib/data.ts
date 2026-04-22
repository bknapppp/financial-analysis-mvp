import {
  assessDealStageReadinessConsistency,
  getDealStage,
  getDealStageLabel,
  getDealStageSortOrder,
  isActiveDealStage,
  isTerminalDealStage,
  type DealStage
} from "./deal-stage.ts";
import { buildDataQualityReport } from "./data-quality.ts";
import { buildDataReadiness } from "./data-readiness.ts";
import {
  buildEmptyTaxSourceStatus,
  DEFAULT_UNDERWRITING_INPUTS,
  EMPTY_SNAPSHOT,
  getCompanies,
  getDealDerivedContext
} from "./deal-derived-context.ts";
import { buildDealDecision } from "./deal-decision.ts";
import {
  buildEmptyDiligenceIssueFeedback,
  resolveDiligenceIssueActionTarget,
  summarizeDiligenceIssues,
  syncDiligenceIssuesForContext
} from "./diligence-issues.ts";
import { groupDiligenceIssues } from "./diligence-issue-groups.ts";
import { deriveDiligenceReadiness } from "./diligence-readiness.ts";
import {
  derivePortfolioDealState,
  getPrimaryRiskSeverity,
  type PortfolioDealStatus,
  type PortfolioReadinessBlockerCategory,
  type PortfolioReadinessStateKey
} from "./portfolio-deal-state.ts";
import { buildRiskFlags } from "./risk-flags.ts";
import { buildUnderwritingAnalysis } from "./underwriting/analysis.ts";
import type { Company, DashboardData, SimilarDeal } from "./types.ts";

export type DealScreenerRow = {
  companyId: string;
  companyName: string;
  industry: string | null;
  stage: DealStage;
  stageLabel: string;
  stageSortOrder: number;
  stageUpdatedAt: string | null;
  stageNotes: string | null;
  isActiveStage: boolean;
  isTerminalStage: boolean;
  stageReadinessMismatchReason: string | null;
  backingStatus: DashboardData["backing"]["summary"]["overall"]["status"];
  readinessStateKey: PortfolioReadinessStateKey;
  status: PortfolioDealStatus;
  blockerCount: number;
  openIssueCount: number;
  criticalIssueCount: number;
  diligenceReadinessLabel: string;
  diligenceReadinessReason: string;
  diligenceReadinessRank: number;
  primaryBlockerLabel: string | null;
  primaryBlockerIssueTitle: string | null;
  primaryBlockerCategory: PortfolioReadinessBlockerCategory | null;
  completionPercent: number;
  currentBlocker: string | null;
  nextAction: string;
  nextActionHref: string;
  revenue: number | null;
  ebitda: number | null;
  adjustedEbitda: number | null;
  acceptedAddBacks: number | null;
  ebitdaMarginPercent: number | null;
  addBacksPercent: number | null;
  hasAddBacks: boolean;
  addBacksAboveThreshold: boolean;
  dscr: number | null;
  debtToEbitda: number | null;
  ltv: number | null;
  decision: "approve" | "caution" | "decline";
  primaryRisk: string | null;
  riskSeverity: "high" | "medium" | "low" | null;
  lastUpdated: string | null;
  owner: string | null;
};

function buildEmptyDashboardData(companies: Company[]): DashboardData {
  const emptyQuality = buildDataQualityReport({
    entries: [],
    savedMappings: [],
    snapshots: []
  });
  const emptyReconciliation = {
    status: "reconciled" as const,
    label: "Reconciles" as const,
    summaryMessage: "No company is loaded yet.",
    withinTolerance: true,
    issues: []
  };
  const emptyTaxSourceStatus = buildEmptyTaxSourceStatus();
  const emptyUnderwritingAnalysis = buildUnderwritingAnalysis({
    snapshot: EMPTY_SNAPSHOT,
    entries: [],
    dataQuality: emptyQuality,
    taxSourceStatus: emptyTaxSourceStatus,
    reconciliation: emptyReconciliation,
    underwritingInputs: DEFAULT_UNDERWRITING_INPUTS,
    ebitdaBasis: "adjusted"
  });

  return {
    companies,
    company: null,
    stage: getDealStage(null),
    stageAssessment: assessDealStageReadinessConsistency({
      stage: getDealStage(null),
      diligenceReadiness: deriveDiligenceReadiness({ issues: [] }),
      completionSummary: {
        completionStatus: "blocked",
        completionPercent: 0,
        blockers: []
      }
    }),
    periods: [],
    entries: [],
    accountMappings: [],
    addBacks: [],
    addBackReviewItems: [],
    snapshots: [],
    snapshot: EMPTY_SNAPSHOT,
    series: [],
    incomeStatement: [],
    balanceSheet: [],
    insights: [],
    driverAnalyses: [],
    recommendedActions: [],
    executiveSummary: null,
    similarDeals: [],
    dataQuality: emptyQuality,
    readiness: buildDataReadiness({
      snapshot: EMPTY_SNAPSHOT,
      entries: [],
      addBacks: [],
      reviewItems: [],
      reconciliation: emptyReconciliation,
      dataQuality: emptyQuality
    }),
    taxSourceStatus: emptyTaxSourceStatus,
    documents: [],
    documentLinks: [],
    documentVersions: [],
    backing: {
      sourceRequirements: [],
      financialLineItems: [],
      underwritingAdjustments: [],
      underwritingMetrics: [],
      summary: {
        overall: {
          id: "overall",
          label: "Overall",
          status: "unbacked",
          href: "/",
          note: "No deal selected"
        },
        financials: {
          id: "financials",
          label: "Financials",
          status: "unbacked",
          href: "/financials",
          note: "No deal selected"
        },
        adjustments: {
          id: "adjustments",
          label: "Adjustments",
          status: "unbacked",
          href: "/",
          note: "No deal selected"
        },
        creditInputs: {
          id: "credit_inputs",
          label: "Credit Inputs",
          status: "unbacked",
          href: "/",
          note: "No deal selected"
        }
      }
    },
    diligenceIssues: [],
    diligenceIssueSummary: summarizeDiligenceIssues([]),
    diligenceIssueGroups: [],
    diligenceReadiness: deriveDiligenceReadiness({ issues: [] }),
    diligenceIssueFeedback: buildEmptyDiligenceIssueFeedback(),
    completionSummary: emptyUnderwritingAnalysis.completionSummary,
    ebitdaBridge: null,
    reconciliation: emptyReconciliation,
    normalizedPeriods: [],
    normalizedOutput: null
  };
}

function buildDashboardDataForCompany(params: {
  companies: Company[];
  context: NonNullable<Awaited<ReturnType<typeof getDealDerivedContext>>>;
  diligenceIssues: DashboardData["diligenceIssues"];
  diligenceIssueFeedback: DashboardData["diligenceIssueFeedback"];
}): DashboardData {
  const { companies, context, diligenceIssues, diligenceIssueFeedback } = params;
  const diligenceIssueGroups = groupDiligenceIssues({ issues: diligenceIssues });
  const diligenceReadiness = deriveDiligenceReadiness({ issues: diligenceIssues });
  const stage = getDealStage(context.company.stage);
  const stageAssessment = assessDealStageReadinessConsistency({
    stage,
    diligenceReadiness,
    completionSummary: context.completionSummary
  });

  return {
    companies,
    company: context.company,
    stage,
    stageAssessment,
    periods: context.periods,
    entries: context.entries,
    accountMappings: context.accountMappings,
    addBacks: context.addBacks,
    addBackReviewItems: context.addBackReviewItems,
    snapshots: context.snapshots,
    snapshot: context.snapshot,
    series: context.series,
    incomeStatement: context.incomeStatement,
    balanceSheet: context.balanceSheet,
    insights: context.insights,
    driverAnalyses: context.driverAnalyses,
    recommendedActions: context.recommendedActions,
    executiveSummary: context.executiveSummary,
    similarDeals: [],
    dataQuality: context.dataQuality,
    readiness: context.readiness,
    taxSourceStatus: context.taxSourceStatus,
    documents: context.documents,
    documentLinks: context.documentLinks,
    documentVersions: context.documentVersions,
    backing: context.backing,
    diligenceIssues,
    diligenceIssueSummary: summarizeDiligenceIssues(diligenceIssues),
    diligenceIssueGroups,
    diligenceReadiness,
    diligenceIssueFeedback,
    completionSummary: context.completionSummary,
    ebitdaBridge: context.ebitdaBridge,
    reconciliation: context.reconciliation,
    normalizedPeriods: context.normalizedPeriods,
    normalizedOutput: context.normalizedOutput
  };
}

async function buildDealScreenerRow(params: {
  context: NonNullable<Awaited<ReturnType<typeof getDealDerivedContext>>>;
}): Promise<DealScreenerRow> {
  const { context } = params;
  const snapshot = context.snapshot;
  const underwritingAnalysis = buildUnderwritingAnalysis({
    snapshot,
    entries: context.entries,
    dataQuality: context.dataQuality,
    taxSourceStatus: context.taxSourceStatus,
    reconciliation: context.reconciliation,
    underwritingInputs: DEFAULT_UNDERWRITING_INPUTS,
    ebitdaBasis: "adjusted"
  });
  const creditScenario = underwritingAnalysis.creditScenario;
  const acceptedAddBackItems = context.addBackReviewItems.filter(
    (item) => item.periodId === snapshot.periodId && item.status === "accepted"
  );
  const riskFlags = buildRiskFlags({
    snapshot,
    creditScenario,
    readiness: context.readiness,
    dataQuality: context.dataQuality,
    acceptedAddBackItems
  });
  const decision = buildDealDecision({
    snapshot,
    creditScenario,
    riskFlags,
    acceptedAddBackTotal: snapshot.acceptedAddBacks ?? 0
  });
  const latestPeriod = context.periods[context.periods.length - 1] ?? null;
  const latestAddBack = context.addBacks
    .slice()
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null;
  const diligenceIssueSync = await syncDiligenceIssuesForContext(context);
  const diligenceIssues = diligenceIssueSync.issues;
  const diligenceIssueSummary = summarizeDiligenceIssues(diligenceIssues);
  const diligenceReadiness = deriveDiligenceReadiness({ issues: diligenceIssues });
  const stage = getDealStage(context.company.stage);
  const stageAssessment = assessDealStageReadinessConsistency({
    stage,
    diligenceReadiness,
    completionSummary: context.completionSummary
  });
  const lastUpdated =
    [
      latestAddBack?.updated_at,
      latestPeriod?.created_at,
      context.company.stage_updated_at,
      context.company.created_at
    ]
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.localeCompare(left))[0] ?? null;
  const portfolioState = derivePortfolioDealState({
    companyId: context.company.id,
    completionSummary: context.completionSummary,
    readiness: context.readiness,
    taxSourceStatus: context.taxSourceStatus,
    diligenceIssues,
    snapshot,
    screenerOutputs: {
      completionSummary: context.completionSummary,
      dataQuality: context.dataQuality,
      reconciliation: context.reconciliation,
      creditScenario
    }
  });
  const topOpenIssue = diligenceIssueSummary.topOpenIssue;
  const topOpenIssueAction = topOpenIssue
    ? resolveDiligenceIssueActionTarget(topOpenIssue)
    : null;

  return {
    companyId: context.company.id,
    companyName: context.company.name,
    industry: context.company.industry,
    stage,
    stageLabel: getDealStageLabel(stage),
    stageSortOrder: getDealStageSortOrder(stage),
    stageUpdatedAt: context.company.stage_updated_at,
    stageNotes: context.company.stage_notes,
    isActiveStage: isActiveDealStage(stage),
    isTerminalStage: isTerminalDealStage(stage),
    stageReadinessMismatchReason: stageAssessment.stageReadinessMismatchReason,
    backingStatus: context.backing.summary.overall.status,
    readinessStateKey: portfolioState.stateKey,
    status: portfolioState.status,
    blockerCount:
      diligenceIssueSummary.open + diligenceIssueSummary.inReview > 0
        ? diligenceIssueSummary.open + diligenceIssueSummary.inReview
        : portfolioState.blockers.length,
    openIssueCount: diligenceIssueSummary.open + diligenceIssueSummary.inReview,
    criticalIssueCount: diligenceIssueSummary.criticalOpen,
    diligenceReadinessLabel: diligenceReadiness.readinessLabel,
    diligenceReadinessReason: diligenceReadiness.readinessReason,
    diligenceReadinessRank: diligenceReadiness.readinessPriorityRank,
    primaryBlockerLabel: diligenceReadiness.primaryBlockerLabel,
    primaryBlockerIssueTitle: diligenceReadiness.primaryBlockerIssueTitle,
    primaryBlockerCategory: portfolioState.primaryBlocker?.category ?? null,
    completionPercent: context.completionSummary.completionPercent,
    currentBlocker:
      diligenceReadiness.primaryBlockerIssueTitle ??
      topOpenIssue?.title ??
      diligenceReadiness.readinessReason ??
      portfolioState.currentBlocker,
    nextAction: topOpenIssueAction?.actionLabel ?? portfolioState.nextAction,
    nextActionHref: topOpenIssueAction?.linkedRoute ?? portfolioState.nextActionHref,
    revenue: snapshot.periodId ? snapshot.revenue : null,
    ebitda: snapshot.periodId ? snapshot.ebitda : null,
    adjustedEbitda: snapshot.periodId ? snapshot.adjustedEbitda : null,
    acceptedAddBacks: snapshot.periodId ? snapshot.acceptedAddBacks : null,
    ebitdaMarginPercent: snapshot.periodId ? snapshot.ebitdaMarginPercent : null,
    addBacksPercent:
      snapshot.periodId && snapshot.ebitda !== null && snapshot.ebitda !== 0
        ? (snapshot.acceptedAddBacks / Math.abs(snapshot.ebitda)) * 100
        : null,
    hasAddBacks: portfolioState.hasAddBacks,
    addBacksAboveThreshold: portfolioState.addBacksAboveThreshold,
    dscr: creditScenario.metrics.dscr.value,
    debtToEbitda: creditScenario.metrics.debtToEbitda.value,
    ltv: creditScenario.metrics.ltv.value,
    decision: decision.recommendation,
    primaryRisk: riskFlags[0]?.title ?? null,
    riskSeverity: getPrimaryRiskSeverity(riskFlags.map((flag) => flag.severity)),
    lastUpdated,
    owner: null
  };
}

function isWithinRange(base: number | null, candidate: number | null) {
  if (base === null || candidate === null || !Number.isFinite(base) || !Number.isFinite(candidate)) {
    return false;
  }

  if (base === 0) {
    return candidate === 0;
  }

  return candidate >= base * 0.5 && candidate <= base * 1.5;
}

function buildSimilarDeals(currentRow: DealScreenerRow, rows: DealScreenerRow[]): SimilarDeal[] {
  const filtered = rows.filter((row) => {
    if (row.companyId === currentRow.companyId) {
      return false;
    }

    if (!isWithinRange(currentRow.ebitda, row.ebitda)) {
      return false;
    }

    if (currentRow.revenue !== null) {
      return isWithinRange(currentRow.revenue, row.revenue);
    }

    return true;
  });

  return filtered.slice(0, 5).map((row) => ({
    companyId: row.companyId,
    companyName: row.companyName,
    revenue: row.revenue,
    ebitda: row.ebitda,
    ebitdaMarginPercent: row.ebitdaMarginPercent,
    adjustedEbitda: row.adjustedEbitda,
    acceptedAddBacks: row.acceptedAddBacks,
    addBacksPercent: row.addBacksPercent,
    decision: row.decision,
    primaryRisk: row.primaryRisk
  }));
}

export async function getSimilarDeals(companyId: string): Promise<SimilarDeal[]> {
  try {
    const companies = await getCompanies();

    if (!companies.some((company) => company.id === companyId)) {
      return [];
    }

    const comparableRows = (
      await Promise.all(
        companies.map(async (company) => {
          const context = await getDealDerivedContext(company.id);
          return context ? await buildDealScreenerRow({ context }) : null;
        })
      )
    ).filter((row): row is DealScreenerRow => Boolean(row));
    const currentRow = comparableRows.find((row) => row.companyId === companyId) ?? null;

    return currentRow ? buildSimilarDeals(currentRow, comparableRows) : [];
  } catch {
    return [];
  }
}

export async function getDashboardData(
  companyId?: string,
  options?: { includeSimilarDeals?: boolean }
): Promise<DashboardData> {
  try {
    const companies = await getCompanies();
    if (process.env.NODE_ENV !== "production") {
      console.info("getDashboardData fetched companies", {
        requestedCompanyId: companyId ?? null,
        companyIds: companies.map((item) => item.id)
      });
    }
    const company = companies.find((item) => item.id === companyId) ?? companies[0] ?? null;

    if (process.env.NODE_ENV !== "production") {
      console.info("getDashboardData resolved company", {
        requestedCompanyId: companyId ?? null,
        resolvedCompanyId: company?.id ?? null,
        resolvedCompanyName: company?.name ?? null
      });
    }

    if (!company) {
      return buildEmptyDashboardData(companies);
    }

    if (process.env.NODE_ENV !== "production") {
      console.info("getDashboardData loading derived context", {
        requestedCompanyId: companyId ?? null,
        derivedContextLookupCompanyId: company.id
      });
    }
    const context = await getDealDerivedContext(company.id);

    if (!context) {
      return buildEmptyDashboardData(companies);
    }

    const diligenceIssueSync = await syncDiligenceIssuesForContext(context);
    const dashboardData = buildDashboardDataForCompany({
      companies,
      context,
      diligenceIssues: diligenceIssueSync.issues,
      diligenceIssueFeedback: diligenceIssueSync.feedback
    });

    return {
      ...dashboardData,
      similarDeals:
        options?.includeSimilarDeals && company.id
          ? await getSimilarDeals(company.id)
          : []
    };
  } catch {
    return buildEmptyDashboardData([]);
  }
}

export async function getDealScreenerRows(): Promise<DealScreenerRow[]> {
  const companies = await getCompanies();

  return (
    await Promise.all(
      companies.map(async (company) => {
        const context = await getDealDerivedContext(company.id);
        return context ? await buildDealScreenerRow({ context }) : null;
      })
    )
  ).filter((row): row is DealScreenerRow => Boolean(row));
}
