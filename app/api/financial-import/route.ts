import { NextRequest, NextResponse } from "next/server";
import {
  inferStatementTypeFromCategory,
  normalizeAccountName,
  parseBooleanFlag,
  parseCategory,
  parseStatementType,
  suggestAccountMapping
} from "@/lib/auto-mapping";
import { isAccountMappingsSchemaError } from "@/lib/account-mapping-schema";
import { isFinancialEntryTraceabilitySchemaError } from "@/lib/financial-entry-schema";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { AccountMapping, NormalizedCategory, StatementType } from "@/lib/types";

type ImportRowPayload = {
  accountName?: string | number | null;
  amount?: number | string | null;
  statementType?: string | null;
  category?: string | null;
  addbackFlag?: boolean | string | null;
  matchedBy?: string | null;
  confidence?: string | null;
  mappingExplanation?: string | null;
};

type RejectedRow = {
  rowNumber: number;
  accountName: string;
  reason: string;
};

function buildEntryKey(
  accountName: string,
  statementType: StatementType,
  amount: number,
  category: NormalizedCategory,
  addbackFlag: boolean
) {
  return [
    normalizeAccountName(accountName),
    statementType,
    amount.toFixed(2),
    category,
    addbackFlag ? "1" : "0"
  ].join("::");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      periodId?: string;
      rows?: ImportRowPayload[];
    };

    const companyId = body.companyId?.trim();
    const periodId = body.periodId?.trim();
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!companyId || !periodId) {
      return NextResponse.json(
        { error: "companyId and periodId are required." },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "At least one parsed row is required." },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    const { data: periodResult, error: periodError } = await supabase
      .from("reporting_periods")
      .select("id, company_id")
      .eq("id", periodId)
      .eq("company_id", companyId)
      .limit(1)
      .returns<Array<{ id: string; company_id: string }>>();

    if (periodError) {
      console.error("Failed to validate reporting period during CSV import", {
        companyId,
        periodId,
        error: periodError
      });

      return NextResponse.json({ error: periodError.message }, { status: 500 });
    }

    const period = Array.isArray(periodResult) ? (periodResult[0] ?? null) : null;

    if (!period) {
      return NextResponse.json(
        { error: "The selected reporting period does not belong to that company." },
        { status: 400 }
      );
    }

    const { data: mappingsResult, error: mappingsError } = await supabase
      .from("account_mappings")
      .select("*")
      .eq("company_id", companyId)
      .returns<AccountMapping[]>();

    if (mappingsError && !isAccountMappingsSchemaError(mappingsError)) {
      console.error("Failed to load account mappings during import", {
        companyId,
        error: mappingsError
      });

      return NextResponse.json({ error: mappingsError.message }, { status: 500 });
    }

    const savedMappings = Array.isArray(mappingsResult) ? mappingsResult : [];
    const { data: existingEntriesResult, error: existingEntriesError } = await supabase
      .from("financial_entries")
      .select("account_name, statement_type, amount, category, addback_flag")
      .eq("period_id", periodId)
      .returns<
        Array<{
          account_name: string;
          statement_type: StatementType;
          amount: number;
          category: NormalizedCategory;
          addback_flag: boolean;
        }>
      >();

    if (existingEntriesError) {
      console.error("Failed to load existing entries during CSV import", {
        companyId,
        periodId,
        error: existingEntriesError
      });

      return NextResponse.json(
        { error: existingEntriesError.message },
        { status: 500 }
      );
    }

    const existingEntryKeys = new Set(
      (Array.isArray(existingEntriesResult) ? existingEntriesResult : []).map((entry) =>
        buildEntryKey(
          entry.account_name,
          entry.statement_type,
          Number(entry.amount),
          entry.category,
          entry.addback_flag
        )
      )
    );
    const rejectedRows: RejectedRow[] = [];
    const rowsToInsert: Array<{
      account_name: string;
      statement_type: StatementType;
      amount: number;
      period_id: string;
      category: NormalizedCategory;
      addback_flag: boolean;
      matched_by: string;
      confidence: string;
      mapping_explanation: string;
    }> = [];
    const mappingsToUpsert: Array<{
      company_id: string;
      account_name: string;
      account_name_key: string;
      category: NormalizedCategory;
      statement_type: StatementType;
      updated_at: string;
    }> = [];

    rows.forEach((row, index) => {
    const accountName =
      typeof row.accountName === "string"
        ? row.accountName.trim()
        : typeof row.accountName === "number"
          ? String(row.accountName)
          : "";
    const amount = Number(row.amount);
    const providedCategory = parseCategory(row.category);
    const providedStatementType = parseStatementType(row.statementType);
    const suggestedMapping = suggestAccountMapping(accountName, savedMappings);
    const category = providedCategory ?? suggestedMapping.category;
    const statementType =
      providedStatementType ??
      suggestedMapping.statementType ??
      inferStatementTypeFromCategory(category);
    const addbackFlag = parseBooleanFlag(row.addbackFlag);
    const providedMatchedBy = row.matchedBy?.trim();
    const providedConfidence = row.confidence?.trim();
    const providedExplanation = row.mappingExplanation?.trim();

    if (!accountName) {
      rejectedRows.push({
        rowNumber: index + 1,
        accountName: "",
        reason: "Missing account_name"
      });
      return;
    }

    if (!Number.isFinite(amount)) {
      rejectedRows.push({
        rowNumber: index + 1,
        accountName,
        reason: "Invalid amount"
      });
      return;
    }

    if (!category) {
      rejectedRows.push({
        rowNumber: index + 1,
        accountName,
        reason: "Category could not be mapped"
      });
      return;
    }

    if (!statementType) {
      rejectedRows.push({
        rowNumber: index + 1,
        accountName,
        reason: "Statement type could not be inferred"
      });
      return;
    }

    const entryKey = buildEntryKey(
      accountName,
      statementType,
      amount,
      category,
      addbackFlag
    );

    if (existingEntryKeys.has(entryKey)) {
      rejectedRows.push({
        rowNumber: index + 1,
        accountName,
        reason: "Duplicate row for this period"
      });
      return;
    }

    existingEntryKeys.add(entryKey);

    rowsToInsert.push({
      account_name: accountName,
      statement_type: statementType,
      amount,
      period_id: periodId,
      category,
      addback_flag: addbackFlag,
      matched_by:
        providedMatchedBy ||
        (providedCategory || providedStatementType
          ? "csv_value"
          : suggestedMapping.matchedBy === "keyword_rule"
            ? "keyword"
            : suggestedMapping.matchedBy === "saved_mapping"
              ? "saved_mapping"
              : "manual"),
      confidence:
        providedConfidence ||
        (providedCategory || providedStatementType
          ? "high"
          : suggestedMapping.confidence),
      mapping_explanation:
        providedExplanation ||
        (providedCategory || providedStatementType
          ? "Using category or statement type provided in the CSV."
          : suggestedMapping.explanation)
    });

    mappingsToUpsert.push({
      company_id: companyId,
      account_name: accountName,
      account_name_key: normalizeAccountName(accountName),
      category,
      statement_type: statementType,
      updated_at: new Date().toISOString()
    });
    });

    if (rowsToInsert.length === 0) {
      return NextResponse.json(
        {
          error: "No valid rows were available for import.",
          insertedCount: 0,
          rejectedRows
        },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase
      .from("financial_entries")
      .insert(rowsToInsert);

    if (insertError && isFinancialEntryTraceabilitySchemaError(insertError)) {
      const fallbackInsert = await supabase.from("financial_entries").insert(
        rowsToInsert.map(
          ({
            matched_by: _matchedBy,
            confidence: _confidence,
            mapping_explanation: _mappingExplanation,
            ...baseRow
          }) => baseRow
        )
      );

      if (fallbackInsert.error) {
        console.error("Failed to insert CSV rows into financial_entries", {
          companyId,
          periodId,
          error: fallbackInsert.error
        });

        return NextResponse.json(
          { error: fallbackInsert.error.message },
          { status: 500 }
        );
      }
    } else if (insertError) {
      console.error("Failed to insert CSV rows into financial_entries", {
        companyId,
        periodId,
        error: insertError
      });

      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (mappingsToUpsert.length > 0) {
      const { error: mappingUpsertError } = await supabase
        .from("account_mappings")
        .upsert(mappingsToUpsert, {
          onConflict: "company_id,account_name_key"
        });

      if (mappingUpsertError) {
        console.warn("Skipping account mapping persistence after successful import.", {
          companyId,
          error: mappingUpsertError
        });
      }
    }

    return NextResponse.json({
      insertedCount: rowsToInsert.length,
      rejectedRows
    });
  } catch (error) {
    console.error("Unexpected error during CSV import", { error });

    return NextResponse.json(
      { error: "CSV import could not be completed." },
      { status: 500 }
    );
  }
}
