import { NextRequest, NextResponse } from "next/server";
import {
  buildDealStageUpdatePayload,
  isDealStage
} from "@/lib/deal-stage";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = getSupabaseServerClient();
    const stageValue = body.stage;
    const stageNotes =
      typeof body.stageNotes === "string"
        ? body.stageNotes.trim()
        : body.stageNotes === null
          ? null
          : undefined;

    if (!isDealStage(stageValue)) {
      return NextResponse.json(
        { error: "A valid lifecycle stage is required." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("companies")
      .update(buildDealStageUpdatePayload({ stage: stageValue, stageNotes }))
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Unexpected error updating company stage", { error });
    return NextResponse.json(
      { error: "Company stage could not be updated." },
      { status: 500 }
    );
  }
}

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
