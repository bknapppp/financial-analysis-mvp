"use client";

import { useMemo, useState } from "react";
import { FileCheck2, FolderOpen } from "lucide-react";
import { BackingChip } from "@/components/backing-chip";
import { DocumentDrawer } from "@/components/document-drawer";
import { getDocumentDisplayName } from "@/lib/documents";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getRequirementLeadDocument,
  groupDocumentRequirements,
  summarizeDocumentCoverage
} from "@/lib/document-coverage";
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
  const groupedRows = useMemo(() => groupDocumentRequirements(rows), [rows]);
  const summary = useMemo(() => summarizeDocumentCoverage(rows), [rows]);
  const coverageReady = summary.unbacked === 0 && summary.partial === 0 && rows.length > 0;

  return (
    <>
      <details className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4 shadow-bs-subtle">
        <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 border-b border-bs-border-subtle pb-3">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="bs-section-title">Document Coverage</h2>
              <StatusBadge tone={coverageReady ? "success" : "warning"}>
                {coverageReady ? "Coverage complete" : "Review required"}
              </StatusBadge>
            </div>
            <p className="bs-metadata mt-1">Expected source materials, current support, and outstanding diligence coverage.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="success">{summary.backed} provided</StatusBadge>
            <StatusBadge tone="warning">{summary.partial} partial</StatusBadge>
            <StatusBadge tone={summary.unbacked > 0 ? "danger" : "neutral"}>{summary.unbacked} missing</StatusBadge>
          </div>
        </summary>

        {rows.length === 0 ? <EmptyState
          density="compact"
          icon={FolderOpen}
          title="No document requirements"
          description="No source-material requirements are configured for the selected deal and period."
        /> : <div className="mt-4 space-y-5">
          {Object.entries(groupedRows).map(([groupLabel, groupRows]) => (
            <section key={groupLabel}>
              <div className="flex items-center gap-2"><FileCheck2 className="size-3.5 text-bs-text-muted" /><h3 className="bs-label">{groupLabel}</h3></div>
              <div className="mt-3 space-y-2">
                {groupRows.map((row) => {
                  const leadDocument = getRequirementLeadDocument(row);
                  const primaryActionLabel = leadDocument ? "View details" : "Upload document";

                  return (
                    <div
                      key={row.id}
                      className="rounded-bs-sm border border-bs-border-subtle bg-bs-page px-3 py-3"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold text-bs-text-primary">
                              {row.label}
                              {row.periodLabel ? ` (${row.periodLabel})` : ""}
                            </p>
                            <BackingChip status={row.status} size="compact" />
                          </div>
                          <p className="bs-metadata mt-1">
                            {leadDocument
                              ? `Support: ${getDocumentDisplayName(leadDocument)}`
                              : row.missingReason ?? "Support: No supporting documents linked"}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setDrawerState({
                                mode: leadDocument ? "view" : "upload",
                                row,
                                document: leadDocument
                              })
                            }
                            className="inline-flex min-h-8 items-center rounded-bs-sm bg-bs-primary px-3 text-xs font-medium text-white hover:bg-bs-primary-hover"
                          >
                            {primaryActionLabel}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDrawerState({ mode: "link", row, document: leadDocument })}
                            className="inline-flex min-h-8 items-center rounded-bs-sm border border-bs-border-strong bg-bs-surface px-3 text-xs font-medium text-bs-text-secondary hover:bg-bs-page"
                          >
                            Link existing
                          </button>
                          {leadDocument ? (
                            <button
                              type="button"
                              onClick={() => setDrawerState({ mode: "upload", row, document: leadDocument })}
                              className="inline-flex min-h-8 items-center rounded-bs-sm border border-bs-border-strong bg-bs-surface px-3 text-xs font-medium text-bs-text-secondary hover:bg-bs-page"
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
        </div>}
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
