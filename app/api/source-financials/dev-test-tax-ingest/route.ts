import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";
import {
  buildManualTaxIngestionPlan,
  ingestManualTaxPayload,
  type ManualTaxIngestionPayload
} from "@/lib/manual-tax-ingestion";

const DEV_TEST_COMPANY_ID_PLACEHOLDER = "REPLACE_WITH_REAL_COMPANY_ID";

async function resolveCompanyId() {
  const envCompanyId = process.env.DEV_TEST_TAX_INGEST_COMPANY_ID?.trim();

  if (envCompanyId) {
    return envCompanyId;
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .returns<Array<{ id: string }>>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.[0]?.id ?? null;
}

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "The dev test tax ingestion endpoint is not available in production." },
      { status: 404 }
    );
  }

  try {
    const resolvedCompanyId = await resolveCompanyId();

    if (!resolvedCompanyId) {
      return NextResponse.json(
        {
          error:
            "No company could be resolved for dev tax ingestion. Create a company first or set DEV_TEST_TAX_INGEST_COMPANY_ID.",
          placeholderCompanyId: DEV_TEST_COMPANY_ID_PLACEHOLDER
        },
        { status: 400 }
      );
    }

    const payload: ManualTaxIngestionPayload = {
      companyId: resolvedCompanyId,
      sourceType: "tax_return",
      sourceFileName: "dev-test-tax-ingest.json",
      uploadId: `dev-test-tax-ingest-${resolvedCompanyId}-fy2023`,
      sourceCurrency: "USD",
      sourceConfidence: "unknown",
      periods: [
        {
          label: "FY2023",
          periodDate: "2023-12-31",
          sourcePeriodLabel: "Tax Year 2023",
          sourceYear: 2023,
          entries: [{ accountName: "Gross receipts", amount: 1000000 }]
        }
      ]
    };

    const plan = await buildManualTaxIngestionPlan(payload);
    const result = await ingestManualTaxPayload(payload);

    return NextResponse.json(
      {
        data: result,
        mappingDebug: {
          companyId: plan.companyId,
          sourceType: plan.sourceType,
          periods: plan.periods.map((period) => ({
            label: period.label,
            periodDate: period.periodDate,
            sourcePeriodLabel: period.sourcePeriodLabel,
            sourceYear: period.sourceYear,
            entries: period.entries.map((entry) => ({
              rawAccountName: entry.rawAccountName,
              normalizedAccountName: entry.normalizedAccountName,
              amount: entry.amount,
              statementType: entry.statementType,
              mappedCategory: entry.mappedCategory,
              mappingMethod: entry.mappingMethod,
              mappingConfidence: entry.mappingConfidence,
              matchedRule: entry.matchedRule,
              mappingExplanation: entry.mappingExplanation
            }))
          }))
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed dev test tax ingestion", { error });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Dev test tax ingestion could not be completed."
      },
      { status: 500 }
    );
  }
}
