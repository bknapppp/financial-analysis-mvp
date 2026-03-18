import type { ActionRecommendation } from "@/lib/types";

type RecommendedActionsProps = {
  recommendations: ActionRecommendation[];
};

export function RecommendedActions({
  recommendations
}: RecommendedActionsProps) {
  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Recommended Actions
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Practical next steps based on recent operating performance.
        </p>
      </div>

      {recommendations.length > 0 ? (
        <ul className="space-y-3">
          {recommendations.slice(0, 5).map((recommendation) => (
            <li
              key={recommendation.message}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            >
              {recommendation.message}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          Add at least two reporting periods to generate recommendations.
        </div>
      )}
    </section>
  );
}
