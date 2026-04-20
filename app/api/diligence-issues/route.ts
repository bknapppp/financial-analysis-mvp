import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  createManualDiligenceIssue,
  getDiligenceIssues
} from "@/lib/diligence-issues";
import type {
  DiligenceIssueCategory,
  DiligenceIssueLinkedPage,
  DiligenceIssueSeverity,
  DiligenceIssueStatus
} from "@/lib/types";

const CATEGORY_VALUES: DiligenceIssueCategory[] = [
  "source_data",
  "financials",
  "underwriting",
  "reconciliation",
  "validation",
  "credit",
  "tax",
  "diligence_request",
  "other"
];

const SEVERITY_VALUES: DiligenceIssueSeverity[] = [
  "low",
  "medium",
  "high",
  "critical"
];

const PAGE_VALUES: DiligenceIssueLinkedPage[] = [
  "overview",
  "financials",
  "underwriting",
  "source_data"
];

const STATUS_VALUES: Array<DiligenceIssueStatus | "active"> = [
  "open",
  "in_review",
  "resolved",
  "waived",
  "active"
];

function isCategory(value: unknown): value is DiligenceIssueCategory {
  return typeof value === "string" && CATEGORY_VALUES.includes(value as DiligenceIssueCategory);
}

function isSeverity(value: unknown): value is DiligenceIssueSeverity {
  return typeof value === "string" && SEVERITY_VALUES.includes(value as DiligenceIssueSeverity);
}

function isLinkedPage(value: unknown): value is DiligenceIssueLinkedPage {
  return typeof value === "string" && PAGE_VALUES.includes(value as DiligenceIssueLinkedPage);
}

function isStatus(value: unknown): value is DiligenceIssueStatus | "active" {
  return typeof value === "string" && STATUS_VALUES.includes(value as DiligenceIssueStatus | "active");
}

function revalidateDealPaths(companyId: string) {
  revalidatePath(`/deal/${companyId}`);
  revalidatePath(`/deal/${companyId}/underwriting`);
  revalidatePath(`/financials?companyId=${companyId}`);
  revalidatePath(`/source-data?companyId=${companyId}`);
  revalidatePath("/deals");
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const periodId = searchParams.get("periodId");
  const linkedPage = searchParams.get("linkedPage");
  const status = searchParams.get("status");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  }

  const issues = await getDiligenceIssues({
    companyId,
    periodId,
    linkedPage: isLinkedPage(linkedPage) ? linkedPage : undefined,
    status: isStatus(status) ? status : undefined
  });

  return NextResponse.json({ data: issues });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      periodId?: string | null;
      title?: string;
      description?: string;
      category?: string;
      severity?: string;
      linkedPage?: string;
      linkedField?: string | null;
      linkedRoute?: string | null;
    };

    const companyId = body.companyId?.trim();
    const title = body.title?.trim();
    const description = body.description?.trim();

    if (!companyId || !title || !description) {
      return NextResponse.json(
        { error: "companyId, title, and description are required." },
        { status: 400 }
      );
    }

    if (!isCategory(body.category) || !isSeverity(body.severity) || !isLinkedPage(body.linkedPage)) {
      return NextResponse.json(
        { error: "Invalid category, severity, or linked page." },
        { status: 400 }
      );
    }

    const issue = await createManualDiligenceIssue({
      companyId,
      periodId: body.periodId ?? null,
      title,
      description,
      category: body.category,
      severity: body.severity,
      linkedPage: body.linkedPage,
      linkedField: body.linkedField ?? null,
      linkedRoute: body.linkedRoute ?? null
    });

    revalidateDealPaths(companyId);

    return NextResponse.json({ data: issue }, { status: 201 });
  } catch (error) {
    console.error("Failed to create diligence issue", { error });
    return NextResponse.json(
      { error: "Diligence issue could not be created." },
      { status: 500 }
    );
  }
}
