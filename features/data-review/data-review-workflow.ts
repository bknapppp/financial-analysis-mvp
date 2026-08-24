export const PHASE3_TEMPLATE_VERSION = "2026-08-23.v1";

export const PHASE3_PROCEDURE_DEFINITIONS = [
  { procedureKey: "historical-pnl", workstreamKey: "quality_of_earnings", title: "Historical P&L review", required: true },
  { procedureKey: "margin-trends", workstreamKey: "revenue_customers", title: "Margin and trend analysis", required: true },
  { procedureKey: "balance-sheet", workstreamKey: "working_capital", title: "Balance-sheet validation", required: true },
  { procedureKey: "source-reconciliation", workstreamKey: "financial_integrity", title: "Reported-to-source reconciliation", required: true },
  { procedureKey: "tax-reconciliation", workstreamKey: "quality_of_earnings", title: "Reported-to-tax reconciliation", required: false },
  { procedureKey: "ebitda-normalization", workstreamKey: "quality_of_earnings", title: "EBITDA normalization & add-backs", required: true },
  { procedureKey: "data-quality", workstreamKey: "financial_integrity", title: "Data quality & mapping completeness", required: true }
] as const;

export type Phase3Status = "not_started" | "in_progress" | "awaiting_review" | "changes_requested" | "blocked" | "complete";
export type ProcedureStatus = "not_started" | "in_progress" | "ready_for_review" | "complete" | "blocked";
export type InvestigationStatus = "open" | "in_progress" | "ready_for_review" | "closed";
export type InvestigationPriority = "low" | "medium" | "high" | "critical";
export type InvestigationDisposition = "resolved" | "immaterial" | "adjustment_proposed" | "further_support_required" | "promote_to_finding";
export type InvestigationSignalType = "manual" | "mapping_exception" | "reconciliation_exception" | "data_quality" | "document_gap" | "add_back" | "financial_variance" | "system_issue" | "other";
export type EvidenceType = "source_document" | "document_version" | "reporting_period" | "financial_entry" | "source_financial_entry" | "account_mapping" | "add_back" | "diligence_issue";

export type DealPhaseRow = { id: string; company_id: string; phase_key: "data_review"; status: Phase3Status; submitted_by_name: string | null; submitted_at: string | null; reviewed_by_name: string | null; reviewed_at: string | null; reviewer_decision: "approved" | "changes_requested" | null; reviewer_rationale: string | null; reopened_at: string | null; completion_basis: Record<string, unknown> | null; version: number; created_at: string; updated_at: string };
export type AnalysisProcedureRow = { id: string; phase_id: string; procedure_key: string; template_version: string; workstream_key: string; title: string; required: boolean; owner_name: string | null; reviewer_name: string | null; status: ProcedureStatus; due_date: string | null; result_summary: string | null; started_at: string | null; completed_at: string | null; completed_by_name: string | null; version: number; created_at: string; updated_at: string };
export type AnalysisInvestigationRow = { id: string; phase_id: string; procedure_id: string | null; reference_code: string; title: string; signal_type: InvestigationSignalType; signal_key: string | null; signal_summary: string; signal_snapshot: Record<string, unknown> | null; period_id: string | null; owner_name: string | null; reviewer_name: string | null; priority: InvestigationPriority; status: InvestigationStatus; notes: string | null; conclusion: string | null; disposition: InvestigationDisposition | null; materiality_rationale: string | null; promoted_issue_id: string | null; opened_by_name: string; opened_at: string; resolved_by_name: string | null; resolved_at: string | null; version: number; created_at: string; updated_at: string };
export type InvestigationEvidenceRow = { id: string; investigation_id: string; evidence_type: EvidenceType; evidence_id: string; relationship: "source" | "supports" | "contradicts" | "related" | "result"; label_snapshot: string | null; attached_by_name: string; created_at: string };
export type PhaseActivityRow = { id: string; phase_id: string; subject_type: string; subject_id: string | null; event_type: string; from_state: string | null; to_state: string | null; rationale: string | null; comment_text: string | null; metadata: Record<string, unknown> | null; actor_name: string; created_at: string };

export type Phase3Workflow = { phase: DealPhaseRow; procedures: AnalysisProcedureRow[]; investigations: AnalysisInvestigationRow[]; evidence: InvestigationEvidenceRow[]; activity: PhaseActivityRow[] };
export type Phase3FinancialReadiness = { status: "ready" | "caution" | "blocked"; reasons: string[] };

function procedureScore(status: ProcedureStatus) { return status === "complete" ? 1 : status === "ready_for_review" ? 0.9 : status === "in_progress" ? 0.5 : 0; }
function investigationScore(item: AnalysisInvestigationRow) { if (item.status === "closed" && item.disposition) return 1; if (item.status === "ready_for_review" && item.conclusion && item.disposition) return 0.8; return item.status === "in_progress" ? 0.4 : 0; }

export function derivePhase3WorkflowState(workflow: Phase3Workflow, financial: Phase3FinancialReadiness) {
  const procedureAverage = workflow.procedures.length ? workflow.procedures.reduce((sum, item) => sum + procedureScore(item.status), 0) / workflow.procedures.length : 0;
  const investigationAverage = workflow.investigations.length ? workflow.investigations.reduce((sum, item) => sum + investigationScore(item), 0) / workflow.investigations.length : 1;
  const reviewScore = workflow.phase.status === "complete" ? 1 : ["awaiting_review", "changes_requested"].includes(workflow.phase.status) ? 0.5 : 0;
  const waiverApproved = (id: string) => {
    const events = workflow.activity.filter((item) => item.subject_id === id && ["investigation_waiver_approved", "investigation_waiver_revoked"].includes(item.event_type)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return events[0]?.event_type === "investigation_waiver_approved";
  };
  const gateFailures: string[] = [];
  if (workflow.procedures.some((item) => item.required && !["ready_for_review", "complete"].includes(item.status))) gateFailures.push("Required procedures must be ready for review or complete.");
  if (workflow.investigations.some((item) => item.priority === "critical" && (!item.disposition || item.status === "open"))) gateFailures.push("Critical investigations require disposition.");
  if (workflow.investigations.some((item) => item.disposition === "immaterial" && !waiverApproved(item.id))) gateFailures.push("Immaterial dispositions require reviewer waiver approval.");
  if (workflow.investigations.some((item) => item.disposition === "promote_to_finding" && !item.promoted_issue_id)) gateFailures.push("Promoted investigations require an authoritative finding.");
  if (financial.status === "blocked") gateFailures.push("Financial readiness is blocked.");
  const completionFailures = [...gateFailures];
  if (workflow.procedures.some((item) => item.required && item.status !== "complete")) completionFailures.push("Required procedures must be complete.");
  if (workflow.investigations.some((item) => item.status !== "closed")) completionFailures.push("Investigations must be closed or carried to a finding.");
  return { completionPercent: Math.round((procedureAverage * 0.6 + investigationAverage * 0.3 + reviewScore * 0.1) * 100), reviewEligible: gateFailures.length === 0, completionEligible: completionFailures.length === 0, gateFailures, completionFailures };
}
