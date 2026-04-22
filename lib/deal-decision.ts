import type { CreditScenarioResult, PeriodSnapshot } from "./types.ts";

export type DealRecommendation = "approve" | "caution" | "decline";

export type DecisionReason = {
  label: string;
  detail?: string;
};

export type DealDecision = {
  recommendation: DealRecommendation;
  headline: string;
  summary: string;
  primaryReasons: DecisionReason[];
};

type RiskFlagLike = {
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  metric?: string;
};

const MAX_REASONS = 3;

function formatMultiple(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Insufficient data";
  }

  return `${value.toFixed(2)}x`;
}

function formatPercentValue(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "Insufficient data";
  }

  return `${(value * 100).toFixed(1)}%`;
}

function appendReason(reasons: DecisionReason[], reason: DecisionReason | null) {
  if (!reason || reasons.length >= MAX_REASONS) {
    return;
  }

  if (reasons.some((existing) => existing.label === reason.label)) {
    return;
  }

  reasons.push(reason);
}

function getMissingMetricLabels(creditScenario: CreditScenarioResult) {
  const missing: string[] = [];

  if (creditScenario.metrics.dscr.status === "insufficient") {
    missing.push("DSCR");
  }

  if (creditScenario.metrics.debtToEbitda.status === "insufficient") {
    missing.push("Debt / EBITDA");
  }

  if (creditScenario.metrics.ltv.status === "insufficient") {
    missing.push("LTV");
  }

  if (creditScenario.metrics.interestCoverage.status === "insufficient") {
    missing.push("Interest coverage");
  }

  return missing;
}

