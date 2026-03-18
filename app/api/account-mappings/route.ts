import { NextRequest, NextResponse } from "next/server";
import { isAccountMappingsSchemaError } from "@/lib/account-mapping-schema";
import { normalizeAccountName, parseCategory, parseStatementType } from "@/lib/auto-mapping";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { AccountMapping } from "@/lib/types";

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
  const { data, error } = await supabase
    .from("account_mappings")
    .select("*")
    .eq("company_id", companyId)
    .returns<AccountMapping[]>();

  if (error) {
    console.warn("Account mappings unavailable for GET request.", {
      companyId,
      error
    });

    return NextResponse.json({ data: [] });
  }

  return NextResponse.json({
    data: Array.isArray(data) ? data : []
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    companyId?: string;
    accountName?: string;
    category?: string;
    statementType?: string;
  };

  const companyId = body.companyId?.trim();
  const accountName = body.accountName?.trim();
  const category = parseCategory(body.category);
  const statementType = parseStatementType(body.statementType);

  if (!companyId || !accountName || !category || !statementType) {
    return NextResponse.json(
      { error: "companyId, accountName, category, and statementType are required." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("account_mappings")
    .upsert(
      {
        company_id: companyId,
        account_name: accountName,
        account_name_key: normalizeAccountName(accountName),
        category,
        statement_type: statementType,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "company_id,account_name_key"
      }
    )
    .select("*")
    .single();

  if (error) {
    if (isAccountMappingsSchemaError(error)) {
      return NextResponse.json(
        { error: "Account mappings table is not available yet. Run the latest Supabase migration first." },
        { status: 400 }
      );
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
