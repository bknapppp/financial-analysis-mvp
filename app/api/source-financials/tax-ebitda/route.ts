import { NextRequest, NextResponse } from "next/server";
import { getTaxDerivedEbitdaForSourcePeriod } from "@/lib/tax-ebitda";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "The tax EBITDA endpoint is internal-only." },
      { status: 404 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId")?.trim() ?? "";
    const sourcePeriodId =
      searchParams.get("sourcePeriodId")?.trim() ??
      searchParams.get("periodId")?.trim() ??
      "";

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required." }, { status: 400 });
    }

    if (!sourcePeriodId) {
      return NextResponse.json(
        { error: "sourcePeriodId (or periodId) is required." },
        { status: 400 }
      );
    }

    const data = await getTaxDerivedEbitdaForSourcePeriod({
      companyId,
      sourcePeriodId
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Failed to load tax-derived EBITDA", { error });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Tax-derived EBITDA could not be loaded."
      },
      { status: 500 }
    );
  }
}
