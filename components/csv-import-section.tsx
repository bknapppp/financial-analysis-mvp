"use client";

import {
  Fragment,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useTransition
} from "react";
import { useRouter } from "next/navigation";
import { normalizeAccountName, parseBooleanFlag } from "@/lib/auto-mapping";
import {
  buildImportAccountReviewRows,
  buildGroupedImportPreviewRows,
  buildImportPreviewRows,
  isNonBlockingDerivedLabel
} from "@/lib/import-mapping";
import {
  buildInitialColumnMapping,
  getCellValue,
  parseImportFile,
  type ImportColumnMapping,
  type ImportFieldKey,
  type ParsedImportFile,
  type ParsedImportSheet
} from "@/lib/import-preview";
import { deriveWorkbookContext, type WorkbookContext } from "@/lib/workbook-context";
import {
  detectImportPeriods,
  matchDetectedPeriodsToExisting,
  normalizeImportedPeriod
} from "@/lib/import-periods";
import {
  deriveWorkbookFixIts,
  type WorkbookFixItTask
} from "@/lib/workbook-fix-its";
import { devLog } from "@/lib/debug";
import type {
  AccountMapping,
  Company,
  NormalizedCategory,
  ReportingPeriod,
  StatementType
} from "@/lib/types";
import { SaveMappingButton } from "@/components/save-mapping-button";
import { StepBasedImportFlow } from "@/components/step-based-import-flow";

type CsvImportSectionProps = {
  companies: Company[];
  initialCompanyId: string | null;
  initialPeriods: ReportingPeriod[];
  companySetupSlot?: ReactNode;
  advancedToolsSlot?: ReactNode;
};

type PreviewFilter =
  | "all"
  | "review_required"
  | "unmapped"
  | "low_confidence"
  | "saved_mapping"
  | "rule_based";

type ImportSummaryState = {
  insertedCount: number;
  rejectedRows: Array<{ rowNumber: number; accountName: string; reason: string }>;
  autoMappedRows: number;
  rowsNeedingReview: number;
  missingCriticalCategories: string[];
  workbookFollowUps: string[];
  workbookFixIts: WorkbookFixItTask[];
  nextActions: string[];
  workbookContext: WorkbookContext | null;
};

type SheetPreviewRow = {
  rowNumber: number;
  primaryLabel: string;
  values: string[];
  isLikelyFinancialLine: boolean;
  mappingSuggestion: string | null;
  suggestionStrength: "saved" | "rule_based" | "source" | "review";
  reviewStatus: "mapped" | "low_confidence" | "unmapped" | "not_parsed";
};

const CATEGORY_OPTIONS: NormalizedCategory[] = [
  "Revenue",
  "COGS",
  "Gross Profit",
  "Operating Expenses",
  "Depreciation / Amortization",
  "EBITDA",
  "Operating Income",
  "Pre-tax",
  "Net Income",
  "Tax Expense",
  "Non-operating",
  "current_assets.cash",
  "current_assets.accounts_receivable",
  "current_assets.inventory",
  "non_current_assets.ppe",
  "current_liabilities.accounts_payable",
  "current_liabilities.short_term_debt",
  "non_current_liabilities.long_term_debt",
  "equity.common_stock",
  "equity.retained_earnings",
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
  if (value === "memory") return "bg-emerald-100 text-emerald-800";
  if (value === "saved_mapping") return "bg-teal-100 text-teal-800";
  if (value === "keyword") return "bg-sky-100 text-sky-800";
  if (value === "csv_value") return "bg-violet-100 text-violet-800";
  return "bg-amber-100 text-amber-800";
}

function memoryScopeText(value: "company" | "global" | "shared" | null | undefined) {
  if (value === "company") return "From Saved Mapping (Company)";
  if (value === "shared") return "From Saved Mapping (Shared)";
  if (value === "global") return "From Saved Mapping (Global)";
  return "From Saved Mapping";
}

function memoryScopeDetail(value: "company" | "global" | "shared" | null | undefined) {
  if (value === "company") {
    return "Previously confirmed mapping for this company";
  }

  if (value === "shared") {
    return "Previously confirmed mapping shared across companies";
  }

  if (value === "global") {
    return "Previously confirmed mapping used across companies";
  }

  return "Previously confirmed saved mapping";
}

function confidenceClass(value: string) {
  if (value === "high") return "bg-teal-100 text-teal-800";
  if (value === "medium") return "bg-amber-100 text-amber-800";
  return "bg-rose-100 text-rose-800";
}

function formatMatchedBy(
  value: string,
  memoryScope?: "company" | "global" | "shared" | null
) {
  if (value === "memory") return memoryScopeText(memoryScope);
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
  if (status === "Confirmed") return "bg-teal-100 text-teal-800";
  if (status === "Saved Mapping") return "bg-emerald-100 text-emerald-800";
  if (status === "Rule-Based") return "bg-sky-100 text-sky-800";
  if (status === "Low Confidence") return "bg-rose-100 text-rose-800";
  if (status === "Unmapped") return "bg-rose-100 text-rose-800";
  return "bg-amber-100 text-amber-800";
}

function isParentBalanceSheetCategory(value: string) {
  return [
    "Assets",
    "Liabilities",
    "Equity",
    "current_assets",
    "non_current_assets",
    "current_liabilities",
    "non_current_liabilities",
    "equity"
  ].includes(value);
}

