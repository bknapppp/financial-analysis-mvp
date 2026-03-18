type ExecutiveSummaryProps = {
  summary: string | null;
};

export function ExecutiveSummary({ summary }: ExecutiveSummaryProps) {
  if (!summary) {
    return null;
  }

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Executive Summary
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          High-level operating summary for the latest period.
        </p>
      </div>

      <p className="text-sm leading-7 text-slate-700">{summary}</p>
    </section>
  );
}
