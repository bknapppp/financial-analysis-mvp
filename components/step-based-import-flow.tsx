"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";
import {
  getMappingCategoryOptions,
  isBalanceSheetLeafCategory,
  isBalanceSheetParentCategory
} from "@/lib/auto-mapping";
import { normalizeImportedPeriod } from "@/lib/import-periods";
import type {
  Company,
  NormalizedCategory,
  ReportingPeriod,
  StatementType
} from "@/lib/types";
import { SaveMappingButton } from "@/components/save-mapping-button";

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
  parsedFile: any;
  selectedSheet: any;
  structurePreviewRows: any[];
  structurePreviewHeaders: string[];
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
  } | null;
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
  if (value === "memory") return "bg-emerald-100 text-emerald-800";
  if (value === "saved_mapping") return "bg-teal-100 text-teal-800";
  if (value === "keyword") return "bg-sky-100 text-sky-800";
  if (value === "csv_value") return "bg-violet-100 text-violet-800";
  return "bg-amber-100 text-amber-800";
}

function formatMatchedBy(value: string, memoryScope?: "company" | "global" | null) {
  if (value === "memory" && memoryScope === "company") return "From Saved Mapping (Company)";
  if (value === "memory" && memoryScope === "global") return "From Saved Mapping (Global)";
  if (value === "memory") return "From Saved Mapping";
  if (value === "saved_mapping") return "Saved Mapping";
  if (value === "keyword") return "Rule-Based";
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
  if (row.matchedBy === "keyword") return "Rule-Based";
  if (row.needsReview) return "Review Required";
  return "Confirmed";
}

