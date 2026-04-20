import type {
  FinancialEntry,
  IncomeStatementAggregationDebug,
  IncomeStatementAggregationFamilyKey,
  IncomeStatementAggregationSource,
  NormalizedCategory
} from "./types";

const INCOME_STATEMENT_FAMILY_CATEGORIES = {
  revenue: "Revenue",
  cogs: "COGS",
  operatingExpenses: "Operating Expenses",
  depreciationAndAmortization: "Depreciation / Amortization",
  nonOperating: "Non-operating",
  taxExpense: "Tax Expense",
  netIncome: "Net Income",
  operatingIncome: "Operating Income",
  ebitda: "EBITDA"
} as const satisfies Record<
  IncomeStatementAggregationFamilyKey,
  Extract<
    NormalizedCategory,
    | "Revenue"
    | "COGS"
    | "Operating Expenses"
    | "Depreciation / Amortization"
    | "Non-operating"
    | "Tax Expense"
    | "Net Income"
    | "Operating Income"
    | "EBITDA"
  >
>;

const CATEGORY_SUBTOTAL_LABELS: Record<IncomeStatementAggregationFamilyKey, Set<string>> = {
  revenue: new Set([
    "revenue",
    "sales",
    "net sales",
    "net revenue",
    "total revenue",
    "total sales",
    "turnover"
  ]),
  cogs: new Set([
    "cogs",
    "cost of revenue",
    "cost of sales",
    "cost of goods sold",
    "total cogs",
    "total cost of revenue",
    "total cost of sales",
    "total cost of goods sold"
  ]),
  operatingExpenses: new Set([
    "operating expenses",
    "operating expense",
    "opex",
    "cost and expenses",
    "costs and expenses",
    "total expenses",
    "total operating expenses",
    "total operating expense",
    "operating costs and expenses"
  ]),
  depreciationAndAmortization: new Set([
    "depreciation and amortization",
    "depreciation amortization",
    "depreciation",
    "amortization",
    "d a",
    "da",
    "d&a",
    "dep and amort",
    "dep amort"
  ]),
  nonOperating: new Set([
    "non operating",
    "non-operating",
    "other income expense",
    "other income",
    "other expense",
    "interest expense",
    "interest income",
    "net interest",
    "non operating income expense"
  ]),
  taxExpense: new Set([
    "tax expense",
    "income tax",
    "income taxes",
    "income tax expense",
    "provision for income taxes"
  ]),
  netIncome: new Set([
    "net income",
    "net earnings",
    "net profit",
    "profit after tax",
    "income after tax"
  ]),
  operatingIncome: new Set([
    "operating income",
    "income from operations",
    "operating profit",
    "ebit"
  ]),
  ebitda: new Set([
    "ebitda",
    "reported ebitda"
  ])
};

function shouldExcludeFamilyRow(params: {
  family: IncomeStatementAggregationFamilyKey;
  accountName: string | null | undefined;
}) {
  const normalizedLabel = normalizeIncomeStatementLabel(params.accountName);

  if (!normalizedLabel) {
    return false;
  }

  return params.family === "ebitda" && normalizedLabel.includes("adjusted ebitda");
}

export function normalizeIncomeStatementLabel(label: string | null | undefined) {
  return (label ?? "")
    .toLowerCase()
    .trim()
    .replace(/\bsg\s*&\s*a\b/g, "sga")
    .replace(/\bs\s*g\s*&\s*a\b/g, "sga")
    .replace(/&/g, " and ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isLikelyIncomeStatementSubtotalLabel(params: {
  accountName: string | null | undefined;
  family: IncomeStatementAggregationFamilyKey;
}) {
  const normalizedLabel = normalizeIncomeStatementLabel(params.accountName);

  if (!normalizedLabel) {
    return false;
  }

  if (normalizedLabel.includes("subtotal") || normalizedLabel.includes("sub total")) {
    return true;
  }

  if (CATEGORY_SUBTOTAL_LABELS[params.family].has(normalizedLabel)) {
    return true;
  }

  return normalizedLabel.startsWith("total ");
}

