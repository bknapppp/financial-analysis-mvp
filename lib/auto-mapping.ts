import type { AccountMapping, NormalizedCategory, StatementType } from "./types";
import {
  findSavedMapping,
  getSavedMapping,
  normalizeMappingLabel
} from "./mapping-memory.ts";

export type IncomeStatementConcept =
  | "Revenue"
  | "COGS"
  | "Gross Profit"
  | "Operating Expenses"
  | "Depreciation / Amortization"
  | "EBITDA"
  | "Operating Income"
  | "Pre-tax / EBT"
  | "Net Income"
  | "Non-operating"
  | "Tax Expense";

export type BalanceSheetConcept =
  | "Cash"
  | "Accounts Receivable"
  | "Inventory"
  | "PPE"
  | "Accounts Payable"
  | "Short Term Debt"
  | "Long Term Debt"
  | "Common Stock"
  | "Retained Earnings";

export type MappingConcept = IncomeStatementConcept | BalanceSheetConcept;

export type AutoMappingResult = {
  concept: MappingConcept | null;
  category: NormalizedCategory | null;
  statementType: StatementType | null;
  normalizedLabel?: string;
  matchedBy:
    | "manual"
    | "memory"
    | "saved_mapping"
    | "csv_value"
    | "keyword_rule"
    | "unmapped";
  confidence: "high" | "medium" | "low";
  explanation: string;
  memoryScope?: "company" | "global" | null;
  mappingId?: string;
  resolutionSource:
    | "manual_override"
    | "company_saved_mapping"
    | "global_saved_mapping"
    | "csv_mapping"
    | "keyword_rule"
    | "unmapped";
  decisionPath?: string[];
};

type KeywordRule = {
  concept: MappingConcept;
  category: NormalizedCategory | null;
  statementType: StatementType;
  mode: "exact" | "contains";
  patterns: string[];
  confidence: "high" | "medium";
};

const CONCEPT_CATEGORY_MAP: Record<IncomeStatementConcept, NormalizedCategory> = {
  Revenue: "Revenue",
  COGS: "COGS",
  "Gross Profit": "Gross Profit",
  "Operating Expenses": "Operating Expenses",
  "Depreciation / Amortization": "Depreciation / Amortization",
  EBITDA: "EBITDA",
  "Operating Income": "Operating Income",
  "Pre-tax / EBT": "Pre-tax",
  "Net Income": "Net Income",
  "Tax Expense": "Tax Expense",
  "Non-operating": "Non-operating"
};

export type MappingCategoryOption = {
  value: NormalizedCategory;
  label: string;
};

export const INCOME_MAPPING_CATEGORIES: NormalizedCategory[] = [
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
  "Non-operating"
];

export const BALANCE_SHEET_LEAF_MAPPING_CATEGORIES: NormalizedCategory[] = [
  "current_assets.cash",
  "current_assets.accounts_receivable",
  "current_assets.inventory",
  "current_assets.other",
  "non_current_assets.ppe",
  "non_current_assets.other",
  "current_liabilities.accounts_payable",
  "current_liabilities.short_term_debt",
  "current_liabilities.other",
  "non_current_liabilities.long_term_debt",
  "non_current_liabilities.other",
  "equity.common_stock",
  "equity.retained_earnings",
  "equity.other"
];

const MAPPING_CATEGORY_LABELS: Record<NormalizedCategory, string> = {
  Revenue: "Revenue",
  COGS: "COGS",
  "Gross Profit": "Gross Profit",
  "Operating Expenses": "Operating Expenses",
  "Depreciation / Amortization": "Depreciation / Amortization",
  EBITDA: "EBITDA",
  "Operating Income": "Operating Income",
  "Pre-tax": "Pre-tax",
  "Net Income": "Net Income",
  "Tax Expense": "Tax Expense",
  "Non-operating": "Non-operating",
  current_assets: "Current Assets",
  "current_assets.cash": "Cash",
  "current_assets.accounts_receivable": "Accounts Receivable",
  "current_assets.inventory": "Inventory",
  "current_assets.other": "Other Current Assets",
  non_current_assets: "Non-current Assets",
  "non_current_assets.ppe": "Property, Plant & Equipment",
  "non_current_assets.other": "Other Non-current Assets",
  current_liabilities: "Current Liabilities",
  "current_liabilities.accounts_payable": "Accounts Payable",
  "current_liabilities.short_term_debt": "Short-term Debt",
  "current_liabilities.other": "Other Current Liabilities",
  non_current_liabilities: "Non-current Liabilities",
  "non_current_liabilities.long_term_debt": "Long-term Debt",
  "non_current_liabilities.other": "Other Non-current Liabilities",
  equity: "Equity",
  "equity.common_stock": "Common Stock",
  "equity.retained_earnings": "Retained Earnings",
  "equity.other": "Other Equity",
  Assets: "Assets",
  Liabilities: "Liabilities",
  Equity: "Equity"
};

