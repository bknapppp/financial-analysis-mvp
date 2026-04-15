import {
  buildAddBackReviewItems,
  buildEbitdaBridge,
  generateAddBackSuggestions
} from "@/lib/add-backs";
import { ADD_BACK_SELECT, isAddBacksSchemaError } from "@/lib/add-back-schema";
import { buildCreditScenario } from "@/lib/credit-scenario";
import { buildBalanceSheet, buildIncomeStatement, buildSnapshots } from "@/lib/calculations";
import { buildDataQualityReport } from "@/lib/data-quality";
import { buildDataReadiness } from "@/lib/data-readiness";
import { buildDealDecision } from "@/lib/deal-decision";
import { getSourceFinancialContext } from "@/lib/financial-sources";
import {
  generateDriverAnalyses,
  generateExecutiveSummary,
  generateInsights,
  generateRecommendedActions
} from "@/lib/insights";
import { buildRiskFlags } from "@/lib/risk-flags";
import { getSourceReconciliationForPeriod } from "@/lib/source-reconciliation";
import {
  FINANCIAL_ENTRY_AUDIT_SELECT,
  FINANCIAL_ENTRY_BASE_SELECT,
  isFinancialEntryTraceabilitySchemaError
} from "@/lib/financial-entry-schema";
import { buildNormalizedPeriodOutputs } from "@/lib/normalized-outputs";
import {
  derivePortfolioDealState,
  getPrimaryRiskSeverity,
  type PortfolioDealStatus
} from "@/lib/portfolio-deal-state";
import { getSupabaseServerClient } from "@/lib/supabase";
import { buildUnderwritingCompletion, countBroadClassifications } from "@/lib/underwriting/completion";
import type {
  AccountMapping,
  AddBack,
  Company,
  DashboardData,
  FinancialEntry,
  PeriodSnapshot,
  ReportingPeriod,
  SimilarDeal,
  TaxSourceStatus
} from "@/lib/types";

const EMPTY_SNAPSHOT: PeriodSnapshot = {
  periodId: "",
  label: "No period loaded",
  periodDate: "",
  revenue: 0,
  cogs: 0,
  grossProfit: 0,
  operatingExpenses: 0,
  ebit: null,
  reportedOperatingIncome: null,
  reportedEbitda: null,
  ebitda: null,
  acceptedAddBacks: 0,
  adjustedEbitda: null,
  grossMarginPercent: 0,
  ebitdaMarginPercent: null,
  adjustedEbitdaMarginPercent: null,
  currentAssets: 0,
  currentLiabilities: 0,
  workingCapital: 0,
  revenueGrowthPercent: null,
  ebitdaGrowthPercent: null,
  adjustedEbitdaGrowthPercent: null,
  grossMarginChange: null,
  ebitdaMarginChange: null
};

export type DealScreenerRow = {
  companyId: string;
  companyName: string;
  industry: string | null;
  status: PortfolioDealStatus;
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
    summaryMessage:
      companies.length > 0
        ? "No company is loaded yet."
        : "No company is loaded yet.",
    withinTolerance: true,
    issues: []
  };
  const emptyTaxSourceStatus = buildEmptyTaxSourceStatus();
  const emptyCreditScenario = buildCreditScenario({
    inputs: {
      loanAmount: null,
      annualInterestRatePercent: null,
      loanTermYears: null,
      amortizationYears: null,
      collateralValue: null
    },
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
      underwritingInputs: {
        loanAmount: null,
        annualInterestRatePercent: null,
        loanTermYears: null,
        amortizationYears: null,
        collateralValue: null
      },
      creditScenario: emptyCreditScenario
    }),
    ebitdaBridge: null,
    reconciliation: emptyReconciliation,
    normalizedPeriods: [],
    normalizedOutput: null
  };
}

function buildEmptyTaxSourceStatus(): TaxSourceStatus {
  return {
    documentCount: 0,
    periodCount: 0,
    rowCount: 0,
    mappedLineCount: 0,
    lowConfidenceLineCount: 0,
    broadClassificationCount: 0,
    hasMatchingPeriod: false,
    matchingPeriodLabel: null,
    comparisonStatus: "not_loaded",
    comparisonComputable: false,
    missingComponents: [],
    notes: [],
    revenueDeltaPercent: null,
    reportedEbitdaDeltaPercent: null,
    adjustedEbitdaDeltaPercent: null
  };
}

