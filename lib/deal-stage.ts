import type { DiligenceReadiness, UnderwritingCompletionSummary } from "./types.ts";

export const DEAL_STAGE_ORDER = [
  "new",
  "screening",
  "diligence",
  "ic_ready",
  "closing",
  "closed",
  "dead"
] as const;

export type DealStage = (typeof DEAL_STAGE_ORDER)[number];

export type DealStageFilter = "all" | "active" | "terminal" | DealStage;

export type DealStageAssessment = {
  isStageConsistentWithReadiness: boolean;
  stageReadinessMismatchReason: string | null;
  isActiveStage: boolean;
  isTerminalStage: boolean;
};

type DealStageMetadata = {
  label: string;
  order: number;
  isActive: boolean;
  description: string;
  badgeClassName: string;
};

const DEAL_STAGE_METADATA: Record<DealStage, DealStageMetadata> = {
  new: {
    label: "New",
    order: 0,
    isActive: true,
    description: "Deal created, not yet meaningfully screened.",
    badgeClassName: "border-slate-200 bg-slate-50 text-slate-700"
  },
  screening: {
    label: "Screening",
    order: 1,
    isActive: true,
    description: "Early triage and initial qualification.",
    badgeClassName: "border-stone-200 bg-stone-50 text-stone-700"
  },
  diligence: {
    label: "Diligence",
    order: 2,
    isActive: true,
    description: "Active data collection, normalization, and underwriting.",
    badgeClassName: "border-sky-200 bg-sky-50 text-sky-800"
  },
  ic_ready: {
    label: "IC Ready",
    order: 3,
    isActive: true,
    description: "Advanced enough for investment committee review.",
    badgeClassName: "border-indigo-200 bg-indigo-50 text-indigo-800"
  },
  closing: {
    label: "Closing",
    order: 4,
    isActive: true,
    description: "Approved and moving through final execution steps.",
    badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-800"
  },
  closed: {
    label: "Closed",
    order: 5,
    isActive: false,
    description: "Successfully completed.",
    badgeClassName: "border-teal-200 bg-teal-50 text-teal-800"
  },
  dead: {
    label: "Dead",
    order: 6,
    isActive: false,
    description: "No longer active.",
    badgeClassName: "border-rose-200 bg-rose-50 text-rose-800"
  }
};

