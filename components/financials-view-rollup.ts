import type { FinancialEntry, PeriodSnapshot } from "../lib/types.ts";

export type ValidationSeverity = "pass" | "warning" | "fail";

export type ValidationCheck = {
  key: string;
  label: string;
  severity: ValidationSeverity;
  message: string;
  computedValue?: number;
  sourceValue?: number;
  difference?: number;
  contributingLineItems?: Array<{
    accountName: string;
    normalizedCategory: string;
    amount: number;
  }>;
};

export type SourceTotalKey =
  | "totalCurrentAssets"
  | "totalAssets"
  | "totalCurrentLiabilities"
  | "totalLiabilities"
  | "totalEquity"
  | "totalLiabilitiesAndEquity";

export type BalanceSheetValidationResult = {
  overallSeverity: ValidationSeverity;
  checks: ValidationCheck[];
  computedTotals: {
    currentAssets: number;
    nonCurrentAssets: number;
    totalAssets: number;
    currentLiabilities: number;
    nonCurrentLiabilities: number;
    totalLiabilities: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    workingCapital: number;
  };
  sourceTotals: Partial<Record<SourceTotalKey, { accountName: string; amount: number }>>;
};

export const BALANCE_SHEET_VALIDATION_TOLERANCE = 1;

const BALANCE_SHEET_CATEGORY_PREFIXES = {
  currentAssets: ["current_assets"],
  nonCurrentAssets: ["non_current_assets"],
  currentLiabilities: ["current_liabilities"],
  nonCurrentLiabilities: ["non_current_liabilities"],
  equity: ["equity"]
} as const;

export const SOURCE_TOTAL_PATTERNS: Record<SourceTotalKey, string[]> = {
  totalCurrentAssets: ["total current assets"],
  totalAssets: ["total assets"],
  totalCurrentLiabilities: ["total current liabilities"],
  totalLiabilities: ["total liabilities"],
  totalEquity: ["total equity", "total stockholders equity", "total shareholders equity"],
  totalLiabilitiesAndEquity: [
    "total liabilities and equity",
    "total liabilities & equity"
  ]
};

type BalanceSheetFamilyKey = keyof typeof BALANCE_SHEET_CATEGORY_PREFIXES;

export type BalanceSheetDebugRow = {
  accountName: string;
  account_name?: string | null;
  category?: string | null;
  normalizedCategory: string;
  normalized_category?: string | null;
  statementType: string;
  statement_type?: string | null;
  periodId: string;
  amount: number;
  familyMatchedAs: string[];
};

const EXCLUDED_ROLLUP_BUCKETS = new Set([
  "assets",
  "current_assets",
  "non_current_assets",
  "liabilities",
  "current_liabilities",
  "non_current_liabilities",
  "equity"
]);

function normalizeCategoryKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function normalizeLabelKey(value: string | null | undefined) {
  return normalizeCategoryKey(value).replace(/[^\w]+/g, " ").replace(/\s+/g, " ").trim();
}

