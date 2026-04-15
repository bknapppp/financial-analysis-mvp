import { NextRequest, NextResponse } from "next/server";
import { getSourceReconciliationForPeriod } from "@/lib/source-reconciliation";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "The source reconciliation endpoint is internal-only." },
      { status: 404 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId")?.trim() ?? "";
    const periodId = searchParams.get("periodId")?.trim() ?? "";

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required." }, { status: 400 });
    }

    if (!periodId) {
      return NextResponse.json({ error: "periodId is required." }, { status: 400 });
    }

    const data = await getSourceReconciliationForPeriod({
      companyId,
      periodId
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Failed to load source reconciliation", { error });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Source reconciliation could not be loaded."
      },
      { status: 500 }
    );
  }
}
