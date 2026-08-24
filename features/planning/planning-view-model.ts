import { buildDealShellViewModel, type DealShellViewModel } from "@/lib/view-models/deal-shell";
import type { Company, DashboardData } from "@/lib/types";

export type PlanningTone = "success" | "warning" | "danger" | "informational" | "neutral";

export type PlanningChecklistItem = {
  id: string;
  task: string;
  owner: string;
  status: "Complete" | "In progress" | "Not started";
  dueDate: string;
};

export type PlanningPageViewModel = {
  shell: DealShellViewModel;
  isPreview: boolean;
  status: string;
  statusTone: PlanningTone;
  completionPercent: number;
  engagement: {
    objective: string;
    dealOverview: string;
    targetDraft: string;
    scope: string[];
    outOfScope: string[];
    diligenceAreas: Array<{ area: string; lead: string; focus: string; status: string; tone: PlanningTone }>;
  };
  team: Array<{ initials: string; name: string; role: string; ownership: string; capacity: string }>;
  thresholds: Array<{ label: string; value: string; type: "Currency" | "Percentage" | "Count" | "Other"; application: string }>;
  milestones: Array<{ milestone: string; owner: string; date: string; status: string; tone: PlanningTone }>;
  checklist: PlanningChecklistItem[];
  requirements: Array<{ item: string; category: string; priority: string; owner: string; status: string; tone: PlanningTone }>;
  risks: Array<{ title: string; severity: string; rationale: string; owner: string; status: string; tone: PlanningTone }>;
  workpapers: Array<{ name: string; type: string; owner: string; updated: string; status: string; source: string }>;
  approval: Array<{ step: string; reviewer: string; status: string; date: string; tone: PlanningTone }>;
  activity: Array<{ title: string; detail: string; actor: string; timestamp: string }>;
  links: { upload: string; overview: string };
};

const previewCompany: Company = {
  id: "preview",
  name: "Northstar Industrial Services",
  deal_name: "Project Northstar — FDD",
  deal_type: "Buy-side financial due diligence",
  status: "Diligence",
  industry: "Industrial services",
  base_currency: "USD",
  stage: "diligence",
  stage_updated_at: "2026-08-18T14:30:00.000Z",
  stage_notes: null,
  created_at: "2026-08-04T13:00:00.000Z"
};

