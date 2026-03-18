"use client";

import Papa from "papaparse";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  inferStatementTypeFromCategory,
  parseBooleanFlag,
  parseCategory,
  parseStatementType,
  suggestAccountMapping
} from "@/lib/auto-mapping";
import { getPreviewMappingMeta } from "@/lib/mapping-intelligence";
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

type ColumnMapping = {
  accountName: string;
  amount: string;
  statementType: string;
  category: string;
  addbackFlag: string;
};

type RawCsvRow = Record<string, unknown>;

type PreviewRow = {
  rowNumber: number;
  accountName: string;
  amount: string;
  statementType: string;
  category: string;
  addbackFlag: string;
  matchedBy: "saved_mapping" | "keyword" | "manual" | "csv_value";
  confidence: "high" | "medium" | "low";
  mappingExplanation: string;
  needsReview: boolean;
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

function guessColumn(headers: string[], candidates: string[]) {
  return (
    headers.find((header) =>
      candidates.some((candidate) => header.toLowerCase().includes(candidate))
    ) ?? ""
  );
}

function getCellValue(row: RawCsvRow, key: string) {
  if (!key) {
    return "";
  }

  const value = row[key];
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function getParsedHeaders(rows: RawCsvRow[], fields: string[]) {
  if (fields.length > 0) {
    return fields;
  }

  const firstRow = rows[0];
  return firstRow ? Object.keys(firstRow).filter((key) => key !== "__parsed_extra") : [];
}

function matchClass(value: PreviewRow["matchedBy"]) {
  if (value === "saved_mapping") return "bg-teal-100 text-teal-800";
  if (value === "keyword") return "bg-sky-100 text-sky-800";
  if (value === "csv_value") return "bg-violet-100 text-violet-800";
  return "bg-amber-100 text-amber-800";
}

function confidenceClass(value: PreviewRow["confidence"]) {
  if (value === "high") return "bg-teal-100 text-teal-800";
  if (value === "medium") return "bg-sky-100 text-sky-800";
  return "bg-amber-100 text-amber-800";
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
  const [savedMappings, setSavedMappings] = useState<AccountMapping[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<RawCsvRow[]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({
    accountName: "",
    amount: "",
    statementType: "",
    category: "",
    addbackFlag: ""
  });
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
        setErrorMessage(
          "CSV import periods could not be loaded. Refresh and try again."
        );
      }
    } catch {
      setPeriods([]);
      setSelectedPeriodId("");
      setSavedMappings([]);
      setErrorMessage(
        "CSV import setup data could not be loaded right now. Refresh and try again."
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

  const previewRows = useMemo<PreviewRow[]>(() => {
    return rows.map((row, index) => {
      const accountName = getCellValue(row, columnMapping.accountName);
      const amount = getCellValue(row, columnMapping.amount);
      const manualCategory = parseCategory(getCellValue(row, "__manual_category"));
      const manualStatementType = parseStatementType(
        getCellValue(row, "__manual_statement_type")
      );
      const csvCategory = parseCategory(getCellValue(row, columnMapping.category));
      const csvStatementType = parseStatementType(
        getCellValue(row, columnMapping.statementType)
      );
      const suggestion = suggestAccountMapping(accountName, savedMappings);
      const category = manualCategory ?? csvCategory ?? suggestion.category ?? null;
      const statementType =
        manualStatementType ??
        csvStatementType ??
        suggestion.statementType ??
        inferStatementTypeFromCategory(category) ??
        null;
      const mappingMeta = getPreviewMappingMeta({
        accountName,
        category,
        statementType,
        savedMappings,
        hasCsvValues: Boolean(csvCategory || csvStatementType),
        hasManualOverride: Boolean(manualCategory || manualStatementType)
      });
      const needsReview =
        !accountName ||
        !amount ||
        !Number.isFinite(Number(amount)) ||
        !category ||
        !statementType ||
        mappingMeta.confidence === "low";

      return {
        rowNumber: index + 1,
        accountName,
        amount,
        statementType: statementType ?? "",
        category: category ?? "",
        addbackFlag:
          getCellValue(row, "__manual_addback_flag") ||
          getCellValue(row, columnMapping.addbackFlag),
        matchedBy: mappingMeta.matchedBy,
        confidence: mappingMeta.confidence,
        mappingExplanation: mappingMeta.explanation,
        needsReview
      };
    });
  }, [columnMapping, rows, savedMappings]);

  function updatePreviewRow(
    rowNumber: number,
    field: "category" | "statementType",
    value: string
  ) {
    setRows((currentRows) =>
      currentRows.map((row, index) => {
        if (index !== rowNumber - 1) {
          return row;
        }

        if (field === "category") {
          return {
            ...row,
            __manual_category: value
          };
        }

        return {
          ...row,
          __manual_statement_type: value
        };
      })
    );
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setErrorMessage(null);
    setSuccessMessage(null);
    setImportSummary(null);

    Papa.parse<RawCsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      complete: (results) => {
        const parsedRows = results.data.filter((row) => {
          const rowValues = Object.entries(row)
            .filter(([key]) => key !== "__parsed_extra")
            .map(([, value]) => String(value ?? "").trim());

          return rowValues.some((value) => value.length > 0);
        });
        const parsedFields = (results.meta.fields ?? []).filter(
          (field): field is string => Boolean(field)
        );
        const nextHeaders = getParsedHeaders(parsedRows, parsedFields);

        if (parsedRows.length === 0 || nextHeaders.length === 0) {
          setHeaders([]);
          setRows([]);
          setErrorMessage(
            "The CSV was parsed but no usable columns or rows were found."
          );
          return;
        }

        setHeaders(nextHeaders);
        setRows(parsedRows);
        setColumnMapping({
          accountName: guessColumn(nextHeaders, ["account", "name", "description"]),
          amount: guessColumn(nextHeaders, ["amount", "value", "balance"]),
          statementType: guessColumn(nextHeaders, ["statement", "type"]),
          category: guessColumn(nextHeaders, ["category", "class"]),
          addbackFlag: guessColumn(nextHeaders, ["addback", "add-back"])
        });
      },
      error: () => {
        setErrorMessage("The CSV could not be parsed. Please check the file format.");
      }
    });
  }

  async function handleImport() {
    setErrorMessage(null);
    setSuccessMessage(null);
    setImportSummary(null);

    const payload = {
      companyId: selectedCompanyId,
      periodId: selectedPeriodId,
      rows: previewRows.map((row) => ({
        accountName: row.accountName,
        amount: row.amount,
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
        <h2 className="text-lg font-semibold text-slate-900">CSV import</h2>
        <p className="mt-1 text-sm text-slate-500">
          Upload a CSV, map its columns, and preview the parsed financial rows.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
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

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Reporting period
          </label>
          <select
            value={selectedPeriodId}
            onChange={(event) => setSelectedPeriodId(event.target.value)}
            disabled={!selectedCompanyId}
          >
            <option value="">Select period</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <label className="mb-1 block text-sm font-medium text-slate-700">
          CSV file
        </label>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileUpload}
          disabled={!selectedCompanyId || !selectedPeriodId}
        />
      </div>

      {headers.length > 0 && rows.length > 0 ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <ColumnSelect
            label="Account name"
            value={columnMapping.accountName}
            options={headers}
            onChange={(value) =>
              setColumnMapping((current) => ({ ...current, accountName: value }))
            }
          />
          <ColumnSelect
            label="Amount"
            value={columnMapping.amount}
            options={headers}
            onChange={(value) =>
              setColumnMapping((current) => ({ ...current, amount: value }))
            }
          />
          <ColumnSelect
            label="Statement type"
            value={columnMapping.statementType}
            options={headers}
            allowBlank
            onChange={(value) =>
              setColumnMapping((current) => ({ ...current, statementType: value }))
            }
          />
          <ColumnSelect
            label="Category"
            value={columnMapping.category}
            options={headers}
            allowBlank
            onChange={(value) =>
              setColumnMapping((current) => ({ ...current, category: value }))
            }
          />
          <ColumnSelect
            label="Add-back flag"
            value={columnMapping.addbackFlag}
            options={headers}
            allowBlank
            onChange={(value) =>
              setColumnMapping((current) => ({ ...current, addbackFlag: value }))
            }
          />
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

      {previewRows.length > 0 ? (
        <div className="mt-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Preview rows
              </h3>
              <p className="text-sm text-slate-500">
                Review matched rows, save confirmed mappings, and correct anything flagged before importing.
              </p>
            </div>
            <button
              type="button"
              onClick={handleImport}
              disabled={
                isPending ||
                !selectedCompanyId ||
                !selectedPeriodId ||
                previewRows.length === 0
              }
              className="rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {isPending ? "Importing..." : "Import rows"}
            </button>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200">
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
                    Match
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    Confidence
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {previewRows.slice(0, 15).map((row) => (
                  <tr
                    key={row.rowNumber}
                    className={
                      row.needsReview
                        ? "bg-amber-50"
                        : row.matchedBy === "saved_mapping"
                          ? "bg-teal-50/60"
                          : ""
                    }
                  >
                    <td className="px-3 py-2 text-slate-600">{row.rowNumber}</td>
                    <td className="px-3 py-2">
                      <div>
                        <p className="font-medium text-slate-900">
                          {row.accountName || "-"}
                        </p>
                        <p
                          className="mt-1 text-xs text-slate-500"
                          title={row.mappingExplanation}
                        >
                          {row.mappingExplanation}
                        </p>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {row.amount || "-"}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.category}
                        onChange={(event) =>
                          updatePreviewRow(row.rowNumber, "category", event.target.value)
                        }
                        className={row.needsReview && !row.category ? "border-amber-300 bg-amber-50" : ""}
                      >
                        <option value="">Review</option>
                        {CATEGORY_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.statementType}
                        onChange={(event) =>
                          updatePreviewRow(
                            row.rowNumber,
                            "statementType",
                            event.target.value
                          )
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
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${matchClass(row.matchedBy)}`}
                      >
                        {row.matchedBy.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${confidenceClass(row.confidence)}`}
                      >
                        {row.confidence}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <SaveMappingButton
                        companyId={selectedCompanyId || null}
                        accountName={row.accountName}
                        category={row.category}
                        statementType={row.statementType}
                        onSaved={handleMappingSaved}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-teal-100 px-2 py-1 text-teal-800">
              saved mapping
            </span>
            <span className="rounded-full bg-sky-100 px-2 py-1 text-sky-800">
              keyword
            </span>
            <span className="rounded-full bg-violet-100 px-2 py-1 text-violet-800">
              csv value
            </span>
            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
              manual or low confidence
            </span>
          </div>

          {previewRows.length > 15 ? (
            <p className="mt-3 text-sm text-slate-500">
              Showing the first 15 rows of {previewRows.length} parsed rows.
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
                      Row {row.rowNumber}: {row.accountName || "Untitled row"} ({row.reason})
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

type ColumnSelectProps = {
  label: string;
  value: string;
  options: string[];
  allowBlank?: boolean;
  onChange: (value: string) => void;
};

function ColumnSelect({
  label,
  value,
  options,
  allowBlank = false,
  onChange
}: ColumnSelectProps) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allowBlank ? "Not provided" : "Select column"}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