export function getMappingCategoryLabel(
  category: NormalizedCategory | string | null | undefined
) {
  if (!category) {
    return "";
  }

  return (
    MAPPING_CATEGORY_LABELS[category as NormalizedCategory] ??
    String(category)
  );
}

export function getMappingCategoryOptions(
  statementType: StatementType | "" | null | undefined
): MappingCategoryOption[] {
  const categories =
    statementType === "balance_sheet"
      ? BALANCE_SHEET_LEAF_MAPPING_CATEGORIES
      : statementType === "income"
        ? INCOME_MAPPING_CATEGORIES
        : [...INCOME_MAPPING_CATEGORIES, ...BALANCE_SHEET_LEAF_MAPPING_CATEGORIES];

  return categories.map((value) => ({
    value,
    label: getMappingCategoryLabel(value)
  }));
}

function deriveConceptFromCategory(
  category: NormalizedCategory,
  statementType: StatementType
): MappingConcept | null {
  if (statementType === "income") {
    const match = Object.entries(CONCEPT_CATEGORY_MAP).find(
      ([, mappedCategory]) => mappedCategory === category
    )?.[0];

    return (match as IncomeStatementConcept | undefined) ?? null;
  }

  if (category === "current_assets.cash") return "Cash";
  if (category === "current_assets.accounts_receivable") return "Accounts Receivable";
  if (category === "current_assets.inventory") return "Inventory";
  if (category === "non_current_assets.ppe") return "PPE";
  if (category === "current_liabilities.accounts_payable") return "Accounts Payable";
  if (category === "current_liabilities.short_term_debt") return "Short Term Debt";
  if (category === "non_current_liabilities.long_term_debt") return "Long Term Debt";
  if (category === "equity.common_stock") return "Common Stock";
  if (category === "equity.retained_earnings") return "Retained Earnings";

  return null;
}

