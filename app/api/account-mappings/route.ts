import { NextRequest, NextResponse } from "next/server";
import { isAccountMappingsSchemaError } from "@/lib/account-mapping-schema";
import { parseCategory, parseStatementType } from "@/lib/auto-mapping";
import { devWarn } from "@/lib/debug";
import { saveConfirmedMappingToMemory } from "@/lib/mapping-memory";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { AccountMapping, FinancialSourceType } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) {
    return NextResponse.json(
      { error: "companyId is required." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const [{ data: companyMappings, error: companyError }, { data: globalMappings, error: globalError }] = await Promise.all([
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

  const error = companyError ?? globalError;

  if (error) {
    devWarn("Account mappings unavailable for GET request.", {
      companyId,
      error
    });

    return NextResponse.json({ data: [] });
  }

  return NextResponse.json({
    data: [
      ...(Array.isArray(companyMappings) ? companyMappings : []),
      ...(Array.isArray(globalMappings) ? globalMappings : [])
    ]
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    companyId?: string;
    accountName?: string;
    concept?: string;
    category?: string;
    statementType?: string;
    sourceType?: FinancialSourceType | null;
    allowOverwrite?: boolean;
  };

  const companyId = body.companyId?.trim();
  const accountName = body.accountName?.trim();
  const concept = body.concept?.trim();
  const category = parseCategory(body.category);
  const statementType = parseStatementType(body.statementType);
  const sourceType =
    body.sourceType === "reported_financials" || body.sourceType === "tax_return"
      ? body.sourceType
      : null;
  const allowOverwrite = body.allowOverwrite === true;

  if (!companyId || !accountName || !category || !statementType) {
    return NextResponse.json(
      { error: "companyId, accountName, category, and statementType are required." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  try {
    const result = await saveConfirmedMappingToMemory({
      supabase,
      companyId,
      accountName,
      statementType,
      sourceType,
      concept: concept || category,
      category,
      allowOverwrite
    });

    if (result.status === "conflict") {
      return NextResponse.json(
        {
          status: "conflict",
          existingRecord: result.existingRecord
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        status: result.status,
        data: result.record
      },
      { status: result.status === "inserted" ? 201 : 200 }
    );
  } catch (error) {
    if (
      isAccountMappingsSchemaError(
        error as { code?: string | null; message?: string | null } | null | undefined
      )
    ) {
      return NextResponse.json(
        { error: "Account mappings table is not available yet. Run the latest Supabase migration first." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Account mapping save failed." },
      { status: 500 }
    );
  }
}
