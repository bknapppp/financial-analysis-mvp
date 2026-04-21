import { cache } from "react";
import {
  buildAddBackReviewItems,
  buildEbitdaBridge,
  generateAddBackSuggestions
} from "./add-backs.ts";
import { ADD_BACK_SELECT, isAddBacksSchemaError } from "./add-back-schema.ts";
import { buildBalanceSheet, buildIncomeStatement, buildSnapshots } from "./calculations.ts";
import { buildDataQualityReport } from "./data-quality.ts";
import { buildDataReadiness } from "./data-readiness.ts";
import {
  FINANCIAL_ENTRY_AUDIT_SELECT,
  FINANCIAL_ENTRY_BASE_SELECT,
  isFinancialEntryTraceabilitySchemaError
} from "./financial-entry-schema.ts";
import { getSourceFinancialContext } from "./financial-sources.ts";
import {
  generateDriverAnalyses,
  generateExecutiveSummary,
  generateInsights,
  generateRecommendedActions
} from "./insights.ts";
import { buildNormalizedPeriodOutputs } from "./normalized-outputs.ts";
import { getSourceReconciliationForContext } from "./source-reconciliation.ts";
import { getSupabaseServerClient } from "./supabase.ts";
import {
  buildEmptyTaxSourceStatus,
  buildTaxSourceStatus,
  canComputeTaxComparison
} from "./tax-source-status.ts";
import { buildUnderwritingAnalysis } from "./underwriting/analysis.ts";
import type {
  AccountMapping,
  AddBack,
  Company,
  CreditScenarioResult,
  CreditScenarioInputs,
  DashboardData,
  FinancialEntry,
  PeriodSnapshot,
  ReportingPeriod,
  SourceFinancialContext,
  TaxSourceStatus
} from "./types.ts";

