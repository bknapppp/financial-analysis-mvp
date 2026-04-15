import { NextRequest, NextResponse } from "next/server";
import {
  buildManualTaxIngestionPlan,
  ingestManualTaxPayload,
  type ManualTaxIngestionPayload
} from "@/lib/manual-tax-ingestion";

function validatePayload(payload: Partial<ManualTaxIngestionPayload>) {
  if (!payload.companyId?.trim()) {
    return "companyId is required.";
  }

  if (payload.sourceType !== "tax_return") {
    return "sourceType must be tax_return for manual tax ingestion.";
  }

  if (!Array.isArray(payload.periods) || payload.periods.length === 0) {
    return "At least one tax reporting period is required.";
  }

  for (const period of payload.periods) {
    if (!period?.label?.trim() || !period?.periodDate?.trim()) {
      return "Each tax period requires label and periodDate.";
    }

    if (!Array.isArray(period.entries) || period.entries.length === 0) {
      return `Tax period ${period.label ?? "(unknown)"} requires at least one entry.`;
    }

    for (const entry of period.entries) {
      if (!entry?.accountName?.trim() || !Number.isFinite(Number(entry.amount))) {
        return `Each tax entry requires accountName and numeric amount in period ${period.label ?? "(unknown)"}.`;
      }
    }
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "The manual tax ingestion endpoint is internal-only." },
      { status: 404 }
    );
  }

  try {
    const payload = (await request.json()) as Partial<ManualTaxIngestionPayload>;
    const validationError = validatePayload(payload);

    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const normalizedPayload: ManualTaxIngestionPayload = {
      companyId: payload.companyId!.trim(),
      sourceType: "tax_return",
      sourceFileName: payload.sourceFileName?.trim() ?? null,
      uploadId: payload.uploadId?.trim() ?? null,
      sourceCurrency: payload.sourceCurrency?.trim() ?? null,
      sourceConfidence: payload.sourceConfidence ?? "unknown",
      periods: payload.periods!.map((period) => ({
        label: period.label.trim(),
        periodDate: period.periodDate.trim(),
        sourcePeriodLabel: period.sourcePeriodLabel?.trim() ?? null,
        sourceYear:
          typeof period.sourceYear === "number" ? period.sourceYear : null,
        entries: period.entries.map((entry) => ({
          accountName: entry.accountName.trim(),
          amount: Number(entry.amount)
        }))
      }))
    };

    const plan = await buildManualTaxIngestionPlan(normalizedPayload);
    const result = await ingestManualTaxPayload(normalizedPayload);

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
              mappingSource: entry.mappingSource,
              memoryScope: entry.memoryScope,
              memorySourceType: entry.memorySourceType,
              matchedMemoryKey: entry.matchedMemoryKey,
              matchedRule: entry.matchedRule,
              mappingExplanation: entry.mappingExplanation
            }))
          }))
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed manual tax ingestion", { error });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Manual tax ingestion could not be completed."
      },
      { status: 500 }
    );
  }
}
