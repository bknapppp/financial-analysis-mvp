"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { DealPageNavigation } from "@/components/deal-page-navigation";
import { InvestmentOverviewPanel } from "@/components/investment-overview-panel";
import { MultiPeriodSummaryTable } from "@/components/multi-period-summary-table";
import { PerformanceDrivers } from "@/components/performance-drivers";
import { RiskFlagsPanel } from "@/components/risk-flags-panel";
import { StatementTable } from "@/components/statement-table";
import { UnderwritingCompletionPanel } from "@/components/underwriting-completion-panel";
import { UnderwritingSnapshotPanel } from "@/components/underwriting-snapshot-panel";
import { buildCreditScenario } from "@/lib/credit-scenario";
import { devLog, isDevelopment } from "@/lib/debug";
import {
  ADD_BACK_LAYER_SECTION_ID,
  UNDERWRITING_WORKBENCH_SECTION_ID
} from "@/lib/fix-it";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { buildUnderwritingCompletion, getMissingCreditScenarioInputs } from "@/lib/underwriting/completion";
import { buildInvestmentOverview } from "@/lib/underwriting/investment-overview";
import type {
  DashboardData,
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

function toNormalizedStatementRows(
  rows: Array<{ label: string; value: number | null }>,
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
  snapshot: PeriodSnapshot;
  rollup: ReturnType<typeof buildBalanceSheetRollup>;
}): NormalizedStatement {
  const { snapshot, rollup: balanceSheetRollup } = params;
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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isDevelopment = process.env.NODE_ENV !== "production";
  const requestedTab = searchParams.get("tab");
  const requestedFixSection = searchParams.get("fixSection");
  const requestedFixField = searchParams.get("fixField");
  const shouldOpenOverviewForFix =
    requestedFixSection === UNDERWRITING_WORKBENCH_SECTION_ID || Boolean(requestedFixField);
  const shouldOpenFinancialsForFix = requestedFixSection === ADD_BACK_LAYER_SECTION_ID;
  const initialTab: WorkspaceTab =
    shouldOpenOverviewForFix
      ? "overview"
      : shouldOpenFinancialsForFix || requestedTab === "financials"
      ? "financials"
      : requestedTab === "adjustments"
      ? "adjustments"
      : pathname === "/financials"
        ? "financials"
        : "overview";
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(
    initialTab
  );
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

  const balanceSheetRollup = useMemo(
    () => buildBalanceSheetRollup(data.entries, effectiveSnapshot.periodId),
    [data.entries, effectiveSnapshot.periodId]
  );

  useEffect(() => {
    if (!isDevelopment) {
      return;
    }

    devLog("FINANCIAL STATEMENTS PERIOD SELECTION", {
      availablePeriods,
      selectedPeriodBeforeFallback,
      selectedPeriodAfterFallback,
      chosenPeriodHasData
    });
  }, [
    availablePeriods,
    chosenPeriodHasData,
    isDevelopment,
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
        snapshot: effectiveSnapshot,
        rollup: balanceSheetRollup
      }),
    [balanceSheetRollup, effectiveSnapshot]
  );
  const balanceSheetValidation = useMemo(() => {
    return buildBalanceSheetValidation({
      entries: data.entries,
      snapshot: effectiveSnapshot,
      rollup: balanceSheetRollup
    });
  }, [balanceSheetRollup, data.entries, effectiveSnapshot]);

  useEffect(() => {
    if (!isDevelopment) {
      return;
    }

    devLog("INCOME STATEMENT AGGREGATION", {
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
  }, [effectiveNormalizedOutput, effectiveSnapshot, isDevelopment]);

  useEffect(() => {
    if (!isDevelopment) {
      return;
    }

    const groupedSums = balanceSheetRollup.selectedPeriodRows.reduce<Record<string, number>>(
      (acc, line) => {
        const normalizedCategory = canonicalizeCategoryPath(line.normalizedCategory);
        acc[normalizedCategory] = (acc[normalizedCategory] ?? 0) + line.amount;
        return acc;
      },
      {}
    );

    devLog("BALANCE SHEET AGGREGATION", {
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
  }, [balanceSheetRollup, effectiveSnapshot, isDevelopment]);

  useEffect(() => {
    if (!isDevelopment) {
      return;
    }

    devLog("BALANCE SHEET VALIDATION RESULT", {
      computedTotals: balanceSheetValidation.computedTotals,
      sourceTotalRowsFound: balanceSheetValidation.sourceTotals,
      validationChecks: balanceSheetValidation.checks
    });
  }, [balanceSheetValidation, isDevelopment]);

  useEffect(() => {
    setActiveTab(
      shouldOpenOverviewForFix
        ? "overview"
        : shouldOpenFinancialsForFix || requestedTab === "financials"
        ? "financials"
        : requestedTab === "adjustments"
        ? "adjustments"
        : pathname === "/financials"
          ? "financials"
          : "overview"
    );
  }, [pathname, requestedTab, shouldOpenFinancialsForFix, shouldOpenOverviewForFix]);

  useEffect(() => {
    if (activeTab !== "financials" || requestedFixSection !== ADD_BACK_LAYER_SECTION_ID) {
      return;
    }

    const section = document.getElementById(ADD_BACK_LAYER_SECTION_ID);
    if (!section) {
      return;
    }

    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [activeTab, requestedFixSection]);

  useEffect(() => {
    setUnderwritingEbitdaBasis(mode === "adjusted" ? "adjusted" : "computed");
  }, [mode]);

  useEffect(() => {
    const nextPeriodId =
      data.snapshot.periodId || availablePeriods[availablePeriods.length - 1]?.periodId || "";
    setSelectedPeriodId(nextPeriodId);
  }, [availablePeriods, data.snapshot.periodId]);

  const companyId = data.company?.id ?? null;
  const companyName = data.company?.name || "No company selected";
  const overviewHref = companyId ? `/deal/${companyId}` : "/";
  const financialsHref = companyId ? `/financials?companyId=${companyId}` : "/financials";
  const sourceDataHref = companyId ? `/source-data?companyId=${companyId}` : "/source-data";
  const currentSection = activeTab === "financials" ? "Financials" : "Overview";
  const effectiveBridge = effectiveNormalizedOutput?.bridge ?? data.ebitdaBridge ?? null;
  const ebitdaExplainability =
    effectiveNormalizedOutput?.ebitdaExplainability ??
    effectiveSnapshot.ebitdaExplainability ??
    null;
  const addBackThresholdPercent = 25;
  const effectiveAddBackTotal =
    effectiveBridge?.addBackTotal ?? effectiveSnapshot.acceptedAddBacks ?? 0;
  const missingExplainabilityComponents =
    ebitdaExplainability?.missingComponents ?? [];
  const bridgeInvalidReasons = effectiveBridge?.invalidReasons ?? [];
  const bridgeWarnings = effectiveBridge?.warnings ?? [];
  const addBackShareOfEbitdaPercent =
    effectiveSnapshot.ebitda !== null && effectiveSnapshot.ebitda !== 0
      ? (effectiveAddBackTotal / Math.abs(effectiveSnapshot.ebitda)) * 100
      : null;
  const financialStatusLabel =
    data.readiness.status === "blocked"
      ? missingExplainabilityComponents.length > 0
        ? "Incomplete earnings base"
        : "Missing required inputs"
      : data.readiness.status === "caution"
        ? "Pending validation"
        : "Ready for review";
  const financialStatusMessage =
    data.readiness.status === "blocked"
      ? missingExplainabilityComponents.length > 0
        ? `Missing EBITDA support for ${missingExplainabilityComponents.join(", ")}.`
        : bridgeInvalidReasons[0] ?? data.readiness.summaryMessage
      : data.readiness.status === "caution"
        ? bridgeWarnings[0] ?? data.readiness.summaryMessage
        : data.dataQuality.confidenceLabel !== "High"
          ? `${data.dataQuality.confidenceLabel} confidence with ${formatPercent(
              data.dataQuality.mappingCoveragePercent
            )} mapping coverage.`
          : "Adjusted EBITDA is supported by the current normalized mapping set.";
  const adjustmentsLabel =
    data.readiness.status === "ready"
      ? "Applied adjustments"
      : "Proposed adjustments";
  const adjustedEbitdaDisplay =
    data.readiness.status === "blocked"
      ? "Unavailable"
      : formatCurrency(effectiveSnapshot.adjustedEbitda);
  const topStripStatusMessage =
    data.readiness.status === "blocked"
      ? `Adjusted EBITDA unavailable — ${financialStatusLabel.toLowerCase()}`
      : data.readiness.status === "caution"
        ? "Adjusted EBITDA pending validation"
        : "Adjusted EBITDA supported";
  const constructionNotes = [
    mode === "adjusted"
      ? "Income statement is shown in adjusted view."
      : "Income statement is shown in reported view.",
    missingExplainabilityComponents.length > 0
      ? `Missing bottom-up inputs: ${missingExplainabilityComponents.join(", ")}.`
      : null,
    data.readiness.status !== "ready"
      ? `Adjustments are labeled as ${adjustmentsLabel.toLowerCase()} until adjusted EBITDA is fully supported.`
      : "Adjustments are fully applied in the supported adjusted EBITDA view."
  ].filter((note): note is string => Boolean(note));
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
  const missingUnderwritingInputs = useMemo(
    () => getMissingCreditScenarioInputs(parsedUnderwritingInputs),
    [parsedUnderwritingInputs]
  );
  const acceptedAddBackItemsForSnapshot = useMemo(
    () =>
      data.addBackReviewItems.filter(
        (item) =>
          item.periodId === effectiveSnapshot.periodId && item.status === "accepted"
      ),
    [data.addBackReviewItems, effectiveSnapshot.periodId]
  );
  const completionSummary = useMemo(
    () =>
      buildUnderwritingCompletion({
        snapshot: effectiveSnapshot,
        entries: data.entries,
        dataQuality: data.dataQuality,
        taxSourceStatus: data.taxSourceStatus,
        underwritingInputs: parsedUnderwritingInputs,
        creditScenario: underwritingScenario
      }),
    [
      data.dataQuality,
      data.entries,
      data.taxSourceStatus,
      effectiveSnapshot,
      parsedUnderwritingInputs,
      underwritingScenario
    ]
  );
  const investmentOverview = useMemo(
    () =>
      buildInvestmentOverview({
        snapshot: effectiveSnapshot,
        acceptedAddBackTotal: effectiveSnapshot.acceptedAddBacks ?? 0,
        ebitdaBasis: underwritingEbitdaBasis,
        underwritingInputs: parsedUnderwritingInputs,
        creditScenario: underwritingScenario,
        dataQuality: data.dataQuality,
        reconciliation: data.reconciliation,
        taxSourceStatus: data.taxSourceStatus,
        completionSummary
      }),
    [
      completionSummary,
      data.dataQuality,
      data.reconciliation,
      data.taxSourceStatus,
      effectiveSnapshot,
      parsedUnderwritingInputs,
      underwritingEbitdaBasis,
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
                <DealPageNavigation
                  companyName={companyName}
                  currentSection={currentSection}
                  allDealsHref="/deals"
                  overviewHref={overviewHref}
                  financialsHref={financialsHref}
                  sourceDataHref={sourceDataHref}
                />
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  {data.company?.name || "No company selected"} -{" "}
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
              </div>
            </div>
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
            <section>
              <UnderwritingSnapshotPanel
                snapshot={effectiveSnapshot}
                scenario={underwritingScenario}
                ebitdaBasis={underwritingEbitdaBasis}
                missingInputs={missingUnderwritingInputs}
              />
            </section>
            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
              <div className="max-w-3xl">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Performance & Trends
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  Performance & Trends
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Keep trend context close to the top of the workflow so revenue, earnings, and change drivers can be scanned before underwriting details.
                </p>
              </div>
              <div className="mt-5 space-y-6 rounded-[1.5rem] bg-slate-50 p-4">
                <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
                  <DashboardCharts series={data.series} showOuterCard={false} />
                  <PerformanceDrivers analyses={data.driverAnalyses} showOuterCard={false} />
                </div>
                <MultiPeriodSummaryTable snapshots={data.snapshots} showOuterCard={false} />
              </div>
            </section>
            <CreditScenarioPanel
              snapshot={effectiveSnapshot}
              inputValues={underwritingInputValues}
              onInputValuesChange={setUnderwritingInputValues}
              ebitdaBasis={underwritingEbitdaBasis}
              onEbitdaBasisChange={setUnderwritingEbitdaBasis}
              scenario={underwritingScenario}
              missingInputs={missingUnderwritingInputs}
            />
            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
              <InvestmentOverviewPanel overview={investmentOverview} detailHref="/source-data" />
              <RiskFlagsPanel
                snapshot={effectiveSnapshot}
                creditScenario={underwritingScenario}
                readiness={data.readiness}
                dataQuality={data.dataQuality}
                acceptedAddBackItems={acceptedAddBackItemsForSnapshot}
                blockers={completionSummary.blockers}
              />
            </section>
            <UnderwritingCompletionPanel
              companyId={companyId}
              summary={completionSummary}
            />
          </section>
        ) : null}

        {activeTab === "financials" ? (
          <>
            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
              <div className="grid gap-4 border-b border-slate-200 pb-4 md:grid-cols-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Reported EBITDA
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                    {formatCurrency(effectiveSnapshot.ebitda)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    {adjustmentsLabel}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-teal-700">
                    +{formatCurrency(effectiveAddBackTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Adjusted EBITDA
                  </p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                    {adjustedEbitdaDisplay}
                  </p>
                  {data.readiness.status !== "ready" ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {financialStatusLabel}
                    </p>
                  ) : null}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                    Status
                  </p>
                  <p className="mt-2 text-sm font-semibold leading-5 text-slate-950">
                    {topStripStatusMessage}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                    EBITDA Construction
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    Earnings normalization workflow
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Review the reported statement, normalize EBITDA through accepted add-backs, and carry the result into the adjusted bridge.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
                    {effectiveSnapshot.label}
                  </span>
                  <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
                    {mode === "adjusted" ? "Adjusted view" : "Reported view"}
                  </span>
                </div>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_22rem] xl:items-start">
                <div className="space-y-5">
                  <StatementTable
                    statement={incomeStatement}
                    footerValueDisplay={mode === "adjusted" && data.readiness.status === "blocked" ? financialStatusLabel : null}
                    showOuterCard={false}
                    density="compact"
                  />
                  <section
                    id={ADD_BACK_LAYER_SECTION_ID}
                    className="border-t border-slate-200 pt-5"
                  >
                    <AddBackReviewPanel
                      companyId={data.company?.id ?? null}
                      periods={data.periods}
                      items={data.addBackReviewItems}
                      periodId={effectiveSnapshot.periodId}
                      title="Add-Back Review"
                      eyebrow="EBITDA Normalization"
                      description="Review suggested and accepted adjustments before carrying them into adjusted EBITDA."
                      showOuterCard={false}
                      density="compact"
                      manualEntryMode="collapsible"
                    />
                  </section>
                </div>

                <aside className="space-y-5">
                  <section className="rounded-[1.5rem] bg-slate-50 p-4">
                    <div className="border-b border-slate-200 pb-3">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                        EBITDA Summary
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Canonical EBITDA normalized through accepted adjustments.
                      </p>
                    </div>
                    <div className="space-y-3 pt-3">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="text-sm font-medium text-slate-600">Reported / Canonical EBITDA</p>
                        <p className="text-xl font-semibold text-slate-950">
                          {formatCurrency(effectiveSnapshot.ebitda)}
                        </p>
                      </div>
                      <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3">
                        <div>
                          <p className="text-sm font-medium text-slate-600">{adjustmentsLabel}</p>
                          {addBackShareOfEbitdaPercent !== null ? (
                            <p className="mt-1 text-xs text-slate-500">
                              {formatPercent(addBackShareOfEbitdaPercent)} of EBITDA
                            </p>
                          ) : null}
                        </div>
                        <p className="text-xl font-semibold text-teal-700">
                          +{formatCurrency(effectiveAddBackTotal)}
                        </p>
                      </div>
                      <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3">
                        <p className="text-sm font-medium text-slate-700">Adjusted EBITDA</p>
                        <p className="text-xl font-semibold text-slate-950">
                          {adjustedEbitdaDisplay}
                        </p>
                      </div>
                      {data.readiness.status !== "ready" || bridgeWarnings.length ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                            Status
                          </p>
                          <p className="mt-1 font-medium text-slate-900">{financialStatusLabel}</p>
                          <p className="mt-1 text-sm leading-5 text-slate-600">{financialStatusMessage}</p>
                          {bridgeWarnings.length ? (
                            <p className="mt-2 text-xs text-amber-700">
                              {bridgeWarnings[0]}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className="border-t border-slate-200 pt-5">
                    <div className="rounded-[1.5rem] bg-slate-50 p-4">
                      <div className="border-b border-slate-200 pb-3">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                          Construction Notes
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Short context for how the EBITDA output is being presented.
                        </p>
                      </div>
                      <div className="pt-3">
                        <ul className="space-y-2 text-sm leading-5 text-slate-600">
                          {constructionNotes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                        {(bridgeWarnings.length > 1 || bridgeInvalidReasons.length > 0) ? (
                          <details className="mt-3 text-sm text-slate-600">
                            <summary className="cursor-pointer font-medium text-slate-900">
                              View construction detail
                            </summary>
                            <div className="mt-2 space-y-2">
                              {bridgeInvalidReasons.map((reason) => (
                                <p key={reason}>{reason}</p>
                              ))}
                              {bridgeWarnings.slice(1).map((warning) => (
                                <p key={warning}>{warning}</p>
                              ))}
                            </div>
                          </details>
                        ) : null}
                      </div>
                    </div>
                  </section>

                </aside>
              </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
              <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
                <StatementTable statement={balanceSheet} showOuterCard={false} />
              </section>
              <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
                <div className="space-y-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                        Supporting Data
                      </p>
                      <h2 className="mt-2 text-lg font-semibold text-slate-900">
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
                    className={`grid gap-3 ${
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
                          : "Assets != Liabilities + Equity"}
                      </p>
                      <p className="mt-2 text-sm text-slate-900">
                        {formatCurrency(balanceSheetValidation.computedTotals.totalAssets)} ={' '}
                        {formatCurrency(
                          balanceSheetValidation.computedTotals.totalLiabilitiesAndEquity
                        )}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Difference:{' '}
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
                        Total Assets:{' '}
                        {formatCurrency(balanceSheetValidation.computedTotals.totalAssets)}
                      </p>
                      <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                        Liabilities & Equity
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        Total Liabilities:{' '}
                        {formatCurrency(balanceSheetValidation.computedTotals.totalLiabilities)}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        Total Equity: {formatCurrency(balanceSheetValidation.computedTotals.totalEquity)}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        Total Liabilities & Equity:{' '}
                        {formatCurrency(
                          balanceSheetValidation.computedTotals.totalLiabilitiesAndEquity
                        )}
                      </p>
                      <p className="mt-1 text-sm text-slate-700">
                        Working Capital:{' '}
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
                                {check.label.replace(': Source vs Computed', '')}
                              </p>
                              <p className="mt-1 text-sm text-slate-700">
                                Source:{' '}
                                {check.sourceValue !== undefined
                                  ? formatCurrency(check.sourceValue)
                                  : '-'}
                              </p>
                              <p className="text-sm text-slate-700">
                                Computed:{' '}
                                {check.computedValue !== undefined
                                  ? formatCurrency(check.computedValue)
                                  : '-'}
                              </p>
                              <p className="text-sm text-slate-700">
                                Difference:{' '}
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
                                    : '-'}
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
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
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
                                  ? `Computed ${check.label.replace(': Source vs Computed', '')}: `
                                  : "Computed: "}
                                {check.computedValue !== undefined
                                  ? formatCurrency(check.computedValue)
                                  : '-'}
                              </p>
                              <p>
                                {check.sourceValue !== undefined
                                  ? `Source ${check.label.replace(': Source vs Computed', '')}: `
                                  : "Source: "}
                                {check.sourceValue !== undefined
                                  ? formatCurrency(check.sourceValue)
                                  : '-'}
                              </p>
                              <p>
                                Difference:{' '}
                                {check.difference !== undefined
                                  ? formatCurrency(check.difference)
                                  : '-'}
                              </p>
                            </div>
                          ) : null}
                          {check.contributingLineItems?.length ? (
                            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              {check.contributingLineItems.map((item) => (
                                <p key={`${check.key}-${item.accountName}-${item.normalizedCategory}`}>
                                  {item.accountName} - {item.normalizedCategory} -{' '}
                                  {formatCurrency(item.amount)}
                                </p>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              </section>
            </section>
          </>
        ) : null}        {activeTab === "adjustments" ? (
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




