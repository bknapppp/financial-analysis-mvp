"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { normalizeAccountName, parseBooleanFlag } from "@/lib/auto-mapping";
import {
  buildImportAccountReviewRows,
  buildImportPreviewRows
} from "@/lib/import-mapping";
import {
  buildInitialColumnMapping,
  getCellValue,
  parseImportFile,
  type ImportColumnMapping,
  type ImportFieldKey,
  type ParsedImportFile
} from "@/lib/import-preview";
import {
  detectImportPeriods,
  matchDetectedPeriodsToExisting
} from "@/lib/import-periods";
import type {
  AccountMapping,
  Company,
  NormalizedCategory,
  ReportingPeriod,
  StatementType
} from "@/lib/types";
import { SaveMappingButton } from "@/components/save-mapping-button";

type CsvImportSectionProps = {
  companies: Company[];
  initialCompanyId: string | null;
  initialPeriods: ReportingPeriod[];
};

const CATEGORY_OPTIONS: NormalizedCategory[] = [
  "Revenue",
  "COGS",
  "Operating Expenses",
  "Assets",
  "Liabilities",
  "Equity"
];

const STATEMENT_TYPE_OPTIONS: StatementType[] = ["income", "balance_sheet"];

const COLUMN_FIELDS: Array<{
  key: ImportFieldKey;
  label: string;
  required?: boolean;
}> = [
  { key: "accountName", label: "Account name", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "periodLabel", label: "Period label" },
  { key: "periodDate", label: "Period date" },
  { key: "statementType", label: "Statement type" },
  { key: "category", label: "Category" },
  { key: "addbackFlag", label: "Add-back flag" }
];

function matchedByClass(value: string) {
  if (value === "saved_mapping") return "bg-teal-100 text-teal-800";
  if (value === "keyword") return "bg-sky-100 text-sky-800";
  if (value === "csv_value") return "bg-violet-100 text-violet-800";
  return "bg-amber-100 text-amber-800";
}

