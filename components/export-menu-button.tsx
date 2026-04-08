"use client";

import { useEffect, useRef, useState } from "react";
import { buildReportExport } from "@/lib/report-export";
import type { DashboardData } from "@/lib/types";

type ExportMenuButtonProps = {
  data: DashboardData;
  summaryText: string;
  disabled?: boolean;
};

export function ExportMenuButton({
  data,
  summaryText,
  disabled = false
}: ExportMenuButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "excel" | "csv" | "copy">("idle");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  function closeMenu() {
    setIsOpen(false);
  }

  async function handleExcelExport() {
    if (disabled) {
      return;
    }

    setStatus("excel");
    closeMenu();

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

    setStatus("idle");
  }

  function handleCsvExport() {
    if (disabled) {
      return;
    }

    setStatus("csv");
    closeMenu();

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

    setStatus("idle");
  }

  async function handleCopySummary() {
    if (disabled || !summaryText) {
      return;
    }

    setStatus("copy");
    closeMenu();
    await navigator.clipboard.writeText(summaryText);
    window.setTimeout(() => setStatus("idle"), 1200);
  }

  const buttonLabel =
    status === "excel"
      ? "Preparing Excel..."
      : status === "csv"
        ? "Preparing CSV..."
        : status === "copy"
          ? "Copying..."
          : "Export";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        disabled={disabled || status !== "idle"}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>{buttonLabel}</span>
        <span aria-hidden="true" className="text-xs">
          ▾
        </span>
      </button>

      {isOpen ? (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 min-w-[13rem] rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleExcelExport()}
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Export as Excel (.xlsx)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleCsvExport}
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Export as CSV (.csv)
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => void handleCopySummary()}
            className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Copy Summary
          </button>
        </div>
      ) : null}
    </div>
  );
}
