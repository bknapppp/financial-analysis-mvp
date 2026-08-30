import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DealState } from "../../lib/deal-state.ts";
import type { DashboardData } from "../../lib/types.ts";
import { buildSourceDataPageViewModel } from "./source-data-view-model.ts";

const dealState: DealState = {
  completeness: 40,
  trustScore: 65,
  actions: [{ id: "map-cogs", label: "Map COGS", issueId: "missing-cogs", location: "source", autoFixAvailable: true }],
  issues: [{ id: "missing-cogs", type: "mapping", severity: "blocker", message: "COGS is not mapped.", location: "source" }]
};

function fixture(): DashboardData {
  return {
    company: { id: "company-x", name: "Company X", deal_name: "Company X", deal_type: "SBA", base_currency: "USD" },
    companies: [],
    periods: [],
    snapshot: { periodId: "period-1", label: "FY 2025" },
    completionSummary: { completionPercent: 40 },
    dataQuality: { mappingCoveragePercent: 75, mappingBreakdown: { unmapped: 2 } },
    readiness: { status: "caution", label: "Use with caution" },
    backing: {
      sourceRequirements: [{ id: "balance_sheet", status: "unbacked", linkedDocuments: [], missingReason: "Balance sheet support missing." }]
    },
    diligenceIssues: [{
      id: "issue-1",
      title: "Balance sheet support missing",
      description: "No backed balance sheet is linked.",
      severity: "high",
      status: "open",
      period_id: "period-1",
      linked_page: "source_data",
      linked_field: "balance_sheet",
      issue_code: "missing_balance_sheet",
      category: "source_data"
    }]
  } as unknown as DashboardData;
}

test("maps authoritative Source Data state without recalculating or fabricating values", () => {
  const data = fixture();
  const model = buildSourceDataPageViewModel(data, { dealState });
  assert.equal(model.kind, "deal");
  if (model.kind !== "deal") return;
  assert.equal(model.workspaceData, data);
  assert.equal(model.companyName, "Company X");
  assert.equal(model.periodLabel, "FY 2025");
  assert.equal(model.mappingCoveragePercent, 75);
  assert.equal(model.missingDocumentCount, 1);
  assert.equal(model.outstandingIssueCount, 1);
  assert.equal(model.issueSupport["issue-1"].detail, "Balance sheet support missing.");
  assert.equal(model.sourceActions[0].label, "Map COGS");
});

test("provides canonical Source Data and downstream route state", () => {
  const model = buildSourceDataPageViewModel(fixture(), { dealState });
  assert.equal(model.kind, "deal");
  if (model.kind !== "deal") return;
  assert.equal(model.shell.activeKey, "source-data");
  assert.equal(model.shell.topHeaderTitle, "Source Data");
  assert.equal(model.financialsHref, "/financials?companyId=company-x");
  assert.equal(model.dataReviewHref, "/deal/company-x/phases/data-review");
});

test("uses an explicit empty state when no company exists", () => {
  const data = fixture();
  data.company = null;
  const model = buildSourceDataPageViewModel(data, { dealState });
  assert.equal(model.kind, "empty");
  assert.equal("companyId" in model, false);
});

test("route uses the canonical shell and excludes legacy navigation", () => {
  const route = readFileSync("app/source-data/page.tsx", "utf8");
  const page = readFileSync("features/source-data/source-data-page.tsx", "utf8");
  assert(route.includes("loadSourceDataPageViewModel"));
  assert(route.includes("<AppShell model={model.shell}>"));
  assert(page.includes("<PageHeader"));
  assert(page.includes("<ContentCard"));
  assert(!route.includes("DealPageNavigation"));
  assert(!page.includes("DealPageNavigation"));
});

console.log("source data canonical page view-model tests passed");
