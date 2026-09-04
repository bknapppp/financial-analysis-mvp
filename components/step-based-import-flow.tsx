"use client";

import Link from "next/link";
import { Database } from "lucide-react";
import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import { useSearchParams } from "next/navigation";
import {
  getMappingCategoryOptions,
  isBalanceSheetLeafCategory,
  isBalanceSheetParentCategory
} from "@/lib/auto-mapping";
import { focusFixItTarget } from "@/components/fix-it-focus";
import { normalizeImportedPeriod } from "@/lib/import-periods";
import {
  SOURCE_DATA_FILE_FIELD_ID,
  SOURCE_DATA_FOCUSED_MAPPING_SECTION_ID,
  SOURCE_DATA_REVIEW_REQUIRED_FIELD_ID,
  SOURCE_DATA_REVIEW_SECTION_ID,
  SOURCE_DATA_UPLOAD_SECTION_ID
} from "@/lib/fix-it";
import type { ParsedImportFile, ParsedImportSheet } from "@/lib/import-preview";
import type { WorkbookContext } from "@/lib/workbook-context";
import type { WorkbookFixItTask } from "@/lib/workbook-fix-its";
import type {
  Company,
  NormalizedCategory,
  ReportingPeriod,
  StatementType
} from "@/lib/types";
import { devLog } from "@/lib/debug";
import { SaveMappingButton } from "@/components/save-mapping-button";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";

type PreviewFilter =
  | "all"
  | "review_required"
  | "unmapped"
  | "low_confidence"
  | "saved_mapping"
  | "rule_based";

type StepBasedImportFlowProps = {
  activeStep: 1 | 2 | 3 | 4;
  setActiveStep: Dispatch<SetStateAction<1 | 2 | 3 | 4>>;
  stepItems: Array<{ id: 1 | 2 | 3 | 4; label: string; ready: boolean }>;
  selectedCompanyId: string;
  setSelectedCompanyId: Dispatch<SetStateAction<string>>;
  companies: Company[];
  workbookContext: WorkbookContext | null;
  parsedFile: ParsedImportFile | null;
  selectedSheet: ParsedImportSheet | null;
  sheetSelectionCards: Array<{
    name: string;
    rowCount: number;
    classification: ParsedImportSheet["analysis"]["classification"];
    periodDetection: ParsedImportSheet["analysis"]["periodDetection"];
    columnStructure: ParsedImportSheet["analysis"]["columnStructure"];
    lineItemHints: string[];
    workbookRole:
      | "primary_income_statement"
      | "primary_balance_sheet"
      | "primary_cash_flow"
      | "ambiguous"
      | "supporting"
      | "other";
    workbookReason: string | null;
  }>;
  structurePreviewRows: any[];
  structurePreviewHeaders: string[];
  sheetPreviewRows: Array<{
    rowNumber: number;
    primaryLabel: string;
    values: string[];
    isLikelyFinancialLine: boolean;
    mappingSuggestion: string | null;
    suggestionStrength: "saved" | "rule_based" | "source" | "review";
    reviewStatus: "mapped" | "low_confidence" | "unmapped" | "not_parsed";
  }>;
  selectedSheetName: string;
  setSelectedSheetName: Dispatch<SetStateAction<string>>;
  companySetupSlot?: ReactNode;
  advancedToolsSlot?: ReactNode;
  setupMessage: string | null;
  errorMessage: string | null;
  successMessage: string | null;
  handleFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  showParserDebug: boolean;
  wideStatementDebug: any;
  columnMapping: Record<string, string>;
  updateColumnMapping: (field: any, value: string) => void;
  sourcePeriodNotice: string | null;
  detectedPeriods: { periods: any[]; unresolvedRows: number[] };
  periodFallbackMode: "existing" | "new";
  setPeriodFallbackMode: Dispatch<SetStateAction<"existing" | "new">>;
  selectedPeriodId: string;
  setSelectedPeriodId: Dispatch<SetStateAction<string>>;
  periods: ReportingPeriod[];
  newPeriodLabel: string;
  setNewPeriodLabel: Dispatch<SetStateAction<string>>;
  newPeriodDate: string;
  setNewPeriodDate: Dispatch<SetStateAction<string>>;
  previewSummary: {
    accountsDetected: number;
    periodsDetected: number;
    mappedAccounts: number;
    accountsUnderReview: number;
  };
  groupedPreviewRows: any[];
  previewFilter: PreviewFilter;
  setPreviewFilter: Dispatch<SetStateAction<PreviewFilter>>;
  reviewMode: boolean;
  setReviewMode: Dispatch<SetStateAction<boolean>>;
  previewPeriodColumns: Array<{ key: string; label: string; periodDate: string }>;
  filteredPreviewRows: any[];
  expandedPreviewAccountKey: string | null;
  setExpandedPreviewAccountKey: Dispatch<SetStateAction<string | null>>;
  toggleExcluded: (accountKey: string) => void;
  toggleNonBlocking: (accountKey: string) => void;
  handleMappingSaved: () => Promise<void>;
  updateRowsForAccount: (
    accountKey: string,
    patch: Partial<Record<"__manual_category" | "__manual_statement_type", string>>
  ) => void;
  accountReviewRows: any[];
  importSummaryCards: readonly (readonly [string, string])[];
  importBlocked: boolean;
  handleImport: () => Promise<void>;
  isPending: boolean;
  importSummary: {
    insertedCount: number;
    rejectedRows: Array<{ rowNumber: number; accountName: string; reason: string }>;
    autoMappedRows: number;
    rowsNeedingReview: number;
    missingCriticalCategories: string[];
    workbookFollowUps: string[];
    workbookFixIts: WorkbookFixItTask[];
    nextActions: string[];
    workbookContext: WorkbookContext | null;
  } | null;
  workbookFixIts: WorkbookFixItTask[];
  stepStatus: {
    uploadComplete: boolean;
    structureComplete: boolean;
    reviewComplete: boolean;
  };
};

const STATEMENT_TYPE_OPTIONS = ["income", "balance_sheet"];

const COLUMN_FIELDS = [
  { key: "accountName", label: "Account name", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "periodLabel", label: "Period label" },
  { key: "periodDate", label: "Period date" },
  { key: "statementType", label: "Statement type" },
  { key: "category", label: "Category" },
  { key: "addbackFlag", label: "Add-back flag" }
];

function matchedByClass(value: string) {
  if (value === "memory") return "bg-bs-success/10 text-bs-success";
  if (value === "saved_mapping") return "bg-bs-success/10 text-bs-success";
  if (value === "keyword" || value === "keyword_rule") return "bg-bs-info/10 text-bs-info";
  if (value === "csv_value") return "bg-bs-info/10 text-bs-info";
  return "bg-bs-warning/10 text-bs-warning";
}

function formatMatchedBy(value: string, memoryScope?: "company" | "global" | null) {
  if (value === "memory" && memoryScope === "company") return "From Saved Mapping (Company)";
  if (value === "memory" && memoryScope === "global") return "From Saved Mapping (Global)";
  if (value === "memory") return "From Saved Mapping";
  if (value === "saved_mapping") return "Saved Mapping";
  if (value === "keyword" || value === "keyword_rule") return "Rule-Based";
  if (value === "csv_value") return "Source value";
  return "Under Review";
}

