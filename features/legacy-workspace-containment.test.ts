import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolveDiligenceIssueActionTarget } from "../lib/diligence-issues.ts";

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

const [dealRoute, overviewPage, dataReviewModel, previewRoute, backing, portfolioState] =
  await Promise.all([
    read("../app/deal/[companyId]/page.tsx"),
    read("./overview/overview-page.tsx"),
    read("./data-review/data-review-view-model.ts"),
    read("../app/deal/[companyId]/redesign-preview/page.tsx"),
    read("../lib/backing.ts"),
    read("../lib/portfolio-deal-state.ts")
  ]);

assert.match(dealRoute, /redirect\(`\/deal\/\$\{companyId\}\/overview`\)/);
assert.doesNotMatch(dealRoute, /OverviewView|DealWorkspaceView/);
assert.doesNotMatch(overviewPage, /Legacy workspace|links\.legacyDeal/);
assert.match(dataReviewModel, /issues: `\/deal\/\$\{companyId\}\/phases\/findings`/);
assert.match(previewRoute, /href=\{model\.projectOverviewHref\}/);
assert.match(backing, /`\/financials\?companyId=\$\{params\.companyId\}`/);
assert.doesNotMatch(portfolioState, /buildDealHref/);

const staleIssueAction = resolveDiligenceIssueActionTarget({
  linked_page: "overview",
  linked_route: "/deal/company-1?view=issues",
  linked_field: null,
  issue_code: "other"
});

assert.equal(staleIssueAction.linkedRoute, "/deal/company-1/overview");
assert.equal(staleIssueAction.isActionable, true);

console.log("legacy workspace containment tests passed");
