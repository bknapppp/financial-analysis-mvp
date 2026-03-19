import { NextRequest, NextResponse } from "next/server";
import { ADD_BACK_SELECT } from "@/lib/add-back-schema";
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  AddBackClassificationConfidence,
  AddBackSource,
  AddBackStatus,
  AddBackType
} from "@/lib/types";

const ADD_BACK_TYPES: AddBackType[] = [
  "owner_related",
  "non_recurring",
  "discretionary",
  "non_operating",
  "accounting_normalization",
  "run_rate_adjustment"
];

const ADD_BACK_STATUSES: AddBackStatus[] = ["suggested", "accepted", "rejected"];
const ADD_BACK_SOURCES: AddBackSource[] = ["system", "user"];
const CONFIDENCE_LEVELS: AddBackClassificationConfidence[] = [
  "high",
  "medium",
  "low"
];

function parseType(value: unknown) {
  return typeof value === "string" && ADD_BACK_TYPES.includes(value as AddBackType)
    ? (value as AddBackType)
    : null;
}

function parseStatus(value: unknown) {
  return typeof value === "string" && ADD_BACK_STATUSES.includes(value as AddBackStatus)
    ? (value as AddBackStatus)
    : null;
}

function parseSource(value: unknown) {
  return typeof value === "string" && ADD_BACK_SOURCES.includes(value as AddBackSource)
    ? (value as AddBackSource)
    : null;
}

function parseConfidence(value: unknown) {
  return typeof value === "string" &&
    CONFIDENCE_LEVELS.includes(value as AddBackClassificationConfidence)
    ? (value as AddBackClassificationConfidence)
    : null;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      type?: string;
      description?: string;
      amount?: number | string;
      classificationConfidence?: string;
      source?: string;
      status?: string;
      justification?: string;
      supportingReference?: string | null;
    };

    const updates: Record<string, string | number | null> = {
      updated_at: new Date().toISOString()
    };

    if (body.type !== undefined) {
      const type = parseType(body.type);
      if (!type) {
        return NextResponse.json({ error: "Invalid add-back type." }, { status: 400 });
      }
      updates.type = type;
    }

    if (body.description !== undefined) {
      const description = body.description.trim();
      if (!description) {
        return NextResponse.json({ error: "Description is required." }, { status: 400 });
      }
      updates.description = description;
    }

    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount)) {
        return NextResponse.json({ error: "Amount must be numeric." }, { status: 400 });
      }
      updates.amount = amount;
    }

    if (body.classificationConfidence !== undefined) {
      const confidence = parseConfidence(body.classificationConfidence);
      if (!confidence) {
        return NextResponse.json(
          { error: "Invalid classification confidence." },
          { status: 400 }
        );
      }
      updates.classification_confidence = confidence;
    }

    if (body.source !== undefined) {
      const source = parseSource(body.source);
      if (!source) {
        return NextResponse.json({ error: "Invalid add-back source." }, { status: 400 });
      }
      updates.source = source;
    }

    if (body.status !== undefined) {
      const status = parseStatus(body.status);
      if (!status) {
        return NextResponse.json({ error: "Invalid add-back status." }, { status: 400 });
      }
      updates.status = status;
    }

    if (body.justification !== undefined) {
      const justification = body.justification.trim();
      if (!justification) {
        return NextResponse.json(
          { error: "Justification is required." },
          { status: 400 }
        );
      }
      updates.justification = justification;
    }

    if (body.supportingReference !== undefined) {
      updates.supporting_reference = body.supportingReference?.trim() || null;
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("add_backs")
      .update(updates)
      .eq("id", id)
      .select(ADD_BACK_SELECT)
      .single();

    if (error) {
      console.error("Failed to update add-back", { id, error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error("Unexpected error updating add-back", { error });
    return NextResponse.json(
      { error: "Add-back could not be updated." },
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
    const existing = await supabase
      .from("add_backs")
      .select("id, source")
      .eq("id", id)
      .single<{ id: string; source: AddBackSource }>();

    if (existing.error) {
      console.error("Failed to load add-back before delete", { id, error: existing.error });
      return NextResponse.json({ error: existing.error.message }, { status: 500 });
    }

    if (existing.data.source !== "user") {
      return NextResponse.json(
        { error: "Only manual add-backs can be deleted." },
        { status: 400 }
      );
    }

    const { error } = await supabase.from("add_backs").delete().eq("id", id);

    if (error) {
      console.error("Failed to delete add-back", { id, error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unexpected error deleting add-back", { error });
    return NextResponse.json(
      { error: "Add-back could not be deleted." },
      { status: 500 }
    );
  }
}
