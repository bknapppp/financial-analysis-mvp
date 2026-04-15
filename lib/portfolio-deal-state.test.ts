import assert from "node:assert/strict";
import {
  derivePortfolioDealState,
  derivePortfolioReadiness,
  getPrimaryRiskSeverity,
  isRecentlyUpdated,
  type PortfolioReadinessBlocker
} from "./portfolio-deal-state.ts";
import type { WorkbookFixItTask } from "./workbook-fix-its.ts";
import type {
  DataReadiness,
  TaxSourceStatus,
  UnderwritingCompletionSummary
} from "./types.ts";

const baseReadiness: DataReadiness = {
  status: "ready",
  label: "Ready",
  blockingReasons: [],
  cautionReasons: [],
  summaryMessage: "Ready"
};

const baseTaxSourceStatus: TaxSourceStatus = {
  documentCount: 1,
  periodCount: 1,
  rowCount: 10,
  mappedLineCount: 8,
  lowConfidenceLineCount: 0,
  broadClassificationCount: 0,
  hasMatchingPeriod: true,
  matchingPeriodLabel: "FY2024",
  comparisonStatus: "ready",
  comparisonComputable: true,
  missingComponents: [],
  notes: [],
  revenueDeltaPercent: null,
  reportedEbitdaDeltaPercent: null,
  adjustedEbitdaDeltaPercent: null
};

function buildSummary(overrides?: Partial<UnderwritingCompletionSummary>): UnderwritingCompletionSummary {
  return {
    completionPercent: 80,
    completionStatus: "in_progress",
    blockers: [],
    missingItems: [],
    completedItems: [],
    nextActions: [],
    sections: [],
    ...overrides
  };
}

const section = (
  key: "financial_inputs" | "mapping_completeness" | "structure_inputs" | "underwriting_readiness",
  status: "complete" | "blocked" | "in_progress",
  incompleteLabel?: string
) => ({
  key,
  title: key,
  weight: 20,
  completionPercent: status === "complete" ? 100 : status === "blocked" ? 40 : 75,
  status,
  completedCount: status === "complete" ? 1 : 0,
  totalCount: 1,
  items: [
    {
      key: `${key}-item`,
      label: incompleteLabel ?? `${key} ready`,
      isComplete: status === "complete",
      isBlocking: status === "blocked"
    }
  ]
});

function workbookTask(overrides?: Partial<WorkbookFixItTask>): WorkbookFixItTask {
  return {
    key: "missing_balance_sheet",
    label: "Upload or select a balance sheet",
    reason: "Workbook context did not identify a primary balance sheet sheet.",
    actionLabel: "Upload or select a balance sheet",
    href: "/source-data?companyId=company-1&fixSection=source-data-upload&fixField=source-data-file&fixStep=1#source-data-upload",
    severity: "critical",
    ...overrides
  };
}

{
  const readiness = derivePortfolioReadiness({
    companyId: "company-1",
    completionSummary: buildSummary({
      sections: [
        section("financial_inputs", "complete"),
        section("mapping_completeness", "blocked", "Coverage supports usable outputs")
      ]
    }),
    readiness: baseReadiness,
    taxSourceStatus: baseTaxSourceStatus,
    workbookFixIts: [workbookTask()]
  });

  assert.equal(readiness.stateKey, "needs_workbook_review");
  assert.equal(readiness.status, "Needs workbook review");
  assert.equal(readiness.primaryBlocker?.category, "workbook");
  assert.equal(readiness.nextAction.label, "Upload or select a balance sheet");
}

{
  const state = derivePortfolioDealState({
    companyId: "company-1",
    completionSummary: buildSummary({
      sections: [
        section("financial_inputs", "complete"),
        section("mapping_completeness", "blocked", "Coverage supports usable outputs")
      ]
    }),
    readiness: baseReadiness,
    taxSourceStatus: baseTaxSourceStatus
  });

  assert.equal(state.status, "Needs mapping");
  assert.equal(state.currentBlocker, "Missing: Mapping");
  assert.equal(state.nextAction, "Complete mapping");
}

