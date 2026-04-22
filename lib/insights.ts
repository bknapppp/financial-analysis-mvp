import type {
  ActionRecommendation,
  DataQualityReport,
  Insight,
  PeriodDriverAnalysis,
  PeriodSnapshot
} from "./types.ts";

function percentChange(current: number | null, previous: number | null) {
  if (
    current === null ||
    previous === null ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous)
  ) {
    return null;
  }

  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / Math.abs(previous)) * 100;
}

function signedPercentText(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function signedPointsText(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)} pts`;
}

function pushUnique(items: string[], message: string) {
  if (!items.includes(message)) {
    items.push(message);
  }
}

export function generateInsights(snapshots: PeriodSnapshot[]): Insight[] {
  if (snapshots.length === 0) {
    return [];
  }

  const current = snapshots[snapshots.length - 1];
  const insights: Insight[] = [];
  const addBackShare =
    current.ebitda !== null && current.ebitda !== 0
      ? current.acceptedAddBacks / Math.abs(current.ebitda)
      : null;

  if (current.acceptedAddBacks > 0) {
    insights.push({
      type: "expense_spike",
      message:
        addBackShare !== null
          ? `Accepted add-backs are ${signedPercentText(addBackShare * 100)} of EBITDA`
          : "Accepted add-backs are in use for the current period"
    });
  }

  if (snapshots.length < 2) {
    return insights;
  }

  const previous = snapshots[snapshots.length - 2];

  const revenueDelta = percentChange(current.revenue, previous.revenue);
  if (revenueDelta !== null && Math.abs(revenueDelta) > 10) {
    insights.push({
      type: "revenue_change",
      message: `Revenue ${signedPercentText(revenueDelta)} vs prior period`
    });
  }

  const marginDelta =
    current.grossMarginPercent !== null && previous.grossMarginPercent !== null
      ? current.grossMarginPercent - previous.grossMarginPercent
      : null;
  if (marginDelta !== null && marginDelta < -3) {
    insights.push({
      type: "margin_compression",
      message: `Gross margin ${signedPointsText(marginDelta)} vs prior period`
    });
  }

  const expenseDelta = percentChange(
    current.operatingExpenses,
    previous.operatingExpenses
  );
  if (expenseDelta !== null && expenseDelta > 10) {
    insights.push({
      type: "expense_spike",
      message: `OpEx ${signedPercentText(expenseDelta)} vs prior period`
    });
  }

  return insights;
}

function largestDriver(analysis: Omit<PeriodDriverAnalysis, "insights">) {
  const drivers = [
    {
      label: "revenue growth",
      value: analysis.revenueImpactOnEbitda
    },
    {
      label: "higher COGS",
      value: analysis.cogsImpactOnEbitda
    },
    {
      label: "operating expense changes",
      value: analysis.operatingExpenseImpactOnEbitda
    }
  ];

  return drivers.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
}

export function generateDriverAnalyses(
  snapshots: PeriodSnapshot[]
): PeriodDriverAnalysis[] {
  if (snapshots.length < 2) {
    return [];
  }

  return snapshots.slice(1).map((current, index) => {
    const previous = snapshots[index];

    const revenueVariance = {
      absolute: current.revenue - previous.revenue,
      percent: current.revenueGrowthPercent
    };
    const cogsAbsolute = current.cogs - previous.cogs;
    const cogsVariance = {
      absolute: cogsAbsolute,
      percent: percentChange(current.cogs, previous.cogs)
    };
    const operatingExpensesAbsolute =
      current.operatingExpenses - previous.operatingExpenses;
    const operatingExpensesVariance = {
      absolute: operatingExpensesAbsolute,
      percent: percentChange(
        current.operatingExpenses,
        previous.operatingExpenses
      )
    };
    const ebitdaVariance = {
      absolute:
        current.ebitda !== null && previous.ebitda !== null
          ? current.ebitda - previous.ebitda
          : 0,
      percent: current.ebitdaGrowthPercent
    };

    const baseAnalysis = {
      previousLabel: previous.label,
      currentLabel: current.label,
      revenueVariance,
      cogsVariance,
      operatingExpensesVariance,
      ebitdaVariance,
      revenueImpactOnEbitda: revenueVariance.absolute,
      cogsImpactOnEbitda: -cogsAbsolute,
      operatingExpenseImpactOnEbitda: -operatingExpensesAbsolute
    };

    const insights: string[] = [];
    if (revenueVariance.percent !== null) {
      pushUnique(
        insights,
        `Revenue ${signedPercentText(revenueVariance.percent)} - top-line ${revenueVariance.absolute >= 0 ? "up" : "down"}`
      );
    }

    if (cogsVariance.percent !== null && cogsAbsolute !== 0) {
      pushUnique(
        insights,
        `COGS ${signedPercentText(cogsVariance.percent)} - cost pressure ${cogsAbsolute >= 0 ? "up" : "down"}`
      );
    }

    if (
      operatingExpensesVariance.percent !== null &&
      operatingExpensesAbsolute !== 0
    ) {
      pushUnique(
        insights,
        `OpEx ${signedPercentText(operatingExpensesVariance.percent)} - cost base ${operatingExpensesAbsolute >= 0 ? "up" : "down"}`
      );
    }

    if ((current.grossMarginChange ?? 0) < -1 && cogsAbsolute > 0) {
      pushUnique(insights, "COGS up - gross margin compressed");
    } else if ((current.grossMarginChange ?? 0) > 1 && cogsAbsolute < 0) {
      pushUnique(insights, "COGS moderated - gross margin improved");
    }

    const revenueGrowth = current.revenueGrowthPercent;
    const expenseGrowth = operatingExpensesVariance.percent;
    if (
      revenueGrowth !== null &&
      expenseGrowth !== null &&
      expenseGrowth > revenueGrowth &&
      operatingExpensesAbsolute > 0
    ) {
      pushUnique(insights, "OpEx outpacing revenue - margin pressure building");
    }

    const dominantDriver = largestDriver(baseAnalysis);
    if (ebitdaVariance.absolute > 0 && dominantDriver.label === "revenue growth") {
      pushUnique(insights, "Revenue growth drove EBITDA higher");
    } else if (
      ebitdaVariance.absolute < 0 &&
      dominantDriver.label === "higher COGS"
    ) {
      pushUnique(insights, "Higher COGS drove EBITDA lower");
    } else if (
      ebitdaVariance.absolute < 0 &&
      dominantDriver.label === "operating expense changes"
    ) {
      pushUnique(insights, "Higher OpEx drove EBITDA lower");
    }

    if (current.ebitdaMarginChange !== null) {
      pushUnique(
        insights,
        `EBITDA margin ${signedPointsText(current.ebitdaMarginChange)} vs prior`
      );
    }

    if (insights.length < 2 && ebitdaVariance.percent !== null) {
      pushUnique(
        insights,
        `EBITDA ${ebitdaVariance.absolute >= 0 ? "up" : "down"} ${Math.abs(ebitdaVariance.percent).toFixed(1)}% vs prior`
      );
    }

    return {
      ...baseAnalysis,
      insights: insights.slice(0, 5)
    };
  });
}

export function generateRecommendedActions({
  snapshots,
  driverAnalyses,
  dataQuality
}: {
  snapshots: PeriodSnapshot[];
  driverAnalyses: PeriodDriverAnalysis[];
  dataQuality: DataQualityReport;
}): ActionRecommendation[] {
  if (snapshots.length < 2 || driverAnalyses.length === 0) {
    return [];
  }

  const current = snapshots[snapshots.length - 1];
  const latestAnalysis = driverAnalyses[driverAnalyses.length - 1];
  const recommendations: ActionRecommendation[] = [];
  const seenMessages = new Set<string>();

  function pushRecommendation(message: string, priority: number) {
    if (seenMessages.has(message)) {
      return;
    }

    seenMessages.add(message);
    recommendations.push({ message, priority });
  }

  if (dataQuality.confidenceLabel === "Low") {
    pushRecommendation(
      "Data quality low - fix mappings and missing data first",
      100
    );
  }

  const revenueGrowth = current.revenueGrowthPercent ?? 0;
  if (revenueGrowth >= 15) {
    pushRecommendation(
      "Revenue accelerating - invest behind durable growth channels",
      Math.abs(revenueGrowth) + 40
    );
  } else if (revenueGrowth <= -10) {
    pushRecommendation(
      "Revenue declining - review pricing, demand, and retention",
      Math.abs(revenueGrowth) + 55
    );
  }

  const cogsGrowth = latestAnalysis.cogsVariance.percent ?? 0;
  if (
    latestAnalysis.cogsVariance.absolute > 0 &&
    cogsGrowth > revenueGrowth
  ) {
    pushRecommendation(
      "COGS outpacing revenue - review sourcing and operating efficiency",
      Math.abs(latestAnalysis.cogsImpactOnEbitda) + Math.abs(cogsGrowth)
    );
  }

  const operatingExpenseGrowth = latestAnalysis.operatingExpensesVariance.percent ?? 0;
  if (
    latestAnalysis.operatingExpensesVariance.absolute > 0 &&
    operatingExpenseGrowth > revenueGrowth
  ) {
    pushRecommendation(
      "OpEx outpacing revenue - review cost structure and discretionary spend",
      Math.abs(latestAnalysis.operatingExpenseImpactOnEbitda) +
        Math.abs(operatingExpenseGrowth)
    );
  }

  if ((current.grossMarginChange ?? 0) <= -1 || (current.ebitdaMarginChange ?? 0) <= -1) {
    pushRecommendation(
      "Margins compressing - review pricing and major cost drivers",
      Math.max(
        Math.abs(current.grossMarginChange ?? 0) * 10,
        Math.abs(current.ebitdaMarginChange ?? 0) * 10
      ) + 35
    );
  } else if (
    (current.grossMarginChange ?? 0) >= 1 ||
    (current.ebitdaMarginChange ?? 0) >= 1
  ) {
    pushRecommendation(
      "Margins improving - reinvest behind efficient growth channels",
      Math.max(
        Math.abs(current.grossMarginChange ?? 0) * 10,
        Math.abs(current.ebitdaMarginChange ?? 0) * 10
      ) + 20
    );
  }

  if (
    (current.revenueGrowthPercent !== null &&
      Math.abs(current.revenueGrowthPercent) > 200) ||
    (current.ebitdaGrowthPercent !== null &&
      Math.abs(current.ebitdaGrowthPercent) > 200)
  ) {
    pushRecommendation(
      "Performance volatile - investigate one-time events and execution gaps",
      85
    );
  }

  const dominantDriverValue = Math.max(
    Math.abs(latestAnalysis.revenueImpactOnEbitda),
    Math.abs(latestAnalysis.cogsImpactOnEbitda),
    Math.abs(latestAnalysis.operatingExpenseImpactOnEbitda)
  );

  if (
    latestAnalysis.ebitdaVariance.absolute > 0 &&
    dominantDriverValue === Math.abs(latestAnalysis.revenueImpactOnEbitda)
  ) {
    pushRecommendation(
      "Revenue growth drove EBITDA - support strongest channels",
      Math.abs(latestAnalysis.revenueImpactOnEbitda) + 25
    );
  } else if (
    latestAnalysis.ebitdaVariance.absolute < 0 &&
    dominantDriverValue === Math.abs(latestAnalysis.cogsImpactOnEbitda)
  ) {
    pushRecommendation(
      "Higher COGS drove EBITDA lower - review purchasing and fulfillment",
      Math.abs(latestAnalysis.cogsImpactOnEbitda) + 25
    );
  } else if (
    latestAnalysis.ebitdaVariance.absolute < 0 &&
    dominantDriverValue === Math.abs(latestAnalysis.operatingExpenseImpactOnEbitda)
  ) {
    pushRecommendation(
      "Higher OpEx drove EBITDA lower - tighten major expense lines",
      Math.abs(latestAnalysis.operatingExpenseImpactOnEbitda) + 25
    );
  }

  return recommendations
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 5);
}

export function generateExecutiveSummary({
  companyName,
  snapshots,
  driverAnalyses,
  recommendedActions
}: {
  companyName: string;
  snapshots: PeriodSnapshot[];
  driverAnalyses: PeriodDriverAnalysis[];
  recommendedActions: ActionRecommendation[];
}) {
  if (snapshots.length < 2 || driverAnalyses.length === 0) {
    return null;
  }

  const current = snapshots[snapshots.length - 1];
  const latestAnalysis = driverAnalyses[driverAnalyses.length - 1];
  const sentences: string[] = [];

  const revenueGrowth = current.revenueGrowthPercent;
  if (revenueGrowth === 0) {
    sentences.push(`At ${companyName}, Revenue was flat versus the prior period.`);
  } else if (revenueGrowth !== null) {
    sentences.push(
      `At ${companyName}, Revenue ${revenueGrowth >= 0 ? "increased" : "declined"} ${Math.abs(
        revenueGrowth
      ).toFixed(1)}% versus the prior period.`
    );
  }

  const dominantDriver = largestDriver(latestAnalysis);
  if (
    latestAnalysis.ebitdaVariance.absolute > 0 &&
    dominantDriver.label === "revenue growth"
  ) {
    sentences.push("EBITDA improved primarily on stronger top-line performance.");
  } else if (
    latestAnalysis.ebitdaVariance.absolute < 0 &&
    dominantDriver.label === "higher COGS"
  ) {
    sentences.push("EBITDA weakened mainly because COGS rose faster than Revenue.");
  } else if (
    latestAnalysis.ebitdaVariance.absolute < 0 &&
    dominantDriver.label === "operating expense changes"
  ) {
    sentences.push("EBITDA weakened mainly because OpEx increased.");
  } else if (latestAnalysis.ebitdaVariance.absolute === 0) {
    sentences.push("EBITDA was flat period-over-period.");
  } else if (latestAnalysis.ebitdaVariance.percent !== null) {
    sentences.push(
      `EBITDA ${latestAnalysis.ebitdaVariance.absolute >= 0 ? "increased" : "declined"} ${Math.abs(
        latestAnalysis.ebitdaVariance.percent
      ).toFixed(1)}% period-over-period.`
    );
  }

  if ((current.grossMarginChange ?? 0) < -1) {
    sentences.push("Gross margin declined, indicating weaker operating efficiency.");
  } else if ((current.grossMarginChange ?? 0) > 1) {
    sentences.push("Gross margin improved, indicating better operating efficiency.");
  }

  const opExGrowth = latestAnalysis.operatingExpensesVariance.percent;
  if (
    revenueGrowth !== null &&
    opExGrowth !== null &&
    opExGrowth > revenueGrowth &&
    latestAnalysis.operatingExpensesVariance.absolute > 0
  ) {
    sentences.push("OpEx outpaced Revenue growth and added pressure to margins.");
  }

  if (recommendedActions.length > 0) {
    const topAction = recommendedActions[0]?.message;
    if (topAction) {
      const normalizedAction = topAction.endsWith(".") ? topAction : `${topAction}.`;
      sentences.push(`Priority focus: ${normalizedAction}`);
    }
  }

  if (sentences.length < 5) {
    sentences.push(
      `Overall, current performance reflects ${
        current.ebitda !== null && current.ebitda >= 0 ? "positive" : "mixed"
      } operating momentum with ${
        (current.ebitdaMarginChange ?? 0) >= 0 ? "stable to improving" : "weaker"
      } profitability.`
    );
  }

  return sentences.slice(0, 6).join(" ");
}
