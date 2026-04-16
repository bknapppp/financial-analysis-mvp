import { NextRequest, NextResponse } from "next/server";
import { captureDealMemorySnapshotSafely } from "@/lib/deal-memory-capture";
import { getSupabaseServerClient } from "@/lib/supabase";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json();
  const supabase = getSupabaseServerClient();
  const existingEntry = await supabase
    .from("financial_entries")
    .select("period_id, reporting_periods!inner(company_id)")
    .eq("id", id)
    .single<{ period_id: string; reporting_periods: { company_id: string } }>();

  if (existingEntry.error) {
    return NextResponse.json({ error: existingEntry.error.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("financial_entries")
    .update({
      account_name: body.accountName,
      statement_type: body.statementType,
      amount: body.amount,
      period_id: body.periodId,
      category: body.category,
      addback_flag: body.addbackFlag
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const originalCompanyId = existingEntry.data.reporting_periods.company_id;
  const nextPeriodId = typeof body.periodId === "string" ? body.periodId : existingEntry.data.period_id;
  const nextPeriodLookup = await supabase
    .from("reporting_periods")
    .select("company_id")
    .eq("id", nextPeriodId)
    .maybeSingle<{ company_id: string }>();

  const companyIdsToCapture = Array.from(
    new Set(
      [
        originalCompanyId,
        nextPeriodLookup.data?.company_id ?? null
      ].filter((value): value is string => Boolean(value))
    )
  );

  for (const companyId of companyIdsToCapture) {
    await captureDealMemorySnapshotSafely(
      companyId,
      "financial-entries:update-manual-entry"
    );
  }

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();
  const existingEntry = await supabase
    .from("financial_entries")
    .select("reporting_periods!inner(company_id)")
    .eq("id", id)
    .single<{ reporting_periods: { company_id: string } }>();

  if (existingEntry.error) {
    return NextResponse.json({ error: existingEntry.error.message }, { status: 500 });
  }
  const { error } = await supabase.from("financial_entries").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await captureDealMemorySnapshotSafely(
    existingEntry.data.reporting_periods.company_id,
    "financial-entries:delete-manual-entry"
  );

  return new NextResponse(null, { status: 204 });
}