function buildFamilyDebug(params: {
  family: IncomeStatementAggregationFamilyKey;
  rows: FinancialEntry[];
}) {
  const eligibleRows = params.rows.filter(
    (entry) =>
      !shouldExcludeFamilyRow({
        family: params.family,
        accountName: entry.account_name
      })
  );
  const componentRows = params.rows.filter(
    (entry) =>
      !shouldExcludeFamilyRow({
        family: params.family,
        accountName: entry.account_name
      }) &&
      !isLikelyIncomeStatementSubtotalLabel({
        accountName: entry.account_name,
        family: params.family
      })
  );
  const subtotalRows = eligibleRows.filter((entry) =>
    isLikelyIncomeStatementSubtotalLabel({
      accountName: entry.account_name,
      family: params.family
    })
  );
  const subtotalPriority = (entry: FinancialEntry) => {
    const normalizedLabel = normalizeIncomeStatementLabel(entry.account_name);

    if (CATEGORY_SUBTOTAL_LABELS[params.family].has(normalizedLabel)) {
      return Array.from(CATEGORY_SUBTOTAL_LABELS[params.family]).indexOf(normalizedLabel);
    }

    return Number.MAX_SAFE_INTEGER;
  };
  const selectedSubtotalRow =
    subtotalRows.length > 0
      ? [...subtotalRows].sort((left, right) => {
          const priorityDelta = subtotalPriority(left) - subtotalPriority(right);

          if (priorityDelta !== 0) {
            return priorityDelta;
          }

          return left.account_name.localeCompare(right.account_name);
        })[0]
      : null;
  const selectedRows =
    componentRows.length > 0
      ? componentRows
      : selectedSubtotalRow
        ? [selectedSubtotalRow]
        : [];
  const excludedRows = params.rows.filter((entry) => !selectedRows.includes(entry));
  const source: IncomeStatementAggregationSource =
    componentRows.length > 0
      ? "components"
      : subtotalRows.length > 0
        ? "subtotal_fallback"
        : "none";

  return {
    source,
    total: selectedRows.reduce((sum, entry) => sum + Number(entry.amount), 0),
    selectedLabels: selectedRows.map((entry) => entry.account_name),
    excludedLabels: excludedRows.map((entry) => entry.account_name),
    componentCount: componentRows.length,
    subtotalCount: subtotalRows.length
  };
}

export function buildIncomeStatementAggregationDebug(
  entries: FinancialEntry[],
  periodId: string
): IncomeStatementAggregationDebug {
  const periodIncomeEntries = entries.filter(
    (entry) => entry.period_id === periodId && entry.statement_type === "income"
  );

  const rowsForFamily = (family: IncomeStatementAggregationFamilyKey) =>
    periodIncomeEntries.filter(
      (entry) => entry.category === INCOME_STATEMENT_FAMILY_CATEGORIES[family]
    );

  return {
    revenue: buildFamilyDebug({
      family: "revenue",
      rows: rowsForFamily("revenue")
    }),
    cogs: buildFamilyDebug({
      family: "cogs",
      rows: rowsForFamily("cogs")
    }),
    operatingExpenses: buildFamilyDebug({
      family: "operatingExpenses",
      rows: rowsForFamily("operatingExpenses")
    }),
    depreciationAndAmortization: buildFamilyDebug({
      family: "depreciationAndAmortization",
      rows: rowsForFamily("depreciationAndAmortization")
    }),
    nonOperating: buildFamilyDebug({
      family: "nonOperating",
      rows: rowsForFamily("nonOperating")
    }),
    taxExpense: buildFamilyDebug({
      family: "taxExpense",
      rows: rowsForFamily("taxExpense")
    }),
    netIncome: buildFamilyDebug({
      family: "netIncome",
      rows: rowsForFamily("netIncome")
    }),
    operatingIncome: buildFamilyDebug({
      family: "operatingIncome",
      rows: rowsForFamily("operatingIncome")
    }),
    ebitda: buildFamilyDebug({
      family: "ebitda",
      rows: rowsForFamily("ebitda")
    })
  };
}
