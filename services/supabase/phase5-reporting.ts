import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase";
import { getPhase5FindingProjection } from "@/services/supabase/phase4-workflow";
import { resolvePhase3Actor } from "@/services/supabase/phase3-workflow";
import type {
  ReportSectionCompletionBasis,
  ReportSectionStatus,
  ReportingFindingLinkState,
  ReportingSectionState
} from "@/features/reporting/reporting-workflow";

export class Phase5ConflictError extends Error {}
export class Phase5ValidationError extends Error {}

export type ReportingReportRow = {
  id: string;
  company_id: string;
  phase_id: string;
  title: string;
  report_type: string;
  template_key: string;
  owner_name: string | null;
  reviewer_name: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ReportingSectionRow = {
  id: string;
  report_id: string;
  section_key: string;
  title: string;
  sort_order: number;
  status: ReportSectionStatus;
  narrative: string | null;
  completion_basis: ReportSectionCompletionBasis;
  unavailable_reason: string | null;
  owner_name: string | null;
  reviewer_name: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};

export type ReportingFindingLinkRow = {
  report_section_id: string;
  issue_id: string;
  sort_order: number;
  expected_approved_version: number;
  linked_by_name: string;
  created_at: string;
};

export type ReportingWorkflow = {
  phase: Record<string, unknown>;
  report: ReportingReportRow | null;
  sections: ReportingSectionRow[];
  links: ReportingFindingLinkRow[];
  activity: Record<string, unknown>[];
};

const REPORT_SELECT = "id,company_id,phase_id,title,report_type,template_key,owner_name,reviewer_name,version,created_at,updated_at";
const SECTION_SELECT = "id,report_id,section_key,title,sort_order,status,narrative,completion_basis,unavailable_reason,owner_name,reviewer_name,version,created_at,updated_at";
const LINK_SELECT = "report_section_id,issue_id,sort_order,expected_approved_version,linked_by_name,created_at";

export async function getReportingWorkflow(companyId: string): Promise<ReportingWorkflow | null> {
  const db = getSupabaseServerClient();
  const phaseResult = await db.from("deal_phases").select("*")
    .eq("company_id", companyId).eq("phase_key", "reporting").maybeSingle();
  if (phaseResult.error) throw phaseResult.error;
  if (!phaseResult.data) {
    const schemaProbe = await db.from("reports").select("id").limit(1);
    if (schemaProbe.error) throw schemaProbe.error;
    return null;
  }

  const [reportResult, activityResult] = await Promise.all([
    db.from("reports").select(REPORT_SELECT).eq("company_id", companyId)
      .eq("phase_id", phaseResult.data.id).maybeSingle<ReportingReportRow>(),
    db.from("phase_activity").select("*").eq("phase_id", phaseResult.data.id)
      .order("created_at", { ascending: false }).limit(100)
  ]);
  if (reportResult.error) throw reportResult.error;
  if (activityResult.error) throw activityResult.error;
  if (!reportResult.data) {
    return { phase: phaseResult.data, report: null, sections: [], links: [], activity: activityResult.data ?? [] };
  }

  const sectionsResult = await db.from("report_sections").select(SECTION_SELECT)
    .eq("report_id", reportResult.data.id).order("sort_order").returns<ReportingSectionRow[]>();
  if (sectionsResult.error) throw sectionsResult.error;
  const sectionIds = (sectionsResult.data ?? []).map((section) => section.id);
  const linksResult = sectionIds.length
    ? await db.from("report_section_findings").select(LINK_SELECT)
        .in("report_section_id", sectionIds).order("sort_order").returns<ReportingFindingLinkRow[]>()
    : { data: [] as ReportingFindingLinkRow[], error: null };
  if (linksResult.error) throw linksResult.error;
  return {
    phase: phaseResult.data,
    report: reportResult.data,
    sections: sectionsResult.data ?? [],
    links: linksResult.data ?? [],
    activity: activityResult.data ?? []
  };
}

async function appendReportingActivity(params: {
  phaseId: string;
  subjectType: "report" | "report_section";
  subjectId: string;
  eventType: "report_section_updated" | "report_finding_linked" | "report_finding_unlinked";
  metadata?: Record<string, unknown>;
}) {
  const actor = await resolvePhase3Actor();
  const { error } = await getSupabaseServerClient().from("phase_activity").insert({
    phase_id: params.phaseId,
    subject_type: params.subjectType,
    subject_id: params.subjectId,
    event_type: params.eventType,
    actor_user_id: actor.userId,
    actor_name: actor.name,
    metadata: params.metadata ?? {}
  });
  if (error) throw error;
}

async function requireReportingWorkflow(companyId: string): Promise<ReportingWorkflow & { report: ReportingReportRow }> {
  const workflow = await getReportingWorkflow(companyId);
  if (!workflow?.report) throw new Phase5ValidationError("Reporting is not initialized.");
  return workflow as ReportingWorkflow & { report: ReportingReportRow };
}

export async function initializePhase5Reporting(companyId: string) {
  const actor = await resolvePhase3Actor();
  const { error } = await getSupabaseServerClient().rpc("initialize_phase5_reporting", {
    p_company_id: companyId,
    p_actor_name: actor.name
  });
  if (error) throw error;
  return getReportingWorkflow(companyId);
}

export async function updateReportingSection(companyId: string, sectionId: string, body: Record<string, unknown>) {
  const actor = await resolvePhase3Actor();
  const workflow = await requireReportingWorkflow(companyId);
  const section = workflow.sections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Phase5ValidationError("Report section does not belong to this deal.");
  if (body.version !== section.version) throw new Phase5ConflictError("Report section was updated by another session.");
  const status = String(body.status ?? section.status) as ReportSectionStatus;
  if (!["not_started", "in_progress", "complete"].includes(status)) throw new Phase5ValidationError("Invalid report section status.");
  const completionBasis = (body.completionBasis ?? section.completion_basis ?? null) as ReportSectionCompletionBasis;
  if (completionBasis && !["narrative", "authoritative", "unavailable"].includes(completionBasis)) {
    throw new Phase5ValidationError("Invalid section completion basis.");
  }
  const narrative = body.narrative === undefined ? section.narrative : String(body.narrative).trim() || null;
  const unavailableReason = body.unavailableReason === undefined
    ? section.unavailable_reason
    : String(body.unavailableReason).trim() || null;
  if (status === "complete" && completionBasis === "narrative" && !narrative) {
    throw new Phase5ValidationError("Narrative completion requires controlled analyst narrative.");
  }
  if (status === "complete" && completionBasis === "unavailable" && !unavailableReason) {
    throw new Phase5ValidationError("Unavailable completion requires a limitation reason.");
  }
  if (status === "complete" && !completionBasis) throw new Phase5ValidationError("Complete sections require a supported completion basis.");
  const result = await getSupabaseServerClient().from("report_sections").update({
    status,
    narrative,
    completion_basis: completionBasis,
    unavailable_reason: unavailableReason,
    owner_name: body.ownerName === undefined ? section.owner_name : String(body.ownerName).trim() || null,
    reviewer_name: body.reviewerName === undefined ? section.reviewer_name : String(body.reviewerName).trim() || null,
    updated_by_user_id: actor.userId,
    updated_by_name: actor.name,
    version: section.version + 1,
    updated_at: new Date().toISOString()
  }).eq("id", section.id).eq("report_id", workflow.report.id).eq("version", section.version)
    .select(SECTION_SELECT).maybeSingle<ReportingSectionRow>();
  if (result.error) throw result.error;
  if (!result.data) throw new Phase5ConflictError("Report section was updated by another session.");
  await appendReportingActivity({
    phaseId: String(workflow.phase.id), subjectType: "report_section", subjectId: section.id,
    eventType: "report_section_updated", metadata: { status, completionBasis }
  });
  return result.data;
}

export async function linkReportingFinding(companyId: string, sectionId: string, issueId: string) {
  const actor = await resolvePhase3Actor();
  const workflow = await requireReportingWorkflow(companyId);
  const section = workflow.sections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Phase5ValidationError("Report section does not belong to this deal.");
  const projection = await getPhase5FindingProjection(companyId);
  const finding = projection.find((candidate) => candidate.issueId === issueId);
  if (!finding || finding.version !== finding.approvedVersion) {
    throw new Phase5ValidationError("Only current approved Phase 4 reporting findings can be linked.");
  }
  if (workflow.links.some((link) => link.report_section_id === sectionId && link.issue_id === issueId)) {
    throw new Phase5ConflictError("Finding is already linked to this section.");
  }
  const sortOrder = workflow.links.filter((link) => link.report_section_id === sectionId).length + 1;
  const result = await getSupabaseServerClient().from("report_section_findings").insert({
    report_section_id: sectionId,
    issue_id: issueId,
    sort_order: sortOrder,
    expected_approved_version: finding.approvedVersion,
    linked_by_user_id: actor.userId,
    linked_by_name: actor.name
  }).select(LINK_SELECT).single<ReportingFindingLinkRow>();
  if (result.error) {
    if (result.error.code === "23505") throw new Phase5ConflictError("Finding is already linked to this section.");
    throw result.error;
  }
  await appendReportingActivity({
    phaseId: String(workflow.phase.id), subjectType: "report_section", subjectId: sectionId,
    eventType: "report_finding_linked", metadata: { issueId, expectedApprovedVersion: finding.approvedVersion }
  });
  return result.data;
}

export async function unlinkReportingFinding(companyId: string, sectionId: string, issueId: string) {
  const workflow = await requireReportingWorkflow(companyId);
  const section = workflow.sections.find((candidate) => candidate.id === sectionId);
  const link = workflow.links.find((candidate) => candidate.report_section_id === sectionId && candidate.issue_id === issueId);
  if (!section || !link) throw new Phase5ValidationError("Report finding link does not belong to this deal.");
  const result = await getSupabaseServerClient().from("report_section_findings").delete()
    .eq("report_section_id", sectionId).eq("issue_id", issueId).select("issue_id").maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Phase5ConflictError("Report finding link no longer exists.");
  await appendReportingActivity({
    phaseId: String(workflow.phase.id), subjectType: "report_section", subjectId: sectionId,
    eventType: "report_finding_unlinked", metadata: { issueId }
  });
  return result.data;
}

export function mapReportingSections(sections: ReportingSectionRow[]): ReportingSectionState[] {
  return sections.map((section) => ({
    id: section.id,
    sectionKey: section.section_key,
    title: section.title,
    sortOrder: section.sort_order,
    status: section.status,
    narrative: section.narrative,
    completionBasis: section.completion_basis,
    unavailableReason: section.unavailable_reason,
    version: section.version
  }));
}

export function mapReportingLinks(links: ReportingFindingLinkRow[]): ReportingFindingLinkState[] {
  return links.map((link) => ({
    reportSectionId: link.report_section_id,
    issueId: link.issue_id,
    expectedApprovedVersion: link.expected_approved_version,
    sortOrder: link.sort_order
  }));
}
