"use client";

import { useEffect, useMemo, useState } from "react";

type TaxSourceDrawerProps = {
  isOpen: boolean;
  mode: "add" | "manage";
  companyId: string;
  reportedPeriodId: string;
  reportedPeriodLabel: string | null;
  reportedPeriodDate: string | null;
  taxSourcePeriodId: string | null;
  onClose: () => void;
  onSaved: () => void;
};

type DrawerLineItem = {
  id: string;
  accountName: string;
  amount: string;
};

type MappingPreviewRow = {
  accountName: string;
  mappedCategory: string;
  confidence: "high" | "medium" | "low";
  mappingMethod: string;
  mappingSource?: string;
  flags: string[];
};

type ExistingTaxSourceResponse = {
  data?: {
    sourceType: "tax_return";
    periods: Array<{
      id: string;
      label: string;
      period_date: string;
      source_period_label: string | null;
      source_year: number | null;
      source_file_name: string | null;
      source_currency: string | null;
    }>;
    entries: Array<{
      id: string;
      account_name: string;
      amount: number;
      source_period_id: string;
    }>;
  };
  error?: string;
};

const STARTER_ROW_LABELS = [
  "Gross receipts",
  "Returns and allowances",
  "Cost of goods sold",
  "Officer compensation",
  "Salaries and wages",
  "Rent",
  "Depreciation",
  "Interest",
  "Meals",
  "Other deductions"
];

function buildStarterRows(): DrawerLineItem[] {
  return STARTER_ROW_LABELS.map((accountName, index) => ({
    id: `starter-${index}`,
    accountName,
    amount: ""
  }));
}

function nextRowId() {
  return `row-${Math.random().toString(36).slice(2, 10)}`;
}

function formatDefaultSourceFileName(periodDate: string | null, sourceYear: number) {
  if (periodDate) {
    return `${periodDate}-manual-tax.json`;
  }

  return `${sourceYear}-manual-tax.json`;
}

function formatDefaultPeriodLabel(params: {
  reportedPeriodLabel: string | null;
  sourceYear: number;
}) {
  if (params.reportedPeriodLabel?.trim()) {
    return params.reportedPeriodLabel.trim();
  }

  return `FY${params.sourceYear}`;
}

function normalizePreviewLabel(value: string) {
  return value.trim().toLowerCase();
}

function getPreviewCategoryLabel(row: MappingPreviewRow) {
  const normalizedAccountName = normalizePreviewLabel(row.accountName);
  const normalizedCategory = normalizePreviewLabel(row.mappedCategory);

  if (
    normalizedAccountName === "returns and allowances" &&
    normalizedCategory === "revenue"
  ) {
    return "Revenue (contra)";
  }

  if (
    normalizedAccountName === "interest" &&
    normalizedCategory === "non-operating"
  ) {
    return "Non-operating expense";
  }

  return row.mappedCategory;
}

function getPreviewFlagLabel(flag: string) {
  if (flag === "Ambiguous bucket") {
    return "Broad classification";
  }

  return flag;
}

function getMappingSourceLabel(mappingSource: string | undefined) {
  if (!mappingSource) {
    return null;
  }

  if (mappingSource === "company_memory" || mappingSource === "shared_memory") {
    return "memory";
  }

  if (mappingSource === "rule_engine") {
    return "rule";
  }

  if (mappingSource === "fallback") {
    return "fallback";
  }

  return null;
}

