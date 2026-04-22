"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  resolveDiligenceIssueActionTarget,
  summarizeDiligenceIssues
} from "@/lib/diligence-issues";
import { groupDiligenceIssues } from "@/lib/diligence-issue-groups";
import type {
  DiligenceIssue,
  DiligenceIssueCategory,
  DiligenceIssueGroupKey,
  DiligenceIssueLinkedPage,
  DiligenceIssueSeverity,
  DiligenceIssueStatus
} from "@/lib/types";

type DiligenceIssuesPanelProps = {
  companyId: string;
  periodId?: string | null;
  issues: DiligenceIssue[];
  currentPage: DiligenceIssueLinkedPage;
  title: string;
  description: string;
  emptyMessage: string;
  allowManualCreate?: boolean;
  preferredGroups?: DiligenceIssueGroupKey[];
  supportByIssueId?: Record<
    string,
    {
      status: "backed" | "partial" | "unbacked";
      detail: string;
      documents?: string[];
      ctaLabel?: string;
    }
  >;
};

const CATEGORY_OPTIONS: DiligenceIssueCategory[] = [
  "source_data",
  "financials",
  "underwriting",
  "reconciliation",
  "validation",
  "credit",
  "tax",
  "diligence_request",
  "other"
];

const SEVERITY_OPTIONS: DiligenceIssueSeverity[] = [
  "low",
  "medium",
  "high",
  "critical"
];

function severityClasses(severity: DiligenceIssueSeverity) {
  if (severity === "critical") return "border-rose-200 bg-rose-50 text-rose-900";
  if (severity === "high") return "border-amber-200 bg-amber-50 text-amber-900";
  if (severity === "medium") return "border-sky-200 bg-sky-50 text-sky-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusClasses(status: DiligenceIssueStatus) {
  if (status === "open") return "bg-rose-100 text-rose-800";
  if (status === "in_review") return "bg-amber-100 text-amber-800";
  if (status === "resolved") return "bg-teal-100 text-teal-800";
  return "bg-slate-200 text-slate-700";
}

function formatLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatBackingLabel(value: "backed" | "partial" | "unbacked") {
  if (value === "backed") return "Backed";
  if (value === "partial") return "Partially Backed";
  return "Unbacked";
}

