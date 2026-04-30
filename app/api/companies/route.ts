import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
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
  const rawDealName =
    typeof body.dealName === "string" ? body.dealName.trim() : "";
  const companyName =
    typeof body.companyName === "string"
      ? body.companyName.trim()
      : typeof body.name === "string"
        ? body.name.trim()
        : "";
  const dealName = rawDealName || companyName;
  const industry =
    typeof body.industry === "string" && body.industry.trim().length > 0
      ? body.industry.trim()
      : null;
  const dealType =
    typeof body.dealType === "string" && body.dealType.trim().length > 0
      ? body.dealType.trim()
      : "Search Fund";

  if (!dealName) {
    return NextResponse.json(
      { error: "Deal name is required." },
      { status: 400 }
    );
  }

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
      deal_name: dealName,
      name: companyName,
      industry,
      deal_type: dealType,
      status: "New",
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

  revalidatePath("/deals");
  revalidatePath(`/deal/${data.id}`);
  revalidatePath(`/source-data`);

  return NextResponse.json({ data }, { status: 201 });
}
