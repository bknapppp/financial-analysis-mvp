import { NextRequest, NextResponse } from "next/server";
import { captureDealMemorySnapshotSafely } from "@/lib/deal-memory-capture";
import {
  getSourceFinancialContext,
  insertTaxReturnFinancialContext
} from "@/lib/financial-sources";
import type {
  AuditConfidence,
  AuditMatchedBy,
  FinancialSourceConfidence,
  FinancialSourceType,
  NormalizedCategory,
  StatementType
} from "@/lib/types";

function parseSourceType(value: string | null | undefined): FinancialSourceType | null {
  if (value === "reported_financials" || value === "tax_return") {
    return value;
  }

  return null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId")?.trim() ?? "";
    const sourceType = parseSourceType(searchParams.get("sourceType"));
    const sourcePeriodId = searchParams.get("sourcePeriodId")?.trim() ?? "";

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required." }, { status: 400 });
    }

    if (!sourceType) {
      return NextResponse.json(
        { error: "sourceType must be reported_financials or tax_return." },
        { status: 400 }
      );
    }

    const context = await getSourceFinancialContext({ companyId, sourceType });
    const data = sourcePeriodId
      ? {
          ...context,
          periods: context.periods.filter((period) => period.id === sourcePeriodId),
          entries: context.entries.filter(
            (entry) => entry.source_period_id === sourcePeriodId
          )
        }
      : context;

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Failed to load source financials", { error });
    return NextResponse.json(
      { error: "Source financials could not be loaded." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      sourceType?: FinancialSourceType;
      sourceFileName?: string | null;
      uploadId?: string | null;
      periodLabel?: string;
      periodDate?: string;
      sourcePeriodLabel?: string | null;
      sourceYear?: number | null;
      sourceCurrency?: string | null;
      sourceConfidence?: FinancialSourceConfidence | null;
      rows?: Array<{
        accountName?: string;
        amount?: number;
        statementType?: StatementType;
        category?: NormalizedCategory;
        addbackFlag?: boolean;
        matchedBy?: AuditMatchedBy | null;
        confidence?: AuditConfidence | null;
        mappingExplanation?: string | null;
      }>;
    };

    const companyId = body.companyId?.trim() ?? "";
    const sourceType = body.sourceType;
    const periodLabel = body.periodLabel?.trim() ?? "";
    const periodDate = body.periodDate?.trim() ?? "";
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!companyId) {
      return NextResponse.json({ error: "companyId is required." }, { status: 400 });
    }

    if (sourceType !== "tax_return") {
      return NextResponse.json(
        {
          error:
            "Only the isolated tax_return pipeline can be inserted through this endpoint."
        },
        { status: 400 }
      );
    }

    if (!periodLabel || !periodDate) {
      return NextResponse.json(
        { error: "periodLabel and periodDate are required." },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "At least one tax-source row is required." },
        { status: 400 }
      );
    }

    const invalidRow = rows.find(
      (row) =>
        !row.accountName ||
        !Number.isFinite(Number(row.amount)) ||
        !row.statementType ||
        !row.category
    );

    if (invalidRow) {
      return NextResponse.json(
        {
          error:
            "Each tax-source row requires accountName, amount, statementType, and category."
        },
        { status: 400 }
      );
    }

    const result = await insertTaxReturnFinancialContext({
      companyId,
      sourceFileName: body.sourceFileName ?? null,
      uploadId: body.uploadId ?? null,
      periodLabel,
      periodDate,
      sourcePeriodLabel: body.sourcePeriodLabel ?? null,
      sourceYear: body.sourceYear ?? null,
      sourceCurrency: body.sourceCurrency ?? null,
      sourceConfidence: body.sourceConfidence ?? null,
      rows: rows.map((row) => ({
        accountName: row.accountName!.trim(),
        amount: Number(row.amount),
        statementType: row.statementType!,
        category: row.category!,
        addbackFlag: Boolean(row.addbackFlag),
        matchedBy: row.matchedBy ?? "manual",
        confidence: row.confidence ?? "high",
        mappingExplanation: row.mappingExplanation ?? null
      }))
    });

    await captureDealMemorySnapshotSafely(
      companyId,
      "source-financials:tax-return-ingestion-complete"
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error("Failed to insert tax-source financials", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Tax-source financials failed." },
      { status: 500 }
    );
  }
}
