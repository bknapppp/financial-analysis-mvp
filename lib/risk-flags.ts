import { formatCurrency, formatPercent } from "./formatters.ts";
import type {
  AddBackReviewItem,
  CreditScenarioResult,
  DataQualityReport,
  DataReadiness,
  PeriodSnapshot
} from "./types.ts";

export type RiskFlagSeverity = "high" | "medium" | "low";

export type RiskFlag = {
  severity: RiskFlagSeverity;
  title: string;
  description: string;
  metric?: string;
};

type BuildRiskFlagsParams = {
  snapshot: PeriodSnapshot;
  creditScenario: CreditScenarioResult;
  readiness: DataReadiness;
  dataQuality: DataQualityReport;
  acceptedAddBackItems: AddBackReviewItem[];
};

type RiskFlagCandidate = RiskFlag & {
  priority: number;
};

const SEVERITY_ORDER: Record<RiskFlagSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2
};

function formatMultiple(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return `${value.toFixed(2)}x`;
}

function formatRatioPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return formatPercent(value * 100);
}

function appendFlag(flags: RiskFlagCandidate[], flag: RiskFlagCandidate | null) {
  if (flag) {
    flags.push(flag);
  }
}

function compareFlags(left: RiskFlagCandidate, right: RiskFlagCandidate) {
  const severityDifference =
    SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];

  if (severityDifference !== 0) {
    return severityDifference;
  }

  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }

  return left.title.localeCompare(right.title);
}

