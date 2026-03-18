import type { AccountMapping, NormalizedCategory, StatementType } from "@/lib/types";

export type AutoMappingResult = {
  category: NormalizedCategory | null;
  statementType: StatementType | null;
  matchedBy: "saved_mapping" | "keyword_rule" | "unmapped";
  confidence: "high" | "medium" | "low";
  explanation: string;
};

const KEYWORD_RULES: Array<{
  category: NormalizedCategory;
  keywords: string[];
}> = [
  {
    category: "Revenue",
    keywords: ["revenue", "sales", "service income", "subscription", "income"]
  },
  {
    category: "COGS",
    keywords: [
      "cogs",
      "cost of goods",
      "cost of sales",
      "materials",
      "inventory",
      "freight"
    ]
  },
  {
    category: "Operating Expenses",
    keywords: [
      "rent",
      "payroll",
      "salary",
      "wages",
      "marketing",
      "insurance",
      "legal",
      "professional fees",
      "utilities",
      "software",
      "expense"
    ]
  },
  {
    category: "Assets",
    keywords: [
      "cash",
      "receivable",
      "inventory asset",
      "prepaid",
      "equipment",
      "asset"
    ]
  },
  {
    category: "Liabilities",
    keywords: ["payable", "debt", "loan", "accrued", "liability", "credit card"]
  },
  {
    category: "Equity",
    keywords: ["equity", "retained earnings", "owner", "capital", "draw"]
  }
];

export function normalizeAccountName(accountName: string) {
  return accountName.trim().toLowerCase().replace(/\s+/g, " ");
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
    category === "Operating Expenses"
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

  if (["income", "p&l", "pnl", "income statement"].includes(normalized)) {
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

  if (normalized === "revenue") return "Revenue";
  if (normalized === "cogs") return "COGS";
  if (normalized === "operating expenses" || normalized === "opex") {
    return "Operating Expenses";
  }
  if (normalized === "assets" || normalized === "asset") return "Assets";
  if (normalized === "liabilities" || normalized === "liability") {
    return "Liabilities";
  }
  if (normalized === "equity") return "Equity";

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

export function suggestAccountMapping(
  accountName: string,
  savedMappings: AccountMapping[] = []
): AutoMappingResult {
  const normalizedAccountName = normalizeAccountName(accountName);

  const savedMapping = savedMappings.find(
    (mapping) => mapping.account_name_key === normalizedAccountName
  );

  if (savedMapping) {
    return {
      category: savedMapping.category,
      statementType: savedMapping.statement_type,
      matchedBy: "saved_mapping",
      confidence: "high",
      explanation: "Using saved mapping for this company."
    };
  }

  for (const rule of KEYWORD_RULES) {
    const matchedKeyword = rule.keywords.find((keyword) =>
      normalizedAccountName.includes(keyword)
    );

    if (matchedKeyword) {
      return {
        category: rule.category,
        statementType: inferStatementTypeFromCategory(rule.category),
        matchedBy: "keyword_rule",
        confidence: "medium",
        explanation: `Matched via keyword rule: "${matchedKeyword}" -> ${rule.category}.`
      };
    }
  }

  return {
    category: null,
    statementType: null,
    matchedBy: "unmapped",
    confidence: "low",
    explanation: "No saved mapping or keyword rule matched this account."
  };
}
