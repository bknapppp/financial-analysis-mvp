import { getTaxFinancialsForDealPeriod } from "./financial-sources.ts";
import { normalizeAccountName } from "./auto-mapping.ts";
import type {
  AuditConfidence,
  SourceFinancialEntry,
  SourceReportingPeriod
} from "./types.ts";

type TaxEarningsBucket =
  | "gross_revenue"
  | "contra_revenue"
  | "cogs"
  | "officer_compensation"
  | "salaries_and_wages"
  | "rent"
  | "advertising"
  | "repairs_and_maintenance"
  | "utilities"
  | "insurance"
  | "taxes_and_licenses"
  | "payroll_taxes_and_benefits"
  | "meals"
  | "travel"
  | "other_deductions"
  | "operating_expenses_other"
  | "depreciation"
  | "amortization"
  | "section_179"
  | "interest"
  | "income_taxes"
  | "non_operating_other"
  | "net_income"
  | "pre_tax";

type TaxBucketRule = {
  bucket: TaxEarningsBucket;
  mode: "exact" | "contains";
  patterns: string[];
  explanation: string;
};

const TAX_BUCKET_RULES: TaxBucketRule[] = [
  {
    bucket: "contra_revenue",
    mode: "contains",
    patterns: ["returns and allowances", "returns allowances", "sales returns"],
    explanation: "Classified as contra-revenue because the raw tax line references returns or allowances."
  },
  {
    bucket: "gross_revenue",
    mode: "contains",
    patterns: ["gross receipts", "gross sales", "net sales", "sales"],
    explanation: "Classified as gross revenue from the raw tax line label."
  },
  {
    bucket: "cogs",
    mode: "contains",
    patterns: ["cost of goods sold", "cost of sales", "cogs"],
    explanation: "Classified as COGS from the raw tax line label."
  },
  {
    bucket: "officer_compensation",
    mode: "contains",
    patterns: ["officer compensation", "compensation of officers"],
    explanation: "Classified as officer compensation for separate normalization-sensitive disclosure."
  },
  {
    bucket: "salaries_and_wages",
    mode: "contains",
    patterns: ["salaries and wages", "salary", "salaries", "wages"],
    explanation: "Classified as salaries and wages."
  },
  {
    bucket: "rent",
    mode: "contains",
    patterns: ["rent"],
    explanation: "Classified as rent."
  },
  {
    bucket: "advertising",
    mode: "contains",
    patterns: ["advertising"],
    explanation: "Classified as advertising."
  },
  {
    bucket: "repairs_and_maintenance",
    mode: "contains",
    patterns: ["repairs and maintenance", "repairs", "maintenance"],
    explanation: "Classified as repairs and maintenance."
  },
  {
    bucket: "utilities",
    mode: "contains",
    patterns: ["utilities"],
    explanation: "Classified as utilities."
  },
  {
    bucket: "insurance",
    mode: "contains",
    patterns: ["insurance"],
    explanation: "Classified as insurance."
  },
  {
    bucket: "taxes_and_licenses",
    mode: "contains",
    patterns: ["taxes and licenses", "taxes licenses", "licenses and permits"],
    explanation: "Classified as operating taxes and licenses."
  },
  {
    bucket: "payroll_taxes_and_benefits",
    mode: "contains",
    patterns: ["payroll taxes", "payroll tax", "employee benefits", "benefit programs"],
    explanation: "Classified as payroll taxes or employee benefits."
  },
  {
    bucket: "meals",
    mode: "contains",
    patterns: ["meals", "meals and entertainment"],
    explanation: "Classified as meals for separate discretionary-expense visibility."
  },
  {
    bucket: "travel",
    mode: "contains",
    patterns: ["travel"],
    explanation: "Classified as travel."
  },
  {
    bucket: "other_deductions",
    mode: "contains",
    patterns: ["other deductions", "other deduction"],
    explanation: "Classified as other deductions and treated as an ambiguity bucket."
  },
  {
    bucket: "section_179",
    mode: "contains",
    patterns: ["section 179", "sec 179", "179 deduction"],
    explanation: "Classified as Section 179 or tax-style depreciation."
  },
  {
    bucket: "depreciation",
    mode: "contains",
    patterns: ["depreciation"],
    explanation: "Classified as depreciation."
  },
  {
    bucket: "amortization",
    mode: "contains",
    patterns: ["amortization"],
    explanation: "Classified as amortization."
  },
  {
    bucket: "interest",
    mode: "contains",
    patterns: ["interest"],
    explanation: "Classified as interest."
  },
  {
    bucket: "income_taxes",
    mode: "contains",
    patterns: ["income tax", "tax expense", "provision for taxes"],
    explanation: "Classified as income taxes."
  },
  {
    bucket: "pre_tax",
    mode: "contains",
    patterns: ["taxable income", "ordinary business income", "income before taxes"],
    explanation: "Classified as pre-tax income reference."
  },
  {
    bucket: "net_income",
    mode: "contains",
    patterns: ["net income", "net earnings"],
    explanation: "Classified as net income reference."
  }
];

