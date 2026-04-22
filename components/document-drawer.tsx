"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BackingChip } from "@/components/backing-chip";
import { getBackingStatusLabel } from "@/lib/backing";
import { getDocumentDisplayName } from "@/lib/documents";
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
  const selectedVersions = useMemo(
    () =>
      selectedDocument
        ? documentVersions.filter((version) => version.document_id === selectedDocument.id)
        : [],
    [documentVersions, selectedDocument]
  );
  const selectedLinks = useMemo(
    () =>
      selectedDocument
        ? documentLinks.filter((link) => link.document_id === selectedDocument.id)
        : [],
    [documentLinks, selectedDocument]
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <button type="button" className="flex-1" onClick={onClose} aria-label="Close drawer" />
      <aside className="h-full w-full max-w-xl overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
              Supporting Documents
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{title}</h3>
            {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {mode === "upload" ? (
          <div className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Document name</label>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="FY2025 income statement"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Storage path or reference
              </label>
              <input
                value={storagePath}
                onChange={(event) => setStoragePath(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
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
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? "Saving..." : "Upload Document"}
            </button>
          </div>
        ) : null}

        {mode === "link" ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="block text-sm font-medium text-slate-700">Existing document</label>
            <select
              value={selectedDocumentId}
              onChange={(event) => setSelectedDocumentId(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
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
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy ? "Linking..." : "Link Existing Document"}
            </button>
          </div>
        ) : null}

        {selectedDocument ? (
          <div className="mt-6 space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {getDocumentDisplayName(selectedDocument)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {selectedDocument.document_type?.split("_").join(" ") ?? "Document"}
                    {selectedDocument.period_label ? ` · ${selectedDocument.period_label}` : ""}
                    {selectedDocument.fiscal_year ? ` · FY${selectedDocument.fiscal_year}` : ""}
                  </p>
                </div>
                <BackingChip status="backed" label="Backed" />
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-600">
                <p>Uploaded at: {selectedDocument.uploaded_at ?? selectedDocument.created_at}</p>
                <p>Source: {selectedDocument.source_kind ?? "manual"}</p>
                <p>Status: {selectedDocument.status ?? "active"}</p>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Linked items</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Current entities supported by this document.
                  </p>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {selectedLinks.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {selectedLinks.length > 0 ? (
                  selectedLinks.map((link) => (
                    <div
                      key={link.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    >
                      {link.entity_type.replaceAll("_", " ")} · {link.entity_id}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
                    No entities linked yet.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Linked issues</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Diligence issues referencing this support set.
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {linkedIssues.length > 0 ? (
                  linkedIssues.map((issue) => (
                    <div
                      key={issue.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    >
                      {issue.title} · {issue.status}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
                    No linked issues yet.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Versions</p>
                  <p className="mt-1 text-sm text-slate-500">
                    Supporting versions for this document record.
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {selectedVersions.length > 0 ? (
                  selectedVersions.map((version) => (
                    <div
                      key={version.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                    >
                      Version {version.version_number}
                      {version.storage_path ? ` · ${version.storage_path}` : ""}
                      {version.file_url ? ` · ${version.file_url}` : ""}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500">
                    No versions recorded yet.
                  </div>
                )}
              </div>
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Upload new version
                </label>
                <input
                  value={storagePath}
                  onChange={(event) => setStoragePath(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
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
                  className="mt-3 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                >
                  {busy ? "Saving..." : "Upload new version"}
                </button>
              </div>
            </section>
          </div>
        ) : mode === "view" ? (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
            {getBackingStatusLabel("unbacked")}: No supporting document selected.
          </div>
        ) : null}
      </aside>
    </div>
  );
}