function statusClass(status: string) {
  if (status === "Excluded") return "border border-slate-200 bg-slate-100 text-slate-600";
  if (status === "Non-blocking") return "border border-amber-200 bg-amber-50 text-amber-800";
  if (status === "Unmapped") return "border border-rose-200 bg-rose-100 text-rose-800";
  if (status === "Review Required") return "border border-amber-200 bg-amber-100 text-amber-800";
  if (status === "Low Confidence") return "border border-orange-200 bg-orange-100 text-orange-800";
  if (status === "Saved Mapping") return "border border-emerald-200 bg-emerald-100 text-emerald-800";
  if (status === "Rule-Based") return "border border-sky-200 bg-sky-100 text-sky-800";
  return "border border-teal-200 bg-teal-100 text-teal-800";
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
    parsedFile,
    selectedSheet,
    structurePreviewRows,
    structurePreviewHeaders,
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
    stepStatus
  } = props;
  const [focusedReviewOpen, setFocusedReviewOpen] = useState(false);
  const [focusedReviewAccountKey, setFocusedReviewAccountKey] = useState<string | null>(null);

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
    console.log("FOCUSED REVIEW ROW COUNT", focusedReviewRows.length);
  }, [focusedReviewRows.length]);

  useEffect(() => {
    if (!focusedReviewAccountKey) {
      return;
    }

    const stillNeedsReview = focusedReviewRows.some(
      (row) => row.accountKey === focusedReviewAccountKey
    );

    if (!stillNeedsReview) {
      console.log("ROW RETURNED TO RESOLVED MAIN STATE", {
        accountKey: focusedReviewAccountKey
      });
      setFocusedReviewAccountKey(null);
    }
  }, [focusedReviewAccountKey, focusedReviewRows]);

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Financial Data Upload</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload CSV or Excel, confirm structure, review mappings, and import into the review workflow.
            </p>
          </div>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
            Primary path
          </span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
        <div className="grid gap-2 md:grid-cols-4">
          {stepItems.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => step.ready && setActiveStep(step.id)}
              disabled={!step.ready}
              className={`rounded-[1.25rem] px-4 py-3 text-left transition ${
                activeStep === step.id
                  ? "bg-white shadow-sm ring-1 ring-slate-200"
                  : step.ready
                    ? "text-slate-700 hover:bg-white/70"
                    : "cursor-not-allowed text-slate-400"
              }`}
            >
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Step {step.id}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{step.label}</p>
            </button>
          ))}
        </div>
      </div>

      {setupMessage ? <Notice tone="amber">{setupMessage}</Notice> : null}
      {errorMessage ? <Notice tone="rose">{errorMessage}</Notice> : null}
      {successMessage ? <Notice tone="teal">{successMessage}</Notice> : null}

      {activeStep === 1 ? (
        <section className="mt-5 rounded-2xl border border-slate-200 p-4">
          <StepHeading
            step="Step 1"
            title="Upload"
            description="Select the company, upload the financial file, and move into structure review."
            badge={parsedFile?.fileName}
          />

          {companySetupSlot ? (
            <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                Company Setup
              </summary>
              <p className="mt-2 text-sm text-slate-500">
                Add a company here if the legal entity is not yet available for this review.
              </p>
              <div className="mt-4">{companySetupSlot}</div>
            </details>
          ) : null}

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">Company</label>
            <select
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

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex-1">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Financial file
                </label>
                <input
                  type="file"
                  accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileUpload}
                  disabled={!selectedCompanyId}
                />
              </div>

              {parsedFile && parsedFile.sheets.length > 1 ? (
                <div className="w-full md:w-56">
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Worksheet
                  </label>
                  <select
                    value={selectedSheetName}
                    onChange={(event) => setSelectedSheetName(event.target.value)}
                  >
                    {parsedFile.sheets.map((sheet: any) => (
                      <option key={sheet.name} value={sheet.name}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              disabled={!stepStatus.uploadComplete}
              className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {activeStep === 2 && selectedSheet ? (
        <div className="mt-5 space-y-5">
          <section className="rounded-2xl border border-slate-200 p-4">
            <StepHeading
              step="Step 2"
              title="Confirm Structure"
              description="Review the selected sheet, detected headers, and a sample of parsed rows before mapping."
              badge={`${parsedFile?.fileName || ""} • ${structurePreviewRows.length} row(s)`}
            />

            <div className="mt-4 flex flex-wrap gap-2">
              {structurePreviewHeaders.map((header: string) => (
                <span
                  key={header}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {header}
                </span>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {structurePreviewHeaders.slice(0, 6).map((header: string) => (
                      <th key={header} className="px-3 py-2 text-left font-medium text-slate-500">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {structurePreviewRows.slice(0, 8).map((row: any, index: number) => (
                    <tr key={`${selectedSheet.name}-${index}`}>
                      {structurePreviewHeaders.slice(0, 6).map((header: string) => (
                        <td key={header} className="px-3 py-2 text-slate-700">
                          {row[header] || "—"}
                        </td>
                      ))}
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

          <section className="rounded-2xl border border-slate-200 p-4">
            <h3 className="text-base font-semibold text-slate-900">Header and period interpretation</h3>
            <p className="mt-1 text-sm text-slate-500">
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
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{period.label}</p>
                      <p className="text-xs text-slate-500">
                        {period.rowCount} row(s) • anchor {period.periodDate}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        period.matchedPeriodId
                          ? "bg-teal-100 text-teal-800"
                          : "bg-sky-100 text-sky-800"
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
              <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPeriodFallbackMode("existing")}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      periodFallbackMode === "existing" ? "bg-ink text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Assign existing period
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodFallbackMode("new")}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      periodFallbackMode === "new" ? "bg-ink text-white" : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Create period inline
                  </button>
                </div>

                {periodFallbackMode === "existing" ? (
                  <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium text-slate-700">
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
                      <label className="mb-1 block text-sm font-medium text-slate-700">
                        New period label
                      </label>
                      <input
                        value={newPeriodLabel}
                        onChange={(event) => setNewPeriodLabel(event.target.value)}
                        placeholder="May 2026"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-700">
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
            <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
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
          <section className="rounded-2xl border border-slate-200 p-4">
            <StepHeading
              step="Step 3"
              title="Review Mappings"
              description="Use the financial preview to validate periods, review mappings, and resolve accounts under review."
            />

            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">
                  Review Progress: {confirmedCount} of {totalAccounts} accounts confirmed
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {reviewRequiredCount > 0
                    ? `${reviewRequiredCount} accounts require review`
                    : "All accounts are mapped and ready for import"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReviewMode(true);
                  setPreviewFilter("review_required");
                }}
                className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Review Required Items
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                {totalAccounts} Accounts detected
              </span>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                {reviewRequiredCount} Review Required
              </span>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                {unmappedCount} Unmapped
              </span>
              <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">
                {lowConfidenceCount} Low Confidence
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                {savedMappingCount} Saved Mapping
              </span>
            </div>

            {totalAccounts === 0 ? (
              <Notice tone="amber">
                No accounts detected for import. Check period detection and column mapping.
              </Notice>
            ) : null}

            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:flex-row md:items-center md:justify-between">
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
                        ? "bg-slate-900 text-white"
                        : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <span>Review Mode</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={reviewMode}
                  onClick={() => setReviewMode((current) => !current)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                    reviewMode ? "bg-slate-900" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                      reviewMode ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </label>
            </div>

            {reviewRequiredCount === 0 ? (
              <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
                All accounts are mapped and ready for import.
              </div>
            ) : null}

            {reviewMode && filteredPreviewRows.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                No accounts currently require review.
              </div>
            ) : (
            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Account</th>
                    {previewPeriodColumns.map((period, index) => (
                      <th
                        key={period.key}
                        className={`px-3 py-2 text-right font-medium text-slate-500 ${
                          index === previewPeriodColumns.length - 1 ? "text-slate-700" : ""
                        }`}
                      >
                        {period.label}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Mapping</th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredPreviewRows.slice(0, 20).map((row) => {
                    const isExpanded = expandedPreviewAccountKey === row.accountKey;
                    const status = groupedPreviewStatus(row);
                    const rowClass =
                      status === "Excluded"
                        ? "bg-slate-100/80 text-slate-500"
                        : status === "Unmapped"
                        ? "bg-rose-50/70"
                        : status === "Non-blocking"
                          ? "bg-amber-50/60"
                        : status === "Review Required"
                          ? "bg-amber-50/70"
                          : status === "Low Confidence"
                            ? "bg-orange-50/70"
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
                              <span className="text-xs text-slate-400">{isExpanded ? "▾" : "▸"}</span>
                              <span className="font-medium text-slate-900">
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
                                    ? "font-semibold text-slate-900"
                                    : "text-slate-700"
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
                                  className="rounded-full border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  {row.isExcluded ? "Include" : "Exclude"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    console.log("ROW MOVED TO FOCUSED REVIEW", {
                                      accountKey: row.accountKey,
                                      accountName: row.accountName
                                    });
                                    console.log("MAPPING EDITOR OPENED", {
                                      accountKey: row.accountKey,
                                      accountName: row.accountName
                                    });
                                    setFocusedReviewOpen(true);
                                    setFocusedReviewAccountKey(row.accountKey);
                                  }}
                                  className="rounded-full border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50"
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
              open={focusedReviewOpen}
              onToggle={(event) =>
                setFocusedReviewOpen((event.currentTarget as HTMLDetailsElement).open)
              }
              className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
            >
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                Focused mapping review
              </summary>
              <p className="mt-2 text-sm text-slate-600">
                These line items require a manual mapping assignment before they can move back into the resolved review set.
              </p>
              <div className="mt-4 space-y-3">
                {focusedReviewRows.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-600">
                    No line items currently require focused manual mapping.
                  </div>
                ) : null}
                {focusedReviewRows.map((row) => (
                  <div
                    key={row.accountKey || `blank-${row.rowNumbers.join("-")}`}
                    className={`rounded-2xl border bg-white p-4 ${
                      focusedReviewAccountKey === row.accountKey
                        ? "border-amber-300 ring-2 ring-amber-100"
                        : "border-slate-200"
                    }`}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">
                          {row.accountName || "Blank account name"}
                        </h4>
                        <p className="mt-1 text-sm text-slate-600">{row.mappingExplanation}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleNonBlocking(row.accountKey)}
                        className="rounded-full border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
                      >
                        {row.isNonBlocking ? "Blocking" : "Mark as non-blocking"}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                          Category
                        </label>
                        <select
                          value={row.category}
                          onChange={(event) => {
                            const selectedValue = event.target.value;
                            console.log("FOCUSED REVIEW MAPPING APPLIED", {
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
                              ? "border-amber-300 bg-amber-50"
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
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
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
                            console.log("FOCUSED REVIEW MAPPING APPLIED", {
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
                              ? "border-amber-300 bg-amber-50"
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
                      <p className="text-xs text-slate-500">
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
        <section className="mt-5 rounded-2xl border border-slate-200 p-4">
          <StepHeading
            step="Step 4"
            title="Import"
            description="Confirm the final summary and import these financials into the review workflow."
          />

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {importSummaryCards.map(([label, value]) => (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              >
                <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                  {label}
                </p>
                <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            Reviewed mappings, reporting periods, and saved mappings will carry into this import.
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importBlocked}
              className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isPending ? "Importing..." : "Import Financials"}
            </button>
          </div>

          {importSummary ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p className="font-medium">Inserted rows: {importSummary.insertedCount}</p>
              <p className="mt-1 font-medium">
                Rejected rows: {importSummary.rejectedRows.length}
              </p>
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
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">{step}</p>
        <h3 className="mt-1 text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      {badge ? (
        <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{badge}</div>
      ) : null}
    </div>
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
        className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Back
      </button>
      <button
        type="button"
        onClick={onContinue}
        disabled={continueDisabled}
        className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
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
    amber: "mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800",
    rose: "mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800",
    teal: "mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800",
    sky: "mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"
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
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}{" "}
        {required ? (
          <span className="text-xs font-normal text-slate-400">(Required)</span>
        ) : (
          <span className="text-xs font-normal text-slate-400">(Optional)</span>
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