async function fetchCompanies() {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Company[]>();

  return Array.isArray(data) ? data : [];
}

async function fetchCompanyContext(company: Company) {
  const supabase = getSupabaseServerClient();
  const { data: periodsResult } = await supabase
    .from("reporting_periods")
    .select("*")
    .eq("company_id", company.id)
    .order("period_date", { ascending: true })
    .returns<ReportingPeriod[]>();

  const periods = Array.isArray(periodsResult) ? periodsResult : [];
  const periodIds = periods.map((period) => period.id);

  let entries: FinancialEntry[] = [];
  if (periodIds.length) {
    const auditEntriesQuery = await supabase
      .from("financial_entries")
      .select(FINANCIAL_ENTRY_AUDIT_SELECT)
      .in("period_id", periodIds)
      .returns<FinancialEntry[]>();

    if (
      auditEntriesQuery.error &&
      isFinancialEntryTraceabilitySchemaError(auditEntriesQuery.error)
    ) {
      const baseEntriesQuery = await supabase
        .from("financial_entries")
        .select(FINANCIAL_ENTRY_BASE_SELECT)
        .in("period_id", periodIds)
        .returns<FinancialEntry[]>();

      entries = Array.isArray(baseEntriesQuery.data) ? baseEntriesQuery.data : [];
    } else {
      entries = Array.isArray(auditEntriesQuery.data) ? auditEntriesQuery.data : [];
    }
  }

  const { data: accountMappingsResult } = await supabase
    .from("account_mappings")
    .select("*")
    .eq("company_id", company.id)
    .returns<AccountMapping[]>();

  const accountMappings = Array.isArray(accountMappingsResult) ? accountMappingsResult : [];

  let addBacks: AddBack[] = [];
  if (periodIds.length > 0) {
    const addBackQuery = await supabase
      .from("add_backs")
      .select(ADD_BACK_SELECT)
      .eq("company_id", company.id)
      .in("period_id", periodIds)
      .returns<AddBack[]>();

    if (!addBackQuery.error || !isAddBacksSchemaError(addBackQuery.error)) {
      addBacks = Array.isArray(addBackQuery.data) ? addBackQuery.data : [];
    }
  }

  const taxContext = await getSourceFinancialContext({
    companyId: company.id,
    sourceType: "tax_return"
  });

  return { periods, entries, accountMappings, addBacks, taxContext };
}

