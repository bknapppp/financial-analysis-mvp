import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import {
  initializePhase5Reporting,
  linkReportingFinding,
  Phase5ConflictError,
  Phase5ValidationError,
  unlinkReportingFinding,
  updateReportingSection
} from "@/services/supabase/phase5-reporting";

function refresh(companyId: string) {
  revalidatePath(`/deal/${companyId}/phases/reporting`);
  revalidatePath(`/deal/${companyId}/overview`);
}

function failure(error: unknown) {
  if (error instanceof Phase5ValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof Phase5ConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  console.error("Phase 5.1 reporting mutation failed", error);
  return NextResponse.json({ error: error instanceof Error ? error.message : "Reporting update failed." }, { status: 500 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> }
) {
  const { companyId } = await params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    let data: unknown;
    if (action === "initialize") data = await initializePhase5Reporting(companyId);
    else if (action === "update_section") data = await updateReportingSection(companyId, String(body.sectionId), body);
    else if (action === "link_finding") data = await linkReportingFinding(companyId, String(body.sectionId), String(body.issueId));
    else if (action === "unlink_finding") data = await unlinkReportingFinding(companyId, String(body.sectionId), String(body.issueId));
    else return NextResponse.json({ error: "Unsupported Phase 5.1 action." }, { status: 400 });
    refresh(companyId);
    return NextResponse.json({ data });
  } catch (error) {
    return failure(error);
  }
}