export function buildRiskFlags({
  snapshot,
  creditScenario,
  readiness,
  dataQuality,
  acceptedAddBackItems
}: BuildRiskFlagsParams): RiskFlag[] {
  const flags: RiskFlagCandidate[] = [];
  const acceptedAddBacks = snapshot.acceptedAddBacks ?? 0;
  const addBackShareOfEbitda =
    snapshot.ebitda !== null && snapshot.ebitda > 0
      ? acceptedAddBacks / snapshot.ebitda
      : null;
  const lowConfidenceAcceptedAddBacks = acceptedAddBackItems.filter(
    (item) => item.dependsOnLowConfidenceMapping
  ).length;

  if (creditScenario.metrics.dscr.value !== null && creditScenario.metrics.dscr.value < 1.25) {
    appendFlag(flags, {
      severity: "high",
      priority: 1,
      title: "Debt service coverage is below minimum tolerance",
      description:
        "Cash flow does not provide an adequate cushion to service scheduled debt.",
      metric: formatMultiple(creditScenario.metrics.dscr.value) ?? "Below 1.25x"
    });
  }

  if (
    creditScenario.metrics.debtToEbitda.value !== null &&
    creditScenario.metrics.debtToEbitda.value > 5
  ) {
    appendFlag(flags, {
      severity: "high",
      priority: 2,
      title: "Leverage exceeds lender comfort",
      description:
        "Debt load is elevated relative to the earnings base and would pressure structure and pricing.",
      metric: formatMultiple(creditScenario.metrics.debtToEbitda.value) ?? "Above 5.00x"
    });
  }

  if (creditScenario.metrics.ltv.value !== null && creditScenario.metrics.ltv.value > 0.8) {
    appendFlag(flags, {
      severity: "high",
      priority: 3,
      title: "Collateral coverage is thin",
      description:
        "Advance rate is high relative to collateral support, leaving limited downside protection.",
      metric: formatRatioPercent(creditScenario.metrics.ltv.value) ?? "Above 80.0%"
    });
  }

  if (acceptedAddBacks > 0 && addBackShareOfEbitda !== null && addBackShareOfEbitda > 0.25) {
    appendFlag(flags, {
      severity: addBackShareOfEbitda >= 0.5 ? "high" : "medium",
      priority: 4,
      title:
        addBackShareOfEbitda >= 0.5
          ? "Underwriting is heavily adjustment-driven"
          : "Adjusted EBITDA depends materially on add-backs",
      description:
        "A meaningful portion of the underwriting earnings base is supported by adjustments rather than reported performance.",
      metric: `${formatCurrency(acceptedAddBacks)} (${formatPercent(addBackShareOfEbitda * 100)} of EBITDA)`
    });
  }

  if (snapshot.ebitda !== null && snapshot.ebitda < 0) {
    appendFlag(flags, {
      severity: "high",
      priority: 5,
      title: "EBITDA is negative",
      description:
        "Negative operating cash flow is inconsistent with conventional cash flow underwriting.",
      metric: formatCurrency(snapshot.ebitda)
    });
  } else if (
    snapshot.ebitdaMarginPercent !== null &&
    snapshot.ebitdaMarginPercent < 10
  ) {
    appendFlag(flags, {
      severity: "medium",
      priority: 5,
      title: "EBITDA margin is weak",
      description:
        "Thin operating margin limits resilience against modest revenue or cost underperformance.",
      metric: formatPercent(snapshot.ebitdaMarginPercent)
    });
  }

  if (
    creditScenario.metrics.dscr.status === "moderate" &&
    creditScenario.metrics.dscr.value !== null &&
    creditScenario.metrics.dscr.value >= 1.25
  ) {
    appendFlag(flags, {
      severity: "medium",
      priority: 6,
      title: "Debt service coverage is narrow",
      description:
        "Coverage is above minimum tolerance, but still leaves limited room for earnings volatility.",
      metric: formatMultiple(creditScenario.metrics.dscr.value) ?? undefined
    });
  }

  if (
    creditScenario.metrics.debtToEbitda.status === "moderate" &&
    creditScenario.metrics.debtToEbitda.value !== null &&
    creditScenario.metrics.debtToEbitda.value <= 5
  ) {
    appendFlag(flags, {
      severity: "medium",
      priority: 7,
      title: "Leverage is elevated for the capital structure",
      description:
        "Debt leverage is not outside policy limits, but remains aggressive for a clean credit profile.",
      metric: formatMultiple(creditScenario.metrics.debtToEbitda.value) ?? undefined
    });
  }

  if (
    creditScenario.metrics.ltv.status === "moderate" &&
    creditScenario.metrics.ltv.value !== null &&
    creditScenario.metrics.ltv.value <= 0.8
  ) {
    appendFlag(flags, {
      severity: "medium",
      priority: 8,
      title: "Collateral advance rate is not conservative",
      description:
        "Collateral coverage is acceptable but does not provide substantial downside support.",
      metric: formatRatioPercent(creditScenario.metrics.ltv.value) ?? undefined
    });
  }

  if (
    creditScenario.metrics.interestCoverage.status === "weak" &&
    creditScenario.metrics.interestCoverage.value !== null
  ) {
    appendFlag(flags, {
      severity: "medium",
      priority: 9,
      title: "Interest burden is heavy relative to earnings",
      description:
        "Interest coverage indicates limited room for rate pressure or earnings slippage.",
      metric:
        formatMultiple(creditScenario.metrics.interestCoverage.value) ?? undefined
    });
  }

  if (
    snapshot.revenueGrowthPercent !== null &&
    snapshot.revenueGrowthPercent < 0
  ) {
    appendFlag(flags, {
      severity: snapshot.revenueGrowthPercent <= -10 ? "medium" : "low",
      priority: 10,
      title: "Revenue is contracting",
      description:
        "Top-line pressure weakens confidence that the current earnings base is durable through the credit cycle.",
      metric: formatPercent(snapshot.revenueGrowthPercent)
    });
  }

  if (
    snapshot.ebitdaGrowthPercent !== null &&
    snapshot.ebitdaGrowthPercent < 0
  ) {
    appendFlag(flags, {
      severity: snapshot.ebitdaGrowthPercent <= -15 ? "medium" : "low",
      priority: 11,
      title: "EBITDA is deteriorating",
      description:
        "Earnings softness reduces confidence in repayment capacity if the current period is used as the underwriting anchor.",
      metric: formatPercent(snapshot.ebitdaGrowthPercent)
    });
  }

  if (
    snapshot.ebitdaMarginChange !== null &&
    snapshot.ebitdaMarginChange <= -3
  ) {
    appendFlag(flags, {
      severity: "low",
      priority: 12,
      title: "EBITDA margin is compressing",
      description:
        "Margin compression suggests the business may be losing earnings cushion even before leverage stress is fully visible.",
      metric: formatPercent(snapshot.ebitdaMarginChange)
    });
  }

  if (
    creditScenario.metrics.dscr.status === "insufficient" &&
    creditScenario.metrics.debtToEbitda.status === "insufficient" &&
    creditScenario.metrics.interestCoverage.status === "insufficient" &&
    creditScenario.metrics.ltv.status === "insufficient"
  ) {
    appendFlag(flags, {
      severity: "medium",
      priority: 13,
      title: "Structure cannot be fully assessed",
      description:
        "Key structure assumptions are incomplete, so leverage, coverage, and collateral support cannot yet be underwritten.",
      metric: "Insufficient case inputs"
    });
  }

  if (readiness.status === "blocked") {
    appendFlag(flags, {
      severity: "medium",
      priority: 20,
      title: "Financial package does not support a clean credit read",
      description:
        readiness.blockingReasons[0] ?? readiness.summaryMessage,
      metric: readiness.label
    });
  } else if (readiness.status === "caution") {
    appendFlag(flags, {
      severity: "low",
      priority: 21,
      title: "Reported outputs require qualification",
      description:
        readiness.cautionReasons[0] ?? readiness.summaryMessage,
      metric: readiness.label
    });
  }

  if (dataQuality.confidenceLabel === "Low" || dataQuality.mappingCoveragePercent < 0.8) {
    appendFlag(flags, {
      severity: dataQuality.confidenceLabel === "Low" ? "medium" : "low",
      priority: 22,
      title: "Data integrity reduces underwriting confidence",
      description:
        dataQuality.summaryMessage ||
        "Mapping coverage and classification quality reduce confidence in the financial package.",
      metric: `${formatPercent(dataQuality.mappingCoveragePercent * 100)} mapped`
    });
  }

  if (dataQuality.missingCategories.length > 0) {
    appendFlag(flags, {
      severity: "low",
      priority: 23,
      title: "Statement coverage is incomplete",
      description: `Missing categories include ${dataQuality.missingCategories
        .slice(0, 2)
        .join(", ")}${dataQuality.missingCategories.length > 2 ? ", ..." : ""}.`,
      metric: `${dataQuality.missingCategories.length} categories`
    });
  }

  if (dataQuality.consistencyIssues.length > 0) {
    appendFlag(flags, {
      severity: "low",
      priority: 24,
      title: "Cross-period classification is not fully stable",
      description: dataQuality.consistencyIssues[0],
      metric: `${dataQuality.consistencyIssues.length} issues`
    });
  }

  if (dataQuality.hasSinglePeriodWarning) {
    appendFlag(flags, {
      severity: "low",
      priority: 25,
      title: "Trend evidence is limited",
      description:
        "Only one mapped period is available, limiting support for normalized run-rate underwriting.",
      metric: "Single-period history"
    });
  }

  if (lowConfidenceAcceptedAddBacks > 0) {
    appendFlag(flags, {
      severity: "low",
      priority: 26,
      title: "Some adjustments rely on lower-confidence source mapping",
      description:
        "At least one accepted add-back is tied to source data with weaker mapping confidence.",
      metric: `${lowConfidenceAcceptedAddBacks} flagged add-backs`
    });
  }

  return flags
    .sort(compareFlags)
    .slice(0, 5)
    .map(({ priority: _priority, ...flag }) => flag);
}