function buildDashboardDataForCompany(params: {
  companies: Company[];
  company: Company;
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  accountMappings: AccountMapping[];
  addBacks: AddBack[];
  taxSourceStatus: TaxSourceStatus;
  completionSummary: DashboardData["completionSummary"];
}): DashboardData {
  const {
    companies,
    company,
    periods,
    entries,
    accountMappings,
    addBacks,
    taxSourceStatus,
    completionSummary
  } = params;
  const baselineSnapshots = buildSnapshots(periods, entries, []);
  const addBackSuggestions = generateAddBackSuggestions({
    companyId: company.id,
    periods,
    entries,
    existingAddBacks: addBacks
  });
  const addBackReviewItems = buildAddBackReviewItems({
    addBacks,
    suggestions: addBackSuggestions,
    periods,
    entries
  });
  const snapshots = buildSnapshots(periods, entries, addBacks);
  const snapshot = snapshots[snapshots.length - 1] ?? EMPTY_SNAPSHOT;
  const dataQuality = buildDataQualityReport({
    entries,
    savedMappings: accountMappings,
    snapshots
  });
  const preliminaryNormalizedPeriods = buildNormalizedPeriodOutputs({
    periods,
    snapshots,
    entries,
    accountMappings,
    bridgesByPeriodId: new Map(),
    addBacks
  });
  const preliminaryNormalizedOutput =
    preliminaryNormalizedPeriods[preliminaryNormalizedPeriods.length - 1] ?? null;
  const reconciliation =
    preliminaryNormalizedOutput?.reconciliation ?? {
      status: "reconciled" as const,
      label: "Reconciles" as const,
      summaryMessage: "The normalized financial outputs reconcile within tolerance.",
      withinTolerance: true,
      issues: []
    };
  const readiness = buildDataReadiness({
    snapshot,
    entries,
    addBacks,
    reviewItems: addBackReviewItems,
    dataQuality,
    reconciliation
  });
  const bridgesByPeriodId = new Map(
    snapshots
      .map((periodSnapshot) => {
        const bridge = buildEbitdaBridge({
          snapshot: periodSnapshot,
          periods,
          entries,
          addBacks,
          reviewItems: addBackReviewItems,
          readiness:
            periodSnapshot.periodId === snapshot.periodId
              ? readiness
              : {
                  ...readiness,
                  status: "ready",
                  label: "Ready",
                  blockingReasons: [],
                  cautionReasons: []
                }
        });

        return bridge ? ([periodSnapshot.periodId, bridge] as const) : null;
      })
      .filter(
        (value): value is readonly [string, NonNullable<DashboardData["ebitdaBridge"]>] =>
          Boolean(value)
      )
  );
  const currentBridge = bridgesByPeriodId.get(snapshot.periodId) ?? null;
  const reconciledBridge = currentBridge
    ? {
        ...currentBridge,
        invalidReasons: Array.from(
          new Set([
            ...currentBridge.invalidReasons,
            ...reconciliation.issues
              .filter((issue) => issue.severity === "critical")
              .map((issue) => issue.message)
          ])
        ),
        warnings: Array.from(
          new Set([
            ...currentBridge.warnings,
            ...reconciliation.issues
              .filter((issue) => issue.severity !== "critical")
              .map((issue) => issue.message)
          ])
        )
      }
    : currentBridge;
  const normalizedPeriods = buildNormalizedPeriodOutputs({
    periods,
    snapshots,
    entries,
    accountMappings,
    bridgesByPeriodId,
    addBacks
  });
  const normalizedOutput = normalizedPeriods[normalizedPeriods.length - 1] ?? null;
  const driverAnalyses = generateDriverAnalyses(snapshots);
  const recommendedActions = generateRecommendedActions({
    snapshots,
    driverAnalyses,
    dataQuality
  });

  return {
    companies,
    company,
    periods,
    entries,
    accountMappings,
    addBacks,
    addBackReviewItems,
    snapshots,
    snapshot,
    series: snapshots.map((item) => ({
      label: item.label,
      revenue: item.revenue,
      reportedEbitda: item.reportedEbitda ?? null,
      adjustedEbitda: item.adjustedEbitda
    })),
    incomeStatement: normalizedOutput
      ? normalizedOutput.incomeStatement.rows.map((row) => ({
          label: row.label,
          value: row.value
        }))
      : buildIncomeStatement(snapshot),
    balanceSheet: normalizedOutput
      ? normalizedOutput.balanceSheet.rows.map((row) => ({
          label: row.label,
          value: row.value
        }))
      : buildBalanceSheet(snapshot),
    insights: generateInsights(snapshots),
    driverAnalyses,
    recommendedActions,
    executiveSummary: generateExecutiveSummary({
      companyName: company.name,
      snapshots: snapshots.length > 0 ? snapshots : baselineSnapshots,
      driverAnalyses,
      recommendedActions
    }),
    similarDeals: [],
    dataQuality,
    readiness,
    taxSourceStatus,
    completionSummary,
    ebitdaBridge: reconciledBridge,
    reconciliation,
    normalizedPeriods,
    normalizedOutput
  };
}

