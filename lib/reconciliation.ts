import { getCanonicalPeriodAdjustment } from "@/lib/add-backs";
import { normalizeAccountName } from "@/lib/auto-mapping";
import type {
  AddBack,
  FinancialEntry,
  PeriodSnapshot,
  ReconciliationIssue,
  ReconciliationReport,
  ReportingPeriod
} from "@/lib/types";

type ToleranceRule = {
  exactTolerance: number;
  warningThreshold: number;
};

export const RECONCILIATION_TOLERANCES: Record<
  "grossProfit" | "reportedEbitda" | "adjustedEbitda" | "workingCapital",
  ToleranceRule
> = {
  grossProfit: {
    exactTolerance: 1,
    warningThreshold: 25
  },
  reportedEbitda: {
    exactTolerance: 1,
    warningThreshold: 25
  },
  adjustedEbitda: {
    exactTolerance: 1,
    warningThreshold: 25
  },
  workingCapital: {
    exactTolerance: 1,
    warningThreshold: 50
  }
};

function absoluteDifference(left: number, right: number) {
  return Math.abs(left - right);
}

export function approximatelyEqual(
  left: number,
  right: number,
  tolerance: number
) {
  return absoluteDifference(left, right) <= tolerance;
}

function getFormulaSeverity(
  difference: number,
  rule: ToleranceRule
): ReconciliationIssue["severity"] | null {
  if (difference <= rule.exactTolerance) {
    return null;
  }

  if (difference <= rule.warningThreshold) {
    return "warning";
  }

  return "critical";
}

function pushFormulaIssue(params: {
  issues: ReconciliationIssue[];
  key: ReconciliationIssue["key"];
  section: ReconciliationIssue["section"];
  metric: string;
  expected: number;
  actual: number;
  message: string;
  rule: ToleranceRule;
}) {
  const difference = absoluteDifference(params.expected, params.actual);
  const severity = getFormulaSeverity(difference, params.rule);

  if (!severity) {
    return;
  }

  params.issues.push({
    key: params.key,
    severity,
    section: params.section,
    metric: params.metric,
    message: params.message,
    difference,
    tolerance: params.rule.exactTolerance
  });
}

function hasValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

