import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase";
import { PHASE3_PROCEDURE_DEFINITIONS, PHASE3_TEMPLATE_VERSION, derivePhase3WorkflowState, type AnalysisInvestigationRow, type AnalysisProcedureRow, type DealPhaseRow, type EvidenceType, type InvestigationEvidenceRow, type Phase3FinancialReadiness, type Phase3Workflow, type PhaseActivityRow } from "@/features/data-review/data-review-workflow";

export class Phase3ConflictError extends Error {}
export class Phase3ValidationError extends Error { constructor(message: string, public fields?: Record<string, string>) { super(message); } }

export type Phase3Actor = { userId: string | null; name: string; isDevelopmentFallback: boolean };
export async function resolvePhase3Actor(): Promise<Phase3Actor> {
  // The application does not yet establish a trusted user session. Never accept actor identity from request bodies.
  if (process.env.NODE_ENV === "production") throw new Error("Phase 3 mutations require authenticated application identity in production.");
  return { userId: null, name: "Development Analyst", isDevelopmentFallback: true };
}

const PHASE_SELECT = "id, company_id, phase_key, status, submitted_by_name, submitted_at, reviewed_by_name, reviewed_at, reviewer_decision, reviewer_rationale, reopened_at, completion_basis, version, created_at, updated_at";
const PROCEDURE_SELECT = "id, phase_id, procedure_key, template_version, workstream_key, title, required, owner_name, reviewer_name, status, due_date, result_summary, started_at, completed_at, completed_by_name, version, created_at, updated_at";
const INVESTIGATION_SELECT = "id, phase_id, procedure_id, reference_code, title, signal_type, signal_key, signal_summary, signal_snapshot, period_id, owner_name, reviewer_name, priority, status, notes, conclusion, disposition, materiality_rationale, promoted_issue_id, opened_by_name, opened_at, resolved_by_name, resolved_at, version, created_at, updated_at";
const EVIDENCE_SELECT = "id, investigation_id, evidence_type, evidence_id, relationship, label_snapshot, attached_by_name, created_at";
const ACTIVITY_SELECT = "id, phase_id, subject_type, subject_id, event_type, from_state, to_state, rationale, comment_text, metadata, actor_name, created_at";

export async function getPhase3Workflow(companyId: string): Promise<Phase3Workflow | null> {
  const db = getSupabaseServerClient();
  const phaseResult = await db.from("deal_phases").select(PHASE_SELECT).eq("company_id", companyId).eq("phase_key", "data_review").maybeSingle<DealPhaseRow>();
  if (phaseResult.error) throw phaseResult.error;
  if (!phaseResult.data) return null;
  const phase = phaseResult.data;
  const [procedures, investigations, activity] = await Promise.all([
    db.from("analysis_procedures").select(PROCEDURE_SELECT).eq("phase_id", phase.id).order("created_at").returns<AnalysisProcedureRow[]>(),
    db.from("analysis_investigations").select(INVESTIGATION_SELECT).eq("phase_id", phase.id).order("created_at", { ascending: false }).returns<AnalysisInvestigationRow[]>(),
    db.from("phase_activity").select(ACTIVITY_SELECT).eq("phase_id", phase.id).order("created_at", { ascending: false }).limit(100).returns<PhaseActivityRow[]>()
  ]);
  for (const result of [procedures, investigations, activity]) if (result.error) throw result.error;
  const ids = (investigations.data ?? []).map((item) => item.id);
  const evidence = ids.length ? await db.from("investigation_evidence").select(EVIDENCE_SELECT).in("investigation_id", ids).order("created_at", { ascending: false }).returns<InvestigationEvidenceRow[]>() : { data: [] as InvestigationEvidenceRow[], error: null };
  if (evidence.error) throw evidence.error;
  return { phase, procedures: procedures.data ?? [], investigations: investigations.data ?? [], evidence: evidence.data ?? [], activity: activity.data ?? [] };
}

export async function initializePhase3(companyId: string) {
  const actor = await resolvePhase3Actor();
  const procedures = PHASE3_PROCEDURE_DEFINITIONS.map((item) => ({ procedure_key: item.procedureKey, template_version: PHASE3_TEMPLATE_VERSION, workstream_key: item.workstreamKey, title: item.title, required: item.required }));
  const { error } = await getSupabaseServerClient().rpc("initialize_phase3", { p_company_id: companyId, p_actor_name: actor.name, p_procedures: procedures });
  if (error) throw error;
  return getPhase3Workflow(companyId);
}