function buildTaxSourceStatus(params: {
  taxContext: Awaited<ReturnType<typeof getSourceFinancialContext>>;
  matchedPeriodLabel: string | null;
  comparisonComputable: boolean;
  comparisonMissingComponents: string[];
  comparisonNotes: string[];
  revenueDeltaPercent: number | null;
  reportedEbitdaDeltaPercent: number | null;
  adjustedEbitdaDeltaPercent: number | null;
}): TaxSourceStatus {
  const { taxContext } = params;
  const comparisonStatus =
    taxContext.entries.length === 0
      ? "not_loaded"
      : params.comparisonComputable
        ? "ready"
        : "partial";

  return {
    documentCount: taxContext.documents.length,
    periodCount: taxContext.periods.length,
    rowCount: taxContext.entries.length,
    mappedLineCount: taxContext.entries.filter(
      (entry) => Boolean(entry.category) && Boolean(entry.statement_type)
    ).length,
    lowConfidenceLineCount: taxContext.entries.filter(
      (entry) => entry.confidence === "low"
    ).length,
    broadClassificationCount: countBroadClassifications(
      taxContext.entries.map((entry) => ({
        ...entry,
        period_id: entry.source_period_id
      })) as FinancialEntry[]
    ),
    hasMatchingPeriod: Boolean(params.matchedPeriodLabel),
    matchingPeriodLabel: params.matchedPeriodLabel,
    comparisonStatus,
    comparisonComputable: params.comparisonComputable,
    missingComponents: params.comparisonMissingComponents,
    notes: params.comparisonNotes,
    revenueDeltaPercent: params.revenueDeltaPercent,
    reportedEbitdaDeltaPercent: params.reportedEbitdaDeltaPercent,
    adjustedEbitdaDeltaPercent: params.adjustedEbitdaDeltaPercent
  };
}

