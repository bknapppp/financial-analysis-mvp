import { normalizeAccountName } from "./auto-mapping.ts";
import { isAccountMappingsSchemaError } from "./account-mapping-schema.ts";
import { insertTaxReturnFinancialContext } from "./financial-sources.ts";
import { findSavedMapping, loadSavedMappings, saveConfirmedMappingToMemory } from "./mapping-memory.ts";
import { getSupabaseServerClient } from "./supabase.ts";
import { devWarn } from "./debug.ts";
import type {
  AccountMapping,
  AuditConfidence,
  AuditMatchedBy,
  FinancialSourceConfidence,
  NormalizedCategory,
  StatementType
} from "./types.ts";

export type ManualTaxRawEntry = {
  accountName: string;
  amount: number;
};

export type ManualTaxPeriodInput = {
  label: string;
  periodDate: string;
  sourcePeriodLabel?: string | null;
  sourceYear?: number | null;
  entries: ManualTaxRawEntry[];
};

export type ManualTaxIngestionPayload = {
  companyId: string;
  sourceType: "tax_return";
  sourceFileName?: string | null;
  uploadId?: string | null;
  sourceCurrency?: string | null;
  sourceConfidence?: FinancialSourceConfidence | null;
  periods: ManualTaxPeriodInput[];
};

export type ManualTaxMappedEntry = {
  rawAccountName: string;
  normalizedAccountName: string;
  amount: number;
  statementType: StatementType;
  mappedCategory: NormalizedCategory;
  mappingMethod: AuditMatchedBy;
  mappingConfidence: AuditConfidence;
  mappingSource: "company_memory" | "shared_memory" | "rule_engine" | "fallback";
  memoryScope: "company" | "shared" | null;
  memorySourceType: "tax_return" | "reported_financials" | "generic" | null;
  matchedMemoryKey: string | null;
  mappingExplanation: string;
  matchedRule: string;
};

export type ManualTaxMappedPeriod = {
  label: string;
  periodDate: string;
  sourcePeriodLabel: string | null;
  sourceYear: number | null;
  entries: ManualTaxMappedEntry[];
};

export type ManualTaxIngestionPlan = {
  companyId: string;
  sourceType: "tax_return";
  sourceFileName: string | null;
  uploadId: string | null;
  sourceCurrency: string | null;
  sourceConfidence: FinancialSourceConfidence | null;
  periods: ManualTaxMappedPeriod[];
};

export type ManualTaxIngestionResult = {
  sourceDocumentId: string;
  companyId: string;
  sourceType: "tax_return";
  sourceFileName: string | null;
  uploadId: string | null;
  periods: Array<
    ManualTaxMappedPeriod & {
      sourcePeriodId: string;
      upsertedCount: number;
      rejectedRows: Array<{ accountName: string; reason: string }>;
    }
  >;
};

export type ManualTaxPreviewRow = {
  accountName: string;
  mappedCategory: NormalizedCategory;
  confidence: AuditConfidence;
  mappingMethod: AuditMatchedBy;
  mappingSource: ManualTaxMappedEntry["mappingSource"];
  flags: string[];
};

type TaxMappingRule = {
  key: string;
  category: NormalizedCategory;
  confidence: AuditConfidence;
  mode: "exact" | "contains";
  patterns: string[];
  explanation: string;
};

