import type { Insight } from "@/lib/types";

type InsightFeedProps = {
  insights: Insight[];
};

export function InsightFeed({ insights }: InsightFeedProps) {
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">What Changed</h2>
        <p className="mt-1 text-sm text-slate-500">
          Concise operating changes versus the prior period.
        </p>
      </div>

      <div className="space-y-3">
        {insights.length > 0 ? (
          insights.map((insight, index) => (
            <article
              key={`${insight.type}-${index}`}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                {insight.type.replaceAll("_", " ")}
              </p>
              <p className="mt-2 text-sm text-slate-700">{insight.message}</p>
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
            Load at least two months of financials to surface operating insights.
          </div>
        )}
      </div>
    </section>
  );
}