function buildCanonicalPreviewPeriod(params: {
  periodLabel: string;
  periodDate: string;
}) {
  const normalized = normalizeImportedPeriod({
    periodLabel: params.periodLabel,
    periodDate: params.periodDate
  });

  if (normalized) {
    return {
      key: normalized.key,
      label: normalized.label,
      periodDate: normalized.periodDate
    };
  }

  return {
    key: `${params.periodDate || ""}::${params.periodLabel || ""}`,
    label: params.periodLabel || "Unlabeled period",
    periodDate: params.periodDate || ""
  };
}

function summarizeMissingCriticalCategories(groupedRows: Array<{
  category: string;
  isExcluded?: boolean;
}>) {
  const includedCategories = new Set(
    groupedRows
      .filter((row) => !row.isExcluded)
      .map((row) => row.category)
      .filter(Boolean)
  );
  const missing: string[] = [];

  if (!includedCategories.has("Revenue")) {
    missing.push("Revenue");
  }

  if (!includedCategories.has("COGS")) {
    missing.push("COGS");
  }

  if (!includedCategories.has("Operating Expenses")) {
    missing.push("Operating Expenses");
  }

  const hasAssets = Array.from(includedCategories).some((category) =>
    [
      "Assets",
      "current_assets",
      "non_current_assets"
    ].includes(category) || category.startsWith("current_assets.") || category.startsWith("non_current_assets.")
  );
  const hasLiabilities = Array.from(includedCategories).some((category) =>
    [
      "Liabilities",
      "current_liabilities",
      "non_current_liabilities"
    ].includes(category) || category.startsWith("current_liabilities.") || category.startsWith("non_current_liabilities.")
  );
  const hasEquity = Array.from(includedCategories).some((category) =>
    ["Equity", "equity"].includes(category) || category.startsWith("equity.")
  );

  if (!hasAssets || !hasLiabilities || !hasEquity) {
    missing.push("Balance sheet components");
  }

  return missing;
}

function buildSheetPreviewRows(params: {
  selectedSheet: ParsedImportSheet | null;
  structurePreviewHeaders: string[];
  structurePreviewRows: Array<Record<string, string>>;
  previewRows: Array<{
    rowNumber: number;
    accountName: string;
    category: string;
    statementType: string;
    matchedBy: string;
    confidence: string;
  }>;
}) {
  const { selectedSheet, structurePreviewHeaders, structurePreviewRows, previewRows } = params;
  const previewByRowNumber = new Map(previewRows.map((row) => [row.rowNumber, row]));
  const likelyLineItemRows = new Set(selectedSheet?.analysis.likelyLineItemRowNumbers ?? []);

  return structurePreviewRows.slice(0, 25).map<SheetPreviewRow>((row, index) => {
    const rowNumber = index + 1;
    const parsedRow = previewByRowNumber.get(rowNumber) ?? null;
    const primaryLabel =
      structurePreviewHeaders
        .map((header) => row[header] ?? "")
        .find((value) => value.trim().length > 0) ?? `Row ${rowNumber}`;

    const reviewStatus: SheetPreviewRow["reviewStatus"] = !parsedRow
      ? "not_parsed"
      : !parsedRow.category || !parsedRow.statementType
        ? "unmapped"
        : parsedRow.confidence === "low"
          ? "low_confidence"
          : "mapped";

    const suggestionStrength: SheetPreviewRow["suggestionStrength"] = !parsedRow
      ? "review"
      : parsedRow.matchedBy === "memory" || parsedRow.matchedBy === "saved_mapping"
        ? "saved"
        : parsedRow.matchedBy === "keyword" || parsedRow.matchedBy === "keyword_rule"
          ? "rule_based"
          : parsedRow.matchedBy === "csv_value"
            ? "source"
            : "review";

    const mappingSuggestion = !parsedRow
      ? null
      : parsedRow.category && parsedRow.statementType
        ? `${parsedRow.category} • ${parsedRow.statementType}`
        : "Needs mapping review";

    return {
      rowNumber,
      primaryLabel,
      values: structurePreviewHeaders.slice(0, 5).map((header) => row[header] || "—"),
      isLikelyFinancialLine: likelyLineItemRows.has(rowNumber) || Boolean(parsedRow?.accountName),
      mappingSuggestion,
      suggestionStrength,
      reviewStatus
    };
  });
}

