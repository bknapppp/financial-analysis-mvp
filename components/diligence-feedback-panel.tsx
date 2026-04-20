import type { DiligenceIssueFeedback } from "@/lib/types";

type DiligenceFeedbackPanelProps = {
  feedback: DiligenceIssueFeedback;
  title?: string;
};

export function DiligenceFeedbackPanel({
  feedback,
  title = "Recent Changes"
}: DiligenceFeedbackPanelProps) {
  if (
    feedback.resolvedIssueCount === 0 &&
    feedback.reopenedIssueCount === 0 &&
    !feedback.readinessChanged
  ) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-teal-200 bg-teal-50 p-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-teal-800">
        {title}
      </p>
      <div className="mt-2 space-y-1 text-sm text-teal-950">
        {feedback.resolvedIssueCount > 0 ? (
          <p>
            {feedback.resolvedIssueCount} issue{feedback.resolvedIssueCount === 1 ? "" : "s"} resolved
            {feedback.resolvedIssueTitles.length > 0
              ? `: ${feedback.resolvedIssueTitles.slice(0, 2).join("; ")}`
              : ""}
          </p>
        ) : null}
        {feedback.reopenedIssueCount > 0 ? (
          <p>
            {feedback.reopenedIssueCount} issue{feedback.reopenedIssueCount === 1 ? "" : "s"} reopened
            {feedback.reopenedIssueTitles.length > 0
              ? `: ${feedback.reopenedIssueTitles.slice(0, 2).join("; ")}`
              : ""}
          </p>
        ) : null}
        {feedback.readinessChanged &&
        feedback.previousReadinessLabel &&
        feedback.currentReadinessLabel ? (
          <p>
            Readiness changed from {feedback.previousReadinessLabel} to{" "}
            {feedback.currentReadinessLabel}
          </p>
        ) : null}
      </div>
    </section>
  );
}