const TAX_INCOME_STATEMENT_RULES: TaxMappingRule[] = [
  {
    key: "gross_receipts",
    category: "Revenue",
    confidence: "high",
    mode: "exact",
    patterns: [
      "gross receipts",
      "gross receipts or sales",
      "sales",
      "net sales",
      "gross sales"
    ],
    explanation: "Mapped tax revenue line to canonical Revenue."
  },
  {
    key: "returns_allowances",
    category: "Revenue",
    confidence: "high",
    mode: "exact",
    patterns: ["returns and allowances", "returns allowances", "sales returns and allowances"],
    explanation:
      "Mapped contra-revenue tax line to canonical Revenue and preserved source sign."
  },
  {
    key: "cogs",
    category: "COGS",
    confidence: "high",
    mode: "exact",
    patterns: [
      "cost of goods sold",
      "cost of goods sold and operations",
      "cost of sales",
      "cogs"
    ],
    explanation: "Mapped tax cost line to canonical COGS."
  },
  {
    key: "officer_compensation",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["officer compensation", "compensation of officers"],
    explanation:
      "Mapped officer compensation to Operating Expenses and preserved source detail for future normalization."
  },
  {
    key: "salaries_wages",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["salaries and wages", "wages", "salary", "salaries"],
    explanation: "Mapped payroll-related tax line to Operating Expenses."
  },
  {
    key: "repairs_maintenance",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["repairs and maintenance", "repairs", "maintenance"],
    explanation: "Mapped repairs and maintenance to Operating Expenses."
  },
  {
    key: "bad_debts",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["bad debts", "bad debt expense"],
    explanation: "Mapped bad debt tax line to Operating Expenses."
  },
  {
    key: "rent",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["rent", "rent expense", "rents"],
    explanation: "Mapped rent tax line to Operating Expenses."
  },
  {
    key: "taxes_licenses",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["taxes and licenses", "taxes licenses", "licenses and permits"],
    explanation:
      "Mapped operating tax-and-license line to Operating Expenses rather than income Tax Expense."
  },
  {
    key: "interest",
    category: "Non-operating",
    confidence: "high",
    mode: "exact",
    patterns: ["interest", "interest expense"],
    explanation: "Mapped financing-related tax line to Non-operating."
  },
  {
    key: "depreciation",
    category: "Depreciation / Amortization",
    confidence: "high",
    mode: "exact",
    patterns: ["depreciation", "depreciation expense"],
    explanation: "Mapped tax depreciation line to Depreciation / Amortization."
  },
  {
    key: "amortization",
    category: "Depreciation / Amortization",
    confidence: "high",
    mode: "exact",
    patterns: ["amortization", "amortization expense"],
    explanation: "Mapped tax amortization line to Depreciation / Amortization."
  },
  {
    key: "section_179",
    category: "Depreciation / Amortization",
    confidence: "high",
    mode: "contains",
    patterns: ["section 179", "sec 179", "179 deduction"],
    explanation:
      "Mapped Section 179-style tax depreciation line to Depreciation / Amortization."
  },
  {
    key: "advertising",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["advertising", "advertising expense"],
    explanation: "Mapped advertising tax line to Operating Expenses."
  },
  {
    key: "meals",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["meals", "meals and entertainment", "meals expense"],
    explanation:
      "Mapped meals tax line to Operating Expenses and preserved source detail for future normalization."
  },
  {
    key: "travel",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["travel", "travel expense"],
    explanation: "Mapped travel tax line to Operating Expenses."
  },
  {
    key: "utilities",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["utilities", "utilities expense"],
    explanation: "Mapped utilities tax line to Operating Expenses."
  },
  {
    key: "insurance",
    category: "Operating Expenses",
    confidence: "high",
    mode: "exact",
    patterns: ["insurance", "insurance expense"],
    explanation: "Mapped insurance tax line to Operating Expenses."
  },
  {
    key: "employee_benefits",
    category: "Operating Expenses",
    confidence: "high",
    mode: "contains",
    patterns: [
      "employee benefit",
      "employee benefits",
      "benefit programs",
      "payroll tax",
      "payroll taxes"
    ],
    explanation: "Mapped employee benefits or payroll taxes to Operating Expenses."
  },
  {
    key: "charitable_contributions",
    category: "Non-operating",
    confidence: "medium",
    mode: "contains",
    patterns: ["charitable contribution", "charitable contributions", "donation"],
    explanation:
      "Mapped charitable contribution line to Non-operating as the nearest defensible canonical category."
  },
  {
    key: "other_deductions",
    category: "Operating Expenses",
    confidence: "medium",
    mode: "contains",
    patterns: ["other deductions", "other deduction", "other expense", "other expenses"],
    explanation:
      "Mapped broad catch-all deduction line to Operating Expenses pending future tax normalization."
  },
  {
    key: "taxable_income",
    category: "Pre-tax",
    confidence: "high",
    mode: "contains",
    patterns: ["taxable income", "ordinary business income", "income before taxes"],
    explanation: "Mapped taxable-income style tax line to Pre-tax."
  },
  {
    key: "income_tax_expense",
    category: "Tax Expense",
    confidence: "high",
    mode: "contains",
    patterns: ["income tax", "tax expense", "provision for taxes"],
    explanation: "Mapped income-tax line to Tax Expense."
  },
  {
    key: "net_income",
    category: "Net Income",
    confidence: "high",
    mode: "contains",
    patterns: ["net income", "net earnings"],
    explanation: "Mapped net income line to Net Income."
  }
];

