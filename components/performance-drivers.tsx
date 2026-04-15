"use client";

import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { PeriodDriverAnalysis } from "@/lib/types";

type PerformanceDriversProps = {
  analyses: PeriodDriverAnalysis[];
  showOuterCard?: boolean;
};

type SummaryMetric = {
  label: string;
  percent: number | null;
  absolute?: number;
  tone?: "neutral" | "positive" | "negative";
};

function formatDeltaPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "-";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatPercent(value)}`;
}

function formatDeltaCurrency(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${formatCurrency(value)}`;
}

function metricToneClass(tone: SummaryMetric["tone"]) {
  if (tone === "positive") return "text-teal-700";
  if (tone === "negative") return "text-rose-700";
  return "text-slate-900";
}

function buildSummaryMetrics(analysis: PeriodDriverAnalysis): SummaryMetric[] {
  return [
    {
      label: "Revenue change",
      percent: analysis.revenueVariance.percent
    },
    {
      label: "COGS change",
      percent: analysis.cogsVariance.percent
    },
    {
      label: "Operating Expenses change",
      percent: analysis.operatingExpensesVariance.percent
    },
    {
      label: "EBITDA impact",
      percent: null,
      absolute: analysis.ebitdaVariance.absolute,
      tone:
        analysis.ebitdaVariance.absolute > 0
          ? "positive"
          : analysis.ebitdaVariance.absolute < 0
            ? "negative"
            : "neutral"
    }
  ];
}

function buildDriverHighlights(analysis: PeriodDriverAnalysis) {
  const highlights = [
    {
      weight: Math.abs(analysis.revenueImpactOnEbitda),
      text:
        analysis.revenueImpactOnEbitda >= 0
          ? `Revenue supported EBITDA by ${formatDeltaCurrency(
              analysis.revenueImpactOnEbitda
            )} versus ${analysis.previousLabel}.`
          : `Revenue reduced EBITDA by ${formatDeltaCurrency(
              analysis.revenueImpactOnEbitda
            )} versus ${analysis.previousLabel}.`
    },
    {
      weight: Math.abs(analysis.cogsImpactOnEbitda),
      text:
        analysis.cogsImpactOnEbitda >= 0
          ? `Direct cost performance improved EBITDA by ${formatDeltaCurrency(
              analysis.cogsImpactOnEbitda
            )}.`
          : `Direct cost pressure reduced EBITDA by ${formatDeltaCurrency(
              analysis.cogsImpactOnEbitda
            )}.`
    },
    {
      weight: Math.abs(analysis.operatingExpenseImpactOnEbitda),
      text:
        analysis.operatingExpenseImpactOnEbitda >= 0
          ? `Operating expense discipline improved EBITDA by ${formatDeltaCurrency(
              analysis.operatingExpenseImpactOnEbitda
            )}.`
          : `Operating expense growth reduced EBITDA by ${formatDeltaCurrency(
              analysis.operatingExpenseImpactOnEbitda
            )}.`
    },
    {
      weight: Math.abs(analysis.ebitdaVariance.absolute),
      text: `EBITDA changed ${formatDeltaCurrency(
        analysis.ebitdaVariance.absolute
      )} (${formatDeltaPercent(analysis.ebitdaVariance.percent)}) from ${
        analysis.previousLabel
      } to ${analysis.currentLabel}.`
    }
  ];

  return highlights
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 4)
    .map((highlight) => highlight.text);
}

export function PerformanceDrivers({
  analyses,
  showOuterCard = true
}: PerformanceDriversProps) {
  const latestAnalysis = analyses[analyses.length - 1] ?? null;

  const content = (
    <>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Key Performance Drivers
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Concise view of the operating movements driving recent period performance.
        </p>
      </div>

      {latestAnalysis ? (
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-sm font-medium text-slate-900">
              {latestAnalysis.previousLabel} to {latestAnalysis.currentLabel}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {buildSummaryMetrics(latestAnalysis).map((metric) => (
              <article
                key={metric.label}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-4"
              >
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  {metric.label}
                </p>
                <p
                  className={`mt-3 text-2xl font-semibold ${metricToneClass(metric.tone)}`}
                >
                  {metric.absolute !== undefined
                    ? formatDeltaCurrency(metric.absolute)
                    : formatDeltaPercent(metric.percent)}
                </p>
              </article>
            ))}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-slate-900">Driver highlights</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {buildDriverHighlights(latestAnalysis).map((highlight) => (
                <li key={highlight} className="flex gap-2">
                  <span className="text-slate-400">•</span>
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          </div>

          {analyses.length > 0 ? (
            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                View Detailed Trends
              </summary>
              <div className="mt-4 space-y-4">
                {analyses.map((analysis) => (
                  <div
                    key={`${analysis.previousLabel}-${analysis.currentLabel}`}
                    className="rounded-2xl border border-slate-200 bg-white p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <h4 className="text-sm font-semibold text-slate-900">
                        {analysis.previousLabel} to {analysis.currentLabel}
                      </h4>
                      <p className="text-sm text-slate-500">
                        EBITDA impact:{" "}
                        <span className="font-medium text-slate-900">
                          {formatDeltaCurrency(analysis.ebitdaVariance.absolute)}
                        </span>
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {buildSummaryMetrics(analysis).map((metric) => (
                        <div
                          key={`${analysis.previousLabel}-${analysis.currentLabel}-${metric.label}`}
                          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3"
                        >
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                            {metric.label}
                          </p>
                          <p
                            className={`mt-2 text-lg font-semibold ${metricToneClass(
                              metric.tone
                            )}`}
                          >
                            {metric.absolute !== undefined
                              ? formatDeltaCurrency(metric.absolute)
                              : formatDeltaPercent(metric.percent)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          Add at least two reporting periods to review performance drivers.
        </div>
      )}
    </>
  );

  if (!showOuterCard) {
    return <section>{content}</section>;
  }

  return <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">{content}</section>;
}
