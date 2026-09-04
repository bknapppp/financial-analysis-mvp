"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileQuestion, X } from "lucide-react";
import { getBackingStatusLabel } from "@/lib/backing";
import { getDocumentDisplayName } from "@/lib/documents";
import { getDocumentRelationshipState } from "@/lib/document-coverage";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type {
  DocumentLink,
  DocumentVersion,
  EntityType,
  SourceDocument
} from "@/lib/types";

type DocumentDrawerMode = "view" | "upload" | "link";

type DocumentDrawerProps = {
  open: boolean;
  onClose: () => void;
  companyId: string;
  mode: DocumentDrawerMode;
  title: string;
  description?: string | null;
  targetEntityType?: EntityType | null;
  targetEntityId?: string | null;
  targetDocumentType?: SourceDocument["document_type"] | null;
  periodLabel?: string | null;
  fiscalYear?: number | null;
  document?: SourceDocument | null;
  documents: SourceDocument[];
  documentLinks: DocumentLink[];
  documentVersions: DocumentVersion[];
  linkedIssues?: Array<{ id: string; title: string; status: string }>;
};

async function createDocument(payload: Record<string, unknown>) {
  const response = await fetch("/api/documents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(result.error || "Document could not be created.");
  }
}

async function createDocumentLink(payload: Record<string, unknown>) {
  const response = await fetch("/api/document-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(result.error || "Document could not be linked.");
  }
}

