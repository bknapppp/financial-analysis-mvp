import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createDocumentLink, getDocumentLinksForCompany } from "@/lib/documents";
import { captureDealMemorySnapshotSafely } from "@/lib/deal-memory-capture";
import type { EntityType } from "@/lib/types";

const ENTITY_TYPES: EntityType[] = [
  "source_requirement",
  "financial_line_item",
  "underwriting_adjustment",
  "issue",
  "underwriting_metric"
];

function revalidateDealPaths(companyId: string) {
  revalidatePath(`/deal/${companyId}`);
  revalidatePath(`/deal/${companyId}/underwriting`);
  revalidatePath(`/financials?companyId=${companyId}`);
  revalidatePath(`/source-data?companyId=${companyId}`);
  revalidatePath("/deals");
}

function isEntityType(value: unknown): value is EntityType {
  return typeof value === "string" && ENTITY_TYPES.includes(value as EntityType);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId")?.trim() ?? "";

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required." }, { status: 400 });
  }

  const links = await getDocumentLinksForCompany(companyId);
  return NextResponse.json({ data: links });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      documentId?: string;
      entityType?: string;
      entityId?: string;
    };

    const companyId = body.companyId?.trim() ?? "";
    const documentId = body.documentId?.trim() ?? "";
    const entityId = body.entityId?.trim() ?? "";

    if (!companyId || !documentId || !entityId || !isEntityType(body.entityType)) {
      return NextResponse.json(
        { error: "companyId, documentId, entityType, and entityId are required." },
        { status: 400 }
      );
    }

    const link = await createDocumentLink({
      companyId,
      documentId,
      entityType: body.entityType,
      entityId
    });

    await captureDealMemorySnapshotSafely(companyId, "documents:link");
    revalidateDealPaths(companyId);

    return NextResponse.json({ data: link }, { status: 201 });
  } catch (error) {
    console.error("Failed to create document link", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Document link could not be created." },
      { status: 500 }
    );
  }
}
