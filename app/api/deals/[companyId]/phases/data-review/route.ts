import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data";
import { addPhase3ReviewComment, attachPhase3Evidence, createPhase3Investigation, detachPhase3Evidence, initializePhase3, Phase3ConflictError, Phase3ValidationError, promotePhase3Investigation, setPhase3Waiver, transitionPhase3Review, updatePhase3Investigation, updatePhase3Procedure } from "@/services/supabase/phase3-workflow";

function revalidate(companyId: string) { revalidatePath(`/deal/${companyId}/phases/data-review`); revalidatePath(`/deal/${companyId}/overview`); }
function responseError(error: unknown) { if (error instanceof Phase3ConflictError) return NextResponse.json({ error: error.message, code: "PHASE3_CONFLICT" }, { status: 409 }); if (error instanceof Phase3ValidationError) return NextResponse.json({ error: error.message, fields: error.fields, code: "PHASE3_VALIDATION" }, { status: 400 }); console.error("Phase 3 mutation failed", { error }); return NextResponse.json({ error: "Phase 3 workflow could not be updated.", code: "PHASE3_FAILURE" }, { status: 500 }); }

export async function POST(request: NextRequest, { params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || ""); let data: unknown;
    if (action === "initialize") data = await initializePhase3(companyId);
    else if (action === "update_procedure") data = await updatePhase3Procedure(companyId, String(body.id), body);
    else if (action === "create_investigation") data = await createPhase3Investigation(companyId, body);
    else if (action === "update_investigation") data = await updatePhase3Investigation(companyId, String(body.id), body);
    else if (action === "attach_evidence") data = await attachPhase3Evidence(companyId, String(body.investigationId), body);
    else if (action === "detach_evidence") data = await detachPhase3Evidence(companyId, String(body.investigationId), String(body.evidenceLinkId));
    else if (action === "promote_investigation") data = await promotePhase3Investigation(companyId, String(body.id), body);
    else if (action === "approve_waiver" || action === "revoke_waiver") data = await setPhase3Waiver(companyId, String(body.id), action === "approve_waiver", String(body.rationale || ""));
    else if (["submit","request_changes","approve","reopen"].includes(action)) { const dashboard = await getDashboardData(companyId); if (!dashboard.company || dashboard.company.id !== companyId) return NextResponse.json({ error: "Deal not found." }, { status: 404 }); data = await transitionPhase3Review(companyId, action as "submit"|"request_changes"|"approve"|"reopen", body, { status: dashboard.readiness.status === "ready" ? "ready" : dashboard.readiness.status === "blocked" ? "blocked" : "caution", reasons: [...dashboard.readiness.blockingReasons, ...dashboard.readiness.cautionReasons] }); }
    else if (action === "comment") data = await addPhase3ReviewComment(companyId, String(body.comment || ""));
    else return NextResponse.json({ error: "Unsupported Phase 3 action." }, { status: 400 });
    revalidate(companyId); return NextResponse.json({ data });
  } catch (error) { return responseError(error); }
}
