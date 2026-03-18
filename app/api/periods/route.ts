import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");
    const supabase = getSupabaseServerClient();

    let query = supabase
      .from("reporting_periods")
      .select("*")
      .order("period_date", { ascending: true });

    if (companyId) {
      query = query.eq("company_id", companyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Failed to load reporting periods", {
        companyId,
        error
      });

      return NextResponse.json(
        { error: error.message || "Reporting periods could not be loaded." },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Unexpected error loading reporting periods", { error });

    return NextResponse.json(
      { error: "Reporting periods could not be loaded." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      label?: string;
      periodDate?: string;
    };
    const supabase = getSupabaseServerClient();
    const companyId =
      typeof body.companyId === "string" ? body.companyId.trim() : "";
    const label = typeof body.label === "string" ? body.label.trim() : "";
    const periodDate =
      typeof body.periodDate === "string" ? body.periodDate.trim() : "";

    if (!companyId) {
      return NextResponse.json(
        { error: "companyId is required." },
        { status: 400 }
      );
    }

    if (!label) {
      return NextResponse.json(
        { error: "Period label is required." },
        { status: 400 }
      );
    }

    if (!periodDate) {
      return NextResponse.json(
        { error: "Period date is required." },
        { status: 400 }
      );
    }

    const { data: existingPeriod, error: existingPeriodError } = await supabase
      .from("reporting_periods")
      .select("id")
      .eq("company_id", companyId)
      .eq("period_date", periodDate)
      .limit(1);

    if (existingPeriodError) {
      console.error("Failed to check for existing reporting period", {
        companyId,
        periodDate,
        error: existingPeriodError
      });

      return NextResponse.json(
        { error: existingPeriodError.message || "Reporting period could not be validated." },
        { status: 500 }
      );
    }

    if (Array.isArray(existingPeriod) && existingPeriod.length > 0) {
      return NextResponse.json(
        { error: "A reporting period already exists for that company and date." },
        { status: 409 }
      );
    }

    const { data, error } = await supabase
      .from("reporting_periods")
      .insert({
        company_id: companyId,
        label,
        period_date: periodDate
      })
      .select()
      .single();

    if (error) {
      console.error("Failed to create reporting period", {
        companyId,
        label,
        periodDate,
        error
      });

      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A reporting period already exists for that company and date." },
          { status: 409 }
        );
      }

      if (error.code === "23503") {
        return NextResponse.json(
          { error: "The selected company could not be found." },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: error.message || "Reporting period could not be created." },
        { status: 500 }
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("Unexpected error creating reporting period", { error });

    return NextResponse.json(
      { error: "Reporting period could not be created." },
      { status: 500 }
    );
  }
}