function buildDealScreenerRow(params: {
  companies: Company[];
  company: Company;
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  accountMappings: AccountMapping[];
  addBacks: AddBack[];
}): DealScreenerRow {
  const { companies, company, periods, entries, accountMappings, addBacks } = params;
  const snapshots = buildSnapshots(periods, entries, addBacks);
  const snapshot = snapshots[snapshots.length - 1] ?? EMPTY_SNAPSHOT;
  const dataQuality = buildDataQualityReport({
    entries,
    savedMappings: accountMappings,
    snapshots
  });
  const defaultCreditScenario = buildCreditScenario({
    inputs: {
      loanAmount: null,
      annualInterestRatePercent: null,
      loanTermYears: null,
      amortizationYears: null,
      collateralValue: null
    },
    ebitda: snapshot.adjustedEbitda
  });
  const dashboardData = buildDashboardDataForCompany({
    companies,
    company,
    periods,
    entries,
    accountMappings,
    addBacks,
    taxSourceStatus: buildEmptyTaxSourceStatus(),
    completionSummary: buildUnderwritingCompletion({
      snapshot,
      entries,
      dataQuality,
      taxSourceStatus: buildEmptyTaxSourceStatus(),
      underwritingInputs: {
        loanAmount: null,
        annualInterestRatePercent: null,
        loanTermYears: null,
        amortizationYears: null,
        collateralValue: null
      },
      creditScenario: defaultCreditScenario
    })
  });
  const creditScenario = buildCreditScenario({
    inputs: {
      loanAmount: null,
      annualInterestRatePercent: null,
      loanTermYears: null,
      amortizationYears: null,
      collateralValue: null
    },
    ebitda: snapshot.adjustedEbitda
  });
  const acceptedAddBackItems = dashboardData.addBackReviewItems.filter(
    (item) => item.periodId === snapshot.periodId && item.status === "accepted"
  );
  const riskFlags = buildRiskFlags({
    snapshot,
    creditScenario,
    readiness: dashboardData.readiness,
    dataQuality: dashboardData.dataQuality,
    acceptedAddBackItems
  });
  const decision = buildDealDecision({
    snapshot,
    creditScenario,
    riskFlags,
    acceptedAddBackTotal: snapshot.acceptedAddBacks ?? 0
  });
  const latestPeriod = periods[periods.length - 1] ?? null;
  const latestAddBack = addBacks
    .slice()
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))[0] ?? null;
  const lastUpdated =
    latestAddBack?.updated_at ?? latestPeriod?.created_at ?? company.created_at ?? null;
  const portfolioState = derivePortfolioDealState({
    companyId: company.id,
    completionSummary: dashboardData.completionSummary,
    readiness: dashboardData.readiness,
    taxSourceStatus: dashboardData.taxSourceStatus,
    snapshot
  });

  return {
    companyId: company.id,
    companyName: company.name,
    industry: company.industry,
    status: portfolioState.status,
    completionPercent: dashboardData.completionSummary.completionPercent,
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

async function buildComparableRows(params: {
  companies: Company[];
  company: Company;
  context: Awaited<ReturnType<typeof fetchCompanyContext>>;
}) {
  const { companies, company, context } = params;

  return Promise.all(
    companies.map(async (peerCompany) => {
      const peerContext =
        peerCompany.id === company.id ? context : await fetchCompanyContext(peerCompany);

      return buildDealScreenerRow({
        companies,
        company: peerCompany,
        ...peerContext
      });
    })
  );
}

export async function getSimilarDeals(companyId: string): Promise<SimilarDeal[]> {
  try {
    const companies = await fetchCompanies();
    const company = companies.find((item) => item.id === companyId) ?? null;

    if (!company) {
      return [];
    }

    const context = await fetchCompanyContext(company);
    const comparableRows = await buildComparableRows({
      companies,
      company,
      context
    });

    const currentRow =
      comparableRows.find((row) => row.companyId === company.id) ??
      buildDealScreenerRow({
        companies,
        company,
        ...context
      });

    return buildSimilarDeals(currentRow, comparableRows);
  } catch {
    return [];
  }
}

export async function getDashboardData(
  companyId?: string,
  options?: { includeSimilarDeals?: boolean }
): Promise<DashboardData> {
  try {
    const companies = await fetchCompanies();
    const company =
      companies.find((item) => item.id === companyId) ?? companies[0] ?? null;

    if (!company) {
      return buildEmptyDashboardData(companies);
    }

    const context = await fetchCompanyContext(company);

    const initialSnapshots = buildSnapshots(context.periods, context.entries, context.addBacks);
    const currentSnapshot = initialSnapshots[initialSnapshots.length - 1] ?? EMPTY_SNAPSHOT;
    const sourceReconciliation =
      currentSnapshot.periodId && company.id
        ? await getSourceReconciliationForPeriod({
            companyId: company.id,
            periodId: currentSnapshot.periodId
          })
        : null;
    const taxSourceStatus = buildTaxSourceStatus({
      taxContext: context.taxContext,
      matchedPeriodLabel: sourceReconciliation?.taxPeriodLabel ?? null,
      comparisonComputable:
        sourceReconciliation?.coverage.hasTaxData === true &&
        sourceReconciliation.ebitda.tax !== null,
      comparisonMissingComponents: [],
      comparisonNotes: [],
      revenueDeltaPercent: sourceReconciliation?.revenue.deltaPct ?? null,
      reportedEbitdaDeltaPercent: sourceReconciliation?.comparisons.reportedVsTax.deltaPct ?? null,
      adjustedEbitdaDeltaPercent: sourceReconciliation?.comparisons.adjustedVsTax.deltaPct ?? null
    });
    const defaultCreditScenario = buildCreditScenario({
      inputs: {
        loanAmount: null,
        annualInterestRatePercent: null,
        loanTermYears: null,
        amortizationYears: null,
        collateralValue: null
      },
      ebitda: currentSnapshot.adjustedEbitda
    });
    const initialDataQuality = buildDataQualityReport({
      entries: context.entries,
      savedMappings: context.accountMappings,
      snapshots: initialSnapshots
    });
    const completionSummary = buildUnderwritingCompletion({
      snapshot: currentSnapshot,
      entries: context.entries,
      dataQuality: initialDataQuality,
      taxSourceStatus,
      underwritingInputs: {
        loanAmount: null,
        annualInterestRatePercent: null,
        loanTermYears: null,
        amortizationYears: null,
        collateralValue: null
      },
      creditScenario: defaultCreditScenario
    });
    const dashboardData = buildDashboardDataForCompany({
      companies,
      company,
      ...context,
      taxSourceStatus,
      completionSummary
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
  const companies = await fetchCompanies();

  const rows = await Promise.all(
    companies.map(async (company) => {
      const { periods, entries, accountMappings, addBacks } = await fetchCompanyContext(company);
      return buildDealScreenerRow({
        companies,
        company,
        periods,
        entries,
        accountMappings,
        addBacks
      });
    })
  );

  return rows;
}
