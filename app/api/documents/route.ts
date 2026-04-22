import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createDocument, createDocumentLink, getDocumentsForCompany } from "@/lib/documents";
import { captureDealMemorySnapshotSafely } from "@/lib/deal-memory-capture";
import type { DocumentType, EntityType } from "@/lib/types";

const DOCUMENT_TYPES: DocumentType[] = [
  "income_statement",
  "balance_sheet",
  "cash_flow",
  "tax_return",
  "bank_statement",
  "debt_schedule",
  "payroll_report",
  "loan_agreement",
  "other"
];

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

function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === "string" && DOCUMENT_TYPES.includes(value as DocumentType);
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

  const documents = await getDocumentsForCompany(companyId);
  return NextResponse.json({ data: documents });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      companyId?: string;
      name?: string;
      documentType?: string;
      periodLabel?: string | null;
      fiscalYear?: number | null;
      sourceKind?: "manual" | "import" | "integration" | null;
      sourceFileName?: string | null;
      initialVersion?: {
        fileUrl?: string | null;
        storagePath?: string | null;
      } | null;
      linkTargets?: Array<{
        entityType?: string;
        entityId?: string;
      }>;
    };

    const companyId = body.companyId?.trim() ?? "";
    const name = body.name?.trim() ?? "";

    if (!companyId || !name || !isDocumentType(body.documentType)) {
      return NextResponse.json(
        { error: "companyId, name, and a valid documentType are required." },
        { status: 400 }
      );
    }

    const document = await createDocument({
      companyId,
      name,
      documentType: body.documentType,
      periodLabel: body.periodLabel ?? null,
      fiscalYear: body.fiscalYear ?? null,
      sourceKind: body.sourceKind ?? "manual",
      sourceFileName: body.sourceFileName ?? null,
      initialVersion: body.initialVersion ?? null
    });

    const linkTargets = Array.isArray(body.linkTargets) ? body.linkTargets : [];
    for (const target of linkTargets) {
      if (!isEntityType(target.entityType) || !target.entityId?.trim()) {
        continue;
      }

      await createDocumentLink({
        companyId,
        documentId: document.id,
        entityType: target.entityType,
        entityId: target.entityId.trim()
      });
    }

    await captureDealMemorySnapshotSafely(companyId, "documents:create");
    revalidateDealPaths(companyId);

    return NextResponse.json({ data: document }, { status: 201 });
  } catch (error) {
    console.error("Failed to create document", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Document could not be created." },
      { status: 500 }
    );
  }
}
