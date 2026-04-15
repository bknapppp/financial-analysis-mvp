import { NextRequest, NextResponse } from "next/server";
import {
  buildMockTaxReturnFixture,
  insertTaxReturnFinancialContext
} from "@/lib/financial-sources";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "The dev tax seed endpoint is not available in production." },
      { status: 404 }
    );
  }

  try {
    const body = (await request.json()) as {
      companyId?: string;
      sourceYear?: number;
      periodLabel?: string;
      periodDate?: string;
    };

    const companyId = body.companyId?.trim() ?? "";
    const sourceYear = Number(body.sourceYear ?? new Date().getUTCFullYear());

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required." }, { status: 400 });
    }

    if (!Number.isInteger(sourceYear) || sourceYear < 1900 || sourceYear > 2100) {
      return NextResponse.json({ error: "sourceYear must be a valid year." }, { status: 400 });
    }

    const fixture = buildMockTaxReturnFixture({
      companyId,
      sourceYear,
      periodLabel: body.periodLabel,
      periodDate: body.periodDate
    });
    const result = await insertTaxReturnFinancialContext(fixture);

    return NextResponse.json(
      {
        data: {
          ...result,
          sourceType: "tax_return",
          uploadId: fixture.uploadId,
          periodLabel: fixture.periodLabel,
          periodDate: fixture.periodDate
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to seed mock tax-return financials", { error });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Mock tax-return financials could not be created."
      },
      { status: 500 }
    );
  }
}
