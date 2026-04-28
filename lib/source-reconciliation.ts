import {
  FINANCIAL_ENTRY_AUDIT_SELECT,
  FINANCIAL_ENTRY_BASE_SELECT,
  isFinancialEntryTraceabilitySchemaError
} from "./financial-entry-schema.ts";
import { ADD_BACK_SELECT, isAddBacksSchemaError } from "./add-back-schema.ts";
import { buildSnapshots } from "./calculations.ts";
import { getSourceFinancialContext } from "./financial-sources.ts";
import { normalizeReportedValue } from "./reported-sign-normalization.ts";
import { getTaxDerivedEbitdaForSourcePeriod, type TaxDerivedEbitdaResult } from "./tax-ebitda.ts";
import { getSupabaseServerClient } from "./supabase.ts";
import type {
  AddBack,
  FinancialEntry,
  PeriodSnapshot,
  ReportingPeriod,
  SourceReportingPeriod,
  SourceFinancialContext
} from "./types.ts";

const REVENUE_DELTA_THRESHOLD_PCT = 0.1;
const EBITDA_DELTA_THRESHOLD_PCT = 0.1;
const HIGH_ADDBACK_THRESHOLD_PCT = 0.25;

export type SourceReconciliationFlag = {
  type:
    | "tax_revenue_lower_than_reported"
    | "tax_ebitda_lower_than_computed"
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
    computed: number | null;
    reportedReference: number | null;
    adjusted: number | null;
    tax: number | null;
  };
  comparisons: {
    reportedReferenceVsTax: {
      delta: number | null;
      deltaPct: number | null;
    };
    computedVsTax: {
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
    pctOfComputed: number | null;
  };
  coverage: {
    hasReportedFinancials: boolean;
    hasTaxData: boolean;
    hasAdjustedEBITDA: boolean;
    hasReportedEbitdaReference: boolean;
  };
  explainability: {
    taxCoverageStatus: TaxDerivedEbitdaResult["coverage"]["status"] | "not_loaded";
    requiredComponentsFound: string[];
    missingComponents: string[];
    notes: string[];
    comparisonContext: {
      reportedRevenue: number | null;
      taxRevenue: number | null;
      computedEbitda: number | null;
      reportedEbitdaReference: number | null;
      adjustedEbitda: number | null;
      taxEbitda: number | null;
      taxEbitdaIncludingInterest: number | null;
    } | null;
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

  return (base - candidate) / Math.abs(base);
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

function arePeriodsComparable(
  reportedPeriod: ReportingPeriod,
  taxPeriod: Pick<SourceReportingPeriod, "period_date" | "source_year">
) {
  const reportedYear = Number.parseInt(reportedPeriod.period_date.slice(0, 4), 10);
  const taxYear = taxPeriod.source_year ?? Number.parseInt(taxPeriod.period_date.slice(0, 4), 10);

  return Number.isFinite(reportedYear) && Number.isFinite(taxYear) && reportedYear === taxYear;
}

export function buildSourceReconciliation(params: {
  companyId: string;
  periodId: string;
  reportedPeriod: ReportingPeriod | null;
  reportedRevenue: number | null;
  reconstructedEbitda: number | null;
  reportedEbitdaReference?: number | null;
  adjustedEbitda: number | null;
  taxResult: TaxDerivedEbitdaResult | null;
}): SourceReconciliationResult {
  const normalizedReportedRevenue = normalizeReportedValue({
    kind: "revenue",
    value: params.reportedRevenue
  });
  const normalizedTaxRevenue = normalizeReportedValue({
    kind: "revenue",
    value: params.taxResult?.components.rawSigned.netRevenue ?? null
  });
  const normalizedComputedEbitda = normalizeReportedValue({
    kind: "ebitda",
    value: params.reconstructedEbitda,
    referenceValues: [params.taxResult?.taxDerivedEBITDA ?? null, params.adjustedEbitda]
  });
  const normalizedTaxEbitda = normalizeReportedValue({
    kind: "ebitda",
    value: params.taxResult?.taxDerivedEBITDA ?? null,
    referenceValues: [params.reconstructedEbitda, params.adjustedEbitda]
  });
  const normalizedReportedEbitdaReference = normalizeReportedValue({
    kind: "ebitda",
    value: params.reportedEbitdaReference ?? null,
    referenceValues: [
      params.reconstructedEbitda,
      params.taxResult?.taxDerivedEBITDA ?? null,
      params.adjustedEbitda
    ]
  });
  const normalizedAdjustedEbitda = normalizeReportedValue({
    kind: "ebitda",
    value: params.adjustedEbitda,
    referenceValues: [params.reconstructedEbitda, params.taxResult?.taxDerivedEBITDA ?? null]
  });

  const revenueDelta = safeDelta(normalizedReportedRevenue, normalizedTaxRevenue);
  const revenueDeltaPct = safeDeltaPct(normalizedReportedRevenue, normalizedTaxRevenue);
  const computedVsTaxDelta = safeDelta(
    normalizedComputedEbitda,
    normalizedTaxEbitda
  );
  const reportedReferenceVsTaxDeltaPct = safeDeltaPct(
    normalizedReportedEbitdaReference,
    normalizedTaxEbitda
  );
  const reportedReferenceVsTaxDelta = safeDelta(
    normalizedReportedEbitdaReference,
    normalizedTaxEbitda
  );
  const computedVsTaxDeltaPct = safeDeltaPct(
    normalizedComputedEbitda,
    normalizedTaxEbitda
  );
  const adjustedVsTaxDelta = safeDelta(
    normalizedAdjustedEbitda,
    normalizedTaxEbitda
  );
  const adjustedVsTaxDeltaPct = safeDeltaPct(
    normalizedAdjustedEbitda,
    normalizedTaxEbitda
  );
  const addbacksAmount =
    normalizedComputedEbitda !== null && normalizedAdjustedEbitda !== null
      ? normalizedAdjustedEbitda - normalizedComputedEbitda
      : null;
  const addbacksPctOfComputed =
    normalizedComputedEbitda !== null &&
    normalizedComputedEbitda !== 0 &&
    addbacksAmount !== null
      ? addbacksAmount / Math.abs(normalizedComputedEbitda)
      : null;

  const flags: SourceReconciliationFlag[] = [];

  if (
    revenueDeltaPct !== null &&
    revenueDelta !== null &&
    revenueDeltaPct > REVENUE_DELTA_THRESHOLD_PCT &&
    normalizedTaxRevenue !== null
  ) {
    flags.push({
      type: "tax_revenue_lower_than_reported",
      metric: "Revenue",
      value: revenueDelta,
      explanation: "Tax-source net revenue is materially lower than reported revenue."
    });
  }

  if (
    computedVsTaxDeltaPct !== null &&
    computedVsTaxDelta !== null &&
    computedVsTaxDeltaPct > EBITDA_DELTA_THRESHOLD_PCT &&
    normalizedTaxEbitda !== null
  ) {
    flags.push({
      type: "tax_ebitda_lower_than_computed",
      metric: "EBITDA",
      value: computedVsTaxDelta,
      explanation: "Tax-derived EBITDA is materially lower than canonical EBITDA."
    });
  }

  if (
    adjustedVsTaxDeltaPct !== null &&
    adjustedVsTaxDelta !== null &&
    adjustedVsTaxDeltaPct > EBITDA_DELTA_THRESHOLD_PCT &&
    normalizedTaxEbitda !== null
  ) {
    flags.push({
      type: "tax_ebitda_much_lower_than_adjusted",
      metric: "EBITDA",
      value: adjustedVsTaxDelta,
      explanation: "Tax-derived EBITDA is materially lower than adjusted EBITDA."
    });
  }

  if (
    addbacksPctOfComputed !== null &&
    addbacksAmount !== null &&
    addbacksPctOfComputed > HIGH_ADDBACK_THRESHOLD_PCT
  ) {
    flags.push({
      type: "high_addback_percentage",
      metric: "Add-backs",
      value: addbacksAmount,
      explanation: "Accepted add-backs represent a high percentage of canonical EBITDA."
    });
  }

  return {
    companyId: params.companyId,
    periodId: params.periodId,
    taxSourcePeriodId: params.taxResult?.sourcePeriodId ?? null,
    periodLabel: params.reportedPeriod?.label ?? null,
    taxPeriodLabel: params.taxResult?.periodLabel ?? null,
    revenue: {
      reported: normalizedReportedRevenue,
      tax: normalizedTaxRevenue,
      delta: revenueDelta,
      deltaPct: revenueDeltaPct
    },
    ebitda: {
      computed: normalizedComputedEbitda,
      reportedReference: normalizedReportedEbitdaReference,
      adjusted: normalizedAdjustedEbitda,
      tax: normalizedTaxEbitda
    },
    comparisons: {
      reportedReferenceVsTax: {
        delta: reportedReferenceVsTaxDelta,
        deltaPct: reportedReferenceVsTaxDeltaPct
      },
      computedVsTax: {
        delta: computedVsTaxDelta,
        deltaPct: computedVsTaxDeltaPct
      },
      adjustedVsTax: {
        delta: adjustedVsTaxDelta,
        deltaPct: adjustedVsTaxDeltaPct
      }
    },
    addbacks: {
      amount: addbacksAmount,
      pctOfComputed: addbacksPctOfComputed
    },
    coverage: {
      hasReportedFinancials:
        normalizedReportedRevenue !== null || normalizedComputedEbitda !== null,
      hasTaxData: params.taxResult !== null && params.taxResult.entryCount > 0,
      hasAdjustedEBITDA: normalizedAdjustedEbitda !== null,
      hasReportedEbitdaReference: normalizedReportedEbitdaReference !== null
    },
    explainability: {
      taxCoverageStatus: params.taxResult?.coverage.status ?? "not_loaded",
      requiredComponentsFound: params.taxResult?.coverage.requiredComponentsFound ?? [],
      missingComponents: params.taxResult?.coverage.missingComponents ?? [],
      notes: params.taxResult?.coverage.notes ?? [],
      comparisonContext:
        params.taxResult === null
          ? null
          : {
              reportedRevenue: normalizedReportedRevenue,
              taxRevenue: normalizedTaxRevenue,
              computedEbitda: normalizedComputedEbitda,
              reportedEbitdaReference: normalizedReportedEbitdaReference,
              adjustedEbitda: normalizedAdjustedEbitda,
              taxEbitda: normalizedTaxEbitda,
              taxEbitdaIncludingInterest:
                params.taxResult.taxDerivedEBITDAIncludingInterest
            }
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

  return getSourceReconciliationForContext({
    companyId: params.companyId,
    periodId: params.periodId,
    periods,
    entries,
    addBacks
  });
}

export async function getSourceReconciliationForContext(params: {
  companyId: string;
  periodId: string;
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  addBacks: AddBack[];
  snapshots?: PeriodSnapshot[];
  taxContext?: SourceFinancialContext;
}) {
  const reportedPeriod = params.periods.find((period) => period.id === params.periodId) ?? null;
  const snapshots = params.snapshots ?? buildSnapshots(params.periods, params.entries, params.addBacks);
  const reportedSnapshot =
    reportedPeriod !== null
      ? snapshots.find((snapshot) => snapshot.periodId === reportedPeriod.id) ?? null
      : null;

  const taxContext =
    params.taxContext ??
    (await getSourceFinancialContext({
      companyId: params.companyId,
      sourceType: "tax_return"
    }));
  const matchingTaxPeriod =
    reportedPeriod === null
      ? null
      : taxContext.periods.find((period) =>
          arePeriodsComparable(reportedPeriod, period) &&
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
    reconstructedEbitda: reportedSnapshot?.ebitda ?? null,
    reportedEbitdaReference: reportedSnapshot?.reportedEbitda ?? null,
    adjustedEbitda: reportedSnapshot?.adjustedEbitda ?? null,
    taxResult
  });
}
