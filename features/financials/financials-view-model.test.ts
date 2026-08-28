import assert from "node:assert/strict";
import test from "node:test";
import { buildFinancialsPageViewModel } from "./financials-view-model.ts";
import { buildDealShellViewModel } from "../../lib/view-models/deal-shell.ts";
import type { DashboardData, PeriodSnapshot } from "../../lib/types.ts";

const snapshot: PeriodSnapshot = {
  periodId: "period-1", label: "FY 2025", periodDate: "2025-12-31",
  revenue: 1000, cogs: 400, grossProfit: 600, operatingExpenses: 350,
  reportedEbitda: 250, ebitda: 250, acceptedAddBacks: 25, adjustedEbitda: 275,
  grossMarginPercent: 60, ebitdaMarginPercent: 25, adjustedEbitdaMarginPercent: 27.5,
  currentAssets: 0, currentLiabilities: 0, workingCapital: 0,
  revenueGrowthPercent: null, ebitdaGrowthPercent: null, adjustedEbitdaGrowthPercent: null,
  grossMarginChange: null, ebitdaMarginChange: null
};

function fixture(): DashboardData {
  return {
    company: { id: "company-1", name: "Company X", industry: null, base_currency: "USD", stage: "new", stage_updated_at: null, stage_notes: null, created_at: "2025-01-01" },
    companies: [], periods: [{ id: "period-1", company_id: "company-1", label: "FY 2025", period_date: "2025-12-31", created_at: "2025-01-01" }],
    entries: [{ id: "entry-1", period_id: "period-1", account_name: "Revenue", amount: 1000, category: "Revenue", statement_type: "income", addback_flag: false, created_at: "2025-01-01" }],
    snapshots: [snapshot], snapshot,
    normalizedPeriods: [], normalizedOutput: null,
    ebitdaBridge: { periodId: "period-1", periodLabel: "FY 2025", canonicalEbitda: 250, reportedEbitdaReference: 240, addBackTotal: 25, adjustedEbitda: 275, canComputeAdjustedEbitda: true, invalidReasons: [], warnings: [], groups: [] },
    reconciliation: { status: "reconciled", label: "Reconciles", summaryMessage: "All checks pass.", withinTolerance: true, issues: [] },
    readiness: { status: "ready", label: "Ready", blockingReasons: [], cautionReasons: [], summaryMessage: "Ready." },
    backing: { summary: { overall: { id: "overall", label: "Overall", status: "backed", href: "/source-data", note: null }, financials: { id: "financials", label: "Financials", status: "backed", href: "/source-data", note: null }, adjustments: { id: "adjustments", label: "Adjustments", status: "partial", href: "/source-data", note: null }, creditInputs: { id: "credit", label: "Credit", status: "unbacked", href: "/source-data", note: null } }, sourceRequirements: [], financialLineItems: [], underwritingAdjustments: [], underwritingMetrics: [] },
    diligenceIssues: [], series: [], driverAnalyses: [],
    stage: "new", stageAssessment: {} as DashboardData["stageAssessment"], accountMappings: [], addBacks: [], addBackReviewItems: [], incomeStatement: [], balanceSheet: [], insights: [], recommendedActions: [], executiveSummary: null, similarDeals: [], dataQuality: {} as DashboardData["dataQuality"], taxSourceStatus: {} as DashboardData["taxSourceStatus"], documents: [], documentLinks: [], documentVersions: [], diligenceIssueSummary: {} as DashboardData["diligenceIssueSummary"], diligenceIssueGroups: [], diligenceReadiness: {} as DashboardData["diligenceReadiness"], diligenceIssueFeedback: {} as DashboardData["diligenceIssueFeedback"], completionSummary: {} as DashboardData["completionSummary"]
  };
}

test("maps authoritative Financials values without recalculating source metrics", () => {
  const model = buildFinancialsPageViewModel(fixture());
  assert.ok(model);
  assert.equal(model.companyName, "Company X");
  assert.equal(model.defaultPeriodId, "period-1");
  assert.equal(model.periods[0].canonicalEbitda, 250);
  assert.equal(model.periods[0].reportedEbitda, 240);
  assert.equal(model.periods[0].acceptedAddBacks, 25);
  assert.equal(model.periods[0].adjustedEbitda, 275);
  assert.equal(model.periods[0].reportedStatement.footerValue, 250);
  assert.equal(model.periods[0].adjustedStatement.footerValue, 275);
  assert.equal(model.periods[0].reconciliation.status, "reconciled");
  assert.equal(model.backing.find((item) => item.id === "financials")?.status, "backed");
  assert.equal(model.shell.activeKey, "financials");
  assert.ok(model.shell.navigation.some((item) => item.key === "financials"));
  assert.ok(model.shell.navigation.some((item) => item.key === "underwriting"));
  assert.ok(model.shell.navigation.some((item) => item.key === "source-data"));
  assert.ok(model.shell.navigation.find((item) => item.key === "phases")?.children?.some((item) => item.key === "reporting"));
});

test("preserves missing values and zero values as distinct concepts", () => {
  const data = fixture();
  data.snapshot = { ...snapshot, ebitda: null, reportedEbitda: null, revenue: 0 };
  data.snapshots = [data.snapshot];
  data.ebitdaBridge = null;
  const model = buildFinancialsPageViewModel(data);
  assert.ok(model);
  assert.equal(model.periods[0].snapshot.revenue, 0);
  assert.equal(model.periods[0].canonicalEbitda, null);
  assert.equal(model.periods[0].adjustedEbitda, null);
});

test("returns an explicit unavailable state when no period has entries", () => {
  const data = fixture(); data.entries = [];
  const model = buildFinancialsPageViewModel(data);
  assert.equal(model?.state, "unavailable");
  assert.deepEqual(model?.periods, []);
});

test("preserves canonical Overview and Phase 3-5 navigation active states", () => {
  const company = fixture().company!;
  assert.equal(buildDealShellViewModel({ company, requestedSection: "overview", context: "overview" }).activeKey, "overview");
  assert.equal(buildDealShellViewModel({ company, requestedSection: "data-review", context: "data-review" }).activeKey, "data-review");
  assert.equal(buildDealShellViewModel({ company, requestedSection: "findings", context: "findings" }).activeKey, "findings");
  assert.equal(buildDealShellViewModel({ company, requestedSection: "reporting", context: "reporting" }).activeKey, "reporting");
});