function formatReadinessStateLabel(value: string) {
  return value
    .split("_")
    .join(" ")
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function isClosingReadyState(state: DiligenceReadiness["state"]) {
  return state === "ready_for_ic" || state === "ready_for_lender" || state === "completed";
}

function isIcReadyState(state: DiligenceReadiness["state"]) {
  return (
    state === "structurally_ready" ||
    state === "ready_for_ic" ||
    state === "ready_for_lender" ||
    state === "completed"
  );
}

function buildAssessment(
  stage: DealStage,
  mismatchReason: string | null
): DealStageAssessment {
  return {
    isStageConsistentWithReadiness: mismatchReason === null,
    stageReadinessMismatchReason: mismatchReason,
    isActiveStage: isActiveDealStage(stage),
    isTerminalStage: isTerminalDealStage(stage)
  };
}

export function isDealStage(value: string): value is DealStage {
  return DEAL_STAGE_ORDER.includes(value as DealStage);
}

export function getDefaultDealStage(): DealStage {
  return "new";
}

export function getDealStage(value: string | null | undefined): DealStage {
  if (value && isDealStage(value)) {
    return value;
  }

  return getDefaultDealStage();
}

export function getDealStageLabel(stage: DealStage) {
  return DEAL_STAGE_METADATA[stage].label;
}

export function getDealStageSortOrder(stage: DealStage) {
  return DEAL_STAGE_METADATA[stage].order;
}

export function getDealStageDisplay(stage: DealStage) {
  return DEAL_STAGE_METADATA[stage];
}

export function isActiveDealStage(stage: DealStage) {
  return DEAL_STAGE_METADATA[stage].isActive;
}

export function isTerminalDealStage(stage: DealStage) {
  return !isActiveDealStage(stage);
}

export function dealStageMatchesFilter(stage: DealStage, filter: DealStageFilter) {
  if (filter === "all") {
    return true;
  }

  if (filter === "active") {
    return isActiveDealStage(stage);
  }

  if (filter === "terminal") {
    return isTerminalDealStage(stage);
  }

  return stage === filter;
}

export function filterRowsByDealStage<T extends { stage: DealStage }>(
  rows: T[],
  filter: DealStageFilter
) {
  return rows.filter((row) => dealStageMatchesFilter(row.stage, filter));
}

export function compareDealStages(left: DealStage, right: DealStage) {
  return getDealStageSortOrder(left) - getDealStageSortOrder(right);
}

export function buildDealStageUpdatePayload(params: {
  stage: DealStage;
  stageNotes?: string | null;
  updatedAt?: string;
}) {
  const payload: {
    stage: DealStage;
    stage_updated_at: string;
    stage_notes?: string | null;
  } = {
    stage: params.stage,
    stage_updated_at: params.updatedAt ?? new Date().toISOString()
  };

  if (params.stageNotes !== undefined) {
    payload.stage_notes =
      typeof params.stageNotes === "string" && params.stageNotes.trim().length === 0
        ? null
        : params.stageNotes;
  }

  return payload;
}

export function assessDealStageReadinessConsistency(params: {
  stage: DealStage;
  diligenceReadiness: Pick<
    DiligenceReadiness,
    "state" | "readinessLabel" | "blockerCount" | "criticalIssueCount" | "activeIssueCount"
  >;
  completionSummary?: Pick<
    UnderwritingCompletionSummary,
    "completionStatus" | "completionPercent" | "blockers"
  > | null;
}) {
  const { stage, diligenceReadiness, completionSummary } = params;
  const readinessLabel =
    diligenceReadiness.readinessLabel || formatReadinessStateLabel(diligenceReadiness.state);

  if (stage === "new" || stage === "screening" || stage === "diligence") {
    return buildAssessment(stage, null);
  }

  if (stage === "ic_ready") {
    if (!isIcReadyState(diligenceReadiness.state)) {
      return buildAssessment(
        stage,
        `Stage is IC Ready but diligence readiness is ${readinessLabel}.`
      );
    }

    if (
      diligenceReadiness.criticalIssueCount > 0 ||
      diligenceReadiness.blockerCount > 0
    ) {
      return buildAssessment(stage, "Stage is IC Ready but open diligence blockers remain.");
    }

    return buildAssessment(stage, null);
  }

  if (stage === "closing") {
    if (!isClosingReadyState(diligenceReadiness.state)) {
      return buildAssessment(
        stage,
        `Stage is Closing but diligence readiness is ${readinessLabel}.`
      );
    }

    if (completionSummary?.completionStatus === "blocked") {
      return buildAssessment(
        stage,
        "Stage is Closing but underwriting outputs are unavailable."
      );
    }

    return buildAssessment(stage, null);
  }

  if (stage === "closed") {
    if (diligenceReadiness.activeIssueCount > 0 || diligenceReadiness.blockerCount > 0) {
      return buildAssessment(stage, "Stage is Closed but active diligence issues remain open.");
    }

    if (
      completionSummary &&
      completionSummary.completionStatus !== "ready"
    ) {
      return buildAssessment(
        stage,
        "Stage is Closed but underwriting completion is not ready."
      );
    }

    return buildAssessment(stage, null);
  }

  if (diligenceReadiness.activeIssueCount > 0 || diligenceReadiness.blockerCount > 0) {
    return buildAssessment(stage, "Stage is Dead but active diligence issues remain open.");
  }

  return buildAssessment(stage, null);
}

export const DEAL_STAGE_OPTIONS = DEAL_STAGE_ORDER.map((stage) => ({
  value: stage,
  label: getDealStageLabel(stage)
}));
