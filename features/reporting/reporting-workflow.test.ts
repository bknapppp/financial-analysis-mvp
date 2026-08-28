import assert from "node:assert/strict";
import test from "node:test";
import type { Phase5FindingProjection } from "../findings/findings-workflow.ts";
import { REPORT_SECTION_DEFINITIONS, deriveReportingReadiness, detectStaleReportingLinks, type ReportingSectionState } from "./reporting-workflow.ts";

const finding = (approvedVersion = 3) => ({ issueId: "finding-1", version: approvedVersion, approvedVersion }) as Phase5FindingProjection;
const sections = (status: ReportingSectionState["status"] = "not_started"): ReportingSectionState[] =>
  REPORT_SECTION_DEFINITIONS.map((definition, index) => ({
    id: `section-${index + 1}`, sectionKey: definition.key, title: definition.title,
    sortOrder: definition.order, status,
    narrative: status === "complete" ? "Controlled analyst narrative." : null,
    completionBasis: status === "complete" ? "narrative" : null,
    unavailableReason: null, version: 1
  }));
const base = { initialized: true, phase4Complete: true, sections: sections(), links: [], findings: [finding()], financialSourceAvailable: true };

test("readiness covers every Phase 5.1 state from durable inputs", () => {
  assert.equal(deriveReportingReadiness({ ...base, initialized: false }).state, "NOT_INITIALIZED");
  assert.equal(deriveReportingReadiness({ ...base, phase4Complete: false }).state, "BLOCKED_BY_PHASE_4");
  assert.equal(deriveReportingReadiness(base).state, "READY_TO_COMPOSE");
  assert.equal(deriveReportingReadiness({ ...base, sections: sections("in_progress") }).state, "COMPOSITION_IN_PROGRESS");
  assert.equal(deriveReportingReadiness({ ...base, links: [{ reportSectionId: "section-1", issueId: "finding-1", expectedApprovedVersion: 2, sortOrder: 1 }] }).state, "STALE_SOURCE");
  const ready = deriveReportingReadiness({ ...base, sections: sections("complete") });
  assert.equal(ready.state, "READY_FOR_REVIEW");
  assert.equal(ready.completionPercent, 100);
});

test("stale links distinguish missing projections from approval-version changes", () => {
  const links = [
    { reportSectionId: "section-1", issueId: "finding-1", expectedApprovedVersion: 2, sortOrder: 1 },
    { reportSectionId: "section-2", issueId: "missing", expectedApprovedVersion: 1, sortOrder: 1 }
  ];
  assert.deepEqual(detectStaleReportingLinks(links, [finding(3)]).map((item) => item.reason), ["approved_version_changed", "finding_missing_from_projection"]);
});

test("section completion requires a supported durable basis", () => {
  const invalid = sections("complete");
  invalid[0] = { ...invalid[0], narrative: "", completionBasis: "narrative" };
  assert.equal(deriveReportingReadiness({ ...base, sections: invalid }).state, "COMPOSITION_IN_PROGRESS");
  assert.equal(deriveReportingReadiness({ ...base, sections: sections("complete"), financialSourceAvailable: false }).state, "COMPOSITION_IN_PROGRESS");
  const unsupported = sections("complete");
  unsupported[6] = { ...unsupported[6], completionBasis: "authoritative", narrative: null };
  assert.equal(deriveReportingReadiness({ ...base, sections: unsupported }).state, "COMPOSITION_IN_PROGRESS");
});
