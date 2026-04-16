import { NextRequest, NextResponse } from "next/server";
import { ADD_BACK_SELECT, isAddBacksSchemaError } from "@/lib/add-back-schema";
import { captureDealMemorySnapshotSafely } from "@/lib/deal-memory-capture";
import { getSupabaseServerClient } from "@/lib/supabase";
import type {
  AddBack,
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

function buildPostValidationErrors(params: {
  companyId?: string;
  periodId?: string;
  type: AddBackType | null;
  description?: string;
  amount: number;
  classificationConfidence: AddBackClassificationConfidence | null;
  source: AddBackSource | null;
  status: AddBackStatus | null;
  justification?: string;
}) {
  const fields: Record<string, string> = {};

  if (!params.companyId) {
    fields.companyId = "Required";
  }

  if (!params.periodId) {
    fields.periodId = "Required";
  }

  if (!params.type) {
    fields.type = "Invalid or missing";
  }

  if (!params.description) {
    fields.description = "Required";
  }

  if (!Number.isFinite(params.amount)) {
    fields.amount = "Must be a valid number";
  }

  if (!params.classificationConfidence) {
    fields.classificationConfidence = "Invalid or missing";
  }

  if (!params.source) {
    fields.source = "Invalid or missing";
  }

  if (!params.status) {
    fields.status = "Invalid or missing";
  }

  if (!params.justification) {
    fields.justification = "Required";
  }

  return fields;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  const periodId = searchParams.get("periodId");

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  let query = supabase
    .from("add_backs")
    .select(ADD_BACK_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (periodId) {
    query = query.eq("period_id", periodId);
  }

  const { data, error } = await query.returns<AddBack[]>();

  if (error) {
    if (isAddBacksSchemaError(error)) {
      return NextResponse.json({ data: [] });
    }

    console.error("Failed to load add-backs", { companyId, periodId, error });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: Array.isArray(data) ? data : [] });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      periodId?: string;
      linkedEntryId?: string | null;
      type?: string;
      description?: string;
      amount?: number | string;
      classificationConfidence?: string;
      source?: string;
      status?: string;
      justification?: string;
      supportingReference?: string | null;
    };

    const companyId = body.companyId?.trim();
    const periodId = body.periodId?.trim();
    const linkedEntryId = body.linkedEntryId?.trim() || null;
    const type = parseType(body.type);
    const description = body.description?.trim();
    const amount = Number(body.amount);
    const classificationConfidence = parseConfidence(body.classificationConfidence);
    const source = parseSource(body.source);
    const status = parseStatus(body.status);
    const justification = body.justification?.trim();
    const supportingReference = body.supportingReference?.trim() || null;

    const fields = buildPostValidationErrors({
      companyId,
      periodId,
      type,
      description,
      amount,
      classificationConfidence,
      source,
      status,
      justification
    });

    if (Object.keys(fields).length > 0) {
      return NextResponse.json(
        { error: "Validation failed", fields },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    if (linkedEntryId) {
      const existingSuggestion = await supabase
        .from("add_backs")
        .select(ADD_BACK_SELECT)
        .eq("company_id", companyId)
        .eq("period_id", periodId)
        .eq("linked_entry_id", linkedEntryId)
        .eq("type", type)
        .limit(1)
        .returns<AddBack[]>();

      if (existingSuggestion.error && !isAddBacksSchemaError(existingSuggestion.error)) {
        console.error("Failed to check existing add-back", {
          companyId,
          periodId,
          linkedEntryId,
          error: existingSuggestion.error
        });

        return NextResponse.json(
          { error: existingSuggestion.error.message },
          { status: 500 }
        );
      }

      const current = Array.isArray(existingSuggestion.data)
        ? (existingSuggestion.data[0] ?? null)
        : null;

      if (current) {
        const { data, error } = await supabase
          .from("add_backs")
          .update({
            description,
            amount,
            classification_confidence: classificationConfidence,
            source,
            status,
            justification,
            supporting_reference: supportingReference,
            updated_at: new Date().toISOString()
          })
          .eq("id", current.id)
          .select(ADD_BACK_SELECT)
          .single();

        if (error) {
          console.error("Failed to update existing add-back", {
            id: current.id,
            error
          });
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const shouldCapture =
          current.status === "accepted" || status === "accepted";

        if (shouldCapture && typeof companyId === "string") {
          await captureDealMemorySnapshotSafely(
            companyId,
            "add-backs:update-existing-add-back"
          );
        }

        return NextResponse.json({ data }, { status: 200 });
      }
    }

    const { data, error } = await supabase
      .from("add_backs")
      .insert({
        company_id: companyId,
        period_id: periodId,
        linked_entry_id: linkedEntryId,
        type,
        description,
        amount,
        classification_confidence: classificationConfidence,
        source,
        status,
        justification,
        supporting_reference: supportingReference
      })
      .select(ADD_BACK_SELECT)
      .single();

    if (error) {
      if (isAddBacksSchemaError(error)) {
        return NextResponse.json(
          { error: "Add-backs table is not available yet. Run the latest Supabase migration first." },
          { status: 400 }
        );
      }

      console.error("Failed to create add-back", { companyId, periodId, error });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (status === "accepted" && typeof companyId === "string") {
      await captureDealMemorySnapshotSafely(
        companyId,
        "add-backs:create-accepted-add-back"
      );
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    console.error("Unexpected error creating add-back", { error });
    return NextResponse.json(
      { error: "Add-back could not be created." },
      { status: 500 }
    );
  }
}
