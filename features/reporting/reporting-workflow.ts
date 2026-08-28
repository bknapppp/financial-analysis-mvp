import type { Phase5FindingProjection } from "../findings/findings-workflow.ts";

export const REPORT_SECTION_DEFINITIONS = [
  { key: "executive_summary", title: "Executive Summary", order: 1 },
  { key: "qoe_ebitda_bridge", title: "Quality of Earnings / EBITDA Bridge", order: 2 },
  { key: "financial_analysis", title: "Financial Analysis", order: 3 },
  { key: "findings_summary", title: "Findings Summary", order: 4 },
  { key: "deal_implications", title: "Deal Implications", order: 5 },
  { key: "recommendations", title: "Recommendations", order: 6 },
  { key: "limitations_appendices", title: "Limitations and Appendices", order: 7 }
] as const;

export type ReportSectionKey = typeof REPORT_SECTION_DEFINITIONS[number]["key"];
export type ReportSectionStatus = "not_started" | "in_progress" | "complete";
export type ReportSectionCompletionBasis = "narrative" | "authoritative" | "unavailable" | null;
export type ReportingReadinessState =
  | "NOT_INITIALIZED"
  | "BLOCKED_BY_PHASE_4"
  | "READY_TO_COMPOSE"
  | "COMPOSITION_IN_PROGRESS"
  | "STALE_SOURCE"
  | "READY_FOR_REVIEW";

export type ReportingSectionState = {
  id: string;
  sectionKey: string;
  title: string;
  sortOrder: number;
  status: ReportSectionStatus;
  narrative: string | null;
  completionBasis: ReportSectionCompletionBasis;
  unavailableReason: string | null;
  version: number;
};

export type ReportingFindingLinkState = {
  reportSectionId: string;
  issueId: string;
  expectedApprovedVersion: number;
  sortOrder: number;
};

export type StaleReportingLink = ReportingFindingLinkState & {
  reason: "finding_missing_from_projection" | "approved_version_changed";
  currentApprovedVersion: number | null;
};

function sectionHasValidCompletion(
  section: ReportingSectionState,
  financialSourceAvailable: boolean,
  findingSourceAvailable: boolean
) {
  if (section.status !== "complete") return false;
  if (section.completionBasis === "narrative") return Boolean(section.narrative?.trim());
  if (section.completionBasis === "unavailable") return Boolean(section.unavailableReason?.trim());
  if (section.completionBasis !== "authoritative") return false;
  if (["qoe_ebitda_bridge", "financial_analysis"].includes(section.sectionKey)) return financialSourceAvailable;
  if (["findings_summary", "deal_implications", "recommendations"].includes(section.sectionKey)) return findingSourceAvailable;
  if (section.sectionKey === "executive_summary") return financialSourceAvailable || findingSourceAvailable;
  return false;
}

export function detectStaleReportingLinks(
  links: ReportingFindingLinkState[],
  findings: Phase5FindingProjection[]
): StaleReportingLink[] {
  const current = new Map(findings.map((finding) => [finding.issueId, finding]));
  const stale: StaleReportingLink[] = [];
  for (const link of links) {
    const finding = current.get(link.issueId);
    if (!finding) {
      stale.push({ ...link, reason: "finding_missing_from_projection", currentApprovedVersion: null });
      continue;
    }
    if (finding.approvedVersion !== link.expectedApprovedVersion) {
      stale.push({
        ...link,
        reason: "approved_version_changed",
        currentApprovedVersion: finding.approvedVersion
      });
    }
  }
  return stale;
}

export function deriveReportingReadiness(input: {
  initialized: boolean;
  phase4Complete: boolean;
  sections: ReportingSectionState[];
  links: ReportingFindingLinkState[];
  findings: Phase5FindingProjection[];
  financialSourceAvailable: boolean;
}) {
  const expected = new Set(REPORT_SECTION_DEFINITIONS.map((section) => section.key));
  const scaffoldValid = input.sections.length === REPORT_SECTION_DEFINITIONS.length
    && input.sections.every((section) => expected.has(section.sectionKey as ReportSectionKey));
  const staleLinks = detectStaleReportingLinks(input.links, input.findings);
  const completeSections = input.sections.filter((section) =>
    sectionHasValidCompletion(section, input.financialSourceAvailable, input.findings.length > 0)
  ).length;
  const hasComposition = input.links.length > 0 || input.sections.some((section) =>
    section.status !== "not_started" || Boolean(section.narrative?.trim())
  );
  const blockers: string[] = [];

  if (!input.initialized) {
    return {
      state: "NOT_INITIALIZED" as const,
      blockers: ["Initialize Reporting explicitly to create the governed report scaffold."],
      staleLinks,
      scaffoldValid: false,
      completeSections: 0,
      totalSections: REPORT_SECTION_DEFINITIONS.length,
      completionPercent: 0
    };
  }
  if (!scaffoldValid) blockers.push("The governed seven-section report scaffold is incomplete.");
  if (!input.phase4Complete) blockers.push("Phase 4 must be complete with current approved findings.");
  if (staleLinks.length) blockers.push(`${staleLinks.length} linked finding source${staleLinks.length === 1 ? " is" : "s are"} stale.`);
  if (!input.financialSourceAvailable) blockers.push("Authoritative financial outputs are unavailable for reporting.");
  if (completeSections < REPORT_SECTION_DEFINITIONS.length) {
    blockers.push(`${REPORT_SECTION_DEFINITIONS.length - completeSections} governed section${REPORT_SECTION_DEFINITIONS.length - completeSections === 1 ? " remains" : "s remain"} incomplete.`);
  }

  let state: ReportingReadinessState;
  if (staleLinks.length || (!input.phase4Complete && hasComposition)) state = "STALE_SOURCE";
  else if (!input.phase4Complete) state = "BLOCKED_BY_PHASE_4";
  else if (scaffoldValid && completeSections === REPORT_SECTION_DEFINITIONS.length && input.financialSourceAvailable) state = "READY_FOR_REVIEW";
  else if (hasComposition) state = "COMPOSITION_IN_PROGRESS";
  else state = "READY_TO_COMPOSE";

  return {
    state,
    blockers,
    staleLinks,
    scaffoldValid,
    completeSections,
    totalSections: REPORT_SECTION_DEFINITIONS.length,
    completionPercent: Math.round((completeSections / REPORT_SECTION_DEFINITIONS.length) * 100)
  };
}
