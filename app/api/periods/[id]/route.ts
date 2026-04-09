import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseServerClient();

    const { data: existingPeriod, error: existingPeriodError } = await supabase
      .from("reporting_periods")
      .select("id, label, company_id")
      .eq("id", id)
      .single<{ id: string; label: string; company_id: string }>();

    if (existingPeriodError) {
      return NextResponse.json({ error: existingPeriodError.message }, { status: 500 });
    }

    const { error } = await supabase.from("reporting_periods").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: existingPeriod.id,
        label: existingPeriod.label,
        companyId: existingPeriod.company_id
      }
    });
  } catch (error) {
    console.error("Unexpected error deleting reporting period", { error });
    return NextResponse.json(
      { error: "Reporting period could not be deleted." },
      { status: 500 }
    );
  }
}
