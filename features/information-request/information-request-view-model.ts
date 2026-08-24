import type { Company, DashboardData, SourceDocument } from "@/lib/types";
import { buildDealShellViewModel, type DealShellViewModel } from "@/lib/view-models/deal-shell";

export type RequestTone = "success" | "warning" | "danger" | "informational" | "neutral";
export type RequestStatus = "Draft" | "Requested" | "Partially Received" | "Received" | "Under Review" | "Follow-up Required" | "Complete";
export type RequestPriority = "Critical" | "High" | "Medium" | "Low";
export type RequestDocument = { id: string; name: string; type: string; uploadedAt: string; persisted: boolean };
export type InformationRequest = {
  id: string; category: string; title: string; description: string; priority: RequestPriority;
  internalOwner: string; clientOwner: string; requestedDate: string; dueDate: string;
  status: RequestStatus; destination: string; documentIds: string[]; comments: string[];
  followUp: boolean; lastActivity: string; completionNote: string;
};
export type RequestActivity = { id: string; title: string; detail: string; actor: string; timestamp: string };
export type InformationRequestPageViewModel = {
  shell: DealShellViewModel; isPreview: boolean; phaseStatus: string; completionPercent: number;
  owners: string[]; categories: string[]; destinations: string[]; requests: InformationRequest[];
  documents: RequestDocument[]; activity: RequestActivity[]; sourceDataHref: string;
};

const previewCompany: Company = { id: "preview", name: "Northstar Industrial Services", deal_name: "Project Northstar — FDD", deal_type: "Buy-side financial due diligence", status: "Diligence", industry: "Industrial services", base_currency: "USD", stage: "diligence", stage_updated_at: "2026-08-18T14:30:00.000Z", stage_notes: null, created_at: "2026-08-04T13:00:00.000Z" };

const previewDocuments: RequestDocument[] = [
  { id: "doc-tb", name: "Northstar_Trial_Balance_Jul26.xlsx", type: "Trial balance", uploadedAt: "Aug 21, 2026", persisted: true },
  { id: "doc-revenue", name: "Revenue_by_Customer_FY24-LTM.xlsx", type: "Revenue detail", uploadedAt: "Aug 22, 2026", persisted: true },
  { id: "doc-debt", name: "Debt_and_Lease_Schedule.xlsx", type: "Debt schedule", uploadedAt: "Aug 20, 2026", persisted: true },
  { id: "doc-policy", name: "Revenue_Recognition_Policy.pdf", type: "Accounting policy", uploadedAt: "Aug 19, 2026", persisted: true }
];

function request(id: string, category: string, title: string, priority: RequestPriority, owner: string, dueDate: string, status: RequestStatus, destination: string, documentIds: string[] = [], followUp = false): InformationRequest {
  return { id, category, title, description: `Provide ${title.toLowerCase()}, including all relevant entities and reconciliations where applicable.`, priority, internalOwner: owner, clientOwner: "Client controller", requestedDate: "2026-08-18", dueDate, status, destination, documentIds, comments: [], followUp, lastActivity: "Aug 22, 2026", completionNote: "" };
}

function baseModel(company: Company, isPreview: boolean, documents: RequestDocument[]): InformationRequestPageViewModel {
  const requests = [
    request("IR-001", "Financials", "Monthly P&L by entity — FY2023 through LTM", "Critical", "Maya Chen", "2026-08-22", "Partially Received", "Financial / Trial Balance & P&L", [documents[0]?.id].filter(Boolean) as string[], true),
    request("IR-002", "Revenue", "Monthly revenue detail by customer", "Critical", "Daniel Ross", "2026-08-23", "Under Review", "Financial / Revenue / Monthly Detail", [documents[1]?.id].filter(Boolean) as string[]),
    request("IR-003", "Revenue", "Customer master file and top 25 contracts", "High", "Daniel Ross", "2026-08-21", "Follow-up Required", "Commercial / Customers / Contracts", [], true),
    request("IR-004", "People", "Payroll register and employee census", "High", "Priya Shah", "2026-08-25", "Requested", "Financial / Payroll", []),
    request("IR-005", "Net debt", "Debt, lease, and contingent liability schedule", "Critical", "Maya Chen", "2026-08-22", "Received", "Financial / Debt & Debt-like", [documents[2]?.id].filter(Boolean) as string[]),
    request("IR-006", "Accounting", "Revenue recognition policies and memos", "Medium", "Priya Shah", "2026-08-26", "Complete", "Accounting / Policies", [documents[3]?.id].filter(Boolean) as string[])
  ];
  const completionPercent = Math.round((requests.filter((item) => item.status === "Complete" || item.status === "Under Review" || item.status === "Received").length / requests.length) * 100);
  return { shell: buildDealShellViewModel({ company, requestedSection: "information-request", context: "information-request", progressPercent: completionPercent, progressLabel: "Request readiness", progressIsPreview: isPreview }), isPreview, phaseStatus: "In progress", completionPercent, owners: ["Maya Chen", "Daniel Ross", "Priya Shah", "Jordan Lee"], categories: ["Financials", "Revenue", "People", "Working capital", "Net debt", "Accounting", "Tax", "Other"], destinations: ["Financial / Trial Balance & P&L", "Financial / Revenue / Monthly Detail", "Financial / Working Capital", "Financial / Debt & Debt-like", "Financial / Payroll", "Accounting / Policies", "Commercial / Customers / Contracts", "Other / Unclassified"], requests, documents, activity: [
    { id: "a1", title: "Revenue detail linked", detail: "Revenue_by_Customer_FY24-LTM.xlsx linked to IR-002.", actor: "Daniel Ross", timestamp: "Today, 10:18 AM" },
    { id: "a2", title: "Customer contracts follow-up", detail: "IR-003 flagged for follow-up after an incomplete response.", actor: "Daniel Ross", timestamp: "Today, 9:42 AM" },
    { id: "a3", title: "Debt schedule received", detail: "IR-005 marked received and routed to Financial / Debt & Debt-like.", actor: "Maya Chen", timestamp: "Yesterday, 4:06 PM" }
  ], sourceDataHref: `/source-data?companyId=${company.id}` };
}

function mapDocuments(documents: SourceDocument[]): RequestDocument[] {
  return documents.map((document) => ({ id: document.id, name: document.name ?? document.source_file_name ?? "Untitled document", type: document.document_type?.replaceAll("_", " ") ?? "Source document", uploadedAt: document.uploaded_at ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(document.uploaded_at)) : "Date unavailable", persisted: true }));
}

export function buildInformationRequestPreviewViewModel() { return baseModel(previewCompany, true, previewDocuments); }
export function buildInformationRequestPageViewModel(data: DashboardData) { return data.company ? baseModel(data.company, false, mapDocuments(data.documents)) : null; }