function matchesRule(normalizedAccountName: string, rule: TaxMappingRule) {
  return rule.patterns.find((pattern) => {
    const normalizedPattern = normalizeAccountName(pattern);
    return rule.mode === "exact"
      ? normalizedAccountName === normalizedPattern
      : normalizedAccountName.includes(normalizedPattern);
  });
}

function buildMemoryExplanation(params: {
  scope: "company" | "shared";
  sourceMatch: "exact" | "generic";
}) {
  const scopeLabel =
    params.scope === "company" ? "company-specific memory" : "shared memory";
  const sourceLabel =
    params.sourceMatch === "exact"
      ? "tax-source memory"
      : "generic same-statement memory";

  return `Mapped from ${scopeLabel} using ${sourceLabel}.`;
}

function mapManualTaxEntryFromRules(
  entry: ManualTaxRawEntry,
  normalizedAccountName: string
): ManualTaxMappedEntry {
  const rawAccountName = entry.accountName.trim();

  for (const rule of TAX_INCOME_STATEMENT_RULES) {
    const matchedPattern = matchesRule(normalizedAccountName, rule);

    if (matchedPattern) {
      return {
        rawAccountName,
        normalizedAccountName,
        amount: Number(entry.amount),
        statementType: "income",
        mappedCategory: rule.category,
        mappingMethod: "keyword_rule",
        mappingConfidence: rule.confidence,
        mappingSource: "rule_engine",
        memoryScope: null,
        memorySourceType: null,
        matchedMemoryKey: null,
        mappingExplanation: `${rule.explanation} Rule matched "${matchedPattern}".`,
        matchedRule: rule.key
      };
    }
  }

  return {
    rawAccountName,
    normalizedAccountName,
    amount: Number(entry.amount),
    statementType: "income",
    mappedCategory: "Operating Expenses",
    mappingMethod: "manual",
    mappingConfidence: "low",
    mappingSource: "fallback",
    memoryScope: null,
    memorySourceType: null,
    matchedMemoryKey: null,
    mappingExplanation:
      'No explicit tax mapping rule matched this label. Defaulted to Operating Expenses for v1 while preserving the raw tax line name for review.',
    matchedRule: "fallback_operating_expenses"
  };
}

export function mapManualTaxEntry(entry: ManualTaxRawEntry): ManualTaxMappedEntry {
  const rawAccountName = entry.accountName.trim();
  const normalizedAccountName = normalizeAccountName(rawAccountName);

  return mapManualTaxEntryFromRules(entry, normalizedAccountName);
}

function resolveTaxMemoryMapping(params: {
  companyId: string;
  entry: ManualTaxRawEntry;
  savedMappings: AccountMapping[];
}): ManualTaxMappedEntry | null {
  const memoryMatch = findSavedMapping({
    mappings: params.savedMappings,
    companyId: params.companyId,
    accountName: params.entry.accountName,
    statementType: "income",
    sourceType: "tax_return"
  });

  if (!memoryMatch) {
    return null;
  }

  const rawAccountName = params.entry.accountName.trim();
  const normalizedAccountName = normalizeAccountName(rawAccountName);

  return {
    rawAccountName,
    normalizedAccountName,
    amount: Number(params.entry.amount),
    statementType: memoryMatch.record.statement_type,
    mappedCategory: memoryMatch.record.category,
    mappingMethod: "memory",
    mappingConfidence:
      (memoryMatch.record.confidence as AuditConfidence | null | undefined) ?? "high",
    mappingSource:
      memoryMatch.scope === "company" ? "company_memory" : "shared_memory",
    memoryScope: memoryMatch.scope,
    memorySourceType:
      memoryMatch.record.source_type ??
      (memoryMatch.sourceMatch === "generic" ? "generic" : null),
    matchedMemoryKey: `${memoryMatch.record.normalized_label ?? memoryMatch.record.account_name_key}::${memoryMatch.record.statement_type}`,
    mappingExplanation: buildMemoryExplanation({
      scope: memoryMatch.scope,
      sourceMatch: memoryMatch.sourceMatch
    }),
    matchedRule: memoryMatch.record.matched_rule ?? "memory_match"
  };
}

function buildPreviewFlags(entry: ManualTaxMappedEntry) {
  const flags: string[] = [];

  if (entry.mappedCategory === "Depreciation / Amortization") {
    flags.push("D&A add-back");
  }

  if (
    entry.matchedRule === "officer_compensation" ||
    entry.matchedRule === "meals" ||
    entry.matchedRule === "section_179"
  ) {
    flags.push("Normalization candidate");
  }

  if (entry.matchedRule === "other_deductions") {
    flags.push("Ambiguous bucket");
  }

  if (entry.mappingConfidence === "low") {
    flags.push("Low confidence");
  }

  return flags;
}

