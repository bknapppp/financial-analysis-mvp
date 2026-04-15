import assert from "node:assert/strict";
import {
  getMappingCategoryLabel,
  getMappingCategoryOptions,
  resolveAccountMapping,
  suggestAccountMapping
} from "./auto-mapping.ts";
import { normalizeMappingLabel } from "./mapping-memory.ts";
import type { AccountMapping } from "./types.ts";

function expectMapping(
  label: string,
  expected: {
    concept: string | null;
    category: string | null;
    confidence: "high" | "medium" | "low";
  },
  preferredStatementType?: "income" | "balance_sheet"
) {
  const result = suggestAccountMapping(label, [], preferredStatementType ?? null);

  assert.equal(result.concept, expected.concept, `Unexpected concept for ${label}`);
  assert.equal(result.category, expected.category, `Unexpected category for ${label}`);
  assert.equal(
    result.confidence,
    expected.confidence,
    `Unexpected confidence for ${label}`
  );
}

expectMapping("Sales", {
  concept: "Revenue",
  category: "Revenue",
  confidence: "high"
});
expectMapping("Revenue", {
  concept: "Revenue",
  category: "Revenue",
  confidence: "high"
});
expectMapping("Cost of Revenue", {
  concept: "COGS",
  category: "COGS",
  confidence: "high"
});
expectMapping("Cost of Sales", {
  concept: "COGS",
  category: "COGS",
  confidence: "high"
});
expectMapping("Gross Profit", {
  concept: "Gross Profit",
  category: "Gross Profit",
  confidence: "high"
});
assert.notEqual(suggestAccountMapping("Gross Profit", []).category, "Revenue");
expectMapping("Gross Income", {
  concept: "Gross Profit",
  category: "Gross Profit",
  confidence: "high"
});
expectMapping("Operating Expenses", {
  concept: "Operating Expenses",
  category: "Operating Expenses",
  confidence: "high"
});
expectMapping("SG&A Expense", {
  concept: "Operating Expenses",
  category: "Operating Expenses",
  confidence: "high"
});
expectMapping("Selling & Marketing Expense", {
  concept: "Operating Expenses",
  category: "Operating Expenses",
  confidence: "high"
});
expectMapping("General & Admin Expense", {
  concept: "Operating Expenses",
  category: "Operating Expenses",
  confidence: "high"
});
expectMapping("Research and Development Expense", {
  concept: "Operating Expenses",
  category: "Operating Expenses",
  confidence: "high"
});
expectMapping("Dep. & Amort.", {
  concept: "Depreciation / Amortization",
  category: "Depreciation / Amortization",
  confidence: "high"
});
expectMapping("Depreciation and Amortization", {
  concept: "Depreciation / Amortization",
  category: "Depreciation / Amortization",
  confidence: "high"
});
expectMapping("EBITDA", {
  concept: "EBITDA",
  category: "EBITDA",
  confidence: "high"
});
expectMapping("EBITDA Non-GAAP", {
  concept: "EBITDA",
  category: "EBITDA",
  confidence: "high"
});
expectMapping("Operating Income", {
  concept: "Operating Income",
  category: "Operating Income",
  confidence: "high"
});
expectMapping("Pretax Income", {
  concept: "Pre-tax / EBT",
  category: "Pre-tax",
  confidence: "high"
});
expectMapping("Income Before Tax", {
  concept: "Pre-tax / EBT",
  category: "Pre-tax",
  confidence: "high"
});
assert.notEqual(suggestAccountMapping("Income Before Tax", []).category, "Revenue");
expectMapping("Net Income", {
  concept: "Net Income",
  category: "Net Income",
  confidence: "high"
});
expectMapping("Interest Expense", {
  concept: "Non-operating",
  category: "Non-operating",
  confidence: "high"
});
expectMapping("Other Expenses", {
  concept: "Operating Expenses",
  category: "Operating Expenses",
  confidence: "high"
});
expectMapping("Tax Expense", {
  concept: "Tax Expense",
  category: "Tax Expense",
  confidence: "high"
});
assert.notEqual(suggestAccountMapping("Tax Expense", []).category, "Revenue");
assert.notEqual(suggestAccountMapping("Other Expense", []).category, "Revenue");
expectMapping("Other Expense", {
  concept: "Operating Expenses",
  category: "Operating Expenses",
  confidence: "high"
});
expectMapping("Random Ambiguous Label", {
  concept: null,
  category: null,
  confidence: "low"
});

expectMapping(
  "Cash",
  {
    concept: "Cash",
    category: "current_assets.cash",
    confidence: "high"
  },
  "balance_sheet"
);
expectMapping(
  "Accounts Receivable",
  {
    concept: "Accounts Receivable",
    category: "current_assets.accounts_receivable",
    confidence: "high"
  },
  "balance_sheet"
);
expectMapping(
  "Inventory",
  {
    concept: "Inventory",
    category: "current_assets.inventory",
    confidence: "high"
  },
  "balance_sheet"
);
expectMapping(
  "PPE",
  {
    concept: "PPE",
    category: "non_current_assets.ppe",
    confidence: "high"
  },
  "balance_sheet"
);
expectMapping(
  "Accounts Payable",
  {
    concept: "Accounts Payable",
    category: "current_liabilities.accounts_payable",
    confidence: "high"
  },
  "balance_sheet"
);
expectMapping(
  "Short Term Debt",
  {
    concept: "Short Term Debt",
    category: "current_liabilities.short_term_debt",
    confidence: "high"
  },
  "balance_sheet"
);
expectMapping(
  "Long Term Debt",
  {
    concept: "Long Term Debt",
    category: "non_current_liabilities.long_term_debt",
    confidence: "high"
  },
  "balance_sheet"
);
expectMapping(
  "Common Stock",
  {
    concept: "Common Stock",
    category: "equity.common_stock",
    confidence: "high"
  },
  "balance_sheet"
);
expectMapping(
  "Retained Earnings",
  {
    concept: "Retained Earnings",
    category: "equity.retained_earnings",
    confidence: "high"
  },
  "balance_sheet"
);