const FOUND_COMPONENT_KEYS = [
  "grossRevenue",
  "contraRevenue",
  "cogs",
  "operatingExpensesBeforeDandA",
  "depreciation",
  "amortization",
  "interest",
  "incomeTaxes"
] as const;

type FoundComponentKey = (typeof FOUND_COMPONENT_KEYS)[number];

export type TaxEbitdaTraceRow = {
  entryId: string;
  accountName: string;
  amount: number;
  mappedCategory: SourceFinancialEntry["category"];
  bucket: TaxEarningsBucket;
  bucketExplanation: string;
  mappingConfidence: AuditConfidence | "unknown";
  mappingExplanation: string | null;
};

export type TaxEbitdaComponents = {
  grossRevenue: number;
  contraRevenue: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  officerCompensation: number;
  salariesAndWages: number;
  rent: number;
  advertising: number;
  repairsAndMaintenance: number;
  utilities: number;
  insurance: number;
  taxesAndLicenses: number;
  payrollTaxesAndBenefits: number;
  meals: number;
  travel: number;
  otherDeductions: number;
  operatingExpensesOther: number;
  operatingExpensesBeforeDandA: number;
  depreciation: number;
  amortization: number;
  section179: number;
  interest: number;
  incomeTaxes: number;
  nonOperatingOther: number;
};

export type TaxEbitdaDisplayComponents = {
  grossRevenue: number;
  contraRevenue: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  officerCompensation: number;
  salariesAndWages: number;
  rent: number;
  advertising: number;
  repairsAndMaintenance: number;
  utilities: number;
  insurance: number;
  taxesAndLicenses: number;
  payrollTaxesAndBenefits: number;
  meals: number;
  travel: number;
  otherDeductions: number;
  operatingExpensesOther: number;
  operatingExpensesBeforeDandA: number;
  depreciation: number;
  amortization: number;
  section179: number;
  interest: number;
  incomeTaxes: number;
  nonOperatingOther: number;
};

export type TaxEbitdaFormula = {
  signConvention: string;
  humanReadableFormula: string;
  humanReadableFormulaIncludingInterest: string;
  interestIncludedInStandardEBITDA: false;
  interestIncludedInAlternateMetric: true;
  calculationSteps: string[];
};

export type TaxNormalizationCandidate = {
  type:
    | "officer_compensation"
    | "meals"
    | "section_179"
    | "other_deductions";
  amount: number;
  status:
    | "flagged_not_applied"
    | "treated_in_tax_ebitda_not_addbacked"
    | "applied";
  explanation: string;
};

export type TaxNormalizationSummary = {
  appliedAdjustments: Array<{
    type: string;
    amount: number;
    explanation: string;
  }>;
  flaggedCandidates: TaxNormalizationCandidate[];
  normalizedTaxEBITDA: number | null;
};

export type TaxEbitdaCoverage = {
  computable: boolean;
  status: "complete" | "partial" | "insufficient";
  requiredComponentsFound: FoundComponentKey[];
  missingComponents: FoundComponentKey[];
  confidenceNote: string;
  notes: string[];
};

export type TaxDerivedEbitdaResult = {
  companyId: string;
  sourceType: "tax_return";
  sourcePeriodId: string;
  periodLabel: string | null;
  periodDate: string | null;
  entryCount: number;
  components: {
    rawSigned: TaxEbitdaComponents;
    display: TaxEbitdaDisplayComponents;
  };
  formula: TaxEbitdaFormula;
  taxDerivedEBITDA: number | null;
  taxDerivedEBITDAIncludingInterest: number | null;
  normalization: TaxNormalizationSummary;
  coverage: TaxEbitdaCoverage;
  traceRows: TaxEbitdaTraceRow[];
};

