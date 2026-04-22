"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { focusFixItTarget } from "@/components/fix-it-focus";
import { TaxSourceDrawer } from "@/components/tax-source-drawer";
import { SOURCE_DATA_RECONCILIATION_SECTION_ID } from "@/lib/fix-it";
import { formatCurrency, formatPercent } from "@/lib/formatters";

type SourceReconciliationFlag = {
  type:
    | "tax_revenue_lower_than_reported"
    | "tax_ebitda_lower_than_computed"
    | "tax_ebitda_much_lower_than_adjusted"
    | "high_addback_percentage";
  metric: "Revenue" | "EBITDA" | "Add-backs";
  value: number | null;
  explanation: string;
};

type SourceReconciliationData = {
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
  };
  flags: SourceReconciliationFlag[];
  traceability: {
    reportedPeriodDate: string | null;
    taxPeriodDate: string | null;
    taxDerivedEbitdaSource: "taxDerivedEBITDA";
    taxDerivedEbitdaIncludingInterest: number | null;
  };
};

type SourceReconciliationCardProps = {
  companyId: string | null;
  periodId: string | null;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: SourceReconciliationData };

function formatCurrencyValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return formatCurrency(value);
}

function formatPercentValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return formatPercent(value * 100);
}

function coverageIcon(value: boolean) {
  return value ? "✔" : "✖";
}

function flagLabel(type: SourceReconciliationFlag["type"]) {
  if (type === "tax_revenue_lower_than_reported") {
    return "Tax revenue below reported";
  }

  if (type === "tax_ebitda_lower_than_computed") {
    return "Tax EBITDA below computed";
  }

  if (type === "tax_ebitda_much_lower_than_adjusted") {
    return "Tax EBITDA below adjusted";
  }

  return "High add-back intensity";
}

function deltaTone(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "text-slate-900";
  }

  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 500000) {
    return "text-rose-700";
  }

  if (absoluteValue >= 100000) {
    return "text-amber-700";
  }

  return "text-slate-900";
}

function DetailRow({
  label,
  value,
  valueClassName = "text-slate-900"
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className={`text-right text-sm font-medium tabular-nums ${valueClassName}`}>{value}</p>
    </div>
  );
}

function MetricBlock(props: {
  title: string;
  primaryLabel: string;
  primaryValue: number | null;
  comparisonLabel: string;
  comparisonValue: number | null;
  deltaValue: number | null;
  deltaPctValue: number | null;
}) {
  const deltaDisplay =
    props.deltaValue === null && props.deltaPctValue === null
      ? "—"
      : `${formatCurrencyValue(props.deltaValue)}${
          props.deltaPctValue !== null && Number.isFinite(props.deltaPctValue)
            ? ` (${formatPercentValue(props.deltaPctValue)})`
            : ""
        }`;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
        {props.title}
      </p>
      <div className="mt-3 space-y-2">
        <DetailRow label={props.primaryLabel} value={formatCurrencyValue(props.primaryValue)} />
        <DetailRow
          label={props.comparisonLabel}
          value={formatCurrencyValue(props.comparisonValue)}
        />
        <div className="border-t border-slate-200 pt-2.5">
          <DetailRow label="Δ" value={deltaDisplay} valueClassName={deltaTone(props.deltaValue)} />
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3">
      <div className="grid gap-4 xl:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div
            key={item}
            className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-slate-50"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="h-7 w-36 animate-pulse rounded-full border border-slate-200 bg-slate-50"
          />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
      <p className="text-sm font-medium text-slate-900">
        Source reconciliation could not be loaded.
      </p>
      <p className="mt-1 text-sm text-slate-600">{message}</p>
    </div>
  );
}

function EmptyState({ onAddTaxSource }: { onAddTaxSource: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-slate-900">
          No tax-source data for the selected period.
        </p>
        <p className="text-sm text-slate-600">
          Add a tax source to compare canonical financial outputs against tax-derived results.
        </p>
      </div>
      <div className="mt-3">
        <button
          type="button"
          onClick={onAddTaxSource}
          className="rounded-full bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
        >
          Add tax source
        </button>
      </div>
    </div>
  );
}

