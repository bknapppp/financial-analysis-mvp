import { NextRequest, NextResponse } from "next/server";
import { getDefaultDealStage } from "@/lib/deal-stage";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getSupabaseServerClient();
  const companyName =
    typeof body.name === "string" ? body.name.trim() : "";

  if (!companyName) {
    return NextResponse.json(
      { error: "Company name is required." },
      { status: 400 }
    );
  }

  const { data: existingCompanies, error: existingCompanyError } = await supabase
    .from("companies")
    .select("id")
    .ilike("name", companyName)
    .limit(1);

  if (existingCompanyError) {
    return NextResponse.json(
      { error: existingCompanyError.message },
      { status: 500 }
    );
  }

  if (Array.isArray(existingCompanies) && existingCompanies.length > 0) {
    return NextResponse.json(
      { error: "A company with that name already exists." },
      { status: 409 }
    );
  }

  const { data, error } = await supabase
    .from("companies")
    .insert({
      name: companyName,
      industry: body.industry ?? null,
      base_currency: body.baseCurrency ?? "USD",
      stage: getDefaultDealStage(),
      stage_updated_at: new Date().toISOString(),
      stage_notes: null
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
