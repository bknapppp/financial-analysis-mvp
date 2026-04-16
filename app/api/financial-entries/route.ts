import { NextRequest, NextResponse } from "next/server";
import { captureDealMemorySnapshotSafely } from "@/lib/deal-memory-capture";
import {
  FINANCIAL_ENTRY_AUDIT_SELECT,
  FINANCIAL_ENTRY_BASE_SELECT,
  isFinancialEntryTraceabilitySchemaError
} from "@/lib/financial-entry-schema";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");
  const companyId = searchParams.get("companyId");
  const supabase = getSupabaseServerClient();

  let query = supabase
    .from("financial_entries")
    .select(
      `${FINANCIAL_ENTRY_AUDIT_SELECT}, reporting_periods!inner(id, label, period_date, company_id)`
    )
    .order("created_at", { ascending: false });

  if (periodId) {
    query = query.eq("period_id", periodId);
  }

  if (companyId) {
    query = query.eq("reporting_periods.company_id", companyId);
  }

  let result: Awaited<typeof query> = await query;

  if (result.error && isFinancialEntryTraceabilitySchemaError(result.error)) {
    let fallbackQuery = supabase
      .from("financial_entries")
      .select(
        `${FINANCIAL_ENTRY_BASE_SELECT}, reporting_periods!inner(id, label, period_date, company_id)`
      )
      .order("created_at", { ascending: false });

    if (periodId) {
      fallbackQuery = fallbackQuery.eq("period_id", periodId);
    }

    if (companyId) {
      fallbackQuery = fallbackQuery.eq("reporting_periods.company_id", companyId);
    }

    result = (await fallbackQuery) as Awaited<typeof query>;
  }

  const { data, error } = result;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getSupabaseServerClient();
  const baseInsert = {
    account_name: body.accountName,
    statement_type: body.statementType,
    amount: body.amount,
    period_id: body.periodId,
    category: body.category,
    addback_flag: Boolean(body.addbackFlag)
  };

  let { data, error } = await supabase
    .from("financial_entries")
    .insert({
      ...baseInsert,
      matched_by: "manual",
      confidence: "high",
      mapping_explanation: "Created manually in the app."
    })
    .select()
    .single();

  if (error && isFinancialEntryTraceabilitySchemaError(error)) {
    const fallbackInsert = await supabase
      .from("financial_entries")
      .insert(baseInsert)
      .select()
      .single();

    data = fallbackInsert.data;
    error = fallbackInsert.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const periodCompanyLookup = await supabase
    .from("reporting_periods")
    .select("company_id")
    .eq("id", body.periodId)
    .maybeSingle<{ company_id: string }>();

  if (periodCompanyLookup.data?.company_id) {
    await captureDealMemorySnapshotSafely(
      periodCompanyLookup.data.company_id,
      "financial-entries:create-manual-entry"
    );
  }

  return NextResponse.json({ data }, { status: 201 });
}