function confidenceClass(value: string) {
  if (value === "high") return "bg-teal-100 text-teal-800";
  if (value === "medium") return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function formatMatchedBy(value: string) {
  if (value === "saved_mapping") return "Saved mapping";
  if (value === "keyword") return "Keyword match";
  if (value === "csv_value") return "Source value";
  return "Manual review";
}

function formatConfidence(value: string) {
  if (value === "high") return "High confidence";
  if (value === "medium") return "Medium confidence";
  return "Low confidence";
}

export function CsvImportSection({
  companies,
  initialCompanyId,
  initialPeriods
}: CsvImportSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedCompanyId, setSelectedCompanyId] = useState(initialCompanyId ?? "");
  const [periods, setPeriods] = useState(initialPeriods);
  const [selectedPeriodId, setSelectedPeriodId] = useState(
    initialPeriods[initialPeriods.length - 1]?.id ?? ""
  );
  const [periodFallbackMode, setPeriodFallbackMode] = useState<"existing" | "new">(
    "existing"
  );
  const [newPeriodLabel, setNewPeriodLabel] = useState("");
  const [newPeriodDate, setNewPeriodDate] = useState("");
  const [savedMappings, setSavedMappings] = useState<AccountMapping[]>([]);
  const [parsedFile, setParsedFile] = useState<ParsedImportFile | null>(null);
  const [selectedSheetName, setSelectedSheetName] = useState("");
  const [columnMapping, setColumnMapping] = useState<ImportColumnMapping>({
    accountName: "",
    amount: "",
    periodLabel: "",
    periodDate: "",
    statementType: "",
    category: "",
    addbackFlag: ""
  });
  const [setupMessage, setSetupMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    insertedCount: number;
    rejectedRows: Array<{ rowNumber: number; accountName: string; reason: string }>;
  } | null>(null);

  async function loadCompanyContext(companyId: string) {
    try {
      const [periodResponse, mappingsResponse] = await Promise.all([
        fetch(`/api/periods?companyId=${companyId}`),
        fetch(`/api/account-mappings?companyId=${companyId}`)
      ]);

      const periodPayload = periodResponse.ok
        ? ((await periodResponse.json()) as { data?: ReportingPeriod[] })
        : { data: [] as ReportingPeriod[] };
      const mappingsPayload = mappingsResponse.ok
        ? ((await mappingsResponse.json()) as { data?: AccountMapping[] })
        : { data: [] as AccountMapping[] };

      const nextPeriods = Array.isArray(periodPayload.data) ? periodPayload.data : [];
      setPeriods(nextPeriods);
      setSelectedPeriodId((current) =>
        nextPeriods.some((period) => period.id === current)
          ? current
          : (nextPeriods[nextPeriods.length - 1]?.id ?? "")
      );
      setSavedMappings(Array.isArray(mappingsPayload.data) ? mappingsPayload.data : []);

      if (!periodResponse.ok) {
        setSetupMessage(
          "Reporting periods could not be loaded. Refresh and try again."
        );
        return;
      }

      if (!mappingsResponse.ok) {
        setSetupMessage(
          "Saved mappings are temporarily unavailable. You can still review and import this file."
        );
        return;
      }

      setSetupMessage(null);
    } catch {
      setPeriods([]);
      setSelectedPeriodId("");
      setSavedMappings([]);
      setSetupMessage(
        "Import setup data could not be loaded right now. Refresh and try again."
      );
    }
  }

  useEffect(() => {
    if (!selectedCompanyId) {
      setPeriods([]);
      setSelectedPeriodId("");
      setSavedMappings([]);
      return;
    }

    void loadCompanyContext(selectedCompanyId);
  }, [selectedCompanyId]);

  const selectedSheet = useMemo(() => {
    if (!parsedFile) {
      return null;
    }

    return (
      parsedFile.sheets.find((sheet) => sheet.name === selectedSheetName) ??
      parsedFile.sheets[0] ??
      null
    );
  }, [parsedFile, selectedSheetName]);

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  );
  useEffect(() => {
    if (!parsedFile) {
      setSelectedSheetName("");
      setColumnMapping({
        accountName: "",
        amount: "",
        periodLabel: "",
        periodDate: "",
        statementType: "",
        category: "",
        addbackFlag: ""
      });
      return;
    }

    const activeSheet =
      parsedFile.sheets.find((sheet) => sheet.name === selectedSheetName) ??
      parsedFile.sheets[0] ??
      null;

    if (!activeSheet) {
      return;
    }

    setSelectedSheetName(activeSheet.name);
    setColumnMapping(buildInitialColumnMapping(activeSheet.headers));
  }, [parsedFile, selectedSheetName]);

  const previewRows = useMemo(
    () =>
      selectedSheet
        ? buildImportPreviewRows({
            rows: selectedSheet.rows,
            columnMapping,
            savedMappings
          })
        : [],
    [columnMapping, savedMappings, selectedSheet]
  );
  const detectedPeriods = useMemo(() => {
    const detection = detectImportPeriods(previewRows);

    return {
      periods: matchDetectedPeriodsToExisting(detection.periods, periods),
      unresolvedRows: detection.unresolvedRows
    };
  }, [periods, previewRows]);

  const accountReviewRows = useMemo(
    () => buildImportAccountReviewRows(previewRows),
    [previewRows]
  );

  const previewStats = useMemo(() => {
    const total = previewRows.length;
    const ready = previewRows.filter((row) => !row.needsReview).length;
    const needsReview = total - ready;
    const lowConfidence = previewRows.filter((row) => row.confidence === "low").length;

    return { total, ready, needsReview, lowConfidence };
  }, [previewRows]);

  const sourcePeriodNotice = useMemo(() => {
    if (detectedPeriods.periods.length > 0) {
      return "Detected period values will be matched to existing reporting periods first and auto-created when missing.";
    }

    if (previewRows.some((row) => row.sourcePeriodLabel || row.sourcePeriodDate)) {
      return "Some source period values were present but could not be normalized. Use the fallback period controls below.";
    }

    return null;
  }, [detectedPeriods.periods.length, previewRows]);

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setImportSummary(null);

    try {
      const nextParsedFile = await parseImportFile(file);

      if (nextParsedFile.sheets.length === 0) {
        setParsedFile(null);
        setErrorMessage("The uploaded file did not contain any usable data.");
        return;
      }

      setParsedFile(nextParsedFile);
      setSelectedSheetName(nextParsedFile.sheets[0]?.name ?? "");
    } catch (error) {
      setParsedFile(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The uploaded file could not be parsed."
      );
    }
  }

  function updateColumnMapping(field: ImportFieldKey, value: string) {
    setColumnMapping((current) => ({ ...current, [field]: value }));
  }

  function updateRowsForAccount(
    accountKey: string,
    patch: Partial<Record<"__manual_category" | "__manual_statement_type", string>>
  ) {
    if (!selectedSheet) {
      return;
    }

    setParsedFile((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        sheets: current.sheets.map((sheet) => {
          if (sheet.name !== selectedSheet.name) {
            return sheet;
          }

          return {
            ...sheet,
            rows: sheet.rows.map((row) => {
              const accountName = getCellValue(row, columnMapping.accountName);

              if (normalizeAccountName(accountName) !== accountKey) {
                return row;
              }

              return {
                ...row,
                ...patch
              };
            })
          };
        })
      };
    });
  }

  async function handleImport() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setImportSummary(null);

    const payload = {
      companyId: selectedCompanyId,
      periodId: periodFallbackMode === "existing" ? selectedPeriodId : "",
      createPeriod:
        periodFallbackMode === "new" && newPeriodLabel && newPeriodDate
          ? {
              label: newPeriodLabel,
              periodDate: newPeriodDate
            }
          : undefined,
      rows: previewRows.map((row) => ({
        accountName: row.accountName,
        amount: row.amountText,
        periodLabel: row.sourcePeriodLabel || null,
        periodDate: row.sourcePeriodDate || null,
        statementType: row.statementType || null,
        category: row.category || null,
        addbackFlag: parseBooleanFlag(row.addbackFlag),
        matchedBy: row.matchedBy,
        confidence: row.confidence,
        mappingExplanation: row.mappingExplanation
      }))
    };

    const response = await fetch("/api/financial-import", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = (await response.json()) as {
      error?: string;
      insertedCount?: number;
      rejectedRows?: Array<{ rowNumber: number; accountName: string; reason: string }>;
    };

    if (!response.ok) {
      setErrorMessage(result.error ?? "Import failed.");
      setImportSummary({
        insertedCount: result.insertedCount ?? 0,
        rejectedRows: Array.isArray(result.rejectedRows) ? result.rejectedRows : []
      });
      return;
    }

    const nextSummary = {
      insertedCount: result.insertedCount ?? 0,
      rejectedRows: Array.isArray(result.rejectedRows) ? result.rejectedRows : []
    };

    setImportSummary(nextSummary);
    setSuccessMessage(`Imported ${nextSummary.insertedCount} row(s) successfully.`);
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleMappingSaved() {
    if (!selectedCompanyId) {
      return;
    }

    setSuccessMessage("Mapping saved for future imports.");
    await loadCompanyContext(selectedCompanyId);
  }

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Upload financials</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload CSV or Excel, confirm structure, review account mappings, and import into the diligence workspace.
            </p>
          </div>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-700">
            Primary path
          </span>
        </div>
      </div>

      <div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Company
          </label>
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
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Source file
            </label>
            <input
              type="file"
              accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileUpload}
              disabled={!selectedCompanyId}
            />
            <p className="mt-2 text-xs text-slate-500">
              Supported formats: .csv and .xlsx. Saved mappings and review confidence will carry through to import.
            </p>
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
                {parsedFile.sheets.map((sheet) => (
                  <option key={sheet.name} value={sheet.name}>
                    {sheet.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      {setupMessage ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {setupMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          {successMessage}
        </div>
      ) : null}

      {selectedSheet ? (
        <div className="mt-5 space-y-5">
          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Step 1
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">
                  Confirm file structure
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Review the selected sheet, detected headers, and a sample of parsed rows before mapping.
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {parsedFile?.fileName} • {selectedSheet.rows.length} row(s)
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedSheet.headers.map((header) => (
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
                    {selectedSheet.headers.slice(0, 6).map((header) => (
                      <th
                        key={header}
                        className="px-3 py-2 text-left font-medium text-slate-500"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {selectedSheet.rows.slice(0, 8).map((row, index) => (
                    <tr key={`${selectedSheet.name}-${index}`}>
                      {selectedSheet.headers.slice(0, 6).map((header) => (
                        <td key={header} className="px-3 py-2 text-slate-700">
                          {row[header] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedSheet.rows.length > 8 ? (
              <p className="mt-3 text-sm text-slate-500">
                Showing the first 8 rows of {selectedSheet.rows.length}.
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Step 2
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">
                Map source columns
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Required fields are marked. Optional period columns help validate the uploaded file against the selected reporting period.
              </p>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {COLUMN_FIELDS.map((field) => (
                <ColumnSelect
                  key={field.key}
                  label={field.label}
                  value={columnMapping[field.key]}
                  options={selectedSheet.headers}
                  required={field.required}
                  onChange={(value) => updateColumnMapping(field.key, value)}
                />
              ))}
            </div>

            {sourcePeriodNotice ? (
              <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                {sourcePeriodNotice}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                Step 3
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-900">
                Confirm reporting periods
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                Auto-detected periods will be matched to existing reporting periods first and created automatically when missing.
              </p>
            </div>

            {detectedPeriods.periods.length > 0 ? (
              <div className="mt-4 space-y-3">
                {detectedPeriods.periods.map((period) => (
                  <div
                    key={period.key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {period.label}
                      </p>
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
                      {period.matchedPeriodId
                        ? `Matched to ${period.matchedPeriodLabel}`
                        : "Will auto-create"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                No usable period field was detected. Choose an existing period or create one inline for this import.
              </div>
            )}

            {detectedPeriods.periods.length === 0 ||
            detectedPeriods.unresolvedRows.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPeriodFallbackMode("existing")}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      periodFallbackMode === "existing"
                        ? "bg-ink text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    Assign existing period
                  </button>
                  <button
                    type="button"
                    onClick={() => setPeriodFallbackMode("new")}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                      periodFallbackMode === "new"
                        ? "bg-ink text-white"
                        : "bg-slate-100 text-slate-700"
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
                    <p className="mt-2 text-xs text-slate-500">
                      Use this only when a file has no period column, or when some rows still have missing period values.
                    </p>
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

                {detectedPeriods.unresolvedRows.length > 0 ? (
                  <p className="mt-3 text-xs text-slate-500">
                    Rows without a usable period: {detectedPeriods.unresolvedRows.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Step 4
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">
                  Review account mappings
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Fix unmapped or low-confidence accounts once, then apply the same mapping across all matching rows in this file.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  {previewStats.total} total
                </span>
                <span className="rounded-full bg-teal-100 px-3 py-1 text-teal-700">
                  {previewStats.ready} ready
                </span>
                {previewStats.needsReview > 0 ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                    {previewStats.needsReview} need review
                  </span>
                ) : null}
                {previewStats.lowConfidence > 0 ? (
                  <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                    {previewStats.lowConfidence} low confidence
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {accountReviewRows.map((row) => (
                <div
                  key={row.accountKey || `blank-${row.rowNumbers.join("-")}`}
                  className={`rounded-2xl border p-4 ${
                    row.hasConflict
                      ? "border-rose-200 bg-rose-50/60"
                      : row.needsReview
                        ? "border-amber-200 bg-amber-50/60"
                        : row.matchedBy === "saved_mapping"
                          ? "border-teal-200 bg-teal-50/60"
                          : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-slate-900">
                          {row.accountName || "Blank account name"}
                        </h4>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${matchedByClass(
                            row.matchedBy
                          )}`}
                        >
                          {formatMatchedBy(row.matchedBy)}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${confidenceClass(
                            row.confidence
                          )}`}
                        >
                          {formatConfidence(row.confidence)}
                        </span>
                        {row.hasConflict ? (
                          <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-800">
                            Conflicting mappings
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm text-slate-600">
                        {row.mappingExplanation}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                        <span>{row.rowCount} row(s) in this upload</span>
                        {row.sourcePeriodLabels.length > 0 ? (
                          <span>Labels: {row.sourcePeriodLabels.join(", ")}</span>
                        ) : null}
                        {row.sourcePeriodDates.length > 0 ? (
                          <span>Dates: {row.sourcePeriodDates.join(", ")}</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[28rem]">
                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                          Category
                        </label>
                        <select
                          value={row.category}
                          onChange={(event) =>
                            updateRowsForAccount(row.accountKey, {
                              __manual_category: event.target.value
                            })
                          }
                          className={
                            row.needsReview && !row.category
                              ? "border-amber-300 bg-amber-50"
                              : ""
                          }
                        >
                          <option value="">Review</option>
                          {CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                          Statement type
                        </label>
                        <select
                          value={row.statementType}
                          onChange={(event) =>
                            updateRowsForAccount(row.accountKey, {
                              __manual_statement_type: event.target.value
                            })
                          }
                          className={
                            row.needsReview && !row.statementType
                              ? "border-amber-300 bg-amber-50"
                              : ""
                          }
                        >
                          <option value="">Review</option>
                          {STATEMENT_TYPE_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span>Changes apply to all matching rows in this upload.</span>
                        <SaveMappingButton
                          companyId={selectedCompanyId || null}
                          accountName={row.accountName}
                          category={row.category}
                          statementType={row.statementType}
                          onSaved={handleMappingSaved}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                  Step 5
                </p>
                <h3 className="mt-1 text-base font-semibold text-slate-900">
                  Import preview
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Review the normalized rows that will feed the existing diligence workflow, then import.
                </p>
              </div>

              <button
                type="button"
                onClick={handleImport}
                disabled={
                  isPending ||
                  !selectedCompanyId ||
                  (detectedPeriods.periods.length === 0 &&
                    periodFallbackMode === "existing" &&
                    !selectedPeriodId) ||
                  ((detectedPeriods.periods.length === 0 ||
                    detectedPeriods.unresolvedRows.length > 0) &&
                    periodFallbackMode === "new" &&
                    (!newPeriodLabel || !newPeriodDate)) ||
                  previewRows.length === 0
                }
                className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {isPending ? "Importing..." : "Import rows"}
              </button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">
                      Row
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">
                      Account
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-slate-500">
                      Amount
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">
                      Category
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">
                      Statement
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {previewRows.slice(0, 12).map((row) => (
                    <tr
                      key={row.rowNumber}
                      className={
                        row.needsReview
                          ? "bg-amber-50"
                          : row.matchedBy === "saved_mapping"
                            ? "bg-teal-50/50"
                            : ""
                      }
                    >
                      <td className="px-3 py-2 text-slate-600">{row.rowNumber}</td>
                      <td className="px-3 py-2">
                        <div>
                          <p className="font-medium text-slate-900">
                            {row.accountName || "—"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {row.mappingExplanation}
                          </p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {row.amountText || "—"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.category || "Review"}
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {row.statementType || "Review"}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${matchedByClass(
                              row.matchedBy
                            )}`}
                          >
                            {formatMatchedBy(row.matchedBy)}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${confidenceClass(
                              row.confidence
                            )}`}
                          >
                            {formatConfidence(row.confidence)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewRows.length > 12 ? (
              <p className="mt-3 text-sm text-slate-500">
                Showing the first 12 rows of {previewRows.length}.
              </p>
            ) : null}

            {importSummary ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium">
                  Inserted rows: {importSummary.insertedCount}
                </p>
                <p className="mt-1 font-medium">
                  Rejected rows: {importSummary.rejectedRows.length}
                </p>
                {importSummary.rejectedRows.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-slate-600">
                    {importSummary.rejectedRows.map((row) => (
                      <li key={`${row.rowNumber}-${row.accountName}-${row.reason}`}>
                        Row {row.rowNumber}: {row.accountName || "Untitled row"} (
                        {row.reason})
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </section>
  );
}

type ColumnSelectProps = {
  label: string;
  value: string;
  options: string[];
  required?: boolean;
  onChange: (value: string) => void;
};

function ColumnSelect({
  label,
  value,
  options,
  required = false,
  onChange
}: ColumnSelectProps) {
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
