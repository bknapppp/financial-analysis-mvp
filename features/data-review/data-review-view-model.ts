import type { Company, DashboardData, SourceDocument } from "@/lib/types";
import { buildDealShellViewModel, type DealShellViewModel } from "@/lib/view-models/deal-shell";

export type ReviewTone = "success" | "warning" | "danger" | "informational" | "neutral";
export type DatasetState = "Ready" | "Needs review" | "Blocked";
export type MappingState = "Complete" | "Exceptions" | "Not started";
export type ReconciliationState = "Reconciled" | "Variance" | "Pending";
export type AnalysisState = "Not started" | "In progress" | "Investigating" | "Complete" | "Reviewer attention";
export type InvestigationStatus = "Open" | "In progress" | "Ready for review" | "Closed";
export type InvestigationPriority = "Critical" | "High" | "Medium" | "Low";
export type InvestigationDisposition = "Undispositioned" | "Resolved" | "Immaterial / below threshold" | "Adjustment proposed" | "Further support required" | "Promote to finding";

export type DatasetProjection = {
  id: string; name: string; workstream: string; sourceContext: string; document: string;
  structure: DatasetState; mapping: MappingState; reconciliation: ReconciliationState;
  analysis: AnalysisState; owner: string; reviewer: string; lastActivity: string;
  actionLabel: string; actionHref: string; critical: boolean;
};
export type AnalysisProcedure = {
  id: string; name: string; workstream: string; owner: string; reviewer: string;
  status: AnalysisState; result: string; openInvestigations: number; workpaper: string;
  lastActivity: string; href: string;
};
export type Investigation = {
  id: string; title: string; signal: string; procedureId: string; owner: string;
  priority: InvestigationPriority; status: InvestigationStatus; notes: string;
  conclusion: string; disposition: InvestigationDisposition; relatedReference: string;
};
export type WorkpaperReference = {
  id: string; name: string; procedureId: string; owner: string; reviewer: string;
  version: string; status: "Working" | "Ready for review" | "Reviewed"; dataset: string;
};
export type ReviewActivity = { id: string; title: string; detail: string; actor: string; timestamp: string };

export type DataReviewPageViewModel = {
  shell: DealShellViewModel; isPreview: boolean; phaseStatus: string; completionPercent: number;
  owners: string[]; datasets: DatasetProjection[]; procedures: AnalysisProcedure[];
  investigations: Investigation[]; workpapers: WorkpaperReference[]; activity: ReviewActivity[];
  authoritative: {
    documentCount: number; periodCount: number; entryCount: number; mappingCoverage: number;
    mappingExceptions: number; reconciliationFailures: number; proposedAdjustments: number;
    acceptedAdjustments: number; rejectedAdjustments: number; proposedImpact: number;
    openFormalIssues: number; readinessLabel: string;
  };
  links: { sourceData: string; financials: string; underwriting: string; issues: string; export: string };
};

export function calculateDataReviewCompletion(
  procedures: AnalysisProcedure[],
  investigations: Investigation[]
) {
  if (procedures.length === 0) return 0;
  const completedProcedures = procedures.filter((item) => item.status === "Complete").length;
  const reviewerReadyProcedures = procedures.filter((item) => item.status === "Reviewer attention").length;
  const dispositionedInvestigations = investigations.filter(
    (item) => item.status === "Closed" || item.disposition !== "Undispositioned"
  ).length;
  const earned = completedProcedures + reviewerReadyProcedures * 0.8 + dispositionedInvestigations * 0.25;
  const possible = procedures.length + investigations.length * 0.25;
  return Math.round((earned / possible) * 100);
}

const previewCompany: Company = { id: "preview", name: "Northstar Industrial Services", deal_name: "Project Northstar — FDD", deal_type: "Buy-side financial due diligence", status: "Diligence", industry: "Industrial services", base_currency: "USD", stage: "diligence", stage_updated_at: "2026-08-18T14:30:00.000Z", stage_notes: null, created_at: "2026-08-04T13:00:00.000Z" };
const owners = ["Maya Chen", "Daniel Ross", "Priya Shah", "Jordan Lee"];