const INCOME_STATEMENT_RULES: KeywordRule[] = [
  {
    concept: "Revenue",
    category: "Revenue",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: [
      "revenue",
      "sales",
      "net sales",
      "total revenue",
      "total sales",
      "turnover",
      "subscription revenue",
      "service revenue"
    ]
  },
  {
    concept: "COGS",
    category: "COGS",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: [
      "cost of revenue",
      "cost of sales",
      "cogs",
      "direct costs",
      "cost of goods sold"
    ]
  },
  {
    concept: "Gross Profit",
    category: "Gross Profit",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: ["gross profit", "gross income"]
  },
  {
    concept: "Operating Expenses",
    category: "Operating Expenses",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: [
      "operating expenses",
      "sga",
      "sg&a",
      "sg&a expense",
      "sga expense",
      "selling general and administrative",
      "selling and marketing",
      "selling and marketing expense",
      "selling marketing",
      "sales and marketing",
      "sales and marketing expense",
      "marketing expense",
      "general and administrative",
      "g&a",
      "general and admin expense",
      "general and administrative expense",
      "general and admin expense",
      "research and development",
      "research and development expense",
      "r&d",
      "r&d expense",
      "other operating expenses",
      "other expense",
      "other expenses"
    ]
  },
  {
    concept: "Depreciation / Amortization",
    category: "Depreciation / Amortization",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: [
      "depreciation",
      "amortization",
      "depreciation and amortization",
      "dep and amort",
      "dep amort",
      "d&a"
    ]
  },
  {
    concept: "EBITDA",
    category: "EBITDA",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: ["ebitda", "adjusted ebitda", "ebitda non gaap", "ebitda non-gaap"]
  },
  {
    concept: "Operating Income",
    category: "Operating Income",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: ["ebit", "operating income", "operating income ebit"]
  },
  {
    concept: "Pre-tax / EBT",
    category: "Pre-tax",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: [
      "pretax income",
      "pre tax income",
      "pre-tax income",
      "income before tax",
      "ebt",
      "earnings before tax"
    ]
  },
  {
    concept: "Net Income",
    category: "Net Income",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: [
      "net income",
      "net earnings",
      "earnings",
      "profit after tax",
      "income after tax"
    ]
  },
  {
    concept: "Non-operating",
    category: "Non-operating",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: [
      "interest expense",
      "interest income",
      "other income",
      "gain",
      "loss",
      "non recurring",
      "non-recurring"
    ]
  },
  {
    concept: "Tax Expense",
    category: "Tax Expense",
    statementType: "income",
    mode: "exact",
    confidence: "high",
    patterns: ["tax expense", "income tax expense", "provision for income taxes"]
  },
  {
    concept: "Revenue",
    category: "Revenue",
    statementType: "income",
    mode: "contains",
    confidence: "medium",
    patterns: ["subscription revenue", "service revenue", "total revenue", "total sales"]
  },
  {
    concept: "COGS",
    category: "COGS",
    statementType: "income",
    mode: "contains",
    confidence: "medium",
    patterns: ["cost of revenue", "cost of sales", "cost of goods sold", "direct cost"]
  },
  {
    concept: "Operating Expenses",
    category: "Operating Expenses",
    statementType: "income",
    mode: "contains",
    confidence: "medium",
    patterns: [
      "marketing expense",
      "general and administrative",
      "selling and marketing",
      "research and development",
      "operating expense",
      "other expense",
      "other expenses"
    ]
  },
  {
    concept: "Depreciation / Amortization",
    category: "Depreciation / Amortization",
    statementType: "income",
    mode: "contains",
    confidence: "medium",
    patterns: ["depreciation", "amortization", "dep amort", "d&a"]
  },
  {
    concept: "EBITDA",
    category: "EBITDA",
    statementType: "income",
    mode: "contains",
    confidence: "medium",
    patterns: ["ebitda"]
  },
  {
    concept: "Operating Income",
    category: "Operating Income",
    statementType: "income",
    mode: "contains",
    confidence: "medium",
    patterns: ["operating income", "ebit"]
  },
  {
    concept: "Pre-tax / EBT",
    category: "Pre-tax",
    statementType: "income",
    mode: "contains",
    confidence: "medium",
    patterns: ["before tax", "pretax", "pre tax", "ebt"]
  },
  {
    concept: "Net Income",
    category: "Net Income",
    statementType: "income",
    mode: "contains",
    confidence: "medium",
    patterns: ["net income", "net earnings", "after tax"]
  },
  {
    concept: "Non-operating",
    category: "Non-operating",
    statementType: "income",
    mode: "contains",
    confidence: "medium",
    patterns: [
      "interest",
      "other income",
      "gain",
      "loss",
      "non recurring",
      "non-recurring"
    ]
  },
  {
    concept: "Tax Expense",
    category: "Tax Expense",
    statementType: "income",
    mode: "contains",
    confidence: "medium",
    patterns: ["tax expense", "income tax"]
  }
];

const BALANCE_SHEET_RULES: Array<{
  concept: BalanceSheetConcept;
  category: NormalizedCategory;
  mode: "exact" | "contains";
  confidence: "high" | "medium";
  patterns: string[];
}> = [
  {
    concept: "Cash",
    category: "current_assets.cash",
    mode: "exact",
    confidence: "high",
    patterns: ["cash", "cash and cash equivalents"]
  },
  {
    concept: "Accounts Receivable",
    category: "current_assets.accounts_receivable",
    mode: "exact",
    confidence: "high",
    patterns: ["accounts receivable", "trade receivables", "receivables"]
  },
  {
    concept: "Inventory",
    category: "current_assets.inventory",
    mode: "exact",
    confidence: "high",
    patterns: ["inventory", "inventories"]
  },
  {
    concept: "PPE",
    category: "non_current_assets.ppe",
    mode: "exact",
    confidence: "high",
    patterns: [
      "property plant and equipment",
      "pp&e",
      "ppe",
      "fixed assets"
    ]
  },
  {
    concept: "Accounts Payable",
    category: "current_liabilities.accounts_payable",
    mode: "exact",
    confidence: "high",
    patterns: ["accounts payable", "trade payables", "payables"]
  },
  {
    concept: "Short Term Debt",
    category: "current_liabilities.short_term_debt",
    mode: "exact",
    confidence: "high",
    patterns: ["short term debt", "short-term debt", "current portion of debt"]
  },
  {
    concept: "Long Term Debt",
    category: "non_current_liabilities.long_term_debt",
    mode: "exact",
    confidence: "high",
    patterns: ["long term debt", "long-term debt", "notes payable", "term loan"]
  },
  {
    concept: "Common Stock",
    category: "equity.common_stock",
    mode: "exact",
    confidence: "high",
    patterns: ["common stock", "share capital", "capital stock"]
  },
  {
    concept: "Retained Earnings",
    category: "equity.retained_earnings",
    mode: "exact",
    confidence: "high",
    patterns: ["retained earnings", "accumulated deficit"]
  },
  {
    concept: "Cash",
    category: "current_assets.cash",
    mode: "contains",
    confidence: "medium",
    patterns: ["cash"]
  },
  {
    concept: "Accounts Receivable",
    category: "current_assets.accounts_receivable",
    mode: "contains",
    confidence: "medium",
    patterns: ["receivable"]
  },
  {
    concept: "Inventory",
    category: "current_assets.inventory",
    mode: "contains",
    confidence: "medium",
    patterns: ["inventory"]
  },
  {
    concept: "PPE",
    category: "non_current_assets.ppe",
    mode: "contains",
    confidence: "medium",
    patterns: ["equipment", "fixed asset", "property plant"]
  },
  {
    concept: "Accounts Payable",
    category: "current_liabilities.accounts_payable",
    mode: "contains",
    confidence: "medium",
    patterns: ["payable"]
  },
  {
    concept: "Short Term Debt",
    category: "current_liabilities.short_term_debt",
    mode: "contains",
    confidence: "medium",
    patterns: ["short term debt", "current debt"]
  },
  {
    concept: "Long Term Debt",
    category: "non_current_liabilities.long_term_debt",
    mode: "contains",
    confidence: "medium",
    patterns: ["long term debt", "term loan", "notes payable"]
  },
  {
    concept: "Common Stock",
    category: "equity.common_stock",
    mode: "contains",
    confidence: "medium",
    patterns: ["common stock", "capital stock"]
  },
  {
    concept: "Retained Earnings",
    category: "equity.retained_earnings",
    mode: "contains",
    confidence: "medium",
    patterns: ["retained earnings", "accumulated deficit"]
  }
];

