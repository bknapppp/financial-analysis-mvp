"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type MouseEvent } from "react";
import { buildFixItHref } from "@/lib/fix-it";
import { isRecentlyUpdated, type PortfolioDealStatus } from "@/lib/portfolio-deal-state";
import type { DealScreenerRow } from "@/lib/data";

type DealsScreenerTableProps = {
  rows: DealScreenerRow[];
};

type SortKey =
  | "urgency"
  | "lastUpdated"
  | "completionPercent"
  | "currentBlocker"
  | "companyName";

type SortDirection = "asc" | "desc";
type CompletionBand = "all" | "0-24" | "25-49" | "50-74" | "75-99" | "100";
type RiskFilter = "all" | "high" | "medium" | "low" | "none";
type UpdatedFilter = "all" | "7d" | "30d" | "90d" | "older" | "unknown";
type SummaryFilter =
  | "all"
  | "ready_for_review_or_structure"
  | "missing_critical_inputs"
  | "high_risk"
  | "recently_updated";
type QuickFilter = "all" | "blocked" | "ready";

const STATUS_ORDER: Record<PortfolioDealStatus, number> = {
  "Needs source data": 0,
  "Needs mapping": 1,
  "Needs underwriting inputs": 2,
  "Underwriting in progress": 3,
  "Ready for structure": 4,
  "Ready for output": 5
};

const MISSING_VALUE = "\u2014";

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

function formatCompletion(value: number) {
  return `${value}%`;
}

function statusTone(status: PortfolioDealStatus) {
  if (status === "Ready for output") {
    return "border-teal-200 bg-teal-50 text-teal-900";
  }

  if (status === "Ready for structure" || status === "Underwriting in progress") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }

  if (status === "Needs mapping") {
    return "border-amber-200 bg-amber-50 text-amber-900";
  }

  return "border-rose-200 bg-rose-50 text-rose-900";
}

function rowTone(status: PortfolioDealStatus) {
  if (status === "Ready for output") {
    return "border-l-teal-300";
  }

  if (status === "Ready for structure" || status === "Underwriting in progress") {
    return "border-l-sky-300";
  }

  if (status === "Needs mapping") {
    return "border-l-amber-300";
  }

  return "border-l-rose-300";
}

function riskTone(severity: DealScreenerRow["riskSeverity"]) {
  if (severity === "high") return "border-rose-200 bg-rose-50 text-rose-900";
  if (severity === "medium") return "border-amber-200 bg-amber-50 text-amber-900";
  if (severity === "low") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-slate-200 bg-white text-slate-500";
}

function riskLabel(severity: DealScreenerRow["riskSeverity"]) {
  if (severity === "high") return "High";
  if (severity === "medium") return "Medium";
  if (severity === "low") return "Low";
  return "None";
}

function completionBandMatches(value: number, band: CompletionBand) {
  if (band === "all") return true;
  if (band === "0-24") return value < 25;
  if (band === "25-49") return value >= 25 && value < 50;
  if (band === "50-74") return value >= 50 && value < 75;
  if (band === "75-99") return value >= 75 && value < 100;
  return value === 100;
}

function lastUpdatedMatches(value: string | null, filter: UpdatedFilter, now: Date) {
  if (filter === "all") return true;
  if (!value) return filter === "unknown";

  const updatedAt = new Date(value);
  if (Number.isNaN(updatedAt.getTime())) {
    return filter === "unknown";
  }

  const ageInDays = (now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000);

  if (filter === "7d") return ageInDays <= 7;
  if (filter === "30d") return ageInDays <= 30;
  if (filter === "90d") return ageInDays <= 90;
  if (filter === "older") return ageInDays > 90;
  return false;
}

function compareValues(
  left: DealScreenerRow,
  right: DealScreenerRow,
  key: SortKey,
  direction: SortDirection
) {
  const multiplier = direction === "asc" ? 1 : -1;

  if (key === "urgency") {
    return (STATUS_ORDER[left.status] - STATUS_ORDER[right.status]) * multiplier;
  }

  if (key === "lastUpdated") {
    const leftValue = left.lastUpdated ? new Date(left.lastUpdated).getTime() : Number.NEGATIVE_INFINITY;
    const rightValue = right.lastUpdated ? new Date(right.lastUpdated).getTime() : Number.NEGATIVE_INFINITY;
    return (leftValue - rightValue) * multiplier;
  }

  const leftValue = left[key];
  const rightValue = right[key];

  if (typeof leftValue === "string" || typeof rightValue === "string") {
    return String(leftValue ?? "").localeCompare(String(rightValue ?? "")) * multiplier;
  }

  const normalizedLeft = leftValue ?? Number.NEGATIVE_INFINITY;
  const normalizedRight = rightValue ?? Number.NEGATIVE_INFINITY;

  return (normalizedLeft - normalizedRight) * multiplier;
}

