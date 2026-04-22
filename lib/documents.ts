import { getSupabaseServerClient } from "./supabase.ts";
import type {
  DocumentLink,
  DocumentStatus,
  DocumentSourceKind,
  DocumentType,
  DocumentVersion,
  EntityType,
  SourceDocument
} from "./types.ts";

const SOURCE_DOCUMENT_SELECT = [
  "id",
  "company_id",
  "name",
  "document_type",
  "period_label",
  "fiscal_year",
  "uploaded_at",
  "uploaded_by",
  "source_kind",
  "status",
  "source_type",
  "source_file_name",
  "upload_id",
  "source_currency",
  "source_confidence",
  "created_at"
].join(", ");

const DOCUMENT_LINK_SELECT = [
  "id",
  "company_id",
  "document_id",
  "entity_type",
  "entity_id",
  "created_at"
].join(", ");

const DOCUMENT_VERSION_SELECT = [
  "id",
  "document_id",
  "version_number",
  "file_url",
  "storage_path",
  "uploaded_at"
].join(", ");

export async function getDocumentsForCompany(companyId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("source_documents")
    .select(SOURCE_DOCUMENT_SELECT)
    .eq("company_id", companyId)
    .order("uploaded_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .returns<SourceDocument[]>();

  if (error) {
    console.error("Failed to load documents", { companyId, error });
    return [];
  }

  return Array.isArray(data) ? data : [];
}

export async function getDocumentLinksForCompany(companyId: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from("document_links")
    .select(DOCUMENT_LINK_SELECT)
    .eq("company_id", companyId)
    .order("created_at", { ascending: true })
    .returns<DocumentLink[]>();

  if (error) {
    console.error("Failed to load document links", { companyId, error });
    return [];
  }

  return Array.isArray(data) ? data : [];
}

export async function getDocumentVersionsForCompany(companyId: string) {
  const supabase = getSupabaseServerClient();
  const { data: documents } = await supabase
    .from("source_documents")
    .select("id")
    .eq("company_id", companyId)
    .returns<Array<{ id: string }>>();

  const documentIds = (Array.isArray(documents) ? documents : []).map((row) => row.id);
  if (documentIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("document_versions")
    .select(DOCUMENT_VERSION_SELECT)
    .in("document_id", documentIds)
    .order("version_number", { ascending: false })
    .returns<DocumentVersion[]>();

  if (error) {
    console.error("Failed to load document versions", { companyId, error });
    return [];
  }

  return Array.isArray(data) ? data : [];
}

export function getDocumentDisplayName(document: SourceDocument) {
  return (
    document.name ||
    document.source_file_name ||
    (document.document_type
      ? document.document_type.split("_").join(" ")
      : "Document")
  );
}

export type CreateDocumentInput = {
  companyId: string;
  name: string;
  documentType: DocumentType;
  periodLabel?: string | null;
  fiscalYear?: number | null;
  uploadedBy?: string | null;
  sourceKind?: DocumentSourceKind | null;
  sourceType?: SourceDocument["source_type"];
  sourceFileName?: string | null;
  uploadId?: string | null;
  sourceCurrency?: string | null;
  status?: DocumentStatus;
  initialVersion?: {
    fileUrl?: string | null;
    storagePath?: string | null;
  } | null;
};

export async function createDocument(input: CreateDocumentInput) {
  const supabase = getSupabaseServerClient();
  const uploadedAt = new Date().toISOString();
  const sourceType =
    input.sourceType ??
    (input.documentType === "tax_return" ? "tax_return" : "reported_financials");

  const { data, error } = await supabase
    .from("source_documents")
    .insert({
      company_id: input.companyId,
      name: input.name,
      document_type: input.documentType,
      period_label: input.periodLabel ?? null,
      fiscal_year: input.fiscalYear ?? null,
      uploaded_at: uploadedAt,
      uploaded_by: input.uploadedBy ?? null,
      source_kind: input.sourceKind ?? "manual",
      status: input.status ?? "active",
      source_type: sourceType,
      source_file_name: input.sourceFileName ?? input.name,
      upload_id: input.uploadId ?? null,
      source_currency: input.sourceCurrency ?? null
    })
    .select(SOURCE_DOCUMENT_SELECT)
    .single<SourceDocument>();

  if (error) {
    throw new Error(error.message);
  }

  if (input.initialVersion) {
    await createDocumentVersion({
      documentId: data.id,
      fileUrl: input.initialVersion.fileUrl ?? null,
      storagePath: input.initialVersion.storagePath ?? null
    });
  }

  return data;
}

export async function createDocumentLink(params: {
  companyId: string;
  documentId: string;
  entityType: EntityType;
  entityId: string;
}) {
  const supabase = getSupabaseServerClient();
  const { data: existing } = await supabase
    .from("document_links")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("document_id", params.documentId)
    .eq("entity_type", params.entityType)
    .eq("entity_id", params.entityId)
    .maybeSingle<{ id: string }>();

  if (existing?.id) {
    return existing;
  }

  const { data, error } = await supabase
    .from("document_links")
    .insert({
      company_id: params.companyId,
      document_id: params.documentId,
      entity_type: params.entityType,
      entity_id: params.entityId
    })
    .select(DOCUMENT_LINK_SELECT)
    .single<DocumentLink>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function createDocumentVersion(params: {
  documentId: string;
  fileUrl?: string | null;
  storagePath?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data: versionRows } = await supabase
    .from("document_versions")
    .select("version_number")
    .eq("document_id", params.documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .returns<Array<{ version_number: number }>>();

  const nextVersionNumber = (versionRows?.[0]?.version_number ?? 0) + 1;

  const { data, error } = await supabase
    .from("document_versions")
    .insert({
      document_id: params.documentId,
      version_number: nextVersionNumber,
      file_url: params.fileUrl ?? null,
      storage_path: params.storagePath ?? null
    })
    .select(DOCUMENT_VERSION_SELECT)
    .single<DocumentVersion>();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
