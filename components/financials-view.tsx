"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { buildBalanceSheet as buildSnapshotBalanceSheet, buildIncomeStatement as buildSnapshotIncomeStatement } from "@/lib/calculations";
import { MultiPeriodSummaryTable } from "@/components/multi-period-summary-table";
import { StatementTable } from "@/components/statement-table";
import { formatCurrency } from "@/lib/formatters";
import type {
  DashboardData,
  FinancialEntry,
  NormalizedPeriodOutput,
  NormalizedStatement,
  PeriodSnapshot
} from "@/lib/types";

type FinancialsViewProps = {
  data: DashboardData;
};

type FinancialsMode = "reported" | "adjusted";
type ValidationSeverity = "pass" | "warning" | "fail";
type ValidationCheck = {
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
type BalanceSheetValidationResult = {
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
type SourceTotalKey =
  | "totalCurrentAssets"
  | "totalAssets"
  | "totalCurrentLiabilities"
  | "totalLiabilities"
  | "totalEquity"
  | "totalLiabilitiesAndEquity";

const BALANCE_SHEET_CATEGORY_PREFIXES = {
  currentAssets: ["current_assets"],
  nonCurrentAssets: ["non_current_assets"],
  currentLiabilities: ["current_liabilities"],
  nonCurrentLiabilities: ["non_current_liabilities"],
  equity: ["equity"]
} as const;
const BALANCE_SHEET_VALIDATION_TOLERANCE = 1;
const SOURCE_TOTAL_PATTERNS: Record<SourceTotalKey, string[]> = {
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
type BalanceSheetDebugRow = {
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

function normalizeCategoryKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function normalizeLabelKey(value: string | null | undefined) {
  return normalizeCategoryKey(value).replace(/[^\w]+/g, " ").replace(/\s+/g, " ").trim();
}

function canonicalizeCategoryPath(value: string | null | undefined) {
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

function buildBalanceSheetRollup(entries: FinancialEntry[], periodId: string) {
  console.log("ALL ENTRIES BEFORE FILTER:", entries);

  const selectedPeriodEntries = entries.filter((entry) => entry.period_id === periodId);

  console.log("PERIOD FILTER CHECK", {
    selectedPeriodId: periodId,
    rows: selectedPeriodEntries.map((entry) => ({
      account: entry.account_name,
      periodId: entry.period_id,
      amount: entry.amount
    }))
  });

  const selectedPeriodRows = selectedPeriodEntries
    .filter(isBalanceSheetEntry)
    .map(toBalanceSheetDebugRow);

  const filterRowsForFamily = (
    rows: BalanceSheetDebugRow[],
    familyPrefixes: readonly string[]
  ) =>
    rows.filter((row) => {
      const normalizedCategory = row.normalizedCategory;
      const matches = matchesCategoryPrefix(normalizedCategory, familyPrefixes);

      console.log("GROUPING CHECK", {
        account: row.account_name ?? row.accountName,
        normalizedCategory,
        matchesCurrentAssets: matchesCategoryFamily(
          normalizedCategory,
          "current_assets"
        ),
        matchesCurrentLiabilities: matchesCategoryFamily(
          normalizedCategory,
          "current_liabilities"
        )
      });

      return matches;
    });

  const familyRows = {
    currentAssets: filterRowsForFamily(
      selectedPeriodRows,
      BALANCE_SHEET_CATEGORY_PREFIXES.currentAssets
    ),
    nonCurrentAssets: filterRowsForFamily(
      selectedPeriodRows,
      BALANCE_SHEET_CATEGORY_PREFIXES.nonCurrentAssets
    ),
    currentLiabilities: filterRowsForFamily(
      selectedPeriodRows,
      BALANCE_SHEET_CATEGORY_PREFIXES.currentLiabilities
    ),
    nonCurrentLiabilities: filterRowsForFamily(
      selectedPeriodRows,
      BALANCE_SHEET_CATEGORY_PREFIXES.nonCurrentLiabilities
    ),
    equity: filterRowsForFamily(
      selectedPeriodRows,
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

function buildBalanceSheetValidation(params: {
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

function toNormalizedStatementRows(
  rows: Array<{ label: string; value: number }>,
  subtotalLabels: string[]
) {
  return rows.map((row) => ({
    key: row.label.toLowerCase().replace(/[^\w]+/g, "_").replace(/^_|_$/g, ""),
    label: row.label,
    value: row.value,
    kind: subtotalLabels.includes(row.label) ? ("subtotal" as const) : ("line_item" as const)
  }));
}

function buildReportedIncomeStatement(params: {
  normalizedOutput: NormalizedPeriodOutput | null;
  snapshot: PeriodSnapshot;
}): NormalizedStatement {
  const { normalizedOutput, snapshot } = params;

  if (normalizedOutput?.incomeStatement) {
    return {
      ...normalizedOutput.incomeStatement,
      title: "Income Statement",
      footerLabel: "Reported EBITDA",
      footerValue: snapshot.ebitda
    };
  }

  return {
    statementKey: "income_statement",
    title: "Income Statement",
    rows: toNormalizedStatementRows(buildSnapshotIncomeStatement(snapshot), [
      "Gross Profit",
      "Reported EBITDA",
      "Adjusted EBITDA"
    ]),
    footerLabel: "Reported EBITDA",
    footerValue: snapshot.ebitda
  };
}

function buildAdjustedIncomeStatement(params: {
  normalizedOutput: NormalizedPeriodOutput | null;
  snapshot: PeriodSnapshot;
}): NormalizedStatement {
  const { normalizedOutput, snapshot } = params;

  if (normalizedOutput?.incomeStatement) {
    return {
      ...normalizedOutput.incomeStatement,
      title: "Income Statement",
      footerLabel: "Adjusted EBITDA",
      footerValue: snapshot.adjustedEbitda
    };
  }

  return {
    statementKey: "income_statement",
    title: "Income Statement",
    rows: toNormalizedStatementRows(buildSnapshotIncomeStatement(snapshot), [
      "Gross Profit",
      "Reported EBITDA",
      "Adjusted EBITDA"
    ]),
    footerLabel: "Adjusted EBITDA",
    footerValue: snapshot.adjustedEbitda
  };
}

function buildBalanceSheet(params: {
  entries: FinancialEntry[];
  snapshot: PeriodSnapshot;
}): NormalizedStatement {
  const { entries, snapshot } = params;
  const balanceSheetRollup = buildBalanceSheetRollup(entries, snapshot.periodId);
  const balanceSheetLines = balanceSheetRollup.selectedPeriodRows;

  if (balanceSheetLines.length > 0) {
    const {
      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,
      totalCurrentLiabilities,
      totalNonCurrentLiabilities,
      totalLiabilities,
      totalEquity,
      totalLiabilitiesAndEquity,
      workingCapital
    } = balanceSheetRollup.finalTotals;

    return {
      statementKey: "balance_sheet",
      title: "Balance Sheet",
      rows: [
        {
          key: "assets_section",
          label: "Assets",
          value: 0,
          kind: "metric",
          rollupKey: "section_header"
        },
        {
          key: "current_assets",
          label: "Current Assets",
          value: totalCurrentAssets,
          kind: "line_item"
        },
        {
          key: "non_current_assets",
          label: "Non-Current Assets",
          value: totalNonCurrentAssets,
          kind: "line_item"
        },
        {
          key: "total_assets",
          label: "Total Assets",
          value: totalAssets,
          kind: "subtotal",
          rollupKey: "total_assets"
        },
        {
          key: "liabilities_section",
          label: "Liabilities",
          value: 0,
          kind: "metric",
          rollupKey: "section_header"
        },
        {
          key: "current_liabilities",
          label: "Current Liabilities",
          value: totalCurrentLiabilities,
          kind: "line_item"
        },
        {
          key: "non_current_liabilities",
          label: "Non-Current Liabilities",
          value: totalNonCurrentLiabilities,
          kind: "line_item"
        },
        {
          key: "total_liabilities",
          label: "Total Liabilities",
          value: totalLiabilities,
          kind: "subtotal",
          rollupKey: "total_liabilities"
        },
        {
          key: "equity_section",
          label: "Equity",
          value: 0,
          kind: "metric",
          rollupKey: "section_header"
        },
        {
          key: "total_equity",
          label: "Total Equity",
          value: totalEquity,
          kind: "subtotal",
          rollupKey: "total_equity"
        },
        {
          key: "total_liabilities_and_equity",
          label: "Total Liabilities & Equity",
          value: totalLiabilitiesAndEquity,
          kind: "subtotal",
          rollupKey: "total_liabilities_and_equity"
        }
      ],
      footerLabel: "Working Capital",
      footerValue: workingCapital
    };
  }

  return {
    statementKey: "balance_sheet",
    title: "Balance Sheet",
    rows: toNormalizedStatementRows(buildSnapshotBalanceSheet(snapshot), ["Working Capital"]),
    footerLabel: "Working Capital",
    footerValue: snapshot.workingCapital
  };
}

export function FinancialsView({ data }: FinancialsViewProps) {
  const [mode, setMode] = useState<FinancialsMode>("reported");
  const [showValidationDetails, setShowValidationDetails] = useState(false);

  const availablePeriods = useMemo(() => {
    const entryCountsByPeriodId = new Map<string, number>();

    data.entries.forEach((entry) => {
      entryCountsByPeriodId.set(
        entry.period_id,
        (entryCountsByPeriodId.get(entry.period_id) ?? 0) + 1
      );
    });

    return data.snapshots
      .filter((snapshot) => (entryCountsByPeriodId.get(snapshot.periodId) ?? 0) > 0)
      .map((snapshot) => ({
        periodId: snapshot.periodId,
        label: snapshot.label,
        periodDate: snapshot.periodDate,
        entryCount: entryCountsByPeriodId.get(snapshot.periodId) ?? 0
      }))
      .sort((left, right) =>
        (left.periodDate || left.label).localeCompare(right.periodDate || right.label)
      );
  }, [data.entries, data.snapshots]);

  const selectedPeriodBeforeFallback = data.snapshot.periodId || "";

  const effectiveSnapshot = useMemo(() => {
    const currentHasData = availablePeriods.some(
      (period) => period.periodId === data.snapshot.periodId
    );

    if (currentHasData) {
      return data.snapshot;
    }

    const latestAvailablePeriodId = availablePeriods[availablePeriods.length - 1]?.periodId ?? "";

    return (
      data.snapshots.find((snapshot) => snapshot.periodId === latestAvailablePeriodId) ??
      data.snapshot
    );
  }, [availablePeriods, data.snapshot, data.snapshots]);

  const effectiveNormalizedOutput = useMemo(
    () =>
      data.normalizedPeriods.find((period) => period.periodId === effectiveSnapshot.periodId) ??
      data.normalizedOutput ??
      null,
    [data.normalizedOutput, data.normalizedPeriods, effectiveSnapshot.periodId]
  );

  const selectedPeriodAfterFallback = effectiveSnapshot.periodId || "";
  const chosenPeriodHasData = availablePeriods.some(
    (period) => period.periodId === effectiveSnapshot.periodId
  );

  useEffect(() => {
    console.log("FINANCIAL STATEMENTS PERIOD SELECTION", {
      availablePeriods,
      selectedPeriodBeforeFallback,
      selectedPeriodAfterFallback,
      chosenPeriodHasData
    });
  }, [
    availablePeriods,
    chosenPeriodHasData,
    selectedPeriodAfterFallback,
    selectedPeriodBeforeFallback
  ]);

  const incomeStatement = useMemo(
    () =>
      mode === "reported"
        ? buildReportedIncomeStatement({
            normalizedOutput: effectiveNormalizedOutput,
            snapshot: effectiveSnapshot
          })
        : buildAdjustedIncomeStatement({
            normalizedOutput: effectiveNormalizedOutput,
            snapshot: effectiveSnapshot
          }),
    [effectiveNormalizedOutput, effectiveSnapshot, mode]
  );

  const balanceSheet = useMemo(
    () =>
      buildBalanceSheet({
        entries: data.entries,
        snapshot: effectiveSnapshot
      }),
    [data.entries, effectiveSnapshot]
  );
  const balanceSheetValidation = useMemo(() => {
    const rollup = buildBalanceSheetRollup(data.entries, effectiveSnapshot.periodId);

    return buildBalanceSheetValidation({
      entries: data.entries,
      snapshot: effectiveSnapshot,
      rollup
    });
  }, [data.entries, effectiveSnapshot]);

  useEffect(() => {
    const balanceSheetRollup = buildBalanceSheetRollup(
      data.entries,
      effectiveSnapshot.periodId
    );
    const groupedSums = balanceSheetRollup.selectedPeriodRows.reduce<Record<string, number>>(
      (acc, line) => {
        const normalizedCategory = canonicalizeCategoryPath(line.normalizedCategory);
        acc[normalizedCategory] = (acc[normalizedCategory] ?? 0) + line.amount;
        return acc;
      },
      {}
    );

    console.log("BALANCE SHEET AGGREGATION", {
      selectedPeriod: {
        periodId: effectiveSnapshot.periodId,
        label: effectiveSnapshot.label,
        periodDate: effectiveSnapshot.periodDate ?? null
      },
      selectedPeriodRowDiagnostics: balanceSheetRollup.selectedPeriodRows.map((row) => ({
        accountName: row.accountName,
        account_name: row.account_name ?? null,
        amount: row.amount,
        category: row.category ?? null,
        normalizedCategory: row.normalizedCategory,
        normalized_category: row.normalized_category ?? null,
        statementType: row.statementType,
        statement_type: row.statement_type ?? null,
        familyMatchedAs: row.familyMatchedAs
      })),
      selectedPeriodRows: balanceSheetRollup.selectedPeriodRows,
      includedInGroups: {
        current_assets: balanceSheetRollup.familyRows.currentAssets,
        non_current_assets: balanceSheetRollup.familyRows.nonCurrentAssets,
        current_liabilities: balanceSheetRollup.familyRows.currentLiabilities,
        non_current_liabilities: balanceSheetRollup.familyRows.nonCurrentLiabilities,
        equity: balanceSheetRollup.familyRows.equity
      },
      groupedSums,
      finalTotals: balanceSheetRollup.finalTotals,
      balanceCheck: {
        isBalanced:
          balanceSheetRollup.finalTotals.totalAssets ===
          balanceSheetRollup.finalTotals.totalLiabilitiesAndEquity,
        difference:
          balanceSheetRollup.finalTotals.totalAssets -
          balanceSheetRollup.finalTotals.totalLiabilitiesAndEquity
      }
    });
  }, [data.entries, effectiveSnapshot]);

  useEffect(() => {
    console.log("BALANCE SHEET VALIDATION RESULT", {
      computedTotals: balanceSheetValidation.computedTotals,
      sourceTotalRowsFound: balanceSheetValidation.sourceTotals,
      validationChecks: balanceSheetValidation.checks
    });
  }, [balanceSheetValidation]);

  const adjustedFooterDisplay =
    data.readiness.status === "blocked" ? "Not reliable" : null;
  const balanceDifference =
    balanceSheetValidation.computedTotals.totalAssets -
    balanceSheetValidation.computedTotals.totalLiabilitiesAndEquity;
  const balanceSheetBalances =
    Math.abs(balanceDifference) <= BALANCE_SHEET_VALIDATION_TOLERANCE;
  const sourceComparisonChecks = balanceSheetValidation.checks.filter(
    (check) => check.key.startsWith("source_") && check.sourceValue !== undefined
  );

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-6 shadow-panel md:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                {data.company?.name || "No company selected"} •{" "}
                {effectiveSnapshot.label || "No reporting period loaded"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Financial Statements
              </h1>
              <p className="mt-3 text-sm text-slate-600 md:text-base">
                Review reported and adjusted financial statement presentation, balance sheet detail, and multi-period operating history.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to Adjusted EBITDA Review
              </Link>
              <Link
                href="/source-data"
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Source Data
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Statement Basis
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Reported / Adjusted
              </h2>
            </div>

            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setMode("reported")}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  mode === "reported"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Reported
              </button>
              <button
                type="button"
                onClick={() => setMode("adjusted")}
                className={`rounded-full px-4 py-2 text-sm font-medium ${
                  mode === "adjusted"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600"
                }`}
              >
                Adjusted
              </button>
            </div>
          </div>

          {mode === "adjusted" ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Adjusted view reflects accepted EBITDA adjustments. Underlying line items remain reported where full adjusted restatement is not available.
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Reported view reflects the normalized reported statement presentation for the selected period.
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <StatementTable
            statement={incomeStatement}
            footerValueDisplay={mode === "adjusted" ? adjustedFooterDisplay : null}
          />
          <div className="space-y-4">
            <section className="rounded-[1.75rem] bg-white p-5 shadow-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Reconciliation Summary
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {balanceSheetValidation.overallSeverity === "pass"
                      ? "Balance sheet reconciles for the selected period."
                      : balanceSheetValidation.overallSeverity === "warning"
                        ? "Balance sheet has discrepancies. Review validation details."
                        : "Balance sheet does not reconcile. Review differences below."}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    balanceSheetValidation.overallSeverity === "pass"
                      ? "bg-teal-100 text-teal-800"
                      : balanceSheetValidation.overallSeverity === "warning"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {balanceSheetValidation.overallSeverity === "pass"
                    ? "Pass"
                    : balanceSheetValidation.overallSeverity === "warning"
                      ? "Warning"
                      : "Fail"}
                </span>
              </div>

              <div
                className={`mt-4 grid gap-3 ${
                  sourceComparisonChecks.length > 0 ? "xl:grid-cols-3" : "md:grid-cols-2"
                }`}
              >
                <div
                  className={`rounded-2xl border px-4 py-3 ${
                    balanceSheetBalances
                      ? "border-teal-200 bg-teal-50"
                      : "border-rose-200 bg-rose-50"
                  }`}
                >
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    Balance Check
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    {balanceSheetBalances
                      ? "Balance Sheet Balances"
                      : "Balance Sheet Does Not Balance"}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    {balanceSheetBalances
                      ? "Assets = Liabilities + Equity"
                      : "Assets ≠ Liabilities + Equity"}
                  </p>
                  <p className="mt-2 text-sm text-slate-900">
                    {formatCurrency(balanceSheetValidation.computedTotals.totalAssets)} ={" "}
                    {formatCurrency(
                      balanceSheetValidation.computedTotals.totalLiabilitiesAndEquity
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Difference:{" "}
                    <span
                      className={
                        Math.abs(balanceDifference) <= BALANCE_SHEET_VALIDATION_TOLERANCE
                          ? "font-medium text-teal-700"
                          : "font-semibold text-rose-700"
                      }
                    >
                      {formatCurrency(balanceDifference)}
                    </span>
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                    Computed Totals
                  </p>
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Assets
                  </p>
                  <p className="mt-2 text-sm text-slate-700">
                    Total Assets:{" "}
                    {formatCurrency(balanceSheetValidation.computedTotals.totalAssets)}
                  </p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                    Liabilities & Equity
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Total Liabilities:{" "}
                    {formatCurrency(balanceSheetValidation.computedTotals.totalLiabilities)}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Total Equity: {formatCurrency(balanceSheetValidation.computedTotals.totalEquity)}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Total Liabilities & Equity:{" "}
                    {formatCurrency(
                      balanceSheetValidation.computedTotals.totalLiabilitiesAndEquity
                    )}
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    Working Capital:{" "}
                    {formatCurrency(balanceSheetValidation.computedTotals.workingCapital)}
                  </p>
                </div>
                {sourceComparisonChecks.length > 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                      Source vs Computed
                    </p>
                    <div className="mt-2 space-y-3">
                      {sourceComparisonChecks.map((check) => (
                        <div
                          key={check.key}
                          className={`rounded-xl border bg-white px-3 py-2 ${
                            check.difference !== undefined &&
                            Math.abs(check.difference) > BALANCE_SHEET_VALIDATION_TOLERANCE
                              ? "border-rose-200"
                              : "border-slate-200"
                          }`}
                        >
                          <p className="text-sm font-medium text-slate-900">
                            {check.label.replace(": Source vs Computed", "")}
                          </p>
                          <p className="mt-1 text-sm text-slate-700">
                            Source:{" "}
                            {check.sourceValue !== undefined
                              ? formatCurrency(check.sourceValue)
                              : "—"}
                          </p>
                          <p className="text-sm text-slate-700">
                            Computed:{" "}
                            {check.computedValue !== undefined
                              ? formatCurrency(check.computedValue)
                              : "—"}
                          </p>
                          <p className="text-sm text-slate-700">
                            Difference:{" "}
                            <span
                              className={
                                check.difference !== undefined &&
                                Math.abs(check.difference) > BALANCE_SHEET_VALIDATION_TOLERANCE
                                  ? "font-semibold text-rose-700"
                                  : "font-medium text-teal-700"
                              }
                            >
                              {check.difference !== undefined
                                ? formatCurrency(check.difference)
                                : "—"}
                            </span>
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <details
                open={showValidationDetails}
                onToggle={(event) =>
                  setShowValidationDetails(
                    (event.currentTarget as HTMLDetailsElement).open
                  )
                }
                className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                  {showValidationDetails
                    ? "Hide validation details"
                    : "View validation details"}
                </summary>
                <div className="mt-4 space-y-3">
                  {balanceSheetValidation.checks.map((check) => (
                    <div
                      key={check.key}
                      className={`rounded-2xl border bg-white px-4 py-3 ${
                        check.severity === "pass"
                          ? "border-teal-200"
                          : check.severity === "warning"
                            ? "border-amber-200"
                            : "border-rose-200"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{check.label}</p>
                          <p className="mt-1 text-sm text-slate-600">{check.message}</p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            check.severity === "pass"
                              ? "bg-teal-100 text-teal-800"
                              : check.severity === "warning"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {check.severity === "pass"
                            ? "Pass"
                            : check.severity === "warning"
                              ? "Warning"
                              : "Fail"}
                        </span>
                      </div>
                      {check.computedValue !== undefined || check.sourceValue !== undefined ? (
                        <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                          <p>
                            {check.sourceValue !== undefined
                              ? `Computed ${check.label.replace(": Source vs Computed", "")}: `
                              : "Computed: "}
                            {check.computedValue !== undefined
                              ? formatCurrency(check.computedValue)
                              : "—"}
                          </p>
                          <p>
                            {check.sourceValue !== undefined
                              ? `Source ${check.label.replace(": Source vs Computed", "")}: `
                              : "Source: "}
                            {check.sourceValue !== undefined
                              ? formatCurrency(check.sourceValue)
                              : "—"}
                          </p>
                          <p>
                            Difference:{" "}
                            {check.difference !== undefined
                              ? formatCurrency(check.difference)
                              : "—"}
                          </p>
                        </div>
                      ) : null}
                      {check.contributingLineItems?.length ? (
                        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          {check.contributingLineItems.map((item) => (
                            <p key={`${check.key}-${item.accountName}-${item.normalizedCategory}`}>
                              {item.accountName} • {item.normalizedCategory} •{" "}
                              {formatCurrency(item.amount)}
                            </p>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </details>
            </section>
            <StatementTable statement={balanceSheet} />
          </div>
        </section>

        <MultiPeriodSummaryTable snapshots={data.snapshots} />
      </div>
    </main>
  );
}
