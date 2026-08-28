import assert from "node:assert/strict";
import { loadDashboardDiligenceIssueState } from "./dashboard-diligence-issues.ts";
import type { DiligenceIssue } from "./types.ts";

let readCount = 0;
const issues = [{ id: "issue-1" }] as DiligenceIssue[];
const state = await loadDashboardDiligenceIssueState("company-1", async ({ companyId }) => {
  readCount += 1;
  assert.equal(companyId, "company-1");
  return issues;
});

assert.equal(readCount, 1);
assert.equal(state.issues, issues);
assert.deepEqual(state.feedback, {
  resolvedIssueTitles: [],
  resolvedIssueCount: 0,
  reopenedIssueTitles: [],
  reopenedIssueCount: 0,
  readinessChanged: false,
  previousReadinessLabel: null,
  currentReadinessLabel: null
});
console.log("dashboard diligence issue read-boundary tests passed");