function stripOuterWhitespace(value: string) {
  return value.trim();
}

const BALANCE_SHEET_PARENT_CATEGORIES = new Set<NormalizedCategory>([
  "Assets",
  "Liabilities",
  "Equity",
  "current_assets",
  "non_current_assets",
  "current_liabilities",
  "non_current_liabilities",
  "equity"
]);

export function isBalanceSheetParentCategory(
  category: NormalizedCategory | null | undefined
) {
  return category ? BALANCE_SHEET_PARENT_CATEGORIES.has(category) : false;
}

export function isBalanceSheetLeafCategory(
  category: NormalizedCategory | null | undefined
) {
  return Boolean(
    category &&
      (category.startsWith("current_assets.") ||
        category.startsWith("non_current_assets.") ||
        category.startsWith("current_liabilities.") ||
        category.startsWith("non_current_liabilities.") ||
        category.startsWith("equity."))
  );
}

export function sanitizeCategoryForStatementType(params: {
  category: NormalizedCategory | null | undefined;
  statementType: StatementType | null | undefined;
}) {
  const { category, statementType } = params;

  if (!category) {
    return null;
  }

  if (statementType === "balance_sheet") {
    return isBalanceSheetLeafCategory(category) ? category : null;
  }

  return category;
}

export function normalizeAccountName(accountName: string) {
  return normalizeMappingLabel(stripOuterWhitespace(accountName));
}

export function normalizeMappingText(accountName: string) {
  return normalizeAccountName(accountName);
}

function exactMatch(normalizedAccountName: string, pattern: string) {
  return normalizedAccountName === normalizeMappingText(pattern);
}

function containsMatch(normalizedAccountName: string, pattern: string) {
  return normalizedAccountName.includes(normalizeMappingText(pattern));
}

function buildRuleExplanation(
  concept: MappingConcept,
  pattern: string,
  confidence: "high" | "medium",
  category: NormalizedCategory | null,
  statementType: StatementType
) {
  if (!category) {
    return confidence === "high"
      ? `Identified as ${concept} using explicit ${statementType === "income" ? "income statement" : "balance sheet"} rule: "${pattern}". Left unmapped for review.`
      : `Identified as ${concept} using broader ${statementType === "income" ? "income statement" : "balance sheet"} rule: "${pattern}". Left unmapped for review.`;
  }

  return confidence === "high"
    ? `Matched explicit ${statementType === "income" ? "income statement" : "balance sheet"} rule: "${pattern}" -> ${category}.`
    : `Matched broader ${statementType === "income" ? "income statement" : "balance sheet"} rule: "${pattern}" -> ${category}.`;
}