function zeroComponents(): TaxEbitdaComponents {
  return {
    grossRevenue: 0,
    contraRevenue: 0,
    netRevenue: 0,
    cogs: 0,
    grossProfit: 0,
    officerCompensation: 0,
    salariesAndWages: 0,
    rent: 0,
    advertising: 0,
    repairsAndMaintenance: 0,
    utilities: 0,
    insurance: 0,
    taxesAndLicenses: 0,
    payrollTaxesAndBenefits: 0,
    meals: 0,
    travel: 0,
    otherDeductions: 0,
    operatingExpensesOther: 0,
    operatingExpensesBeforeDandA: 0,
    depreciation: 0,
    amortization: 0,
    section179: 0,
    interest: 0,
    incomeTaxes: 0,
    nonOperatingOther: 0
  };
}

function toDisplayAmount(value: number) {
  return Math.abs(value);
}

function buildDisplayComponents(
  components: TaxEbitdaComponents
): TaxEbitdaDisplayComponents {
  return {
    grossRevenue: toDisplayAmount(components.grossRevenue),
    contraRevenue: toDisplayAmount(components.contraRevenue),
    netRevenue: toDisplayAmount(components.netRevenue),
    cogs: toDisplayAmount(components.cogs),
    grossProfit: toDisplayAmount(components.grossProfit),
    officerCompensation: toDisplayAmount(components.officerCompensation),
    salariesAndWages: toDisplayAmount(components.salariesAndWages),
    rent: toDisplayAmount(components.rent),
    advertising: toDisplayAmount(components.advertising),
    repairsAndMaintenance: toDisplayAmount(components.repairsAndMaintenance),
    utilities: toDisplayAmount(components.utilities),
    insurance: toDisplayAmount(components.insurance),
    taxesAndLicenses: toDisplayAmount(components.taxesAndLicenses),
    payrollTaxesAndBenefits: toDisplayAmount(components.payrollTaxesAndBenefits),
    meals: toDisplayAmount(components.meals),
    travel: toDisplayAmount(components.travel),
    otherDeductions: toDisplayAmount(components.otherDeductions),
    operatingExpensesOther: toDisplayAmount(components.operatingExpensesOther),
    operatingExpensesBeforeDandA: toDisplayAmount(
      components.operatingExpensesBeforeDandA
    ),
    depreciation: toDisplayAmount(components.depreciation),
    amortization: toDisplayAmount(components.amortization),
    section179: toDisplayAmount(components.section179),
    interest: toDisplayAmount(components.interest),
    incomeTaxes: toDisplayAmount(components.incomeTaxes),
    nonOperatingOther: toDisplayAmount(components.nonOperatingOther)
  };
}

function buildFormula(): TaxEbitdaFormula {
  return {
    signConvention:
      "Revenue is expected as positive. Expense-like inputs such as COGS, operating expenses, depreciation, amortization, and interest are stored as signed negatives in the raw components.",
    humanReadableFormula:
      "EBITDA = Net Revenue - COGS - Operating Expenses (before D&A) + Depreciation + Amortization",
    humanReadableFormulaIncludingInterest:
      "EBITDA + Interest = Net Revenue - COGS - Operating Expenses (before D&A) + Depreciation + Amortization + Interest",
    interestIncludedInStandardEBITDA: false,
    interestIncludedInAlternateMetric: true,
    calculationSteps: [
      "Net Revenue = Gross Revenue - Contra Revenue",
      "Gross Profit = Net Revenue - COGS",
      "Operating Expenses (before D&A) excludes depreciation and amortization buckets",
      "Standard tax-derived EBITDA adds back depreciation and amortization only",
      "The alternate interest-inclusive metric adds interest on top of standard EBITDA"
    ]
  };
}

function normalizeTaxLabel(accountName: string) {
  return normalizeAccountName(accountName);
}

