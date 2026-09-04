import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  getDocumentRelationshipState,
  getRequirementLeadDocument,
  groupDocumentRequirements,
  summarizeDocumentCoverage
} from "./document-coverage.ts";
import type { SourceDocument, SourceRequirementBacking } from "./types.ts";

const document: SourceDocument = {
  id: "doc-1", company_id: "company-1", name: "FY2025 Income Statement",
  document_type: "income_statement", period_label: "FY2025", fiscal_year: 2025,
  uploaded_at: "2026-09-01T12:00:00.000Z", uploaded_by: null,
  source_kind: "manual", status: "active", source_type: "reported_financials",
  source_file_name: "income-statement.pdf", upload_id: null, source_currency: "USD",
  source_confidence: "high", created_at: "2026-09-01T12:00:00.000Z"
};

function requirement(id: string, status: "backed" | "partial" | "unbacked", linked = false): SourceRequirementBacking {
  return {
    id, label: id, groupLabel: "Financial statements", documentTypes: ["income_statement"],
    periodLabel: "FY2025", fiscalYear: 2025, status,
    documents: linked ? [document] : [], linkedDocuments: linked ? [document] : [],
    missingReason: linked ? null : "No supporting documents linked.",
    actionTarget: { entityType: "source_requirement", entityId: id }
  };
}

test("summarizes, groups, and distinguishes satisfied from missing requirements", () => {
  const rows = [requirement("income_statement", "backed", true), requirement("balance_sheet", "partial"), requirement("cash_flow", "unbacked")];
  assert.deepEqual(summarizeDocumentCoverage(rows), { backed: 1, partial: 1, unbacked: 1 });
  assert.equal(groupDocumentRequirements(rows)["Financial statements"].length, 3);
  assert.equal(getRequirementLeadDocument(rows[0])?.id, "doc-1");
  assert.equal(getRequirementLeadDocument(rows[2]), null);
});

test("filters document versions and evidence links by selected document", () => {
  const state = getDocumentRelationshipState({
    document,
    documentLinks: [
      { id: "link-1", company_id: "company-1", document_id: "doc-1", entity_type: "source_requirement", entity_id: "income_statement", created_at: "2026-09-01T12:00:00.000Z" },
      { id: "link-2", company_id: "company-1", document_id: "doc-2", entity_type: "source_requirement", entity_id: "balance_sheet", created_at: "2026-09-01T12:00:00.000Z" }
    ],
    documentVersions: [
      { id: "version-2", document_id: "doc-1", version_number: 2, file_url: null, storage_path: "v2.pdf", uploaded_at: "2026-09-02T12:00:00.000Z" },
      { id: "other-version", document_id: "doc-2", version_number: 1, file_url: null, storage_path: "other.pdf", uploaded_at: "2026-09-01T12:00:00.000Z" }
    ]
  });
  assert.deepEqual(state.links.map((item) => item.id), ["link-1"]);
  assert.deepEqual(state.versions.map((item) => item.id), ["version-2"]);
});

test("retains document registration, version, link, refresh, and no-delete contracts", () => {
  const drawer = readFileSync("components/document-drawer.tsx", "utf8");
  const documentsApi = readFileSync("app/api/documents/route.ts", "utf8");
  const versionApi = readFileSync("app/api/documents/[id]/route.ts", "utf8");
  const linksApi = readFileSync("app/api/document-links/route.ts", "utf8");
  assert.match(drawer, /fetch\("\/api\/documents"/);
  assert.match(drawer, /fetch\(`\/api\/documents\/\$\{documentId\}`/);
  assert.match(drawer, /fetch\("\/api\/document-links"/);
  assert.ok((drawer.match(/router\.refresh\(\)/g) ?? []).length >= 3);
  assert.match(documentsApi, /createDocument\(/);
  assert.match(documentsApi, /createDocumentLink\(/);
  assert.match(versionApi, /createDocumentVersion\(/);
  assert.match(linksApi, /createDocumentLink\(/);
  assert.doesNotMatch(documentsApi, /export async function DELETE/);
  assert.doesNotMatch(linksApi, /export async function DELETE/);
});

test("keeps Data Review evidence options compatible with source document identity", () => {
  const modelSource = readFileSync("features/data-review/durable-data-review-view-model.ts", "utf8");
  const pageSource = readFileSync("features/data-review/durable-data-review-page.tsx", "utf8");
  assert.match(modelSource, /data\.documents\.map\(\(item\) => \(\{ id: item\.id, type: "source_document" as const/);
  assert.match(pageSource, /evidenceType:"source_document",evidenceId/);
});

console.log("document coverage characterization tests passed");