function buildResolvedResult(params: {
  category: NormalizedCategory | null;
  statementType: StatementType | null;
  normalizedLabel: string;
  matchedBy: AutoMappingResult["matchedBy"];
  resolutionSource: AutoMappingResult["resolutionSource"];
  confidence: AutoMappingResult["confidence"];
  explanation: string;
  memoryScope?: "company" | "global" | null;
  mappingId?: string;
  decisionPath: string[];
}) {
  const concept =
    params.category && params.statementType
      ? deriveConceptFromCategory(params.category, params.statementType)
      : null;

  return {
    concept,
    category: params.category,
    statementType: params.statementType,
    normalizedLabel: params.normalizedLabel,
    matchedBy: params.matchedBy,
    confidence: params.confidence,
    explanation: params.explanation,
    memoryScope: params.memoryScope ?? null,
    mappingId: params.mappingId,
    resolutionSource: params.resolutionSource,
    decisionPath: params.decisionPath
  } satisfies AutoMappingResult;
}

function buildProvidedMappingCandidate(params: {
  category: NormalizedCategory | null;
  statementType: StatementType | null;
}) {
  const inferredStatementType =
    params.statementType ?? inferStatementTypeFromCategory(params.category);
  const sanitizedCategory = sanitizeCategoryForStatementType({
    category: params.category,
    statementType: inferredStatementType
  });

  if (!sanitizedCategory || !inferredStatementType) {
    return null;
  }

  return {
    category: sanitizedCategory,
    statementType: inferredStatementType
  };
}