function matchBucket(normalizedAccountName: string) {
  for (const rule of TAX_BUCKET_RULES) {
    const matchedPattern = rule.patterns.find((pattern) => {
      const normalizedPattern = normalizeTaxLabel(pattern);
      return rule.mode === "exact"
        ? normalizedAccountName === normalizedPattern
        : normalizedAccountName.includes(normalizedPattern);
    });

    if (matchedPattern) {
      return {
        bucket: rule.bucket,
        explanation: `${rule.explanation} Matched "${matchedPattern}".`
      };
    }
  }

  return null;
}

export function classifyTaxEbitdaBucket(entry: SourceFinancialEntry) {
  const normalizedAccountName = normalizeTaxLabel(entry.account_name);
  const matched = matchBucket(normalizedAccountName);

  if (matched) {
    return matched;
  }

  if (entry.category === "Revenue") {
    return {
      bucket: "gross_revenue" as const,
      explanation:
        "Classified as gross revenue by fallback because the entry is mapped to Revenue and no narrower tax rule matched."
    };
  }

  if (entry.category === "COGS") {
    return {
      bucket: "cogs" as const,
      explanation: "Classified as COGS by fallback from canonical tax mapping."
    };
  }

  if (entry.category === "Depreciation / Amortization") {
    return {
      bucket: "depreciation" as const,
      explanation:
        "Classified as depreciation/amortization by fallback from canonical tax mapping."
    };
  }

  if (entry.category === "Non-operating") {
    return {
      bucket: "non_operating_other" as const,
      explanation:
        "Classified as non-operating other because the entry maps to Non-operating without an interest-specific rule."
    };
  }

  if (entry.category === "Tax Expense") {
    return {
      bucket: "income_taxes" as const,
      explanation: "Classified as income taxes by fallback from canonical tax mapping."
    };
  }

  if (entry.category === "Operating Expenses") {
    return {
      bucket: "operating_expenses_other" as const,
      explanation:
        "Classified as operating expenses other because the entry maps to Operating Expenses without a narrower tax rule."
    };
  }

  if (entry.category === "Pre-tax") {
    return {
      bucket: "pre_tax" as const,
      explanation: "Classified as pre-tax reference line by fallback from canonical tax mapping."
    };
  }

  if (entry.category === "Net Income") {
    return {
      bucket: "net_income" as const,
      explanation: "Classified as net income reference line by fallback from canonical tax mapping."
    };
  }

  return {
    bucket: "operating_expenses_other" as const,
    explanation:
      "Classified conservatively as operating expenses other because no explicit tax EBITDA bucket rule matched."
  };
}

function addToComponents(
  components: TaxEbitdaComponents,
  bucket: TaxEarningsBucket,
  amount: number
) {
  switch (bucket) {
    case "gross_revenue":
      components.grossRevenue += amount;
      break;
    case "contra_revenue":
      components.contraRevenue += amount;
      break;
    case "cogs":
      components.cogs += amount;
      break;
    case "officer_compensation":
      components.officerCompensation += amount;
      break;
    case "salaries_and_wages":
      components.salariesAndWages += amount;
      break;
    case "rent":
      components.rent += amount;
      break;
    case "advertising":
      components.advertising += amount;
      break;
    case "repairs_and_maintenance":
      components.repairsAndMaintenance += amount;
      break;
    case "utilities":
      components.utilities += amount;
      break;
    case "insurance":
      components.insurance += amount;
      break;
    case "taxes_and_licenses":
      components.taxesAndLicenses += amount;
      break;
    case "payroll_taxes_and_benefits":
      components.payrollTaxesAndBenefits += amount;
      break;
    case "meals":
      components.meals += amount;
      break;
    case "travel":
      components.travel += amount;
      break;
    case "other_deductions":
      components.otherDeductions += amount;
      break;
    case "operating_expenses_other":
      components.operatingExpensesOther += amount;
      break;
    case "depreciation":
      components.depreciation += amount;
      break;
    case "amortization":
      components.amortization += amount;
      break;
    case "section_179":
      components.section179 += amount;
      break;
    case "interest":
      components.interest += amount;
      break;
    case "income_taxes":
      components.incomeTaxes += amount;
      break;
    case "non_operating_other":
      components.nonOperatingOther += amount;
      break;
    case "net_income":
    case "pre_tax":
      break;
  }
}