export function buildReconciliationReport(params: {
  snapshot: PeriodSnapshot;
  entries: FinancialEntry[];
  periods: ReportingPeriod[];
  addBacks: AddBack[];
}) {
  const { snapshot, entries, periods, addBacks } = params;
  const issues: ReconciliationIssue[] = [];
  const periodEntries = entries.filter((entry) => entry.period_id === snapshot.periodId);
  const currentIncomeEntries = periodEntries.filter(
    (entry) => entry.statement_type === "income"
  );
  const canonicalAdjustment = getCanonicalPeriodAdjustment({
    periodId: snapshot.periodId,
    addBacks,
    entries: periodEntries
  });

  if (hasValue(snapshot.grossProfit)) {
    pushFormulaIssue({
      issues,
      key: "gross_profit_formula",
      section: "income_statement",
      metric: "Gross Profit",
      expected: snapshot.revenue - snapshot.cogs,
      actual: snapshot.grossProfit,
      message: "Revenue less COGS does not reconcile to Gross Profit within tolerance.",
      rule: RECONCILIATION_TOLERANCES.grossProfit
    });
  }

  if (snapshot.incomeStatementMetricDebug?.ebitda.source === "bottom_up" && hasValue(snapshot.ebitda)) {
    pushFormulaIssue({
      issues,
      key: "ebitda_formula",
      section: "income_statement",
      metric: "EBITDA",
      expected:
        (snapshot.netIncome ?? 0) +
        (snapshot.nonOperating ?? 0) +
        (snapshot.taxExpense ?? 0) +
        (snapshot.depreciationAndAmortization ?? 0),
      actual: snapshot.ebitda,
      message:
        "Net Income plus Non-operating, Tax Expense, and Depreciation / Amortization does not reconcile to EBITDA within tolerance.",
      rule: RECONCILIATION_TOLERANCES.reportedEbitda
    });
  }

  if (hasValue(snapshot.ebitda) && hasValue(snapshot.adjustedEbitda)) {
    pushFormulaIssue({
      issues,
      key: "adjusted_ebitda_formula",
      section: "ebitda_bridge",
      metric: "Adjusted EBITDA",
      expected: snapshot.ebitda + canonicalAdjustment.acceptedAddBackTotal,
      actual: snapshot.adjustedEbitda,
      message:
        "EBITDA plus Accepted Add-Backs does not reconcile to Adjusted EBITDA within tolerance.",
      rule: RECONCILIATION_TOLERANCES.adjustedEbitda
    });
  }

  pushFormulaIssue({
    issues,
    key: "working_capital_formula",
    section: "balance_sheet",
    metric: "Working Capital",
    expected: snapshot.currentAssets - snapshot.currentLiabilities,
    actual: snapshot.workingCapital,
    message:
      "Current Assets less Current Liabilities does not reconcile to Working Capital within tolerance.",
    rule: RECONCILIATION_TOLERANCES.workingCapital
  });

  if (periodEntries.length > 0 && !periodEntries.some((entry) => entry.category === "Revenue")) {
    issues.push({
      key: "missing_component",
      severity: "critical",
      section: "income_statement",
      metric: "Revenue",
      message: "Revenue entries are missing for the selected period."
    });
  }

  if (
    currentIncomeEntries.length > 0 &&
    !periodEntries.some((entry) => entry.category === "Operating Expenses")
  ) {
    issues.push({
      key: "missing_component",
      severity: "critical",
      section: "income_statement",
      metric: "Operating Expenses",
      message: "Operating Expense entries are missing for the selected period."
    });
  }

  if (
    currentIncomeEntries.some(
      (entry) =>
        (entry.category === "Revenue" ||
          entry.category === "COGS" ||
          entry.category === "Operating Expenses") &&
        entry.confidence === "low"
    )
  ) {
    issues.push({
      key: "low_confidence_component",
      severity: "warning",
      section: "income_statement",
      metric: "EBITDA",
      message:
        "Low-confidence mapped components are included in EBITDA."
    });
  }

  if (canonicalAdjustment.usesLegacyFallback) {
    issues.push({
      key: "legacy_adjustment_source",
      severity: "info",
      section: "ebitda_bridge",
      metric: "Accepted Add-Backs",
      message:
        "Accepted Add-Backs currently rely on legacy add-back flags for this period."
    });
  }

  const companyPeriodAccounts = new Map<
    string,
    Array<{ category: FinancialEntry["category"]; statementType: FinancialEntry["statement_type"] }>
  >();

  entries.forEach((entry) => {
    const normalizedName = normalizeAccountName(entry.account_name);
    const mappings = companyPeriodAccounts.get(normalizedName) ?? [];

    if (
      !mappings.some(
        (item) =>
          item.category === entry.category &&
          item.statementType === entry.statement_type
      )
    ) {
      mappings.push({
        category: entry.category,
        statementType: entry.statement_type
      });
    }

    companyPeriodAccounts.set(normalizedName, mappings);
  });

  companyPeriodAccounts.forEach((mappings, normalizedName) => {
    if (mappings.length < 2) {
      return;
    }

    const accountName =
      entries.find((entry) => normalizeAccountName(entry.account_name) === normalizedName)
        ?.account_name ?? normalizedName;

    issues.push({
      key: "mapping_conflict",
      severity: "warning",
      section: "mapping",
      metric: accountName,
      message:
        `${accountName} maps inconsistently across periods and may affect normalized outputs.`
    });
  });

  const dedupedIssues = Array.from(
    new Map(
      issues.map((issue) => [
        `${issue.key}::${issue.metric}::${issue.message}`,
        issue
      ])
    ).values()
  ).sort((left, right) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const severityDelta =
      severityOrder[left.severity] - severityOrder[right.severity];

    if (severityDelta !== 0) {
      return severityDelta;
    }

    return left.metric.localeCompare(right.metric);
  });

  const status: ReconciliationReport["status"] = dedupedIssues.some(
    (issue) => issue.severity === "critical"
  )
    ? "failed"
    : dedupedIssues.some((issue) => issue.severity === "warning")
      ? "warning"
      : "reconciled";
  const label: ReconciliationReport["label"] =
    status === "failed"
      ? "Does not reconcile"
      : status === "warning"
        ? "Reconciles with warnings"
        : "Reconciles";
  const summaryMessage =
    status === "failed"
      ? "Material contradictions remain in the normalized financial outputs."
      : status === "warning"
        ? "The normalized financial outputs reconcile within tolerance, with review items remaining."
        : "The normalized financial outputs reconcile within tolerance.";

  return {
    status,
    label,
    summaryMessage,
    withinTolerance: !dedupedIssues.some((issue) => issue.severity === "critical"),
    issues: dedupedIssues
  };
}

export function getBridgeReconciliationIssues(report: ReconciliationReport) {
  return report.issues.filter(
    (issue) =>
      issue.section === "ebitda_bridge" || issue.metric === "EBITDA"
  );
}