export function buildDealDecision(params: {
  snapshot: PeriodSnapshot;
  creditScenario: CreditScenarioResult;
  riskFlags: RiskFlagLike[];
  acceptedAddBackTotal: number;
}): DealDecision {
  const { snapshot, creditScenario, riskFlags, acceptedAddBackTotal } = params;
  const highFlags = riskFlags.filter((flag) => flag.severity === "high");
  const mediumFlags = riskFlags.filter((flag) => flag.severity === "medium");
  const dscr = creditScenario.metrics.dscr.value;
  const debtToEbitda = creditScenario.metrics.debtToEbitda.value;
  const ltv = creditScenario.metrics.ltv.value;
  const addBackShare =
    snapshot.ebitda !== null && snapshot.ebitda > 0
      ? acceptedAddBackTotal / snapshot.ebitda
      : null;
  const missingMetricLabels = getMissingMetricLabels(creditScenario);

  const shouldDecline =
    (snapshot.ebitda !== null && snapshot.ebitda < 0) ||
    highFlags.length >= 2 ||
    creditScenario.metrics.dscr.status === "weak" ||
    creditScenario.metrics.debtToEbitda.status === "weak" ||
    creditScenario.metrics.ltv.status === "weak";

  const shouldCaution =
    !shouldDecline &&
    (highFlags.length === 1 ||
      mediumFlags.length >= 2 ||
      creditScenario.metrics.dscr.status === "moderate" ||
      creditScenario.metrics.debtToEbitda.status === "moderate" ||
      creditScenario.metrics.ltv.status === "moderate" ||
      creditScenario.metrics.dscr.status === "insufficient" ||
      creditScenario.metrics.debtToEbitda.status === "insufficient" ||
      creditScenario.metrics.ltv.status === "insufficient" ||
      (addBackShare !== null && addBackShare > 0.25));

  const recommendation: DealRecommendation = shouldDecline
    ? "decline"
    : shouldCaution
      ? "caution"
      : "approve";

  const primaryReasons: DecisionReason[] = [];

  if (recommendation === "decline") {
    appendReason(
      primaryReasons,
      snapshot.ebitda !== null && snapshot.ebitda < 0
        ? {
            label: "Operating earnings are negative",
            detail: `EBITDA is ${snapshot.ebitda.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0
            })} for the selected period.`
          }
        : null
    );

    appendReason(
      primaryReasons,
      creditScenario.metrics.dscr.status === "weak"
        ? {
            label: "Debt service coverage is below minimum tolerance",
            detail: `DSCR is ${formatMultiple(dscr)}.`
          }
        : null
    );

    appendReason(
      primaryReasons,
      creditScenario.metrics.debtToEbitda.status === "weak"
        ? {
            label: "Leverage is outside lender tolerance",
            detail: `Debt / EBITDA is ${formatMultiple(debtToEbitda)}.`
          }
        : null
    );

    appendReason(
      primaryReasons,
      creditScenario.metrics.ltv.status === "weak"
        ? {
            label: "Collateral support is insufficient for the proposed structure",
            detail:
              ltv !== null && Number.isFinite(ltv)
                ? `LTV is ${(ltv * 100).toFixed(1)}%.`
                : "LTV cannot be supported on current assumptions."
          }
        : null
    );
  } else if (recommendation === "caution") {
    appendReason(
      primaryReasons,
      creditScenario.metrics.dscr.status === "moderate"
        ? {
            label: "Coverage is financeable but constrained",
            detail: `DSCR is ${formatMultiple(dscr)}.`
          }
        : null
    );

    appendReason(
      primaryReasons,
      creditScenario.metrics.debtToEbitda.status === "moderate"
        ? {
            label: "Leverage is acceptable but aggressive",
            detail: `Debt / EBITDA is ${formatMultiple(debtToEbitda)}.`
          }
        : null
    );

    appendReason(
      primaryReasons,
      addBackShare !== null && addBackShare > 0.25
        ? {
            label: "Underwriting earnings are materially adjustment-driven",
            detail: `${acceptedAddBackTotal.toLocaleString("en-US", {
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0
            })} equals ${formatPercentValue(addBackShare)} of EBITDA.`
          }
        : null
    );

    appendReason(
      primaryReasons,
      missingMetricLabels.length > 0
        ? {
            label: "The proposed structure cannot be fully evaluated",
            detail: `Unavailable credit metrics: ${missingMetricLabels.join(", ")}.`
          }
        : null
    );
  } else {
    appendReason(primaryReasons, {
      label: "Coverage, leverage, and collateral remain within current thresholds",
      detail: `DSCR ${formatMultiple(dscr)}, Debt / EBITDA ${formatMultiple(
        debtToEbitda
      )}, LTV ${formatPercentValue(ltv)}.`
    });

    appendReason(
      primaryReasons,
      acceptedAddBackTotal > 0
        ? {
            label: "Accepted adjustments are already reflected in the underwriting basis",
            detail:
              addBackShare !== null
                ? `${acceptedAddBackTotal.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0
                  })} equals ${formatPercentValue(addBackShare)} of EBITDA.`
                : `${acceptedAddBackTotal.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0
                  })} of accepted add-backs is included in adjusted EBITDA.`
          }
        : {
            label: "The case is supported by reported operating performance without adjustment reliance"
          }
    );
  }

  riskFlags.forEach((flag) => {
    if (primaryReasons.length >= MAX_REASONS) {
      return;
    }

    const overlapsAdjustmentReason =
      primaryReasons.some(
        (reason) => reason.label === "Underwriting earnings are materially adjustment-driven"
      ) && (flag.title.includes("adjustment-driven") || flag.title.includes("add-backs"));
    const overlapsStructureReason =
      primaryReasons.some(
        (reason) => reason.label === "The proposed structure cannot be fully evaluated"
      ) && flag.title.includes("Structure cannot be fully assessed");

    if (overlapsAdjustmentReason || overlapsStructureReason) {
      return;
    }

    appendReason(primaryReasons, {
      label: flag.title,
      detail: flag.metric ?? flag.description
    });
  });

  const trimmedReasons = primaryReasons.slice(0, MAX_REASONS);

  if (recommendation === "decline") {
    return {
      recommendation,
      headline: "Current structure does not support a financeable credit view",
      summary:
        "Based on the current earnings base and proposed structure, the transaction falls outside standard lender tolerance and should not advance without material de-risking.",
      primaryReasons: trimmedReasons
    };
  }

  if (recommendation === "caution") {
    return {
      recommendation,
      headline: "Deal appears conditionally financeable, but requires credit caution",
      summary:
        "The transaction may be financeable, but the current case requires tighter structure or additional diligence before it can be presented as a clean credit.",
      primaryReasons: trimmedReasons
    };
  }

  return {
    recommendation,
    headline: "Current case supports a financeable credit view",
    summary:
      "On the current underwriting outputs, the transaction screens as financeable without a material exception set, subject to standard diligence and documentation.",
    primaryReasons: trimmedReasons
  };
}

export const determineDealDecision = buildDealDecision;
