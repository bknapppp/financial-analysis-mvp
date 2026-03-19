"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getAddBackTypeLabel } from "@/lib/add-backs";
import { formatCurrency } from "@/lib/formatters";
import type {
  AddBackClassificationConfidence,
  AddBackReviewItem,
  AddBackStatus,
  AddBackType,
  ReportingPeriod
} from "@/lib/types";

type AddBackReviewPanelProps = {
  companyId: string | null;
  periods: ReportingPeriod[];
  items: AddBackReviewItem[];
};

type EditableRowState = {
  type: AddBackType;
  description: string;
  amount: string;
  classificationConfidence: AddBackClassificationConfidence;
  justification: string;
  supportingReference: string;
};

const FILTER_OPTIONS: Array<"all" | AddBackStatus> = [
  "all",
  "suggested",
  "accepted",
  "rejected"
];

const TYPE_OPTIONS: AddBackType[] = [
  "owner_related",
  "non_recurring",
  "discretionary",
  "non_operating",
  "accounting_normalization",
  "run_rate_adjustment"
];

const CONFIDENCE_OPTIONS: AddBackClassificationConfidence[] = [
  "high",
  "medium",
  "low"
];

function defaultDraft(periodId: string): EditableRowState & { periodId: string } {
  return {
    periodId,
    type: "owner_related",
    description: "",
    amount: "",
    classificationConfidence: "medium",
    justification: "",
    supportingReference: ""
  };
}

function statusTone(status: AddBackStatus) {
  if (status === "accepted") return "bg-teal-100 text-teal-800";
  if (status === "rejected") return "bg-slate-200 text-slate-700";
  return "bg-amber-100 text-amber-800";
}

