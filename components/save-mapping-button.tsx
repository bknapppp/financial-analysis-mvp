"use client";

import { useState } from "react";

type SaveMappingButtonProps = {
  companyId: string | null;
  accountName: string;
  category: string;
  statementType: string;
  onSaved?: () => void;
  className?: string;
};

export function SaveMappingButton({
  companyId,
  accountName,
  category,
  statementType,
  onSaved,
  className
}: SaveMappingButtonProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle"
  );

  async function handleSave() {
    if (!companyId || !accountName || !category || !statementType) {
      return;
    }

    setStatus("saving");

    const response = await fetch("/api/account-mappings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        companyId,
        accountName,
        category,
        statementType
      })
    });

    if (!response.ok) {
      setStatus("error");
      return;
    }

    setStatus("saved");
    onSaved?.();
    window.setTimeout(() => {
      setStatus("idle");
    }, 1800);
  }

  return (
    <button
      type="button"
      onClick={handleSave}
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
  );
}
