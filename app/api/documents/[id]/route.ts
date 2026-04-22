import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createDocumentVersion } from "@/lib/documents";
import { getSupabaseServerClient } from "@/lib/supabase";
import type { SourceDocument } from "@/lib/types";

function revalidateDealPaths(companyId: string) {
  revalidatePath(`/deal/${companyId}`);
  revalidatePath(`/deal/${companyId}/underwriting`);
  revalidatePath(`/financials?companyId=${companyId}`);
  revalidatePath(`/source-data?companyId=${companyId}`);
  revalidatePath("/deals");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      storagePath?: string | null;
      fileUrl?: string | null;
    };

    const supabase = getSupabaseServerClient();
    const { data: document, error } = await supabase
      .from("source_documents")
      .select("id, company_id")
      .eq("id", id)
      .single<Pick<SourceDocument, "id" | "company_id">>();

    if (error || !document) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const version = await createDocumentVersion({
      documentId: id,
      storagePath: body.storagePath ?? null,
      fileUrl: body.fileUrl ?? null
    });

    revalidateDealPaths(document.company_id);
    return NextResponse.json({ data: version });
  } catch (error) {
    console.error("Failed to add document version", { error });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Version could not be added." },
      { status: 500 }
    );
  }
}
