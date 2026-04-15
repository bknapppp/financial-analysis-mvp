import {
  FINANCIAL_ENTRY_AUDIT_SELECT,
  FINANCIAL_ENTRY_BASE_SELECT,
  isFinancialEntryTraceabilitySchemaError
} from "./financial-entry-schema.ts";
import { ADD_BACK_SELECT, isAddBacksSchemaError } from "./add-back-schema.ts";
import { buildSnapshots } from "./calculations.ts";
import { getSourceFinancialContext } from "./financial-sources.ts";
import { getTaxDerivedEbitdaForSourcePeriod, type TaxDerivedEbitdaResult } from "./tax-ebitda.ts";
import { getSupabaseServerClient } from "./supabase.ts";
import type { AddBack, FinancialEntry, ReportingPeriod } from "./types.ts";

const REVENUE_DELTA_THRESHOLD_PCT = 0.1;
const EBITDA_DELTA_THRESHOLD_PCT = 0.1;
const HIGH_ADDBACK_THRESHOLD_PCT = 0.25;

export type SourceReconciliationFlag = {
  type:
    | "tax_revenue_lower_than_reported"
    | "tax_ebitda_lower_than_reported"
    | "tax_ebitda_much_lower_than_adjusted"
    | "high_addback_percentage";
  metric: "Revenue" | "EBITDA" | "Add-backs";
  value: number | null;
  explanation: string;
};

export type SourceReconciliationResult = {
  companyId: string;
  periodId: string;
  taxSourcePeriodId: string | null;
  periodLabel: string | null;
  taxPeriodLabel: string | null;
  revenue: {
    reported: number | null;
    tax: number | null;
    delta: number | null;
    deltaPct: number | null;
  };
  ebitda: {
    reported: number | null;
    adjusted: number | null;
    tax: number | null;
  };
  comparisons: {
    reportedVsTax: {
      delta: number | null;
      deltaPct: number | null;
    };
    adjustedVsTax: {
      delta: number | null;
      deltaPct: number | null;
    };
  };
  addbacks: {
    amount: number | null;
    pctOfReported: number | null;
  };
  coverage: {
    hasReportedFinancials: boolean;
    hasTaxData: boolean;
    hasAdjustedEBITDA: boolean;
  };
  flags: SourceReconciliationFlag[];
  traceability: {
    reportedPeriodDate: string | null;
    taxPeriodDate: string | null;
    taxDerivedEbitdaSource: "taxDerivedEBITDA";
    taxDerivedEbitdaIncludingInterest: number | null;
  };
};

function safeDelta(base: number | null, candidate: number | null) {
  if (base === null || candidate === null) {
    return null;
  }

  return base - candidate;
}

function safeDeltaPct(base: number | null, candidate: number | null) {
  if (base === null || candidate === null || base === 0) {
    return null;
  }

  return (base - candidate) / base;
}

function matchesTaxPeriod(params: {
  reportedPeriod: ReportingPeriod;
  taxPeriod: { label: string; period_date: string };
}) {
  return (
    params.reportedPeriod.period_date === params.taxPeriod.period_date ||
    params.reportedPeriod.label.trim().toLowerCase() ===
      params.taxPeriod.label.trim().toLowerCase()
  );
}

