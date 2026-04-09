"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buildBalanceSheet as buildSnapshotBalanceSheet, buildIncomeStatement as buildSnapshotIncomeStatement } from "@/lib/calculations";
import { AddBackReviewPanel } from "@/components/add-back-review-panel";
import {
  CreditScenarioPanel,
  DEFAULT_CREDIT_SCENARIO_INPUT_VALUES,
  parseCreditScenarioInputValues,
  type CreditScenarioInputValues
} from "@/components/credit-scenario-panel";
import {
  BALANCE_SHEET_VALIDATION_TOLERANCE,
  buildBalanceSheetRollup,
  buildBalanceSheetValidation,
  canonicalizeCategoryPath
} from "@/components/financials-view-rollup";
import { DashboardCharts } from "@/components/dashboard-charts";
import { DealDecisionPanel } from "@/components/deal-decision-panel";
import { EbitdaBridge } from "@/components/ebitda-bridge";
import { EbitdaExplainabilityPanel } from "@/components/ebitda-explainability-panel";
import { MultiPeriodSummaryTable } from "@/components/multi-period-summary-table";
import { PerformanceDrivers } from "@/components/performance-drivers";
import { RiskFlagsPanel } from "@/components/risk-flags-panel";
import { StatementTable } from "@/components/statement-table";
import { UnderwritingSnapshotPanel } from "@/components/underwriting-snapshot-panel";
import { buildCreditScenario } from "@/lib/credit-scenario";
import { formatCurrency } from "@/lib/formatters";
import { buildRiskFlags } from "@/lib/risk-flags";
import type {
  DashboardData,
  FinancialEntry,
  NormalizedPeriodOutput,
  NormalizedStatement,
  PeriodSnapshot,
  UnderwritingEbitdaBasis
} from "@/lib/types";

type FinancialsViewProps = {
  data: DashboardData;
};

type FinancialsMode = "reported" | "adjusted";
type WorkspaceTab = "overview" | "financials" | "adjustments";

const WORKSPACE_TABS: Array<{ id: WorkspaceTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "financials", label: "Financials" },
  { id: "adjustments", label: "Adjustments" }
];
function toNormalizedStatementRows(
  rows: Array<{ label: string; value: number }>,
  subtotalLabels: string[]
) {
  return rows.map((row) => ({
    key: row.label.toLowerCase().replace(/[^\w]+/g, "_").replace(/^_|_$/g, ""),
    label: row.label,
    value: row.value,
    kind: subtotalLabels.includes(row.label) ? ("subtotal" as const) : ("line_item" as const)
  }));
}

function buildReportedIncomeStatement(params: {
  normalizedOutput: NormalizedPeriodOutput | null;
  snapshot: PeriodSnapshot;
}): NormalizedStatement {
  const { normalizedOutput, snapshot } = params;

  if (normalizedOutput?.incomeStatement) {
    return {
      ...normalizedOutput.incomeStatement,
      title: "Income Statement",
      footerLabel: "EBITDA",
      footerValue: snapshot.ebitda
    };
  }

  return {
    statementKey: "income_statement",
    title: "Income Statement",
    rows: toNormalizedStatementRows(buildSnapshotIncomeStatement(snapshot), [
      "Gross Profit",
      "EBIT",
      "Net Income",
      "Computed EBITDA",
      "Adjusted EBITDA"
    ]),
    footerLabel: "EBITDA",
    footerValue: snapshot.ebitda
  };
}

function buildAdjustedIncomeStatement(params: {
  normalizedOutput: NormalizedPeriodOutput | null;
  snapshot: PeriodSnapshot;
}): NormalizedStatement {
  const { normalizedOutput, snapshot } = params;

  if (normalizedOutput?.incomeStatement) {
    return {
      ...normalizedOutput.incomeStatement,
      title: "Income Statement",
      footerLabel: "Adjusted EBITDA",
      footerValue: snapshot.adjustedEbitda
    };
  }

  return {
    statementKey: "income_statement",
    title: "Income Statement",
    rows: toNormalizedStatementRows(buildSnapshotIncomeStatement(snapshot), [
      "Gross Profit",
      "EBIT",
      "Net Income",
      "Computed EBITDA",
      "Adjusted EBITDA"
    ]),
    footerLabel: "Adjusted EBITDA",
    footerValue: snapshot.adjustedEbitda
  };
}

