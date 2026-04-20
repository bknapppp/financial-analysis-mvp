"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEAL_STAGE_OPTIONS,
  getDealStageDisplay,
  type DealStage
} from "@/lib/deal-stage";

type DealStageSelectProps = {
  companyId: string;
  stage: DealStage;
  stageUpdatedAt?: string | null;
  compact?: boolean;
  showUpdatedAt?: boolean;
  ariaLabel?: string;
};

function formatStageUpdatedAt(value: string | null | undefined) {
  if (!value) {
    return "Not updated";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return "Not updated";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(timestamp);
}

export function DealStageSelect({
  companyId,
  stage,
  stageUpdatedAt = null,
  compact = false,
  showUpdatedAt = false,
  ariaLabel = "Deal stage"
}: DealStageSelectProps) {
  const router = useRouter();
  const [localStage, setLocalStage] = useState(stage);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const display = getDealStageDisplay(localStage);

  useEffect(() => {
    setLocalStage(stage);
  }, [stage]);

  async function handleChange(nextStage: DealStage) {
    const previousStage = localStage;
    setLocalStage(nextStage);
    setErrorMessage(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ stage: nextStage })
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setLocalStage(previousStage);
        setErrorMessage(payload.error ?? "Stage could not be updated.");
        return;
      }

      router.refresh();
    } catch {
      setLocalStage(previousStage);
      setErrorMessage("Stage could not be updated.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className="min-w-0"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className={`rounded-xl border px-2 py-2 ${display.badgeClassName}`}>
        <select
          value={localStage}
          onChange={(event) => handleChange(event.target.value as DealStage)}
          disabled={isSaving}
          aria-label={ariaLabel}
          className={`w-full bg-transparent font-medium outline-none ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {DEAL_STAGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {showUpdatedAt ? (
        <p className="mt-1 text-xs text-slate-500">
          Updated {formatStageUpdatedAt(stageUpdatedAt)}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="mt-1 text-xs text-rose-700">{errorMessage}</p>
      ) : null}
    </div>
  );
}
