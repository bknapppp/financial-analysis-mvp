"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type MouseEvent as ReactMouseEvent
} from "react";
import {
  DEAL_STAGE_OPTIONS,
  compareDealStages,
  filterRowsByDealStage,
  getDealStageLabel,
  type DealStage,
  type DealStageFilter
} from "@/lib/deal-stage";
import { isRecentlyUpdated, type PortfolioDealStatus } from "@/lib/portfolio-deal-state";
import type { DealScreenerRow } from "@/lib/data";

type DealsScreenerTableProps = {
  rows: DealScreenerRow[];
};

type SortKey =
  | "urgency"
  | "stage"
  | "lastUpdated"
  | "completionPercent"
  | "currentBlocker"
  | "companyName";

type SortDirection = "asc" | "desc";
type RiskFilter = "all" | "high" | "medium" | "low" | "none";
type SummaryFilter =
  | "all"
  | "missing_critical_inputs"
  | "recently_updated";
type QuickFilter = "all" | "blocked" | "ready";
type DealType = "Search Fund" | "PE" | "Broker" | "SBA" | "Other";

const DEAL_TYPE_OPTIONS: DealType[] = [
  "Search Fund",
  "PE",
  "Broker",
  "SBA",
  "Other"
];

const STATUS_ORDER: Record<PortfolioDealStatus, number> = {
  "Needs source data": 0,
  "Needs workbook review": 1,
  "Needs mapping": 2,
  "Needs source completion": 3,
  "Needs underwriting inputs": 4,
  "Underwriting in progress": 5,
  "Ready for structure": 6,
  "Ready for output": 7
};

const MISSING_VALUE = "\u2014";