export function SourceReconciliationCard({
  companyId,
  periodId
}: SourceReconciliationCardProps) {
  const searchParams = useSearchParams();
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const requestedFixSection = searchParams.get("fixSection");

  useEffect(() => {
    if (requestedFixSection !== SOURCE_DATA_RECONCILIATION_SECTION_ID) {
      return;
    }

    const timer = window.setTimeout(() => {
      focusFixItTarget(SOURCE_DATA_RECONCILIATION_SECTION_ID, null);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [requestedFixSection]);

  useEffect(() => {
    if (!companyId || !periodId) {
      setState({ status: "success", data: buildEmptyReconciliation(companyId, periodId) });
      return;
    }

    const resolvedCompanyId = companyId;
    const resolvedPeriodId = periodId;

    let cancelled = false;

    async function load() {
      setState({ status: "loading" });

      try {
        const response = await fetch(
          `/api/source-financials/reconciliation?companyId=${encodeURIComponent(resolvedCompanyId)}&periodId=${encodeURIComponent(resolvedPeriodId)}`,
          { cache: "no-store" }
        );

        const payload = (await response.json()) as {
          data?: SourceReconciliationData;
          error?: string;
        };

        if (!response.ok || !payload.data) {
          throw new Error(payload.error || "Source reconciliation could not be loaded.");
        }

        if (!cancelled) {
          setState({ status: "success", data: payload.data });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Source reconciliation could not be loaded."
          });
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [companyId, periodId, refreshKey]);

  const visibleFlags = useMemo(() => {
    if (state.status !== "success") {
      return [];
    }

    return state.data.flags.slice(0, 3);
  }, [state]);

  const data = state.status === "success" ? state.data : null;
  const showEmptyState = data !== null && !data.coverage.hasTaxData;
  const showManageButton = data !== null && data.coverage.hasTaxData;
  const statusLabel =
    state.status === "loading"
      ? "Running..."
      : state.status === "error"
        ? "Attention needed"
        : showEmptyState
          ? "Tax source missing"
          : data
            ? "Ready to review"
            : "Idle";

  return (
    <>
      <details
        id={SOURCE_DATA_RECONCILIATION_SECTION_ID}
        data-fix-section={SOURCE_DATA_RECONCILIATION_SECTION_ID}
        className="rounded-[1.6rem] border border-slate-200/80 bg-white p-4 shadow-panel"
      >
        <summary className="flex cursor-pointer list-none flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
              Reconciliation
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Reconciliation
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Compare canonical financial outputs against tax-return-derived results.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                setRefreshKey((current) => current + 1);
              }}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Run Reconciliation
            </button>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
              {statusLabel}
            </span>
            {showManageButton ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  setIsDrawerOpen(true);
                }}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Manage tax source
              </button>
            ) : null}
          </div>
        </summary>

        <div className="mt-4">
          {state.status === "loading" || state.status === "idle" ? <LoadingState /> : null}
          {state.status === "error" ? <ErrorState message={state.message} /> : null}
          {showEmptyState ? (
            <EmptyState onAddTaxSource={() => setIsDrawerOpen(true)} />
          ) : null}
          {data !== null && !showEmptyState ? (
            <div className="space-y-3.5">
              <div className="grid gap-4 xl:grid-cols-3">
                <MetricBlock
                  title="Revenue"
                  primaryLabel="Reported"
                  primaryValue={data.revenue.reported}
                  comparisonLabel="Tax"
                  comparisonValue={data.revenue.tax}
                  deltaValue={data.revenue.delta}
                  deltaPctValue={data.revenue.deltaPct}
                />
                <MetricBlock
                  title="EBITDA"
                  primaryLabel="Computed"
                  primaryValue={data.ebitda.computed}
                  comparisonLabel="Tax"
                  comparisonValue={data.ebitda.tax}
                  deltaValue={data.comparisons.computedVsTax.delta}
                  deltaPctValue={data.comparisons.computedVsTax.deltaPct}
                />
                <MetricBlock
                  title="Adjusted EBITDA"
                  primaryLabel="Adjusted"
                  primaryValue={data.ebitda.adjusted}
                  comparisonLabel="Tax"
                  comparisonValue={data.ebitda.tax}
                  deltaValue={data.comparisons.adjustedVsTax.delta}
                  deltaPctValue={data.comparisons.adjustedVsTax.deltaPct}
                />
              </div>

              {visibleFlags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {visibleFlags.map((flag) => (
                    <span
                      key={flag.type}
                      title={flag.explanation}
                      className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                    >
                      {flagLabel(flag.type)}
                    </span>
                  ))}
                </div>
              ) : null}

              <details className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                  View details
                </summary>
                <div className="mt-3 grid gap-3 lg:grid-cols-[0.88fr_1.12fr]">
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                        Add-backs
                      </p>
                      <div className="mt-2 space-y-2">
                        <DetailRow
                          label="Amount"
                          value={formatCurrencyValue(data.addbacks.amount)}
                        />
                        <DetailRow
                          label="Share"
                          value={`${formatPercentValue(data.addbacks.pctOfComputed)} of computed EBITDA`}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                        Coverage
                      </p>
                      <div className="mt-2 space-y-2">
                        <DetailRow
                          label="Reported financials"
                          value={coverageIcon(data.coverage.hasReportedFinancials)}
                        />
                        <DetailRow
                          label="Reported EBITDA reference"
                          value={formatCurrencyValue(data.ebitda.reportedReference)}
                        />
                        <DetailRow
                          label="Tax data"
                          value={coverageIcon(data.coverage.hasTaxData)}
                        />
                        <DetailRow
                          label="Adjusted EBITDA"
                          value={coverageIcon(data.coverage.hasAdjustedEBITDA)}
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                        Matched period
                      </p>
                      <div className="mt-2 space-y-2">
                        <DetailRow
                          label="Period"
                          value={
                            data.periodLabel || data.taxPeriodLabel
                              ? `${data.periodLabel ?? "—"} ↔ ${data.taxPeriodLabel ?? "—"}`
                              : "—"
                          }
                        />
                        <DetailRow
                          label="Dates"
                          value={
                            data.traceability.reportedPeriodDate || data.traceability.taxPeriodDate
                              ? `${data.traceability.reportedPeriodDate ?? "—"} ↔ ${data.traceability.taxPeriodDate ?? "—"}`
                              : "—"
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </details>
            </div>
          ) : null}
        </div>
      </details>

      {companyId && periodId ? (
        <TaxSourceDrawer
          isOpen={isDrawerOpen}
          mode={showManageButton ? "manage" : "add"}
          companyId={companyId}
          reportedPeriodId={periodId}
          reportedPeriodLabel={data?.periodLabel ?? null}
          reportedPeriodDate={data?.traceability.reportedPeriodDate ?? null}
          taxSourcePeriodId={data?.taxSourcePeriodId ?? null}
          onClose={() => setIsDrawerOpen(false)}
          onSaved={() => setRefreshKey((current) => current + 1)}
        />
      ) : null}
    </>
  );
}

function buildEmptyReconciliation(
  companyId: string | null,
  periodId: string | null
): SourceReconciliationData {
  return {
    companyId: companyId ?? "",
    periodId: periodId ?? "",
    taxSourcePeriodId: null,
    periodLabel: null,
    taxPeriodLabel: null,
    revenue: {
      reported: null,
      tax: null,
      delta: null,
      deltaPct: null
    },
    ebitda: {
      computed: null,
      reportedReference: null,
      adjusted: null,
      tax: null
    },
    comparisons: {
      computedVsTax: {
        delta: null,
        deltaPct: null
      },
      adjustedVsTax: {
        delta: null,
        deltaPct: null
      }
    },
    addbacks: {
      amount: null,
      pctOfComputed: null
    },
    coverage: {
      hasReportedFinancials: false,
      hasTaxData: false,
      hasAdjustedEBITDA: false
    },
    flags: [],
    traceability: {
      reportedPeriodDate: null,
      taxPeriodDate: null,
      taxDerivedEbitdaSource: "taxDerivedEBITDA",
      taxDerivedEbitdaIncludingInterest: null
    }
  };
}
