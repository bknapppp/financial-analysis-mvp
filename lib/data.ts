import { buildCreditScenario } from "@/lib/credit-scenario";
import { buildDataQualityReport } from "@/lib/data-quality";
import { buildDataReadiness } from "@/lib/data-readiness";
import {
  buildEmptyTaxSourceStatus,
  DEFAULT_UNDERWRITING_INPUTS,
  EMPTY_SNAPSHOT,
  getCompanies,
  getDealDerivedContext
} from "@/lib/deal-derived-context";
import { buildDealDecision } from "@/lib/deal-decision";
import {
  derivePortfolioDealState,
  getPrimaryRiskSeverity,
  type PortfolioDealStatus,
  type PortfolioReadinessBlockerCategory,
  type PortfolioReadinessStateKey
} from "@/lib/portfolio-deal-state";
import { buildRiskFlags } from "@/lib/risk-flags";
import { buildUnderwritingCompletion } from "@/lib/underwriting/completion";
import type { Company, DashboardData, SimilarDeal } from "@/lib/types";

export type DealScreenerRow = {
  companyId: string;
  companyName: string;
  industry: string | null;
  readinessStateKey: PortfolioReadinessStateKey;
  status: PortfolioDealStatus;
  blockerCount: number;
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
  const emptyCreditScenario = buildCreditScenario({
    inputs: DEFAULT_UNDERWRITING_INPUTS,
    ebitda: EMPTY_SNAPSHOT.adjustedEbitda
  });

  return {
    companies,
    company: null,
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
    completionSummary: buildUnderwritingCompletion({
      snapshot: EMPTY_SNAPSHOT,
      entries: [],
      dataQuality: emptyQuality,
      taxSourceStatus: emptyTaxSourceStatus,
      underwritingInputs: DEFAULT_UNDERWRITING_INPUTS,
      creditScenario: emptyCreditScenario
    }),
    ebitdaBridge: null,
    reconciliation: emptyReconciliation,
    normalizedPeriods: [],
    normalizedOutput: null
  };
}

function buildDashboardDataForCompany(params: {
  companies: Company[];
  context: NonNullable<Awaited<ReturnType<typeof getDealDerivedContext>>>;
}): DashboardData {
  const { companies, context } = params;

  return {
    companies,
    company: context.company,
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
    completionSummary: context.completionSummary,
    ebitdaBridge: context.ebitdaBridge,
    reconciliation: context.reconciliation,
    normalizedPeriods: context.normalizedPeriods,
    normalizedOutput: context.normalizedOutput
  };
}

function buildDealScreenerRow(params: {
  context: NonNullable<Awaited<ReturnType<typeof getDealDerivedContext>>>;
}): DealScreenerRow {
  const { context } = params;
  const snapshot = context.snapshot;
  const creditScenario = buildCreditScenario({
    inputs: DEFAULT_UNDERWRITING_INPUTS,
    ebitda: snapshot.adjustedEbitda
  });
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
  const lastUpdated =
    latestAddBack?.updated_at ?? latestPeriod?.created_at ?? context.company.created_at ?? null;
  const portfolioState = derivePortfolioDealState({
    companyId: context.company.id,
    completionSummary: context.completionSummary,
    readiness: context.readiness,
    taxSourceStatus: context.taxSourceStatus,
    snapshot
  });

  return {
    companyId: context.company.id,
    companyName: context.company.name,
    industry: context.company.industry,
    readinessStateKey: portfolioState.stateKey,
    status: portfolioState.status,
    blockerCount: portfolioState.blockers.length,
    primaryBlockerCategory: portfolioState.primaryBlocker?.category ?? null,
    completionPercent: context.completionSummary.completionPercent,
    currentBlocker: portfolioState.currentBlocker,
    nextAction: portfolioState.nextAction,
    nextActionHref: portfolioState.nextActionHref,
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
          return context ? buildDealScreenerRow({ context }) : null;
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
    const company = companies.find((item) => item.id === companyId) ?? companies[0] ?? null;

    if (!company) {
      return buildEmptyDashboardData(companies);
    }

    const context = await getDealDerivedContext(company.id);

    if (!context) {
      return buildEmptyDashboardData(companies);
    }

    const dashboardData = buildDashboardDataForCompany({ companies, context });

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
        return context ? buildDealScreenerRow({ context }) : null;
      })
    )
  ).filter((row): row is DealScreenerRow => Boolean(row));
}