function groupedPreviewStatus(row: {
  needsReview: boolean;
  category: string;
  statementType: string;
  confidence: string;
  matchedBy: string;
  isExcluded?: boolean;
  isNonBlocking?: boolean;
}) {
  if (row.isExcluded) return "Excluded";
  if ((!row.category || !row.statementType) && row.isNonBlocking) return "Non-blocking";
  if (!row.category || !row.statementType) return "Unmapped";
  if (row.confidence === "low") return "Low Confidence";
  if (row.matchedBy === "memory" || row.matchedBy === "saved_mapping") {
    return "Saved Mapping";
  }
  if (row.matchedBy === "keyword" || row.matchedBy === "keyword_rule") return "Rule-Based";
  if (row.needsReview) return "Review Required";
  return "Confirmed";
}

function statusClass(status: string) {
  if (status === "Excluded") return "border border-bs-border-subtle bg-bs-page text-bs-text-secondary";
  if (status === "Non-blocking") return "border border-bs-warning/20 bg-bs-warning/10 text-bs-warning";
  if (status === "Unmapped") return "border border-bs-danger/20 bg-bs-danger/10 text-bs-danger";
  if (status === "Review Required") return "border border-bs-warning/20 bg-bs-warning/10 text-bs-warning";
  if (status === "Low Confidence") return "border border-bs-warning/20 bg-bs-warning/10 text-bs-warning";
  if (status === "Saved Mapping") return "border border-bs-success/20 bg-bs-success/10 text-bs-success";
  if (status === "Rule-Based") return "border border-bs-info/20 bg-bs-info/10 text-bs-info";
  return "border border-bs-success/20 bg-bs-success/10 text-bs-success";
}

function sheetClassificationClass(status: string) {
  if (status === "likely_income_statement") {
    return "bg-bs-success/10 text-bs-success";
  }

  if (status === "likely_balance_sheet") {
    return "bg-bs-info/10 text-bs-info";
  }

  if (status === "likely_cash_flow") {
    return "bg-bs-info/10 text-bs-info";
  }

  return "bg-bs-warning/10 text-bs-warning";
}

function periodStructureClass(structure: string) {
  if (
    structure === "annual" ||
    structure === "monthly" ||
    structure === "quarterly" ||
    structure === "wide" ||
    structure === "long"
  ) {
    return "bg-bs-primary text-white";
  }

  if (structure === "ttm") {
    return "bg-bs-info/10 text-bs-info";
  }

  if (structure === "mixed") {
    return "bg-bs-warning/10 text-bs-warning";
  }

  return "bg-bs-page text-bs-text-secondary";
}

function previewSuggestionClass(strength: string) {
  if (strength === "saved") return "bg-bs-success/10 text-bs-success";
  if (strength === "rule_based") return "bg-bs-info/10 text-bs-info";
  if (strength === "source") return "bg-bs-info/10 text-bs-info";
  return "bg-bs-warning/10 text-bs-warning";
}

function previewStatusClass(status: string) {
  if (status === "mapped") return "bg-bs-success/10 text-bs-success";
  if (status === "low_confidence") return "bg-bs-warning/10 text-bs-warning";
  if (status === "unmapped") return "bg-bs-danger/10 text-bs-danger";
  return "bg-bs-page text-bs-text-secondary";
}

function previewStatusLabel(status: string) {
  if (status === "mapped") return "Mapped";
  if (status === "low_confidence") return "Low confidence";
  if (status === "unmapped") return "Unmapped";
  return "Not parsed";
}

function workbookRoleLabel(role: StepBasedImportFlowProps["sheetSelectionCards"][number]["workbookRole"]) {
  if (role === "primary_income_statement") return "Primary income statement";
  if (role === "primary_balance_sheet") return "Primary balance sheet";
  if (role === "primary_cash_flow") return "Primary cash flow";
  if (role === "ambiguous") return "Ambiguous candidate";
  if (role === "supporting") return "Supporting sheet";
  return "Other sheet";
}

function workbookRoleClass(role: StepBasedImportFlowProps["sheetSelectionCards"][number]["workbookRole"]) {
  if (role === "primary_income_statement") return "bg-bs-success/10 text-bs-success";
  if (role === "primary_balance_sheet") return "bg-bs-info/10 text-bs-info";
  if (role === "primary_cash_flow") return "bg-bs-info/10 text-bs-info";
  if (role === "ambiguous") return "bg-bs-warning/10 text-bs-warning";
  if (role === "supporting") return "bg-bs-page text-bs-text-secondary";
  return "bg-bs-page text-bs-text-muted";
}

function workbookFixItSeverityClass(severity: WorkbookFixItTask["severity"]) {
  return severity === "critical"
    ? "border-bs-danger/20 bg-bs-danger/10 text-bs-danger"
    : "border-bs-warning/20 bg-bs-warning/10 text-bs-warning";
}

function canonicalPeriodKey(periodLabel: string, periodDate: string) {
  const normalized = normalizeImportedPeriod({
    periodLabel,
    periodDate
  });

  return normalized?.key ?? `${periodDate || ""}::${periodLabel || ""}`;
}

function categoryOptionsForStatementType(statementType: StatementType | "") {
  return getMappingCategoryOptions(statementType);
}

