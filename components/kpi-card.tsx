import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { KpiTraceabilityBadge } from "@/lib/types";

type KpiCardProps = {
  label: string;
  value: number | null;
  valueDisplay?: string | null;
  helpText: string;
  format?: "currency" | "percent";
  delta?: number | null;
  deltaAbsoluteText?: string | null;
  deltaLabel?: string;
  traceabilityBadge?: KpiTraceabilityBadge | null;
  onClick?: () => void;
};

export function KpiCard({
  label,
  value,
  valueDisplay = null,
  helpText,
  format = "currency",
  delta = null,
  deltaAbsoluteText = null,
  deltaLabel,
  traceabilityBadge = null,
  onClick
}: KpiCardProps) {
  const hasDelta = delta !== null && Number.isFinite(delta);
  const direction =
    !hasDelta || delta === 0 ? "neutral" : delta > 0 ? "positive" : "negative";
  const deltaPrefix = hasDelta && delta > 0 ? "+" : "";
  const arrow = direction === "positive" ? "↑" : direction === "negative" ? "↓" : "";
  const deltaColorClass =
    direction === "positive"
      ? "text-teal-700"
      : direction === "negative"
        ? "text-rose-700"
        : "text-slate-500";
  const badgeClass =
    traceabilityBadge?.tone === "rose"
      ? "bg-rose-100 text-rose-800"
      : traceabilityBadge?.tone === "amber"
        ? "bg-amber-100 text-amber-800"
        : "bg-slate-100 text-slate-700";

  return (
    <article className="rounded-[1.5rem] bg-white shadow-panel">
      <button
        type="button"
        onClick={onClick}
        disabled={!onClick}
        className="w-full rounded-[1.5rem] p-5 text-left disabled:cursor-default"
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          {traceabilityBadge ? (
            <span
              className={`rounded-full px-2 py-1 text-[11px] font-medium ${badgeClass}`}
            >
              {traceabilityBadge.label}
            </span>
          ) : null}
        </div>

        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
          {valueDisplay ??
            (format === "percent" ? formatPercent(value) : formatCurrency(value))}
        </p>
        <div className="mt-2 min-h-[2.75rem]">
          {hasDelta ? (
            <>
              <p className={`text-sm font-medium ${deltaColorClass}`}>
                {deltaPrefix}
                {formatPercent(delta)}
                {arrow ? ` ${arrow}` : ""}
                {deltaLabel ? ` ${deltaLabel}` : ""}
              </p>
              {deltaAbsoluteText ? (
                <p className="mt-1 text-xs text-slate-500">{deltaAbsoluteText}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-400">
              —{deltaLabel ? ` ${deltaLabel}` : ""}
            </p>
          )}
        </div>
        <p className="mt-2 text-sm text-slate-500">{helpText}</p>
      </button>
    </article>
  );
}