export function AddBackReviewPanel({
  companyId,
  periods,
  items
}: AddBackReviewPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filter, setFilter] = useState<"all" | AddBackStatus>("all");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, EditableRowState>>({});
  const [manualDraft, setManualDraft] = useState(() =>
    defaultDraft(periods[periods.length - 1]?.id ?? "")
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const nextItems =
      filter === "all" ? items : items.filter((item) => item.status === filter);

    return nextItems.sort((left, right) => {
      if (left.status !== right.status) {
        const order = { accepted: 0, suggested: 1, rejected: 2 };
        return order[left.status] - order[right.status];
      }

      if (left.amount !== right.amount) {
        return right.amount - left.amount;
      }

      return left.periodLabel.localeCompare(right.periodLabel);
    });
  }, [filter, items]);

  function getRowKey(item: AddBackReviewItem) {
    return item.id ?? `${item.periodId}:${item.linkedEntryId ?? item.description}:${item.type}`;
  }

  function getRowDraft(item: AddBackReviewItem) {
    return (
      drafts[getRowKey(item)] ?? {
        type: item.type,
        description: item.description,
        amount: String(item.amount),
        classificationConfidence: item.classificationConfidence,
        justification: item.justification,
        supportingReference: item.supportingReference ?? ""
      }
    );
  }

  function updateDraft(
    item: AddBackReviewItem,
    field: keyof EditableRowState,
    value: string
  ) {
    const key = getRowKey(item);
    const current = getRowDraft(item);

    setDrafts((previous) => ({
      ...previous,
      [key]: {
        ...current,
        [field]: value
      }
    }));
  }

  function refresh(message?: string) {
    setSuccessMessage(message ?? null);
    startTransition(() => router.refresh());
  }

  async function persistSuggestion(item: AddBackReviewItem, status: AddBackStatus) {
    if (!companyId) {
      return;
    }

    const draft = getRowDraft(item);
    const response = await fetch("/api/add-backs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        companyId,
        periodId: item.periodId,
        linkedEntryId: item.linkedEntryId,
        type: draft.type,
        description: draft.description,
        amount: Number(draft.amount),
        classificationConfidence: draft.classificationConfidence,
        source: item.source,
        status,
        justification: draft.justification,
        supportingReference: draft.supportingReference || null
      })
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setErrorMessage(payload.error ?? "Add-back could not be saved.");
      return;
    }

    setEditingKey(null);
    refresh(status === "accepted" ? "Add-back accepted." : "Add-back rejected.");
  }

  async function updatePersistedItem(item: AddBackReviewItem, status?: AddBackStatus) {
    if (!item.id) {
      return;
    }

    const draft = getRowDraft(item);
    const response = await fetch(`/api/add-backs/${item.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: draft.type,
        description: draft.description,
        amount: Number(draft.amount),
        classificationConfidence: draft.classificationConfidence,
        justification: draft.justification,
        supportingReference: draft.supportingReference || null,
        status: status ?? item.status
      })
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setErrorMessage(payload.error ?? "Add-back could not be updated.");
      return;
    }

    setEditingKey(null);
    refresh(status ? `Add-back ${status}.` : "Add-back updated.");
  }

  async function deleteManualItem(item: AddBackReviewItem) {
    if (!item.id) {
      return;
    }

    const response = await fetch(`/api/add-backs/${item.id}`, {
      method: "DELETE"
    });
    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setErrorMessage(payload.error ?? "Add-back could not be deleted.");
      return;
    }

    refresh("Manual add-back deleted.");
  }

  async function createManualItem() {
    if (!companyId || !manualDraft.periodId) {
      setErrorMessage("Select a company and period before adding a manual add-back.");
      return;
    }

    const response = await fetch("/api/add-backs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        companyId,
        periodId: manualDraft.periodId,
        linkedEntryId: null,
        type: manualDraft.type,
        description: manualDraft.description,
        amount: Number(manualDraft.amount),
        classificationConfidence: manualDraft.classificationConfidence,
        source: "user",
        status: "accepted",
        justification: manualDraft.justification,
        supportingReference: manualDraft.supportingReference || null
      })
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setErrorMessage(payload.error ?? "Manual add-back could not be created.");
      return;
    }

    setManualDraft(defaultDraft(periods[periods.length - 1]?.id ?? ""));
    refresh("Manual add-back added.");
  }

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Add-Back Review
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">
            Review and defend adjustments
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Accept, reject, edit, and document add-backs before using Adjusted EBITDA.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setFilter(option)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                filter === option
                  ? "bg-ink text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {option === "all" ? "All" : option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Description
            </label>
            <input
              value={manualDraft.description}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  description: event.target.value
                }))
              }
              placeholder="Owner vehicle expense"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Period
            </label>
            <select
              value={manualDraft.periodId}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  periodId: event.target.value
                }))
              }
            >
              <option value="">Select period</option>
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Type
            </label>
            <select
              value={manualDraft.type}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  type: event.target.value as AddBackType
                }))
              }
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {getAddBackTypeLabel(option)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Amount
            </label>
            <input
              type="number"
              step="0.01"
              value={manualDraft.amount}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  amount: event.target.value
                }))
              }
              placeholder="1500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Confidence
            </label>
            <select
              value={manualDraft.classificationConfidence}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  classificationConfidence:
                    event.target.value as AddBackClassificationConfidence
                }))
              }
            >
              {CONFIDENCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-[1.4fr_0.8fr_auto]">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Justification
            </label>
            <input
              value={manualDraft.justification}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  justification: event.target.value
                }))
              }
              placeholder="Normalize owner-specific costs."
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Support
            </label>
            <input
              value={manualDraft.supportingReference}
              onChange={(event) =>
                setManualDraft((current) => ({
                  ...current,
                  supportingReference: event.target.value
                }))
              }
              placeholder="GL detail / email"
            />
          </div>
          <button
            type="button"
            onClick={createManualItem}
            disabled={isPending || !companyId}
            className="self-end rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-60"
          >
            Add manual
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500">
            No add-backs match this filter yet.
          </div>
        ) : null}

        {filteredItems.map((item) => {
          const rowKey = getRowKey(item);
          const draft = getRowDraft(item);
          const isEditing = editingKey === rowKey;

          return (
            <div
              key={rowKey}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-base font-semibold text-slate-900">
                      {item.description}
                    </p>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${statusTone(item.status)}`}
                    >
                      {item.status}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {item.source === "system" ? "System" : "User"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      {draft.classificationConfidence}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-slate-600">
                    {item.periodLabel} • {getAddBackTypeLabel(item.type)}
                    {item.entryAccountName ? ` • ${item.entryAccountName}` : ""}
                  </p>

                  <p className="mt-2 text-sm text-slate-700">{item.justification}</p>

                  <p className="mt-2 text-xs text-slate-500">
                    {item.entryCategory ? `${item.entryCategory} • ` : ""}
                    {item.entryStatementType ? `${item.entryStatementType} • ` : ""}
                    {item.matchedBy ? `${item.matchedBy.replace("_", " ")} • ` : ""}
                    {item.confidence ? `${item.confidence} confidence` : "Manual item"}
                  </p>

                  {item.dependsOnLowConfidenceMapping ? (
                    <p className="mt-2 text-xs font-medium text-amber-700">
                      Suggested from a low-confidence mapping.
                    </p>
                  ) : null}
                </div>

                <div className="text-right">
                  <p className="text-xl font-semibold text-slate-900">
                    +{formatCurrency(item.amount)}
                  </p>
                </div>
              </div>

              {isEditing ? (
                <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Type
                    </label>
                    <select
                      value={draft.type}
                      onChange={(event) =>
                        updateDraft(item, "type", event.target.value)
                      }
                    >
                      {TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {getAddBackTypeLabel(option)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Confidence
                    </label>
                    <select
                      value={draft.classificationConfidence}
                      onChange={(event) =>
                        updateDraft(
                          item,
                          "classificationConfidence",
                          event.target.value
                        )
                      }
                    >
                      {CONFIDENCE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Description
                    </label>
                    <input
                      value={draft.description}
                      onChange={(event) =>
                        updateDraft(item, "description", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Amount
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={draft.amount}
                      onChange={(event) =>
                        updateDraft(item, "amount", event.target.value)
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Support
                    </label>
                    <input
                      value={draft.supportingReference}
                      onChange={(event) =>
                        updateDraft(item, "supportingReference", event.target.value)
                      }
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
                      Justification
                    </label>
                    <textarea
                      value={draft.justification}
                      onChange={(event) =>
                        updateDraft(item, "justification", event.target.value)
                      }
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none ring-0 transition focus:border-teal-500"
                    />
                  </div>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                {item.isPersisted ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void updatePersistedItem(item, "accepted")}
                      disabled={isPending}
                      className="rounded-xl bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => void updatePersistedItem(item, "rejected")}
                      disabled={isPending}
                      className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        isEditing
                          ? void updatePersistedItem(item)
                          : setEditingKey(rowKey)
                      }
                      disabled={isPending}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {isEditing ? "Save edits" : "Edit"}
                    </button>
                    {item.source === "user" ? (
                      <button
                        type="button"
                        onClick={() => void deleteManualItem(item)}
                        disabled={isPending}
                        className="rounded-xl border border-rose-200 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                      >
                        Delete
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => void persistSuggestion(item, "accepted")}
                      disabled={isPending}
                      className="rounded-xl bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => void persistSuggestion(item, "rejected")}
                      disabled={isPending}
                      className="rounded-xl bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingKey((current) => (current === rowKey ? null : rowKey))
                      }
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {isEditing ? "Close edit" : "Edit"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
