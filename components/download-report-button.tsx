"use client";

import { useState } from "react";
import { buildReportExport } from "@/lib/report-export";
import type { DashboardData } from "@/lib/types";

type DownloadReportButtonProps = {
  data: DashboardData;
  disabled?: boolean;
};

export function DownloadReportButton({
  data,
  disabled = false
}: DownloadReportButtonProps) {
  const [status, setStatus] = useState<"idle" | "downloading" | "downloaded">("idle");

  function handleDownload() {
    if (disabled) {
      return;
    }

    setStatus("downloading");

    const report = buildReportExport(data);
    const blob = new Blob([report.content], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = report.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    setStatus("downloaded");
    window.setTimeout(() => setStatus("idle"), 1800);
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={disabled || status === "downloading"}
      className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {status === "downloading"
        ? "Preparing..."
        : status === "downloaded"
          ? "Downloaded"
          : "Export Analysis"}
    </button>
  );
}