function buildBalanceSheet(params: {
  entries: FinancialEntry[];
  snapshot: PeriodSnapshot;
}): NormalizedStatement {
  const { entries, snapshot } = params;
  const balanceSheetRollup = buildBalanceSheetRollup(entries, snapshot.periodId);
  const balanceSheetLines = balanceSheetRollup.selectedPeriodRows;

  if (balanceSheetLines.length > 0) {
    const {
      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,
      totalCurrentLiabilities,
      totalNonCurrentLiabilities,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity,
      workingCapital
    } = balanceSheetRollup.finalTotals;

    return {
      statementKey: "balance_sheet",
      title: "Balance Sheet",
      rows: [
        {
          key: "assets_section",
          label: "Assets",
          value: 0,
          kind: "metric",
          rollupKey: "section_header"
        },
        {
          key: "current_assets",
          label: "Current Assets",
          value: totalCurrentAssets,
          kind: "line_item"
        },
        {
          key: "non_current_assets",
          label: "Non-Current Assets",
          value: totalNonCurrentAssets,
          kind: "line_item"
        },
        {
          key: "total_assets",
          label: "Total Assets",
          value: totalAssets,
          kind: "subtotal",
          rollupKey: "total_assets"
        },
        {
          key: "liabilities_section",
          label: "Liabilities",
          value: 0,
          kind: "metric",
          rollupKey: "section_header"
        },
        {
          key: "current_liabilities",
          label: "Current Liabilities",
          value: totalCurrentLiabilities,
          kind: "line_item"
        },
        {
          key: "non_current_liabilities",
          label: "Non-Current Liabilities",
          value: totalNonCurrentLiabilities,
          kind: "line_item"
        },
        {
          key: "total_liabilities",
          label: "Total Liabilities",
          value: totalLiabilities,
          kind: "subtotal",
          rollupKey: "total_liabilities"
        },
        {
          key: "equity_section",
          label: "Equity",
          value: 0,
          kind: "metric",
          rollupKey: "section_header"
        },
        {
          key: "total_equity",
          label: "Total Equity",
          value: totalEquity,
          kind: "subtotal",
          rollupKey: "total_equity"
        },
        {
          key: "total_liabilities_and_equity",
          label: "Total Liabilities & Equity",
          value: totalLiabilitiesAndEquity,
          kind: "subtotal",
          rollupKey: "total_liabilities_and_equity"
        }
      ],
      footerLabel: "Working Capital",
      footerValue: workingCapital
    };
  }

  return {
    statementKey: "balance_sheet",
    title: "Balance Sheet",
    rows: toNormalizedStatementRows(buildSnapshotBalanceSheet(snapshot), ["Working Capital"]),
    footerLabel: "Working Capital",
    footerValue: snapshot.workingCapital
  };
}