export function StepBasedImportFlow(props: StepBasedImportFlowProps) {
  const {
    activeStep,
    setActiveStep,
    stepItems,
    selectedCompanyId,
    setSelectedCompanyId,
    companies,
    workbookContext,
    parsedFile,
    selectedSheet,
    sheetSelectionCards,
    structurePreviewRows,
    structurePreviewHeaders,
    sheetPreviewRows,
    selectedSheetName,
    setSelectedSheetName,
    companySetupSlot,
    advancedToolsSlot,
    setupMessage,
    errorMessage,
    successMessage,
    handleFileUpload,
    showParserDebug,
    wideStatementDebug,
    columnMapping,
    updateColumnMapping,
    sourcePeriodNotice,
    detectedPeriods,
    periodFallbackMode,
    setPeriodFallbackMode,
    selectedPeriodId,
    setSelectedPeriodId,
    periods,
    newPeriodLabel,
    setNewPeriodLabel,
    newPeriodDate,
    setNewPeriodDate,
    previewSummary,
    groupedPreviewRows,
    previewFilter,
    setPreviewFilter,
    reviewMode,
    setReviewMode,
    previewPeriodColumns,
    filteredPreviewRows,
    expandedPreviewAccountKey,
    setExpandedPreviewAccountKey,
    toggleExcluded,
    toggleNonBlocking,
    handleMappingSaved,
    updateRowsForAccount,
    accountReviewRows,
    importSummaryCards,
    importBlocked,
    handleImport,
    isPending,
    importSummary,
    workbookFixIts,
    stepStatus
  } = props;
  const [focusedReviewOpen, setFocusedReviewOpen] = useState(false);
  const [focusedReviewAccountKey, setFocusedReviewAccountKey] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const requestedFixSection = searchParams.get("fixSection");
  const requestedFixField = searchParams.get("fixField");
  const requestedFixStep = searchParams.get("fixStep");

  const totalAccounts = groupedPreviewRows.length;
  const unmappedCount = groupedPreviewRows.filter(
    (row) => (!row.category || !row.statementType) && !row.isExcluded && !row.isNonBlocking
  ).length;
  const lowConfidenceCount = groupedPreviewRows.filter(
    (row) => row.confidence === "low"
  ).length;
  const savedMappingCount = groupedPreviewRows.filter((row) =>
    ["memory", "saved_mapping"].includes(row.matchedBy)
  ).length;
  const reviewRequiredCount = groupedPreviewRows.filter((row) => {
    const isMapped = Boolean(row.category && row.statementType);
    return !isMapped && !row.isExcluded && !row.isNonBlocking;
  }).length;
  const confirmedCount = totalAccounts - reviewRequiredCount;
  const canProceedFromReview = reviewRequiredCount === 0 || totalAccounts === 0;
  const focusedReviewRows = useMemo(
    () =>
      accountReviewRows.filter(
        (row) => row.needsReview || !row.category || !row.statementType
      ),
    [accountReviewRows]
  );

  useEffect(() => {
    devLog("FOCUSED REVIEW ROW COUNT", focusedReviewRows.length);
  }, [focusedReviewRows.length]);

  useEffect(() => {
    if (!focusedReviewAccountKey) {
      return;
    }

    const stillNeedsReview = focusedReviewRows.some(
      (row) => row.accountKey === focusedReviewAccountKey
    );

    if (!stillNeedsReview) {
      devLog("ROW RETURNED TO RESOLVED MAIN STATE", {
        accountKey: focusedReviewAccountKey
      });
      setFocusedReviewAccountKey(null);
    }
  }, [focusedReviewAccountKey, focusedReviewRows]);

  useEffect(() => {
    if (!requestedFixStep) {
      return;
    }

    if (requestedFixStep === "1") {
      setActiveStep(1);
      return;
    }

    if (requestedFixStep === "3") {
      setActiveStep(3);
    }
  }, [requestedFixStep, setActiveStep]);

  useEffect(() => {
    if (
      requestedFixSection !== SOURCE_DATA_UPLOAD_SECTION_ID &&
      requestedFixSection !== SOURCE_DATA_REVIEW_SECTION_ID &&
      requestedFixSection !== SOURCE_DATA_FOCUSED_MAPPING_SECTION_ID
    ) {
      return;
    }

    if (requestedFixSection === SOURCE_DATA_REVIEW_SECTION_ID) {
      setReviewMode(true);
      setPreviewFilter("review_required");
    }

    if (requestedFixSection === SOURCE_DATA_FOCUSED_MAPPING_SECTION_ID) {
      setReviewMode(true);
      setPreviewFilter("review_required");
      setFocusedReviewOpen(true);
    }

    const timer = window.setTimeout(() => {
      focusFixItTarget(requestedFixSection, requestedFixField);
    }, 150);

    return () => window.clearTimeout(timer);
  }, [
    activeStep,
    requestedFixField,
    requestedFixSection,
    setPreviewFilter,
    setReviewMode
  ]);

  return (
    <section
      id={SOURCE_DATA_UPLOAD_SECTION_ID}
      data-fix-section={SOURCE_DATA_UPLOAD_SECTION_ID}
      className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4 shadow-bs-subtle"
    >
      <SectionHeader
        title="Financial Data Upload"
        description="Upload CSV or Excel, confirm structure, review mappings, and import into the review workflow."
        actions={<StatusBadge tone="informational">Primary path</StatusBadge>}
      />

      <div className="mt-4 rounded-bs-md border border-bs-border-subtle bg-bs-page p-2">
        <div className="grid gap-2 md:grid-cols-4">
          {stepItems.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => step.ready && setActiveStep(step.id)}
              disabled={!step.ready}
              className={`rounded-bs-sm px-4 py-3 text-left transition ${
                activeStep === step.id
                  ? "bg-bs-surface shadow-bs-subtle ring-1 ring-bs-border-subtle"
                  : step.ready
                    ? "text-bs-text-secondary hover:bg-bs-surface/70"
                    : "cursor-not-allowed text-bs-text-muted"
              }`}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-bs-text-muted">
                Step {step.id}
              </p>
              <p className="mt-1 text-sm font-semibold text-bs-text-primary">{step.label}</p>
            </button>
          ))}
        </div>
      </div>

      {setupMessage ? <Notice tone="amber">{setupMessage}</Notice> : null}
      {errorMessage ? <Notice tone="rose">{errorMessage}</Notice> : null}
      {successMessage ? <Notice tone="teal">{successMessage}</Notice> : null}

      {activeStep === 1 ? (
        <section className="mt-5 rounded-bs-md border border-bs-border-subtle p-4">
          <StepHeading
            step="Step 1"
            title="Upload"
            description="Select the company, upload the financial file, and move into structure review."
            badge={parsedFile?.fileName}
          />

          {companySetupSlot ? (
            <details className="mt-4 rounded-bs-md border border-bs-border-subtle bg-bs-page p-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-bs-text-primary">
                Company Setup
              </summary>
              <p className="mt-2 text-sm text-bs-text-muted">
                Add a company here if the legal entity is not yet available for this review.
              </p>
              <div className="mt-4">{companySetupSlot}</div>
            </details>
          ) : null}

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-bs-text-secondary">Company</label>
            <select
              id="source-data-company"
              value={selectedCompanyId}
              onChange={(event) => setSelectedCompanyId(event.target.value)}
            >
              <option value="">Select company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 rounded-bs-md border border-bs-border-subtle bg-bs-page p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-bs-text-secondary">
                  Financial workbook
                </label>
                <input
                  id={SOURCE_DATA_FILE_FIELD_ID}
                  data-fix-field={SOURCE_DATA_FILE_FIELD_ID}
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileUpload}
                  disabled={!selectedCompanyId}
                />
                <p className="mt-2 text-xs text-bs-text-muted">
                  Upload the workbook, inspect each detected sheet, then continue into guided structure and mapping review.
                </p>
              </div>

              {parsedFile ? (
                <div className="rounded-bs-sm bg-bs-surface px-4 py-3 text-sm text-bs-text-secondary ring-1 ring-bs-border-subtle">
                  {parsedFile.kind === "xlsx" ? `${parsedFile.sheets.length} sheet(s) detected` : "Single import sheet detected"}
                </div>
              ) : null}
            </div>
          </div>

          {sheetSelectionCards.length > 0 ? (
            <div className="mt-4">
              {workbookContext ? (
                <div className="mb-4 rounded-bs-md border border-bs-border-subtle bg-bs-page p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-bs-text-primary">Workbook interpretation</h4>
                      <p className="mt-1 text-sm text-bs-text-secondary">{workbookContext.summary}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        workbookContext.confidenceLabel === "High confidence"
                          ? "bg-bs-success/10 text-bs-success"
                          : workbookContext.confidenceLabel === "Medium confidence"
                            ? "bg-bs-warning/10 text-bs-warning"
                            : "bg-bs-danger/10 text-bs-danger"
                      }`}
                    >
                      {workbookContext.confidenceLabel}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <div className="rounded-bs-md bg-bs-surface p-4 ring-1 ring-bs-border-subtle">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                        Detected package
                      </p>
                      <p className="mt-2 text-sm text-bs-text-secondary">
                        Income statement: {workbookContext.primaryIncomeStatementSheetName ?? "Not detected"}
                      </p>
                      <p className="mt-1 text-sm text-bs-text-secondary">
                        Balance sheet: {workbookContext.primaryBalanceSheetSheetName ?? "Not detected"}
                      </p>
                      <p className="mt-1 text-sm text-bs-text-secondary">
                        Cash flow: {workbookContext.primaryCashFlowSheetName ?? "Not detected"}
                      </p>
                    </div>
                    <div className="rounded-bs-md bg-bs-surface p-4 ring-1 ring-bs-border-subtle">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                        Workbook review items
                      </p>
                      <div className="mt-2 space-y-1 text-sm text-bs-text-secondary">
                        {(workbookContext.conflicts.length > 0
                          ? workbookContext.conflicts
                          : workbookContext.gaps.length > 0
                            ? workbookContext.gaps
                            : ["Workbook package looks internally consistent enough to proceed."]
                        )
                          .slice(0, 3)
                          .map((item) => (
                            <p key={item}>{item}</p>
                          ))}
                      </div>
                    </div>
                  </div>
                  {workbookFixIts.length > 0 ? (
                    <div className="mt-3 rounded-bs-md bg-bs-surface p-4 ring-1 ring-bs-border-subtle">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                        Fix-It tasks
                      </p>
                      <div className="mt-3 grid gap-3 lg:grid-cols-2">
                        {workbookFixIts.map((task) => (
                          <div
                            key={task.key}
                            className={`rounded-bs-md border px-4 py-3 ${workbookFixItSeverityClass(task.severity)}`}
                          >
                            <p className="text-sm font-semibold">{task.label}</p>
                            <p className="mt-1 text-sm opacity-90">{task.reason}</p>
                            <Link
                              href={task.href}
                              className="mt-3 inline-flex rounded-bs-sm bg-bs-surface px-3 py-1.5 text-xs font-medium text-bs-text-primary ring-1 ring-bs-border-subtle hover:bg-bs-page"
                            >
                              {task.actionLabel}
                            </Link>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-bs-text-primary">Sheet inspection</h4>
                  <p className="mt-1 text-sm text-bs-text-muted">
                    Pick the sheet to import. Classification and period structure come from deterministic workbook heuristics.
                  </p>
                </div>
                {parsedFile?.sheets.length && parsedFile.sheets.length > 1 ? (
                  <div className="w-full max-w-xs">
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                      Active sheet
                    </label>
                    <select
                      value={selectedSheetName}
                      onChange={(event) => setSelectedSheetName(event.target.value)}
                    >
                      {sheetSelectionCards.map((sheet) => (
                        <option key={sheet.name} value={sheet.name}>
                          {sheet.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {sheetSelectionCards.map((sheet) => {
                  const isSelected = sheet.name === selectedSheetName;

                  return (
                    <button
                      key={sheet.name}
                      type="button"
                      onClick={() => setSelectedSheetName(sheet.name)}
                      className={`rounded-bs-md border p-4 text-left transition ${
                        isSelected
                          ? "border-bs-primary bg-bs-primary text-white"
                          : "border-bs-border-subtle bg-bs-surface hover:border-bs-border-strong"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h5 className="text-sm font-semibold">{sheet.name}</h5>
                          <p className={`mt-1 text-sm ${isSelected ? "text-white/80" : "text-bs-text-muted"}`}>
                            {sheet.rowCount} parsed row(s)
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${
                            isSelected
                              ? "bg-bs-surface/15 text-white"
                              : sheetClassificationClass(sheet.classification.status)
                          }`}
                        >
                          {sheet.classification.label}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs">
                        <span
                          className={`rounded-full px-2.5 py-1 font-medium ${
                            isSelected ? "bg-bs-surface/10 text-white" : workbookRoleClass(sheet.workbookRole)
                          }`}
                        >
                          {workbookRoleLabel(sheet.workbookRole)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 font-medium ${
                            isSelected ? "bg-bs-surface/10 text-white" : periodStructureClass(sheet.periodDetection.structure)
                          }`}
                        >
                          {sheet.periodDetection.label}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 ${
                            isSelected ? "bg-bs-surface/10 text-white" : "bg-bs-page text-bs-text-secondary"
                          }`}
                        >
                          {sheet.columnStructure.label}
                        </span>
                        {sheet.periodDetection.periods.slice(0, 3).map((period) => (
                          <span
                            key={`${sheet.name}-${period.label}`}
                            className={`rounded-full px-2.5 py-1 ${
                              isSelected ? "bg-bs-surface/10 text-white" : "bg-bs-page text-bs-text-secondary"
                            }`}
                          >
                            {period.label}
                          </span>
                        ))}
                      </div>
                      <p className={`mt-3 text-sm ${isSelected ? "text-white/80" : "text-bs-text-secondary"}`}>
                        {sheet.classification.explanation}
                      </p>
                      {sheet.workbookReason ? (
                        <p className={`mt-2 text-xs ${isSelected ? "text-white/70" : "text-bs-text-muted"}`}>
                          {sheet.workbookReason}
                        </p>
                      ) : null}
                      {sheet.lineItemHints.length > 0 ? (
                        <p className={`mt-2 text-xs ${isSelected ? "text-white/70" : "text-bs-text-muted"}`}>
                          Sample financial lines: {sheet.lineItemHints.slice(0, 3).join(", ")}
                        </p>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              disabled={!stepStatus.uploadComplete}
              className="rounded-bs-sm bg-bs-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-bs-primary-hover disabled:opacity-60"
            >
              Inspect selected sheet
            </button>
          </div>
        </section>
      ) : null}

      {activeStep === 2 && selectedSheet ? (
        <div className="mt-5 space-y-5">
          <section className="rounded-bs-md border border-bs-border-subtle p-4">
            <StepHeading
              step="Step 2"
              title="Confirm Structure"
              description="Review the selected sheet, verify the detected statement and period structure, and preview likely mappings before the import moves into focused review."
              badge={`${parsedFile?.fileName || ""} • ${selectedSheet.analysis.previewRowCount} preview row(s)`}
            />

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <div className="rounded-bs-md border border-bs-border-subtle bg-bs-page p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                  Sheet Type
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${sheetClassificationClass(
                      selectedSheet.analysis.classification.status
                    )}`}
                  >
                    {selectedSheet.analysis.classification.label}
                  </span>
                  <span className="text-xs text-bs-text-muted">
                    {selectedSheet.analysis.classification.confidenceLabel}
                  </span>
                </div>
                <p className="mt-3 text-sm text-bs-text-secondary">
                  {selectedSheet.analysis.classification.explanation}
                </p>
                {selectedSheet.analysis.classification.matchedPatterns.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSheet.analysis.classification.matchedPatterns.map((pattern) => (
                      <span
                        key={pattern}
                        className="rounded-full bg-bs-surface px-2.5 py-1 text-xs text-bs-text-secondary ring-1 ring-bs-border-subtle"
                      >
                        {pattern}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-bs-md border border-bs-border-subtle bg-bs-page p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                  Period Structure
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${periodStructureClass(
                      selectedSheet.analysis.periodDetection.structure
                    )}`}
                  >
                    {selectedSheet.analysis.periodDetection.label}
                  </span>
                  {selectedSheet.analysis.periodDetection.headerRowIndex ? (
                    <span className="text-xs text-bs-text-muted">
                      Header row {selectedSheet.analysis.periodDetection.headerRowIndex}
                    </span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm text-bs-text-secondary">
                  {selectedSheet.analysis.periodDetection.explanation}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedSheet.analysis.periodDetection.periods.map((period) => (
                    <span
                      key={`${period.label}-${period.periodDate}`}
                      className="rounded-full bg-bs-surface px-2.5 py-1 text-xs text-bs-text-secondary ring-1 ring-bs-border-subtle"
                    >
                      {period.label}
                    </span>
                  ))}
                  {selectedSheet.analysis.periodDetection.ttmHeaders.map((header) => (
                    <span
                      key={header}
                      className="rounded-full bg-bs-info/10 px-2.5 py-1 text-xs text-bs-info"
                    >
                      {header}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-bs-md border border-bs-border-subtle bg-bs-page p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                  Column Structure
                </p>
                <div className="mt-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${periodStructureClass(
                      selectedSheet.analysis.columnStructure.type
                    )}`}
                  >
                    {selectedSheet.analysis.columnStructure.label}
                  </span>
                </div>
                <p className="mt-3 text-sm text-bs-text-secondary">
                  {selectedSheet.analysis.columnStructure.explanation}
                </p>
                {selectedSheet.analysis.likelyFinancialLineItemHints.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedSheet.analysis.likelyFinancialLineItemHints.map((hint) => (
                      <span
                        key={hint}
                        className="rounded-full bg-bs-surface px-2.5 py-1 text-xs text-bs-text-secondary ring-1 ring-bs-border-subtle"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="rounded-bs-md border border-bs-border-subtle bg-bs-page p-4">
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                  Parsed Headers
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {structurePreviewHeaders.map((header: string) => (
                    <span
                      key={header}
                      className="rounded-full bg-bs-surface px-2.5 py-1 text-xs font-medium text-bs-text-secondary ring-1 ring-bs-border-subtle"
                    >
                      {header}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto rounded-bs-md border border-bs-border-subtle">
              <table className="min-w-full divide-y divide-bs-border-subtle text-sm">
                <thead className="bg-bs-page">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-bs-text-muted">Row</th>
                    <th className="px-3 py-2 text-left font-medium text-bs-text-muted">Preview</th>
                    <th className="px-3 py-2 text-left font-medium text-bs-text-muted">Signals</th>
                    <th className="px-3 py-2 text-left font-medium text-bs-text-muted">Mapping suggestion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bs-border-subtle bg-bs-surface">
                  {sheetPreviewRows.map((row) => (
                    <tr
                      key={`${selectedSheet.name}-${row.rowNumber}`}
                      className={
                        row.reviewStatus === "unmapped"
                          ? "bg-bs-danger/10/50"
                          : row.reviewStatus === "low_confidence"
                            ? "bg-bs-warning/5"
                            : row.isLikelyFinancialLine
                              ? "bg-bs-success/10/30"
                              : ""
                      }
                    >
                      <td className="px-3 py-3 align-top text-bs-text-muted">{row.rowNumber}</td>
                      <td className="px-3 py-3 align-top">
                        <div className="min-w-[14rem]">
                          <p className="font-medium text-bs-text-primary">{row.primaryLabel}</p>
                          <p className="mt-1 text-xs text-bs-text-muted">
                            {row.values.join(" • ")}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-2">
                          {row.isLikelyFinancialLine ? (
                            <span className="rounded-full bg-bs-success/10 px-2.5 py-1 text-xs font-medium text-bs-success">
                              Likely financial line item
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${previewStatusClass(
                              row.reviewStatus
                            )}`}
                          >
                            {previewStatusLabel(row.reviewStatus)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {row.mappingSuggestion ? (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${previewSuggestionClass(
                              row.suggestionStrength
                            )}`}
                          >
                            {row.mappingSuggestion}
                          </span>
                        ) : (
                          <span className="text-xs text-bs-text-muted">No parseable mapping suggestion yet</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showParserDebug && wideStatementDebug ? (
              <Notice tone="sky">
                Parser diagnostics are available for this sheet while wide-format import remains under review.
              </Notice>
            ) : null}
          </section>

          <section className="rounded-bs-md border border-bs-border-subtle p-4">
            <h3 className="text-base font-semibold text-bs-text-primary">Header and period interpretation</h3>
            <p className="mt-1 text-sm text-bs-text-muted">
              Confirm the imported columns and reporting periods before mapping review.
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {COLUMN_FIELDS.map((field) => (
                <ColumnSelect
                  key={field.key}
                  label={field.label}
                  value={columnMapping[field.key]}
                  options={structurePreviewHeaders}
                  required={field.required}
                  onChange={(value) => updateColumnMapping(field.key, value)}
                />
              ))}
            </div>

            {sourcePeriodNotice ? <Notice tone="sky">{sourcePeriodNotice}</Notice> : null}

            <div className="mt-4 space-y-3">
              {detectedPeriods.periods.length > 0 ? (
                detectedPeriods.periods.map((period) => (
                  <div
                    key={period.key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-bs-sm border border-bs-border-subtle bg-bs-page px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-bs-text-primary">{period.label}</p>
                      <p className="text-xs text-bs-text-muted">
                        {period.rowCount} row(s) • anchor {period.periodDate}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        period.matchedPeriodId
                          ? "bg-bs-success/10 text-bs-success"
                          : "bg-bs-info/10 text-bs-info"
                      }`}
                    >
                      {period.matchedPeriodId ? `Matched to ${period.matchedPeriodLabel}` : "Will auto-create"}
                    </span>
                  </div>
                ))
              ) : (
                <Notice tone="amber">
                  No usable reporting period was detected. Choose an existing period or create one inline for this import.
                </Notice>
              )}
            </div>

            {detectedPeriods.periods.length === 0 || detectedPeriods.unresolvedRows.length > 0 ? (
              <div className="mt-4 rounded-bs-md border border-bs-border-subtle p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPeriodFallbackMode("existing")}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      periodFallbackMode === "existing" ? "bg-bs-primary text-white" : "bg-bs-page text-bs-text-secondary"
                    }`}
                  >
                    Assign existing period
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodFallbackMode("new")}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      periodFallbackMode === "new" ? "bg-bs-primary text-white" : "bg-bs-page text-bs-text-secondary"
                    }`}
                  >
                    Create period inline
                  </button>
                </div>

                {periodFallbackMode === "existing" ? (
                  <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium text-bs-text-secondary">
                      Fallback period
                    </label>
                    <select
                      value={selectedPeriodId}
                      onChange={(event) => setSelectedPeriodId(event.target.value)}
                    >
                      <option value="">Select period</option>
                      {periods.map((period) => (
                        <option key={period.id} value={period.id}>
                          {period.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-bs-text-secondary">
                        New period label
                      </label>
                      <input
                        value={newPeriodLabel}
                        onChange={(event) => setNewPeriodLabel(event.target.value)}
                        placeholder="May 2026"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-bs-text-secondary">
                        New period date
                      </label>
                      <input
                        type="date"
                        value={newPeriodDate}
                        onChange={(event) => setNewPeriodDate(event.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </section>

          {advancedToolsSlot ? (
            <details className="rounded-bs-md border border-bs-border-subtle bg-bs-page p-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-bs-text-primary">
                Default Mapping Rules (Optional)
              </summary>
              <div className="mt-4">{advancedToolsSlot}</div>
            </details>
          ) : null}

          <StepActions
            onBack={() => setActiveStep(1)}
            onContinue={() => setActiveStep(3)}
            continueDisabled={!stepStatus.structureComplete}
          />
        </div>
      ) : null}

      {activeStep === 3 && selectedSheet ? (
        <div className="mt-5 space-y-5">
          <section
            id={SOURCE_DATA_REVIEW_SECTION_ID}
            data-fix-section={SOURCE_DATA_REVIEW_SECTION_ID}
            className="rounded-bs-md border border-bs-border-subtle p-4"
          >
            <StepHeading
              step="Step 3"
              title="Review Mappings"
              description="Use the financial preview to validate periods, review mappings, and resolve accounts under review."
            />

            <div className="mt-4 flex flex-col gap-3 rounded-bs-md border border-bs-border-subtle bg-bs-page p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-bs-text-primary">
                  Review Progress: {confirmedCount} of {totalAccounts} accounts confirmed
                </p>
                <p className="mt-1 text-sm text-bs-text-secondary">
                  {reviewRequiredCount > 0
                    ? `${reviewRequiredCount} accounts require review`
                    : "All accounts are mapped and ready for import"}
                </p>
              </div>
              <button
                id={SOURCE_DATA_REVIEW_REQUIRED_FIELD_ID}
                data-fix-field={SOURCE_DATA_REVIEW_REQUIRED_FIELD_ID}
                type="button"
                onClick={() => {
                  setReviewMode(true);
                  setPreviewFilter("review_required");
                }}
                className="rounded-bs-sm bg-bs-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-bs-primary-hover"
              >
                Review Required Items
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-bs-page px-3 py-1 text-bs-text-secondary">
                {totalAccounts} Accounts detected
              </span>
              <span className="rounded-full bg-bs-warning/10 px-3 py-1 text-bs-warning">
                {reviewRequiredCount} Review Required
              </span>
              <span className="rounded-full bg-bs-danger/10 px-3 py-1 text-bs-danger">
                {unmappedCount} Unmapped
              </span>
              <span className="rounded-full bg-bs-warning/10 px-3 py-1 text-bs-warning">
                {lowConfidenceCount} Low Confidence
              </span>
              <span className="rounded-full bg-bs-success/10 px-3 py-1 text-bs-success">
                {savedMappingCount} Saved Mapping
              </span>
            </div>

            {totalAccounts === 0 ? <EmptyState
              density="compact"
              icon={Database}
              title="No accounts detected"
              description="Check period detection and column mapping before continuing."
            /> : null}

            <div className="mt-4 flex flex-col gap-3 rounded-bs-md border border-bs-border-subtle bg-bs-page px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "All Accounts"],
                  ["review_required", "Review Required"],
                  ["unmapped", "Unmapped"],
                  ["low_confidence", "Low Confidence"],
                  ["saved_mapping", "Saved Mapping"],
                  ["rule_based", "Rule-Based"]
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreviewFilter(value as PreviewFilter)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      previewFilter === value
                        ? "bg-bs-primary text-white"
                        : "bg-bs-surface text-bs-text-secondary ring-1 ring-bs-border-subtle hover:bg-bs-page"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-3 text-sm font-medium text-bs-text-secondary">
                <span>Review Mode</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reviewMode}
                  onClick={() => setReviewMode((current) => !current)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    reviewMode ? "bg-bs-primary" : "bg-bs-border-strong"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-bs-surface transition ${
                      reviewMode ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>
            </div>

            {reviewRequiredCount === 0 ? (
              <div className="mt-4 rounded-bs-md border border-bs-success/20 bg-bs-success/10 px-4 py-3 text-sm text-bs-success">
                All accounts are mapped and ready for import.
              </div>
            ) : null}

            {reviewMode && filteredPreviewRows.length === 0 ? (
              <div className="mt-4 rounded-bs-md border border-bs-border-subtle bg-bs-page px-4 py-6 text-center text-sm text-bs-text-secondary">
                No accounts currently require review.
              </div>
            ) : (
            <div className="mt-4 overflow-x-auto rounded-bs-md border border-bs-border-subtle">
              <table className="min-w-full divide-y divide-bs-border-subtle text-sm">
                <thead className="bg-bs-page">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-bs-text-muted">Account</th>
                    {previewPeriodColumns.map((period, index) => (
                      <th
                        key={period.key}
                        className={`px-3 py-2 text-right font-medium text-bs-text-muted ${
                          index === previewPeriodColumns.length - 1 ? "text-bs-text-secondary" : ""
                        }`}
                      >
                        {period.label}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium text-bs-text-muted">Mapping</th>
                    <th className="px-3 py-2 text-left font-medium text-bs-text-muted">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bs-border-subtle bg-bs-surface">
                  {filteredPreviewRows.slice(0, 20).map((row) => {
                    const isExpanded = expandedPreviewAccountKey === row.accountKey;
                    const status = groupedPreviewStatus(row);
                    const rowClass =
                      status === "Excluded"
                        ? "bg-bs-page/80 text-bs-text-muted"
                        : status === "Unmapped"
                        ? "bg-bs-danger/10/70"
                        : status === "Non-blocking"
                          ? "bg-bs-warning/10/60"
                        : status === "Review Required"
                          ? "bg-bs-warning/10/70"
                          : status === "Low Confidence"
                            ? "bg-bs-warning/5"
                            : "";

                    return (
                      <Fragment key={row.accountKey || row.accountName}>
                        <tr className={rowClass}>
                          <td className="px-3 py-3 align-top">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPreviewAccountKey((current) =>
                                  current === row.accountKey ? null : row.accountKey
                                )
                              }
                              className="flex items-center gap-2 text-left"
                            >
                              <span className="text-xs text-bs-text-muted">{isExpanded ? "▾" : "▸"}</span>
                              <span className="font-medium text-bs-text-primary">
                                {row.accountName || "Blank account"}
                              </span>
                            </button>
                          </td>
                          {previewPeriodColumns.map((period, index) => {
                            const periodMatch =
                              row.periods.find(
                                (item: any) =>
                                  canonicalPeriodKey(
                                    item.periodLabel || "",
                                    item.periodDate || ""
                                  ) === period.key
                              ) ?? null;

                            return (
                              <td
                                key={`${row.accountKey}-${period.key}`}
                                className={`px-3 py-3 text-right align-top ${
                                  index === previewPeriodColumns.length - 1
                                    ? "font-semibold text-bs-text-primary"
                                    : "text-bs-text-secondary"
                                }`}
                              >
                                {periodMatch?.amountText || ""}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 align-top">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${matchedByClass(
                                row.matchedBy
                              )}`}
                            >
                              {formatMatchedBy(row.matchedBy, row.memoryScope)}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="flex min-w-[12rem] flex-col gap-2">
                              <span
                                className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                                  status
                                )}`}
                              >
                                {status}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => toggleExcluded(row.accountKey)}
                                  className="rounded-full border border-bs-border-strong px-2.5 py-1 text-xs font-medium text-bs-text-secondary hover:bg-bs-page"
                                >
                                  {row.isExcluded ? "Include" : "Exclude"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    devLog("ROW MOVED TO FOCUSED REVIEW", {
                                      accountKey: row.accountKey,
                                      accountName: row.accountName
                                    });
                                    devLog("MAPPING EDITOR OPENED", {
                                      accountKey: row.accountKey,
                                      accountName: row.accountName
                                    });
                                    setFocusedReviewOpen(true);
                                    setFocusedReviewAccountKey(row.accountKey);
                                  }}
                                  className="rounded-full border border-bs-warning/40 px-2.5 py-1 text-xs font-medium text-bs-warning hover:bg-bs-warning/10"
                                >
                                  Create Mapping
                                </button>
                              </div>
                              <SaveMappingButton
                                companyId={selectedCompanyId || null}
                                accountName={row.accountName}
                                concept={row.category}
                                category={row.category}
                                statementType={row.statementType}
                                matchedBy={row.matchedBy}
                                onSaved={handleMappingSaved}
                              />
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}

            <details
              id={SOURCE_DATA_FOCUSED_MAPPING_SECTION_ID}
              data-fix-section={SOURCE_DATA_FOCUSED_MAPPING_SECTION_ID}
              open={focusedReviewOpen}
              onToggle={(event) =>
                setFocusedReviewOpen((event.currentTarget as HTMLDetailsElement).open)
              }
              className="mt-4 rounded-bs-md border border-bs-border-subtle bg-bs-page p-4"
            >
              <summary className="cursor-pointer list-none text-sm font-medium text-bs-text-primary">
                Focused mapping review
              </summary>
              <p className="mt-2 text-sm text-bs-text-secondary">
                These line items require a manual mapping assignment before they can move back into the resolved review set.
              </p>
              <div className="mt-4 space-y-3">
                {focusedReviewRows.length === 0 ? (
                  <div className="rounded-bs-md border border-bs-border-subtle bg-bs-surface px-4 py-5 text-sm text-bs-text-secondary">
                    No line items currently require focused manual mapping.
                  </div>
                ) : null}
                {focusedReviewRows.map((row) => (
                  <div
                    key={row.accountKey || `blank-${row.rowNumbers.join("-")}`}
                    className={`rounded-bs-md border bg-bs-surface p-4 ${
                      focusedReviewAccountKey === row.accountKey
                        ? "border-bs-warning/40 ring-2 ring-bs-warning/20"
                        : "border-bs-border-subtle"
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-bs-text-primary">
                          {row.accountName || "Blank account name"}
                        </h4>
                        <p className="mt-1 text-sm text-bs-text-secondary">{row.mappingExplanation}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNonBlocking(row.accountKey)}
                        className="rounded-full border border-bs-warning/40 px-3 py-1.5 text-xs font-medium text-bs-warning hover:bg-bs-warning/10"
                      >
                        {row.isNonBlocking ? "Blocking" : "Mark as non-blocking"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                          Category
                        </label>
                        <select
                          value={row.category}
                          onChange={(event) => {
                            const selectedValue = event.target.value;
                            devLog("FOCUSED REVIEW MAPPING APPLIED", {
                              accountKey: row.accountKey,
                              accountName: row.accountName,
                              field: "category",
                              value: selectedValue,
                              isParentCategory: isBalanceSheetParentCategory(
                                selectedValue as NormalizedCategory | null
                              ),
                              isLeafCategory:
                                row.statementType === "balance_sheet"
                                  ? isBalanceSheetLeafCategory(
                                      selectedValue as NormalizedCategory | null
                                    )
                                  : !isBalanceSheetParentCategory(
                                      selectedValue as NormalizedCategory | null
                                    )
                            });
                            updateRowsForAccount(row.accountKey, {
                              __manual_category: selectedValue
                            });
                          }}
                          className={`w-full ${
                            row.needsReview && !row.category
                              ? "border-bs-warning/40 bg-bs-warning/10"
                              : ""
                          }`}
                        >
                          <option value="">Review</option>
                          {categoryOptionsForStatementType(row.statementType).map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                          Statement Type
                        </label>
                        <select
                          value={row.statementType}
                          onChange={(event) => {
                            const nextStatementType = event.target.value;
                            const shouldClearCategory =
                              nextStatementType === "balance_sheet"
                                ? !isBalanceSheetLeafCategory(
                                    row.category as NormalizedCategory | null
                                  )
                                : nextStatementType === "income"
                                  ? isBalanceSheetParentCategory(
                                      row.category as NormalizedCategory | null
                                    ) ||
                                    isBalanceSheetLeafCategory(
                                      row.category as NormalizedCategory | null
                                    )
                                  : false;
                            devLog("FOCUSED REVIEW MAPPING APPLIED", {
                              accountKey: row.accountKey,
                              accountName: row.accountName,
                              field: "statementType",
                              value: nextStatementType
                            });
                            updateRowsForAccount(row.accountKey, {
                              __manual_statement_type: nextStatementType,
                              ...(shouldClearCategory ? { __manual_category: "" } : {})
                            });
                          }}
                          className={`w-full ${
                            row.needsReview && !row.statementType
                              ? "border-bs-warning/40 bg-bs-warning/10"
                              : ""
                          }`}
                        >
                          <option value="">Review</option>
                          {STATEMENT_TYPE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <p className="text-xs text-bs-text-muted">
                        Apply the mapping here, then save it for future imports if this is a reusable line item.
                      </p>
                      <SaveMappingButton
                        companyId={selectedCompanyId || null}
                        accountName={row.accountName}
                        concept={row.category}
                        category={row.category}
                        statementType={row.statementType}
                        matchedBy={row.matchedBy}
                        onSaved={handleMappingSaved}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </details>

            <StepActions
              onBack={() => setActiveStep(2)}
              onContinue={() => setActiveStep(4)}
              continueDisabled={!canProceedFromReview}
            />
          </section>
        </div>
      ) : null}

      {activeStep === 4 && selectedSheet ? (
        <section className="mt-5 rounded-bs-md border border-bs-border-subtle p-4">
          <StepHeading
            step="Step 4"
            title="Import"
            description="Confirm the final summary and import these financials into the review workflow."
          />

          {workbookContext ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-4">
              <SummaryMetric label="Workbook confidence" value={workbookContext.confidenceLabel} />
              <SummaryMetric label="Selected sheet" value={selectedSheet.name} />
              <SummaryMetric
                label="Workbook package"
                value={`IS: ${workbookContext.primaryIncomeStatementSheetName ?? "Missing"} • BS: ${workbookContext.primaryBalanceSheetSheetName ?? "Missing"}`}
              />
              <SummaryMetric
                label="Detected structure"
                value={`${selectedSheet.analysis.periodDetection.label} • ${selectedSheet.analysis.columnStructure.label}`}
              />
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {importSummaryCards.map(([label, value]) => (
              <div
                key={label}
                className="rounded-bs-md border border-bs-border-subtle bg-bs-page px-4 py-3"
              >
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                  {label}
                </p>
                <p className="mt-2 text-xl font-semibold text-bs-text-primary">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-bs-md border border-bs-border-subtle bg-bs-page p-4 text-sm text-bs-text-secondary">
            Reviewed mappings, reporting periods, and saved mappings will carry into this import.
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="rounded-bs-sm border border-bs-border-strong px-4 py-2.5 text-sm font-medium text-bs-text-secondary hover:bg-bs-page"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importBlocked}
              className="rounded-bs-sm bg-bs-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-bs-primary-hover disabled:opacity-60"
            >
              {isPending ? "Importing..." : "Import Financials"}
            </button>
          </div>

          {importSummary ? (
            <div className="mt-4 space-y-4 rounded-bs-md border border-bs-border-subtle bg-bs-page p-4 text-sm text-bs-text-secondary">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <SummaryMetric label="Rows imported" value={String(importSummary.insertedCount)} />
                <SummaryMetric label="Rows auto-mapped" value={String(importSummary.autoMappedRows)} />
                <SummaryMetric label="Rows needing review" value={String(importSummary.rowsNeedingReview)} />
                <SummaryMetric label="Rejected rows" value={String(importSummary.rejectedRows.length)} />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                    Missing critical categories
                  </p>
                  <p className="mt-2 text-sm text-bs-text-secondary">
                    {importSummary.missingCriticalCategories.length > 0
                      ? importSummary.missingCriticalCategories.join(", ")
                      : "None detected in this import scope."}
                  </p>
                </div>
                <div className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                    Next actions
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {importSummary.nextActions.map((action) => (
                      <span
                        key={action}
                        className="rounded-full bg-bs-page px-3 py-1 text-xs font-medium text-bs-text-secondary"
                      >
                        {action}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-bs-text-secondary">
                    Source Data summary, completion state, and fix-it navigation refresh immediately after a successful import.
                  </p>
                </div>
              </div>

              {importSummary.workbookFollowUps.length > 0 ? (
                <div className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                    Workbook follow-ups
                  </p>
                  <div className="mt-2 space-y-2">
                    {importSummary.workbookFollowUps.map((item) => (
                      <p key={item} className="text-sm text-bs-text-secondary">
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {importSummary.workbookFixIts.length > 0 ? (
                <div className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                    Workbook Fix-It actions
                  </p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {importSummary.workbookFixIts.map((task) => (
                      <div
                        key={task.key}
                        className={`rounded-bs-md border px-4 py-3 ${workbookFixItSeverityClass(task.severity)}`}
                      >
                        <p className="text-sm font-semibold">{task.label}</p>
                        <p className="mt-1 text-sm opacity-90">{task.reason}</p>
                        <Link
                          href={task.href}
                          className="mt-3 inline-flex rounded-bs-sm bg-bs-surface px-3 py-1.5 text-xs font-medium text-bs-text-primary ring-1 ring-bs-border-subtle hover:bg-bs-page"
                        >
                          {task.actionLabel}
                        </Link>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-sm text-bs-text-secondary">
                    These actions reuse the existing Source Data Fix-It routing so workbook blockers can be revisited from the same workflow.
                  </p>
                </div>
              ) : null}

              {importSummary.rejectedRows.length > 0 ? (
                <div className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-bs-text-muted">
                    Rejected rows
                  </p>
                  <div className="mt-2 space-y-2">
                    {importSummary.rejectedRows.slice(0, 6).map((row) => (
                      <p key={`${row.rowNumber}-${row.accountName}-${row.reason}`} className="text-sm text-bs-text-secondary">
                        Row {row.rowNumber}: {row.accountName || "Untitled row"} ({row.reason})
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function StepHeading({
  step,
  title,
  description,
  badge
}: {
  step: string;
  title: string;
  description: string;
  badge?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-bs-text-muted">{step}</p>
        <h3 className="mt-1 text-base font-semibold text-bs-text-primary">{title}</h3>
        <p className="mt-1 text-sm text-bs-text-muted">{description}</p>
      </div>
      {badge ? (
        <div className="rounded-bs-sm bg-bs-page px-3 py-2 text-sm text-bs-text-secondary">{badge}</div>
      ) : null}
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <ContentCard padding="compact">
      <p className="bs-label">{label}</p>
      <p className="mt-2 text-xl font-semibold text-bs-text-primary">{value}</p>
    </ContentCard>
  );
}

function StepActions({
  onBack,
  onContinue,
  continueDisabled
}: {
  onBack: () => void;
  onContinue: () => void;
  continueDisabled?: boolean;
}) {
  return (
    <div className="mt-4 flex items-center justify-between">
      <button
        type="button"
        onClick={onBack}
        className="rounded-bs-sm border border-bs-border-strong px-4 py-2.5 text-sm font-medium text-bs-text-secondary hover:bg-bs-page"
      >
        Back
      </button>
      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled}
        className="rounded-bs-sm bg-bs-primary px-4 py-2.5 text-sm font-medium text-white hover:bg-bs-primary-hover disabled:opacity-60"
      >
        Continue
      </button>
    </div>
  );
}

function Notice({
  tone,
  children
}: {
  tone: "amber" | "rose" | "teal" | "sky";
  children: ReactNode;
}) {
  const styles = {
    amber: "mt-4 rounded-bs-sm border border-bs-warning/20 bg-bs-warning/10 px-4 py-3 text-sm text-bs-warning",
    rose: "mt-4 rounded-bs-sm border border-bs-danger/20 bg-bs-danger/10 px-4 py-3 text-sm text-bs-danger",
    teal: "mt-4 rounded-bs-sm border border-bs-success/20 bg-bs-success/10 px-4 py-3 text-sm text-bs-success",
    sky: "mt-4 rounded-bs-sm border border-bs-info/20 bg-bs-info/10 px-4 py-3 text-sm text-bs-info"
  };

  return <div className={styles[tone]}>{children}</div>;
}

function ColumnSelect({
  label,
  value,
  options,
  required = false,
  onChange
}: {
  label: string;
  value: string;
  options: string[];
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-bs-text-secondary">
        {label}{" "}
        {required ? (
          <span className="text-xs font-normal text-bs-text-muted">(Required)</span>
        ) : (
          <span className="text-xs font-normal text-bs-text-muted">(Optional)</span>
        )}
      </label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{required ? "Select column" : "Not provided"}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
