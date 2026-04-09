import { NextRequest, NextResponse } from "next/server";
import {
  inferStatementTypeFromCategory,
  isBalanceSheetLeafCategory,
  isBalanceSheetParentCategory,
  normalizeAccountName,
  parseBooleanFlag,
  parseCategory,
  parseStatementType,
  resolveMappingSelection
} from "@/lib/auto-mapping";
import { isAccountMappingsSchemaError } from "@/lib/account-mapping-schema";
import { isFinancialEntryTraceabilitySchemaError } from "@/lib/financial-entry-schema";
import {
  normalizeImportedPeriod,
  normalizeStoredReportingPeriod
} from "@/lib/import-periods";
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  AccountMapping,
  NormalizedCategory,
  ReportingPeriod,
  StatementType
} from "@/lib/types";

type ImportRowPayload = {
  accountName?: string | number | null;
  amount?: number | string | null;
  periodLabel?: string | null;
  periodDate?: string | null;
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

type ResolvedRowAssignment = {
  row: ImportRowPayload;
  rowNumber: number;
  periodId: string | null;
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

async function createReportingPeriod(params: {
  supabase: ReturnType<typeof getSupabaseServerClient>;
  companyId: string;
  label: string;
  periodDate: string;
}) {
  const { supabase, companyId, label, periodDate } = params;
  const { data, error } = await supabase
    .from("reporting_periods")
    .insert({
      company_id: companyId,
      label,
      period_date: periodDate
    })
    .select("*")
    .single<ReportingPeriod>();

  return { data, error };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      periodId?: string;
      createPeriod?: {
        label?: string;
        periodDate?: string;
      };
      rows?: ImportRowPayload[];
    };

    const companyId = body.companyId?.trim();
    const fallbackPeriodId = body.periodId?.trim() ?? "";
    const inlinePeriodLabel = body.createPeriod?.label?.trim() ?? "";
    const inlinePeriodDate = body.createPeriod?.periodDate?.trim() ?? "";
    const rows = Array.isArray(body.rows) ? body.rows : [];

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required." },
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

    const { data: companyPeriodsResult, error: periodsError } = await supabase
      .from("reporting_periods")
      .select("*")
      .eq("company_id", companyId)
      .order("period_date", { ascending: true })
      .returns<ReportingPeriod[]>();

    if (periodsError) {
      console.error("Failed to load reporting periods during file import", {
        companyId,
        error: periodsError
      });

      return NextResponse.json({ error: periodsError.message }, { status: 500 });
    }

    const companyPeriods = Array.isArray(companyPeriodsResult)
      ? [...companyPeriodsResult]
      : [];
    const normalizedExistingPeriods = companyPeriods.map((period) => ({
      period,
      normalized: normalizeStoredReportingPeriod(period)
    }));
    const periodById = new Map(companyPeriods.map((period) => [period.id, period]));

    let fallbackResolvedPeriodId: string | null =
      fallbackPeriodId && periodById.has(fallbackPeriodId) ? fallbackPeriodId : null;

    if (fallbackPeriodId && !fallbackResolvedPeriodId) {
      return NextResponse.json(
        {
          error:
            "The selected fallback reporting period does not belong to that company."
        },
        { status: 400 }
      );
    }

    if (!fallbackResolvedPeriodId && inlinePeriodLabel && inlinePeriodDate) {
      const normalizedInlinePeriod =
        normalizeImportedPeriod({
          periodLabel: inlinePeriodLabel,
          periodDate: inlinePeriodDate
        }) ?? null;

      const existingInlineMatch =
        normalizedExistingPeriods.find(
          ({ normalized }) =>
            normalized.periodDate ===
              (normalizedInlinePeriod?.periodDate ?? inlinePeriodDate) ||
            normalized.label.trim().toLowerCase() ===
              (normalizedInlinePeriod?.label ?? inlinePeriodLabel).trim().toLowerCase()
        )?.period ?? null;

      if (existingInlineMatch) {
        fallbackResolvedPeriodId = existingInlineMatch.id;
      } else {
        const createdPeriod = await createReportingPeriod({
          supabase,
          companyId,
          label: normalizedInlinePeriod?.label ?? inlinePeriodLabel,
          periodDate: normalizedInlinePeriod?.periodDate ?? inlinePeriodDate
        });

        if (createdPeriod.error) {
          console.error("Failed to create inline reporting period during file import", {
            companyId,
            inlinePeriodLabel,
            inlinePeriodDate,
            error: createdPeriod.error
          });

          return NextResponse.json(
            {
              error:
                createdPeriod.error.message ||
                "Inline reporting period could not be created."
            },
            { status: 500 }
          );
        }

        if (!createdPeriod.data) {
          return NextResponse.json(
            { error: "Inline reporting period could not be created." },
            { status: 500 }
          );
        }

        companyPeriods.push(createdPeriod.data);
        periodById.set(createdPeriod.data.id, createdPeriod.data);
        normalizedExistingPeriods.push({
          period: createdPeriod.data,
          normalized: normalizeStoredReportingPeriod(createdPeriod.data)
        });
        fallbackResolvedPeriodId = createdPeriod.data.id;
      }
    }

    const normalizedRowPeriods = rows.map((row, index) => ({
      row,
      rowNumber: index + 1,
      normalizedPeriod: normalizeImportedPeriod({
        periodLabel:
          typeof row.periodLabel === "string"
            ? row.periodLabel
            : String(row.periodLabel ?? ""),
        periodDate:
          typeof row.periodDate === "string"
            ? row.periodDate
            : String(row.periodDate ?? "")
      })
    }));

    const uniqueDetectedPeriods = new Map<
      string,
      NonNullable<(typeof normalizedRowPeriods)[number]["normalizedPeriod"]>
    >();

    normalizedRowPeriods.forEach((item) => {
      if (item.normalizedPeriod) {
        uniqueDetectedPeriods.set(item.normalizedPeriod.key, item.normalizedPeriod);
      }
    });

    if (uniqueDetectedPeriods.size === 0 && !fallbackResolvedPeriodId) {
      return NextResponse.json(
        {
          error:
            "No reporting period could be detected from the uploaded file. Choose an existing period or create one inline."
        },
        { status: 400 }
      );
    }

    for (const detectedPeriod of uniqueDetectedPeriods.values()) {
      const existingMatch =
        normalizedExistingPeriods.find(
          ({ normalized }) =>
            normalized.key === detectedPeriod.key ||
            normalized.periodDate === detectedPeriod.periodDate
        )?.period ?? null;

      if (existingMatch) {
        continue;
      }

      const createdPeriod = await createReportingPeriod({
        supabase,
        companyId,
        label: detectedPeriod.label,
        periodDate: detectedPeriod.periodDate
      });

      if (createdPeriod.error) {
        console.error("Failed to auto-create reporting period during file import", {
          companyId,
          detectedPeriod,
          error: createdPeriod.error
        });

        return NextResponse.json(
          {
            error:
              createdPeriod.error.message ||
              `Reporting period ${detectedPeriod.label} could not be created.`
          },
          { status: 500 }
        );
      }

      if (!createdPeriod.data) {
        return NextResponse.json(
          {
            error: `Reporting period ${detectedPeriod.label} could not be created.`
          },
          { status: 500 }
        );
      }

      companyPeriods.push(createdPeriod.data);
      periodById.set(createdPeriod.data.id, createdPeriod.data);
      normalizedExistingPeriods.push({
        period: createdPeriod.data,
        normalized: normalizeStoredReportingPeriod(createdPeriod.data)
      });
    }

    const resolvedAssignments: ResolvedRowAssignment[] = normalizedRowPeriods.map(
      ({ row, rowNumber, normalizedPeriod }) => {
        if (normalizedPeriod) {
          const matchedPeriod =
            normalizedExistingPeriods.find(
              ({ normalized }) =>
                normalized.key === normalizedPeriod.key ||
                normalized.periodDate === normalizedPeriod.periodDate
            )?.period ?? null;

          return {
            row,
            rowNumber,
            periodId: matchedPeriod?.id ?? null
          };
        }

        return {
          row,
          rowNumber,
          periodId: fallbackResolvedPeriodId
        };
      }
    );

    const unresolvedPeriodRows = resolvedAssignments.filter(
      (assignment) => !assignment.periodId
    );

    if (unresolvedPeriodRows.length > 0) {
      return NextResponse.json(
        {
          error:
            "Some rows still do not have a usable reporting period. Choose a fallback period or create one inline."
        },
        { status: 400 }
      );
    }

    /**
     * Mapping lookup flow (import path):
     * - Before: each row with a statement type called `resolveAccountMapping`, which
     *   performed a per-row DB lookup for memory mappings (`getSavedMapping`), causing
     *   N+1 round trips for large imports.
     * - Now: preload company + global mappings once per import and resolve in memory.
     *   `resolveAccountMapping` only hits DB when no preloaded mappings are provided.
     */
    const [{ data: companyMappingsResult, error: companyMappingsError }, { data: globalMappingsResult, error: globalMappingsError }] = await Promise.all([
      supabase
        .from("account_mappings")
        .select("*")
        .eq("company_id", companyId)
        .returns<AccountMapping[]>(),
      supabase
        .from("account_mappings")
        .select("*")
        .is("company_id", null)
        .returns<AccountMapping[]>()
    ]);
    const mappingsError = companyMappingsError ?? globalMappingsError;

    if (mappingsError && !isAccountMappingsSchemaError(mappingsError)) {
      console.error("Failed to load account mappings during import", {
        companyId,
        error: mappingsError
      });

      return NextResponse.json({ error: mappingsError.message }, { status: 500 });
    }

    const savedMappings = [
      ...(Array.isArray(companyMappingsResult) ? companyMappingsResult : []),
      ...(Array.isArray(globalMappingsResult) ? globalMappingsResult : [])
    ];
    const periodIds = Array.from(
      new Set(
        resolvedAssignments
          .map((assignment) => assignment.periodId)
          .filter((value): value is string => Boolean(value))
      )
    );

    const { data: existingEntriesResult, error: existingEntriesError } = await supabase
      .from("financial_entries")
      .select("account_name, statement_type, amount, category, addback_flag, period_id")
      .in("period_id", periodIds)
      .returns<
        Array<{
          account_name: string;
          statement_type: StatementType;
          amount: number;
          category: NormalizedCategory;
          addback_flag: boolean;
          period_id: string;
        }>
      >();

    if (existingEntriesError) {
      console.error("Failed to load existing entries during file import", {
        companyId,
        error: existingEntriesError
      });

      return NextResponse.json(
        { error: existingEntriesError.message },
        { status: 500 }
      );
    }

    const existingEntryKeys = new Set(
      (Array.isArray(existingEntriesResult) ? existingEntriesResult : []).map((entry) =>
        `${entry.period_id}::${buildEntryKey(
          entry.account_name,
          entry.statement_type,
          Number(entry.amount),
          entry.category,
          entry.addback_flag
        )}`
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
    const mappingResolutionCache = new Map<
      string,
      ReturnType<typeof resolveMappingSelection>
    >();
    for (const { row, rowNumber, periodId } of resolvedAssignments) {
      const accountName =
        typeof row.accountName === "string"
          ? row.accountName.trim()
          : typeof row.accountName === "number"
            ? String(row.accountName)
            : "";
      const amount = Number(row.amount);
      const providedCategory = parseCategory(row.category);
      const providedStatementType = parseStatementType(row.statementType);
      const mappingCacheKey = [
        normalizeAccountName(accountName),
        providedCategory ?? "none",
        providedStatementType ?? "none"
      ].join("::");
      let selectedMapping = mappingResolutionCache.get(mappingCacheKey);
      if (!selectedMapping) {
        selectedMapping = resolveMappingSelection({
          accountName,
          companyId,
          savedMappings,
          preferredStatementType: providedStatementType,
          csvCategory: providedCategory,
          csvStatementType: providedStatementType
        });
        mappingResolutionCache.set(mappingCacheKey, selectedMapping);
      }
      const statementType =
        selectedMapping.statementType ??
        inferStatementTypeFromCategory(selectedMapping.category);
      const category = selectedMapping.category;
      const addbackFlag = parseBooleanFlag(row.addbackFlag);
      const providedMatchedBy = row.matchedBy?.trim();
      const providedConfidence = row.confidence?.trim();
      const providedExplanation = row.mappingExplanation?.trim();

      if (statementType === "balance_sheet") {
        console.log("BALANCE SHEET CATEGORY VALIDATION", {
          account_name: accountName,
          incomingCategory: row.category ?? null,
          parsedCategory: providedCategory,
          statementType,
          isLeaf: isBalanceSheetLeafCategory(category),
          isParent: isBalanceSheetParentCategory(category),
          finalCategory: category,
          providedCategory,
          suggestedCategory: selectedMapping.category,
          providedWasParent: isBalanceSheetParentCategory(providedCategory)
        });
      }

      if (!accountName) {
        rejectedRows.push({
          rowNumber,
          accountName: "",
          reason: "Missing account_name"
        });
        continue;
      }

      if (!Number.isFinite(amount)) {
        rejectedRows.push({
          rowNumber,
          accountName,
          reason: "Invalid amount"
        });
        continue;
      }

      if (!category) {
        rejectedRows.push({
          rowNumber,
          accountName,
          reason: "Category could not be mapped"
        });
        continue;
      }

      if (!statementType) {
        rejectedRows.push({
          rowNumber,
          accountName,
          reason: "Statement type could not be inferred"
        });
        continue;
      }

      if (!periodId) {
        rejectedRows.push({
          rowNumber,
          accountName,
          reason: "Reporting period could not be resolved"
        });
        continue;
      }

      const entryKey = `${periodId}::${buildEntryKey(
        accountName,
        statementType,
        amount,
        category,
        addbackFlag
      )}`;

      if (existingEntryKeys.has(entryKey)) {
        rejectedRows.push({
          rowNumber,
          accountName,
          reason: "Duplicate row for this period"
        });
        continue;
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
          (selectedMapping.matchedBy === "keyword_rule"
            ? "keyword"
            : selectedMapping.matchedBy),
        confidence:
          providedConfidence ||
          selectedMapping.confidence,
        mapping_explanation:
          providedExplanation ||
          selectedMapping.explanation
      });
    }

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
        console.error("Failed to insert imported rows into financial_entries", {
          companyId,
          error: fallbackInsert.error
        });

        return NextResponse.json(
          { error: fallbackInsert.error.message },
          { status: 500 }
        );
      }
    } else if (insertError) {
      console.error("Failed to insert imported rows into financial_entries", {
        companyId,
        error: insertError
      });

      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({
      insertedCount: rowsToInsert.length,
      rejectedRows,
      periodIds
    });
  } catch (error) {
    console.error("Unexpected error during file import", { error });

    return NextResponse.json(
      { error: "File import could not be completed." },
      { status: 500 }
    );
  }
}