export function TaxSourceDrawer({
  isOpen,
  mode,
  companyId,
  reportedPeriodId,
  reportedPeriodLabel,
  reportedPeriodDate,
  taxSourcePeriodId,
  onClose,
  onSaved
}: TaxSourceDrawerProps) {
  const defaultYear = useMemo(() => {
    const parsedYear = reportedPeriodDate
      ? Number.parseInt(reportedPeriodDate.slice(0, 4), 10)
      : Number.NaN;
    return Number.isFinite(parsedYear) ? parsedYear : new Date().getFullYear();
  }, [reportedPeriodDate]);

  const [sourceFileName, setSourceFileName] = useState(
    formatDefaultSourceFileName(reportedPeriodDate, defaultYear)
  );
  const [sourcePeriodLabel, setSourcePeriodLabel] = useState(
    reportedPeriodLabel ?? `Tax Year ${defaultYear}`
  );
  const [periodEndDate, setPeriodEndDate] = useState(reportedPeriodDate ?? "");
  const [sourceYear, setSourceYear] = useState(String(defaultYear));
  const [sourceCurrency, setSourceCurrency] = useState("USD");
  const [lineItems, setLineItems] = useState<DrawerLineItem[]>(buildStarterRows());
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<MappingPreviewRow[] | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setErrorMessage(null);
    setSourceFileName(formatDefaultSourceFileName(reportedPeriodDate, defaultYear));
    setSourcePeriodLabel(reportedPeriodLabel ?? `Tax Year ${defaultYear}`);
    setPeriodEndDate(reportedPeriodDate ?? "");
    setSourceYear(String(defaultYear));
    setSourceCurrency("USD");
    setLineItems(buildStarterRows());
    setPreviewRows(null);
    setPreviewError(null);
  }, [defaultYear, isOpen, reportedPeriodDate, reportedPeriodLabel]);

  useEffect(() => {
    if (!isOpen || !taxSourcePeriodId) {
      return;
    }

    const resolvedTaxSourcePeriodId = taxSourcePeriodId;

    let cancelled = false;

    async function loadExistingTaxSource() {
      setIsLoadingExisting(true);

      try {
        const response = await fetch(
          `/api/source-financials?companyId=${encodeURIComponent(companyId)}&sourceType=tax_return&sourcePeriodId=${encodeURIComponent(resolvedTaxSourcePeriodId)}`,
          { cache: "no-store" }
        );

        const payload = (await response.json()) as ExistingTaxSourceResponse;

        if (!response.ok || !payload.data) {
          throw new Error(payload.error || "Existing tax source could not be loaded.");
        }

        if (cancelled) {
          return;
        }

        const period = payload.data.periods[0] ?? null;
        const entries = payload.data.entries
          .filter((entry) => entry.source_period_id === resolvedTaxSourcePeriodId)
          .map((entry, index) => ({
            id: `existing-${index}-${entry.id}`,
            accountName: entry.account_name,
            amount: String(entry.amount)
          }));

        if (period) {
          setSourceFileName(
            period.source_file_name ??
              formatDefaultSourceFileName(period.period_date, period.source_year ?? defaultYear)
          );
          setSourcePeriodLabel(
            period.source_period_label ?? reportedPeriodLabel ?? `Tax Year ${defaultYear}`
          );
          setPeriodEndDate(period.period_date);
          setSourceYear(String(period.source_year ?? defaultYear));
          setSourceCurrency(period.source_currency ?? "USD");
        }

        setLineItems(entries.length > 0 ? entries : buildStarterRows());
        setPreviewRows(null);
        setPreviewError(null);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Existing tax source could not be loaded."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingExisting(false);
        }
      }
    }

    void loadExistingTaxSource();

    return () => {
      cancelled = true;
    };
  }, [companyId, defaultYear, isOpen, reportedPeriodLabel, taxSourcePeriodId]);

  if (!isOpen) {
    return null;
  }

  function addRow() {
    setLineItems((current) => [...current, { id: nextRowId(), accountName: "", amount: "" }]);
  }

  function updateRow(id: string, field: "accountName" | "amount", value: string) {
    setLineItems((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
    setPreviewRows(null);
    setPreviewError(null);
  }

  function removeRow(id: string) {
    setLineItems((current) => current.filter((row) => row.id !== id));
    setPreviewRows(null);
    setPreviewError(null);
  }

  async function handlePreview() {
    setPreviewError(null);

    const parsedYear = Number.parseInt(sourceYear, 10);
    const submittedRows = lineItems.filter(
      (row) => row.accountName.trim() !== "" || row.amount.trim() !== ""
    );

    if (submittedRows.length === 0) {
      setPreviewError("Add at least one tax line item to preview mapping.");
      setPreviewRows(null);
      return;
    }

    const invalidRow = submittedRows.find(
      (row) => !row.accountName.trim() || !Number.isFinite(Number(row.amount))
    );

    if (invalidRow) {
      setPreviewError("Each preview row requires an account name and numeric amount.");
      setPreviewRows(null);
      return;
    }

    setIsPreviewing(true);

    try {
      const response = await fetch("/api/source-financials/manual-tax-preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          companyId,
          sourceType: "tax_return",
          periods: [
            {
              label: formatDefaultPeriodLabel({
                reportedPeriodLabel,
                sourceYear: Number.isFinite(parsedYear) ? parsedYear : defaultYear
              }),
              periodDate: periodEndDate.trim() || reportedPeriodDate || "",
              sourcePeriodLabel: sourcePeriodLabel.trim() || null,
              sourceYear: Number.isFinite(parsedYear) ? parsedYear : null,
              entries: submittedRows.map((row) => ({
                accountName: row.accountName.trim(),
                amount: Number(row.amount)
              }))
            }
          ]
        })
      });

      const payload = (await response.json()) as {
        data?: MappingPreviewRow[];
        error?: string;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "Mapping preview could not be generated.");
      }

      setPreviewRows(payload.data);
    } catch (error) {
      setPreviewError(
        error instanceof Error ? error.message : "Mapping preview could not be generated."
      );
      setPreviewRows(null);
    } finally {
      setIsPreviewing(false);
    }
  }

  async function handleSave() {
    setErrorMessage(null);

    const trimmedDate = periodEndDate.trim();
    const parsedYear = Number.parseInt(sourceYear, 10);
    const submittedRows = lineItems.filter(
      (row) => row.accountName.trim() !== "" || row.amount.trim() !== ""
    );

    if (!trimmedDate) {
      setErrorMessage("Period end date is required.");
      return;
    }

    if (!Number.isFinite(parsedYear)) {
      setErrorMessage("Source year is required.");
      return;
    }

    if (submittedRows.length === 0) {
      setErrorMessage("At least one tax line item is required.");
      return;
    }

    const invalidRow = submittedRows.find(
      (row) => !row.accountName.trim() || !Number.isFinite(Number(row.amount))
    );

    if (invalidRow) {
      setErrorMessage("Each submitted row requires an account name and numeric amount.");
      return;
    }

    setIsSaving(true);

    try {
      const payload = {
        companyId,
        sourceType: "tax_return" as const,
        sourceFileName: sourceFileName.trim() || null,
        uploadId: `manual-tax-${companyId}-${reportedPeriodId}`,
        sourceCurrency: sourceCurrency.trim() || null,
        periods: [
          {
            label: formatDefaultPeriodLabel({
              reportedPeriodLabel,
              sourceYear: parsedYear
            }),
            periodDate: trimmedDate,
            sourcePeriodLabel: sourcePeriodLabel.trim() || null,
            sourceYear: parsedYear,
            entries: submittedRows.map((row) => ({
              accountName: row.accountName.trim(),
              amount: Number(row.amount)
            }))
          }
        ]
      };

      const response = await fetch("/api/source-financials/manual-tax-ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Tax source could not be saved.");
      }

      onSaved();
      onClose();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Tax source could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35">
      <button
        type="button"
        aria-label="Close tax source drawer"
        className="flex-1"
        onClick={onClose}
      />
      <aside className="h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white px-6 py-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
              Tax source
            </p>
            <h3 className="mt-2 text-2xl font-semibold text-slate-900">
              {mode === "manage" ? "Manage tax source" : "Add tax source"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Enter tax return line items for the selected period.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3.5">
          {mode === "manage" ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-600">
              Saving re-submits this period through the isolated tax pipeline and updates matching rows.
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Source file name
              </label>
              <input
                value={sourceFileName}
                onChange={(event) => setSourceFileName(event.target.value)}
                placeholder="2023-1120-manual.json"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Source period label
              </label>
              <input
                value={sourcePeriodLabel}
                onChange={(event) => setSourcePeriodLabel(event.target.value)}
                placeholder="Tax Year 2023"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Period end date
              </label>
              <input
                required
                type="date"
                value={periodEndDate}
                onChange={(event) => setPeriodEndDate(event.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Source year
              </label>
              <input
                required
                type="number"
                value={sourceYear}
                onChange={(event) => setSourceYear(event.target.value)}
                placeholder="2023"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Source currency
              </label>
              <input
                value={sourceCurrency}
                onChange={(event) => setSourceCurrency(event.target.value)}
                placeholder="USD"
              />
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h4 className="text-base font-semibold text-slate-900">Line items</h4>
                <p className="mt-0.5 text-sm text-slate-500">
                  Raw tax return labels and amounts.
                </p>
              </div>
              <button
                type="button"
                onClick={addRow}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Add row
              </button>
            </div>

            {isLoadingExisting ? (
              <div className="px-4 py-4 text-sm text-slate-500">Loading tax source...</div>
            ) : (
              <div className="space-y-2 px-4 py-3">
                {lineItems.map((row) => (
                  <div
                    key={row.id}
                    className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 md:grid-cols-[1fr_160px_84px]"
                  >
                    <div>
                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                        Account name
                      </label>
                      <input
                        value={row.accountName}
                        onChange={(event) =>
                          updateRow(row.id, "accountName", event.target.value)
                        }
                        placeholder="Gross receipts"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">
                        Amount
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={row.amount}
                        onChange={(event) => updateRow(row.id, "amount", event.target.value)}
                        placeholder="1000000"
                        className="text-right tabular-nums"
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        disabled={lineItems.length === 1}
                        className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <h4 className="text-base font-semibold text-slate-900">Mapping Preview</h4>
            </div>
            <div className="px-4 py-3">
              {previewRows && previewRows.length > 0 ? (
                <div className="space-y-2">
                  {previewRows.map((row, index) => (
                    <div
                      key={`${row.accountName}-${index}`}
                      className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 lg:grid-cols-[1.15fr_20px_1fr_auto]"
                    >
                      <p className="truncate text-sm font-medium text-slate-900">
                        {row.accountName}
                      </p>
                      <p className="text-sm text-slate-400">→</p>
                      <p className="truncate text-sm text-slate-700">
                        {getPreviewCategoryLabel(row)}
                      </p>
                      <div className="flex flex-wrap gap-1.5 lg:justify-end">
                        {getMappingSourceLabel(row.mappingSource) ? (
                          <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                            {getMappingSourceLabel(row.mappingSource)}
                          </span>
                        ) : null}
                        <span className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700">
                          {row.confidence === "high"
                            ? "High confidence"
                            : row.confidence === "medium"
                              ? "Medium confidence"
                              : "Low confidence"}
                        </span>
                        {row.flags.map((flag) => (
                          <span
                            key={`${row.accountName}-${flag}`}
                            className="whitespace-nowrap rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700"
                          >
                            {getPreviewFlagLabel(flag)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : previewError ? (
                <p className="text-sm text-rose-700">{previewError}</p>
              ) : (
                <p className="text-sm text-slate-500">
                  Preview mapping to inspect how entered tax lines will be interpreted.
                </p>
              )}
            </div>
          </section>

          {errorMessage ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {errorMessage}
            </div>
          ) : null}

          <div className="sticky bottom-0 flex flex-col-reverse gap-3 border-t border-slate-200 bg-white pt-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handlePreview()}
              disabled={isPreviewing || isLoadingExisting}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {isPreviewing ? "Previewing..." : "Preview mapping"}
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving || isLoadingExisting}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
            >
              {isSaving ? "Saving..." : "Save tax source"}
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