async function addDocumentVersion(documentId: string, payload: Record<string, unknown>) {
  const response = await fetch(`/api/documents/${documentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(result.error || "Document version could not be added.");
  }
}

export function DocumentDrawer({
  open,
  onClose,
  companyId,
  mode,
  title,
  description = null,
  targetEntityType = null,
  targetEntityId = null,
  targetDocumentType = null,
  periodLabel = null,
  fiscalYear = null,
  document = null,
  documents,
  documentLinks,
  documentVersions,
  linkedIssues = []
}: DocumentDrawerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(document ? getDocumentDisplayName(document) : "");
  const [storagePath, setStoragePath] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState(document?.id ?? "");

  const selectedDocument = useMemo(
    () => document ?? documents.find((item) => item.id === selectedDocumentId) ?? null,
    [document, documents, selectedDocumentId]
  );
  const relationshipState = useMemo(
    () => getDocumentRelationshipState({ document: selectedDocument, documentLinks, documentVersions }),
    [documentLinks, documentVersions, selectedDocument]
  );
  const selectedVersions = relationshipState.versions;
  const selectedLinks = relationshipState.links;

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-bs-text-primary/30">
      <button type="button" className="flex-1" onClick={onClose} aria-label="Close drawer" />
      <aside aria-label="Supporting documents" className="h-full w-full max-w-xl overflow-y-auto border-l border-bs-border-subtle bg-bs-surface p-4 shadow-2xl md:p-5">
        <p className="bs-label mb-2">Supporting documents</p>
        <SectionHeader
          title={title}
          description={description ?? undefined}
          actions={<button type="button" onClick={onClose} aria-label="Close supporting documents" className="inline-flex size-8 items-center justify-center rounded-bs-sm border border-bs-border-strong text-bs-text-secondary hover:bg-bs-page"><X className="size-3.5" /></button>}
        />

        {error ? (
          <div role="alert" className="mt-4 rounded-bs-sm border border-bs-danger/20 bg-bs-danger/10 px-4 py-3 text-xs text-bs-danger">
            {error}
          </div>
        ) : null}

        {mode === "upload" ? (
          <ContentCard className="mt-4 space-y-4" padding="compact">
            <SectionHeader title="Register source document" description="Record document metadata and an optional storage reference." />
            <div>
              <label className="bs-label mb-1 block">Document name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="min-h-9 w-full rounded-bs-sm border border-bs-border-strong bg-bs-surface px-2.5 text-xs text-bs-text-primary outline-none focus:border-bs-primary"
                placeholder="FY2025 income statement"
              />
            </div>
            <div>
              <label className="bs-label mb-1 block">
                Storage path or reference
              </label>
              <input
                value={storagePath}
                onChange={(event) => setStoragePath(event.target.value)}
                className="min-h-9 w-full rounded-bs-sm border border-bs-border-strong bg-bs-surface px-2.5 text-xs text-bs-text-primary outline-none focus:border-bs-primary"
                placeholder="uploads/fy2025-income-statement.pdf"
              />
            </div>
            <button
              type="button"
              disabled={busy || !name.trim() || !targetDocumentType}
              onClick={async () => {
                if (!targetDocumentType) return;
                setBusy(true);
                setError(null);
                try {
                  await createDocument({
                    companyId,
                    name: name.trim(),
                    documentType: targetDocumentType,
                    periodLabel,
                    fiscalYear,
                    sourceKind: "manual",
                    sourceFileName: name.trim(),
                    initialVersion: storagePath.trim()
                      ? { storagePath: storagePath.trim() }
                      : undefined,
                    linkTargets:
                      targetEntityType && targetEntityId
                        ? [{ entityType: targetEntityType, entityId: targetEntityId }]
                        : []
                  });
                  router.refresh();
                  onClose();
                } catch (nextError) {
                  setError(nextError instanceof Error ? nextError.message : "Upload failed.");
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex min-h-8 items-center justify-center rounded-bs-sm bg-bs-primary px-3 text-xs font-medium text-white hover:bg-bs-primary-hover disabled:opacity-60"
            >
              {busy ? "Saving..." : "Upload Document"}
            </button>
          </ContentCard>
        ) : null}

        {mode === "link" ? (
          <ContentCard className="mt-4 space-y-3" padding="compact">
            <SectionHeader title="Link existing document" description="Associate an authoritative document with this diligence requirement." />
            <label className="bs-label block">Existing document</label>
            <select
              value={selectedDocumentId}
              onChange={(event) => setSelectedDocumentId(event.target.value)}
              className="min-h-9 w-full rounded-bs-sm border border-bs-border-strong bg-bs-surface px-2.5 text-xs text-bs-text-primary outline-none focus:border-bs-primary"
            >
              <option value="">Select a document</option>
              {documents.map((item) => (
                <option key={item.id} value={item.id}>
                  {getDocumentDisplayName(item)}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !selectedDocumentId || !targetEntityType || !targetEntityId}
              onClick={async () => {
                if (!targetEntityType || !targetEntityId) return;
                setBusy(true);
                setError(null);
                try {
                  await createDocumentLink({
                    companyId,
                    documentId: selectedDocumentId,
                    entityType: targetEntityType,
                    entityId: targetEntityId
                  });
                  router.refresh();
                  onClose();
                } catch (nextError) {
                  setError(nextError instanceof Error ? nextError.message : "Link failed.");
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex min-h-8 items-center justify-center rounded-bs-sm bg-bs-primary px-3 text-xs font-medium text-white hover:bg-bs-primary-hover disabled:opacity-60"
            >
              {busy ? "Linking..." : "Link Existing Document"}
            </button>
          </ContentCard>
        ) : null}

        {selectedDocument ? (
          <div className="mt-6 space-y-5">
            <ContentCard padding="compact">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-bs-text-primary">
                    {getDocumentDisplayName(selectedDocument)}
                  </p>
                  <p className="mt-1 text-sm text-bs-text-secondary">
                    {selectedDocument.document_type?.split("_").join(" ") ?? "Document"}
                    {selectedDocument.period_label ? ` · ${selectedDocument.period_label}` : ""}
                    {selectedDocument.fiscal_year ? ` · FY${selectedDocument.fiscal_year}` : ""}
                  </p>
                </div>
                <StatusBadge tone="success">Provided</StatusBadge>
              </div>
              <div className="mt-3 grid gap-1.5 text-xs text-bs-text-secondary">
                <p>Uploaded at: {selectedDocument.uploaded_at ?? selectedDocument.created_at}</p>
                <p>Source: {selectedDocument.source_kind ?? "manual"}</p>
                <p>Status: {selectedDocument.status ?? "active"}</p>
              </div>
            </ContentCard>

            <section className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-bs-text-primary">Linked items</p>
                  <p className="mt-1 text-sm text-bs-text-muted">
                    Current entities supported by this document.
                  </p>
                </div>
                <span className="rounded-full border border-bs-border-subtle bg-bs-page px-3 py-1 text-xs font-medium text-bs-text-secondary">
                  {selectedLinks.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {selectedLinks.length > 0 ? (
                  selectedLinks.map((link) => (
                    <div
                      key={link.id}
                      className="rounded-bs-sm border border-bs-border-subtle bg-bs-page px-3 py-2 text-sm text-bs-text-secondary"
                    >
                      {link.entity_type.replaceAll("_", " ")} · {link.entity_id}
                    </div>
                  ))
                ) : (
                  <div className="rounded-bs-sm border border-dashed border-bs-border-strong px-3 py-2 text-sm text-bs-text-muted">
                    No diligence areas linked yet.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-bs-text-primary">Linked issues</p>
                  <p className="mt-1 text-sm text-bs-text-muted">
                    Diligence issues referencing this support set.
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {linkedIssues.length > 0 ? (
                  linkedIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-bs-sm border border-bs-border-subtle bg-bs-page px-3 py-2 text-sm text-bs-text-secondary"
                    >
                      {issue.title} · {issue.status}
                    </div>
                  ))
                ) : (
                  <div className="rounded-bs-sm border border-dashed border-bs-border-strong px-3 py-2 text-sm text-bs-text-muted">
                    No linked issues yet.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-bs-text-primary">Versions</p>
                  <p className="mt-1 text-sm text-bs-text-muted">
                    Supporting versions for this document record.
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {selectedVersions.length > 0 ? (
                  selectedVersions.map((version) => (
                    <div
                      key={version.id}
                      className="rounded-bs-sm border border-bs-border-subtle bg-bs-page px-3 py-2 text-sm text-bs-text-secondary"
                    >
                      Version {version.version_number}
                      {version.storage_path ? ` · ${version.storage_path}` : ""}
                      {version.file_url ? ` · ${version.file_url}` : ""}
                    </div>
                  ))
                ) : (
                  <div className="rounded-bs-sm border border-dashed border-bs-border-strong px-3 py-2 text-sm text-bs-text-muted">
                    No versions recorded yet.
                  </div>
                )}
              </div>
              <div className="mt-4 rounded-bs-sm border border-bs-border-subtle bg-bs-page p-3">
                <label className="mb-1 block text-sm font-medium text-bs-text-secondary">
                  Upload new version
                </label>
                <input
                  value={storagePath}
                  onChange={(event) => setStoragePath(event.target.value)}
                  className="w-full rounded-bs-sm border border-bs-border-subtle bg-bs-surface px-3 py-2 text-sm text-bs-text-primary outline-none focus:border-bs-primary"
                  placeholder="uploads/fy2025-income-statement-v2.pdf"
                />
                <button
                  type="button"
                  disabled={busy || !selectedDocument.id || !storagePath.trim()}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      await addDocumentVersion(selectedDocument.id, {
                        storagePath: storagePath.trim()
                      });
                      router.refresh();
                      setStoragePath("");
                    } catch (nextError) {
                      setError(
                        nextError instanceof Error ? nextError.message : "Version upload failed."
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="mt-3 rounded-bs-sm border border-bs-border-subtle px-3 py-2 text-sm font-medium text-bs-text-secondary hover:bg-bs-surface disabled:opacity-60"
                >
                  {busy ? "Saving..." : "Upload new version"}
                </button>
              </div>
            </section>
          </div>
        ) : mode === "view" ? (
          <EmptyState density="compact" icon={FileQuestion} title={getBackingStatusLabel("unbacked")} description="No supporting document is selected for this requirement." />
        ) : null}
      </aside>
    </div>
  );
}