function formatDocumentDate(value: string | null) {
  if (!value) return "Date unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function baseModel(company: Company, isPreview: boolean): PlanningPageViewModel {
  const companyId = company.id;
  return {
    shell: buildDealShellViewModel({
      company,
      requestedSection: "planning",
      context: "planning",
      progressPercent: 42,
      progressLabel: "Planning phase completion",
      progressIsPreview: isPreview
    }),
    isPreview,
    status: "In progress",
    statusTone: "informational",
    completionPercent: 42,
    engagement: {
      objective: "Establish the quality and sustainability of earnings, validate cash conversion, and identify transaction adjustments that may affect valuation or purchase agreement mechanics.",
      dealOverview: `${company.deal_name?.trim() || company.name} is a ${company.deal_type?.toLowerCase() || "financial due diligence"} engagement for ${company.name}. The team will coordinate analysis in Broadstone while retaining the client’s Excel models and established workpaper formats.`,
      targetDraft: "2026-09-11",
      scope: ["Quality of earnings and EBITDA normalization", "Revenue, customer, and margin analysis", "Working capital and debt-like items", "Cash flow, capex, and balance-sheet review"],
      outOfScope: ["Tax structuring and tax compliance", "Legal, commercial, and operational diligence"],
      diligenceAreas: [
        { area: "Quality of earnings", lead: "Maya Chen", focus: "Reported-to-adjusted EBITDA bridge", status: "In progress", tone: "informational" },
        { area: "Revenue & customers", lead: "Daniel Ross", focus: "Concentration, retention, pricing and mix", status: "Ready", tone: "success" },
        { area: "Working capital", lead: "Priya Shah", focus: "Seasonality and normalized peg", status: "Not started", tone: "neutral" },
        { area: "Debt-like items", lead: "Maya Chen", focus: "Net debt and off-balance-sheet exposures", status: "Scoping", tone: "warning" }
      ]
    },
    team: [
      { initials: "MC", name: "Maya Chen", role: "Engagement manager", ownership: "Overall delivery, QoE and review", capacity: "Lead" },
      { initials: "DR", name: "Daniel Ross", role: "Senior associate", ownership: "Revenue and customer analyses", capacity: "80%" },
      { initials: "PS", name: "Priya Shah", role: "Associate", ownership: "Working capital and debt-like items", capacity: "100%" },
      { initials: "JL", name: "Jordan Lee", role: "Partner", ownership: "Executive review and approval", capacity: "Reviewer" }
    ],
    thresholds: [
      { label: "P&L materiality", value: "$250k", type: "Currency", application: "Individual EBITDA adjustments and findings" },
      { label: "Balance-sheet threshold", value: "$500k", type: "Currency", application: "Net debt and working-capital items" },
      { label: "Variance threshold", value: "5.0%", type: "Percentage", application: "Period and budget variance investigation" },
      { label: "Customer concentration", value: "10.0%", type: "Percentage", application: "Customers requiring individual analysis" }
    ],
    milestones: [
      { milestone: "Kickoff and scope confirmation", owner: "Maya Chen", date: "Aug 18, 2026", status: "Complete", tone: "success" },
      { milestone: "Initial data-room population", owner: "Client CFO", date: "Aug 24, 2026", status: "At risk", tone: "warning" },
      { milestone: "First findings readout", owner: "Maya Chen", date: "Sep 4, 2026", status: "Planned", tone: "neutral" },
      { milestone: "Draft report to deal team", owner: "Jordan Lee", date: "Sep 11, 2026", status: "Planned", tone: "neutral" }
    ],
    checklist: [
      { id: "scope", task: "Confirm engagement objectives and transaction mechanics", owner: "MC", status: "Complete", dueDate: "Aug 18" },
      { id: "thesis", task: "Document investment thesis and key diligence questions", owner: "MC", status: "Complete", dueDate: "Aug 19" },
      { id: "scope-memo", task: "Approve scope, exclusions, and periods under review", owner: "JL", status: "In progress", dueDate: "Aug 23" },
      { id: "materiality", task: "Set materiality and investigation thresholds", owner: "MC", status: "In progress", dueDate: "Aug 23" },
      { id: "owners", task: "Assign workstreams and reviewer ownership", owner: "MC", status: "Complete", dueDate: "Aug 20" },
      { id: "calendar", task: "Lock milestones and review cadence", owner: "DR", status: "Not started", dueDate: "Aug 24" }
    ],
    requirements: [
      { item: "Monthly trial balance — 36 months", category: "Financials", priority: "Critical", owner: "Client CFO", status: "Requested", tone: "warning" },
      { item: "Revenue by customer, product and month", category: "Revenue", priority: "Critical", owner: "Controller", status: "Partial", tone: "warning" },
      { item: "A/R and A/P aging at month-end", category: "Working capital", priority: "High", owner: "Controller", status: "Not received", tone: "danger" },
      { item: "Debt, leases and contingent liabilities", category: "Net debt", priority: "High", owner: "Client CFO", status: "Received", tone: "success" }
    ],
    risks: [
      { title: "Customer concentration", severity: "High", rationale: "Top five customers represent approximately 58% of LTM revenue.", owner: "Daniel Ross", status: "Open", tone: "danger" },
      { title: "Margin sustainability", severity: "Medium", rationale: "Recent gross-margin improvement is not yet reconciled to price, mix, or input costs.", owner: "Maya Chen", status: "Assessing", tone: "warning" },
      { title: "Working-capital seasonality", severity: "Medium", rationale: "Proposed reference period may omit the seasonal inventory build.", owner: "Priya Shah", status: "Open", tone: "warning" }
    ],
    workpapers: [
      { name: "Northstar_QoE_Model_v03.xlsx", type: "Client template", owner: "Maya Chen", updated: "Aug 21, 2026", status: "Working", source: "Uploaded" },
      { name: "Revenue_Cube_Template.xlsx", type: "Firm template", owner: "Daniel Ross", updated: "Aug 20, 2026", status: "Ready", source: "Template library" },
      { name: "Planning_Materiality_Memo.docx", type: "Planning memo", owner: "Maya Chen", updated: "Aug 22, 2026", status: "In review", source: "Uploaded" }
    ],
    approval: [
      { step: "Manager scope review", reviewer: "Maya Chen", status: "Approved", date: "Aug 21", tone: "success" },
      { step: "Partner planning approval", reviewer: "Jordan Lee", status: "Pending", date: "Due Aug 23", tone: "warning" },
      { step: "Deal-team scope confirmation", reviewer: "PE deal team", status: "Not started", date: "Due Aug 24", tone: "neutral" }
    ],
    activity: [
      { title: "Materiality threshold updated", detail: "P&L threshold increased from $200k to $250k after manager review.", actor: "Maya Chen", timestamp: "Today, 9:42 AM" },
      { title: "Planning memo submitted for review", detail: "Version 2 linked to the partner approval step.", actor: "Maya Chen", timestamp: "Yesterday, 4:18 PM" },
      { title: "Revenue workstream assigned", detail: "Daniel Ross assigned as preparer; Maya Chen assigned as reviewer.", actor: "Maya Chen", timestamp: "Aug 20, 2:05 PM" }
    ],
    links: { upload: `/source-data?companyId=${companyId}`, overview: `/deal/${companyId}/overview` }
  };
}

export function buildPlanningPreviewViewModel() {
  return baseModel(previewCompany, true);
}

export function buildPlanningPageViewModel(data: DashboardData): PlanningPageViewModel | null {
  if (!data.company) return null;
  const model = baseModel(data.company, false);
  const documents = data.documents.slice(0, 5).map((document) => ({
    name: document.name ?? document.source_file_name ?? "Untitled document",
    type: document.document_type?.replaceAll("_", " ") ?? "Source document",
    owner: document.uploaded_by ?? "Unassigned",
    updated: formatDocumentDate(document.uploaded_at),
    status: document.status === "archived" ? "Archived" : "Available",
    source: document.source_kind ?? "manual"
  }));
  const risks = data.diligenceIssues.slice(0, 5).map((issue) => ({
    title: issue.title,
    severity: issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1),
    rationale: issue.description ?? "Review the linked diligence issue for supporting detail.",
    owner: "Unassigned",
    status: issue.status.replaceAll("_", " "),
    tone: (issue.severity === "critical" || issue.severity === "high" ? "danger" : issue.severity === "medium" ? "warning" : "neutral") as PlanningTone
  }));
  return {
    ...model,
    workpapers: documents.length > 0 ? documents : model.workpapers,
    risks: risks.length > 0 ? risks : model.risks,
    shell: buildDealShellViewModel({ company: data.company, requestedSection: "planning", context: "planning", progressPercent: model.completionPercent, progressLabel: "Planning phase completion", progressIsPreview: true })
  };
}