async function appendActivity(input: { phaseId: string; subjectType: string; subjectId?: string | null; eventType: string; fromState?: string | null; toState?: string | null; rationale?: string | null; commentText?: string | null; metadata?: Record<string, unknown> | null; actor: Phase3Actor }) {
  const { error } = await getSupabaseServerClient().from("phase_activity").insert({ phase_id: input.phaseId, subject_type: input.subjectType, subject_id: input.subjectId ?? null, event_type: input.eventType, from_state: input.fromState ?? null, to_state: input.toState ?? null, rationale: input.rationale ?? null, comment_text: input.commentText ?? null, metadata: input.metadata ?? null, actor_user_id: input.actor.userId, actor_name: input.actor.name });
  if (error) throw error;
}

async function requirePhase(companyId: string) { const workflow = await getPhase3Workflow(companyId); if (!workflow) throw new Phase3ValidationError("Phase 3 is not initialized."); return workflow; }

export async function updatePhase3Procedure(companyId: string, id: string, body: Record<string, unknown>) {
  const actor = await resolvePhase3Actor(); const workflow = await requirePhase(companyId); const current = workflow.procedures.find((item) => item.id === id);
  if (!current) throw new Phase3ValidationError("Procedure not found.");
  if (body.version !== current.version) throw new Phase3ConflictError("Procedure was updated by another session.");
  const status = body.status as AnalysisProcedureRow["status"] | undefined;
  if (status && !["not_started","in_progress","ready_for_review","complete","blocked"].includes(status)) throw new Phase3ValidationError("Invalid procedure status.");
  const resultSummary = body.resultSummary === undefined ? current.result_summary : String(body.resultSummary || "").trim() || null;
  if ((status === "ready_for_review" || status === "complete") && !resultSummary) throw new Phase3ValidationError("A result summary is required before review or completion.");
  const updates: Record<string, unknown> = { version: current.version + 1, updated_at: new Date().toISOString() };
  if (status) { updates.status = status; updates.started_at = status === "not_started" ? null : current.started_at ?? new Date().toISOString(); updates.completed_at = status === "complete" ? new Date().toISOString() : null; updates.completed_by_name = status === "complete" ? actor.name : null; }
  if (body.ownerName !== undefined) updates.owner_name = String(body.ownerName || "").trim() || null;
  if (body.reviewerName !== undefined) updates.reviewer_name = String(body.reviewerName || "").trim() || null;
  if (body.dueDate !== undefined) updates.due_date = String(body.dueDate || "").trim() || null;
  if (body.resultSummary !== undefined) updates.result_summary = resultSummary;
  const result = await getSupabaseServerClient().from("analysis_procedures").update(updates).eq("id", id).eq("phase_id", workflow.phase.id).eq("version", current.version).select(PROCEDURE_SELECT).maybeSingle<AnalysisProcedureRow>();
  if (result.error) throw result.error; if (!result.data) throw new Phase3ConflictError("Procedure was updated by another session.");
  await appendActivity({ phaseId: workflow.phase.id, subjectType: "procedure", subjectId: id, eventType: status && status !== current.status ? "procedure_status_changed" : "procedure_assignment_changed", fromState: current.status, toState: result.data.status, actor });
  return result.data;
}

export async function createPhase3Investigation(companyId: string, body: Record<string, unknown>) {
  const actor = await resolvePhase3Actor(); const workflow = await requirePhase(companyId);
  const title = String(body.title || "").trim(); const signalSummary = String(body.signalSummary || "").trim();
  if (!title || !signalSummary) throw new Phase3ValidationError("Title and signal summary are required.");
  const priority = String(body.priority || "medium").toLowerCase();
  if (!["low", "medium", "high", "critical"].includes(priority)) throw new Phase3ValidationError("Invalid investigation priority.");
  const { data, error } = await getSupabaseServerClient().rpc("create_phase3_investigation", { p_phase_id: workflow.phase.id, p_procedure_id: body.procedureId || null, p_title: title, p_signal_type: body.signalType || "manual", p_signal_key: body.signalKey || null, p_signal_summary: signalSummary, p_signal_snapshot: body.signalSnapshot || null, p_period_id: body.periodId || null, p_owner_name: body.ownerName || null, p_reviewer_name: body.reviewerName || null, p_priority: priority, p_actor_name: actor.name }).single<AnalysisInvestigationRow>();
  if (error) throw error; return data;
}

