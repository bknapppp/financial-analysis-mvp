import Link from "next/link";
import { BackingChip } from "@/components/backing-chip";
import type { BackingSummaryItem } from "@/lib/types";

type BackingSummaryPanelProps = {
  title?: string;
  description?: string;
  rows: BackingSummaryItem[];
};

export function BackingSummaryPanel({
  title = "Backing Summary",
  description,
  rows
}: BackingSummaryPanelProps) {
  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-panel">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Backing
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">{rows.length} category{rows.length === 1 ? "" : "ies"}</p>
      </div>

      <div className="mt-3 divide-y divide-slate-200 rounded-[1rem] border border-slate-200 bg-slate-50">
        {rows.map((row) => (
          <Link
            key={row.id}
            href={row.href}
            className="flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-white"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">{row.label}</p>
              {row.note ? <p className="truncate text-xs text-slate-500">{row.note}</p> : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Open</span>
              <BackingChip status={row.status} size="compact" />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
