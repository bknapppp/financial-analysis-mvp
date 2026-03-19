import {
  buildAddBackReviewItems,
  buildEbitdaBridge,
  generateAddBackSuggestions
} from "@/lib/add-backs";
import { ADD_BACK_SELECT, isAddBacksSchemaError } from "@/lib/add-back-schema";
import {
  buildBalanceSheet,
  buildIncomeStatement,
  buildSnapshots
} from "@/lib/calculations";
import { buildDataQualityReport } from "@/lib/data-quality";
import { buildDataReadiness } from "@/lib/data-readiness";
import {
  generateDriverAnalyses,
  generateExecutiveSummary,
  generateInsights,
  generateRecommendedActions
} from "@/lib/insights";
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
  ReportingPeriod
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

export async function getDashboardData(): Promise<DashboardData> {
  try {
    const supabase = getSupabaseServerClient();

    const { data: companiesResult } = await supabase
      .from("companies")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<Company[]>();

    const companies = Array.isArray(companiesResult) ? companiesResult : [];
    const company = companies.length > 0
      ? companies[0]
      : null;

    if (!company) {
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
        dataQuality: buildDataQualityReport({
          entries: [],
          savedMappings: [],
          snapshots: []
        }),
        readiness: buildDataReadiness({
          snapshot: EMPTY_SNAPSHOT,
          entries: [],
          addBacks: [],
          reviewItems: [],
          reconciliation: {
            status: "reconciled",
            label: "Reconciles",
            summaryMessage: "No company is loaded yet.",
            withinTolerance: true,
            issues: []
          },
          dataQuality: buildDataQualityReport({
            entries: [],
            savedMappings: [],
            snapshots: []
          })
        }),
        ebitdaBridge: null,
        reconciliation: {
          status: "reconciled",
          label: "Reconciles",
          summaryMessage: "No company is loaded yet.",
          withinTolerance: true,
          issues: []
        },
        normalizedPeriods: [],
        normalizedOutput: null
      };
    }

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

      if (auditEntriesQuery.error && isFinancialEntryTraceabilitySchemaError(auditEntriesQuery.error)) {
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

    const accountMappings = Array.isArray(accountMappingsResult)
      ? accountMappingsResult
      : [];
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
        summaryMessage:
          "The normalized financial outputs reconcile within tolerance.",
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
        .filter((value): value is readonly [string, NonNullable<DashboardData["ebitdaBridge"]>] => Boolean(value))
    );
    const currentBridge = bridgesByPeriodId.get(snapshot.periodId) ?? null;
    const reconciledBridge =
      currentBridge
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
      dataQuality,
      readiness,
      ebitdaBridge: reconciledBridge,
      reconciliation,
      normalizedPeriods,
      normalizedOutput
    };
  } catch {
    const fallbackQuality = buildDataQualityReport({
      entries: [],
      savedMappings: [],
      snapshots: []
    });
    return {
      companies: [],
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
      dataQuality: fallbackQuality,
      readiness: buildDataReadiness({
        snapshot: EMPTY_SNAPSHOT,
        entries: [],
        addBacks: [],
        reviewItems: [],
        reconciliation: {
          status: "reconciled",
          label: "Reconciles",
          summaryMessage: "No data loaded.",
          withinTolerance: true,
          issues: []
        },
        dataQuality: fallbackQuality
      }),
      ebitdaBridge: null,
      reconciliation: {
        status: "reconciled",
        label: "Reconciles",
        summaryMessage: "No data loaded.",
        withinTolerance: true,
        issues: []
      },
      normalizedPeriods: [],
      normalizedOutput: null
    };
  }
}