function buildNewDealRow(company: {
  id: string;
  name: string;
  deal_name: string | null;
  deal_type: string | null;
  status: string | null;
  industry: string | null;
  stage_updated_at: string | null;
  stage_notes: string | null;
  created_at: string;
}): DealScreenerRow {
  return {
    companyId: company.id,
    dealName: company.deal_name ?? company.name,
    companyName: company.name,
    dealType: company.deal_type,
    sourceStatus: company.status,
    industry: company.industry,
    stage: "new",
    stageLabel: "New",
    stageSortOrder: 0,
    stageUpdatedAt: company.stage_updated_at,
    stageNotes: company.stage_notes,
    isActiveStage: true,
    isTerminalStage: false,
    stageReadinessMismatchReason: null,
    backingStatus: "unbacked",
    readinessStateKey: "needs_source_upload",
    status: "Needs source data",
    blockerCount: 0,
    openIssueCount: 0,
    criticalIssueCount: 0,
    diligenceReadinessLabel: "Not Ready",
    diligenceReadinessReason: "Source data has not been uploaded yet.",
    diligenceReadinessRank: 0,
    primaryBlockerLabel: "Source Data",
    primaryBlockerIssueTitle: null,
    primaryBlockerCategory: "source_data",
    completionPercent: 0,
    currentBlocker: "Upload source data to begin diligence.",
    nextAction: "Add Source Data",
    nextActionHref: `/source-data?companyId=${company.id}`,
    revenue: null,
    ebitda: null,
    adjustedEbitda: null,
    acceptedAddBacks: null,
    ebitdaMarginPercent: null,
    addBacksPercent: null,
    hasAddBacks: false,
    addBacksAboveThreshold: false,
    dscr: null,
    debtToEbitda: null,
    ltv: null,
    decision: "caution",
    primaryRisk: null,
    riskSeverity: null,
    lastUpdated: company.created_at,
    owner: null
  };
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

function formatCompletion(value: number) {
  return `${value}%`;
}

function formatCompactCurrency(value: number | null) {
  if (value === null) {
    return MISSING_VALUE;
  }

  const absoluteValue = Math.abs(value);
  const formatter =
    absoluteValue >= 1_000_000
      ? new Intl.NumberFormat("en-US", {
          notation: "compact",
          compactDisplay: "short",
          minimumFractionDigits: 1,
          maximumFractionDigits: 1
        })
      : new Intl.NumberFormat("en-US", {
          notation: "compact",
          compactDisplay: "short",
          maximumFractionDigits: 0
        });

  return `$${formatter.format(value)}`;
}

function hasUsableExportData(row: DealScreenerRow) {
  return (
    row.revenue !== null ||
    row.ebitda !== null ||
    row.adjustedEbitda !== null ||
    (row.acceptedAddBacks !== null && row.acceptedAddBacks > 0) ||
    row.dscr !== null ||
    row.debtToEbitda !== null ||
    row.ltv !== null
  );
}

function getExportState(row: DealScreenerRow) {
  const isFullyReady =
    row.readinessStateKey === "ready_for_output" && row.backingStatus === "backed";
  const canExportPartial = !isFullyReady && hasUsableExportData(row);

  if (isFullyReady) {
    return {
      disabled: false,
      label: "Export Model",
      tooltip: undefined
    };
  }

  if (canExportPartial) {
    return {
      disabled: false,
      label: "Export Partial",
      tooltip: "Includes available financials and noted gaps"
    };
  }

  return {
    disabled: true,
    label: "Export Not Available",
    tooltip: "Add financial data before exporting"
  };
}

function statusTone(status: PortfolioDealStatus) {
  if (status === "Ready for output") {
    return "border-teal-200 bg-teal-50 text-teal-900";
  }

  if (status === "Ready for structure" || status === "Underwriting in progress") {
    return "border-sky-200 bg-sky-50 text-sky-900";
  }

  if (status === "Needs mapping" || status === "Needs source completion") {
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

  if (status === "Needs mapping" || status === "Needs source completion") {
    return "border-l-amber-300";
  }

  return "border-l-rose-300";
}

function compareValues(
  left: DealScreenerRow,
  right: DealScreenerRow,
  key: SortKey,
  direction: SortDirection
) {
  const multiplier = direction === "asc" ? 1 : -1;

  if (key === "urgency") {
    const readinessDifference =
      left.diligenceReadinessRank - right.diligenceReadinessRank;

    if (readinessDifference !== 0) {
      return readinessDifference * multiplier;
    }

    return (STATUS_ORDER[left.status] - STATUS_ORDER[right.status]) * multiplier;
  }

  if (key === "lastUpdated") {
    const leftValue = left.lastUpdated ? new Date(left.lastUpdated).getTime() : Number.NEGATIVE_INFINITY;
    const rightValue = right.lastUpdated ? new Date(right.lastUpdated).getTime() : Number.NEGATIVE_INFINITY;
    return (leftValue - rightValue) * multiplier;
  }

  if (key === "stage") {
    return compareDealStages(left.stage, right.stage) * multiplier;
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

export function DealsScreenerTable({ rows }: DealsScreenerTableProps) {
  const router = useRouter();
  const now = useMemo(() => new Date(), []);
  const [localRows, setLocalRows] = useState(rows);
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<DealStageFilter>("active");
  const [statusFilter, setStatusFilter] = useState<PortfolioDealStatus | "all">("all");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [summaryFilter, setSummaryFilter] = useState<SummaryFilter>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [staleOnly, setStaleOnly] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("urgency");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [isNewDealOpen, setIsNewDealOpen] = useState(false);
  const [dealName, setDealName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [dealType, setDealType] = useState<DealType>("Search Fund");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  const industries = useMemo(
    () =>
      Array.from(
        new Set(
          localRows
            .map((row) => row.industry)
            .filter((industry): industry is string => Boolean(industry))
        )
      ).sort((left, right) => left.localeCompare(right)),
    [localRows]
  );

  const portfolioSummary = useMemo(() => {
    return {
      activeDeals: localRows.filter((row) => row.isActiveStage).length,
      inDiligence: localRows.filter((row) => row.stage === "diligence").length,
      icReady: localRows.filter((row) => row.stage === "ic_ready").length,
      closing: localRows.filter((row) => row.stage === "closing").length,
      missingCriticalInputs: localRows.filter(
        (row) => row.criticalIssueCount > 0 || row.diligenceReadinessLabel === "Not Ready"
      ).length,
      recentlyUpdatedDeals: localRows.filter((row) => isRecentlyUpdated(row.lastUpdated, now)).length
    };
  }, [localRows, now]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const stageFiltered = filterRowsByDealStage(localRows, stageFilter);
    const searched = stageFiltered.filter((row) => {
      if (
        normalizedQuery &&
        ![
          row.companyName,
          row.dealName,
          row.dealType ?? "",
          row.industry ?? "",
          row.stageLabel,
          row.status,
          row.diligenceReadinessLabel,
          row.currentBlocker ?? "",
          row.nextAction,
          row.primaryRisk ?? "",
          row.stageReadinessMismatchReason ?? ""
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
        row.status !== "Needs workbook review" &&
        row.status !== "Needs mapping" &&
        row.status !== "Needs source completion" &&
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
        summaryFilter === "missing_critical_inputs" &&
        row.criticalIssueCount === 0
      ) {
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
    localRows,
    stageFilter,
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

  function toggleSummaryFilter(nextFilter: SummaryFilter) {
    setSummaryFilter((current) => (current === nextFilter ? "all" : nextFilter));
  }

  function stopRowNavigation(event: ReactMouseEvent<HTMLElement>) {
    event.stopPropagation();
  }

  function closeNewDealModal() {
    if (isSubmitting) {
      return;
    }

    setIsNewDealOpen(false);
    setFormError(null);
  }

  function resetNewDealForm() {
    setDealName("");
    setCompanyName("");
    setIndustry("");
    setDealType("Search Fund");
    setFormError(null);
  }

  async function handleCreateDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedDealName = dealName.trim();
    const trimmedCompanyName = companyName.trim();

    if (!trimmedDealName || !trimmedCompanyName) {
      setFormError("Deal name and company name are required.");
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const response = await fetch("/api/companies", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          dealName: trimmedDealName,
          companyName: trimmedCompanyName,
          industry: industry.trim(),
          dealType
        })
      });
      const payload = (await response.json()) as {
        data?: {
          id: string;
          name: string;
          deal_name: string | null;
          deal_type: string | null;
          status: string | null;
          industry: string | null;
          stage_updated_at: string | null;
          stage_notes: string | null;
          created_at: string;
        };
        error?: string;
      };

      if (!response.ok || !payload.data) {
        setFormError(payload.error ?? "Deal could not be created.");
        return;
      }

      const newRow = buildNewDealRow(payload.data);
      setLocalRows((currentRows) => [
        newRow,
        ...currentRows.filter((row) => row.companyId !== newRow.companyId)
      ]);
      setSummaryFilter("all");
      setStageFilter("active");
      setStatusFilter("all");
      setRiskFilter("all");
      setIndustryFilter("all");
      setQuickFilter("all");
      setStaleOnly(false);
      resetNewDealForm();
      setIsNewDealOpen(false);
      router.push(`/source-data?companyId=${payload.data.id}`);
      router.refresh();
    } catch {
      setFormError("Deal could not be created. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const hasActiveFilters =
    summaryFilter !== "all" ||
    stageFilter !== "active" ||
    statusFilter !== "all" ||
    riskFilter !== "all" ||
    industryFilter !== "all" ||
    quickFilter !== "all" ||
    staleOnly;

  return (
    <section className="space-y-4">
      <section className="rounded-[1.5rem] border border-slate-200 bg-white px-4 py-4 shadow-panel md:px-5">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.26em] text-slate-400">
              Portfolio Command Center
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">All Deals</h1>
            <p className="mt-1 text-sm text-slate-500">
              Monitor lifecycle stage, readiness, blockers, and risk across the portfolio.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              resetNewDealForm();
              setIsNewDealOpen(true);
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 md:w-auto"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New Deal
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <SummaryCard
            label="Active Deals"
            value={String(portfolioSummary.activeDeals)}
            detail="Deals in non-terminal lifecycle stages"
            active={
              summaryFilter === "all" &&
              stageFilter === "active" &&
              statusFilter === "all" &&
              riskFilter === "all"
            }
            onClick={() => {
              setSummaryFilter("all");
              setStageFilter("active");
              setStatusFilter("all");
              setRiskFilter("all");
              setQuickFilter("all");
              setStaleOnly(false);
            }}
          />
          <SummaryCard
            label="In Diligence"
            value={String(portfolioSummary.inDiligence)}
            detail="Active diligence, normalization, and underwriting"
            active={stageFilter === "diligence"}
            onClick={() => setStageFilter("diligence")}
          />
          <SummaryCard
            label="IC Ready"
            value={String(portfolioSummary.icReady)}
            detail="Lifecycle stage marked ready for committee review"
            active={stageFilter === "ic_ready"}
            onClick={() => setStageFilter("ic_ready")}
          />
          <SummaryCard
            label="Closing"
            value={String(portfolioSummary.closing)}
            detail="Approved deals moving through final execution"
            active={stageFilter === "closing"}
            onClick={() => setStageFilter("closing")}
          />
          <SummaryCard
            label="Missing Critical Inputs"
            value={String(portfolioSummary.missingCriticalInputs)}
            detail="Lifecycle and diligence state are currently blocked"
            active={summaryFilter === "missing_critical_inputs"}
            onClick={() => toggleSummaryFilter("missing_critical_inputs")}
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
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value as DealStageFilter)}
              aria-label="Filter by stage"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="active">Active pipeline</option>
              <option value="all">All stages</option>
              <option value="terminal">Terminal only</option>
              {DEAL_STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
              <option value="Needs workbook review">Needs workbook review</option>
              <option value="Needs mapping">Needs mapping</option>
              <option value="Needs source completion">Needs source completion</option>
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
                setSortDirection(
                  nextKey === "urgency" ||
                    nextKey === "stage" ||
                    nextKey === "companyName" ||
                    nextKey === "currentBlocker"
                    ? "asc"
                    : "desc"
                );
              }}
              aria-label="Sort deals"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            >
              <option value="urgency">Sort: Urgency</option>
              <option value="stage">Sort: Stage</option>
              <option value="lastUpdated">Sort: Last updated</option>
              <option value="completionPercent">Sort: Completion %</option>
              <option value="companyName">Sort: Company</option>
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
              {stageFilter !== "active" ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                  {stageFilter === "all"
                    ? "all stages"
                    : stageFilter === "terminal"
                      ? "terminal stages"
                      : getDealStageLabel(stageFilter as DealStage)}
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
                  setStageFilter("active");
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

        <div className="mt-4 space-y-3">
          {filteredRows.length > 0 ? (
            filteredRows.map((row) => {
              const blockerText =
                row.primaryBlockerIssueTitle ??
                row.currentBlocker ??
                row.primaryRisk ??
                "No active blocker";
              const exportState = getExportState(row);
              const exportHref = `/api/deals/${row.companyId}/export`;
              const financialAnchor =
                row.adjustedEbitda !== null || row.ebitda !== null
                  ? `EBITDA ${formatCompactCurrency(row.adjustedEbitda ?? row.ebitda)}`
                  : row.revenue !== null
                    ? `Revenue ${formatCompactCurrency(row.revenue)}`
                    : null;

              return (
                <div
                  key={row.companyId}
                  className={`cursor-pointer rounded-2xl border border-slate-200 border-l-4 bg-white p-4 transition-colors hover:bg-slate-50 focus-within:bg-slate-50 ${rowTone(
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
                  aria-label={`Open ${row.dealName}`}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start gap-2">
                        <Link
                          href={`/deal/${row.companyId}`}
                          className="min-w-0 text-lg font-semibold tracking-tight text-slate-950 hover:text-slate-950"
                          onClick={stopRowNavigation}
                        >
                          {row.dealName}
                        </Link>
                        {row.dealType ? (
                          <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                            {row.dealType}
                          </span>
                        ) : null}
                        <span
                          className={`inline-flex w-fit rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone(
                            row.status
                          )}`}
                        >
                          {row.diligenceReadinessLabel}
                        </span>
                      </div>
                      {row.dealName !== row.companyName ? (
                        <p className="mt-1 text-sm text-slate-500">{row.companyName}</p>
                      ) : null}

                      <p className="mt-3 max-w-3xl text-sm font-medium leading-6 text-slate-800">
                        {blockerText}
                      </p>

                      <div className="mt-2.5 space-y-1.5">
                        {row.industry ? (
                          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold leading-none text-slate-700">
                            {row.industry}
                          </div>
                        ) : null}
                        <div
                          className={
                            financialAnchor
                              ? "text-sm font-semibold leading-5 text-slate-900"
                              : "text-sm leading-5 text-slate-400"
                          }
                        >
                          {financialAnchor ?? "No financials available"}
                        </div>
                      </div>

                    </div>

                    <div className="w-full rounded-xl bg-slate-50 px-4 py-3 lg:w-[260px] lg:flex-none">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                          Completion
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-slate-950">
                          {formatCompletion(row.completionPercent)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div
                          className="h-full rounded-full bg-slate-900 transition-[width]"
                          style={{ width: `${row.completionPercent}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <div className="mt-3 text-xs text-slate-500">
                        <span className="font-medium text-slate-600">Last updated</span>{" "}
                        <span>{formatDate(row.lastUpdated)}</span>
                      </div>
                      <div className="mt-3 flex flex-col gap-2">
                        <Link
                          href={row.nextActionHref}
                          onClick={stopRowNavigation}
                          className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
                        >
                          {row.nextAction}
                        </Link>
                        {exportState.disabled ? (
                          <div title={exportState.tooltip} className="w-full">
                            <button
                              type="button"
                              disabled
                              onClick={stopRowNavigation}
                              className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-400 opacity-70"
                            >
                              {exportState.label}
                            </button>
                          </div>
                        ) : (
                          <a
                            href={exportHref}
                            title={exportState.tooltip}
                            onClick={stopRowNavigation}
                            className="inline-flex w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                          >
                            {exportState.label}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No deals match the current filters.
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 px-1 text-[11px] text-slate-500 md:flex-row md:items-center md:justify-between">
          <span>{filteredRows.length} deals visible</span>
          <span>Click any row to open the deal workspace overview</span>
        </div>
      </section>

      {isNewDealOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 py-6"
          role="presentation"
          onClick={closeNewDealModal}
        >
          <form
            onSubmit={handleCreateDeal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-deal-title"
            className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-slate-400">
                  New Pipeline Record
                </p>
                <h2 id="new-deal-title" className="mt-1 text-xl font-semibold text-slate-950">
                  Add Deal
                </h2>
              </div>
              <button
                type="button"
                onClick={closeNewDealModal}
                disabled={isSubmitting}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-60"
                aria-label="Close new deal modal"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label htmlFor="deal-name" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Deal Name <span className="text-rose-600">*</span>
                </label>
                <input
                  id="deal-name"
                  required
                  value={dealName}
                  onChange={(event) => setDealName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                  placeholder="Project Atlas"
                />
              </div>

              <div>
                <label htmlFor="company-name" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Company Name <span className="text-rose-600">*</span>
                </label>
                <input
                  id="company-name"
                  required
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                  placeholder="Atlas Components"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="industry" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Industry
                  </label>
                  <input
                    id="industry"
                    value={industry}
                    onChange={(event) => setIndustry(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
                    placeholder="Manufacturing"
                  />
                </div>

                <div>
                  <label htmlFor="deal-type" className="mb-1.5 block text-sm font-medium text-slate-700">
                    Deal Type
                  </label>
                  <select
                    id="deal-type"
                    value={dealType}
                    onChange={(event) => setDealType(event.target.value as DealType)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400"
                  >
                    {DEAL_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {formError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {formError}
              </div>
            ) : null}

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeNewDealModal}
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {isSubmitting ? "Creating..." : "Create Deal"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
