import type {
  CreditScenarioInputs,
  CreditScenarioResult,
  DataQualityReport,
  FinancialEntry,
  PeriodSnapshot,
  TaxSourceStatus,
  UnderwritingCompletionItem,
  UnderwritingCompletionSection,
  UnderwritingCompletionSectionKey,
  UnderwritingCompletionSummary
} from "../types";

const SECTION_WEIGHTS: Record<UnderwritingCompletionSectionKey, number> = {
  financial_inputs: 25,
  mapping_completeness: 20,
  tax_source_readiness: 15,
  structure_inputs: 20,
  underwriting_readiness: 20
};

const BROAD_CATEGORIES = new Set([
  "Assets",
  "Liabilities",
  "Equity",
  "current_assets",
  "non_current_assets",
  "current_liabilities",
  "non_current_liabilities",
  "equity"
]);

const CREDIT_INPUT_LABELS: Record<keyof CreditScenarioInputs, string> = {
  loanAmount: "Loan amount",
  annualInterestRatePercent: "Interest rate",
  loanTermYears: "Term",
  amortizationYears: "Amortization",
  collateralValue: "Purchase price / collateral support"
};

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function hasCategory(entries: FinancialEntry[], predicate: (entry: FinancialEntry) => boolean) {
  return entries.some(predicate);
}

function buildSection(params: {
  key: UnderwritingCompletionSectionKey;
  title: string;
  items: UnderwritingCompletionItem[];
}): UnderwritingCompletionSection {
  const completedCount = params.items.filter((item) => item.isComplete).length;
  const totalCount = params.items.length;
  const completionPercent =
    totalCount === 0 ? 0 : Math.round((completedCount / totalCount) * 100);
  const hasBlockingGap = params.items.some((item) => !item.isComplete && item.isBlocking);
  const status =
    completedCount === totalCount
      ? "complete"
      : hasBlockingGap
        ? "blocked"
        : "in_progress";

  return {
    key: params.key,
    title: params.title,
    weight: SECTION_WEIGHTS[params.key],
    completionPercent,
    status,
    completedCount,
    totalCount,
    items: params.items
  };
}

export function countBroadClassifications(entries: FinancialEntry[]) {
  return entries.filter((entry) => BROAD_CATEGORIES.has(entry.category)).length;
}

export function getMissingCreditScenarioInputs(inputs: CreditScenarioInputs) {
  return (Object.entries(inputs) as Array<[keyof CreditScenarioInputs, number | null]>)
    .filter(([, value]) => value === null)
    .map(([key]) => CREDIT_INPUT_LABELS[key]);
}

