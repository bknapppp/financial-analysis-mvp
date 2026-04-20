import assert from "node:assert/strict";
import { deriveDiligenceReadiness } from "./diligence-readiness.ts";
import type { DiligenceIssue } from "./types.ts";

function buildIssue(overrides: Partial<DiligenceIssue>): DiligenceIssue {
  return {
    id: "issue-1",
    company_id: "company-1",
    period_id: "period-1",
    source_type: "system",
    issue_code: "missing_revenue",
    title: "Revenue missing for selected period",
    description: "",
    category: "source_data",
    severity: "critical",
    status: "open",
    linked_page: "source_data",
    linked_field: "revenue",
    linked_route: "/source-data?companyId=company-1",
    dedupe_key: "missing_revenue:period-1",
    created_at: "",
    updated_at: "",
    resolved_at: null,
    waived_at: null,
    created_by: null,
    owner: null,
    ...overrides
  };
}

{
  const readiness = deriveDiligenceReadiness({
    issues: [buildIssue({})]
  });

  assert.equal(readiness.state, "not_ready");
  assert.equal(readiness.readinessReason, "Critical source-data issues remain open");
  assert.deepEqual(readiness.blockerGroups, ["source_data"]);
  assert.deepEqual(readiness.blockerIssueTitles, ["Revenue missing for selected period"]);
  assert.equal(readiness.primaryBlockerLabel, "Source Data");
  assert.equal(readiness.primaryBlockerIssueTitle, "Revenue missing for selected period");
}

{
  const readiness = deriveDiligenceReadiness({
    issues: [
      buildIssue({
        id: "issue-2",
        issue_code: "adjusted_ebitda_unavailable",
        title: "Adjusted EBITDA unavailable",
        category: "underwriting",
        severity: "high",
        linked_page: "underwriting",
        linked_field: "adjusted_ebitda",
        linked_route: "/deal/company-1/underwriting"
      })
    ]
  });

  assert.equal(readiness.state, "needs_validation");
  assert.equal(readiness.readinessReason, "Adjusted EBITDA remains unavailable");
  assert.deepEqual(readiness.blockerGroups, ["underwriting"]);
  assert.equal(readiness.primaryBlockerIssueTitle, "Adjusted EBITDA unavailable");
}

{
  const readiness = deriveDiligenceReadiness({
    issues: [
      buildIssue({
        id: "issue-3",
        issue_code: "add_back_review_incomplete",
        title: "Add-back review incomplete",
        category: "underwriting",
        severity: "medium",
        linked_page: "underwriting",
        linked_field: "add_backs",
        linked_route: "/deal/company-1/underwriting"
      })
    ]
  });

  assert.equal(readiness.state, "under_review");
  assert.equal(readiness.readinessReason, "Adjustment review remains open");
  assert.deepEqual(readiness.blockerGroups, ["adjustments"]);
  assert.equal(readiness.primaryBlockerLabel, "Adjustments");
}

{
  const readiness = deriveDiligenceReadiness({
    issues: [
      buildIssue({
        id: "issue-4",
        issue_code: null,
        source_type: "manual",
        title: "Minor follow-up",
        category: "other",
        severity: "low",
        linked_page: "overview",
        linked_field: null,
        linked_route: "/deal/company-1"
      })
    ]
  });

  assert.equal(readiness.state, "ready_for_ic");
  assert.equal(readiness.readinessReason, "Only minor diligence issues remain");
  assert.equal(readiness.blockerCount, 0);
}

{
  const readiness = deriveDiligenceReadiness({ issues: [] });

  assert.equal(readiness.state, "ready_for_lender");
  assert.equal(readiness.readinessReason, "Core financial and credit outputs are available");
  assert.equal(readiness.primaryBlockerIssueTitle, null);
}

console.log("diligence readiness tests passed");
