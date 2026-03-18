import { NextRequest, NextResponse } from "next/server";
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

  return NextResponse.json({ data });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("financial_entries").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