function SummaryCard(props: {
  label: string;
  value: string;
  detail?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
        props.active
          ? "border-slate-900 bg-slate-900 text-white"
          : "border-slate-200 bg-slate-50 hover:bg-white"
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-slate-400">
        {props.label}
      </p>
      <p className={`mt-2 text-2xl font-semibold tracking-tight ${props.active ? "text-white" : "text-slate-950"}`}>
        {props.value}
      </p>
      {props.detail ? (
        <p className={`mt-1 text-sm ${props.active ? "text-slate-200" : "text-slate-500"}`}>{props.detail}</p>
      ) : null}
    </button>
  );
}

function ActionLink(props: {
  href: string;
  label: string;
  onStop: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={props.href}
      onClick={props.onStop}
      className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      {props.label}
    </Link>
  );
}

export function DealsScreenerTable({ rows }: DealsScreenerTableProps) {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PortfolioDealStatus | "all">("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("urgency");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const industries = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .map((row) => row.industry)
            .filter((industry): industry is string => Boolean(industry))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [rows]
  );

  const portfolioSummary = useMemo(() => {
    const averageCompletion =
      rows.length > 0
        ? Math.round(
            rows.reduce((total, row) => total + row.completionPercent, 0) / rows.length
          )
        : 0;

    return {
      activeDeals: rows.length,
      readyForReviewOrStructure: rows.filter(
        (row) => row.status === "Ready for structure" || row.status === "Ready for output"
      ).length,
      missingCriticalInputs: rows.filter((row) =>
        ["Needs source data", "Needs underwriting inputs"].includes(row.status)
      ).length,
      highRiskDeals: rows.filter((row) => row.riskSeverity === "high").length,
      averageCompletion,
      recentlyUpdatedDeals: rows.filter((row) => isRecentlyUpdated(row.lastUpdated, now)).length
    };
  }, [now, rows]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    const searched = rows.filter((row) => {
      if (
        normalizedQuery &&
        ![
          row.companyName,
          row.industry ?? "",
          row.status,
          row.currentBlocker ?? "",
          row.nextAction,
          row.primaryRisk ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      ) {
        return false;
      }

      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      if (
        quickFilter === "blocked" &&
        row.status !== "Needs source data" &&
        row.status !== "Needs mapping" &&
        row.status !== "Needs underwriting inputs"
      ) {
        return false;
      }

      if (
        quickFilter === "ready" &&
        row.status !== "Ready for structure" &&
        row.status !== "Ready for output"
      ) {
        return false;
      }

      if (
        summaryFilter === "ready_for_review_or_structure" &&
        row.status !== "Ready for structure" &&
        row.status !== "Ready for output"
      ) {
        return false;
      }

      if (
        summaryFilter === "missing_critical_inputs" &&
        row.status !== "Needs source data" &&
        row.status !== "Needs underwriting inputs"
      ) {
        return false;
      }

      if (summaryFilter === "high_risk" && row.riskSeverity !== "high") {
        return false;
      }

      if (summaryFilter === "recently_updated" && !isRecentlyUpdated(row.lastUpdated, now)) {
        return false;
      }

      if (riskFilter === "none" && row.riskSeverity !== null) {
        return false;
      }

      if (riskFilter !== "all" && riskFilter !== "none" && row.riskSeverity !== riskFilter) {
        return false;
      }

      if (industryFilter !== "all" && row.industry !== industryFilter) {
        return false;
      }

      if (staleOnly && isRecentlyUpdated(row.lastUpdated, now)) {
        return false;
      }

      return true;
    });

    return [...searched].sort((left, right) =>
      compareValues(left, right, sortKey, sortDirection)
    );
  }, [
    industryFilter,
    now,
    query,
    riskFilter,
    rows,
    quickFilter,
    sortDirection,
    sortKey,
    staleOnly,
    statusFilter,
    summaryFilter
  ]);

  function updateSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(
      nextKey === "companyName" ||
        nextKey === "currentBlocker"
        ? "asc"
        : "desc"
    );
  }

  function toggleStatusFilter(nextStatus: PortfolioDealStatus | "all") {
    setStatusFilter((current) => (current === nextStatus ? "all" : nextStatus));
  }

  function toggleSummaryFilter(nextFilter: SummaryFilter) {
    setSummaryFilter((current) => (current === nextFilter ? "all" : nextFilter));
  }

  function stopRowNavigation(event: MouseEvent<HTMLAnchorElement>) {
    event.stopPropagation();
  }

  const hasActiveFilters =
    summaryFilter !== "all" ||
    statusFilter !== "all" ||
    riskFilter !== "all" ||
    industryFilter !== "all" ||
    quickFilter !== "all" ||
    staleOnly;

  const columns: Array<{ key: SortKey; label: string; align?: "left" | "right" }> = [
    { key: "companyName", label: "Company" },
    { key: "urgency", label: "Status" },
    { key: "completionPercent", label: "Completion %", align: "right" },
    { key: "currentBlocker", label: "Current Blocker" },
    { key: "lastUpdated", label: "Last Updated" }
  ];

  return (
    <section className="space-y-4">
      <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-panel md:px-5">
        <div className="border-b border-slate-200 pb-4">
          <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-slate-400">
            Portfolio Command Center
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-950">All Deals</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monitor deterministic readiness, blockers, and risk across the active portfolio.
          </p>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCard
            label="Active Deals"
            value={String(portfolioSummary.activeDeals)}
            detail="Companies currently in the portfolio"
            active={
              summaryFilter === "all" &&
              statusFilter === "all" &&
              riskFilter === "all"
            }
            onClick={() => {
              setSummaryFilter("all");
              setStatusFilter("all");
              setRiskFilter("all");
              setQuickFilter("all");
              setStaleOnly(false);
            }}
          />
          <SummaryCard
            label="Ready For Review / Structure"
            value={String(portfolioSummary.readyForReviewOrStructure)}
            detail="Deals that can move through structure or output prep"
            active={summaryFilter === "ready_for_review_or_structure"}
            onClick={() => toggleSummaryFilter("ready_for_review_or_structure")}
          />
          <SummaryCard
            label="Missing Critical Inputs"
            value={String(portfolioSummary.missingCriticalInputs)}
            detail="Deals blocked on source or underwriting inputs"
            active={summaryFilter === "missing_critical_inputs"}
            onClick={() => toggleSummaryFilter("missing_critical_inputs")}
          />
          <SummaryCard
            label="High-Risk Deals"
            value={String(portfolioSummary.highRiskDeals)}
            detail="Deals with a high-severity primary risk"
            active={summaryFilter === "high_risk"}
            onClick={() => toggleSummaryFilter("high_risk")}
          />
          <SummaryCard
            label="Average Completion %"
            value={formatCompletion(portfolioSummary.averageCompletion)}
            detail="Mean underwriting completion across the portfolio"
            active={sortKey === "completionPercent"}
            onClick={() => {
              setSortKey("completionPercent");
              setSortDirection("desc");
            }}
          />
          <SummaryCard
            label="Recently Updated Deals"
            value={String(portfolioSummary.recentlyUpdatedDeals)}
            detail="Updated in the last 14 days"
            active={summaryFilter === "recently_updated"}
            onClick={() => toggleSummaryFilter("recently_updated")}
          />
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-panel md:px-5">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-slate-400">
              Working Grid
            </p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Portfolio Grid</h2>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search company, blocker, or risk"
              aria-label="Search deals"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 xl:col-span-2"
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as PortfolioDealStatus | "all")
              }
              aria-label="Filter by status"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All statuses</option>
              <option value="Needs source data">Needs source data</option>
              <option value="Needs mapping">Needs mapping</option>
              <option value="Needs underwriting inputs">Needs underwriting inputs</option>
              <option value="Underwriting in progress">Underwriting in progress</option>
              <option value="Ready for structure">Ready for structure</option>
              <option value="Ready for output">Ready for output</option>
            </select>
            <select
              value={quickFilter}
              onChange={(event) => setQuickFilter(event.target.value as QuickFilter)}
              aria-label="Quick filters"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
                <option value="all">All deals</option>
                <option value="blocked">Blocked only</option>
                <option value="ready">Ready only</option>
              </select>
            <select
              value={sortKey}
              onChange={(event) => {
                const nextKey = event.target.value as SortKey;
                setSortKey(nextKey);
                setSortDirection(nextKey === "urgency" ? "asc" : "desc");
              }}
              aria-label="Sort deals"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="urgency">Sort: Urgency</option>
              <option value="lastUpdated">Sort: Last updated</option>
              <option value="completionPercent">Sort: Completion %</option>
            </select>
            <select
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value as RiskFilter)}
              aria-label="Filter by risk"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All risk</option>
              <option value="high">High risk</option>
              <option value="medium">Medium risk</option>
              <option value="low">Low risk</option>
              <option value="none">No primary risk</option>
            </select>
            <select
              value={industryFilter}
              onChange={(event) => setIndustryFilter(event.target.value)}
              aria-label="Filter by industry"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="all">All industries</option>
              {industries.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={staleOnly}
                onChange={(event) => setStaleOnly(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
              />
              Stale only
            </label>
          </div>

          {hasActiveFilters ? (
            <div className="flex flex-wrap gap-2">
              {summaryFilter !== "all" ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {summaryFilter.replaceAll("_", " ")}
                </span>
              ) : null}
              {quickFilter !== "all" ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {quickFilter === "blocked" ? "blocked only" : "ready only"}
                </span>
              ) : null}
              {staleOnly ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  stale only
                </span>
              ) : null}
              {statusFilter !== "all" ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {statusFilter}
                </span>
              ) : null}
              {riskFilter !== "all" ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {riskFilter} risk
                </span>
              ) : null}
              {industryFilter !== "all" ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {industryFilter}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setSummaryFilter("all");
                  setStatusFilter("all");
                  setRiskFilter("all");
                  setIndustryFilter("all");
                  setQuickFilter("all");
                  setStaleOnly(false);
                }}
                className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200">
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
                        {sortKey === column.key ? (sortDirection === "asc" ? "\u25b2" : "\u25bc") : "\u2195"}
                      </span>
                    </button>
                  </th>
                ))}
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Next Action
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <tr
                    key={row.companyId}
                    className={`cursor-pointer border-l-2 align-top transition-colors hover:bg-slate-50 focus-within:bg-slate-50 ${rowTone(
                      row.status
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
                    <td className="px-3 py-3">
                      <Link
                        href={`/deal/${row.companyId}`}
                        className="font-medium text-slate-900 hover:text-slate-950"
                        onClick={stopRowNavigation}
                      >
                        {row.companyName}
                      </Link>
                      {row.industry ? (
                        <p className="mt-1 text-xs text-slate-500">{row.industry}</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusTone(
                          row.status
                        )}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      {formatCompletion(row.completionPercent)}
                    </td>
                    <td className="max-w-[220px] px-3 py-3 text-[12px] text-slate-700">
                      {row.currentBlocker ? (
                        <span className="block truncate">{row.currentBlocker}</span>
                      ) : row.primaryRisk ? (
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${riskTone(row.riskSeverity)}`}>
                            {riskLabel(row.riskSeverity)}
                          </span>
                          <span className="block truncate">{row.primaryRisk}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-slate-400">{formatDate(row.lastUpdated)}</span>
                        {!isRecentlyUpdated(row.lastUpdated, now) && row.lastUpdated ? (
                          <span className="inline-flex w-fit rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-900">
                            Stale
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="max-w-[180px] px-3 py-3 text-[12px] text-slate-700">
                      <Link
                        href={row.nextActionHref}
                        onClick={stopRowNavigation}
                        className="inline-flex rounded-lg border border-slate-200 px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {row.nextAction}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <ActionLink
                          href={`/deal/${row.companyId}`}
                          label="Overview"
                          onStop={stopRowNavigation}
                        />
                        <ActionLink
                          href={`/financials?companyId=${row.companyId}`}
                          label="Financials"
                          onStop={stopRowNavigation}
                        />
                        {row.hasAddBacks ? (
                          <ActionLink
                            href={buildFixItHref("Review add-backs", `/deal/${row.companyId}`)}
                            label="Add-Backs"
                            onStop={stopRowNavigation}
                          />
                        ) : null}
                        <ActionLink
                          href={`/source-data?companyId=${row.companyId}`}
                          label="Source Data"
                          onStop={stopRowNavigation}
                        />
                        <ActionLink
                          href={`/deal/${row.companyId}?tab=adjustments`}
                          label="Adjustments"
                          onStop={stopRowNavigation}
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length + 2} className="px-4 py-8 text-center text-sm text-slate-500">
                    No deals match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-col gap-2 px-1 text-[11px] text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>{filteredRows.length} deals visible</span>
          <span>Click any row to open the deal workspace overview</span>
        </div>
      </section>
    </section>
  );
}