const interestExpense = suggestAccountMapping("Interest Expense", []);
assert.notEqual(interestExpense.category, "Revenue");

const taxExpense = suggestAccountMapping("Tax Expense", []);
assert.notEqual(taxExpense.category, "Revenue");

const savedMappings: AccountMapping[] = [
  {
    id: "memory-1",
    company_id: "company-a",
    account_name: "Common Stock",
    account_name_key: normalizeMappingLabel("Common Stock"),
    category: "equity.common_stock",
    statement_type: "balance_sheet",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const memoryApplied = suggestAccountMapping(
  "Common Stock",
  savedMappings,
  "balance_sheet",
  "company-a",
  "reported_financials"
);
assert.equal(memoryApplied.matchedBy, "memory");
assert.equal(memoryApplied.category, "equity.common_stock");
assert.equal(memoryApplied.statementType, "balance_sheet");
assert.equal(memoryApplied.mappingSource, "company_memory");

const sourceAwareSavedMappings: AccountMapping[] = [
  {
    id: "tax-memory-1",
    company_id: "company-a",
    account_name: "Gross receipts",
    account_name_key: normalizeMappingLabel("Gross receipts"),
    normalized_label: normalizeMappingLabel("Gross receipts"),
    category: "Revenue",
    statement_type: "income",
    source_type: "tax_return",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "generic-memory-1",
    company_id: null,
    account_name: "Gross receipts",
    account_name_key: normalizeMappingLabel("Gross receipts"),
    normalized_label: normalizeMappingLabel("Gross receipts"),
    category: "Operating Expenses",
    statement_type: "income",
    source_type: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const taxMemoryApplied = suggestAccountMapping(
  "Gross receipts",
  sourceAwareSavedMappings,
  "income",
  "company-a",
  "tax_return"
);
assert.equal(taxMemoryApplied.matchedBy, "memory");
assert.equal(taxMemoryApplied.category, "Revenue");
assert.equal(taxMemoryApplied.memorySourceType, "tax_return");

const reportedFallsBackToGenericMemory = suggestAccountMapping(
  "Gross receipts",
  sourceAwareSavedMappings,
  "income",
  "company-a",
  "reported_financials"
);
assert.equal(reportedFallsBackToGenericMemory.matchedBy, "memory");
assert.equal(reportedFallsBackToGenericMemory.category, "Operating Expenses");
assert.equal(reportedFallsBackToGenericMemory.memorySourceType, "generic");

let inMemoryLookupDbCalls = 0;
const throwingSupabase = {
  from() {
    inMemoryLookupDbCalls += 1;
    throw new Error("DB lookup should not run when savedMappings are preloaded.");
  },
  rpc() {
    return Promise.resolve({ error: null });
  }
};

const resolvedFromPreloadedMappings = await resolveAccountMapping({
  supabase: throwingSupabase,
  accountName: "Common Stock",
  savedMappings,
  preferredStatementType: "balance_sheet",
  companyId: "company-a",
  sourceType: "reported_financials"
});
assert.equal(resolvedFromPreloadedMappings.matchedBy, "memory");
assert.equal(resolvedFromPreloadedMappings.category, "equity.common_stock");
assert.equal(inMemoryLookupDbCalls, 0);

let fallbackDbCalls = 0;
const fallbackSupabase = {
  from() {
    fallbackDbCalls += 1;
    return {
      select() {
        return this;
      },
      eq() {
        return this;
      },
      is() {
        return this;
      },
      async maybeSingle() {
        return { data: null, error: null };
      }
    };
  }
};

const resolvedWithoutPreload = await resolveAccountMapping({
  supabase: fallbackSupabase,
  accountName: "Revenue",
  savedMappings: [],
  preferredStatementType: "income",
  companyId: "company-a",
  sourceType: "reported_financials"
});
assert.equal(fallbackDbCalls > 0, true);
assert.equal(resolvedWithoutPreload.category, "Revenue");

const incomeOptions = getMappingCategoryOptions("income");
assert.ok(incomeOptions.every((option) => !option.value.includes(".")));
assert.equal(incomeOptions.some((option) => option.value === "Revenue"), true);
assert.equal(
  incomeOptions.some((option) => option.value === "current_assets.cash"),
  false
);

const balanceSheetOptions = getMappingCategoryOptions("balance_sheet");
assert.equal(
  balanceSheetOptions.some((option) => option.value === "current_assets.cash"),
  true
);
assert.equal(
  balanceSheetOptions.some((option) => option.value === "Revenue"),
  false
);
assert.equal(
  balanceSheetOptions.some((option) => option.value === "current_assets"),
  false
);
assert.equal(
  balanceSheetOptions.find((option) => option.value === "current_assets.cash")?.label,
  "Cash"
);
assert.equal(
  getMappingCategoryLabel("non_current_liabilities.long_term_debt"),
  "Long-term Debt"
);

console.log("auto-mapping tests passed");
