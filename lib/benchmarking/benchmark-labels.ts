import type { BenchmarkMetricKey } from "./industry-medians.ts";

export type BenchmarkDirection = "above" | "below" | "in_line" | "unsupported";

export const BENCHMARK_METRIC_LABELS: Record<BenchmarkMetricKey, string> = {
  ebitdaMarginPercent: "EBITDA Margin",
  revenueGrowthPercent: "Revenue Growth",
  evToEbitda: "EV / EBITDA",
  debtToEbitda: "Debt / EBITDA"
};

export const BENCHMARK_METRIC_SHORT_LABELS: Record<BenchmarkMetricKey, string> = {
  ebitdaMarginPercent: "EBITDA Margin",
  revenueGrowthPercent: "Rev Growth",
  evToEbitda: "EV/EBITDA",
  debtToEbitda: "Debt/EBITDA"
};

export function getBenchmarkDirectionLabel(direction: BenchmarkDirection) {
  if (direction === "above") {
    return "Above market";
  }

  if (direction === "below") {
    return "Below market";
  }

  if (direction === "in_line") {
    return "In line";
  }

  return "Not benchmarked";
}

export function formatBenchmarkMetricValue(
  metricKey: BenchmarkMetricKey,
  value: number | null
) {
  if (value === null || !Number.isFinite(value)) {
    return "Pending";
  }

  if (metricKey === "evToEbitda" || metricKey === "debtToEbitda") {
    return `${value.toFixed(1)}x`;
  }

  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 1
  }).format(value)}%`;
}

export function formatBenchmarkVariance(
  metricKey: BenchmarkMetricKey,
  variance: number | null
) {
  if (variance === null || !Number.isFinite(variance)) {
    return "Pending";
  }

  const prefix = variance >= 0 ? "+" : "-";
  const absoluteValue = Math.abs(variance);

  if (metricKey === "evToEbitda" || metricKey === "debtToEbitda") {
    return `${prefix}${absoluteValue.toFixed(1)}x`;
  }

  return `${prefix}${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(absoluteValue) ? 0 : 1
  }).format(absoluteValue)} pts`;
}