export const EMPTY_SNAPSHOT: PeriodSnapshot = {
  periodId: "",
  label: "No period loaded",
  periodDate: "",
  revenue: null,
  cogs: null,
  grossProfit: null,
  operatingExpenses: null,
  depreciationAndAmortization: null,
  nonOperating: null,
  taxExpense: null,
  netIncome: null,
  ebit: null,
  reportedOperatingIncome: null,
  reportedEbitda: null,
  ebitda: null,
  acceptedAddBacks: 0,
  adjustedEbitda: null,
  grossMarginPercent: null,
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

export const DEFAULT_UNDERWRITING_INPUTS: CreditScenarioInputs = {
  loanAmount: null,
  annualInterestRatePercent: null,
  loanTermYears: null,
  amortizationYears: null,
  collateralValue: null
};

export type DealDerivedContextOptions = {
  selectedPeriodId?: string | null;
  ebitdaBasis?: "reported" | "adjusted";
};

export type DealRawContext = {
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  accountMappings: AccountMapping[];
  addBacks: AddBack[];
  taxContext: SourceFinancialContext;
};

export type DealCoreDerivedContext = DealRawContext & {
  company: Company;
  selectedPeriodId: string | null;
  ebitdaBasis: "reported" | "adjusted";
  baselineSnapshots: PeriodSnapshot[];
  snapshots: PeriodSnapshot[];
  snapshot: PeriodSnapshot;
  addBackReviewItems: DashboardData["addBackReviewItems"];
  dataQuality: DashboardData["dataQuality"];
  readiness: DashboardData["readiness"];
  ebitdaBridge: DashboardData["ebitdaBridge"];
  normalizedPeriods: DashboardData["normalizedPeriods"];
  normalizedOutput: DashboardData["normalizedOutput"];
  reconciliation: DashboardData["reconciliation"];
  series: DashboardData["series"];
  incomeStatement: DashboardData["incomeStatement"];
  balanceSheet: DashboardData["balanceSheet"];
  insights: DashboardData["insights"];
  driverAnalyses: DashboardData["driverAnalyses"];
  recommendedActions: DashboardData["recommendedActions"];
  executiveSummary: DashboardData["executiveSummary"];
};

export type DealDerivedContext = DealCoreDerivedContext & {
  taxSourceStatus: TaxSourceStatus;
  underwritingInputs: CreditScenarioInputs;
  defaultCreditScenario: CreditScenarioResult;
  completionSummary: DashboardData["completionSummary"];
};

export { buildEmptyTaxSourceStatus, buildTaxSourceStatus } from "./tax-source-status.ts";

function getSelectedSnapshot(params: {
  snapshots: PeriodSnapshot[];
  normalizedPeriods: DashboardData["normalizedPeriods"];
  selectedPeriodId: string | null;
}) {
  const fallbackSnapshot = params.snapshots[params.snapshots.length - 1] ?? EMPTY_SNAPSHOT;
  const snapshot =
    (params.selectedPeriodId
      ? params.snapshots.find((candidate) => candidate.periodId === params.selectedPeriodId)
      : null) ?? fallbackSnapshot;
  const normalizedOutput =
    params.normalizedPeriods.find((period) => period.periodId === snapshot.periodId) ??
    params.normalizedPeriods[params.normalizedPeriods.length - 1] ??
    null;

  return { snapshot, normalizedOutput };
}

export function buildDealCoreDerivedContext(params: {
  company: Company;
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  accountMappings: AccountMapping[];
  addBacks: AddBack[];
  taxContext: SourceFinancialContext;
  options?: DealDerivedContextOptions;
}): DealCoreDerivedContext {
  const { company, periods, entries, accountMappings, addBacks, taxContext } = params;
  const selectedPeriodId = params.options?.selectedPeriodId ?? null;
  const ebitdaBasis = params.options?.ebitdaBasis ?? "adjusted";
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
  const { snapshot, normalizedOutput: preliminaryNormalizedOutput } = getSelectedSnapshot({
    snapshots,
    normalizedPeriods: preliminaryNormalizedPeriods,
    selectedPeriodId
  });
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
  const readyBridgeState = {
    ...readiness,
    status: "ready" as const,
    label: "Ready" as const,
    blockingReasons: [],
    cautionReasons: []
  };
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
            periodSnapshot.periodId === snapshot.periodId ? readiness : readyBridgeState
        });

        return bridge ? ([periodSnapshot.periodId, bridge] as const) : null;
      })
      .filter(
        (value): value is readonly [string, NonNullable<DashboardData["ebitdaBridge"]>] =>
          Boolean(value)
      )
  );
  const normalizedPeriods = buildNormalizedPeriodOutputs({
    periods,
    snapshots,
    entries,
    accountMappings,
    bridgesByPeriodId,
    addBacks
  });
  const { normalizedOutput } = getSelectedSnapshot({
    snapshots,
    normalizedPeriods,
    selectedPeriodId
  });
  const currentBridge = bridgesByPeriodId.get(snapshot.periodId) ?? null;
  const ebitdaBridge = currentBridge
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
    : null;
  const driverAnalyses = generateDriverAnalyses(snapshots);
  const recommendedActions = generateRecommendedActions({
    snapshots,
    driverAnalyses,
    dataQuality
  });

  return {
    company,
    periods,
    entries,
    accountMappings,
    addBacks,
    taxContext,
    selectedPeriodId: snapshot.periodId || selectedPeriodId,
    ebitdaBasis,
    baselineSnapshots,
    snapshots,
    snapshot,
    addBackReviewItems,
    dataQuality,
    readiness,
    ebitdaBridge,
    normalizedPeriods,
    normalizedOutput,
    reconciliation,
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
    })
  };
}

export function buildDealDerivedContextFromCore(params: {
  core: DealCoreDerivedContext;
  taxSourceStatus: TaxSourceStatus;
  underwritingInputs?: CreditScenarioInputs;
}): DealDerivedContext {
  const underwritingInputs = params.underwritingInputs ?? DEFAULT_UNDERWRITING_INPUTS;
  const underwritingAnalysis = buildUnderwritingAnalysis({
    snapshot: params.core.snapshot,
    entries: params.core.entries,
    dataQuality: params.core.dataQuality,
    taxSourceStatus: params.taxSourceStatus,
    reconciliation: params.core.reconciliation,
    underwritingInputs,
    ebitdaBasis: params.core.ebitdaBasis === "reported" ? "computed" : "adjusted"
  });

  return {
    ...params.core,
    taxSourceStatus: params.taxSourceStatus,
    underwritingInputs,
    defaultCreditScenario: underwritingAnalysis.creditScenario,
    completionSummary: underwritingAnalysis.completionSummary
  };
}

export const getCompanies = cache(async () => {
  const supabase = getSupabaseServerClient();
  const { data } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Company[]>();

  return Array.isArray(data) ? data : [];
});