export function resolveMappingSelection(params: {
  accountName: string;
  savedMappings?: AccountMapping[];
  preferredStatementType?: StatementType | null;
  companyId?: string | null;
  manualCategory?: NormalizedCategory | null;
  manualStatementType?: StatementType | null;
  csvCategory?: NormalizedCategory | null;
  csvStatementType?: StatementType | null;
}): AutoMappingResult {
  const {
    accountName,
    savedMappings = [],
    preferredStatementType = null,
    companyId = null,
    manualCategory = null,
    manualStatementType = null,
    csvCategory = null,
    csvStatementType = null
  } = params;
  const normalizedAccountName = normalizeMappingText(accountName);
  const decisionPath: string[] = [];
  const lookupStatementType =
    manualStatementType ??
    inferStatementTypeFromCategory(manualCategory) ??
    preferredStatementType ??
    csvStatementType ??
    inferStatementTypeFromCategory(csvCategory) ??
    null;

  console.log("AUTO MAPPING INPUT", {
    accountName,
    normalizedAccountName,
    detectedStatementType: lookupStatementType ?? "unspecified"
  });

  const manualCandidate = buildProvidedMappingCandidate({
    category: manualCategory,
    statementType: manualStatementType
  });

  if (manualCandidate) {
    decisionPath.push("manual_override");
    return buildResolvedResult({
      category: manualCandidate.category,
      statementType: manualCandidate.statementType,
      normalizedLabel: normalizedAccountName,
      matchedBy: "manual",
      confidence: "high",
      explanation: "Mapping was adjusted during review before import.",
      resolutionSource: "manual_override",
      decisionPath
    });
  }

  const memoryMatch = findSavedMapping({
    mappings: savedMappings,
    companyId,
    accountName,
    statementType: lookupStatementType
  });

  if (memoryMatch) {
    const sanitizedMemoryCategory = sanitizeCategoryForStatementType({
      category: memoryMatch.record.category,
      statementType: memoryMatch.record.statement_type
    });

    if (!sanitizedMemoryCategory) {
      decisionPath.push("saved_mapping_invalid_for_statement_type");
      console.log("MAPPING MEMORY MISS", {
        accountName,
        normalizedAccountName,
        detectedStatementType: lookupStatementType ?? "unspecified",
        reason: "saved_mapping_invalid_for_statement_type"
      });
    } else {
      decisionPath.push(
        memoryMatch.scope === "company" ? "company_saved_mapping" : "global_saved_mapping"
      );

      console.log("MAPPING MEMORY HIT", {
        accountName,
        normalizedAccountName,
        scope: memoryMatch.scope,
        appliedSavedMapping: {
          category: sanitizedMemoryCategory,
          statementType: memoryMatch.record.statement_type
        }
      });

      return buildResolvedResult({
        category: sanitizedMemoryCategory,
        statementType: memoryMatch.record.statement_type,
        normalizedLabel: normalizedAccountName,
        matchedBy: "memory",
        confidence: "high",
        explanation:
          memoryMatch.scope === "company"
            ? "Previously confirmed mapping for this company."
            : "Previously confirmed global mapping.",
        memoryScope: memoryMatch.scope,
        mappingId: memoryMatch.record.id,
        resolutionSource:
          memoryMatch.scope === "company"
            ? "company_saved_mapping"
            : "global_saved_mapping",
        decisionPath
      });
    }
  }

  const csvCandidate = buildProvidedMappingCandidate({
    category: csvCategory,
    statementType: csvStatementType
  });

  if (csvCandidate) {
    decisionPath.push("csv_mapping");
    return buildResolvedResult({
      category: csvCandidate.category,
      statementType: csvCandidate.statementType,
      normalizedLabel: normalizedAccountName,
      matchedBy: "csv_value",
      confidence: "high",
      explanation: "Using category or statement type provided in the source file.",
      resolutionSource: "csv_mapping",
      decisionPath
    });
  }

  const tryIncomeRules = lookupStatementType !== "balance_sheet";
  const tryBalanceRules = lookupStatementType !== "income";

  if (tryIncomeRules) {
    decisionPath.push("income_rules");
    const incomeRule = findIncomeStatementRule(normalizedAccountName);

    if (incomeRule) {
      console.log("AUTO MAPPING DECISION", {
        accountName,
        detectedStatementType: lookupStatementType ?? "unspecified",
        decisionPath,
        matchedRule: incomeRule.matchedPattern,
        category: incomeRule.category
      });

      return buildResolvedResult({
        category: incomeRule.category,
        statementType: incomeRule.statementType,
        normalizedLabel: normalizedAccountName,
        matchedBy: "keyword_rule",
        confidence: incomeRule.confidence,
        explanation: buildRuleExplanation(
          incomeRule.concept,
          incomeRule.matchedPattern,
          incomeRule.confidence,
          incomeRule.category,
          incomeRule.statementType
        ),
        resolutionSource: "keyword_rule",
        decisionPath
      });
    }
  }

  if (tryBalanceRules) {
    decisionPath.push("balance_sheet_rules");
    const balanceRule = findBalanceSheetRule(normalizedAccountName);

    if (balanceRule) {
      console.log("AUTO MAPPING DECISION", {
        accountName,
        detectedStatementType: lookupStatementType ?? "unspecified",
        decisionPath,
        matchedRule: balanceRule.matchedPattern,
        category: balanceRule.category
      });

      return buildResolvedResult({
        category: balanceRule.category,
        statementType: inferStatementTypeFromCategory(balanceRule.category),
        normalizedLabel: normalizedAccountName,
        matchedBy: "keyword_rule",
        confidence: balanceRule.confidence,
        explanation: buildRuleExplanation(
          balanceRule.concept,
          balanceRule.matchedPattern,
          balanceRule.confidence,
          balanceRule.category,
          "balance_sheet"
        ),
        resolutionSource: "keyword_rule",
        decisionPath
      });
    }
  }

  decisionPath.push("unmapped");
  console.log("AUTO MAPPING FALLBACK", {
    accountName,
    detectedStatementType: lookupStatementType ?? "unspecified",
    decisionPath,
    reason: "fallback_to_unmapped"
  });

  return buildResolvedResult({
    category: null,
    statementType: null,
    normalizedLabel: normalizedAccountName,
    matchedBy: "unmapped",
    confidence: "low",
    explanation:
      "No strong saved mapping or explicit account rule matched this label. Left unmapped for review rather than forcing a Revenue classification.",
    resolutionSource: "unmapped",
    decisionPath
  });
}

export function inferStatementTypeFromCategory(
  category: NormalizedCategory | null
): StatementType | null {
  if (!category) {
    return null;
  }

  if (
    category === "Revenue" ||
    category === "COGS" ||
    category === "Gross Profit" ||
    category === "Operating Expenses" ||
    category === "Depreciation / Amortization" ||
    category === "EBITDA" ||
    category === "Operating Income" ||
    category === "Pre-tax" ||
    category === "Net Income" ||
    category === "Tax Expense" ||
    category === "Non-operating"
  ) {
    return "income";
  }

  return "balance_sheet";
}

export function parseStatementType(
  value: string | null | undefined
): StatementType | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (["income", "income_statement", "p&l", "pnl", "income statement"].includes(normalized)) {
    return "income";
  }

  if (["balance_sheet", "balance sheet", "bs", "b/s"].includes(normalized)) {
    return "balance_sheet";
  }

  return null;
}

