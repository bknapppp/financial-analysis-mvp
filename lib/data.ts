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
import {
  generateDriverAnalyses,
  generateExecutiveSummary,
  generateInsights,
  generateRecommendedActions
} from "@/lib/insights";
import { buildRiskFlags } from "@/lib/risk-flags";
import {
  FINANCIAL_ENTRY_AUDIT_SELECT,
  FINANCIAL_ENTRY_BASE_SELECT,
  isFinancialEntryTraceabilitySchemaError
} from "@/lib/financial-entry-schema";
import { buildNormalizedPeriodOutputs } from "@/lib/normalized-outputs";
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  AccountMapping,
  AddBack,
  Company,
  DashboardData,
  FinancialEntry,
  PeriodSnapshot,
  ReportingPeriod,
  SimilarDeal
} from "@/lib/types";

const EMPTY_SNAPSHOT: PeriodSnapshot = {
  periodId: "",
  label: "No period loaded",
  periodDate: "",
  revenue: 0,
  cogs: 0,
  grossProfit: 0,
  operatingExpenses: 0,
  ebitda: 0,
  acceptedAddBacks: 0,
  adjustedEbitda: 0,
  grossMarginPercent: 0,
  ebitdaMarginPercent: 0,
  adjustedEbitdaMarginPercent: 0,
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
  revenue: number | null;
  ebitda: number | null;
  adjustedEbitda: number | null;
  ebitdaMarginPercent: number | null;
  dscr: number | null;
  debtToEbitda: number | null;
  ltv: number | null;
  decision: "approve" | "caution" | "decline";
  primaryRisk: string | null;
  lastUpdated: string | null;
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
    ebitdaBridge: null,
    reconciliation: emptyReconciliation,
    normalizedPeriods: [],
    normalizedOutput: null
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

  return { periods, entries, accountMappings, addBacks };
}

function buildDashboardDataForCompany(params: {
  companies: Company[];
  company: Company;
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  accountMappings: AccountMapping[];
  addBacks: AddBack[];
}): DashboardData {
  const { companies, company, periods, entries, accountMappings, addBacks } = params;
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
      reportedEbitda: item.ebitda,
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
    ebitdaBridge: reconciledBridge,
    reconciliation,
    normalizedPeriods,
    normalizedOutput
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
  const dashboardData = buildDashboardDataForCompany({
    companies,
    company,
    periods,
    entries,
    accountMappings,
    addBacks
  });
  const snapshot = dashboardData.snapshot;
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

  return {
    companyId: company.id,
    companyName: company.name,
    industry: company.industry,
    revenue: snapshot.periodId ? snapshot.revenue : null,
    ebitda: snapshot.periodId ? snapshot.ebitda : null,
    adjustedEbitda: snapshot.periodId ? snapshot.adjustedEbitda : null,
    ebitdaMarginPercent: snapshot.periodId ? snapshot.ebitdaMarginPercent : null,
    dscr: creditScenario.metrics.dscr.value,
    debtToEbitda: creditScenario.metrics.debtToEbitda.value,
    ltv: creditScenario.metrics.ltv.value,
    decision: decision.recommendation,
    primaryRisk: riskFlags[0]?.title ?? null,
    lastUpdated
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
    ebitda: row.ebitda,
    adjustedEbitda: row.adjustedEbitda,
    decision: row.decision,
    primaryRisk: row.primaryRisk
  }));
}

export async function getDashboardData(companyId?: string): Promise<DashboardData> {
  try {
    const companies = await fetchCompanies();
    const company =
      companies.find((item) => item.id === companyId) ?? companies[0] ?? null;

    if (!company) {
      return buildEmptyDashboardData(companies);
    }

    const context = await fetchCompanyContext(company);

    const dashboardData = buildDashboardDataForCompany({
      companies,
      company,
      ...context
    });

    const comparableRows = await Promise.all(
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

    const currentRow =
      comparableRows.find((row) => row.companyId === company.id) ??
      buildDealScreenerRow({
        companies,
        company,
        ...context
      });

    return {
      ...dashboardData,
      similarDeals: buildSimilarDeals(currentRow, comparableRows)
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
