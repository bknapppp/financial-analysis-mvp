"use client";

import { useState } from "react";

type CopySummaryButtonProps = {
  summaryText: string;
  disabled?: boolean;
};

export function CopySummaryButton({
  summaryText,
  disabled = false
}: CopySummaryButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (disabled || !summaryText) {
      return;
    }

    await navigator.clipboard.writeText(summaryText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled}
      className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {copied ? "Copied" : "Copy Summary"}
    </button>
  );
}
