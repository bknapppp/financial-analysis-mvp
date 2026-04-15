import { NextRequest, NextResponse } from "next/server";
import {
  buildManualTaxPreviewRows,
  type ManualTaxIngestionPayload
} from "@/lib/manual-tax-ingestion";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "The manual tax preview endpoint is internal-only." },
      { status: 404 }
    );
  }

  try {
    const payload = (await request.json()) as Partial<ManualTaxIngestionPayload>;
    const periods = Array.isArray(payload.periods) ? payload.periods : [];
    const previewPeriod = periods[0] ?? null;
    const companyId = payload.companyId?.trim() ?? "";

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required for tax mapping preview." },
        { status: 400 }
      );
    }

    if (!previewPeriod) {
      return NextResponse.json(
        { error: "At least one preview period is required." },
        { status: 400 }
      );
    }

    const rows = await buildManualTaxPreviewRows({
      companyId,
      entries: Array.isArray(previewPeriod.entries) ? previewPeriod.entries : []
    });

    return NextResponse.json({ data: rows });
  } catch (error) {
    console.error("Failed manual tax preview", { error });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Manual tax preview could not be generated."
      },
      { status: 500 }
    );
  }
}
