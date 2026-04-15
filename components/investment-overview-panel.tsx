"use client";

import Link from "next/link";
import type { InvestmentOverviewSummary } from "@/lib/types";

type InvestmentOverviewPanelProps = {
  overview: InvestmentOverviewSummary;
  detailHref?: string;
};

export function InvestmentOverviewPanel({
  overview,
  detailHref
}: InvestmentOverviewPanelProps) {
  const sections = overview.sections.filter((section) => section.key !== "key_underwriting_gaps");

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Underwriting Summary
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">
            Underwriting Summary
          </h2>
          <p className="mt-2 text-sm text-slate-600">{overview.summary}</p>
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

      <div className="mt-5 grid gap-x-6 gap-y-4 xl:grid-cols-2">
        {sections.map((section) => (
          <section key={section.key} className="border-t border-slate-200 pt-4 first:border-t-0 first:pt-0">
            <p className="text-sm font-semibold text-slate-900">{section.title}</p>
            <div className="mt-3 grid gap-2">
              {section.items.length > 0 ? (
                section.items.map((item) => (
                  <div
                    key={`${section.key}-${item}`}
                    className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    {item}
                  </div>
                ))
              ) : (
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
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