export async function resolveManualTaxEntries(params: {
  companyId: string;
  entries: ManualTaxRawEntry[];
  savedMappings?: AccountMapping[];
  supabaseClient?: ReturnType<typeof getSupabaseServerClient>;
}): Promise<ManualTaxMappedEntry[]> {
  const savedMappings =
    params.savedMappings ??
    (await loadSavedMappings({
      supabase: params.supabaseClient ?? getSupabaseServerClient(),
      companyId: params.companyId
    }));

  return params.entries.map((entry) => {
    const rawAccountName = entry.accountName.trim();
    const normalizedAccountName = normalizeAccountName(rawAccountName);
    const memoryResult = resolveTaxMemoryMapping({
      companyId: params.companyId,
      entry: {
        accountName: rawAccountName,
        amount: Number(entry.amount)
      },
      savedMappings
    });

    if (memoryResult) {
      return memoryResult;
    }

    return mapManualTaxEntryFromRules(
      {
        accountName: rawAccountName,
        amount: Number(entry.amount)
      },
      normalizedAccountName
    );
  });
}

export async function buildManualTaxPreviewRows(params: {
  companyId: string;
  entries: ManualTaxRawEntry[];
  savedMappings?: AccountMapping[];
  supabaseClient?: ReturnType<typeof getSupabaseServerClient>;
}): Promise<ManualTaxPreviewRow[]> {
  const mappedEntries = await resolveManualTaxEntries({
    companyId: params.companyId,
    entries: params.entries,
    savedMappings: params.savedMappings,
    supabaseClient: params.supabaseClient
  });

  return mappedEntries
    .filter(
      (entry) =>
        entry.rawAccountName.trim() !== "" &&
        Number.isFinite(Number(entry.amount))
    )
    .map((mappedEntry) => ({
      accountName: mappedEntry.rawAccountName,
      mappedCategory: mappedEntry.mappedCategory,
      confidence: mappedEntry.mappingConfidence,
      mappingMethod: mappedEntry.mappingMethod,
      mappingSource: mappedEntry.mappingSource,
      flags: buildPreviewFlags(mappedEntry)
    }));
}

export async function buildManualTaxIngestionPlan(
  payload: ManualTaxIngestionPayload,
  options?: {
    savedMappings?: AccountMapping[];
    supabaseClient?: ReturnType<typeof getSupabaseServerClient>;
  }
): Promise<ManualTaxIngestionPlan> {
  return {
    companyId: payload.companyId,
    sourceType: "tax_return",
    sourceFileName: payload.sourceFileName ?? null,
    uploadId: payload.uploadId ?? null,
    sourceCurrency: payload.sourceCurrency ?? null,
    sourceConfidence: payload.sourceConfidence ?? "unknown",
    periods: await Promise.all(
      payload.periods.map(async (period) => ({
        label: period.label,
        periodDate: period.periodDate,
        sourcePeriodLabel: period.sourcePeriodLabel ?? period.label,
        sourceYear: period.sourceYear ?? null,
        entries: await resolveManualTaxEntries({
          companyId: payload.companyId,
          entries: period.entries,
          savedMappings: options?.savedMappings,
          supabaseClient: options?.supabaseClient
        })
      }))
    )
  };
}

type InMemoryStore = {
  nextId: number;
  documents: Array<{
    id: string;
    companyId: string;
    sourceType: "tax_return";
    sourceFileName: string | null;
    uploadId: string | null;
    sourceCurrency: string | null;
    sourceConfidence: FinancialSourceConfidence | null;
  }>;
  periods: Array<{
    id: string;
    sourceDocumentId: string;
    label: string;
    periodDate: string;
    sourcePeriodLabel: string | null;
    sourceYear: number | null;
  }>;
  entries: Array<{
    id: string;
    sourcePeriodId: string;
    accountName: string;
    statementType: "income";
    amount: number;
    category: NormalizedCategory;
    matchedBy: AuditMatchedBy;
    confidence: AuditConfidence;
    mappingExplanation: string;
  }>;
};

function nextMemoryId(store: InMemoryStore, prefix: string) {
  store.nextId += 1;
  return `${prefix}-${store.nextId}`;
}

export function createEmptyInMemoryTaxStore(): InMemoryStore {
  return {
    nextId: 0,
    documents: [],
    periods: [],
    entries: []
  };
}