export async function updatePhase3Investigation(companyId: string, id: string, body: Record<string, unknown>) {
  const actor = await resolvePhase3Actor(); const workflow = await requirePhase(companyId); const current = workflow.investigations.find((item) => item.id === id);
  if (!current) throw new Phase3ValidationError("Investigation not found."); if (body.version !== current.version) throw new Phase3ConflictError("Investigation was updated by another session.");
  if (body.promotedIssueId !== undefined) throw new Phase3ValidationError("Finding linkage is server controlled.");
  const updates: Record<string, unknown> = { version: current.version + 1, updated_at: new Date().toISOString() };
  const mapping: Record<string, string> = { procedureId:"procedure_id", title:"title", signalSummary:"signal_summary", ownerName:"owner_name", reviewerName:"reviewer_name", priority:"priority", status:"status", notes:"notes", conclusion:"conclusion", disposition:"disposition", materialityRationale:"materiality_rationale" };
  for (const [input, column] of Object.entries(mapping)) if (body[input] !== undefined) updates[column] = typeof body[input] === "string" ? String(body[input]).trim() || null : body[input];
  const nextStatus = (updates.status ?? current.status) as AnalysisInvestigationRow["status"]; const nextDisposition = (updates.disposition ?? current.disposition) as AnalysisInvestigationRow["disposition"]; const nextConclusion = (updates.conclusion ?? current.conclusion) as string | null;
  if (nextDisposition === "promote_to_finding") throw new Phase3ValidationError("Use the finding-promotion action.");
  if (nextDisposition === "immaterial" && !String(updates.materiality_rationale ?? current.materiality_rationale ?? "").trim()) throw new Phase3ValidationError("Materiality rationale is required for an immaterial disposition.");
  if (nextStatus === "closed") { if (!String(nextConclusion ?? "").trim() || !nextDisposition) throw new Phase3ValidationError("Closed investigations require a conclusion and disposition."); updates.resolved_at = new Date().toISOString(); updates.resolved_by_name = actor.name; } else { updates.resolved_at = null; updates.resolved_by_name = null; }
  const result = await getSupabaseServerClient().from("analysis_investigations").update(updates).eq("id", id).eq("phase_id", workflow.phase.id).eq("version", current.version).select(INVESTIGATION_SELECT).maybeSingle<AnalysisInvestigationRow>();
  if (result.error) throw result.error; if (!result.data) throw new Phase3ConflictError("Investigation was updated by another session.");
  const eventType = result.data.disposition !== current.disposition ? "investigation_dispositioned" : result.data.owner_name !== current.owner_name || result.data.reviewer_name !== current.reviewer_name ? "investigation_assignment_changed" : "investigation_updated";
  await appendActivity({ phaseId: workflow.phase.id, subjectType: "investigation", subjectId: id, eventType, fromState: current.status, toState: result.data.status, actor }); return result.data;
}