function buildCoverage(params: {
  entryCount: number;
  components: TaxEbitdaComponents;
  presentComponents: Set<FoundComponentKey>;
}) {
  const { entryCount, presentComponents } = params;
  const found = FOUND_COMPONENT_KEYS.filter((key) => presentComponents.has(key));
  const missing = FOUND_COMPONENT_KEYS.filter((key) => !presentComponents.has(key));
  const notes: string[] = [];

  if (!presentComponents.has("depreciation")) {
    notes.push("Depreciation is not separately evidenced in the tax-source entries.");
  }

  if (!presentComponents.has("amortization")) {
    notes.push("Amortization is not separately evidenced in the tax-source entries.");
  }

  if (!presentComponents.has("cogs")) {
    notes.push("COGS is missing from the tax-source entries, so tax-derived EBITDA is not complete.");
  }

  if (!presentComponents.has("operatingExpensesBeforeDandA")) {
    notes.push(
      "Operating expenses are missing from the tax-source entries, so tax-derived EBITDA is not complete."
    );
  }

  if (entryCount === 0) {
    return {
      computable: false,
      status: "insufficient" as const,
      requiredComponentsFound: [] as FoundComponentKey[],
      missingComponents: [...FOUND_COMPONENT_KEYS],
      confidenceNote:
        "No tax-source income statement entries are available for this source period.",
      notes: ["No tax-source entries were found for the requested source period."]
    };
  }

  const hasRevenueStructure =
    presentComponents.has("grossRevenue") || presentComponents.has("contraRevenue");
  const computable =
    hasRevenueStructure &&
    presentComponents.has("cogs") &&
    presentComponents.has("operatingExpensesBeforeDandA");
  const status =
    computable
      ? ("complete" as const)
      : hasRevenueStructure
        ? ("partial" as const)
        : ("insufficient" as const);

  return {
    computable,
    status,
    requiredComponentsFound: found,
    missingComponents: missing,
    confidenceNote:
      status === "complete"
        ? "Tax-derived EBITDA was computed from a reasonably structured tax-source dataset."
        : status === "partial"
          ? "Tax-derived EBITDA is unavailable because tax-source coverage is partial."
          : "Tax-derived EBITDA could not be computed because revenue structure is missing.",
    notes
  };
}

function buildNormalization(params: {
  components: TaxEbitdaComponents;
  taxDerivedEbitda: number | null;
}) {
  const { components, taxDerivedEbitda } = params;
  const flaggedCandidates: TaxNormalizationCandidate[] = [];

  if (components.officerCompensation !== 0) {
    flaggedCandidates.push({
      type: "officer_compensation",
      amount: components.officerCompensation,
      status: "flagged_not_applied",
      explanation:
        "Officer compensation is identified as normalization-sensitive but no deterministic market-comp rule is configured in v1."
    });
  }

  if (components.meals !== 0) {
    flaggedCandidates.push({
      type: "meals",
      amount: components.meals,
      status: "flagged_not_applied",
      explanation:
        "Meals are identified as a possible discretionary expense but are not auto-adjusted in v1."
    });
  }

  if (components.section179 !== 0) {
    flaggedCandidates.push({
      type: "section_179",
      amount: components.section179,
      status: "treated_in_tax_ebitda_not_addbacked",
      explanation:
        "Section 179 was identified and treated as tax depreciation in EBITDA construction; no separate normalization adjustment is applied in v1."
    });
  }

  if (components.otherDeductions !== 0) {
    flaggedCandidates.push({
      type: "other_deductions",
      amount: components.otherDeductions,
      status: "flagged_not_applied",
      explanation:
        "Other deductions remain visible as an ambiguity bucket and are not auto-normalized without a narrower deterministic rule."
    });
  }

  return {
    appliedAdjustments: [],
    flaggedCandidates,
    normalizedTaxEBITDA: taxDerivedEbitda
  };
}