export function FinancialsView({ data }: FinancialsViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [mode, setMode] = useState<FinancialsMode>("reported");
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [underwritingInputValues, setUnderwritingInputValues] =
    useState<CreditScenarioInputValues>(DEFAULT_CREDIT_SCENARIO_INPUT_VALUES);
  const [underwritingEbitdaBasis, setUnderwritingEbitdaBasis] =
    useState<UnderwritingEbitdaBasis>("computed");
  const [selectedPeriodId, setSelectedPeriodId] = useState(data.snapshot.periodId || "");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);
  const [isDeletingPeriod, setIsDeletingPeriod] = useState(false);

  const availablePeriods = useMemo(() => {
    const entryCountsByPeriodId = new Map<string, number>();

    data.entries.forEach((entry) => {
      entryCountsByPeriodId.set(
        entry.period_id,
        (entryCountsByPeriodId.get(entry.period_id) ?? 0) + 1
      );
    });

    return data.snapshots
      .filter((snapshot) => (entryCountsByPeriodId.get(snapshot.periodId) ?? 0) > 0)
      .map((snapshot) => ({
        periodId: snapshot.periodId,
        label: snapshot.label,
        periodDate: snapshot.periodDate,
        entryCount: entryCountsByPeriodId.get(snapshot.periodId) ?? 0
      }))
      .sort((left, right) =>
        (left.periodDate || left.label).localeCompare(right.periodDate || right.label)
      );
  }, [data.entries, data.snapshots]);

  const selectedPeriodBeforeFallback = selectedPeriodId || data.snapshot.periodId || "";

  const effectiveSnapshot = useMemo(() => {
    const requestedPeriodId = selectedPeriodId || data.snapshot.periodId;
    const currentHasData = availablePeriods.some(
      (period) => period.periodId === requestedPeriodId
    );

    if (currentHasData) {
      return (
        data.snapshots.find((snapshot) => snapshot.periodId === requestedPeriodId) ??
        data.snapshot
      );
    }

    const latestAvailablePeriodId = availablePeriods[availablePeriods.length - 1]?.periodId ?? "";

    return (
      data.snapshots.find((snapshot) => snapshot.periodId === latestAvailablePeriodId) ??
      data.snapshot
    );
  }, [availablePeriods, data.snapshot, data.snapshots, selectedPeriodId]);

  const effectiveNormalizedOutput = useMemo(
    () =>
      data.normalizedPeriods.find((period) => period.periodId === effectiveSnapshot.periodId) ??
      data.normalizedOutput ??
      null,
    [data.normalizedOutput, data.normalizedPeriods, effectiveSnapshot.periodId]
  );

  const selectedPeriodAfterFallback = effectiveSnapshot.periodId || "";
  const chosenPeriodHasData = availablePeriods.some(
    (period) => period.periodId === effectiveSnapshot.periodId
  );

  useEffect(() => {
    console.log("FINANCIAL STATEMENTS PERIOD SELECTION", {
      availablePeriods,
      selectedPeriodBeforeFallback,
      selectedPeriodAfterFallback,
      chosenPeriodHasData
    });
  }, [
    availablePeriods,
    chosenPeriodHasData,
    selectedPeriodAfterFallback,
    selectedPeriodBeforeFallback
  ]);

  const incomeStatement = useMemo(
    () =>
      mode === "reported"
        ? buildReportedIncomeStatement({
            normalizedOutput: effectiveNormalizedOutput,
            snapshot: effectiveSnapshot
          })
        : buildAdjustedIncomeStatement({
            normalizedOutput: effectiveNormalizedOutput,
            snapshot: effectiveSnapshot
          }),
    [effectiveNormalizedOutput, effectiveSnapshot, mode]
  );

  const balanceSheet = useMemo(
    () =>
      buildBalanceSheet({
        entries: data.entries,
        snapshot: effectiveSnapshot
      }),
    [data.entries, effectiveSnapshot]
  );
  const balanceSheetValidation = useMemo(() => {
    const rollup = buildBalanceSheetRollup(data.entries, effectiveSnapshot.periodId);

    return buildBalanceSheetValidation({
      entries: data.entries,
      snapshot: effectiveSnapshot,
      rollup
    });
  }, [data.entries, effectiveSnapshot]);

  useEffect(() => {
    console.log("INCOME STATEMENT AGGREGATION", {
      selectedPeriod: {
        periodId: effectiveSnapshot.periodId,
        label: effectiveSnapshot.label,
        periodDate: effectiveSnapshot.periodDate ?? null
      },
      aggregation:
        effectiveNormalizedOutput?.incomeStatementDebug ??
        effectiveSnapshot.incomeStatementDebug ??
        null,
      metrics:
        effectiveNormalizedOutput?.incomeStatementMetricDebug ??
        effectiveSnapshot.incomeStatementMetricDebug ??
        null
    });
  }, [effectiveNormalizedOutput, effectiveSnapshot]);

  useEffect(() => {
    const balanceSheetRollup = buildBalanceSheetRollup(
      data.entries,
      effectiveSnapshot.periodId
    );
    const groupedSums = balanceSheetRollup.selectedPeriodRows.reduce<Record<string, number>>(
      (acc, line) => {
        const normalizedCategory = canonicalizeCategoryPath(line.normalizedCategory);
        acc[normalizedCategory] = (acc[normalizedCategory] ?? 0) + line.amount;
        return acc;
      },
      {}
    );

    console.log("BALANCE SHEET AGGREGATION", {
      selectedPeriod: {
        periodId: effectiveSnapshot.periodId,
        label: effectiveSnapshot.label,
        periodDate: effectiveSnapshot.periodDate ?? null
      },
      selectedPeriodRowDiagnostics: balanceSheetRollup.selectedPeriodRows.map((row) => ({
        accountName: row.accountName,
        account_name: row.account_name ?? null,
        amount: row.amount,
        category: row.category ?? null,
        normalizedCategory: row.normalizedCategory,
        normalized_category: row.normalized_category ?? null,
        statementType: row.statementType,
        statement_type: row.statement_type ?? null,
        familyMatchedAs: row.familyMatchedAs
      })),
      selectedPeriodRows: balanceSheetRollup.selectedPeriodRows,
      includedInGroups: {
        current_assets: balanceSheetRollup.familyRows.currentAssets,
        non_current_assets: balanceSheetRollup.familyRows.nonCurrentAssets,
        current_liabilities: balanceSheetRollup.familyRows.currentLiabilities,
        non_current_liabilities: balanceSheetRollup.familyRows.nonCurrentLiabilities,
        equity: balanceSheetRollup.familyRows.equity
      },
      groupedSums,
      finalTotals: balanceSheetRollup.finalTotals,
      balanceCheck: {
        isBalanced:
          balanceSheetRollup.finalTotals.totalAssets ===
          balanceSheetRollup.finalTotals.totalLiabilitiesAndEquity,
        difference:
          balanceSheetRollup.finalTotals.totalAssets -
          balanceSheetRollup.finalTotals.totalLiabilitiesAndEquity
      }
    });
  }, [data.entries, effectiveSnapshot]);

  useEffect(() => {
    console.log("BALANCE SHEET VALIDATION RESULT", {
      computedTotals: balanceSheetValidation.computedTotals,
      sourceTotalRowsFound: balanceSheetValidation.sourceTotals,
      validationChecks: balanceSheetValidation.checks
    });
  }, [balanceSheetValidation]);

  useEffect(() => {
    setUnderwritingEbitdaBasis(mode === "adjusted" ? "adjusted" : "computed");
  }, [mode]);

  useEffect(() => {
    const nextPeriodId =
      data.snapshot.periodId || availablePeriods[availablePeriods.length - 1]?.periodId || "";
    setSelectedPeriodId(nextPeriodId);
  }, [availablePeriods, data.snapshot.periodId]);

  const adjustedFooterDisplay =
    data.readiness.status === "blocked" ? "Not reliable" : null;
  const effectiveBridge = effectiveNormalizedOutput?.bridge ?? data.ebitdaBridge ?? null;
  const ebitdaExplainability =
    effectiveNormalizedOutput?.ebitdaExplainability ??
    effectiveSnapshot.ebitdaExplainability ??
    null;
  const balanceDifference =
    balanceSheetValidation.computedTotals.totalAssets -
    balanceSheetValidation.computedTotals.totalLiabilitiesAndEquity;
  const balanceSheetBalances =
    Math.abs(balanceDifference) <= BALANCE_SHEET_VALIDATION_TOLERANCE;
  const sourceComparisonChecks = balanceSheetValidation.checks.filter(
    (check) => check.key.startsWith("source_") && check.sourceValue !== undefined
  );
  const parsedUnderwritingInputs = useMemo(
    () => parseCreditScenarioInputValues(underwritingInputValues),
    [underwritingInputValues]
  );
  const underwritingScenario = useMemo(
    () =>
      buildCreditScenario({
        inputs: parsedUnderwritingInputs,
        ebitda:
          underwritingEbitdaBasis === "adjusted"
            ? effectiveSnapshot.adjustedEbitda
            : effectiveSnapshot.ebitda
      }),
    [effectiveSnapshot, parsedUnderwritingInputs, underwritingEbitdaBasis]
  );
  const missingUnderwritingInputs = useMemo(() => {
    const fieldLabels: Record<keyof typeof parsedUnderwritingInputs, string> = {
      loanAmount: "Loan amount",
      annualInterestRatePercent: "Interest rate",
      loanTermYears: "Loan term",
      amortizationYears: "Amortization",
      collateralValue: "Collateral value"
    };

    return Object.entries(parsedUnderwritingInputs)
      .filter(([, value]) => value === null)
      .map(([key]) => fieldLabels[key as keyof typeof parsedUnderwritingInputs]);
  }, [parsedUnderwritingInputs]);
  const acceptedAddBackItemsForSnapshot = useMemo(
    () =>
      data.addBackReviewItems.filter(
        (item) =>
          item.periodId === effectiveSnapshot.periodId && item.status === "accepted"
      ),
    [data.addBackReviewItems, effectiveSnapshot.periodId]
  );
  const riskFlags = useMemo(
    () =>
      buildRiskFlags({
        snapshot: effectiveSnapshot,
        creditScenario: underwritingScenario,
        readiness: data.readiness,
        dataQuality: data.dataQuality,
        acceptedAddBackItems: acceptedAddBackItemsForSnapshot
      }),
    [
      acceptedAddBackItemsForSnapshot,
      data.dataQuality,
      data.readiness,
      effectiveSnapshot,
      underwritingScenario
    ]
  );

  async function deleteCompany() {
    if (!data.company || isDeletingCompany) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${data.company.name} and all related periods, entries, mappings, and add-backs? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setIsDeletingCompany(true);

    try {
      const response = await fetch(`/api/companies/${data.company.id}`, {
        method: "DELETE"
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Company could not be deleted.");
      }

      router.push("/deals");
      router.refresh();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Company could not be deleted."
      );
    } finally {
      setIsDeletingCompany(false);
    }
  }

  async function deletePeriod() {
    if (!effectiveSnapshot.periodId || isDeletingPeriod) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${effectiveSnapshot.label} and all entries and add-backs for this reporting period? This cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setIsDeletingPeriod(true);

    try {
      const response = await fetch(`/api/periods/${effectiveSnapshot.periodId}`, {
        method: "DELETE"
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Reporting period could not be deleted.");
      }

      router.refresh();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Reporting period could not be deleted."
      );
    } finally {
      setIsDeletingPeriod(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-6 shadow-panel md:px-8">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                {data.company?.name || "No company selected"} •{" "}
                {effectiveSnapshot.label || "No reporting period loaded"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                {data.company?.name || "No company selected"}
              </h1>
              <p className="mt-3 text-sm text-slate-600 md:text-base">
                Selected period: {effectiveSnapshot.label || "No reporting period loaded"}
              </p>
            </div>

              <div className="flex flex-wrap items-start gap-3">
              {data.company ? (
                <button
                  type="button"
                  onClick={deleteCompany}
                  disabled={isDeletingCompany}
                  className="rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeletingCompany ? "Deleting company..." : "Delete Company"}
                </button>
              ) : null}
              <Link
                href="/deals"
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                All Deals
              </Link>
              <Link
                href="/source-data"
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Source Data
              </Link>
              </div>
            </div>

            <nav aria-label="Deal workspace sections" className="border-b border-slate-200">
              <div className="flex flex-wrap gap-1">
                {WORKSPACE_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`border-b-2 px-4 py-3 text-sm font-medium ${
                      activeTab === tab.id
                        ? "border-slate-900 text-slate-950"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </nav>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Statement Basis
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Reported / Adjusted
              </h2>
            </div>

            <div className="flex flex-col gap-3 sm:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  Period
                </label>
                <select
                  value={effectiveSnapshot.periodId}
                  onChange={(event) => setSelectedPeriodId(event.target.value)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                  disabled={availablePeriods.length === 0 || isDeletingPeriod}
                >
                  {availablePeriods.map((period) => (
                    <option key={period.periodId} value={period.periodId}>
                      {period.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={deletePeriod}
                  disabled={!effectiveSnapshot.periodId || isDeletingPeriod}
                  className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isDeletingPeriod ? "Deleting period..." : "Delete Period"}
                </button>
              </div>
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setMode("reported")}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${
                    mode === "reported"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  Reported
                </button>
                <button
                  type="button"
                  onClick={() => setMode("adjusted")}
                  className={`rounded-full px-4 py-2 text-sm font-medium ${
                    mode === "adjusted"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  Adjusted
                </button>
              </div>
            </div>
          </div>

          {deleteError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {deleteError}
            </div>
          ) : null}

          {mode === "adjusted" ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Adjusted view reflects accepted EBITDA adjustments. Underlying line items remain reported where full adjusted restatement is not available.
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Reported view reflects the normalized reported statement presentation for the selected period.
            </div>
          )}
        </section>

        {activeTab === "overview" ? (
          <section className="space-y-6">
            <UnderwritingSnapshotPanel
              snapshot={effectiveSnapshot}
              scenario={underwritingScenario}
              ebitdaBasis={underwritingEbitdaBasis}
              missingInputs={missingUnderwritingInputs}
            />
            <DealDecisionPanel
              snapshot={effectiveSnapshot}
              creditScenario={underwritingScenario}
              riskFlags={riskFlags}
              acceptedAddBackTotal={effectiveSnapshot.acceptedAddBacks ?? 0}
            />
            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
              <div className="mb-4">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Similar deals
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  Similar deals
                </h2>
              </div>

              {data.similarDeals.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 text-[13px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Company
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          EBITDA
                        </th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Adjusted EBITDA
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Decision
                        </th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                          Primary Risk
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {data.similarDeals.map((deal) => (
                        <tr
                          key={deal.companyId}
                          className="cursor-pointer transition-colors hover:bg-slate-50"
                          onClick={() => router.push(`/deal/${deal.companyId}`)}
                        >
                          <td className="px-3 py-2.5 font-medium text-slate-900">
                            {deal.companyName}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                            {deal.ebitda === null ? "—" : formatCurrency(deal.ebitda)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-900">
                            {deal.adjustedEbitda === null
                              ? "—"
                              : formatCurrency(deal.adjustedEbitda)}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-700">
                              {deal.decision}
                            </span>
                          </td>
                          <td className="max-w-[260px] px-3 py-2.5 text-[12px] text-slate-600">
                            <span className="block truncate">{deal.primaryRisk ?? "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No similar deals found</p>
              )}
            </section>
            <RiskFlagsPanel
              snapshot={effectiveSnapshot}
              creditScenario={underwritingScenario}
              readiness={data.readiness}
              dataQuality={data.dataQuality}
              acceptedAddBackItems={acceptedAddBackItemsForSnapshot}
            />
            <CreditScenarioPanel
              snapshot={effectiveSnapshot}
              inputValues={underwritingInputValues}
              onInputValuesChange={setUnderwritingInputValues}
              ebitdaBasis={underwritingEbitdaBasis}
              onEbitdaBasisChange={setUnderwritingEbitdaBasis}
              scenario={underwritingScenario}
            />
          </section>
        ) : null}

        {activeTab === "financials" ? (
          <>
        <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    Financial Truth
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    Income statement and earnings base
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Start with the reported statement, then follow the canonical EBITDA build and accepted adjustment path into underwriting.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    EBITDA Basis
                  </p>
                  <p className="mt-1 text-lg font-semibold text-slate-900">
                    {formatCurrency(effectiveSnapshot.ebitda)}
                  </p>
                </div>
              </div>
            </section>
            <StatementTable
              statement={incomeStatement}
              footerValueDisplay={mode === "adjusted" ? adjustedFooterDisplay : null}
            />
            <EbitdaExplainabilityPanel explainability={ebitdaExplainability} />
            <EbitdaBridge bridge={effectiveBridge} />
          </div>
          <div className="space-y-4">
            <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Balance Sheet Validation
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {balanceSheetValidation.overallSeverity === "pass"
                      ? "Balance sheet reconciles for the selected period."
                      : balanceSheetValidation.overallSeverity === "warning"
                        ? "Balance sheet has discrepancies. Review validation details."
                        : "Balance sheet does not reconcile. Review differences below."}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    balanceSheetValidation.overallSeverity === "pass"
                      ? "bg-teal-100 text-teal-800"
                      : balanceSheetValidation.overallSeverity === "warning"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {balanceSheetValidation.overallSeverity === "pass"
                    ? "Pass"
                    : balanceSheetValidation.overallSeverity === "warning"
                      ? "Warning"
                      : "Fail"}
                </span>
              </div>

              <div
                className={`mt-4 grid gap-3 ${
                  sourceComparisonChecks.length > 0 ? "xl:grid-cols-3" : "md:grid-cols-2"
                }`}
              >
                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    balanceSheetBalances
                      ? "border-teal-200 bg-teal-50"
                      : "border-rose-200 bg-rose-50"
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    Balance Check
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {balanceSheetBalances
                      ? "Balance Sheet Balances"
                      : "Balance Sheet Does Not Balance"}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {balanceSheetBalances
                      ? "Assets = Liabilities + Equity"
                      : "Assets ≠ Liabilities + Equity"}
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {formatCurrency(balanceSheetValidation.computedTotals.totalAssets)} ={" "}
                    {formatCurrency(
                      balanceSheetValidation.computedTotals.totalLiabilitiesAndEquity
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Difference:{" "}
                    <span
                      className={
                        Math.abs(balanceDifference) <= BALANCE_SHEET_VALIDATION_TOLERANCE
                          ? "font-medium text-teal-700"
                          : "font-semibold text-rose-700"
                      }
                    >
                      {formatCurrency(balanceDifference)}
                    </span>
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    Computed Totals
                  </p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Assets
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    Total Assets:{" "}
                    {formatCurrency(balanceSheetValidation.computedTotals.totalAssets)}
                  </p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Liabilities & Equity
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Total Liabilities:{" "}
                    {formatCurrency(balanceSheetValidation.computedTotals.totalLiabilities)}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Total Equity: {formatCurrency(balanceSheetValidation.computedTotals.totalEquity)}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Total Liabilities & Equity:{" "}
                    {formatCurrency(
                      balanceSheetValidation.computedTotals.totalLiabilitiesAndEquity
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Working Capital:{" "}
                    {formatCurrency(balanceSheetValidation.computedTotals.workingCapital)}
                  </p>
                </div>
                {sourceComparisonChecks.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                      Source vs Computed
                    </p>
                    <div className="mt-2 space-y-3">
                      {sourceComparisonChecks.map((check) => (
                        <div
                          key={check.key}
                          className={`rounded-xl border bg-white px-3 py-2 ${
                            check.difference !== undefined &&
                            Math.abs(check.difference) > BALANCE_SHEET_VALIDATION_TOLERANCE
                              ? "border-rose-200"
                              : "border-slate-200"
                          }`}
                        >
                          <p className="text-sm font-medium text-slate-900">
                            {check.label.replace(": Source vs Computed", "")}
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            Source:{" "}
                            {check.sourceValue !== undefined
                              ? formatCurrency(check.sourceValue)
                              : "—"}
                          </p>
                          <p className="text-sm text-slate-700">
                            Computed:{" "}
                            {check.computedValue !== undefined
                              ? formatCurrency(check.computedValue)
                              : "—"}
                          </p>
                          <p className="text-sm text-slate-700">
                            Difference:{" "}
                            <span
                              className={
                                check.difference !== undefined &&
                                Math.abs(check.difference) > BALANCE_SHEET_VALIDATION_TOLERANCE
                                  ? "font-semibold text-rose-700"
                                  : "font-medium text-teal-700"
                              }
                            >
                              {check.difference !== undefined
                                ? formatCurrency(check.difference)
                                : "—"}
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <details
                open={showValidationDetails}
                onToggle={(event) =>
                  setShowValidationDetails(
                    (event.currentTarget as HTMLDetailsElement).open
                  )
                }
                className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                  {showValidationDetails
                    ? "Hide validation details"
                    : "View validation details"}
                </summary>
                <div className="mt-4 space-y-3">
                  {balanceSheetValidation.checks.map((check) => (
                    <div
                      key={check.key}
                      className={`rounded-2xl border bg-white px-4 py-3 ${
                        check.severity === "pass"
                          ? "border-teal-200"
                          : check.severity === "warning"
                            ? "border-amber-200"
                            : "border-rose-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{check.label}</p>
                          <p className="mt-1 text-sm text-slate-600">{check.message}</p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            check.severity === "pass"
                              ? "bg-teal-100 text-teal-800"
                              : check.severity === "warning"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {check.severity === "pass"
                            ? "Pass"
                            : check.severity === "warning"
                              ? "Warning"
                              : "Fail"}
                        </span>
                      </div>
                      {check.computedValue !== undefined || check.sourceValue !== undefined ? (
                        <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                          <p>
                            {check.sourceValue !== undefined
                              ? `Computed ${check.label.replace(": Source vs Computed", "")}: `
                              : "Computed: "}
                            {check.computedValue !== undefined
                              ? formatCurrency(check.computedValue)
                              : "—"}
                          </p>
                          <p>
                            {check.sourceValue !== undefined
                              ? `Source ${check.label.replace(": Source vs Computed", "")}: `
                              : "Source: "}
                            {check.sourceValue !== undefined
                              ? formatCurrency(check.sourceValue)
                              : "—"}
                          </p>
                          <p>
                            Difference:{" "}
                            {check.difference !== undefined
                              ? formatCurrency(check.difference)
                              : "—"}
                          </p>
                        </div>
                      ) : null}
                      {check.contributingLineItems?.length ? (
                        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          {check.contributingLineItems.map((item) => (
                            <p key={`${check.key}-${item.accountName}-${item.normalizedCategory}`}>
                              {item.accountName} • {item.normalizedCategory} •{" "}
                              {formatCurrency(item.amount)}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            </section>
            <StatementTable statement={balanceSheet} />
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
              Operating Context
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900">
              Trend support for underwriting
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Keep multi-period context close to the deal analysis workflow without repeating EBITDA or adjustment summaries.
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <DashboardCharts series={data.series} />
            <PerformanceDrivers analyses={data.driverAnalyses} />
          </div>
        </section>

        <MultiPeriodSummaryTable snapshots={data.snapshots} />
          </>
        ) : null}

        {activeTab === "adjustments" ? (
          <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
            <div className="mb-4">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Adjustments
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Add-backs and adjusted EBITDA
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Review, document, and approve adjustments within the company profile for the selected period.
              </p>
            </div>
            <AddBackReviewPanel
              companyId={data.company?.id ?? null}
              periods={data.periods}
              items={data.addBackReviewItems}
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}