function links(companyId: string) {
  return {
    sourceData: `/source-data?companyId=${companyId}`,
    financials: `/financials?companyId=${companyId}`,
    underwriting: `/deal/${companyId}/underwriting`,
    issues: `/deal/${companyId}?view=issues`,
    export: `/api/deals/${companyId}/export`
  };
}
function documentName(document?: SourceDocument) {
  return document?.name ?? document?.source_file_name ?? "No document linked";
}
function formatDate(value?: string | null) {
  if (!value) return "No recent activity";
  const date = new Date(value); if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
function previewDatasets(companyId: string): DatasetProjection[] {
  const source = `/source-data?companyId=${companyId}`;
  const financials = `/financials?companyId=${companyId}`;
  return [
    { id: "ds-pnl", name: "Monthly P&L", workstream: "Quality of earnings", sourceContext: "IR-001 · Trial balance & P&L", document: "Northstar_Trial_Balance_Jul26.xlsx", structure: "Ready", mapping: "Exceptions", reconciliation: "Variance", analysis: "Investigating", owner: "Maya Chen", reviewer: "Jordan Lee", lastActivity: "Today, 10:26 AM", actionLabel: "Resolve mapping", actionHref: `${source}#mapping`, critical: true },
    { id: "ds-revenue", name: "Revenue detail", workstream: "Revenue & customers", sourceContext: "IR-002 · Monthly revenue detail", document: "Revenue_by_Customer_FY24-LTM.xlsx", structure: "Ready", mapping: "Complete", reconciliation: "Reconciled", analysis: "In progress", owner: "Daniel Ross", reviewer: "Maya Chen", lastActivity: "Today, 9:48 AM", actionLabel: "Open Financials", actionHref: financials, critical: true },
    { id: "ds-customer", name: "Customer master", workstream: "Revenue & customers", sourceContext: "IR-003 · Customer master & contracts", document: "No document linked", structure: "Blocked", mapping: "Not started", reconciliation: "Pending", analysis: "Not started", owner: "Daniel Ross", reviewer: "Maya Chen", lastActivity: "Follow-up due Aug 23", actionLabel: "Open Source Data", actionHref: source, critical: true },
    { id: "ds-payroll", name: "Payroll population", workstream: "Quality of earnings", sourceContext: "IR-004 · Payroll register", document: "Payroll_Register_LTM.xlsx", structure: "Needs review", mapping: "Exceptions", reconciliation: "Pending", analysis: "Not started", owner: "Priya Shah", reviewer: "Maya Chen", lastActivity: "Yesterday, 4:12 PM", actionLabel: "Review structure", actionHref: source, critical: false },
    { id: "ds-debt", name: "Debt schedule", workstream: "Debt-like items", sourceContext: "IR-005 · Debt & leases", document: "Debt_and_Lease_Schedule.xlsx", structure: "Ready", mapping: "Complete", reconciliation: "Reconciled", analysis: "Reviewer attention", owner: "Priya Shah", reviewer: "Jordan Lee", lastActivity: "Yesterday, 2:06 PM", actionLabel: "Open Underwriting", actionHref: `/deal/${companyId}/underwriting`, critical: true },
    { id: "ds-bs", name: "Balance sheet", workstream: "Working capital", sourceContext: "Derived · Canonical financials", document: "Northstar_Trial_Balance_Jul26.xlsx", structure: "Ready", mapping: "Complete", reconciliation: "Variance", analysis: "Investigating", owner: "Priya Shah", reviewer: "Maya Chen", lastActivity: "Aug 22, 2026", actionLabel: "Review variance", actionHref: financials, critical: true },
    { id: "ds-tax", name: "Tax-return population", workstream: "Quality of earnings", sourceContext: "Source document · Tax returns", document: "Northstar_2025_Tax_Return.pdf", structure: "Ready", mapping: "Complete", reconciliation: "Variance", analysis: "In progress", owner: "Maya Chen", reviewer: "Jordan Lee", lastActivity: "Aug 21, 2026", actionLabel: "Open reconciliation", actionHref: `${source}#reconciliation`, critical: false }
  ];
}
function procedures(companyId: string): AnalysisProcedure[] {
  const financials = `/financials?companyId=${companyId}`;
  const source = `/source-data?companyId=${companyId}`;
  const underwriting = `/deal/${companyId}/underwriting`;
  return [
    { id: "proc-pnl", name: "Historical P&L review", workstream: "Quality of earnings", owner: "Maya Chen", reviewer: "Jordan Lee", status: "In progress", result: "LTM revenue growth is positive; margin bridge remains under review.", openInvestigations: 2, workpaper: "Northstar_QoE_Model_v03.xlsx", lastActivity: "Today, 10:26 AM", href: financials },
    { id: "proc-trend", name: "Margin and trend analysis", workstream: "Revenue & customers", owner: "Daniel Ross", reviewer: "Maya Chen", status: "Investigating", result: "Gross-margin expansion exceeds the 5% planning threshold.", openInvestigations: 1, workpaper: "Revenue_Cube_v02.xlsx", lastActivity: "Today, 9:48 AM", href: financials },
    { id: "proc-bs", name: "Balance-sheet validation", workstream: "Working capital", owner: "Priya Shah", reviewer: "Maya Chen", status: "Investigating", result: "Control difference requires disposition before review.", openInvestigations: 1, workpaper: "Working_Capital_Analysis.xlsx", lastActivity: "Yesterday, 5:03 PM", href: financials },
    { id: "proc-source", name: "Reported-to-source reconciliation", workstream: "Financial integrity", owner: "Priya Shah", reviewer: "Maya Chen", status: "In progress", result: "Five populations loaded; two reconciliation exceptions remain.", openInvestigations: 2, workpaper: "Source_Reconciliation.xlsx", lastActivity: "Yesterday, 4:12 PM", href: `${source}#reconciliation` },
    { id: "proc-tax", name: "Reported-to-tax reconciliation", workstream: "Quality of earnings", owner: "Maya Chen", reviewer: "Jordan Lee", status: "In progress", result: "Tax revenue is aligned; EBITDA classification difference remains.", openInvestigations: 1, workpaper: "Tax_Reconciliation.xlsx", lastActivity: "Aug 21, 2026", href: `${source}#reconciliation` },
    { id: "proc-ebitda", name: "EBITDA normalization & add-backs", workstream: "Quality of earnings", owner: "Maya Chen", reviewer: "Jordan Lee", status: "Reviewer attention", result: "Three proposed adjustments require support and reviewer disposition.", openInvestigations: 2, workpaper: "Northstar_QoE_Model_v03.xlsx", lastActivity: "Today, 8:35 AM", href: underwriting },
    { id: "proc-quality", name: "Data quality & mapping completeness", workstream: "Financial integrity", owner: "Priya Shah", reviewer: "Maya Chen", status: "In progress", result: "Mapping coverage is sufficient for analysis with targeted exceptions.", openInvestigations: 1, workpaper: "Mapping_Review_Log.xlsx", lastActivity: "Aug 22, 2026", href: `${source}#mapping` }
  ];
}
function investigations(): Investigation[] {
  return [
    { id: "INV-001", title: "Resolve monthly P&L source variance", signal: "$42K reconciliation difference exceeds P&L materiality", procedureId: "proc-source", owner: "Maya Chen", priority: "High", status: "In progress", notes: "Trace difference to late journal entries and confirm source cut-off.", conclusion: "", disposition: "Undispositioned", relatedReference: "Source_Reconciliation.xlsx" },
    { id: "INV-002", title: "Assess gross-margin expansion", signal: "LTM margin increased 640 bps, above the 5% variance threshold", procedureId: "proc-trend", owner: "Daniel Ross", priority: "High", status: "Open", notes: "Separate price, volume, product mix, and input-cost effects.", conclusion: "", disposition: "Undispositioned", relatedReference: "Revenue_Cube_v02.xlsx" },
    { id: "INV-003", title: "Validate owner compensation adjustment", signal: "Proposed EBITDA add-back lacks complete payroll support", procedureId: "proc-ebitda", owner: "Maya Chen", priority: "Critical", status: "Ready for review", notes: "Management representation received; payroll evidence remains partial.", conclusion: "Adjustment is directionally supportable, subject to reviewer sizing.", disposition: "Adjustment proposed", relatedReference: "Northstar_QoE_Model_v03.xlsx" },
    { id: "INV-004", title: "Clear unmapped revenue accounts", signal: "Four revenue accounts remain low-confidence or unmapped", procedureId: "proc-quality", owner: "Priya Shah", priority: "Medium", status: "In progress", notes: "Confirm account usage with controller before saving mapping memory.", conclusion: "", disposition: "Further support required", relatedReference: "Mapping_Review_Log.xlsx" }
  ];
}
function workpapers(): WorkpaperReference[] {
  return [
    { id: "wp-1", name: "Northstar_QoE_Model_v03.xlsx", procedureId: "proc-ebitda", owner: "Maya Chen", reviewer: "Jordan Lee", version: "Firm model · v03", status: "Ready for review", dataset: "Monthly P&L" },
    { id: "wp-2", name: "Revenue_Cube_v02.xlsx", procedureId: "proc-trend", owner: "Daniel Ross", reviewer: "Maya Chen", version: "Firm template · v02", status: "Working", dataset: "Revenue detail" },
    { id: "wp-3", name: "Source_Reconciliation.xlsx", procedureId: "proc-source", owner: "Priya Shah", reviewer: "Maya Chen", version: "Client support · v01", status: "Working", dataset: "Monthly P&L" }
  ];
}
function activity(): ReviewActivity[] { return [
  { id: "a1", title: "Investigation assigned", detail: "INV-001 assigned to Maya Chen for source-variance resolution.", actor: "Maya Chen", timestamp: "Today, 10:31 AM" },
  { id: "a2", title: "Adjustment prepared for review", detail: "Owner compensation adjustment moved to reviewer attention.", actor: "Maya Chen", timestamp: "Today, 8:35 AM" },
  { id: "a3", title: "Revenue procedure updated", detail: "Gross-margin threshold exception documented in Revenue_Cube_v02.xlsx.", actor: "Daniel Ross", timestamp: "Yesterday, 5:18 PM" }
]; }

function baseModel(company: Company, isPreview: boolean): DataReviewPageViewModel {
  const datasets = previewDatasets(company.id); const baseProcedures = procedures(company.id);
  const baseInvestigations = investigations();
  const completionPercent = calculateDataReviewCompletion(baseProcedures, baseInvestigations);
  return {
    shell: buildDealShellViewModel({ company, requestedSection: "data-review", context: "data-review", progressPercent: completionPercent, progressLabel: "Analysis phase completion", progressIsPreview: true }),
    isPreview, phaseStatus: "In progress", completionPercent, owners, datasets, procedures: baseProcedures,
    investigations: baseInvestigations, workpapers: workpapers(), activity: activity(),
    authoritative: { documentCount: 5, periodCount: 4, entryCount: 328, mappingCoverage: 94, mappingExceptions: 7, reconciliationFailures: 2, proposedAdjustments: 3, acceptedAdjustments: 1, rejectedAdjustments: 1, proposedImpact: 385000, openFormalIssues: 4, readinessLabel: "Use with caution" },
    links: links(company.id)
  };
}

export function buildDataReviewPreviewViewModel() { return baseModel(previewCompany, true); }
export function buildDataReviewPageViewModel(data: DashboardData): DataReviewPageViewModel | null {
  if (!data.company) return null;
  const model = baseModel(data.company, false); const docs = data.documents;
  const byType = (type: SourceDocument["document_type"]) => docs.find((doc) => doc.document_type === type);
  const source = model.links.sourceData; const financials = model.links.financials;
  const mappingExceptions = data.entries.filter((entry) => !entry.confidence || entry.confidence === "low").length;
  const liveDatasets = model.datasets.map((row) => {
    const doc = row.id === "ds-tax" ? byType("tax_return") : row.id === "ds-debt" ? byType("debt_schedule") : row.id === "ds-payroll" ? byType("payroll_report") : row.id === "ds-bs" ? byType("balance_sheet") : byType("income_statement") ?? docs[0];
    const hasDocument = Boolean(doc); const hasEntries = data.entries.length > 0;
    return { ...row, document: documentName(doc), lastActivity: formatDate(doc?.uploaded_at), structure: hasDocument ? (hasEntries ? "Ready" : "Needs review") : "Blocked", mapping: !hasEntries ? "Not started" : mappingExceptions > 0 ? "Exceptions" : "Complete", reconciliation: !hasEntries ? "Pending" : data.reconciliation.status === "failed" ? "Variance" : data.reconciliation.status === "warning" ? "Variance" : "Reconciled", actionHref: !hasDocument || mappingExceptions > 0 ? source : financials } as DatasetProjection;
  });
  const proposed = data.addBackReviewItems.filter((item) => item.status === "suggested");
  return { ...model, datasets: liveDatasets, authoritative: { documentCount: docs.length, periodCount: data.periods.length, entryCount: data.entries.length, mappingCoverage: Math.round(data.dataQuality.mappingCoveragePercent), mappingExceptions, reconciliationFailures: data.reconciliation.status === "reconciled" ? 0 : data.reconciliation.issues.filter((issue) => issue.severity !== "info").length, proposedAdjustments: proposed.length, acceptedAdjustments: data.addBackReviewItems.filter((item) => item.status === "accepted").length, rejectedAdjustments: data.addBackReviewItems.filter((item) => item.status === "rejected").length, proposedImpact: proposed.reduce((sum, item) => sum + item.amount, 0), openFormalIssues: data.diligenceIssues.filter((item) => item.status === "open" || item.status === "in_review").length, readinessLabel: data.readiness.label } };
}