export function calculateTaxDerivedEbitda(params: {
  companyId: string;
  sourcePeriodId: string;
  period: Pick<SourceReportingPeriod, "label" | "period_date"> | null;
  entries: SourceFinancialEntry[];
}): TaxDerivedEbitdaResult {
  const components = zeroComponents();
  const presentComponents = new Set<FoundComponentKey>();
  const traceRows = params.entries
    .filter((entry) => entry.statement_type === "income")
    .map((entry) => {
      const classification = classifyTaxEbitdaBucket(entry);
      addToComponents(components, classification.bucket, Number(entry.amount));
      switch (classification.bucket) {
        case "gross_revenue":
          presentComponents.add("grossRevenue");
          break;
        case "contra_revenue":
          presentComponents.add("contraRevenue");
          break;
        case "cogs":
          presentComponents.add("cogs");
          break;
        case "officer_compensation":
        case "salaries_and_wages":
        case "rent":
        case "advertising":
        case "repairs_and_maintenance":
        case "utilities":
        case "insurance":
        case "taxes_and_licenses":
        case "payroll_taxes_and_benefits":
        case "meals":
        case "travel":
        case "other_deductions":
        case "operating_expenses_other":
          presentComponents.add("operatingExpensesBeforeDandA");
          break;
        case "depreciation":
        case "section_179":
          presentComponents.add("depreciation");
          break;
        case "amortization":
          presentComponents.add("amortization");
          break;
        case "interest":
        case "non_operating_other":
          presentComponents.add("interest");
          break;
        case "income_taxes":
          presentComponents.add("incomeTaxes");
          break;
        case "net_income":
        case "pre_tax":
          break;
      }

      return {
        entryId: entry.id,
        accountName: entry.account_name,
        amount: Number(entry.amount),
        mappedCategory: entry.category,
        bucket: classification.bucket,
        bucketExplanation: classification.explanation,
        mappingConfidence: entry.confidence ?? "unknown",
        mappingExplanation: entry.mapping_explanation ?? null
      } satisfies TaxEbitdaTraceRow;
    });

  components.netRevenue = components.grossRevenue + components.contraRevenue;
  components.grossProfit = components.netRevenue + components.cogs;
  components.operatingExpensesBeforeDandA =
    components.officerCompensation +
    components.salariesAndWages +
    components.rent +
    components.advertising +
    components.repairsAndMaintenance +
    components.utilities +
    components.insurance +
    components.taxesAndLicenses +
    components.payrollTaxesAndBenefits +
    components.meals +
    components.travel +
    components.otherDeductions +
    components.operatingExpensesOther;

  const coverage = buildCoverage({
    entryCount: traceRows.length,
    components,
    presentComponents
  });

  // Sign convention:
  // - Revenue-like lines are stored as positive values.
  // - Expense-like lines such as COGS, operating expenses, depreciation,
  //   amortization, Section 179, and interest are stored as signed negatives.
  // - Presentation uses absolute values for expense-style components so the
  //   displayed finance formulas read naturally.
  const taxDerivedEbitda = coverage.computable
    ? components.netRevenue -
      Math.abs(components.cogs) -
      Math.abs(components.operatingExpensesBeforeDandA) +
      Math.abs(components.depreciation) +
      Math.abs(components.amortization) +
      Math.abs(components.section179)
    : null;

  const taxDerivedEbitdaIncludingInterest = coverage.computable
    ? taxDerivedEbitda === null
      ? null
      : taxDerivedEbitda + Math.abs(components.interest)
    : null;

  const normalization = buildNormalization({
    components,
    taxDerivedEbitda
  });

  return {
    companyId: params.companyId,
    sourceType: "tax_return",
    sourcePeriodId: params.sourcePeriodId,
    periodLabel: params.period?.label ?? null,
    periodDate: params.period?.period_date ?? null,
    entryCount: traceRows.length,
    components: {
      rawSigned: components,
      display: buildDisplayComponents(components)
    },
    formula: buildFormula(),
    taxDerivedEBITDA: taxDerivedEbitda,
    taxDerivedEBITDAIncludingInterest: taxDerivedEbitdaIncludingInterest,
    normalization,
    coverage,
    traceRows
  };
}

export async function getTaxDerivedEbitdaForSourcePeriod(params: {
  companyId: string;
  sourcePeriodId: string;
}) {
  const context = await getTaxFinancialsForDealPeriod({
    companyId: params.companyId,
    sourcePeriodId: params.sourcePeriodId
  });

  return calculateTaxDerivedEbitda({
    companyId: params.companyId,
    sourcePeriodId: params.sourcePeriodId,
    period: context.period,
    entries: context.entries
  });
}
