"use client";

import Link from "next/link";
import type { InvestmentOverviewSummary } from "@/lib/types";

type InvestmentOverviewPanelProps = {
  overview: InvestmentOverviewSummary;
  detailHref?: string;
  eyebrow?: string;
  title?: string;
  compact?: boolean;
};

export function InvestmentOverviewPanel({
  overview,
  detailHref,
  eyebrow = "Underwriting Summary",
  title = "Underwriting Summary",
  compact = false
}: InvestmentOverviewPanelProps) {
  const sections = overview.sections.filter((section) => section.key !== "key_underwriting_gaps");

  return (
    <section className={`rounded-[1.75rem] border border-slate-200 bg-white shadow-panel ${compact ? "p-4" : "p-5"}`}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            {title}
          </h2>
          <p className={`text-sm text-slate-600 ${compact ? "mt-1" : "mt-2"}`}>{overview.summary}</p>
        </div>
        {detailHref ? (
          <Link
            href={detailHref}
            className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
          >
            View detailed reconciliation
          </Link>
        ) : null}
      </div>

      <div className={`grid gap-x-6 gap-y-4 xl:grid-cols-2 ${compact ? "mt-4" : "mt-5"}`}>
        {sections.map((section) => (
          <section key={section.key} className={`border-t border-slate-200 first:border-t-0 ${compact ? "pt-3 first:pt-0" : "pt-4 first:pt-0"}`}>
            <p className="text-sm font-semibold text-slate-900">{section.title}</p>
            <div className={`grid gap-2 ${compact ? "mt-2" : "mt-3"}`}>
              {section.items.length > 0 ? (
                section.items.slice(0, compact ? 2 : section.items.length).map((item) => (
                  <div
                    key={`${section.key}-${item}`}
                    className={`rounded-xl bg-slate-50 text-sm text-slate-700 ${compact ? "px-3 py-1.5" : "px-3 py-2"}`}
                  >
                    {item}
                  </div>
                ))
              ) : (
                <div className={`rounded-xl bg-slate-50 text-sm text-slate-700 ${compact ? "px-3 py-1.5" : "px-3 py-2"}`}>
                  No material items are currently flagged in this section.
                </div>
              )}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