export function parseCategory(
  value: string | null | undefined
): NormalizedCategory | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "current_assets") return null;
  if (normalized === "current_assets.cash") return "current_assets.cash";
  if (normalized === "current_assets.accounts_receivable") {
    return "current_assets.accounts_receivable";
  }
  if (normalized === "current_assets.inventory") return "current_assets.inventory";
  if (normalized === "non_current_assets") return null;
  if (normalized === "non_current_assets.ppe") return "non_current_assets.ppe";
  if (normalized === "current_liabilities") return null;
  if (normalized === "current_liabilities.accounts_payable") {
    return "current_liabilities.accounts_payable";
  }
  if (normalized === "current_liabilities.short_term_debt") {
    return "current_liabilities.short_term_debt";
  }
  if (normalized === "non_current_liabilities") return null;
  if (normalized === "non_current_liabilities.long_term_debt") {
    return "non_current_liabilities.long_term_debt";
  }
  if (normalized === "equity") return null;
  if (normalized === "equity.common_stock") return "equity.common_stock";
  if (normalized === "equity.retained_earnings") return "equity.retained_earnings";

  if (normalized === "revenue") return "Revenue";
  if (normalized === "cogs") return "COGS";
  if (normalized === "gross profit" || normalized === "gross income") {
    return "Gross Profit";
  }
  if (normalized === "operating expenses" || normalized === "opex") {
    return "Operating Expenses";
  }
  if (
    normalized === "depreciation" ||
    normalized === "amortization" ||
    normalized === "depreciation and amortization" ||
    normalized === "dep and amort" ||
    normalized === "dep amort" ||
    normalized === "d&a"
  ) {
    return "Depreciation / Amortization";
  }
  if (
    normalized === "ebitda" ||
    normalized === "adjusted ebitda" ||
    normalized === "ebitda non gaap"
  ) {
    return "EBITDA";
  }
  if (normalized === "operating income" || normalized === "ebit") {
    return "Operating Income";
  }
  if (
    normalized === "pretax income" ||
    normalized === "pre tax" ||
    normalized === "pre-tax" ||
    normalized === "income before tax" ||
    normalized === "ebt"
  ) {
    return "Pre-tax";
  }
  if (normalized === "net income" || normalized === "net earnings") {
    return "Net Income";
  }
  if (
    normalized === "tax expense" ||
    normalized === "income tax" ||
    normalized === "income tax expense"
  ) {
    return "Tax Expense";
  }
  if (
    normalized === "non operating" ||
    normalized === "non-operating" ||
    normalized === "interest expense" ||
    normalized === "interest income" ||
    normalized === "other income" ||
    normalized === "gain" ||
    normalized === "loss" ||
    normalized === "non recurring" ||
    normalized === "non-recurring"
  ) {
    return "Non-operating";
  }
  if (normalized === "assets" || normalized === "asset") return null;
  if (normalized === "current assets" || normalized === "current_assets") {
    return null;
  }
  if (normalized === "cash") return "current_assets.cash";
  if (
    normalized === "accounts receivable" ||
    normalized === "trade receivables" ||
    normalized === "receivables"
  ) {
    return "current_assets.accounts_receivable";
  }
  if (normalized === "inventory" || normalized === "inventories") {
    return "current_assets.inventory";
  }
  if (normalized === "non current assets" || normalized === "non-current assets") {
    return null;
  }
  if (
    normalized === "property plant and equipment" ||
    normalized === "pp&e" ||
    normalized === "ppe" ||
    normalized === "fixed assets"
  ) {
    return "non_current_assets.ppe";
  }
  if (normalized === "liabilities" || normalized === "liability") {
    return null;
  }
  if (
    normalized === "current liabilities" ||
    normalized === "current_liabilities"
  ) {
    return null;
  }
  if (
    normalized === "accounts payable" ||
    normalized === "trade payables" ||
    normalized === "payables"
  ) {
    return "current_liabilities.accounts_payable";
  }
  if (
    normalized === "short term debt" ||
    normalized === "short-term debt" ||
    normalized === "current portion of debt"
  ) {
    return "current_liabilities.short_term_debt";
  }
  if (
    normalized === "non current liabilities" ||
    normalized === "non-current liabilities"
  ) {
    return null;
  }
  if (
    normalized === "long term debt" ||
    normalized === "long-term debt" ||
    normalized === "notes payable" ||
    normalized === "term loan"
  ) {
    return "non_current_liabilities.long_term_debt";
  }
  if (
    normalized === "common stock" ||
    normalized === "share capital" ||
    normalized === "capital stock"
  ) {
    return "equity.common_stock";
  }
  if (
    normalized === "retained earnings" ||
    normalized === "accumulated deficit"
  ) {
    return "equity.retained_earnings";
  }
  if (normalized === "Equity") return null;

  return null;
}