export function buildUnderwritingCompletion(params: {
  snapshot: PeriodSnapshot;
  entries: FinancialEntry[];
  dataQuality: DataQualityReport;
  taxSourceStatus: TaxSourceStatus;
  underwritingInputs: CreditScenarioInputs;
  creditScenario: CreditScenarioResult;
}): UnderwritingCompletionSummary {
  const { snapshot, entries, dataQuality, taxSourceStatus, underwritingInputs, creditScenario } =
    params;

  if (!snapshot.periodId) {
    return {
      completionPercent: 0,
      completionStatus: "blocked",
      blockers: ["No reporting period is loaded."],
      missingItems: ["Load a reporting period"],
      completedItems: [],
      nextActions: ["Load reported financials for a reporting period"],
      sections: []
    };
  }

  const currentEntries = entries.filter((entry) => entry.period_id === snapshot.periodId);
  const lowConfidenceCount = currentEntries.filter((entry) => entry.confidence === "low").length;
  const broadClassificationCount = countBroadClassifications(currentEntries);
  const mappingCoverageUsable =
    dataQuality.mappingCoveragePercent >= 70 && currentEntries.length > 0;
  const missingStructureInputs = getMissingCreditScenarioInputs(underwritingInputs);

  const financialInputs = buildSection({
    key: "financial_inputs",
    title: "Financial Inputs",
    items: [
      {
        key: "revenue",
        label: "Revenue available",
        isComplete: hasCategory(currentEntries, (entry) => entry.category === "Revenue"),
        isBlocking: true,
        nextAction: "Load or map revenue for the selected period"
      },
      {
        key: "cogs",
        label: "COGS available",
        isComplete: hasCategory(currentEntries, (entry) => entry.category === "COGS"),
        isBlocking: false,
        nextAction: "Load or map COGS for the selected period"
      },
      {
        key: "operating_expenses",
        label: "Operating expenses available",
        isComplete: hasCategory(
          currentEntries,
          (entry) => entry.category === "Operating Expenses"
        ),
        isBlocking: true,
        nextAction: "Load or map operating expenses for the selected period"
      },
      {
        key: "ebitda_basis",
        label: "EBITDA basis available",
        detail: snapshot.ebitdaExplainability?.basisLabel,
        isComplete:
          snapshot.ebitdaExplainability?.basis !== "incomplete" ||
          snapshot.ebitda !== null ||
          snapshot.adjustedEbitda !== null,
        isBlocking: true,
        nextAction: "Complete the core income statement mapping needed to support EBITDA"
      },
      {
        key: "balance_sheet",
        label: "Key balance sheet components available",
        isComplete:
          !dataQuality.missingCategories.includes("Balance sheet components") &&
          hasCategory(
            currentEntries,
            (entry) =>
              entry.category === "Assets" ||
              entry.category === "current_assets" ||
              entry.category.startsWith("current_assets.") ||
              entry.category === "non_current_assets" ||
              entry.category.startsWith("non_current_assets.")
          ) &&
          hasCategory(
            currentEntries,
            (entry) =>
              entry.category === "Liabilities" ||
              entry.category === "current_liabilities" ||
              entry.category.startsWith("current_liabilities.") ||
              entry.category === "non_current_liabilities" ||
              entry.category.startsWith("non_current_liabilities.")
          ) &&
          hasCategory(
            currentEntries,
            (entry) =>
              entry.category === "Equity" ||
              entry.category === "equity" ||
              entry.category.startsWith("equity.")
          ),
        isBlocking: false,
        nextAction: "Complete balance sheet mapping for assets, liabilities, and equity"
      }
    ]
  });

  const mappingCompleteness = buildSection({
    key: "mapping_completeness",
    title: "Mapping Completeness",
    items: [
      {
        key: "unmapped_rows",
        label: "No unmapped rows remain",
        detail:
          dataQuality.mappingBreakdown.unmapped > 0
            ? `${dataQuality.mappingBreakdown.unmapped} row(s) remain unmapped`
            : undefined,
        isComplete: dataQuality.mappingBreakdown.unmapped === 0,
        isBlocking: false,
        nextAction: "Resolve the remaining unmapped rows"
      },
      {
        key: "low_confidence_rows",
        label: "Low-confidence mappings resolved",
        detail:
          lowConfidenceCount > 0 ? `${lowConfidenceCount} low-confidence row(s)` : undefined,
        isComplete: lowConfidenceCount === 0,
        isBlocking: false,
        nextAction: "Review the low-confidence mapped rows"
      },
      {
        key: "broad_classifications",
        label: "Broad classifications narrowed",
        detail:
          broadClassificationCount > 0
            ? `${broadClassificationCount} broad-classified row(s)`
            : undefined,
        isComplete: broadClassificationCount === 0,
        isBlocking: false,
        nextAction: "Replace broad classifications with narrower categories"
      },
      {
        key: "mapping_coverage",
        label: "Coverage supports usable outputs",
        detail: `${Math.round(dataQuality.mappingCoveragePercent)}% mapped`,
        isComplete: mappingCoverageUsable,
        isBlocking: true,
        nextAction: "Improve mapping coverage before relying on underwriting outputs"
      }
    ]
  });

  const taxSourceReadiness = buildSection({
    key: "tax_source_readiness",
    title: "Tax Source Readiness",
    items: [
      {
        key: "tax_loaded",
        label: "Tax data loaded",
        detail:
          taxSourceStatus.documentCount > 0
            ? `${taxSourceStatus.documentCount} document(s), ${taxSourceStatus.rowCount} row(s)`
            : undefined,
        isComplete: taxSourceStatus.rowCount > 0,
        isBlocking: false,
        nextAction: "Load the tax return source for the selected period"
      },
      {
        key: "tax_mapped",
        label: "Tax ingestion mapped lines",
        detail:
          taxSourceStatus.mappedLineCount > 0
            ? `${taxSourceStatus.mappedLineCount} mapped tax line(s)`
            : undefined,
        isComplete: taxSourceStatus.mappedLineCount > 0,
        isBlocking: false,
        nextAction: "Preview or remap the tax-source lines"
      },
      {
        key: "tax_comparison",
        label: "Tax-derived comparison computable",
        detail:
          taxSourceStatus.hasMatchingPeriod && taxSourceStatus.matchingPeriodLabel
            ? `Matched to ${taxSourceStatus.matchingPeriodLabel}`
            : undefined,
        isComplete: taxSourceStatus.comparisonComputable,
        isBlocking: false,
        nextAction:
          taxSourceStatus.hasMatchingPeriod && taxSourceStatus.rowCount > 0
            ? "Complete tax-source coverage so reported vs tax comparison can be computed"
            : "Match a tax period to the selected reported period"
      }
    ]
  });

  const structureInputs = buildSection({
    key: "structure_inputs",
    title: "Structure Inputs",
    items: [
      {
        key: "loan_amount",
        label: "Loan amount entered",
        isComplete: underwritingInputs.loanAmount !== null,
        isBlocking: true,
        nextAction: "Enter the proposed loan amount"
      },
      {
        key: "interest_rate",
        label: "Interest rate entered",
        isComplete: underwritingInputs.annualInterestRatePercent !== null,
        isBlocking: true,
        nextAction: "Enter the interest rate assumption"
      },
      {
        key: "term",
        label: "Term entered",
        isComplete: underwritingInputs.loanTermYears !== null,
        isBlocking: true,
        nextAction: "Enter the debt term"
      },
      {
        key: "amortization",
        label: "Amortization entered",
        isComplete: underwritingInputs.amortizationYears !== null,
        isBlocking: true,
        nextAction: "Enter the amortization period"
      },
      {
        key: "collateral_support",
        label: "Purchase price / collateral support entered",
        isComplete: underwritingInputs.collateralValue !== null,
        isBlocking: true,
        nextAction: "Enter purchase price or collateral support"
      }
    ]
  });

  const underwritingReadiness = buildSection({
    key: "underwriting_readiness",
    title: "Underwriting Readiness",
    items: [
      {
        key: "dscr",
        label: "DSCR can be computed",
        isComplete: creditScenario.metrics.dscr.status !== "insufficient",
        isBlocking: true,
        nextAction: "Enter the inputs required to compute DSCR"
      },
      {
        key: "debt_to_ebitda",
        label: "Debt / EBITDA can be computed",
        isComplete: creditScenario.metrics.debtToEbitda.status !== "insufficient",
        isBlocking: true,
        nextAction: "Enter debt sizing so Debt / EBITDA can be computed"
      },
      {
        key: "ltv",
        label: "LTV can be computed",
        isComplete: creditScenario.metrics.ltv.status !== "insufficient",
        isBlocking: true,
        nextAction: "Enter collateral support so LTV can be computed"
      },
      {
        key: "coverage_outputs",
        label: "Coverage outputs are available",
        isComplete:
          creditScenario.metrics.dscr.status !== "insufficient" &&
          creditScenario.metrics.interestCoverage.status !== "insufficient",
        isBlocking: true,
        nextAction: "Complete debt service inputs so coverage outputs are available"
      }
    ]
  });

  const sections = [
    financialInputs,
    mappingCompleteness,
    taxSourceReadiness,
    structureInputs,
    underwritingReadiness
  ];

  const weightedScore = sections.reduce((total, section) => {
    return total + (section.completedCount / section.totalCount) * section.weight;
  }, 0);
  const completionPercent = Math.round(weightedScore);
  const blockers = dedupe(
    sections.flatMap((section) =>
      section.items
        .filter((item) => !item.isComplete && item.isBlocking)
        .map((item) => item.label)
    )
  );
  const missingItems = dedupe(
    sections.flatMap((section) =>
      section.items.filter((item) => !item.isComplete).map((item) => item.label)
    )
  );
  const completedItems = dedupe(
    sections.flatMap((section) =>
      section.items.filter((item) => item.isComplete).map((item) => item.label)
    )
  );
  const nextActions = dedupe(
    sections.flatMap((section) =>
      section.items
        .filter((item) => !item.isComplete)
        .map((item) => item.nextAction ?? `Complete ${item.label.toLowerCase()}`)
    )
  ).slice(0, 6);

  return {
    completionPercent,
    completionStatus:
      blockers.length > 0 ? "blocked" : missingItems.length > 0 ? "in_progress" : "ready",
    blockers,
    missingItems:
      missingStructureInputs.length > 0
        ? dedupe([...missingItems, ...missingStructureInputs])
        : missingItems,
    completedItems,
    nextActions,
    sections
  };
}
