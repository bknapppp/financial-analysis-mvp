"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatCurrency, formatPercent } from "@/lib/formatters";
import type { DealScreenerRow } from "@/lib/data";

type DealsScreenerTableProps = {
  rows: DealScreenerRow[];
};

type SortKey =
  | "companyName"
  | "industry"
  | "revenue"
  | "ebitda"
  | "adjustedEbitda"
  | "ebitdaMarginPercent"
  | "decision"
  | "primaryRisk"
  | "dscr"
  | "debtToEbitda"
  | "ltv"
  | "lastUpdated";

type SortDirection = "asc" | "desc";

const MISSING_VALUE = "—";

function formatMultiple(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return MISSING_VALUE;
  }

  return `${value.toFixed(2)}x`;
}

function formatDate(value: string | null) {
  if (!value) {
    return MISSING_VALUE;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return MISSING_VALUE;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatDecision(value: DealScreenerRow["decision"]) {
  if (value === "approve") return "Approve";
  if (value === "caution") return "Caution";
  return "Decline";
}

function decisionTone(value: DealScreenerRow["decision"]) {
  if (value === "approve") return "border-teal-200 bg-teal-50 text-teal-900";
  if (value === "caution") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

function rowTone(value: DealScreenerRow["decision"]) {
  if (value === "approve") return "border-l-teal-300";
  if (value === "caution") return "border-l-amber-300";
  return "border-l-rose-300";
}

function compareValues(
  left: DealScreenerRow,
  right: DealScreenerRow,
  key: SortKey,
  direction: SortDirection
) {
  const multiplier = direction === "asc" ? 1 : -1;

  const leftValue = left[key];
  const rightValue = right[key];

  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * multiplier;
  }

  const normalizedLeft = leftValue ?? Number.NEGATIVE_INFINITY;
  const normalizedRight = rightValue ?? Number.NEGATIVE_INFINITY;

  return (normalizedLeft - normalizedRight) * multiplier;
}

export function DealsScreenerTable({ rows }: DealsScreenerTableProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastUpdated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const searched = normalizedQuery
      ? rows.filter((row) => row.companyName.toLowerCase().includes(normalizedQuery))
      : rows;

    return [...searched].sort((left, right) =>
      compareValues(left, right, sortKey, sortDirection)
    );
  }, [query, rows, sortDirection, sortKey]);

  function updateSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "companyName" || nextKey === "industry" || nextKey === "primaryRisk" ? "asc" : "desc");
  }

  const columns: Array<{ key: SortKey; label: string; align?: "left" | "right" }> = [
    { key: "companyName", label: "Company Name" },
    { key: "industry", label: "Industry" },
    { key: "revenue", label: "Revenue", align: "right" },
    { key: "ebitda", label: "EBITDA", align: "right" },
    { key: "adjustedEbitda", label: "Adjusted EBITDA", align: "right" },
    { key: "ebitdaMarginPercent", label: "EBITDA Margin", align: "right" },
    { key: "decision", label: "Decision" },
    { key: "primaryRisk", label: "Primary Risk" },
    { key: "dscr", label: "DSCR", align: "right" },
    { key: "debtToEbitda", label: "Debt / EBITDA", align: "right" },
    { key: "ltv", label: "LTV", align: "right" },
    { key: "lastUpdated", label: "Last Updated" }
  ];

  return (
    <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-panel md:px-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-slate-400">
            Deal Screener
          </p>
          <h1 className="mt-1 text-xl font-semibold text-slate-950">Deals</h1>
        </div>
        <div className="w-full max-w-xs">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search company"
            aria-label="Search company"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
          />
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-[13px]">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 ${
                    column.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => updateSort(column.key)}
                    className={`inline-flex items-center gap-1 whitespace-nowrap ${
                      column.align === "right" ? "ml-auto" : ""
                    }`}
                  >
                    <span>{column.label}</span>
                    <span className="text-[10px] text-slate-400">
                      {sortKey === column.key ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {filteredRows.length > 0 ? (
              filteredRows.map((row) => (
                <tr
                  key={row.companyId}
                  className={`cursor-pointer border-l-2 transition-colors hover:bg-slate-50 focus-within:bg-slate-50 ${rowTone(
                    row.decision
                  )}`}
                  onClick={() => router.push(`/deal/${row.companyId}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/deal/${row.companyId}`);
                    }
                  }}
                  tabIndex={0}
                  role="link"
                  aria-label={`Open ${row.companyName}`}
                >
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/deal/${row.companyId}`}
                      className="font-medium text-slate-900 hover:text-slate-950"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {row.companyName}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-slate-500">{row.industry ?? MISSING_VALUE}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {row.revenue === null ? MISSING_VALUE : formatCurrency(row.revenue)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {row.ebitda === null ? MISSING_VALUE : formatCurrency(row.ebitda)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium text-slate-900">
                    <span className="inline-flex items-center justify-end gap-2">
                      <span>
                        {row.adjustedEbitda === null
                          ? MISSING_VALUE
                          : formatCurrency(row.adjustedEbitda)}
                      </span>
                      {row.ebitda === 0 &&
                      row.adjustedEbitda !== null &&
                      row.adjustedEbitda > 0 ? (
                        <span className="rounded border border-slate-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Adj
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {row.ebitdaMarginPercent === null
                      ? MISSING_VALUE
                      : formatPercent(row.ebitdaMarginPercent)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex min-w-[88px] items-center justify-center rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${decisionTone(
                        row.decision
                      )}`}
                    >
                      {formatDecision(row.decision)}
                    </span>
                  </td>
                  <td className="max-w-[220px] px-3 py-2.5 text-[12px] text-slate-700">
                    <span className="block truncate">{row.primaryRisk ?? MISSING_VALUE}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {formatMultiple(row.dscr)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {formatMultiple(row.debtToEbitda)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                    {row.ltv === null ? MISSING_VALUE : formatPercent(row.ltv * 100)}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400">
                    {formatDate(row.lastUpdated)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-slate-500"
                >
                  No deals match the current search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-500">
        <span>{filteredRows.length} deals</span>
        <span>Click any row to open the workspace</span>
      </div>
    </section>
  );
}