export function CsvImportSection({
  companies,
  initialCompanyId,
  initialPeriods,
  companySetupSlot,
  advancedToolsSlot
}: CsvImportSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [expandedPreviewAccountKey, setExpandedPreviewAccountKey] = useState<string | null>(
    null
  );
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const [reviewMode, setReviewMode] = useState(false);
  const [excludedAccountKeys, setExcludedAccountKeys] = useState<string[]>([]);
  const [nonBlockingOverrides, setNonBlockingOverrides] = useState<Record<string, boolean>>(
    {}
  );
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
  const [importSummary, setImportSummary] = useState<ImportSummaryState | null>(null);

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

  useEffect(() => {
    if (!parsedFile) {
      setActiveStep(1);
      setExcludedAccountKeys([]);
      setNonBlockingOverrides({});
      return;
    }

    if (activeStep === 1) {
      setActiveStep(2);
    }
  }, [activeStep, parsedFile]);

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
  const workbookContext = useMemo<WorkbookContext | null>(
    () => (parsedFile ? deriveWorkbookContext(parsedFile.sheets) : null),
    [parsedFile]
  );
  const sheetSelectionCards = useMemo(
    () =>
      parsedFile?.sheets.map((sheet) => ({
        name: sheet.name,
        rowCount: sheet.rows.length,
        classification: sheet.analysis.classification,
        periodDetection: sheet.analysis.periodDetection,
        columnStructure: sheet.analysis.columnStructure,
        lineItemHints: sheet.analysis.likelyFinancialLineItemHints,
        workbookRole:
          workbookContext?.primaryIncomeStatementSheetName === sheet.name
            ? ("primary_income_statement" as const)
            : workbookContext?.primaryBalanceSheetSheetName === sheet.name
              ? ("primary_balance_sheet" as const)
              : workbookContext?.primaryCashFlowSheetName === sheet.name
                ? ("primary_cash_flow" as const)
                : workbookContext?.ambiguousSheetNames.includes(sheet.name)
                  ? ("ambiguous" as const)
                  : workbookContext?.supportingSheetNames.includes(sheet.name)
                    ? ("supporting" as const)
                    : ("other" as const),
        workbookReason: workbookContext?.selectionReasons[sheet.name] ?? null
      })) ?? [],
    [parsedFile, workbookContext]
  );
  const workbookFixIts = useMemo(
    () =>
      deriveWorkbookFixIts({
        workbookContext,
        companyId: selectedCompanyId || null
      }),
    [selectedCompanyId, workbookContext]
  );

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === selectedPeriodId) ?? null,
    [periods, selectedPeriodId]
  );
  const fallbackPreviewPeriod = useMemo(() => {
    if (periodFallbackMode === "existing") {
      return selectedPeriod
        ? {
            label: selectedPeriod.label,
            periodDate: selectedPeriod.period_date
          }
        : null;
    }

    if (newPeriodLabel && newPeriodDate) {
      return {
        label: newPeriodLabel,
        periodDate: newPeriodDate
      };
    }

    return null;
  }, [
    newPeriodDate,
    newPeriodLabel,
    periodFallbackMode,
    selectedPeriod
  ]);
  const structurePreviewRows = useMemo(
    () => selectedSheet?.rows ?? [],
    [selectedSheet]
  );
  const structurePreviewHeaders = useMemo(
    () => selectedSheet?.headers ?? [],
    [selectedSheet]
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
      (workbookContext?.defaultImportTargetSheetName
        ? parsedFile.sheets.find(
            (sheet) => sheet.name === workbookContext.defaultImportTargetSheetName
          ) ?? null
        : null) ??
      parsedFile.sheets[0] ??
      null;

    if (!activeSheet) {
      return;
    }

    setSelectedSheetName(activeSheet.name);
    setColumnMapping(buildInitialColumnMapping(activeSheet.headers));
  }, [parsedFile, selectedSheetName, workbookContext]);

  const previewRows = useMemo(
    () =>
      buildImportPreviewRows({
        companyId: selectedCompanyId || null,
        rows: structurePreviewRows,
        columnMapping,
        savedMappings,
        fallbackPeriod: fallbackPreviewPeriod
      }),
    [
      columnMapping,
      fallbackPreviewPeriod,
      savedMappings,
      selectedCompanyId,
      structurePreviewRows
    ]
  );
  const sheetPreviewRows = useMemo(
    () =>
      buildSheetPreviewRows({
        selectedSheet,
        structurePreviewHeaders,
        structurePreviewRows,
        previewRows
      }),
    [previewRows, selectedSheet, structurePreviewHeaders, structurePreviewRows]
  );
  const detectedPeriods = useMemo(() => {
    const detection = detectImportPeriods(previewRows);

    return {
      periods: matchDetectedPeriodsToExisting(detection.periods, periods),
      unresolvedRows: detection.unresolvedRows
    };
  }, [periods, previewRows]);

  const reviewedPreviewRows = useMemo(() => {
    const excludedSet = new Set(excludedAccountKeys);

    return previewRows.map((row) => {
      const override = nonBlockingOverrides[row.accountKey];
      const isExcluded = excludedSet.has(row.accountKey);
      const isNonBlocking =
        override ?? row.isNonBlocking ?? isNonBlockingDerivedLabel(row.normalizedLabel);
      const isMapped = Boolean(row.category && row.statementType);
      const needsReview =
        isExcluded ? false : (!isMapped && !isNonBlocking) || row.confidence === "low";

      return {
        ...row,
        isExcluded,
        isNonBlocking,
        needsReview
      };
    });
  }, [excludedAccountKeys, nonBlockingOverrides, previewRows]);

  const accountReviewRows = useMemo(
    () => buildImportAccountReviewRows(reviewedPreviewRows),
    [reviewedPreviewRows]
  );
  const groupedPreviewRows = useMemo(
    () => buildGroupedImportPreviewRows(reviewedPreviewRows),
    [reviewedPreviewRows]
  );
  const previewPeriodColumns = useMemo(() => {
    const detected = detectedPeriods.periods.map((period) => ({
      key: period.key,
      label: period.label,
      periodDate: period.periodDate
    }));

    const groupedFallback = groupedPreviewRows.flatMap((row) =>
      row.periods.map((period) =>
        buildCanonicalPreviewPeriod({
          periodLabel: period.periodLabel || "",
          periodDate: period.periodDate || ""
        })
      )
    );

    const unique = new Map<string, { key: string; label: string; periodDate: string }>();
    const derivedGroupedPeriodListBeforeDedup = groupedFallback.map((period) => period.key);

    [...detected, ...groupedFallback].forEach((period) => {
      if (!unique.has(period.key)) {
        unique.set(period.key, period);
      }
    });

    const dedupedPeriods = Array.from(unique.values()).sort((left, right) =>
      (left.periodDate || left.label).localeCompare(right.periodDate || right.label)
    );
    devLog("PREVIEW PERIOD CANONICALIZATION", {
      derivedGroupedPeriodListBeforeDedup,
      groupedPeriodListAfterDedup: dedupedPeriods.map((period) => period.key),
      sampleGroupedRowValuesByCanonicalPeriod:
        groupedPreviewRows[0]?.periods.map((period) => ({
          accountName: groupedPreviewRows[0]?.accountName ?? "",
          originalLabel: period.periodLabel,
          originalDate: period.periodDate,
          canonicalPeriodKey: buildCanonicalPreviewPeriod({
            periodLabel: period.periodLabel || "",
            periodDate: period.periodDate || ""
          }).key,
          amountText: period.amountText
        })) ?? []
    });

    return dedupedPeriods;
  }, [detectedPeriods.periods, groupedPreviewRows]);
  const previewSummary = useMemo(() => {
    const accountsDetected = groupedPreviewRows.length;
    const mappedAccounts = groupedPreviewRows.filter(
      (row) => row.category && row.statementType && !row.needsReview
    ).length;
    const accountsUnderReview = groupedPreviewRows.filter((row) => {
      const isMapped = Boolean(row.category && row.statementType);
      return !isMapped && !row.isExcluded && !row.isNonBlocking;
    }).length;

    return {
      accountsDetected,
      periodsDetected: previewPeriodColumns.length,
      mappedAccounts,
      accountsUnderReview
    };
  }, [groupedPreviewRows, previewPeriodColumns.length]);

  useEffect(() => {
    devLog("STRUCTURE PREVIEW UPDATED");
    devLog("structurePreviewRows.length", structurePreviewRows.length);
    devLog("firstStructurePreviewRow", structurePreviewRows[0] ?? null);
  }, [selectedSheet, structurePreviewRows]);

  useEffect(() => {
    devLog("PREVIEW ROWS UPDATED");
    devLog("previewRows.length", previewRows.length);
    devLog("firstPreviewRow", previewRows[0] ?? null);

    const validRows = previewRows.filter((row) => {
      const hasAccount = !!row.accountName?.trim();
      const hasAmount = row.amountValue !== null && row.amountValue !== undefined;
      const hasPeriod = !!(row.sourcePeriodLabel || row.sourcePeriodDate);

      return hasAccount && hasAmount && hasPeriod;
    });

    devLog("validRowsBeforeGrouping", validRows.length);
    devLog("sampleValidRow", validRows[0] ?? null);
    devLog(
      "rowsMissingPeriod",
      previewRows.filter((row) => !row.sourcePeriodLabel && !row.sourcePeriodDate)
        .length
    );
  }, [selectedSheet, structurePreviewRows, previewRows]);

  useEffect(() => {
    devLog("GROUPED ROWS UPDATED");
    devLog("groupedPreviewRows.length", groupedPreviewRows.length);
    devLog("firstGroupedRow", groupedPreviewRows[0] ?? null);
    devLog("groupingInputRows", previewRows.slice(0, 5));
  }, [selectedSheet, previewRows, groupedPreviewRows]);
  const filteredPreviewRows = useMemo(() => {
    return groupedPreviewRows.filter((row) => {
      const status = groupedPreviewStatus(row);
      const requiresAttention =
        ((!row.category || !row.statementType) && !row.isExcluded && !row.isNonBlocking) ||
        status === "Low Confidence" ||
        status === "Review Required";

      if (reviewMode && !requiresAttention) {
        return false;
      }

      if (previewFilter === "all") return true;
      if (previewFilter === "review_required") return requiresAttention;
      if (previewFilter === "unmapped") return status === "Unmapped";
      if (previewFilter === "low_confidence") return status === "Low Confidence";
      if (previewFilter === "saved_mapping") return status === "Saved Mapping";
      if (previewFilter === "rule_based") return status === "Rule-Based";
      return true;
    });
  }, [groupedPreviewRows, previewFilter, reviewMode]);

  const previewStats = useMemo(() => {
    const total = reviewedPreviewRows.length;
    const ready = reviewedPreviewRows.filter((row) => !row.needsReview).length;
    const needsReview = total - ready;
    const lowConfidence = reviewedPreviewRows.filter((row) => row.confidence === "low").length;

    return { total, ready, needsReview, lowConfidence };
  }, [reviewedPreviewRows]);

  const sourcePeriodNotice = useMemo(() => {
    if (detectedPeriods.periods.length > 0) {
      return "Detected period values will be matched to existing reporting periods first and auto-created when missing.";
    }

    if (previewRows.some((row) => row.sourcePeriodLabel || row.sourcePeriodDate)) {
      return "Some source period values were present but could not be normalized. Use the fallback period controls below.";
    }

    return null;
  }, [detectedPeriods.periods.length, previewRows]);
  const wideStatementDebug = selectedSheet?.debug?.wideStatement;
  const showParserDebug =
    process.env.NODE_ENV !== "production" && Boolean(wideStatementDebug);

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

      const nextWorkbookContext = deriveWorkbookContext(nextParsedFile.sheets);
      const preferredSheet =
        (nextWorkbookContext.defaultImportTargetSheetName
          ? nextParsedFile.sheets.find(
              (sheet) => sheet.name === nextWorkbookContext.defaultImportTargetSheetName
            )
          : null) ??
        nextParsedFile.sheets.find(
          (sheet) => sheet.analysis.classification.status !== "needs_review"
        ) ??
        nextParsedFile.sheets[0];

      setParsedFile(nextParsedFile);
      setSelectedSheetName(preferredSheet?.name ?? "");
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

    const droppedRows: Array<{
      accountName: string;
      reason: string;
      periodLabel?: string;
      periodDate?: string;
    }> = [];

    const importRows = groupedPreviewRows
      .filter((row) => {
        if (row.isExcluded) {
          droppedRows.push({
            accountName: row.accountName,
            reason: "excluded"
          });
          return false;
        }

        if (!row.category || !row.statementType) {
          droppedRows.push({
            accountName: row.accountName,
            reason: "missing_mapping"
          });
          return false;
        }

        return true;
      })
      .flatMap((row) =>
        row.periods.flatMap((period: {
          rowNumber: number;
          periodLabel: string;
          periodDate: string;
          amountText: string;
          amountValue: number | null;
        }) => {
          if (period.amountValue === null || period.amountValue === undefined) {
            droppedRows.push({
              accountName: row.accountName,
              reason: "invalid_amount",
              periodLabel: period.periodLabel,
              periodDate: period.periodDate
            });
            return [];
          }

          if (!period.periodLabel && !period.periodDate) {
            droppedRows.push({
              accountName: row.accountName,
              reason: "missing_period",
              periodLabel: period.periodLabel,
              periodDate: period.periodDate
            });
            return [];
          }

          return [
            {
              accountName: row.accountName,
              amount: period.amountValue,
              periodLabel: period.periodLabel || null,
              periodDate: period.periodDate || null,
              statementType: row.statementType || null,
              category: row.category || null,
              addbackFlag: false,
              matchedBy: row.matchedBy,
              confidence: row.confidence,
              mappingExplanation: row.mappingExplanation
            }
          ];
        })
      );

    devLog("STEP 4 IMPORT TRANSFORM", {
      groupedPreviewRowsCount: groupedPreviewRows.length,
      rowsAfterFiltering: importRows.length,
      finalNormalizedCategories: importRows.map((row) => ({
        accountName: row.accountName,
        normalizedCategory: row.category,
        categoryLevel: isParentBalanceSheetCategory(String(row.category ?? ""))
          ? "parent"
          : "leaf"
      })),
      droppedRows
    });

    const autoMappedRows = importRows.filter((row) =>
      ["memory", "saved_mapping", "keyword", "keyword_rule"].includes(String(row.matchedBy))
    ).length;
    const rowsNeedingReview = groupedPreviewRows.filter(
      (row) => !row.isExcluded && (row.confidence === "low" || !row.category || !row.statementType)
    ).length;
    const missingCriticalCategories = summarizeMissingCriticalCategories(groupedPreviewRows);
    const selectedSheetName = selectedSheet?.name ?? null;
    const workbookFollowUpNotes = [
      ...(workbookContext?.gaps ?? []),
      ...(workbookContext?.conflicts ?? []),
      selectedSheetName === workbookContext?.primaryIncomeStatementSheetName
        ? `Imported primary income statement from ${selectedSheetName}.`
        : selectedSheetName === workbookContext?.primaryBalanceSheetSheetName
          ? `Imported primary balance sheet from ${selectedSheetName}.`
          : selectedSheetName === workbookContext?.primaryCashFlowSheetName
            ? `Imported primary cash flow sheet from ${selectedSheetName}.`
            : selectedSheetName
              ? `Imported ${selectedSheetName}; workbook-level primary statement selections remain available for follow-up.`
              : null,
      !workbookContext?.primaryBalanceSheetSheetName
        ? "Balance sheet not detected in workbook context."
        : null,
      workbookContext?.periodStructureSummary === "mixed"
        ? "Workbook primary statements use mixed period structures."
        : null,
      detectedPeriods.unresolvedRows.length > 0
        ? `${detectedPeriods.unresolvedRows.length} row(s) still needed fallback period handling`
        : null
    ].filter((value): value is string => Boolean(value));
    const workbookFollowUps = Array.from(new Set(workbookFollowUpNotes));
    const nextActions = [
      rowsNeedingReview > 0 ? "Complete mapping" : null,
      "Review source data",
      missingCriticalCategories.length > 0 ? "Fix missing categories" : null
    ].filter((value): value is string => Boolean(value));
    const importWorkbookFixIts = deriveWorkbookFixIts({
      workbookContext,
      companyId: selectedCompanyId || null
    });

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
      rows: importRows
    };

    devLog("STEP 4 IMPORT PAYLOAD", payload);

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
        rejectedRows: Array.isArray(result.rejectedRows) ? result.rejectedRows : [],
        autoMappedRows,
        rowsNeedingReview,
        missingCriticalCategories,
        workbookFollowUps,
        workbookFixIts: importWorkbookFixIts,
        nextActions,
        workbookContext
      });
      return;
    }

    const nextSummary = {
      insertedCount: result.insertedCount ?? 0,
      rejectedRows: Array.isArray(result.rejectedRows) ? result.rejectedRows : [],
      autoMappedRows,
      rowsNeedingReview,
      missingCriticalCategories,
      workbookFollowUps,
      workbookFixIts: importWorkbookFixIts,
      nextActions,
      workbookContext
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

  const stepStatus = {
    uploadComplete: Boolean(selectedCompanyId && parsedFile),
    structureComplete:
      Boolean(selectedSheet) &&
      Boolean(columnMapping.accountName) &&
      Boolean(columnMapping.amount),
    reviewComplete: reviewedPreviewRows.some((row) => !row.isExcluded)
  };

  const blockingGroupedRows = groupedPreviewRows.filter((row) => {
    const isMapped = Boolean(row.category && row.statementType);

    return !isMapped && !row.isExcluded && !row.isNonBlocking;
  });

  const importBlocked =
    isPending ||
    !selectedCompanyId ||
    (detectedPeriods.periods.length === 0 &&
      periodFallbackMode === "existing" &&
      !selectedPeriodId) ||
    ((detectedPeriods.periods.length === 0 ||
      detectedPeriods.unresolvedRows.length > 0) &&
      periodFallbackMode === "new" &&
      (!newPeriodLabel || !newPeriodDate)) ||
    !reviewedPreviewRows.some((row) => !row.isExcluded) ||
    blockingGroupedRows.length > 0;

  const importSummaryCards = [
    ["Accounts detected", String(previewSummary.accountsDetected)],
    ["Periods detected", String(previewSummary.periodsDetected)],
    ["Review required", String(previewSummary.accountsUnderReview)],
    [
      "Unmapped",
      String(
        groupedPreviewRows.filter(
          (row) => (!row.category || !row.statementType) && !row.isExcluded && !row.isNonBlocking
        ).length
      )
    ],
    [
      "Low confidence",
      String(groupedPreviewRows.filter((row) => row.confidence === "low").length)
    ],
    [
      "Saved mappings used",
      String(
        groupedPreviewRows.filter((row) => ["memory", "saved_mapping"].includes(row.matchedBy))
          .length
      )
    ]
  ] as const;

  const stepItems: Array<{ id: 1 | 2 | 3 | 4; label: string; ready: boolean }> = [
    { id: 1, label: "Upload", ready: true },
    { id: 2, label: "Confirm Structure", ready: stepStatus.uploadComplete },
    { id: 3, label: "Review Mappings", ready: stepStatus.structureComplete },
    { id: 4, label: "Import", ready: stepStatus.reviewComplete }
  ];

  function toggleExcluded(accountKey: string) {
    setExcludedAccountKeys((current) =>
      current.includes(accountKey)
        ? current.filter((key) => key !== accountKey)
        : [...current, accountKey]
    );
  }

  function toggleNonBlocking(accountKey: string) {
    setNonBlockingOverrides((current) => ({
      ...current,
      [accountKey]: !(current[accountKey] ?? false)
    }));
  }

  return (
    <StepBasedImportFlow
      activeStep={activeStep}
      setActiveStep={setActiveStep}
      stepItems={stepItems}
      selectedCompanyId={selectedCompanyId}
      setSelectedCompanyId={setSelectedCompanyId}
      companies={companies}
      workbookContext={workbookContext}
      parsedFile={parsedFile}
      selectedSheet={selectedSheet}
      sheetSelectionCards={sheetSelectionCards}
      structurePreviewRows={structurePreviewRows}
      structurePreviewHeaders={structurePreviewHeaders}
      sheetPreviewRows={sheetPreviewRows}
      selectedSheetName={selectedSheetName}
      setSelectedSheetName={setSelectedSheetName}
      companySetupSlot={companySetupSlot}
      advancedToolsSlot={advancedToolsSlot}
      setupMessage={setupMessage}
      errorMessage={errorMessage}
      successMessage={successMessage}
      handleFileUpload={handleFileUpload}
      showParserDebug={showParserDebug}
      wideStatementDebug={wideStatementDebug}
      columnMapping={columnMapping}
      updateColumnMapping={updateColumnMapping}
      sourcePeriodNotice={sourcePeriodNotice}
      detectedPeriods={detectedPeriods}
      periodFallbackMode={periodFallbackMode}
      setPeriodFallbackMode={setPeriodFallbackMode}
      selectedPeriodId={selectedPeriodId}
      setSelectedPeriodId={setSelectedPeriodId}
      periods={periods}
      newPeriodLabel={newPeriodLabel}
      setNewPeriodLabel={setNewPeriodLabel}
      newPeriodDate={newPeriodDate}
      setNewPeriodDate={setNewPeriodDate}
      previewSummary={previewSummary}
      groupedPreviewRows={groupedPreviewRows}
      previewFilter={previewFilter}
      setPreviewFilter={setPreviewFilter}
      reviewMode={reviewMode}
      setReviewMode={setReviewMode}
      previewPeriodColumns={previewPeriodColumns}
      filteredPreviewRows={filteredPreviewRows}
      expandedPreviewAccountKey={expandedPreviewAccountKey}
      setExpandedPreviewAccountKey={setExpandedPreviewAccountKey}
      toggleExcluded={toggleExcluded}
      toggleNonBlocking={toggleNonBlocking}
      handleMappingSaved={handleMappingSaved}
      updateRowsForAccount={updateRowsForAccount}
      accountReviewRows={accountReviewRows}
      importSummaryCards={importSummaryCards}
      importBlocked={importBlocked}
      handleImport={handleImport}
      isPending={isPending}
      importSummary={importSummary}
      workbookFixIts={workbookFixIts}
      stepStatus={stepStatus}
    />
  );

  return (
    <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Financial Data Upload</h2>
            <p className="mt-1 text-sm text-slate-500">
              Upload CSV or Excel, confirm structure, review account mappings, and import into the review workflow.
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

          {((parsedFile?.sheets?.length ?? 0) > 1) ? (
            <div className="w-full md:w-56">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Worksheet
              </label>
              <select
                value={selectedSheetName}
                onChange={(event) => setSelectedSheetName(event.target.value)}
              >
                {(parsedFile?.sheets ?? []).map((sheet) => (
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
                {parsedFile?.fileName} • {selectedSheet!.rows.length} row(s)
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {selectedSheet!.headers.map((header) => (
                <span
                  key={header}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  {header}
                </span>
              ))}
            </div>

            <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                Raw data tables
              </summary>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    {selectedSheet!.headers.slice(0, 6).map((header) => (
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
                  {selectedSheet!.rows.slice(0, 8).map((row, index) => (
                    <tr key={`${selectedSheet!.name}-${index}`}>
                      {selectedSheet!.headers.slice(0, 6).map((header) => (
                        <td key={header} className="px-3 py-2 text-slate-700">
                          {row[header] || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>

              {selectedSheet!.rows.length > 8 ? (
                <p className="mt-3 text-sm text-slate-500">
                  Showing the first 8 rows of {selectedSheet!.rows.length}.
                </p>
              ) : null}
            </details>

            {showParserDebug && wideStatementDebug ? (
              <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-sky-700">
                      Parser diagnostics
                    </p>
                    <p className="mt-1 text-sm text-sky-900">
                      Temporary wide-format header parsing details for this sheet.
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-sky-700">
                    {wideStatementDebug!.wideFormatDetected
                      ? "Wide format detected"
                      : "Wide format not detected"}
                  </span>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Header row
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {wideStatementDebug!.headerRowIndex >= 0
                        ? `${wideStatementDebug!.headerRowIndex + 1} (sheet ${wideStatementDebug!.headerSheetRowIndex ?? "?"})`
                        : "None"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Stacked header row
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {wideStatementDebug!.stackedHeaderRowIndex !== null
                        ? `${wideStatementDebug!.stackedHeaderRowIndex! + 1} (sheet ${wideStatementDebug!.stackedHeaderSheetRowIndex ?? "?"})`
                        : "None"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Used second header
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {wideStatementDebug!.usedSecondStackedHeaderRow ? "Yes" : "No"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Statement type
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {wideStatementDebug!.chosenStatementType}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2 md:col-span-2 xl:col-span-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                      Account label column
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {wideStatementDebug!.accountColumnIndex !== null
                        ? `Column ${wideStatementDebug!.accountColumnIndex! + 1}`
                        : "None"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {wideStatementDebug!.accountColumnReason || "No account label column reason available."}
                    </p>
                  </div>
                </div>

                <div className="mt-4 overflow-x-auto rounded-2xl border border-sky-200 bg-white">
                  <table className="min-w-full divide-y divide-sky-100 text-sm">
                    <thead className="bg-sky-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">
                          Column
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">
                          Header row 1
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">
                          Header row 2
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">
                          Chosen interpretation
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">
                          Resolved label
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">
                          Resolved date
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-slate-500">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-sky-100">
                      {wideStatementDebug!.detectedPeriodColumns.map((column) => (
                        <tr key={`${column.columnIndex}-${column.resolvedPeriodLabel}`}>
                          <td className="px-3 py-2 text-slate-700">
                            {column.columnIndex + 1}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {column.rawHeaderValueRow1 || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {column.rawHeaderValueRow2 || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {column.chosenInterpretation || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-900">
                            {column.resolvedPeriodLabel}
                          </td>
                          <td className="px-3 py-2 text-slate-700">
                            {column.resolvedPeriodDate}
                          </td>
                          <td className="px-3 py-2 text-slate-600">
                            {column.notes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="rounded-full bg-white px-3 py-1">
                    Header rows: {wideStatementDebug!.classifiedRowCounts.header_row}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1">
                    Sections: {wideStatementDebug!.classifiedRowCounts.section}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1">
                    Line items: {wideStatementDebug!.classifiedRowCounts.line_item}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1">
                    Subtotals: {wideStatementDebug!.classifiedRowCounts.subtotal}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1">
                    Totals: {wideStatementDebug!.classifiedRowCounts.total}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1">
                    Ratios: {wideStatementDebug!.classifiedRowCounts.ratio}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1">
                    Per share: {wideStatementDebug!.classifiedRowCounts.per_share}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1">
                    Notes: {wideStatementDebug!.classifiedRowCounts.note}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1">
                    Empty: {wideStatementDebug!.classifiedRowCounts.empty}
                  </span>
                </div>
              </div>
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
                  options={selectedSheet!.headers}
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
                          title={
                            row.matchedBy === "memory"
                              ? memoryScopeDetail(row.memoryScope)
                              : undefined
                          }
                        >
                          {formatMatchedBy(row.matchedBy, row.memoryScope)}
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
                      {row.matchedBy === "memory" ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {memoryScopeDetail(row.memoryScope)}
                        </p>
                      ) : null}
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
                          concept={row.category}
                          category={row.category}
                          statementType={row.statementType}
                          matchedBy={row.matchedBy}
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
                  Financial Preview
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Review grouped accounts across periods, confirm mappings, and then import.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                  {previewSummary.accountsDetected} Total Accounts
                </span>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-700">
                  {previewSummary.accountsUnderReview} Review Required
                </span>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                  {
                    groupedPreviewRows.filter(
                      (row) => !row.category || !row.statementType
                    ).length
                  }{" "}
                  Unmapped
                </span>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-700">
                  {
                    groupedPreviewRows.filter((row) => row.confidence === "low").length
                  }{" "}
                  Low Confidence
                </span>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">
                  {
                    groupedPreviewRows.filter((row) =>
                      ["memory", "saved_mapping"].includes(row.matchedBy)
                    ).length
                  }{" "}
                  Saved Mapping
                </span>
              </div>
            </div>

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

            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">
                      Account
                    </th>
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
                    <th className="px-3 py-2 text-left font-medium text-slate-500">
                      Mapping
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-slate-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredPreviewRows.slice(0, 20).map((row) => {
                    const isExpanded = expandedPreviewAccountKey === row.accountKey;
                    const status = groupedPreviewStatus(row);

                    return (
                      <Fragment key={row.accountKey || row.accountName}>
                        <tr
                          className={row.needsReview ? "bg-amber-50/40" : ""}
                        >
                          <td className="px-3 py-3 align-top">
                            <div className="min-w-[14rem]">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedPreviewAccountKey((current) =>
                                    current === row.accountKey ? null : row.accountKey
                                  )
                                }
                                className="flex items-center gap-2 text-left"
                              >
                                <span className="text-xs text-slate-400">
                                  {isExpanded ? "▾" : "▸"}
                                </span>
                                <span className="font-medium text-slate-900">
                                  {row.accountName || "Blank account"}
                                </span>
                              </button>
                            </div>
                          </td>
                          {previewPeriodColumns.map((period, index) => {
                            const periodMatch =
                              row.periods.find(
                                (item) =>
                                  (item.periodDate && item.periodDate === period.periodDate) ||
                                  (item.periodLabel && item.periodLabel === period.label)
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
                              title={
                                row.matchedBy === "memory"
                                  ? memoryScopeDetail(row.memoryScope)
                                  : undefined
                              }
                            >
                              {formatMatchedBy(row.matchedBy, row.memoryScope)}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-top">
                            <div className="flex min-w-[12rem] flex-col gap-2">
                              <div className="flex flex-wrap gap-2">
                                <span
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(
                                    status
                                  )}`}
                                >
                                  {status}
                                </span>
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
                        {isExpanded ? (
                          <tr className="bg-slate-50">
                            <td
                              colSpan={previewPeriodColumns.length + 3}
                              className="px-4 py-3"
                            >
                              <div className="grid gap-3 md:grid-cols-4">
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                                    Mapping
                                  </p>
                                  <p className="mt-2 text-sm text-slate-700">
                                    {row.mappingExplanation}
                                  </p>
                                  {row.matchedBy === "memory" ? (
                                    <p className="mt-1 text-xs text-slate-500">
                                      {memoryScopeDetail(row.memoryScope)}
                                    </p>
                                  ) : null}
                                </div>
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                                    Category
                                  </p>
                                  <div className="mt-2">
                                    <select
                                      value={row.category}
                                      onChange={(event) =>
                                        updateRowsForAccount(row.accountKey, {
                                          __manual_category: event.target.value
                                        })
                                      }
                                      className={`min-w-[10rem] ${
                                        row.needsReview && !row.category
                                          ? "border-amber-300 bg-amber-50"
                                          : ""
                                      }`}
                                    >
                                      <option value="">Review</option>
                                      {CATEGORY_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                                    Statement Type
                                  </p>
                                  <div className="mt-2">
                                    <select
                                      value={row.statementType}
                                      onChange={(event) =>
                                        updateRowsForAccount(row.accountKey, {
                                          __manual_statement_type: event.target.value
                                        })
                                      }
                                      className={`min-w-[9rem] ${
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
                                <div>
                                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                                    Source rows
                                  </p>
                                  <p className="mt-2 text-sm text-slate-700">
                                    {row.rowNumbers.join(", ")}
                                  </p>
                                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                                    {row.periods.map((period) => (
                                      <li
                                        key={`${row.accountKey}-${period.rowNumber}-detail`}
                                      >
                                        {period.periodLabel || "Unlabeled period"}:{" "}
                                        {period.amountText || "—"}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredPreviewRows.length > 20 ? (
              <p className="mt-3 text-sm text-slate-500">
                Showing the first 20 accounts of {filteredPreviewRows.length}.
              </p>
            ) : null}

            <div className="mt-4 flex justify-end">
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

            {importSummary ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium">
                  Inserted rows: {importSummary!.insertedCount}
                </p>
                <p className="mt-1 font-medium">
                  Rejected rows: {importSummary!.rejectedRows.length}
                </p>
                {importSummary!.rejectedRows.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-slate-600">
                    {importSummary!.rejectedRows.map((row) => (
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
