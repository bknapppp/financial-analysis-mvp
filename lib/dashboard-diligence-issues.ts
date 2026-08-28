import {
  buildEmptyDiligenceIssueFeedback,
  getDiligenceIssues
} from "./diligence-issues.ts";
import type { DiligenceIssue } from "./types.ts";

type DashboardIssueReader = (params: {
  companyId: string;
}) => Promise<DiligenceIssue[]>;

export async function loadDashboardDiligenceIssueState(
  companyId: string,
  readIssues: DashboardIssueReader = getDiligenceIssues
) {
  const issues = await readIssues({ companyId });

  return {
    issues,
    feedback: buildEmptyDiligenceIssueFeedback()
  };
}
