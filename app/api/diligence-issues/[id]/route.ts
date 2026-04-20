import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { updateDiligenceIssue } from "@/lib/diligence-issues";
import type { DiligenceIssueStatus } from "@/lib/types";

const STATUS_VALUES: DiligenceIssueStatus[] = [
  "open",
  "in_review",
  "resolved",
  "waived"
];

function isStatus(value: unknown): value is DiligenceIssueStatus {
  return typeof value === "string" && STATUS_VALUES.includes(value as DiligenceIssueStatus);
}

function revalidateDealPaths(companyId: string) {
  revalidatePath(`/deal/${companyId}`);
  revalidatePath(`/deal/${companyId}/underwriting`);
  revalidatePath(`/financials?companyId=${companyId}`);
  revalidatePath(`/source-data?companyId=${companyId}`);
  revalidatePath("/deals");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      status?: string;
      owner?: string | null;
    };

    if (body.status !== undefined && !isStatus(body.status)) {
      return NextResponse.json({ error: "Invalid issue status." }, { status: 400 });
    }

    const issue = await updateDiligenceIssue({
      id,
      status: body.status,
      owner: body.owner ?? undefined
    });

    revalidateDealPaths(issue.company_id);

    return NextResponse.json({ data: issue });
  } catch (error) {
    console.error("Failed to update diligence issue", { error });
    return NextResponse.json(
      { error: "Diligence issue could not be updated." },
      { status: 500 }
    );
  }
}
