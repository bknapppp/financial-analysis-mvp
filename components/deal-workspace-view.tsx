"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { buildBalanceSheet as buildSnapshotBalanceSheet, buildIncomeStatement as buildSnapshotIncomeStatement } from "@/lib/calculations";
import { AddBackReviewPanel } from "@/components/add-back-review-panel";
import { BackingChip } from "@/components/backing-chip";
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
import { DealStageSelect } from "@/components/deal-stage-select";
import { DealNextActionsPanel } from "@/components/deal-next-actions-panel";
import { DiligenceFeedbackPanel } from "@/components/diligence-feedback-panel";
import { DiligenceIssuesPanel } from "@/components/diligence-issues-panel";
import { BackingSummaryPanel } from "@/components/backing-summary-panel";
import { DocumentDrawer } from "@/components/document-drawer";
import { InvestmentOverviewPanel } from "@/components/investment-overview-panel";
import { MultiPeriodSummaryTable } from "@/components/multi-period-summary-table";
import { PerformanceDrivers } from "@/components/performance-drivers";
import { ProFormaPanel } from "@/components/pro-forma-panel";
import { StatementTable } from "@/components/statement-table";
import { UnderwritingSnapshotPanel } from "@/components/underwriting-snapshot-panel";
import { buildDealActionHref, buildDealState } from "@/lib/deal-state";
import { getDealStageDisplay, getDealStageLabel } from "@/lib/deal-stage";
import { devLog } from "@/lib/debug";
import { ADD_BACK_LAYER_SECTION_ID } from "@/lib/fix-it";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import { buildRiskFlags, type RiskFlag, type RiskFlagSeverity } from "@/lib/risk-flags";
import { buildUnderwritingAnalysis } from "@/lib/underwriting/analysis";
import { buildEbitdaChain } from "@/lib/underwriting/ebitda";
import type {
  DashboardData,
  NormalizedPeriodOutput,
  NormalizedStatement,
  PeriodSnapshot,
  UnderwritingEbitdaBasis,
  UnderwritingScenario,
  UnderwritingScenarioState
} from "@/lib/types";

export type DealWorkspaceSection = "overview" | "financials" | "underwriting";

type DealWorkspaceViewProps = {
  data: DashboardData;
  section: DealWorkspaceSection;
};

type FinancialsMode = "reported" | "adjusted";

function createDefaultUnderwritingScenario(): UnderwritingScenario {
  return {
    uplift: 0,
    interestRate: null,
    debt: null
  };
}