export function parseBooleanFlag(value: string | boolean | null | undefined) {
  if (typeof value === "boolean") {
    return value;
  }

  if (!value) {
    return false;
  }

  const normalized = String(value).trim().toLowerCase();
  return ["true", "1", "yes", "y"].includes(normalized);
}

function findIncomeStatementRule(normalizedAccountName: string) {
  for (const rule of INCOME_STATEMENT_RULES) {
    const matchedPattern = rule.patterns.find((pattern) =>
      rule.mode === "exact"
        ? exactMatch(normalizedAccountName, pattern)
        : containsMatch(normalizedAccountName, pattern)
    );

    if (matchedPattern) {
      return {
        ...rule,
        matchedPattern
      };
    }
  }

  return null;
}

function findBalanceSheetRule(normalizedAccountName: string) {
  for (const rule of BALANCE_SHEET_RULES) {
    const matchedPattern = rule.patterns.find((pattern) =>
      rule.mode === "exact"
        ? exactMatch(normalizedAccountName, pattern)
        : containsMatch(normalizedAccountName, pattern)
    );

    if (matchedPattern) {
      return {
        ...rule,
        matchedPattern
      };
    }
  }

  return null;
}

export function suggestAccountMapping(
  accountName: string,
  savedMappings: AccountMapping[] = [],
  preferredStatementType: StatementType | null = null,
  companyId: string | null = null
): AutoMappingResult {
  return resolveMappingSelection({
    accountName,
    savedMappings,
    preferredStatementType,
    companyId
  });
}

export async function resolveAccountMapping(params: {
  supabase: any;
  accountName: string;
  savedMappings?: AccountMapping[];
  preferredStatementType?: StatementType | null;
  companyId?: string | null;
}): Promise<AutoMappingResult> {
  const {
    supabase,
    accountName,
    savedMappings = [],
    preferredStatementType = null,
    companyId = null
  } = params;
  const normalizedLabel = normalizeMappingText(accountName);

  /**
   * Lookup flow:
   * 1) If preloaded mappings are supplied, resolve in-memory first.
   * 2) If no preloaded mappings were supplied, fall back to a direct DB lookup.
   * 3) If no saved mapping applies, use deterministic keyword rules.
   *
   * This preserves mapping precedence (company -> global) while avoiding N+1
   * round trips during imports where mappings are preloaded once.
   */
  if (preferredStatementType) {
    const memoryMatch =
      savedMappings.length > 0
        ? findSavedMapping({
            mappings: savedMappings,
            companyId,
            accountName,
            statementType: preferredStatementType
          })
        : await getSavedMapping({
            supabase,
            companyId,
            accountName,
            statementType: preferredStatementType
          });

    if (memoryMatch) {
      const sanitizedMemoryCategory = sanitizeCategoryForStatementType({
        category: memoryMatch.record.category,
        statementType: memoryMatch.record.statement_type
      });
      if (!sanitizedMemoryCategory) {
        console.log("MAPPING MEMORY MISS", {
          accountName,
          normalizedLabel,
          detectedStatementType: preferredStatementType ?? "unspecified",
          reason: "saved_mapping_invalid_for_statement_type"
        });
      } else {
      const savedMapping = memoryMatch.record;
      if (savedMapping.id) {
        void supabase
          .rpc("increment_account_mapping_usage", {
            mapping_id_input: savedMapping.id
          })
          .then(({ error }: { error?: { message?: string | null } | null }) => {
            if (error) {
              console.error("Failed to increment account mapping usage", {
                mappingId: savedMapping.id,
                error
              });
            }
          })
          .catch((error: unknown) => {
            console.error("Failed to increment account mapping usage", {
              mappingId: savedMapping.id,
              error
            });
          });
      }

      return buildResolvedResult({
        category: sanitizedMemoryCategory,
        statementType: savedMapping.statement_type,
        normalizedLabel,
        matchedBy: "memory",
        confidence: "high",
        explanation:
          memoryMatch.scope === "company"
            ? "Previously confirmed mapping for this company."
            : "Previously confirmed global mapping.",
        memoryScope: memoryMatch.scope,
        mappingId: savedMapping.id,
        resolutionSource:
          memoryMatch.scope === "company"
            ? "company_saved_mapping"
            : "global_saved_mapping",
        decisionPath: [
          memoryMatch.scope === "company" ? "company_saved_mapping" : "global_saved_mapping"
        ]
      });
      }
    }
  }

  const fallback = suggestAccountMapping(
    accountName,
    savedMappings,
    preferredStatementType,
    companyId
  );

  return {
    ...fallback,
    normalizedLabel
  };
}
