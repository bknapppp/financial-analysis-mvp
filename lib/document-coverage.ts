import type {
  DocumentLink,
  DocumentVersion,
  SourceDocument,
  SourceRequirementBacking
} from "./types.ts";

export function summarizeDocumentCoverage(rows: SourceRequirementBacking[]) {
  return {
    backed: rows.filter((row) => row.status === "backed").length,
    partial: rows.filter((row) => row.status === "partial").length,
    unbacked: rows.filter((row) => row.status === "unbacked").length
  };
}

export function groupDocumentRequirements(rows: SourceRequirementBacking[]) {
  return rows.reduce<Record<string, SourceRequirementBacking[]>>((groups, row) => {
    groups[row.groupLabel] = groups[row.groupLabel] ?? [];
    groups[row.groupLabel]?.push(row);
    return groups;
  }, {});
}

export function getRequirementLeadDocument(row: SourceRequirementBacking) {
  return row.linkedDocuments[0] ?? row.documents[0] ?? null;
}

export function getDocumentRelationshipState(params: {
  document: SourceDocument | null;
  documentLinks: DocumentLink[];
  documentVersions: DocumentVersion[];
}) {
  if (!params.document) {
    return { links: [], versions: [] };
  }

  return {
    links: params.documentLinks.filter(
      (link) => link.document_id === params.document?.id
    ),
    versions: params.documentVersions.filter(
      (version) => version.document_id === params.document?.id
    )
  };
}