async function postIssueStatus(id: string, status: DiligenceIssueStatus) {
  const response = await fetch(`/api/diligence-issues/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ status })
  });

  if (!response.ok) {
    const result = (await response.json()) as { error?: string };
    throw new Error(result.error || "Issue could not be updated.");
  }
}

async function postManualIssue(payload: {
  companyId: string;
  periodId?: string | null;
  title: string;
  description: string;
  category: DiligenceIssueCategory;
  severity: DiligenceIssueSeverity;
  linkedPage: DiligenceIssueLinkedPage;
}) {
  const response = await fetch("/api/diligence-issues", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const result = (await response.json()) as { error?: string };
    throw new Error(result.error || "Issue could not be created.");
  }
}

export function DiligenceIssuesPanel({
  companyId,
  periodId,
  issues,
  currentPage,
  title,
  description,
  emptyMessage,
  allowManualCreate = false,
  preferredGroups,
  supportByIssueId = {}
}: DiligenceIssuesPanelProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const [categoryInput, setCategoryInput] =
    useState<DiligenceIssueCategory>("diligence_request");
  const [severityInput, setSeverityInput] =
    useState<DiligenceIssueSeverity>("medium");
  const summary = useMemo(() => summarizeDiligenceIssues(issues), [issues]);
  const issueGroups = useMemo(() => {
    const groups = groupDiligenceIssues({
      issues,
      statuses: ["open", "in_review", "resolved", "waived"]
    });

    if (!preferredGroups?.length) {
      return groups;
    }

    const preferred = new Set(preferredGroups);
    return groups.filter((group) => preferred.has(group.groupKey));
  }, [issues, preferredGroups]);

  async function handleStatusChange(id: string, status: DiligenceIssueStatus) {
    setBusyId(id);
    setStatusError(null);

    try {
      await postIssueStatus(id, status);
      router.refresh();
    } catch (error) {
      setStatusError(
        error instanceof Error ? error.message : "Issue could not be updated."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleCreateIssue() {
    if (!titleInput.trim() || !descriptionInput.trim()) {
      setCreateError("Title and description are required.");
      return;
    }

    setBusyId("create");
    setCreateError(null);

    try {
      await postManualIssue({
        companyId,
        periodId,
        title: titleInput.trim(),
        description: descriptionInput.trim(),
        category: categoryInput,
        severity: severityInput,
        linkedPage: currentPage
      });
      setTitleInput("");
      setDescriptionInput("");
      setCategoryInput("diligence_request");
      setSeverityInput("medium");
      setShowCreateForm(false);
      router.refresh();
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Issue could not be created."
      );
    } finally {
      setBusyId(null);
    }
  }

  function toggleGroup(groupKey: string) {
    setExpandedGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey]
    }));
  }

  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Diligence Issues
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
            {summary.open} open
          </span>
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-800">
            {summary.criticalOpen} critical
          </span>
          {allowManualCreate ? (
            <button
              type="button"
              onClick={() => setShowCreateForm((current) => !current)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {showCreateForm ? "Close" : "New Issue"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-500">
        Open {summary.open} · In review {summary.inReview} · Resolved {summary.resolved} · Waived {summary.waived}
      </div>

      {showCreateForm ? (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={titleInput}
              onChange={(event) => setTitleInput(event.target.value)}
              placeholder="Issue title"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
            <select
              value={categoryInput}
              onChange={(event) => setCategoryInput(event.target.value as DiligenceIssueCategory)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {formatLabel(category)}
                </option>
              ))}
            </select>
            <textarea
              value={descriptionInput}
              onChange={(event) => setDescriptionInput(event.target.value)}
              placeholder="Issue description"
              className="min-h-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400 md:col-span-2"
            />
            <select
              value={severityInput}
              onChange={(event) => setSeverityInput(event.target.value as DiligenceIssueSeverity)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              {SEVERITY_OPTIONS.map((severity) => (
                <option key={severity} value={severity}>
                  {formatLabel(severity)}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateIssue}
                disabled={busyId === "create"}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {busyId === "create" ? "Saving..." : "Create Issue"}
              </button>
            </div>
          </div>
          {createError ? (
            <p className="mt-3 text-sm text-rose-700">{createError}</p>
          ) : null}
        </div>
      ) : null}

      {statusError ? (
        <p className="mt-4 text-sm text-rose-700">{statusError}</p>
      ) : null}

      {issueGroups.length > 0 ? (
        <div className="mt-5 space-y-5">
          <div className="flex flex-wrap gap-2">
            {issueGroups.map((group) => (
              <span
                key={group.groupKey}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700"
              >
                {group.groupLabel}: {group.issueCount}
              </span>
            ))}
          </div>

          {issueGroups.map((group) => (
            <div key={group.groupKey}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                  {group.groupLabel}
                </p>
                <p className="text-xs text-slate-500">
                  {group.issueCount} issue{group.issueCount === 1 ? "" : "s"}
                  {group.criticalCount > 0 ? ` • ${group.criticalCount} critical` : ""}
                  {group.highCount > 0 ? ` • ${group.highCount} high` : ""}
                </p>
              </div>

              {group.primaryIssue ? (
                <div className="mt-2 space-y-3">
                  {(() => {
                    const issue = group.primaryIssue;
                    const actionTarget = resolveDiligenceIssueActionTarget(issue);

                    return (
                      <div
                        key={issue.id}
                        className={`rounded-2xl border px-4 py-4 ${severityClasses(issue.severity)}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="max-w-3xl">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">{issue.title}</p>
                              <span
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses(
                                  issue.status
                                )}`}
                              >
                                {formatLabel(issue.status)}
                              </span>
                              <span className="rounded-full border border-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                                {formatLabel(issue.severity)}
                              </span>
                              <span className="rounded-full border border-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                                {issue.source_type === "system" ? "System" : "Manual"}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-700">{issue.description}</p>
                            {supportByIssueId[issue.id] ? (
                              <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-700">
                                <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                                  Support
                                </p>
                                <p className="mt-1 text-sm text-slate-600">
                                  {formatBackingLabel(supportByIssueId[issue.id]!.status)} ·{" "}
                                  {supportByIssueId[issue.id]!.detail}
                                </p>
                                {supportByIssueId[issue.id]!.documents?.length ? (
                                  <p className="mt-2 text-xs text-slate-500">
                                    {supportByIssueId[issue.id]!.documents!.join(", ")}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                            {group.hasMoreIssues ? (
                              <p className="mt-2 text-xs font-medium text-slate-500">
                                +{group.remainingIssueCount} more in {group.groupLabel}
                              </p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            {actionTarget.isActionable && actionTarget.linkedRoute && actionTarget.actionLabel ? (
                              <Link
                                href={actionTarget.linkedRoute}
                                className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                              >
                                {actionTarget.actionLabel}
                              </Link>
                            ) : null}
                            {group.hasMoreIssues ? (
                              <button
                                type="button"
                                onClick={() => toggleGroup(group.groupKey)}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                              >
                                {expandedGroups[group.groupKey] ? "Hide More" : `View +${group.remainingIssueCount}`}
                              </button>
                            ) : null}
                            {issue.status === "open" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === issue.id}
                                  onClick={() => handleStatusChange(issue.id, "in_review")}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                                >
                                  In Review
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === issue.id}
                                  onClick={() => handleStatusChange(issue.id, "resolved")}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                                >
                                  Resolve
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === issue.id}
                                  onClick={() => handleStatusChange(issue.id, "waived")}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                                >
                                  Waive
                                </button>
                              </>
                            ) : null}
                            {issue.status === "in_review" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busyId === issue.id}
                                  onClick={() => handleStatusChange(issue.id, "open")}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                                >
                                  Reopen
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === issue.id}
                                  onClick={() => handleStatusChange(issue.id, "resolved")}
                                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                                >
                                  Resolve
                                </button>
                              </>
                            ) : null}
                            {(issue.status === "resolved" || issue.status === "waived") ? (
                              <button
                                type="button"
                                disabled={busyId === issue.id}
                                onClick={() => handleStatusChange(issue.id, "open")}
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white disabled:opacity-60"
                              >
                                Reopen
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {expandedGroups[group.groupKey] ? (
                    <div className="space-y-3">
                      {group.orderedIssues.slice(1).map((issue) => {
                        const actionTarget = resolveDiligenceIssueActionTarget(issue);

                        return (
                          <div
                            key={issue.id}
                            className={`rounded-2xl border px-4 py-4 ${severityClasses(issue.severity)}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="max-w-3xl">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-900">{issue.title}</p>
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClasses(
                                      issue.status
                                    )}`}
                                  >
                                    {formatLabel(issue.status)}
                                  </span>
                                  <span className="rounded-full border border-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                                    {formatLabel(issue.severity)}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm text-slate-700">{issue.description}</p>
                                {supportByIssueId[issue.id] ? (
                                  <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-700">
                                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                                      Support
                                    </p>
                                    <p className="mt-1 text-sm text-slate-600">
                                      {formatBackingLabel(supportByIssueId[issue.id]!.status)} ·{" "}
                                      {supportByIssueId[issue.id]!.detail}
                                    </p>
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex flex-wrap items-center gap-2">
                                {actionTarget.isActionable &&
                                actionTarget.linkedRoute &&
                                actionTarget.actionLabel ? (
                                  <Link
                                    href={actionTarget.linkedRoute}
                                    className="rounded-xl bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-100"
                                  >
                                    {actionTarget.actionLabel}
                                  </Link>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
          {emptyMessage}
        </div>
      )}
    </section>
  );
}
