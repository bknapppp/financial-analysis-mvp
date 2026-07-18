import {
  resolveBenchmarkIndustry,
  type BenchmarkMetricKey
} from "./industry-medians.ts";
import {
  BENCHMARK_METRIC_LABELS,
  type BenchmarkDirection
} from "./benchmark-labels.ts";

export type BenchmarkConfidence = "High" | "Medium" | "Low";

export type BenchmarkFinancialCompleteness = "complete" | "partial" | "limited";

export type BenchmarkInputMetrics = Partial<Record<BenchmarkMetricKey, number | null>>;

export type BenchmarkComparison = {
  metricKey: BenchmarkMetricKey;
  label: string;
  dealMetric: number | null;
  marketMedian: number | null;
  variance: number | null;
  direction: BenchmarkDirection;
  confidence: BenchmarkConfidence;
  industryLabel: string | null;
  isSupported: boolean;
};

export type BenchmarkCalculationResult = {
  industryLabel: string | null;
  comparisons: BenchmarkComparison[];
  supportedComparisons: BenchmarkComparison[];
};

const BENCHMARK_METRICS: BenchmarkMetricKey[] = [
  "ebitdaMarginPercent",
  "revenueGrowthPercent",
  "evToEbitda",
  "debtToEbitda"
];

const DIRECTION_TOLERANCE: Record<BenchmarkMetricKey, number> = {
  ebitdaMarginPercent: 1,
  revenueGrowthPercent: 1,
  evToEbitda: 0.25,
  debtToEbitda: 0.25
};

function isFiniteMetric(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function calculateDirection(
  metricKey: BenchmarkMetricKey,
  dealMetric: number | null,
  marketMedian: number | null
): BenchmarkDirection {
  if (!isFiniteMetric(dealMetric) || !isFiniteMetric(marketMedian)) {
    return "unsupported";
  }

  const variance = dealMetric - marketMedian;

  if (Math.abs(variance) <= DIRECTION_TOLERANCE[metricKey]) {
    return "in_line";
  }

  return variance > 0 ? "above" : "below";
}

function calculateConfidence(params: {
  hasIndustryMapping: boolean;
  hasMetricSupport: boolean;
  financialCompleteness: BenchmarkFinancialCompleteness;
}): BenchmarkConfidence {
  const { hasIndustryMapping, hasMetricSupport, financialCompleteness } = params;

  if (hasIndustryMapping && hasMetricSupport && financialCompleteness === "complete") {
    return "High";
  }

  if (hasIndustryMapping && hasMetricSupport && financialCompleteness === "partial") {
    return "Medium";
  }

  return "Low";
}

export function calculateBenchmarks(params: {
  industry: string | null | undefined;
  metrics: BenchmarkInputMetrics;
  financialCompleteness: BenchmarkFinancialCompleteness;
  metricKeys?: BenchmarkMetricKey[];
}): BenchmarkCalculationResult {
  const industryBenchmark = resolveBenchmarkIndustry(params.industry);
  const metricKeys = params.metricKeys ?? BENCHMARK_METRICS;
  const industryLabel = industryBenchmark?.industryLabel ?? null;

  const comparisons = metricKeys.map<BenchmarkComparison>((metricKey) => {
    const dealMetric = params.metrics[metricKey] ?? null;
    const marketMedian = industryBenchmark?.medians[metricKey] ?? null;
    const hasMetricSupport = isFiniteMetric(dealMetric) && isFiniteMetric(marketMedian);
    const variance = hasMetricSupport ? dealMetric - marketMedian : null;
    const direction = calculateDirection(metricKey, dealMetric, marketMedian);

    return {
      metricKey,
      label: BENCHMARK_METRIC_LABELS[metricKey],
      dealMetric,
      marketMedian,
      variance,
      direction,
      confidence: calculateConfidence({
        hasIndustryMapping: industryBenchmark !== null,
        hasMetricSupport,
        financialCompleteness: params.financialCompleteness
      }),
      industryLabel,
      isSupported: hasMetricSupport
    };
  });

  return {
    industryLabel,
    comparisons,
    supportedComparisons: comparisons.filter((comparison) => comparison.isSupported)
  };
}

export function deriveBenchmarkFinancialCompleteness(params: {
  revenue: number | null | undefined;
  ebitda: number | null | undefined;
  purchasePrice: number | null | undefined;
  debt: number | null | undefined;
}) {
  const supportedInputs = [
    params.revenue,
    params.ebitda,
    params.purchasePrice,
    params.debt
  ].filter(isFiniteMetric).length;

  if (supportedInputs >= 4) {
    return "complete" as const;
  }

  if (supportedInputs >= 2) {
    return "partial" as const;
  }

  return "limited" as const;
}