function createDefaultUnderwritingScenarioState(): UnderwritingScenarioState {
  return {
    selected: "base",
    scenarios: {
      base: createDefaultUnderwritingScenario(),
      upside: createDefaultUnderwritingScenario(),
      downside: createDefaultUnderwritingScenario()
    }
  };
}

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
  adjustedEbitda: number | null;
}): NormalizedStatement {
  const { normalizedOutput, snapshot, adjustedEbitda } = params;

  if (normalizedOutput?.incomeStatement) {
    return {
      ...normalizedOutput.incomeStatement,
      title: "Income Statement",
      footerLabel: "Adjusted EBITDA",
      footerValue: adjustedEbitda
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
    footerValue: adjustedEbitda
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
        { key: "assets_section", label: "Assets", value: 0, kind: "metric", rollupKey: "section_header" },
        { key: "current_assets", label: "Current Assets", value: totalCurrentAssets, kind: "line_item" },
        { key: "non_current_assets", label: "Non-Current Assets", value: totalNonCurrentAssets, kind: "line_item" },
        { key: "total_assets", label: "Total Assets", value: totalAssets, kind: "subtotal", rollupKey: "total_assets" },
        { key: "liabilities_section", label: "Liabilities", value: 0, kind: "metric", rollupKey: "section_header" },
        { key: "current_liabilities", label: "Current Liabilities", value: totalCurrentLiabilities, kind: "line_item" },
        { key: "non_current_liabilities", label: "Non-Current Liabilities", value: totalNonCurrentLiabilities, kind: "line_item" },
        { key: "total_liabilities", label: "Total Liabilities", value: totalLiabilities, kind: "subtotal", rollupKey: "total_liabilities" },
        { key: "equity_section", label: "Equity", value: 0, kind: "metric", rollupKey: "section_header" },
        { key: "total_equity", label: "Total Equity", value: totalEquity, kind: "subtotal", rollupKey: "total_equity" },
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

function SummaryMetricCard({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function sectionIntentCopy(section: DealWorkspaceSection) {
  if (section === "overview") {
    return {
      title: "Summary and performance view",
      description:
        "High-level KPIs, trend context, and current status for the selected reporting period."
    };
  }

  if (section === "financials") {
    return {
      title: "Reported / normalized financial statements",
      description:
        "Accounting truth, reported versus adjusted presentation, and statement validation for the selected period."
    };
  }

  return {
    title: "Adjustments, structuring, and credit analysis",
    description:
      "Authoritative underwriting workspace for EBITDA adjustments, debt assumptions, and structure outputs."
  };
}

function sectionLabel(section: DealWorkspaceSection) {
  if (section === "overview") return "Overview";
  if (section === "financials") return "Financials";
  return "Underwriting";
}

export function DealWorkspaceView({ data, section }: DealWorkspaceViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedFixSection = searchParams.get("fixSection");
  const isDevelopment = process.env.NODE_ENV !== "production";
  const [mode, setMode] = useState<FinancialsMode>("reported");
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [underwritingInputValues, setUnderwritingInputValues] =
    useState<CreditScenarioInputValues>(DEFAULT_CREDIT_SCENARIO_INPUT_VALUES);
  const [underwritingScenarioState, setUnderwritingScenarioState] =
    useState<UnderwritingScenarioState>(createDefaultUnderwritingScenarioState);
  const [underwritingEbitdaBasis, setUnderwritingEbitdaBasis] =
    useState<UnderwritingEbitdaBasis>("computed");
  const [selectedPeriodId, setSelectedPeriodId] = useState(data.snapshot.periodId || "");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeletingCompany, setIsDeletingCompany] = useState(false);
  const [isDeletingPeriod, setIsDeletingPeriod] = useState(false);
  const [documentDrawerState, setDocumentDrawerState] = useState<{
    mode: "view" | "upload" | "link";
    title: string;
    description?: string | null;
    targetEntityType?: "source_requirement" | "financial_line_item" | "underwriting_adjustment" | "issue" | "underwriting_metric" | null;
    targetEntityId?: string | null;
    targetDocumentType?: DashboardData["documents"][number]["document_type"] | null;
    documentId?: string | null;
  } | null>(null);

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
  const effectiveBridge = effectiveNormalizedOutput?.bridge ?? data.ebitdaBridge ?? null;
  const effectiveCanonicalEbitda =
    effectiveBridge?.canonicalEbitda ?? effectiveSnapshot.ebitda ?? effectiveSnapshot.reportedEbitda ?? null;
  const effectiveReportedEbitda =
    effectiveBridge?.reportedEbitdaReference ?? effectiveSnapshot.reportedEbitda ?? effectiveCanonicalEbitda;
  const effectiveAddBackTotal =
    effectiveBridge?.addBackTotal ?? effectiveSnapshot.acceptedAddBacks ?? 0;
  const selectedUnderwritingScenario =
    underwritingScenarioState.scenarios[underwritingScenarioState.selected];
  const effectiveEbitdaChain = useMemo(
    () =>
      buildEbitdaChain({
        canonicalEbitda: effectiveCanonicalEbitda,
        acceptedAddbacks: effectiveAddBackTotal,
        uplift: selectedUnderwritingScenario.uplift
      }),
    [effectiveAddBackTotal, effectiveCanonicalEbitda, selectedUnderwritingScenario.uplift]
  );
  const effectiveAdjustedEbitda = effectiveEbitdaChain.adjustedEbitda;

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
            snapshot: effectiveSnapshot,
            adjustedEbitda: effectiveEbitdaChain.adjustedEbitda
          }),
    [effectiveEbitdaChain.adjustedEbitda, effectiveNormalizedOutput, effectiveSnapshot, mode]
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
      finalTotals: balanceSheetRollup.finalTotals
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
    if (section !== "underwriting" || requestedFixSection !== ADD_BACK_LAYER_SECTION_ID) {
      return;
    }

    const panel = document.getElementById(ADD_BACK_LAYER_SECTION_ID);
    if (!panel) {
      return;
    }

    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [requestedFixSection, section]);

  useEffect(() => {
    if (section === "financials") {
      setUnderwritingEbitdaBasis(mode === "adjusted" ? "adjusted" : "computed");
    }
  }, [mode, section]);

  useEffect(() => {
    const nextPeriodId =
      data.snapshot.periodId || availablePeriods[availablePeriods.length - 1]?.periodId || "";
    setSelectedPeriodId(nextPeriodId);
  }, [availablePeriods, data.snapshot.periodId]);

  const companyId = data.company?.id ?? null;
  const companyName = data.company?.name || "No company selected";
  const overviewHref = companyId ? `/deal/${companyId}` : "/";
  const financialsHref = companyId ? `/financials?companyId=${companyId}` : "/financials";
  const underwritingHref = companyId ? `/deal/${companyId}/underwriting` : "/";
  const sourceDataHref = companyId ? `/source-data?companyId=${companyId}` : "/source-data";
  const currentSection = sectionLabel(section);
  const intent = sectionIntentCopy(section);
  const stageDisplay = getDealStageDisplay(data.stage);
  const ebitdaExplainability =
    effectiveNormalizedOutput?.ebitdaExplainability ??
    effectiveSnapshot.ebitdaExplainability ??
    null;
  const addBackThresholdPercent = 25;
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
    effectiveEbitdaChain.adjustedEbitda === null
      ? "Unsupported"
      : formatCurrency(effectiveEbitdaChain.adjustedEbitda);
  const ebitdaSupportContext =
    effectiveEbitdaChain.adjustedEbitda === null
      ? "EBITDA cannot be computed from the available financial data."
      : data.readiness.status === "ready"
        ? null
        : "Based on partial financial support";
  const topStripStatusMessage =
    effectiveEbitdaChain.adjustedEbitda === null
      ? `Adjusted EBITDA unsupported - ${financialStatusLabel.toLowerCase()}`
      : data.readiness.status === "caution"
        ? "Adjusted EBITDA pending validation"
        : data.readiness.status === "blocked"
          ? "Adjusted EBITDA available with partial support"
        : "Adjusted EBITDA supported";
  const constructionNotes = [
    mode === "adjusted"
      ? "Income statement is shown in adjusted view."
      : "Income statement is shown in reported view.",
    missingExplainabilityComponents.length > 0
      ? `Missing bottom-up inputs: ${missingExplainabilityComponents.join(", ")}.`
      : null,
    data.readiness.status !== "ready"
      ? "Adjusted EBITDA remains conditional until the required adjustments are fully supported."
      : "Adjusted EBITDA is supported by accepted adjustments."
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
  const underwritingAnalysis = useMemo(
    () =>
      buildUnderwritingAnalysis({
        snapshot: effectiveSnapshot,
        entries: data.entries,
        dataQuality: data.dataQuality,
        taxSourceStatus: data.taxSourceStatus,
        reconciliation: data.reconciliation,
        underwritingInputs: parsedUnderwritingInputs,
        ebitdaBasis: underwritingEbitdaBasis,
        acceptedAddBackTotal: effectiveAddBackTotal
      }),
    [
      data.dataQuality,
      data.entries,
      data.reconciliation,
      data.taxSourceStatus,
      effectiveSnapshot,
      parsedUnderwritingInputs,
      underwritingEbitdaBasis,
      effectiveAddBackTotal
    ]
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
    () => underwritingAnalysis.completionSummary,
    [underwritingAnalysis]
  );
  const investmentOverview = useMemo(
    () => underwritingAnalysis.investmentOverview,
    [underwritingAnalysis]
  );
  const dealState = useMemo(
    () =>
      buildDealState(effectiveSnapshot, {
        completionSummary,
        dataQuality: data.dataQuality,
        reconciliation: data.reconciliation,
        creditScenario: underwritingAnalysis.creditScenario
      }),
    [
      completionSummary,
      data.dataQuality,
      data.reconciliation,
      effectiveSnapshot,
      underwritingAnalysis
    ]
  );
  const activeIssues = useMemo(
    () =>
      data.diligenceIssues.filter(
        (issue) =>
          (issue.status === "open" || issue.status === "in_review") &&
          (issue.period_id === null || issue.period_id === effectiveSnapshot.periodId)
      ),
    [data.diligenceIssues, effectiveSnapshot.periodId]
  );
  const underwritingIssues = useMemo(
    () =>
      activeIssues.filter(
        (issue) =>
          issue.linked_page === "underwriting" ||
          issue.category === "underwriting" ||
          issue.category === "credit"
      ),
    [activeIssues]
  );
  const financialIssues = useMemo(
    () =>
      activeIssues.filter(
        (issue) =>
          issue.linked_page === "financials" ||
          issue.category === "financials" ||
          issue.category === "validation" ||
          issue.category === "reconciliation"
      ),
    [activeIssues]
  );
  const addBackImpactSummary = {
    canonicalEbitda: effectiveSnapshot.ebitda,
    totalAddBacks: effectiveAddBackTotal,
    adjustedEbitda: effectiveEbitdaChain.adjustedEbitda,
    periodLabel: effectiveSnapshot.label,
    thresholdPercent: addBackThresholdPercent,
    exceedsThreshold:
      addBackShareOfEbitdaPercent !== null &&
      addBackShareOfEbitdaPercent >= addBackThresholdPercent
  };
  const currentAdjustmentBacking = useMemo(
    () =>
      Object.fromEntries(
        data.backing.underwritingAdjustments.map((item) => [
          item.adjustmentId,
          {
            status: item.status,
            documentNames: item.documents.map((document) => document.name ?? document.source_file_name ?? "Document")
          }
        ])
      ),
    [data.backing.underwritingAdjustments]
  );
  const currentMetricBacking = useMemo(
    () => ({
      ebitda: data.backing.financialLineItems.find((item) => item.id === "ebitda")?.status,
      dscr: data.backing.underwritingMetrics.find((item) => item.id === "dscr")?.status,
      ltv: data.backing.underwritingMetrics.find((item) => item.id === "ltv")?.status,
      debtToEbitda:
        data.backing.underwritingMetrics.find((item) => item.id === "debt_to_ebitda")?.status
    }),
    [data.backing]
  );
  const underwritingRiskFlags = useMemo(
    () =>
      buildRiskFlags({
        snapshot: effectiveSnapshot,
        creditScenario: underwritingAnalysis.creditScenario,
        readiness: data.readiness,
        dataQuality: data.dataQuality,
        acceptedAddBackItems: acceptedAddBackItemsForSnapshot
      }),
    [
      acceptedAddBackItemsForSnapshot,
      data.dataQuality,
      data.readiness,
      effectiveSnapshot,
      underwritingAnalysis.creditScenario
    ]
  );
  const primaryNextAction = dealState.actions[0] ?? null;
  const financialBackingPanelRows = useMemo(
    () => [
      {
        id: "revenue",
        label: "Revenue",
        status: data.backing.financialLineItems.find((item) => item.id === "revenue")?.status ?? "unbacked",
        href: financialsHref,
        note:
          data.backing.financialLineItems.find((item) => item.id === "revenue")?.documents
            .map((document) => document.name ?? document.source_file_name ?? "Document")
            .join(", ") || null
      },
      {
        id: "cogs",
        label: "COGS",
        status: data.backing.financialLineItems.find((item) => item.id === "cogs")?.status ?? "unbacked",
        href: financialsHref,
        note:
          data.backing.financialLineItems.find((item) => item.id === "cogs")?.note ?? null
      },
      {
        id: "ebitda",
        label: "EBITDA",
        status: data.backing.financialLineItems.find((item) => item.id === "ebitda")?.status ?? "unbacked",
        href: financialsHref,
        note:
          data.backing.financialLineItems.find((item) => item.id === "ebitda")?.note ?? null
      },
      {
        id: "cash_flow",
        label: "Cash Flow Basis",
        status: data.backing.sourceRequirements.find((item) => item.id === "cash_flow")?.status ?? "unbacked",
        href: sourceDataHref,
        note:
          data.backing.sourceRequirements.find((item) => item.id === "cash_flow")?.missingReason ??
          null
      }
    ],
    [data.backing, financialsHref, sourceDataHref]
  );

  function openSupportDrawer(params: {
    mode?: "view" | "upload" | "link";
    title: string;
    description?: string | null;
    targetEntityType?: "source_requirement" | "financial_line_item" | "underwriting_adjustment" | "issue" | "underwriting_metric" | null;
    targetEntityId?: string | null;
    targetDocumentType?: DashboardData["documents"][number]["document_type"] | null;
    documentId?: string | null;
  }) {
    setDocumentDrawerState({
      mode: params.mode ?? "view",
      title: params.title,
      description: params.description ?? null,
      targetEntityType: params.targetEntityType ?? null,
      targetEntityId: params.targetEntityId ?? null,
      targetDocumentType: params.targetDocumentType ?? null,
      documentId: params.documentId ?? null
    });
  }

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
                  underwritingHref={underwritingHref}
                  sourceDataHref={sourceDataHref}
                />
                <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                  {data.company?.name || "No company selected"} -{" "}
                  {effectiveSnapshot.label || "No reporting period loaded"}
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                  {companyName}
                </h1>
                <p className="mt-3 text-sm text-slate-600 md:text-base">
                  {intent.title}. {intent.description}
                </p>
              </div>

              <div className="flex flex-wrap items-start gap-3">
                {companyId ? (
                  <div className="min-w-[260px] rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                      Lifecycle Context
                    </p>
                    <div className="mt-3">
                      <DealStageSelect
                        companyId={companyId}
                        stage={data.stage}
                        stageUpdatedAt={data.company?.stage_updated_at ?? null}
                        showUpdatedAt
                        ariaLabel={`Update lifecycle stage for ${companyName}`}
                      />
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      Readiness: {data.diligenceReadiness.readinessLabel}
                    </p>
                    {data.stageAssessment.stageReadinessMismatchReason ? (
                      <p className="mt-2 text-xs text-amber-700">
                        {data.stageAssessment.stageReadinessMismatchReason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Reporting Period
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                {section === "financials" ? "Reported / Adjusted" : currentSection}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {section === "overview"
                  ? "Use the selected period to review summary metrics and trend context."
                  : section === "financials"
                    ? "Reported and adjusted statement presentation for the selected reporting period."
                    : "Use one period at a time for adjustment review, debt assumptions, and credit outputs."}
              </p>
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

              {section === "financials" ? (
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
              ) : null}
            </div>
          </div>

          {deleteError ? (
            <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {deleteError}
            </div>
          ) : null}

          {section === "financials" ? (
            mode === "adjusted" ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Adjusted view reflects accepted EBITDA adjustments. Underlying line items remain reported where full adjusted restatement is not available.
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                Reported view reflects the normalized reported statement presentation for the selected period.
              </div>
            )
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {effectiveSnapshot.label || "No reporting period loaded"}
            </div>
          )}
        </section>

        {section === "overview" ? (
          <section className="space-y-4">
            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
              <div className="max-w-3xl">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Earnings Profile
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  Earnings Profile
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Operating trend, current-period performance, and the main drivers behind the latest move.
                </p>
              </div>
              <div className="mt-5 space-y-5 rounded-[1.25rem] bg-slate-50 p-4">
                <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                  <DashboardCharts series={data.series} showOuterCard={false} />
                  <PerformanceDrivers analyses={data.driverAnalyses} showOuterCard={false} />
                </div>
                <details className="rounded-2xl border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                    View multi-period summary
                  </summary>
                  <div className="mt-4">
                    <MultiPeriodSummaryTable snapshots={data.snapshots} showOuterCard={false} />
                  </div>
                </details>
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
              <div className="max-w-3xl">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Deal Economics
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">
                  Deal Economics
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  High-value support metrics for the selected period.
                </p>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <SummaryMetricCard
                  label="Revenue"
                  value={formatCurrency(effectiveSnapshot.revenue)}
                  helper="Selected reporting period"
                />
                <SummaryMetricCard
                  label="EBITDA"
                  value={formatCurrency(effectiveSnapshot.ebitda)}
                  helper="Reported / canonical basis"
                />
                <SummaryMetricCard
                  label="Adjusted EBITDA"
                  value={adjustedEbitdaDisplay}
                  helper={
                    adjustedEbitdaDisplay === "Unsupported"
                      ? "Requires a canonical EBITDA value"
                      : ebitdaSupportContext ?? adjustmentsLabel
                  }
                />
                <SummaryMetricCard
                  label="EBITDA Margin"
                  value={formatPercent(effectiveSnapshot.ebitdaMarginPercent)}
                  helper="Period margin"
                />
              </div>
            </section>

            <DecisionBanner
              title="Decision Status"
              status={data.diligenceReadiness.readinessLabel}
              summary={data.diligenceReadiness.readinessReason}
              details={financialStatusMessage}
              blockers={
                data.diligenceReadiness.blockerIssueTitles.length > 0
                  ? data.diligenceReadiness.blockerIssueTitles.slice(0, 3)
                  : data.diligenceReadiness.primaryBlockerIssueTitle
                    ? [data.diligenceReadiness.primaryBlockerIssueTitle]
                    : data.diligenceReadiness.primaryBlockerLabel
                      ? [data.diligenceReadiness.primaryBlockerLabel]
                      : []
              }
              metadata={[
                `Stage: ${getDealStageLabel(data.stage)}`,
                `${activeIssues.length} open issue${activeIssues.length === 1 ? "" : "s"}`
              ]}
              actionHref={
                companyId && primaryNextAction
                  ? buildDealActionHref(primaryNextAction, companyId)
                  : null
              }
              actionLabel={primaryNextAction?.label ?? null}
            />

            <BackingSummaryPanel
              rows={[
                data.backing.summary.financials,
                data.backing.summary.adjustments,
                data.backing.summary.creditInputs,
                data.backing.summary.overall
              ]}
              description="Support across the critical decision layers."
            />

            <InvestmentOverviewPanel
              overview={investmentOverview}
              detailHref={sourceDataHref}
              eyebrow="Investment Considerations"
              title="Investment Considerations"
              compact
            />

            <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-panel">
              <details>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="max-w-3xl">
                      <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                        Diagnostics
                      </p>
                      <h2 className="mt-1 text-lg font-semibold text-slate-900">
                        View details
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Lower-priority issue detail, recent changes, and supporting diagnostics.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                        {data.diligenceReadiness.activeIssueCount} active
                      </span>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                        {data.diligenceReadiness.criticalIssueCount} critical
                      </span>
                    </div>
                  </div>
                </summary>

                <div className="mt-5 space-y-5 border-t border-slate-200 pt-5">
                  <DiligenceFeedbackPanel
                    feedback={data.diligenceIssueFeedback}
                    title="Recent Issue Changes"
                  />

                  {companyId ? (
                    <DiligenceIssuesPanel
                      companyId={companyId}
                      periodId={effectiveSnapshot.periodId}
                      issues={activeIssues}
                      currentPage="overview"
                      title="Open Issues"
                      description="Structured diligence issues and supporting detail for this deal."
                      emptyMessage="No open diligence issues are currently tracked for this deal."
                    />
                  ) : null}
                </div>
              </details>
            </section>
          </section>
        ) : null}

        {section === "underwriting" ? (
          <section className="space-y-6">
            <CreditScenarioPanel
              snapshot={effectiveSnapshot}
              inputValues={underwritingInputValues}
              onInputValuesChange={setUnderwritingInputValues}
              ebitdaBasis={underwritingEbitdaBasis}
              onEbitdaBasisChange={setUnderwritingEbitdaBasis}
              scenario={underwritingAnalysis.creditScenario}
              missingInputs={underwritingAnalysis.missingInputs}
              canonicalEbitda={effectiveCanonicalEbitda}
              adjustedEbitda={effectiveAdjustedEbitda}
              acceptedAddBackTotal={underwritingAnalysis.acceptedAddBackTotal}
            />

            <section
              id={ADD_BACK_LAYER_SECTION_ID}
              className="rounded-[1.75rem] border border-slate-200/70 bg-white p-4 shadow-panel"
            >
              <AddBackReviewPanel
                companyId={data.company?.id ?? null}
                periods={data.periods}
                items={data.addBackReviewItems}
                periodId={effectiveSnapshot.periodId}
                title="EBITDA Adjustments"
                eyebrow="Earnings Adjustments"
                description="Normalize earnings"
                impactSummary={addBackImpactSummary}
                showOuterCard={false}
                density="compact"
                manualEntryMode="collapsible"
                backingByAdjustmentId={currentAdjustmentBacking}
                onAttachSupport={(entityId) =>
                  openSupportDrawer({
                    mode: "link",
                    title: "Adjustment support",
                    description: "Link a supporting document to this underwriting adjustment.",
                    targetEntityType: "underwriting_adjustment",
                    targetEntityId: entityId,
                    targetDocumentType: "other"
                  })
                }
              />
            </section>

            <section className="pt-1 md:pt-2">
              <ProFormaPanel
                canonicalEbitda={effectiveCanonicalEbitda}
                reportedEbitda={effectiveReportedEbitda}
                workbenchInputValues={underwritingInputValues}
                acceptedAddBackTotal={effectiveAddBackTotal}
                scenarioState={underwritingScenarioState}
                onScenarioStateChange={setUnderwritingScenarioState}
                ebitdaContextMessage={ebitdaSupportContext}
              />
            </section>

            <section>
              <UnderwritingSnapshotPanel
                snapshot={effectiveSnapshot}
                scenario={underwritingAnalysis.creditScenario}
                ebitdaBasis={underwritingEbitdaBasis}
                missingInputs={underwritingAnalysis.missingInputs}
                canonicalEbitda={underwritingAnalysis.canonicalEbitda}
                adjustedEbitda={underwritingAnalysis.adjustedEbitda}
                backingByMetric={currentMetricBacking}
                onMetricSupportClick={(metricId) => {
                  if (metricId === "ebitda") {
                    const item = data.backing.financialLineItems.find((entry) => entry.id === "ebitda");
                    openSupportDrawer({
                      title: "EBITDA support",
                      description: item?.note,
                      targetEntityType: "financial_line_item",
                      targetEntityId: "ebitda",
                      targetDocumentType: "income_statement",
                      documentId: item?.documents[0]?.id ?? null
                    });
                    return;
                  }

                  const metricBacking = data.backing.underwritingMetrics.find((entry) =>
                    metricId === "debtToEbitda"
                      ? entry.id === "debt_to_ebitda"
                      : entry.id === metricId
                  );
                  openSupportDrawer({
                    title: `${metricBacking?.label ?? metricId} support`,
                    description: metricBacking?.note,
                    targetEntityType: "underwriting_metric",
                    targetEntityId: metricBacking?.id ?? metricId,
                    targetDocumentType: "debt_schedule",
                    documentId: metricBacking?.documents[0]?.id ?? null
                  });
                }}
              />
            </section>

            <UnderwritingRisksPanel
              riskFlags={underwritingRiskFlags}
              blockers={completionSummary.blockers}
              missingItems={completionSummary.missingItems}
              issues={underwritingIssues}
            />

            {isDevelopment ? (
              <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-700">
                <p className="font-medium uppercase tracking-[0.12em] text-slate-500">
                  EBITDA Debug
                </p>
                <div className="mt-2 grid gap-1 md:grid-cols-2">
                  <p>canonicalEbitda: {formatCurrency(effectiveEbitdaChain.canonicalEbitda)}</p>
                  <p>acceptedAddbacks: {formatCurrency(effectiveEbitdaChain.acceptedAddbacks)}</p>
                  <p>adjustedEbitda (computed): {formatCurrency(effectiveEbitdaChain.adjustedEbitda)}</p>
                  <p>proFormaEbitda: {formatCurrency(effectiveEbitdaChain.proFormaEbitda)}</p>
                </div>
              </section>
            ) : null}

            <details className="rounded-[1.6rem] border border-slate-200/80 bg-white p-4 shadow-panel">
              <summary className="cursor-pointer list-none">
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                  Underwriting Summary
                </p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">
                  Underwriting Summary
                </h2>
              </summary>
              <div className="mt-4">
                <InvestmentOverviewPanel overview={investmentOverview} detailHref={sourceDataHref} />
              </div>
            </details>

            {companyId ? (
              <DealNextActionsPanel
                companyId={companyId}
                actions={dealState.actions}
                issues={dealState.issues}
                completeness={dealState.completeness}
                trustScore={dealState.trustScore}
              />
            ) : null}

            <DiligenceFeedbackPanel
              feedback={data.diligenceIssueFeedback}
              title="Underwriting Issue Changes"
            />
          </section>
        ) : null}

        {section === "financials" ? (
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
                  {ebitdaSupportContext ? (
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {ebitdaSupportContext}
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
                    Statement Review
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-slate-900">
                    Reported and normalized financials
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Review the reported statements and read-only adjusted output presentation for the selected period.
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
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_20rem] xl:items-start">
                <div className="space-y-5">
                  <StatementTable
                    statement={incomeStatement}
                    footerValueDisplay={mode === "adjusted" && data.readiness.status === "blocked" ? financialStatusLabel : null}
                    showOuterCard={false}
                    density="compact"
                  />
                </div>

                <aside className="space-y-5">
                  <section className="rounded-[1.5rem] bg-slate-50 p-4">
                    <div className="border-b border-slate-200 pb-3">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                        Data Backing
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Critical financial support at a glance.
                      </p>
                    </div>
                    <div className="space-y-2 pt-3">
                      {financialBackingPanelRows.map((row) => (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => {
                            const item =
                              data.backing.financialLineItems.find((entry) => entry.id === row.id) ??
                              data.backing.sourceRequirements.find((entry) => entry.id === row.id);
                            openSupportDrawer({
                              title: `${row.label} support`,
                              description: row.note,
                              targetEntityType:
                                row.id === "cash_flow" ? "source_requirement" : "financial_line_item",
                              targetEntityId: row.id,
                              targetDocumentType:
                                row.id === "cash_flow" ? "cash_flow" : "income_statement",
                              documentId: item?.documents[0]?.id ?? null
                            });
                          }}
                          className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left"
                        >
                          <div>
                            <p className="text-sm font-medium text-slate-900">{row.label}</p>
                            {row.note ? (
                              <p className="mt-1 text-xs text-slate-500">{row.note}</p>
                            ) : null}
                          </div>
                          <BackingChip status={row.status} size="compact" />
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[1.5rem] bg-slate-50 p-4">
                    <div className="border-b border-slate-200 pb-3">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                        EBITDA Summary
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Read-only earnings bridge for statement review.
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
                      {(ebitdaSupportContext !== null && adjustedEbitdaDisplay !== "Unsupported") ||
                      bridgeWarnings.length ||
                      adjustedEbitdaDisplay === "Unsupported" ? (
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700">
                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                            Status
                          </p>
                          <p className="mt-1 font-medium text-slate-900">
                            {adjustedEbitdaDisplay === "Unsupported"
                              ? "EBITDA not available"
                              : financialStatusLabel}
                          </p>
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

                  <details className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                    <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                      Construction notes
                    </summary>
                    <div className="pt-3">
                      <ul className="space-y-2 text-sm leading-5 text-slate-600">
                        {constructionNotes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                        <p className="text-sm text-slate-600">
                          Adjustment editing is maintained on the Underwriting page.
                        </p>
                        <Link
                          href={underwritingHref}
                          className="inline-flex rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                        >
                          Open Underwriting
                        </Link>
                      </div>
                      {(bridgeWarnings.length > 1 || bridgeInvalidReasons.length > 0) ? (
                        <details className="mt-3 text-sm text-slate-600">
                          <summary className="cursor-pointer font-medium text-slate-900">
                            View detail
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
                  </details>
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
                                  : "-"}
                              </p>
                              <p className="text-sm text-slate-700">
                                Computed:{" "}
                                {check.computedValue !== undefined
                                  ? formatCurrency(check.computedValue)
                                  : "-"}
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
                                    : "-"}
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
                                  ? `Computed ${check.label.replace(": Source vs Computed", "")}: `
                                  : "Computed: "}
                                {check.computedValue !== undefined
                                  ? formatCurrency(check.computedValue)
                                  : "-"}
                              </p>
                              <p>
                                {check.sourceValue !== undefined
                                  ? `Source ${check.label.replace(": Source vs Computed", "")}: `
                                  : "Source: "}
                                {check.sourceValue !== undefined
                                  ? formatCurrency(check.sourceValue)
                                  : "-"}
                              </p>
                              <p>
                                Difference:{" "}
                                {check.difference !== undefined
                                  ? formatCurrency(check.difference)
                                  : "-"}
                              </p>
                            </div>
                          ) : null}
                          {check.contributingLineItems?.length ? (
                            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                              {check.contributingLineItems.map((item) => (
                                <p key={`${check.key}-${item.accountName}-${item.normalizedCategory}`}>
                                  {item.accountName} - {item.normalizedCategory} -{" "}
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

            {companyId ? (
              <DiligenceIssuesPanel
                companyId={companyId}
                periodId={effectiveSnapshot.periodId}
                issues={financialIssues}
                currentPage="financials"
                title="Financial Validation Issues"
                description="Accounting and validation issues linked to the selected period."
                emptyMessage="No open financial validation issues are currently tracked."
                allowManualCreate
                preferredGroups={["financial_validation", "reconciliation"]}
              />
            ) : null}
          </>
        ) : null}
      </div>
      {companyId ? (
        <DocumentDrawer
          open={Boolean(documentDrawerState)}
          onClose={() => setDocumentDrawerState(null)}
          companyId={companyId}
          mode={documentDrawerState?.mode ?? "view"}
          title={documentDrawerState?.title ?? "Supporting documents"}
          description={documentDrawerState?.description ?? null}
          targetEntityType={documentDrawerState?.targetEntityType ?? null}
          targetEntityId={documentDrawerState?.targetEntityId ?? null}
          targetDocumentType={documentDrawerState?.targetDocumentType ?? null}
          periodLabel={effectiveSnapshot.label || null}
          fiscalYear={
            effectiveSnapshot.periodDate
              ? Number.parseInt(effectiveSnapshot.periodDate.slice(0, 4), 10)
              : null
          }
          document={
            data.documents.find((document) => document.id === documentDrawerState?.documentId) ??
            null
          }
          documents={data.documents}
          documentLinks={data.documentLinks}
          documentVersions={data.documentVersions}
          linkedIssues={data.diligenceIssues
            .filter((issue) =>
              documentDrawerState?.targetEntityType === "issue"
                ? issue.id === documentDrawerState.targetEntityId
                : true
            )
            .map((issue) => ({
              id: issue.id,
              title: issue.title,
              status: issue.status
            }))}
        />
      ) : null}
    </main>
  );
}

function DecisionBanner({
  title,
  status,
  summary,
  details,
  blockers,
  metadata,
  actionHref,
  actionLabel
}: {
  title: string;
  status: string;
  summary: string;
  details?: string | null;
  blockers?: string[];
  metadata: string[];
  actionHref?: string | null;
  actionLabel?: string | null;
}) {
  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            {title}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">{status}</h2>
          <p className="mt-2 text-sm text-slate-700">{summary}</p>
          {blockers && blockers.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Blocked by
              </p>
              <ul className="mt-2 space-y-1 text-sm text-slate-800">
                {blockers.map((blocker) => (
                  <li key={blocker} className="flex gap-2">
                    <span className="text-slate-400">-</span>
                    <span>{blocker}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {details ? <p className="mt-3 text-sm text-slate-500">{details}</p> : null}
        </div>
        {actionHref && actionLabel ? (
          <Link
            href={actionHref}
            className="inline-flex rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            {actionLabel}
          </Link>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {metadata.map((item) => (
          <span
            key={item}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700"
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

type UnderwritingRiskGroupKey = "earnings" | "credit" | "support";

type UnderwritingRiskItem = {
  title: string;
  detail: string;
  tone: RiskFlagSeverity | "neutral";
};

function underwritingRiskToneClasses(tone: UnderwritingRiskItem["tone"]) {
  if (tone === "high") return "text-rose-900";
  if (tone === "medium") return "text-amber-900";
  if (tone === "low") return "text-slate-800";
  return "text-slate-700";
}

function compactRiskDetail(detail: string) {
  const normalized = detail
    .replace(/\s+/g, " ")
    .replace(/^This (blocker|input) is still /i, "")
    .replace(/^This gap is still /i, "")
    .trim()
    .replace(/\.$/, "");

  const firstClause = normalized.split(/[.;]/)[0]?.trim() ?? normalized;

  if (!firstClause) {
    return null;
  }

  return firstClause.length > 80 ? `${firstClause.slice(0, 77).trim()}...` : firstClause;
}

function classifyRiskFlagGroup(flag: RiskFlag): UnderwritingRiskGroupKey {
  const text = `${flag.title} ${flag.description} ${flag.metric ?? ""}`.toLowerCase();

  if (/(debt|coverage|collateral|ltv|leverage|interest)/.test(text)) {
    return "credit";
  }

  if (/(ebitda|earnings|margin|adjustment|add-back)/.test(text)) {
    return "earnings";
  }

  return "support";
}

function classifyTextRiskGroup(text: string): UnderwritingRiskGroupKey {
  const normalized = text.toLowerCase();

  if (/(debt|coverage|collateral|ltv|leverage|interest|loan|rate|amortization|purchase price)/.test(normalized)) {
    return "credit";
  }

  if (/(ebitda|earnings|margin|adjustment|add-back|tax)/.test(normalized)) {
    return "earnings";
  }

  return "support";
}

function classifyIssueRiskGroup(issue: DashboardData["diligenceIssues"][number]): UnderwritingRiskGroupKey {
  if (issue.category === "credit") {
    return "credit";
  }

  if (
    issue.category === "underwriting" ||
    issue.category === "tax"
  ) {
    return "earnings";
  }

  return "support";
}

function appendRiskItem(
  target: UnderwritingRiskItem[],
  item: UnderwritingRiskItem,
  seen: Set<string>
) {
  const key = `${item.title}::${item.detail}`;

  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  target.push(item);
}

function buildUnderwritingRiskGroups(params: {
  riskFlags: RiskFlag[];
  blockers: string[];
  missingItems: string[];
  issues: DashboardData["diligenceIssues"];
}) {
  const groups: Record<UnderwritingRiskGroupKey, UnderwritingRiskItem[]> = {
    earnings: [],
    credit: [],
    support: []
  };

  const seen = new Set<string>();

  params.riskFlags.forEach((flag) => {
    appendRiskItem(
      groups[classifyRiskFlagGroup(flag)],
      {
        title: flag.title,
        detail: flag.metric ?? flag.description,
        tone: flag.severity
      },
      seen
    );
  });

  params.blockers.forEach((blocker) => {
    appendRiskItem(
      groups[classifyTextRiskGroup(blocker)],
      {
        title: blocker,
        detail: "underwriting output blocked",
        tone: "neutral"
      },
      seen
    );
  });

  params.missingItems.forEach((item) => {
    appendRiskItem(
      groups[classifyTextRiskGroup(item)],
      {
        title: item,
        detail: "missing from workbench",
        tone: "neutral"
      },
      seen
    );
  });

  params.issues.forEach((issue) => {
    appendRiskItem(
      groups[classifyIssueRiskGroup(issue)],
      {
        title: issue.title,
        detail: issue.description,
        tone: issue.severity === "critical" || issue.severity === "high"
          ? "high"
          : issue.severity === "medium"
            ? "medium"
            : "low"
      },
      seen
    );
  });

  return groups;
}

function UnderwritingRisksPanel({
  riskFlags,
  blockers,
  missingItems,
  issues
}: {
  riskFlags: RiskFlag[];
  blockers: string[];
  missingItems: string[];
  issues: DashboardData["diligenceIssues"];
}) {
  const groups = buildUnderwritingRiskGroups({
    riskFlags,
    blockers,
    missingItems,
    issues
  });

  const orderedGroups: Array<{ key: UnderwritingRiskGroupKey; title: string; empty: string }> = [
    {
      key: "earnings",
      title: "Earnings",
      empty: "No active earnings gaps are currently surfaced."
    },
    {
      key: "credit",
      title: "Credit",
      empty: "No active credit gaps are currently surfaced."
    },
    {
      key: "support",
      title: "Support",
      empty: "No active support gaps are currently surfaced."
    }
  ];

  return (
    <details className="rounded-[1.6rem] border border-slate-200/80 bg-white p-4 shadow-panel">
      <summary className="flex cursor-pointer list-none flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Risks & Gaps
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            Risks & Gaps
          </h2>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {issues.length + blockers.length + missingItems.length} active items
        </div>
      </summary>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        {orderedGroups.map((group) => (
          <section key={group.key} className="rounded-2xl border border-slate-200/70 bg-slate-50/70 p-3.5">
            <p className="text-sm font-semibold text-slate-900">{group.title}</p>
            <div className="mt-2.5">
              {groups[group.key].length > 0 ? (
                <ul className="space-y-1.5">
                  {groups[group.key].slice(0, 5).map((item) => {
                    const compactDetail = compactRiskDetail(item.detail);

                    return (
                      <li
                        key={`${group.key}-${item.title}-${item.detail}`}
                        className={`flex gap-2 text-sm leading-5 ${underwritingRiskToneClasses(item.tone)}`}
                      >
                        <span>•</span>
                        <span>
                          <span className="font-medium text-slate-900">{item.title}</span>
                          {compactDetail ? <span className="text-slate-600"> ({compactDetail})</span> : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">
                  {group.empty}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </details>
  );
}