async function validateEvidence(companyId: string, type: EvidenceType, id: string) {
  const db = getSupabaseServerClient(); let label = type.replaceAll("_", " "); let valid = false;
  if (type === "source_document") { const r = await db.from("source_documents").select("company_id, name").eq("id", id).maybeSingle<{company_id:string;name:string}>(); if (r.error) throw r.error; valid = r.data?.company_id === companyId; label = r.data?.name ?? label; }
  else if (type === "reporting_period") { const r = await db.from("reporting_periods").select("company_id, label").eq("id", id).maybeSingle<{company_id:string;label:string}>(); if (r.error) throw r.error; valid = r.data?.company_id === companyId; label = r.data?.label ?? label; }
  else if (["account_mapping","add_back","diligence_issue"].includes(type)) { const table = type === "account_mapping" ? "account_mappings" : type === "add_back" ? "add_backs" : "diligence_issues"; const r = await db.from(table).select("company_id").eq("id", id).maybeSingle<{company_id:string|null}>(); if (r.error) throw r.error; valid = r.data?.company_id === companyId; }
  else if (type === "financial_entry") { const r = await db.from("financial_entries").select("account_name, reporting_periods!inner(company_id)").eq("id", id).maybeSingle<{account_name:string;reporting_periods:{company_id:string}}>(); if (r.error) throw r.error; valid = r.data?.reporting_periods.company_id === companyId; label = r.data?.account_name ?? label; }
  else if (type === "document_version") { const r = await db.from("document_versions").select("version_number, source_documents!inner(company_id, name)").eq("id", id).maybeSingle<{version_number:number;source_documents:{company_id:string;name:string}}>(); if (r.error) throw r.error; valid = r.data?.source_documents.company_id === companyId; label = r.data ? `${r.data.source_documents.name} v${r.data.version_number}` : label; }
  else if (type === "source_financial_entry") { const r = await db.from("source_financial_entries").select("account_name, source_reporting_periods!inner(source_documents!inner(company_id))").eq("id", id).maybeSingle<{account_name:string;source_reporting_periods:{source_documents:{company_id:string}}}>(); if (r.error) throw r.error; valid = r.data?.source_reporting_periods.source_documents.company_id === companyId; label = r.data?.account_name ?? label; }
  if (!valid) throw new Phase3ValidationError("Evidence does not exist or belongs to another deal."); return label;
}

export async function attachPhase3Evidence(companyId: string, investigationId: string, body: Record<string, unknown>) {
  const actor = await resolvePhase3Actor(); const workflow = await requirePhase(companyId); if (!workflow.investigations.some((item) => item.id === investigationId)) throw new Phase3ValidationError("Investigation not found.");
  const type = body.evidenceType as EvidenceType; const id = String(body.evidenceId || ""); const allowed: EvidenceType[] = ["source_document","document_version","reporting_period","financial_entry","source_financial_entry","account_mapping","add_back","diligence_issue"];
  if (!allowed.includes(type) || !id) throw new Phase3ValidationError("Valid evidence type and ID are required."); const label = await validateEvidence(companyId, type, id);
  const result = await getSupabaseServerClient().from("investigation_evidence").upsert({ investigation_id: investigationId, evidence_type: type, evidence_id: id, relationship: body.relationship || "supports", label_snapshot: label, attached_by_user_id: actor.userId, attached_by_name: actor.name }, { onConflict: "investigation_id,evidence_type,evidence_id,relationship" }).select(EVIDENCE_SELECT).single<InvestigationEvidenceRow>(); if (result.error) throw result.error;
  await appendActivity({ phaseId: workflow.phase.id, subjectType: "evidence", subjectId: result.data.id, eventType: "evidence_attached", metadata: { investigationId, evidenceType: type, evidenceId: id }, actor }); return result.data;
}

export async function detachPhase3Evidence(companyId: string, investigationId: string, evidenceLinkId: string) { const actor = await resolvePhase3Actor(); const workflow = await requirePhase(companyId); const link = workflow.evidence.find((item) => item.id === evidenceLinkId && item.investigation_id === investigationId); if (!link) throw new Phase3ValidationError("Evidence link not found."); const { error } = await getSupabaseServerClient().from("investigation_evidence").delete().eq("id", evidenceLinkId).eq("investigation_id", investigationId); if (error) throw error; await appendActivity({ phaseId: workflow.phase.id, subjectType: "evidence", subjectId: evidenceLinkId, eventType: "evidence_detached", metadata: { investigationId, evidenceType: link.evidence_type, evidenceId: link.evidence_id }, actor }); }

export async function promotePhase3Investigation(companyId: string, id: string, body: Record<string, unknown>) { const actor = await resolvePhase3Actor(); const { data, error } = await getSupabaseServerClient().rpc("promote_phase3_investigation", { p_company_id: companyId, p_investigation_id: id, p_expected_version: body.version, p_category: body.category || "other", p_severity: body.severity || "medium", p_actor_name: actor.name }).single<{issue_id:string;already_promoted:boolean}>(); if (error) { if (error.code === "40001" || error.message.includes("stale version")) throw new Phase3ConflictError("Investigation was updated by another session."); throw error; } return { issueId: data.issue_id, issueHref: `/deal/${companyId}?view=issues&issueId=${data.issue_id}`, alreadyPromoted: data.already_promoted }; }

