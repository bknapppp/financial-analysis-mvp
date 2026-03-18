import {
  buildBalanceSheet,
  buildIncomeStatement,
  buildSnapshots
} from "@/lib/calculations";
import { buildDataQualityReport } from "@/lib/data-quality";
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
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  AccountMapping,
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
  currentAssets: 0,
  currentLiabilities: 0,
  workingCapital: 0,
  revenueGrowthPercent: null,
  ebitdaGrowthPercent: null,
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
        })
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
    const snapshots = buildSnapshots(periods, entries);
    const snapshot = snapshots[snapshots.length - 1] ?? EMPTY_SNAPSHOT;
    const dataQuality = buildDataQualityReport({
      entries,
      savedMappings: accountMappings,
      snapshots
    });
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
      snapshots,
      snapshot,
      series: snapshots.map((item) => ({
        label: item.label,
        revenue: item.revenue,
        ebitda: item.ebitda
      })),
      incomeStatement: buildIncomeStatement(snapshot),
      balanceSheet: buildBalanceSheet(snapshot),
      insights: generateInsights(snapshots),
      driverAnalyses,
      recommendedActions,
      executiveSummary: generateExecutiveSummary({
        companyName: company.name,
        snapshots,
        driverAnalyses,
        recommendedActions
      }),
      dataQuality
    };
  } catch {
    return {
      companies: [],
      company: null,
      periods: [],
      entries: [],
      accountMappings: [],
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
      })
    };
  }
}