{
  const state = derivePortfolioDealState({
    companyId: "company-1",
    completionSummary: buildSummary({
      sections: [
        section("financial_inputs", "complete"),
        section("mapping_completeness", "complete"),
        section("structure_inputs", "blocked", "Loan amount entered")
      ]
    }),
    readiness: baseReadiness,
    taxSourceStatus: baseTaxSourceStatus
  });

  assert.equal(state.status, "Needs underwriting inputs");
  assert.equal(state.currentBlocker, "Missing: Structure Inputs");
  assert.equal(state.nextAction, "Enter loan terms");
  assert.equal(
    state.nextActionHref,
    "/deal/company-1?fixSection=underwriting-workbench&fixField=underwriting-loanTermYears&tab=overview#underwriting-workbench"
  );
}

{
  const state = derivePortfolioDealState({
    companyId: "company-1",
    completionSummary: buildSummary({
      completionStatus: "ready",
      sections: [
        section("financial_inputs", "complete"),
        section("mapping_completeness", "complete"),
        section("structure_inputs", "complete"),
        section("underwriting_readiness", "complete")
      ]
    }),
    readiness: baseReadiness,
    taxSourceStatus: baseTaxSourceStatus
  });

  assert.equal(state.status, "Ready for output");
  assert.equal(state.nextAction, "Prepare output");
  assert.equal(
    state.nextActionHref,
    "/deal/company-1?fixSection=underwriting-workbench&tab=overview#underwriting-workbench"
  );
}

{
  const state = derivePortfolioDealState({
    companyId: "company-1",
    completionSummary: buildSummary({
      sections: [section("financial_inputs", "in_progress", "Revenue available")]
    }),
    readiness: {
      ...baseReadiness,
      status: "blocked",
      label: "Not reliable",
      blockingReasons: ["Revenue coverage is incomplete"]
    },
    taxSourceStatus: {
      ...baseTaxSourceStatus,
      comparisonStatus: "partial"
    }
  });

  assert.equal(state.status, "Needs source completion");
  assert.equal(state.primaryBlocker?.category, "source_data");
  assert.equal(state.nextAction, "Review source data");
}

{
  const readiness = derivePortfolioReadiness({
    companyId: "company-1",
    completionSummary: buildSummary({
      sections: [
        section("financial_inputs", "complete"),
        section("mapping_completeness", "complete"),
        section("structure_inputs", "complete"),
        section("underwriting_readiness", "complete")
      ]
    }),
    readiness: {
      ...baseReadiness,
      cautionReasons: ["Classification still needs narrowing"]
    },
    taxSourceStatus: {
      ...baseTaxSourceStatus,
      comparisonStatus: "partial",
      missingComponents: ["Matched tax EBITDA is incomplete"]
    }
  });

  assert.equal(readiness.stateKey, "ready_for_structure");
  assert.equal(readiness.nextAction.label, "Run structure");
}

{
  const readiness = derivePortfolioReadiness({
    companyId: "company-1",
    completionSummary: buildSummary({
      sections: [
        section("financial_inputs", "complete"),
        section("mapping_completeness", "complete")
      ]
    }),
    readiness: {
      ...baseReadiness,
      blockingReasons: ["Source data still needs review", "Source data still needs review"]
    },
    taxSourceStatus: baseTaxSourceStatus
  });

  const matchingBlockers = readiness.blockers.filter(
    (blocker: PortfolioReadinessBlocker) => blocker.label === "Missing: Source data still needs review"
  );
  assert.equal(matchingBlockers.length, 1);
}

assert.equal(getPrimaryRiskSeverity(["low", "medium"]), "medium");
assert.equal(getPrimaryRiskSeverity([null, "low"]), "low");
assert.equal(getPrimaryRiskSeverity([null]), null);
assert.equal(
  isRecentlyUpdated("2026-04-10T00:00:00.000Z", new Date("2026-04-13T00:00:00.000Z")),
  true
);
assert.equal(
  isRecentlyUpdated("2026-03-01T00:00:00.000Z", new Date("2026-04-13T00:00:00.000Z")),
  false
);

console.log("portfolio-deal-state tests passed");
