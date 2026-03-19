"use client";

import { useState } from "react";
import type { DashboardData } from "@/lib/types";

type DownloadExcelButtonProps = {
  data: DashboardData;
  disabled?: boolean;
};

export function DownloadExcelButton({
  data,
  disabled = false
}: DownloadExcelButtonProps) {
  const [status, setStatus] = useState<"idle" | "preparing" | "downloaded">("idle");

  async function handleDownload() {
    if (disabled) {
      return;
    }

    setStatus("preparing");

    const { buildReportWorkbook } = await import("@/lib/report-export-xlsx");
    const workbook = await buildReportWorkbook(data);
    const blob = new Blob([workbook.buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = workbook.filename;
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
      onClick={() => void handleDownload()}
      disabled={disabled || status === "preparing"}
      className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {status === "preparing"
        ? "Preparing Excel..."
        : status === "downloaded"
          ? "Excel Downloaded"
          : "Download Excel"}
    </button>
  );
}