export function buildSourceReconciliation(params: {
  companyId: string;
  periodId: string;
  reportedPeriod: ReportingPeriod | null;
  reportedRevenue: number | null;
  reportedEbitda: number | null;
  adjustedEbitda: number | null;
  taxResult: TaxDerivedEbitdaResult | null;
}): SourceReconciliationResult {
  const revenueDelta = safeDelta(params.reportedRevenue, params.taxResult?.components.rawSigned.netRevenue ?? null);
  const revenueDeltaPct = safeDeltaPct(
    params.reportedRevenue,
    params.taxResult?.components.rawSigned.netRevenue ?? null
  );
  const reportedVsTaxDelta = safeDelta(
    params.reportedEbitda,
    params.taxResult?.taxDerivedEBITDA ?? null
  );
  const reportedVsTaxDeltaPct = safeDeltaPct(
    params.reportedEbitda,
    params.taxResult?.taxDerivedEBITDA ?? null
  );
  const adjustedVsTaxDelta = safeDelta(
    params.adjustedEbitda,
    params.taxResult?.taxDerivedEBITDA ?? null
  );
  const adjustedVsTaxDeltaPct = safeDeltaPct(
    params.adjustedEbitda,
    params.taxResult?.taxDerivedEBITDA ?? null
  );
  const addbacksAmount =
    params.reportedEbitda !== null && params.adjustedEbitda !== null
      ? params.adjustedEbitda - params.reportedEbitda
      : null;
  const addbacksPctOfReported =
    params.reportedEbitda !== null &&
    params.reportedEbitda !== 0 &&
    addbacksAmount !== null
      ? addbacksAmount / params.reportedEbitda
      : null;

  const flags: SourceReconciliationFlag[] = [];

  if (
    revenueDeltaPct !== null &&
    revenueDelta !== null &&
    revenueDeltaPct > REVENUE_DELTA_THRESHOLD_PCT &&
    (params.taxResult?.components.rawSigned.netRevenue ?? null) !== null
  ) {
    flags.push({
      type: "tax_revenue_lower_than_reported",
      metric: "Revenue",
      value: revenueDelta,
      explanation: "Tax-source net revenue is materially lower than reported revenue."
    });
  }

  if (
    reportedVsTaxDeltaPct !== null &&
    reportedVsTaxDelta !== null &&
    reportedVsTaxDeltaPct > EBITDA_DELTA_THRESHOLD_PCT &&
    (params.taxResult?.taxDerivedEBITDA ?? null) !== null
  ) {
    flags.push({
      type: "tax_ebitda_lower_than_reported",
      metric: "EBITDA",
      value: reportedVsTaxDelta,
      explanation: "Tax-derived EBITDA is materially lower than reported EBITDA."
    });
  }

  if (
    adjustedVsTaxDeltaPct !== null &&
    adjustedVsTaxDelta !== null &&
    adjustedVsTaxDeltaPct > EBITDA_DELTA_THRESHOLD_PCT &&
    (params.taxResult?.taxDerivedEBITDA ?? null) !== null
  ) {
    flags.push({
      type: "tax_ebitda_much_lower_than_adjusted",
      metric: "EBITDA",
      value: adjustedVsTaxDelta,
      explanation: "Tax-derived EBITDA is materially lower than adjusted EBITDA."
    });
  }

  if (
    addbacksPctOfReported !== null &&
    addbacksAmount !== null &&
    addbacksPctOfReported > HIGH_ADDBACK_THRESHOLD_PCT
  ) {
    flags.push({
      type: "high_addback_percentage",
      metric: "Add-backs",
      value: addbacksAmount,
      explanation: "Accepted add-backs represent a high percentage of reported EBITDA."
    });
  }

  return {
    companyId: params.companyId,
    periodId: params.periodId,
    taxSourcePeriodId: params.taxResult?.sourcePeriodId ?? null,
    periodLabel: params.reportedPeriod?.label ?? null,
    taxPeriodLabel: params.taxResult?.periodLabel ?? null,
    revenue: {
      reported: params.reportedRevenue,
      tax: params.taxResult?.components.rawSigned.netRevenue ?? null,
      delta: revenueDelta,
      deltaPct: revenueDeltaPct
    },
    ebitda: {
      reported: params.reportedEbitda,
      adjusted: params.adjustedEbitda,
      tax: params.taxResult?.taxDerivedEBITDA ?? null
    },
    comparisons: {
      reportedVsTax: {
        delta: reportedVsTaxDelta,
        deltaPct: reportedVsTaxDeltaPct
      },
      adjustedVsTax: {
        delta: adjustedVsTaxDelta,
        deltaPct: adjustedVsTaxDeltaPct
      }
    },
    addbacks: {
      amount: addbacksAmount,
      pctOfReported: addbacksPctOfReported
    },
    coverage: {
      hasReportedFinancials:
        params.reportedRevenue !== null || params.reportedEbitda !== null,
      hasTaxData: params.taxResult !== null && params.taxResult.entryCount > 0,
      hasAdjustedEBITDA: params.adjustedEbitda !== null
    },
    flags,
    traceability: {
      reportedPeriodDate: params.reportedPeriod?.period_date ?? null,
      taxPeriodDate: params.taxResult?.periodDate ?? null,
      taxDerivedEbitdaSource: "taxDerivedEBITDA",
      taxDerivedEbitdaIncludingInterest:
        params.taxResult?.taxDerivedEBITDAIncludingInterest ?? null
    }
  };
}

export async function getSourceReconciliationForPeriod(params: {
  companyId: string;
  periodId: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data: periodsResult, error: periodsError } = await supabase
    .from("reporting_periods")
    .select("*")
    .eq("company_id", params.companyId)
    .order("period_date", { ascending: true })
    .returns<ReportingPeriod[]>();

  if (periodsError) {
    throw new Error(periodsError.message);
  }

  const periods = Array.isArray(periodsResult) ? periodsResult : [];
  const reportedPeriod = periods.find((period) => period.id === params.periodId) ?? null;

  let entries: FinancialEntry[] = [];
  const periodIds = periods.map((period) => period.id);
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
    } else if (auditEntriesQuery.error) {
      throw new Error(auditEntriesQuery.error.message);
    } else {
      entries = Array.isArray(auditEntriesQuery.data) ? auditEntriesQuery.data : [];
    }
  }

  let addBacks: AddBack[] = [];
  if (periodIds.length > 0) {
    const addBackQuery = await supabase
      .from("add_backs")
      .select(ADD_BACK_SELECT)
      .eq("company_id", params.companyId)
      .in("period_id", periodIds)
      .returns<AddBack[]>();

    if (addBackQuery.error && !isAddBacksSchemaError(addBackQuery.error)) {
      throw new Error(addBackQuery.error.message);
    }

    addBacks = Array.isArray(addBackQuery.data) ? addBackQuery.data : [];
  }

  const reportedSnapshot =
    reportedPeriod !== null
      ? buildSnapshots(periods, entries, addBacks).find(
          (snapshot) => snapshot.periodId === reportedPeriod.id
        ) ?? null
      : null;

  const taxContext = await getSourceFinancialContext({
    companyId: params.companyId,
    sourceType: "tax_return"
  });
  const matchingTaxPeriod =
    reportedPeriod === null
      ? null
      : taxContext.periods.find((period) =>
          matchesTaxPeriod({
            reportedPeriod,
            taxPeriod: period
          })
        ) ?? null;

  const taxResult =
    matchingTaxPeriod !== null
      ? await getTaxDerivedEbitdaForSourcePeriod({
          companyId: params.companyId,
          sourcePeriodId: matchingTaxPeriod.id
        })
      : null;

  return buildSourceReconciliation({
    companyId: params.companyId,
    periodId: params.periodId,
    reportedPeriod,
    reportedRevenue: reportedSnapshot?.revenue ?? null,
    reportedEbitda: reportedSnapshot?.ebitda ?? null,
    adjustedEbitda: reportedSnapshot?.adjustedEbitda ?? null,
    taxResult
  });
}
