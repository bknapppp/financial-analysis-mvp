import type { DashboardData } from "@/lib/types";
import { buildDealShellViewModel, type DealShellViewModel } from "@/lib/view-models/deal-shell";
import { derivePhase3WorkflowState, type Phase3FinancialReadiness, type Phase3Workflow } from "@/features/data-review/data-review-workflow";

export type DurableDataReviewPageViewModel = {
  mode: "uninitialized" | "persisted" | "schema_unavailable";
  companyId: string;
  shell: DealShellViewModel;
  workflow: Phase3Workflow | null;
  workflowState: ReturnType<typeof derivePhase3WorkflowState> | null;
  financialReadiness: Phase3FinancialReadiness;
  authoritative: { documentCount: number; periodCount: number; entryCount: number; mappingCoverage: number; mappingExceptions: number; reconciliationFailures: number; proposedAdjustments: number; openFormalIssues: number; readinessLabel: string };
  evidenceOptions: Array<{ id: string; type: "source_document"; label: string }>;
  links: { sourceData: string; financials: string; underwriting: string };
};

export function buildDurableDataReviewPageViewModel(data: DashboardData, workflow: Phase3Workflow | null, mode?: "uninitialized" | "schema_unavailable"): DurableDataReviewPageViewModel {
  if (!data.company) throw new Error("Company is required.");
  const mappingExceptions = data.entries.filter((entry) => !entry.confidence || entry.confidence === "low").length;
  const financialReadiness: Phase3FinancialReadiness = { status: data.readiness.status === "ready" ? "ready" : data.readiness.status === "blocked" ? "blocked" : "caution", reasons: [...data.readiness.blockingReasons, ...data.readiness.cautionReasons] };
  const workflowState = workflow ? derivePhase3WorkflowState(workflow, financialReadiness) : null;
  return {
    mode: workflow ? "persisted" : mode ?? "uninitialized",
    companyId: data.company.id,
    shell: buildDealShellViewModel({ company: data.company, requestedSection: "data-review", context: "data-review", progressPercent: workflowState?.completionPercent ?? 0, progressLabel: "Analysis workflow completion", progressIsPreview: false }),
    workflow, workflowState, financialReadiness,
    authoritative: { documentCount: data.documents.length, periodCount: data.periods.length, entryCount: data.entries.length, mappingCoverage: Math.round(data.dataQuality.mappingCoveragePercent), mappingExceptions, reconciliationFailures: data.reconciliation.status === "reconciled" ? 0 : data.reconciliation.issues.filter((item) => item.severity !== "info").length, proposedAdjustments: data.addBackReviewItems.filter((item) => item.status === "suggested").length, openFormalIssues: data.diligenceIssues.filter((item) => item.status === "open" || item.status === "in_review").length, readinessLabel: data.readiness.label },
    evidenceOptions: data.documents.map((item) => ({ id: item.id, type: "source_document" as const, label: item.name ?? item.source_file_name ?? "Untitled document" })),
    links: { sourceData: `/source-data?companyId=${data.company.id}`, financials: `/financials?companyId=${data.company.id}`, underwriting: `/deal/${data.company.id}/underwriting` }
  };
}
