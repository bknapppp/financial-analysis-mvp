"use client";

import { useState } from "react";
import { getMappingCategoryLabel } from "@/lib/auto-mapping";

type ExistingSavedMapping = {
  concept?: string | null;
  category?: string | null;
};

type SaveMappingResponse = {
  status?: "inserted" | "updated" | "unchanged" | "conflict";
  data?: unknown;
  existingRecord?: ExistingSavedMapping;
  error?: string;
};

type SaveMappingButtonProps = {
  companyId: string | null;
  accountName: string;
  concept?: string;
  category: string;
  statementType: string;
  matchedBy?: string;
  onSaved?: () => void;
  className?: string;
};

export function SaveMappingButton({
  companyId,
  accountName,
  concept,
  category,
  statementType,
  matchedBy,
  onSaved,
  className
}: SaveMappingButtonProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictRecord, setConflictRecord] = useState<ExistingSavedMapping | null>(
    null
  );
  const displayConcept = concept || getMappingCategoryLabel(category);
  const displayCategory = getMappingCategoryLabel(category);

  async function submitMapping(allowOverwrite = false) {
    const response = await fetch("/api/account-mappings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        companyId,
        accountName,
        concept: concept || category,
        category,
        statementType,
        matchedBy,
        allowOverwrite
      })
    });

    const result = (await response.json()) as SaveMappingResponse;

    return {
      ok: response.ok,
      status: result.status,
      existingRecord: result.existingRecord,
      error: result.error
    };
  }

  async function handleSave(allowOverwrite = false) {
    if (!companyId || !accountName || !category || !statementType) {
      return;
    }

    setStatus("saving");
    setErrorMessage(null);

    const result = await submitMapping(allowOverwrite);

    if (result.status === "conflict" && result.existingRecord) {
      setConflictRecord(result.existingRecord);
      setStatus("idle");
      return;
    }

    if (!result.ok) {
      setStatus("error");
      setErrorMessage(result.error ?? "Saved mapping could not be updated.");
      return;
    }

    setConflictRecord(null);
    setStatus("saved");
    onSaved?.();
    window.setTimeout(() => {
      setStatus("idle");
    }, 1800);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={
          !companyId ||
          !accountName ||
          !category ||
          !statementType ||
          status === "saving"
        }
        className={
          className ??
          "rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
        }
      >
        {status === "saving"
          ? "Saving..."
          : status === "saved"
            ? "Saved"
            : status === "error"
              ? "Retry save"
              : "Save mapping"}
      </button>

      {errorMessage ? (
        <p className="text-xs text-rose-700">{errorMessage}</p>
      ) : null}

      {conflictRecord ? (
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm">
          <h4 className="text-sm font-semibold text-slate-900">
            Saved Mapping Already Exists
          </h4>
          <p className="mt-2 text-sm text-slate-700">
            Line Item: {accountName}
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Existing Mapping
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Concept: {conflictRecord.concept || "Not specified"}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Category: {getMappingCategoryLabel(conflictRecord.category) || "Not specified"}
              </p>
            </div>

            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                New Mapping
              </p>
              <p className="mt-2 text-sm text-slate-700">
                Concept: {displayConcept}
              </p>
              <p className="mt-1 text-sm text-slate-700">Category: {displayCategory}</p>
            </div>
          </div>

          <p className="mt-3 text-sm text-slate-600">
            This line item already has a saved mapping for this company.
            Overwriting will update future import classification.
          </p>

          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setConflictRecord(null);
                setErrorMessage(null);
              }}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Keep Existing Mapping
            </button>
            <button
              type="button"
              onClick={() => void handleSave(true)}
              className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
            >
              Overwrite Saved Mapping
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