export const getDealRawContext = cache(async (companyId: string): Promise<DealRawContext> => {
  const supabase = getSupabaseServerClient();
  const { data: periodsResult } = await supabase
    .from("reporting_periods")
    .select("*")
    .eq("company_id", companyId)
    .order("period_date", { ascending: true })
    .returns<ReportingPeriod[]>();

  const periods = Array.isArray(periodsResult) ? periodsResult : [];
  const periodIds = periods.map((period) => period.id);

  let entries: FinancialEntry[] = [];
  if (periodIds.length > 0) {
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
    .eq("company_id", companyId)
    .returns<AccountMapping[]>();

  const accountMappings = Array.isArray(accountMappingsResult) ? accountMappingsResult : [];

  let addBacks: AddBack[] = [];
  if (periodIds.length > 0) {
    const addBackQuery = await supabase
      .from("add_backs")
      .select(ADD_BACK_SELECT)
      .eq("company_id", companyId)
      .in("period_id", periodIds)
      .returns<AddBack[]>();

    if (!addBackQuery.error || !isAddBacksSchemaError(addBackQuery.error)) {
      addBacks = Array.isArray(addBackQuery.data) ? addBackQuery.data : [];
    }
  }

  const taxContext = await getSourceFinancialContext({
    companyId,
    sourceType: "tax_return"
  });

  return { periods, entries, accountMappings, addBacks, taxContext };
});

const getDealDerivedContextCached = cache(
  async (
    companyId: string,
    selectedPeriodId: string | null,
    ebitdaBasis: "reported" | "adjusted"
  ): Promise<DealDerivedContext | null> => {
    const companies = await getCompanies();
    const company = companies.find((candidate) => candidate.id === companyId) ?? null;

    if (!company) {
      return null;
    }

    const raw = await getDealRawContext(companyId);
    const core = buildDealCoreDerivedContext({
      company,
      ...raw,
      options: { selectedPeriodId, ebitdaBasis }
    });
    const sourceReconciliation =
      core.snapshot.periodId && company.id
        ? await getSourceReconciliationForContext({
            companyId: company.id,
            periodId: core.snapshot.periodId,
            periods: raw.periods,
            entries: raw.entries,
            addBacks: raw.addBacks,
            snapshots: core.snapshots,
            taxContext: raw.taxContext
          })
        : null;
    const taxSourceStatus = buildTaxSourceStatus({
      taxContext: raw.taxContext,
      matchedPeriodLabel: sourceReconciliation?.taxPeriodLabel ?? null,
      comparisonComputable: canComputeTaxComparison({
        hasTaxData: sourceReconciliation?.coverage.hasTaxData === true,
        taxEbitda: sourceReconciliation?.ebitda.tax ?? null,
        reportedEbitdaReference: sourceReconciliation?.ebitda.reportedReference ?? null,
        computedEbitda: sourceReconciliation?.ebitda.computed ?? null
      }),
      comparisonMissingComponents: sourceReconciliation
        ? [
            ...sourceReconciliation.explainability.missingComponents,
            ...(canComputeTaxComparison({
              hasTaxData: sourceReconciliation.coverage.hasTaxData,
              taxEbitda: sourceReconciliation.ebitda.tax,
              reportedEbitdaReference: sourceReconciliation.ebitda.reportedReference,
              computedEbitda: sourceReconciliation.ebitda.computed
            })
              ? []
              : ["Neither reported EBITDA nor computed EBITDA is available for the matched period."])
          ]
        : [],
      comparisonNotes: sourceReconciliation?.explainability.notes ?? [],
      revenueDeltaPercent: sourceReconciliation?.revenue.deltaPct ?? null,
      reportedEbitdaDeltaPercent:
        sourceReconciliation?.comparisons.reportedReferenceVsTax.deltaPct ?? null,
      computedEbitdaDeltaPercent: sourceReconciliation?.comparisons.computedVsTax.deltaPct ?? null,
      adjustedEbitdaDeltaPercent: sourceReconciliation?.comparisons.adjustedVsTax.deltaPct ?? null,
      requiredComponentsFound: sourceReconciliation?.explainability.requiredComponentsFound ?? [],
      taxCoverageStatus: sourceReconciliation?.explainability.taxCoverageStatus ?? "not_loaded",
      comparisonContext: sourceReconciliation?.explainability.comparisonContext ?? null
    });

    return buildDealDerivedContextFromCore({
      core,
      taxSourceStatus
    });
  }
);

export async function getDealDerivedContext(
  companyId: string,
  options?: DealDerivedContextOptions
) {
  return getDealDerivedContextCached(
    companyId,
    options?.selectedPeriodId ?? null,
    options?.ebitdaBasis ?? "adjusted"
  );
}
