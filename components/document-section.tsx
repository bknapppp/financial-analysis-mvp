"use client";

import { useMemo, useState } from "react";
import { BackingChip } from "@/components/backing-chip";
import { DocumentDrawer } from "@/components/document-drawer";
import { getDocumentDisplayName } from "@/lib/documents";
import type {
  DiligenceIssue,
  DocumentLink,
  DocumentVersion,
  SourceDocument,
  SourceRequirementBacking
} from "@/lib/types";

type DocumentSectionProps = {
  companyId: string;
  rows: SourceRequirementBacking[];
  documents: SourceDocument[];
  documentLinks: DocumentLink[];
  documentVersions: DocumentVersion[];
  issues: DiligenceIssue[];
};

type DrawerState =
  | {
      mode: "view" | "upload" | "link";
      row: SourceRequirementBacking;
      document?: SourceDocument | null;
    }
  | null;

export function DocumentSection({
  companyId,
  rows,
  documents,
  documentLinks,
  documentVersions,
  issues
}: DocumentSectionProps) {
  const [drawerState, setDrawerState] = useState<DrawerState>(null);
  const groupedRows = useMemo(() => {
    return rows.reduce<Record<string, SourceRequirementBacking[]>>((acc, row) => {
      acc[row.groupLabel] = acc[row.groupLabel] ?? [];
      acc[row.groupLabel]?.push(row);
      return acc;
    }, {});
  }, [rows]);
  const summary = useMemo(
    () => ({
      backed: rows.filter((row) => row.status === "backed").length,
      partial: rows.filter((row) => row.status === "partial").length,
      unbacked: rows.filter((row) => row.status === "unbacked").length
    }),
    [rows]
  );

  return (
    <>
      <details className="rounded-[1.6rem] border border-slate-200/80 bg-white p-4 shadow-panel">
        <summary className="flex cursor-pointer list-none flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
              Step 1
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Document Coverage</h2>
            <p className="mt-1 text-sm text-slate-600">
              Complete the required source package and link support where it matters.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {summary.backed} backed
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {summary.partial} partial
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {summary.unbacked} missing
            </span>
          </div>
        </summary>

        <div className="mt-4 space-y-5">
          {Object.entries(groupedRows).map(([groupLabel, groupRows]) => (
            <section key={groupLabel}>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                {groupLabel}
              </p>
              <div className="mt-3 space-y-2">
                {groupRows.map((row) => {
                  const leadDocument = row.linkedDocuments[0] ?? row.documents[0] ?? null;
                  const primaryActionLabel = leadDocument ? "View details" : "Upload document";

                  return (
                    <div
                      key={row.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {row.label}
                              {row.periodLabel ? ` (${row.periodLabel})` : ""}
                            </p>
                            <BackingChip status={row.status} size="compact" />
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {leadDocument
                              ? `Support: ${getDocumentDisplayName(leadDocument)}`
                              : row.missingReason ?? "Support: No supporting documents linked"}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          <button
                            type="button"
                            onClick={() =>
                              setDrawerState({
                                mode: leadDocument ? "view" : "upload",
                                row,
                                document: leadDocument
                              })
                            }
                            className="rounded-xl bg-white px-3 py-2 font-medium text-slate-900 hover:bg-slate-100"
                          >
                            {primaryActionLabel}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrawerState({ mode: "link", row, document: leadDocument })}
                            className="font-medium text-slate-600 hover:text-slate-900"
                          >
                            Link existing
                          </button>
                          {leadDocument ? (
                            <button
                              type="button"
                              onClick={() => setDrawerState({ mode: "upload", row, document: leadDocument })}
                              className="font-medium text-slate-600 hover:text-slate-900"
                            >
                              Upload new version
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </details>

      <DocumentDrawer
        open={Boolean(drawerState)}
        onClose={() => setDrawerState(null)}
        companyId={companyId}
        mode={drawerState?.mode ?? "view"}
        title={drawerState?.row.label ?? "Supporting documents"}
        description={drawerState?.row.missingReason ?? null}
        targetEntityType={drawerState?.row.actionTarget.entityType ?? null}
        targetEntityId={drawerState?.row.actionTarget.entityId ?? null}
        targetDocumentType={drawerState?.row.documentTypes[0] ?? null}
        periodLabel={drawerState?.row.periodLabel ?? null}
        fiscalYear={drawerState?.row.fiscalYear ?? null}
        document={drawerState?.document ?? null}
        documents={documents}
        documentLinks={documentLinks}
        documentVersions={documentVersions}
        linkedIssues={issues
          .filter((issue) => issue.linked_field === drawerState?.row.id)
          .map((issue) => ({
            id: issue.id,
            title: issue.title,
            status: issue.status
          }))}
      />
    </>
  );
}