export function applyManualTaxIngestionPlanToStore(
  store: InMemoryStore,
  plan: ManualTaxIngestionPlan
) {
  let document =
    store.documents.find(
      (candidate) =>
        candidate.companyId === plan.companyId &&
        candidate.sourceType === "tax_return" &&
        candidate.uploadId === plan.uploadId
    ) ?? null;

  if (!document) {
    document = {
      id: nextMemoryId(store, "doc"),
      companyId: plan.companyId,
      sourceType: "tax_return",
      sourceFileName: plan.sourceFileName,
      uploadId: plan.uploadId,
      sourceCurrency: plan.sourceCurrency,
      sourceConfidence: plan.sourceConfidence
    };
    store.documents.push(document);
  } else {
    document.sourceFileName = plan.sourceFileName;
    document.sourceCurrency = plan.sourceCurrency;
    document.sourceConfidence = plan.sourceConfidence;
  }

  const periods = plan.periods.map((periodPlan) => {
    let period =
      store.periods.find(
        (candidate) =>
          candidate.sourceDocumentId === document.id &&
          candidate.label === periodPlan.label &&
          candidate.periodDate === periodPlan.periodDate
      ) ?? null;

    if (!period) {
      period = {
        id: nextMemoryId(store, "period"),
        sourceDocumentId: document.id,
        label: periodPlan.label,
        periodDate: periodPlan.periodDate,
        sourcePeriodLabel: periodPlan.sourcePeriodLabel,
        sourceYear: periodPlan.sourceYear
      };
      store.periods.push(period);
    } else {
      period.sourcePeriodLabel = periodPlan.sourcePeriodLabel;
      period.sourceYear = periodPlan.sourceYear;
    }

    const seenKeys = new Set<string>();
    for (const entry of periodPlan.entries) {
      const logicalKey = `${period.id}::${entry.rawAccountName.trim().toLowerCase()}::${entry.statementType}`;
      if (seenKeys.has(logicalKey)) {
        continue;
      }

      seenKeys.add(logicalKey);

      const existingEntry = store.entries.find(
        (candidate) =>
          candidate.sourcePeriodId === period!.id &&
          candidate.accountName.trim().toLowerCase() ===
            entry.rawAccountName.trim().toLowerCase() &&
          candidate.statementType === entry.statementType
      );

      if (existingEntry) {
        existingEntry.amount = entry.amount;
        existingEntry.category = entry.mappedCategory;
        existingEntry.matchedBy = entry.mappingMethod;
        existingEntry.confidence = entry.mappingConfidence;
        existingEntry.mappingExplanation = entry.mappingExplanation;
      } else {
        store.entries.push({
          id: nextMemoryId(store, "entry"),
          sourcePeriodId: period.id,
          accountName: entry.rawAccountName,
          statementType: "income",
          amount: entry.amount,
          category: entry.mappedCategory,
          matchedBy: entry.mappingMethod,
          confidence: entry.mappingConfidence,
          mappingExplanation: entry.mappingExplanation
        });
      }
    }

    return period;
  });

  return {
    sourceDocumentId: document.id,
    periods
  };
}

