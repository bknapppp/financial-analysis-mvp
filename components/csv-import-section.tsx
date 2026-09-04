"use client";

import {
  type ReactNode,
  useEffect,
  useMemo,
  useState,
  useTransition
} from "react";
import { useRouter } from "next/navigation";
import {
  buildImportAccountReviewRows,
  buildGroupedImportPreviewRows,
  buildImportPreviewRows,
  isNonBlockingDerivedLabel
} from "@/lib/import-mapping";
import {
  buildInitialColumnMapping,
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
import {
  applyManualMappingEdit,
  buildSourceImportSubmission,
  deriveImportStepStatus,
  getBlockingImportRows,
  isSourceImportBlocked
} from "@/lib/source-data-import-flow";
import type {
  AccountMapping,
  Company,
  ReportingPeriod,
} from "@/lib/types";
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
            rows: applyManualMappingEdit({
              rows: sheet.rows,
              accountNameColumn: columnMapping.accountName,
              accountKey,
              patch
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

    const { payload, droppedRows } = buildSourceImportSubmission({
      companyId: selectedCompanyId,
      groupedRows: groupedPreviewRows,
      periodFallbackMode,
      selectedPeriodId,
      newPeriodLabel,
      newPeriodDate
    });
    const importRows = payload.rows;

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

  const stepStatus = deriveImportStepStatus({
    selectedCompanyId,
    hasParsedFile: Boolean(parsedFile),
    hasSelectedSheet: Boolean(selectedSheet),
    accountNameColumn: columnMapping.accountName,
    amountColumn: columnMapping.amount,
    reviewedRows: reviewedPreviewRows
  });

  const blockingGroupedRows = getBlockingImportRows(groupedPreviewRows);

  const importBlocked = isSourceImportBlocked({
    isPending,
    selectedCompanyId,
    detectedPeriodCount: detectedPeriods.periods.length,
    unresolvedPeriodCount: detectedPeriods.unresolvedRows.length,
    periodFallbackMode,
    selectedPeriodId,
    newPeriodLabel,
    newPeriodDate,
    reviewedRows: reviewedPreviewRows,
    blockingRowCount: blockingGroupedRows.length
  });

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
}