export function canonicalizeCategoryPath(value: string | null | undefined) {
  return normalizeCategoryKey(value)
    .replace(/[.\s/-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function matchesCategoryFamily(category: string | null | undefined, family: string) {
  const canonicalCategory = canonicalizeCategoryPath(category);
  const canonicalFamily = canonicalizeCategoryPath(family);

  if (!canonicalCategory || !canonicalFamily) {
    return false;
  }

  return (
    canonicalCategory === canonicalFamily ||
    canonicalCategory.startsWith(`${canonicalFamily}_`)
  );
}

function matchesCategoryPrefix(
  category: string | null | undefined,
  prefixes: readonly string[]
) {
  return prefixes.some((prefix) => matchesCategoryFamily(category, prefix));
}

function getEntryAccountName(entry: FinancialEntry) {
  const rawEntry = entry as FinancialEntry & {
    accountName?: string | null;
    account_name?: string | null;
  };

  return rawEntry.account_name ?? rawEntry.accountName ?? entry.account_name ?? "";
}

function getEntryCategory(entry: FinancialEntry) {
  const rawEntry = entry as FinancialEntry & {
    normalizedCategory?: string | null;
    normalized_category?: string | null;
    category?: string | null;
  };

  return (
    rawEntry.category ??
    entry.category ??
    rawEntry.normalized_category ??
    rawEntry.normalizedCategory ??
    ""
  );
}

function getEntryStatementType(entry: FinancialEntry) {
  const rawEntry = entry as FinancialEntry & {
    statementType?: string | null;
    statement_type?: string | null;
  };

  return (
    rawEntry.statement_type ??
    rawEntry.statementType ??
    entry.statement_type ??
    ""
  );
}

function getMatchedFamilies(category: string) {
  return Object.entries(BALANCE_SHEET_CATEGORY_PREFIXES)
    .filter(([, prefixes]) => matchesCategoryPrefix(category, prefixes))
    .map(([family]) => family);
}

function isBalanceSheetEntry(entry: FinancialEntry) {
  const category = getEntryCategory(entry);
  const statementType = getEntryStatementType(entry);

  return (
    statementType === "balance_sheet" ||
    matchesCategoryPrefix(category, [
      ...BALANCE_SHEET_CATEGORY_PREFIXES.currentAssets,
      ...BALANCE_SHEET_CATEGORY_PREFIXES.nonCurrentAssets,
      ...BALANCE_SHEET_CATEGORY_PREFIXES.currentLiabilities,
      ...BALANCE_SHEET_CATEGORY_PREFIXES.nonCurrentLiabilities,
      ...BALANCE_SHEET_CATEGORY_PREFIXES.equity
    ])
  );
}

function isSourceTotalLabel(accountName: string) {
  const normalizedAccountName = normalizeLabelKey(accountName);

  return Object.values(SOURCE_TOTAL_PATTERNS).some((patterns) =>
    patterns.includes(normalizedAccountName)
  );
}

function isComputedBalanceSheetRow(row: BalanceSheetDebugRow) {
  const canonicalCategory = canonicalizeCategoryPath(row.normalizedCategory);

  if (!canonicalCategory) {
    return false;
  }

  if (EXCLUDED_ROLLUP_BUCKETS.has(canonicalCategory)) {
    return false;
  }

  if (isSourceTotalLabel(row.accountName)) {
    return false;
  }

  return true;
}

function toBalanceSheetDebugRow(entry: FinancialEntry): BalanceSheetDebugRow {
  const rawEntry = entry as FinancialEntry & {
    accountName?: string | null;
    account_name?: string | null;
    normalizedCategory?: string | null;
    normalized_category?: string | null;
    statementType?: string | null;
    statement_type?: string | null;
    category?: string | null;
  };
  const category = getEntryCategory(entry);
  const statementType = getEntryStatementType(entry);

  return {
    accountName: getEntryAccountName(entry),
    account_name: rawEntry.account_name ?? rawEntry.accountName ?? null,
    category: rawEntry.category ?? null,
    normalizedCategory: category,
    normalized_category:
      rawEntry.normalized_category ?? rawEntry.normalizedCategory ?? null,
    statementType,
    statement_type: rawEntry.statement_type ?? rawEntry.statementType ?? null,
    periodId: entry.period_id,
    amount: Number(entry.amount),
    familyMatchedAs: getMatchedFamilies(category)
  };
}

export function buildBalanceSheetRollup(entries: FinancialEntry[], periodId: string) {
  const selectedPeriodRows = entries
    .filter((entry) => entry.period_id === periodId)
    .filter(isBalanceSheetEntry)
    .map(toBalanceSheetDebugRow);

  const computedRows = selectedPeriodRows.filter(isComputedBalanceSheetRow);

  const filterRowsForFamily = (
    rows: BalanceSheetDebugRow[],
    familyPrefixes: readonly string[]
  ) => rows.filter((row) => matchesCategoryPrefix(row.normalizedCategory, familyPrefixes));

  const familyRows = {
    currentAssets: filterRowsForFamily(
      computedRows,
      BALANCE_SHEET_CATEGORY_PREFIXES.currentAssets
    ),
    nonCurrentAssets: filterRowsForFamily(
      computedRows,
      BALANCE_SHEET_CATEGORY_PREFIXES.nonCurrentAssets
    ),
    currentLiabilities: filterRowsForFamily(
      computedRows,
      BALANCE_SHEET_CATEGORY_PREFIXES.currentLiabilities
    ),
    nonCurrentLiabilities: filterRowsForFamily(
      computedRows,
      BALANCE_SHEET_CATEGORY_PREFIXES.nonCurrentLiabilities
    ),
    equity: filterRowsForFamily(
      computedRows,
      BALANCE_SHEET_CATEGORY_PREFIXES.equity
    )
  } satisfies Record<BalanceSheetFamilyKey, BalanceSheetDebugRow[]>;

  const sumRows = (rows: BalanceSheetDebugRow[]) =>
    rows.reduce((total, line) => total + line.amount, 0);

  const totals = {
    totalCurrentAssets: sumRows(familyRows.currentAssets),
    totalNonCurrentAssets: sumRows(familyRows.nonCurrentAssets),
    totalCurrentLiabilities: sumRows(familyRows.currentLiabilities),
    totalNonCurrentLiabilities: sumRows(familyRows.nonCurrentLiabilities),
    totalEquity: sumRows(familyRows.equity)
  };

  const finalTotals = {
    ...totals,
    totalAssets: totals.totalCurrentAssets + totals.totalNonCurrentAssets,
    totalLiabilities:
      totals.totalCurrentLiabilities + totals.totalNonCurrentLiabilities,
    totalLiabilitiesAndEquity:
      totals.totalCurrentLiabilities +
      totals.totalNonCurrentLiabilities +
      totals.totalEquity,
    workingCapital: totals.totalCurrentAssets - totals.totalCurrentLiabilities
  };

  return {
    selectedPeriodRows,
    familyRows,
    finalTotals
  };
}

function severityRank(value: ValidationSeverity) {
  if (value === "fail") return 3;
  if (value === "warning") return 2;
  return 1;
}

function withinTolerance(left: number, right: number, tolerance = BALANCE_SHEET_VALIDATION_TOLERANCE) {
  return Math.abs(left - right) <= tolerance;
}

export function buildBalanceSheetValidation(params: {
  entries: FinancialEntry[];
  snapshot: PeriodSnapshot;
  rollup: ReturnType<typeof buildBalanceSheetRollup>;
}): BalanceSheetValidationResult {
  const { entries, snapshot, rollup } = params;
  const selectedPeriodEntries = entries.filter((entry) => entry.period_id === snapshot.periodId);
  const sourceTotals = Object.entries(SOURCE_TOTAL_PATTERNS).reduce<
    Partial<Record<SourceTotalKey, { accountName: string; amount: number }>>
  >((acc, [key, patterns]) => {
    const matched = selectedPeriodEntries.find((entry) =>
      patterns.includes(normalizeLabelKey(entry.account_name))
    );

    if (matched) {
      acc[key as SourceTotalKey] = {
        accountName: matched.account_name,
        amount: Number(matched.amount)
      };
    }

    return acc;
  }, {});

  const computedTotals = {
    currentAssets: rollup.finalTotals.totalCurrentAssets,
    nonCurrentAssets: rollup.finalTotals.totalNonCurrentAssets,
    totalAssets: rollup.finalTotals.totalAssets,
    currentLiabilities: rollup.finalTotals.totalCurrentLiabilities,
    nonCurrentLiabilities: rollup.finalTotals.totalNonCurrentLiabilities,
    totalLiabilities: rollup.finalTotals.totalLiabilities,
    totalEquity: rollup.finalTotals.totalEquity,
    totalLiabilitiesAndEquity: rollup.finalTotals.totalLiabilitiesAndEquity,
    workingCapital: rollup.finalTotals.workingCapital
  };

  const checks: ValidationCheck[] = [];
  const balanceDifference = computedTotals.totalAssets - computedTotals.totalLiabilitiesAndEquity;

  checks.push({
    key: "balance_equation",
    label: "Balance Equation",
    severity: withinTolerance(
      computedTotals.totalAssets,
      computedTotals.totalLiabilitiesAndEquity
    )
      ? "pass"
      : "fail",
    message: withinTolerance(
      computedTotals.totalAssets,
      computedTotals.totalLiabilitiesAndEquity
    )
      ? "Assets reconcile to liabilities and equity."
      : "Assets do not reconcile to liabilities and equity.",
    computedValue: computedTotals.totalAssets,
    sourceValue: computedTotals.totalLiabilitiesAndEquity,
    difference: balanceDifference
  });

  const sourceComparisonConfig: Array<{
    key: SourceTotalKey;
    label: string;
    computedValue: number;
    contributingLineItems: ValidationCheck["contributingLineItems"];
  }> = [
    {
      key: "totalCurrentAssets",
      label: "Current Assets",
      computedValue: computedTotals.currentAssets,
      contributingLineItems: rollup.familyRows.currentAssets.map((row) => ({
        accountName: row.accountName,
        normalizedCategory: row.normalizedCategory,
        amount: row.amount
      }))
    },
    {
      key: "totalAssets",
      label: "Total Assets",
      computedValue: computedTotals.totalAssets,
      contributingLineItems: [
        ...rollup.familyRows.currentAssets,
        ...rollup.familyRows.nonCurrentAssets
      ].map((row) => ({
        accountName: row.accountName,
        normalizedCategory: row.normalizedCategory,
        amount: row.amount
      }))
    },
    {
      key: "totalCurrentLiabilities",
      label: "Current Liabilities",
      computedValue: computedTotals.currentLiabilities,
      contributingLineItems: rollup.familyRows.currentLiabilities.map((row) => ({
        accountName: row.accountName,
        normalizedCategory: row.normalizedCategory,
        amount: row.amount
      }))
    },
    {
      key: "totalLiabilities",
      label: "Total Liabilities",
      computedValue: computedTotals.totalLiabilities,
      contributingLineItems: [
        ...rollup.familyRows.currentLiabilities,
        ...rollup.familyRows.nonCurrentLiabilities
      ].map((row) => ({
        accountName: row.accountName,
        normalizedCategory: row.normalizedCategory,
        amount: row.amount
      }))
    },
    {
      key: "totalEquity",
      label: "Total Equity",
      computedValue: computedTotals.totalEquity,
      contributingLineItems: rollup.familyRows.equity.map((row) => ({
        accountName: row.accountName,
        normalizedCategory: row.normalizedCategory,
        amount: row.amount
      }))
    },
    {
      key: "totalLiabilitiesAndEquity",
      label: "Total Liabilities and Equity",
      computedValue: computedTotals.totalLiabilitiesAndEquity,
      contributingLineItems: [
        ...rollup.familyRows.currentLiabilities,
        ...rollup.familyRows.nonCurrentLiabilities,
        ...rollup.familyRows.equity
      ].map((row) => ({
        accountName: row.accountName,
        normalizedCategory: row.normalizedCategory,
        amount: row.amount
      }))
    }
  ];

  sourceComparisonConfig.forEach((item) => {
    const source = sourceTotals[item.key];

    if (!source) {
      return;
    }

    const difference = item.computedValue - source.amount;
    checks.push({
      key: `source_${item.key}`,
      label: `${item.label}: Source vs Computed`,
      severity: withinTolerance(item.computedValue, source.amount)
        ? "pass"
        : "warning",
      message: withinTolerance(item.computedValue, source.amount)
        ? `Source ${source.accountName} agrees with computed ${item.label.toLowerCase()}.`
        : `Source ${source.accountName} does not agree with computed ${item.label.toLowerCase()}.`,
      computedValue: item.computedValue,
      sourceValue: source.amount,
      difference,
      contributingLineItems: item.contributingLineItems
    });
  });

  const sectionChecks: Array<{
    key: string;
    label: string;
    rows: BalanceSheetDebugRow[];
  }> = [
    { key: "missing_current_assets", label: "Current Assets Section", rows: rollup.familyRows.currentAssets },
    {
      key: "missing_non_current_assets",
      label: "Non-Current Assets Section",
      rows: rollup.familyRows.nonCurrentAssets
    },
    {
      key: "missing_current_liabilities",
      label: "Current Liabilities Section",
      rows: rollup.familyRows.currentLiabilities
    },
    {
      key: "missing_non_current_liabilities",
      label: "Non-Current Liabilities Section",
      rows: rollup.familyRows.nonCurrentLiabilities
    },
    { key: "missing_equity", label: "Equity Section", rows: rollup.familyRows.equity }
  ];

  sectionChecks.forEach((item) => {
    checks.push({
      key: item.key,
      label: item.label,
      severity: item.rows.length > 0 ? "pass" : "warning",
      message:
        item.rows.length > 0
          ? `${item.label} is present.`
          : `${item.label} is missing from the normalized balance sheet.`
    });
  });

  const overallSeverity = checks.reduce<ValidationSeverity>((current, check) => {
    return severityRank(check.severity) > severityRank(current) ? check.severity : current;
  }, "pass");

  return {
    overallSeverity,
    checks,
    computedTotals,
    sourceTotals
  };
}