export async function ingestManualTaxPayload(
  payload: ManualTaxIngestionPayload,
  options?: {
    supabaseClient?: ReturnType<typeof getSupabaseServerClient>;
    savedMappings?: AccountMapping[];
  }
): Promise<ManualTaxIngestionResult> {
  const supabase = options?.supabaseClient ?? getSupabaseServerClient();
  const savedMappings =
    options?.savedMappings ??
    (await loadSavedMappings({
      supabase,
      companyId: payload.companyId
    }));
  const plan = await buildManualTaxIngestionPlan(payload, {
    savedMappings,
    supabaseClient: supabase
  });

  let sourceDocumentId: string | null = null;
  const periodResults: ManualTaxIngestionResult["periods"] = [];

  for (const period of plan.periods) {
    const result = await insertTaxReturnFinancialContext({
      companyId: plan.companyId,
      sourceFileName: plan.sourceFileName,
      uploadId: plan.uploadId,
      sourceDocumentId,
      sourceCurrency: plan.sourceCurrency,
      sourceConfidence: plan.sourceConfidence,
      periodLabel: period.label,
      periodDate: period.periodDate,
      sourcePeriodLabel: period.sourcePeriodLabel,
      sourceYear: period.sourceYear,
      rows: period.entries.map((entry) => ({
        accountName: entry.rawAccountName,
        amount: entry.amount,
        statementType: entry.statementType,
        category: entry.mappedCategory,
        matchedBy: entry.mappingMethod,
        confidence: entry.mappingConfidence,
        mappingExplanation: entry.mappingExplanation
      })),
      supabaseClient: supabase
    });

    sourceDocumentId = result.sourceDocumentId;
    periodResults.push({
      ...period,
      sourcePeriodId: result.sourcePeriodId,
      upsertedCount: result.insertedCount,
      rejectedRows: result.rejectedRows
    });
  }

  for (const period of plan.periods) {
    for (const entry of period.entries) {
      try {
        await saveConfirmedMappingToMemory({
          supabase,
          companyId: plan.companyId,
          accountName: entry.rawAccountName,
          statementType: entry.statementType,
          sourceType: "tax_return",
          concept: entry.mappedCategory,
          category: entry.mappedCategory,
          source: "tax_manual_ingestion",
          confidence: entry.mappingConfidence,
          mappingMethod: entry.mappingMethod,
          mappingExplanation: entry.mappingExplanation,
          matchedRule: entry.matchedRule
        });
      } catch (error) {
        if (
          isAccountMappingsSchemaError(
            error as { code?: string | null; message?: string | null } | null | undefined
          )
        ) {
          devWarn("Skipping tax mapping memory writeback because account mappings schema is unavailable.", {
            companyId: plan.companyId,
            accountName: entry.rawAccountName
          });
          continue;
        }

        throw error;
      }
    }
  }

  return {
    sourceDocumentId: sourceDocumentId ?? "",
    companyId: plan.companyId,
    sourceType: "tax_return",
    sourceFileName: plan.sourceFileName,
    uploadId: plan.uploadId,
    periods: periodResults
  };
}

export function buildManualTaxDevFixtures(companyId: string): ManualTaxIngestionPayload[] {
  return [
    {
      companyId,
      sourceType: "tax_return",
      sourceFileName: "2023-1120-manual.json",
      uploadId: `manual-tax-${companyId}-fy2023`,
      sourceCurrency: "USD",
      sourceConfidence: "unknown",
      periods: [
        {
          label: "FY2023",
          periodDate: "2023-12-31",
          sourcePeriodLabel: "Tax Year 2023",
          sourceYear: 2023,
          entries: [
            { accountName: "Gross receipts", amount: 5200000 },
            { accountName: "Returns and allowances", amount: -100000 },
            { accountName: "Cost of goods sold", amount: -2800000 },
            { accountName: "Officer compensation", amount: -450000 },
            { accountName: "Salaries and wages", amount: -600000 },
            { accountName: "Rent", amount: -120000 },
            { accountName: "Depreciation", amount: -90000 },
            { accountName: "Interest", amount: -70000 },
            { accountName: "Meals", amount: -20000 },
            { accountName: "Other deductions", amount: -150000 }
          ]
        }
      ]
    },
    {
      companyId,
      sourceType: "tax_return",
      sourceFileName: "2022-2023-1120-manual.json",
      uploadId: `manual-tax-${companyId}-fy2022-fy2023`,
      sourceCurrency: "USD",
      sourceConfidence: "unknown",
      periods: [
        {
          label: "FY2022",
          periodDate: "2022-12-31",
          sourcePeriodLabel: "Tax Year 2022",
          sourceYear: 2022,
          entries: [
            { accountName: "Gross receipts", amount: 4700000 },
            { accountName: "Cost of goods sold", amount: -2550000 },
            { accountName: "Salaries and wages", amount: -560000 },
            { accountName: "Rent", amount: -115000 },
            { accountName: "Utilities", amount: -48000 },
            { accountName: "Depreciation", amount: -85000 },
            { accountName: "Interest", amount: -64000 },
            { accountName: "Other deductions", amount: -142000 }
          ]
        },
        {
          label: "FY2023",
          periodDate: "2023-12-31",
          sourcePeriodLabel: "Tax Year 2023",
          sourceYear: 2023,
          entries: [
            { accountName: "Gross receipts", amount: 5200000 },
            { accountName: "Returns and allowances", amount: -100000 },
            { accountName: "Cost of goods sold", amount: -2800000 },
            { accountName: "Officer compensation", amount: -450000 },
            { accountName: "Salaries and wages", amount: -600000 },
            { accountName: "Rent", amount: -120000 },
            { accountName: "Depreciation", amount: -90000 },
            { accountName: "Interest", amount: -70000 },
            { accountName: "Meals", amount: -20000 },
            { accountName: "Other deductions", amount: -150000 }
          ]
        }
      ]
    }
  ];
}
