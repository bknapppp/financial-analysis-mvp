import assert from "node:assert/strict";
import {
  assessDealStageReadinessConsistency,
  buildDealStageUpdatePayload,
  compareDealStages,
  dealStageMatchesFilter,
  filterRowsByDealStage,
  getDealStage,
  getDealStageLabel,
  getDealStageSortOrder,
  isActiveDealStage,
  isTerminalDealStage,
  type DealStage
} from "./deal-stage.ts";

{
  assert.equal(getDealStage("screening"), "screening");
  assert.equal(getDealStage(null), "new");
  assert.equal(getDealStage("unexpected"), "new");
  assert.equal(getDealStageLabel("ic_ready"), "IC Ready");
  assert.ok(getDealStageSortOrder("closing") > getDealStageSortOrder("diligence"));
  assert.ok(compareDealStages("new", "dead") < 0);
}

{
  assert.equal(isActiveDealStage("diligence"), true);
  assert.equal(isTerminalDealStage("closed"), true);
  assert.equal(dealStageMatchesFilter("closing", "active"), true);
  assert.equal(dealStageMatchesFilter("dead", "terminal"), true);
  assert.equal(dealStageMatchesFilter("screening", "closing"), false);
}

{
  const rows = [
    { id: "1", stage: "new" as DealStage },
    { id: "2", stage: "closing" as DealStage },
    { id: "3", stage: "closed" as DealStage }
  ];

  assert.deepEqual(
    filterRowsByDealStage(rows, "active").map((row) => row.id),
    ["1", "2"]
  );
  assert.deepEqual(
    filterRowsByDealStage(rows, "terminal").map((row) => row.id),
    ["3"]
  );
}

{
  const payload = buildDealStageUpdatePayload({
    stage: "ic_ready",
    stageNotes: "Prepared for committee review",
    updatedAt: "2026-04-19T12:00:00.000Z"
  });

  assert.deepEqual(payload, {
    stage: "ic_ready",
    stage_updated_at: "2026-04-19T12:00:00.000Z",
    stage_notes: "Prepared for committee review"
  });
}

{
  const consistent = assessDealStageReadinessConsistency({
    stage: "ic_ready",
    diligenceReadiness: {
      state: "ready_for_ic",
      readinessLabel: "Ready for IC",
      blockerCount: 0,
      criticalIssueCount: 0,
      activeIssueCount: 1
    },
    completionSummary: {
      completionStatus: "in_progress",
      completionPercent: 90,
      blockers: []
    }
  });

  assert.equal(consistent.isStageConsistentWithReadiness, true);
  assert.equal(consistent.stageReadinessMismatchReason, null);
}

{
  const mismatch = assessDealStageReadinessConsistency({
    stage: "ic_ready",
    diligenceReadiness: {
      state: "needs_validation",
      readinessLabel: "Needs Validation",
      blockerCount: 2,
      criticalIssueCount: 1,
      activeIssueCount: 3
    },
    completionSummary: {
      completionStatus: "blocked",
      completionPercent: 52,
      blockers: ["Revenue missing"]
    }
  });

  assert.equal(mismatch.isStageConsistentWithReadiness, false);
  assert.equal(
    mismatch.stageReadinessMismatchReason,
    "Stage is IC Ready but diligence readiness is Needs Validation."
  );
}

{
  const closedMismatch = assessDealStageReadinessConsistency({
    stage: "closed",
    diligenceReadiness: {
      state: "completed",
      readinessLabel: "Completed",
      blockerCount: 0,
      criticalIssueCount: 0,
      activeIssueCount: 0
    },
    completionSummary: {
      completionStatus: "in_progress",
      completionPercent: 98,
      blockers: []
    }
  });

  assert.equal(closedMismatch.isStageConsistentWithReadiness, false);
  assert.equal(
    closedMismatch.stageReadinessMismatchReason,
    "Stage is Closed but underwriting completion is not ready."
  );
}

console.log("deal stage tests passed");
