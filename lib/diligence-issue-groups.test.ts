import assert from "node:assert/strict";
import {
  groupDiligenceIssues,
  summarizeDiligenceIssueGroups
} from "./diligence-issue-groups.ts";
import type { DiligenceIssue } from "./types.ts";

const issues: DiligenceIssue[] = [
  {
    id: "1",
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
    owner: null
  },
  {
    id: "2",
    company_id: "company-1",
    period_id: "period-1",
    source_type: "system",
    issue_code: "missing_cogs",
    title: "COGS missing for selected period",
    description: "",
    category: "source_data",
    severity: "high",
    status: "open",
    linked_page: "source_data",
    linked_field: "cogs",
    linked_route: "/source-data?companyId=company-1",
    dedupe_key: "missing_cogs:period-1",
    created_at: "",
    updated_at: "",
    resolved_at: null,
    waived_at: null,
    created_by: null,
    owner: null
  },
  {
    id: "3",
    company_id: "company-1",
    period_id: "period-1",
    source_type: "system",
    issue_code: "ebitda_reconciliation_mismatch",
    title: "EBITDA reconciliation mismatch",
    description: "",
    category: "reconciliation",
    severity: "high",
    status: "open",
    linked_page: "financials",
    linked_field: "ebitda_formula",
    linked_route: "/financials?companyId=company-1",
    dedupe_key: "ebitda_reconciliation_mismatch:period-1",
    created_at: "",
    updated_at: "",
    resolved_at: null,
    waived_at: null,
    created_by: null,
    owner: null
  },
  {
    id: "4",
    company_id: "company-1",
    period_id: "period-1",
    source_type: "system",
    issue_code: "add_back_review_incomplete",
    title: "Add-back review incomplete",
    description: "",
    category: "underwriting",
    severity: "medium",
    status: "in_review",
    linked_page: "underwriting",
    linked_field: "add_backs",
    linked_route: "/deal/company-1/underwriting",
    dedupe_key: "add_back_review_incomplete:period-1",
    created_at: "",
    updated_at: "",
    resolved_at: null,
    waived_at: null,
    created_by: null,
    owner: null
  },
  {
    id: "5",
    company_id: "company-1",
    period_id: "period-1",
    source_type: "manual",
    issue_code: null,
    title: "Historical request",
    description: "",
    category: "other",
    severity: "low",
    status: "resolved",
    linked_page: "overview",
    linked_field: null,
    linked_route: "/deal/company-1",
    dedupe_key: null,
    created_at: "",
    updated_at: "",
    resolved_at: "",
    waived_at: null,
    created_by: null,
    owner: null
  }
];

const groups = groupDiligenceIssues({ issues });
const summary = summarizeDiligenceIssueGroups(groups);

assert.equal(groups.length, 3);
assert.equal(groups[0]?.groupKey, "source_data");
assert.equal(groups[1]?.groupKey, "reconciliation");
assert.equal(groups[2]?.groupKey, "adjustments");
assert.equal(groups[0]?.criticalCount, 1);
assert.equal(groups[0]?.primaryIssue?.title, "Revenue missing for selected period");
assert.equal(groups[0]?.remainingIssueCount, 1);
assert.equal(groups[0]?.hasMoreIssues, true);
assert.equal(groups[2]?.primaryIssue?.title, "Add-back review incomplete");
assert.equal(groups[2]?.hasMoreIssues, false);
assert.equal(summary.totalActiveIssues, 3);
assert.equal(summary.topGroup?.groupLabel, "Source Data");

console.log("diligence issue groups tests passed");
