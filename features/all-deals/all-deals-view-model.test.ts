import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DealScreenerRow } from "../../lib/data.ts";
import {
  buildAllDealsPageViewModel,
  getDealOverviewHref
} from "./all-deals-view-model.ts";

function deal(overrides: Partial<DealScreenerRow> = {}): DealScreenerRow {
  return {
    companyId: "company-x",
    dealName: "Company X",
    companyName: "Company X",
    dealType: "SBA",
    sourceStatus: "active",
    industry: "Business Services",
    stage: "diligence",
    stageLabel: "Diligence",
    stageSortOrder: 2,
    stageUpdatedAt: "2026-08-01T00:00:00.000Z",
    stageNotes: null,
    isActiveStage: true,
    isTerminalStage: false,
    stageReadinessMismatchReason: null,
    backingStatus: "partial",
    readinessStateKey: "underwriting_in_progress",
    status: "Underwriting in progress",
    blockerCount: 1,
    openIssueCount: 1,
    criticalIssueCount: 1,
    diligenceReadinessLabel: "Not Ready",
    diligenceReadinessReason: "One critical item remains.",
    diligenceReadinessRank: 1,
    primaryBlockerLabel: "Financials",
    primaryBlockerIssueTitle: "Confirm source support",
    primaryBlockerCategory: "source_data",
    completionPercent: 60,
    currentBlocker: "Confirm source support",
    nextAction: "Review Financials",
    nextActionHref: "/financials?companyId=company-x",
    revenue: 1000,
    ebitda: 200,
    adjustedEbitda: 225,
    acceptedAddBacks: 25,
    ebitdaMarginPercent: 20,
    revenueGrowthPercent: 5,
    addBacksPercent: 12.5,
    hasAddBacks: true,
    addBacksAboveThreshold: false,
    dscr: 1.5,
    debtToEbitda: 2.5,
    ltv: 55,
    decision: "caution",
    primaryRisk: "Source support",
    riskSeverity: "high",
    lastUpdated: "2026-08-01T00:00:00.000Z",
    owner: null,
    ...overrides
  };
}

test("maps authoritative deal rows without fabricating unsupported fields", () => {
  const row = deal();
  const model = buildAllDealsPageViewModel([row]);

  assert.equal(model.state, "populated");
  assert.equal(model.rows[0], row);
  assert.equal(model.rows[0].owner, null);
  assert.equal(model.rows[0].revenue, 1000);
  assert.equal(model.summary.totalDeals, 1);
  assert.equal(model.summary.blockedDeals, 1);
});

test("preserves Company X and canonical workspace routing", () => {
  const model = buildAllDealsPageViewModel([deal()]);
  assert.equal(model.companyXAvailable, true);
  assert.equal(getDealOverviewHref(model.rows[0].companyId), "/deal/company-x/overview");
  assert.equal(model.rows[0].nextActionHref, "/financials?companyId=company-x");
});

test("returns an explicit empty state without placeholder deals", () => {
  const model = buildAllDealsPageViewModel([]);
  assert.equal(model.state, "empty");
  assert.deepEqual(model.rows, []);
  assert.equal(model.summary.totalDeals, 0);
  assert.equal(model.companyXAvailable, false);
});

test("route uses the server loader and canonical Broadstone presentation", () => {
  const route = readFileSync("app/deals/page.tsx", "utf8");
  const page = readFileSync("features/all-deals/all-deals-page.tsx", "utf8");

  assert(route.includes("loadAllDealsPageViewModel"));
  assert(route.includes("<AllDealsPage model={model}"));
  assert(page.includes("bs-foundation"));
  assert(page.includes("<PageHeader"));
  assert(page.includes("<StatusBadge"));
  assert(!page.includes("DealPageNavigation"));
});
