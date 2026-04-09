import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseServerClient();

    const { data: existingCompany, error: existingCompanyError } = await supabase
      .from("companies")
      .select("id, name")
      .eq("id", id)
      .single<{ id: string; name: string }>();

    if (existingCompanyError) {
      return NextResponse.json({ error: existingCompanyError.message }, { status: 500 });
    }

    const { error } = await supabase.from("companies").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { id: existingCompany.id, name: existingCompany.name }
    });
  } catch (error) {
    console.error("Unexpected error deleting company", { error });
    return NextResponse.json(
      { error: "Company could not be deleted." },
      { status: 500 }
    );
  }
}