export async function setPhase3Waiver(companyId: string, id: string, approve: boolean, rationale: string) { const actor = await resolvePhase3Actor(); const workflow = await requirePhase(companyId); const item = workflow.investigations.find((candidate) => candidate.id === id); if (!item || item.disposition !== "immaterial") throw new Phase3ValidationError("Only immaterial investigations can receive waiver decisions."); if (!rationale.trim()) throw new Phase3ValidationError("Reviewer rationale is required."); await appendActivity({ phaseId: workflow.phase.id, subjectType: "investigation", subjectId: id, eventType: approve ? "investigation_waiver_approved" : "investigation_waiver_revoked", rationale, actor }); }

export async function transitionPhase3Review(companyId: string, action: "submit"|"request_changes"|"approve"|"reopen", body: Record<string, unknown>, financial: Phase3FinancialReadiness) {
  const actor = await resolvePhase3Actor(); const workflow = await requirePhase(companyId); if (body.version !== workflow.phase.version) throw new Phase3ConflictError("Phase was updated by another session."); const derived = derivePhase3WorkflowState(workflow, financial); const now = new Date().toISOString(); const updates: Record<string, unknown> = { version: workflow.phase.version + 1, updated_at: now }; let eventType = ""; let next: DealPhaseRow["status"];
  if (action === "submit") { if (!["in_progress","changes_requested"].includes(workflow.phase.status)) throw new Phase3ConflictError("Phase cannot be submitted from its current state."); if (!derived.reviewEligible) throw new Phase3ConflictError(derived.gateFailures.join(" ")); next = "awaiting_review"; eventType = "phase_submitted"; Object.assign(updates,{submitted_by_name:actor.name,submitted_at:now,completion_basis:derived}); }
  else if (action === "request_changes") { if (workflow.phase.status !== "awaiting_review") throw new Phase3ConflictError("Changes can only be requested during review."); if (!String(body.rationale||"").trim()) throw new Phase3ValidationError("Rationale is required."); next="changes_requested"; eventType="changes_requested"; Object.assign(updates,{reviewed_by_name:actor.name,reviewed_at:now,reviewer_decision:"changes_requested",reviewer_rationale:String(body.rationale)}); }
  else if (action === "approve") { if (workflow.phase.status !== "awaiting_review") throw new Phase3ConflictError("Only an awaiting-review phase can be approved."); if (!derived.completionEligible) throw new Phase3ConflictError(derived.completionFailures.join(" ")); next="complete"; eventType="phase_approved"; Object.assign(updates,{reviewed_by_name:actor.name,reviewed_at:now,reviewer_decision:"approved",reviewer_rationale:String(body.rationale||"").trim()||null,completion_basis:derived}); }
  else { if (workflow.phase.status !== "complete") throw new Phase3ConflictError("Only a complete phase can be reopened."); if (!String(body.rationale||"").trim()) throw new Phase3ValidationError("Rationale is required."); next="in_progress"; eventType="phase_reopened"; Object.assign(updates,{reopened_at:now,reviewer_decision:null,reviewer_rationale:null}); }
  updates.status=next; const result=await getSupabaseServerClient().from("deal_phases").update(updates).eq("id",workflow.phase.id).eq("version",workflow.phase.version).select(PHASE_SELECT).maybeSingle<DealPhaseRow>(); if(result.error)throw result.error;if(!result.data)throw new Phase3ConflictError("Phase was updated by another session."); await appendActivity({phaseId:workflow.phase.id,subjectType:"phase",subjectId:workflow.phase.id,eventType,fromState:workflow.phase.status,toState:next,rationale:String(body.rationale||"").trim()||null,actor});return result.data;
}

export async function addPhase3ReviewComment(companyId: string, comment: string) { const actor=await resolvePhase3Actor();const workflow=await requirePhase(companyId);if(!comment.trim())throw new Phase3ValidationError("Comment is required.");await appendActivity({phaseId:workflow.phase.id,subjectType:"phase",subjectId:workflow.phase.id,eventType:"review_comment_added",commentText:comment.trim(),actor}); }
