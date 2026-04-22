import { getDocumentDisplayName } from "./documents.ts";
import type {
  AddBackReviewItem,
  BackingStatus,
  BackingSummaryItem,
  DealBackingContext,
  DocumentLink,
  FinancialEntry,
  FinancialLineItemBacking,
  SourceDocument,
  SourceRequirementBacking,
  SourceRequirementDefinition,
  TaxSourceStatus,
  UnderwritingAdjustmentBacking,
  UnderwritingAnalysis,
  UnderwritingMetricBacking
} from "./types.ts";

const REQUIREMENT_CONFIG: Array<{
  id: string;
  label: string;
  groupLabel: string;
  documentTypes: SourceRequirementDefinition["documentTypes"];
}> = [
  {
    id: "income_statement",
    label: "Income Statement",
    groupLabel: "Financial Statements",
    documentTypes: ["income_statement"]
  },
  {
    id: "balance_sheet",
    label: "Balance Sheet",
    groupLabel: "Financial Statements",
    documentTypes: ["balance_sheet"]
  },
  {
    id: "cash_flow",
    label: "Cash Flow",
    groupLabel: "Financial Statements",
    documentTypes: ["cash_flow"]
  },
  {
    id: "tax_return",
    label: "Tax Return",
    groupLabel: "Tax & Banking",
    documentTypes: ["tax_return"]
  },
  {
    id: "bank_statement",
    label: "Bank Statements",
    groupLabel: "Tax & Banking",
    documentTypes: ["bank_statement"]
  },
  {
    id: "debt_schedule",
    label: "Debt Schedule",
    groupLabel: "Debt & Credit",
    documentTypes: ["debt_schedule"]
  },
  {
    id: "loan_agreement",
    label: "Loan Agreement",
    groupLabel: "Debt & Credit",
    documentTypes: ["loan_agreement"]
  }
];

type BuildDealBackingParams = {
  companyId: string;
  periodLabel: string | null;
  fiscalYear: number | null;
  entries: FinancialEntry[];
  documents: SourceDocument[];
  documentLinks: DocumentLink[];
  addBackReviewItems: AddBackReviewItem[];
  underwritingAnalysis: UnderwritingAnalysis;
  taxSourceStatus: TaxSourceStatus;
};

function isActiveDocument(document: SourceDocument) {
  return (document.status ?? "active") === "active";
}

function getDocumentType(document: SourceDocument) {
  if (document.document_type) {
    return document.document_type;
  }

  if (document.source_type === "tax_return") {
    return "tax_return";
  }

  return "other";
}

function matchesPeriod(document: SourceDocument, periodLabel: string | null, fiscalYear: number | null) {
  if (!periodLabel && !fiscalYear) {
    return true;
  }

  if (periodLabel && document.period_label === periodLabel) {
    return true;
  }

  if (fiscalYear && document.fiscal_year === fiscalYear) {
    return true;
  }

  return false;
}

function getLinkedDocuments(
  documents: SourceDocument[],
  documentLinks: DocumentLink[],
  entityType: DocumentLink["entity_type"],
  entityId: string
) {
  const linkedDocumentIds = new Set(
    documentLinks
      .filter((link) => link.entity_type === entityType && link.entity_id === entityId)
      .map((link) => link.document_id)
  );

  return documents.filter((document) => linkedDocumentIds.has(document.id));
}

function backingRank(status: BackingStatus) {
  if (status === "backed") return 2;
  if (status === "partial") return 1;
  return 0;
}

function summarizeStatuses(statuses: BackingStatus[]) {
  if (statuses.some((status) => status === "unbacked")) {
    return "unbacked" as const;
  }

  if (statuses.some((status) => status === "partial")) {
    return "partial" as const;
  }

  return "backed" as const;
}

function buildSourceRequirementDefinitions(periodLabel: string | null, fiscalYear: number | null) {
  return REQUIREMENT_CONFIG.map((config) => ({
    ...config,
    periodLabel,
    fiscalYear
  }));
}

function getEntriesForCategories(entries: FinancialEntry[], categories: string[]) {
  return entries.filter((entry) => categories.includes(entry.category));
}

function hasWeakFinancialSupport(entries: FinancialEntry[]) {
  return entries.some(
    (entry) =>
      entry.confidence === "low" ||
      entry.matched_by === "manual" ||
      entry.matched_by === "csv" ||
      entry.matched_by === "csv_value"
  );
}

function assessSourceRequirement(params: {
  requirement: SourceRequirementDefinition;
  documents: SourceDocument[];
  documentLinks: DocumentLink[];
  entries: FinancialEntry[];
  taxSourceStatus: TaxSourceStatus;
}): SourceRequirementBacking {
  const { requirement, documents, documentLinks, entries, taxSourceStatus } = params;
  const relevantDocuments = documents.filter(
    (document) =>
      isActiveDocument(document) &&
      requirement.documentTypes.includes(getDocumentType(document)) &&
      matchesPeriod(document, requirement.periodLabel, requirement.fiscalYear)
  );
  const linkedDocuments = getLinkedDocuments(
    documents,
    documentLinks,
    "source_requirement",
    requirement.id
  ).filter((document) => matchesPeriod(document, requirement.periodLabel, requirement.fiscalYear));

  let inferredPresence = false;
  if (requirement.id === "income_statement") {
    inferredPresence = getEntriesForCategories(entries, [
      "Revenue",
      "COGS",
      "Operating Expenses",
      "EBITDA"
    ]).length > 0;
  } else if (requirement.id === "balance_sheet") {
    inferredPresence = entries.some((entry) => entry.statement_type === "balance_sheet");
  } else if (requirement.id === "tax_return") {
    inferredPresence = taxSourceStatus.documentCount > 0;
  }

  let status: BackingStatus = "unbacked";
  let missingReason: string | null = null;

  if (linkedDocuments.length > 0 && relevantDocuments.length > 0) {
    status = "backed";
  } else if (relevantDocuments.length > 0 || linkedDocuments.length > 0 || inferredPresence) {
    status = "partial";
    missingReason =
      relevantDocuments.length === 0
        ? "Supporting documents do not match the selected period."
        : linkedDocuments.length === 0
          ? "Supporting documents exist but are not linked."
          : "Source package exists but still needs full linkage.";
  } else {
    missingReason = "No supporting documents linked.";
  }

  return {
    ...requirement,
    status,
    documents: relevantDocuments,
    linkedDocuments,
    missingReason,
    actionTarget: {
      entityType: "source_requirement",
      entityId: requirement.id
    }
  };
}

function assessFinancialLineItem(params: {
  id: string;
  label: string;
  categories: string[];
  supportingRequirementIds: string[];
  entries: FinancialEntry[];
  documents: SourceDocument[];
  documentLinks: DocumentLink[];
  sourceRequirements: SourceRequirementBacking[];
}): FinancialLineItemBacking {
  const lineEntries = getEntriesForCategories(params.entries, params.categories);
  const explicitLinks = getLinkedDocuments(
    params.documents,
    params.documentLinks,
    "financial_line_item",
    params.id
  );
  const requirementSupport = params.sourceRequirements.filter((requirement) =>
    params.supportingRequirementIds.includes(requirement.id)
  );
  const requirementDocuments = requirementSupport.flatMap((requirement) => requirement.linkedDocuments);
  const mergedDocuments = Array.from(
    new Map(
      [...explicitLinks, ...requirementDocuments].map((document) => [document.id, document] as const)
    ).values()
  );

  let status: BackingStatus = "unbacked";
  let note: string | null = null;

  if (lineEntries.length === 0 || mergedDocuments.length === 0) {
    status = mergedDocuments.length > 0 || lineEntries.length > 0 ? "partial" : "unbacked";
    note =
      lineEntries.length === 0
        ? "No line item values are available for the selected period."
        : "Line item exists but no supporting documents are linked.";
  } else if (
    requirementSupport.some((requirement) => requirement.status === "backed") &&
    !hasWeakFinancialSupport(lineEntries)
  ) {
    status = "backed";
  } else {
    status = "partial";
    note = hasWeakFinancialSupport(lineEntries)
      ? "Line item includes manual or low-confidence mapped components."
      : "Line item support is present but not fully linked.";
  }

  return {
    id: params.id,
    label: params.label,
    status,
    documents: mergedDocuments,
    linkedDocuments: explicitLinks,
    sourceRequirementIds: params.supportingRequirementIds,
    note,
    actionTarget: {
      entityType: "financial_line_item",
      entityId: params.id
    }
  };
}

function getAdjustmentEntityId(item: AddBackReviewItem) {
  return item.id ?? `${item.periodId}:${item.linkedEntryId ?? item.description}:${item.type}`;
}

function assessUnderwritingAdjustment(
  item: AddBackReviewItem,
  documents: SourceDocument[],
  documentLinks: DocumentLink[]
): UnderwritingAdjustmentBacking {
  const entityId = getAdjustmentEntityId(item);
  const linkedDocuments = getLinkedDocuments(
    documents,
    documentLinks,
    "underwriting_adjustment",
    entityId
  );
  const hasRationale = Boolean(item.justification?.trim());
  const hasSupportingReference = Boolean(item.supportingReference?.trim());
  let status: BackingStatus = "unbacked";
  let note: string | null = null;

  if (linkedDocuments.length > 0 && (hasRationale || hasSupportingReference)) {
    status = "backed";
  } else if (linkedDocuments.length > 0 || hasRationale || hasSupportingReference) {
    status = "partial";
    note =
      linkedDocuments.length === 0
        ? "Rationale exists but no supporting documents are linked."
        : "Supporting documents are linked but the rationale is incomplete.";
  } else {
    note = "Support: No supporting documents linked.";
  }

  return {
    adjustmentId: entityId,
    label: item.description,
    status,
    documents: linkedDocuments,
    linkedDocuments,
    note,
    actionTarget: {
      entityType: "underwriting_adjustment",
      entityId
    }
  };
}

function assessUnderwritingMetric(params: {
  id: string;
  label: string;
  canCompute: boolean;
  supportingRequirementIds: string[];
  upstreamLineItemIds: string[];
  sourceRequirements: SourceRequirementBacking[];
  financialLineItems: FinancialLineItemBacking[];
  documents: SourceDocument[];
  documentLinks: DocumentLink[];
}): UnderwritingMetricBacking {
  const linkedDocuments = getLinkedDocuments(
    params.documents,
    params.documentLinks,
    "underwriting_metric",
    params.id
  );
  const supportingRequirements = params.sourceRequirements.filter((requirement) =>
    params.supportingRequirementIds.includes(requirement.id)
  );
  const lineItems = params.financialLineItems.filter((item) =>
    params.upstreamLineItemIds.includes(item.id)
  );
  const missingSupportLabels = supportingRequirements
    .filter((requirement) => requirement.status !== "backed")
    .map((requirement) => requirement.label);
  const missingLineItemLabels = lineItems
    .filter((item) => item.status === "unbacked")
    .map((item) => item.label);
  const allDocuments = Array.from(
    new Map(
      [...linkedDocuments, ...supportingRequirements.flatMap((requirement) => requirement.linkedDocuments)].map(
        (document) => [document.id, document] as const
      )
    ).values()
  );

  let status: BackingStatus = "unbacked";
  let note: string | null = null;

  if (
    params.canCompute &&
    missingSupportLabels.length === 0 &&
    missingLineItemLabels.length === 0 &&
    allDocuments.length > 0
  ) {
    status = "backed";
  } else if (params.canCompute || allDocuments.length > 0) {
    status = "partial";
    note =
      missingSupportLabels.length > 0 || missingLineItemLabels.length > 0
        ? `Missing support: ${[...missingSupportLabels, ...missingLineItemLabels].join(", ")}`
        : "Metric can be computed but support is incomplete.";
  } else {
    note = `Missing support: ${supportingRequirements.map((requirement) => requirement.label).join(", ")}`;
  }

  return {
    id: params.id,
    label: params.label,
    status,
    documents: allDocuments,
    linkedDocuments,
    requiredSupportLabels: supportingRequirements.map((requirement) => requirement.label),
    missingSupportLabels: [...missingSupportLabels, ...missingLineItemLabels],
    note,
    actionTarget: {
      entityType: "underwriting_metric",
      entityId: params.id
    }
  };
}

function buildSummaryItem(
  id: string,
  label: string,
  status: BackingStatus,
  href: string,
  note: string | null = null
): BackingSummaryItem {
  return { id, label, status, href, note };
}

export function getBackingStatusLabel(status: BackingStatus) {
  if (status === "backed") return "Backed";
  if (status === "partial") return "Partially Backed";
  return "Unbacked";
}

export function getBackingStatusTone(status: BackingStatus) {
  if (status === "backed") {
    return "border-teal-200 bg-teal-50 text-teal-800";
  }

  if (status === "partial") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-rose-200 bg-rose-50 text-rose-800";
}

export function buildDealBackingContext(params: BuildDealBackingParams): DealBackingContext {
  const activeDocuments = params.documents.filter(isActiveDocument);
  const sourceRequirements = buildSourceRequirementDefinitions(
    params.periodLabel,
    params.fiscalYear
  ).map((requirement) =>
    assessSourceRequirement({
      requirement,
      documents: activeDocuments,
      documentLinks: params.documentLinks,
      entries: params.entries,
      taxSourceStatus: params.taxSourceStatus
    })
  );

  const financialLineItems: FinancialLineItemBacking[] = [
    assessFinancialLineItem({
      id: "revenue",
      label: "Revenue",
      categories: ["Revenue"],
      supportingRequirementIds: ["income_statement", "tax_return"],
      entries: params.entries,
      documents: activeDocuments,
      documentLinks: params.documentLinks,
      sourceRequirements
    }),
    assessFinancialLineItem({
      id: "cogs",
      label: "COGS",
      categories: ["COGS"],
      supportingRequirementIds: ["income_statement"],
      entries: params.entries,
      documents: activeDocuments,
      documentLinks: params.documentLinks,
      sourceRequirements
    }),
    assessFinancialLineItem({
      id: "ebitda",
      label: "EBITDA",
      categories: ["EBITDA", "Operating Expenses", "Depreciation / Amortization", "Revenue", "COGS"],
      supportingRequirementIds: ["income_statement", "cash_flow", "tax_return"],
      entries: params.entries,
      documents: activeDocuments,
      documentLinks: params.documentLinks,
      sourceRequirements
    }),
    assessFinancialLineItem({
      id: "current_assets",
      label: "Current Assets",
      categories: [
        "Assets",
        "current_assets",
        "current_assets.cash",
        "current_assets.accounts_receivable",
        "current_assets.inventory",
        "current_assets.other"
      ],
      supportingRequirementIds: ["balance_sheet", "bank_statement"],
      entries: params.entries,
      documents: activeDocuments,
      documentLinks: params.documentLinks,
      sourceRequirements
    })
  ];

  const underwritingAdjustments = params.addBackReviewItems.map((item) =>
    assessUnderwritingAdjustment(item, activeDocuments, params.documentLinks)
  );

  const underwritingMetrics: UnderwritingMetricBacking[] = [
    assessUnderwritingMetric({
      id: "dscr",
      label: "DSCR",
      canCompute: params.underwritingAnalysis.creditScenario.metrics.dscr.status !== "insufficient",
      supportingRequirementIds: ["debt_schedule", "loan_agreement", "cash_flow"],
      upstreamLineItemIds: ["ebitda"],
      sourceRequirements,
      financialLineItems,
      documents: activeDocuments,
      documentLinks: params.documentLinks
    }),
    assessUnderwritingMetric({
      id: "debt_to_ebitda",
      label: "Debt / EBITDA",
      canCompute:
        params.underwritingAnalysis.creditScenario.metrics.debtToEbitda.status !== "insufficient",
      supportingRequirementIds: ["debt_schedule", "loan_agreement"],
      upstreamLineItemIds: ["ebitda"],
      sourceRequirements,
      financialLineItems,
      documents: activeDocuments,
      documentLinks: params.documentLinks
    }),
    assessUnderwritingMetric({
      id: "ltv",
      label: "LTV",
      canCompute: params.underwritingAnalysis.creditScenario.metrics.ltv.status !== "insufficient",
      supportingRequirementIds: ["loan_agreement", "balance_sheet"],
      upstreamLineItemIds: ["current_assets"],
      sourceRequirements,
      financialLineItems,
      documents: activeDocuments,
      documentLinks: params.documentLinks
    })
  ];

  const financialsStatus = summarizeStatuses([
    ...sourceRequirements
      .filter((requirement) =>
        ["income_statement", "balance_sheet", "cash_flow"].includes(requirement.id)
      )
      .map((requirement) => requirement.status),
    ...financialLineItems
      .filter((item) => ["revenue", "cogs", "ebitda"].includes(item.id))
      .map((item) => item.status)
  ]);
  const adjustmentsStatus =
    underwritingAdjustments.length > 0
      ? summarizeStatuses(underwritingAdjustments.map((item) => item.status))
      : "backed";
  const creditInputsStatus = summarizeStatuses(
    underwritingMetrics.map((metric) => metric.status)
  );
  const overallStatus = summarizeStatuses([
    financialsStatus,
    adjustmentsStatus,
    creditInputsStatus
  ]);

  return {
    sourceRequirements,
    financialLineItems,
    underwritingAdjustments,
    underwritingMetrics,
    summary: {
      overall: buildSummaryItem(
        "overall",
        "Overall",
        overallStatus,
        `/deal/${params.companyId}`,
        `Overall ${getBackingStatusLabel(overallStatus).toLowerCase()}`
      ),
      financials: buildSummaryItem(
        "financials",
        "Financials",
        financialsStatus,
        `/financials?companyId=${params.companyId}`
      ),
      adjustments: buildSummaryItem(
        "adjustments",
        "Adjustments",
        adjustmentsStatus,
        `/deal/${params.companyId}/underwriting`
      ),
      creditInputs: buildSummaryItem(
        "credit_inputs",
        "Credit Inputs",
        creditInputsStatus,
        `/deal/${params.companyId}/underwriting`
      )
    }
  };
}

export function formatDocumentList(documents: SourceDocument[]) {
  return documents.map((document) => getDocumentDisplayName(document));
}

export function getStrongestBackingStatus(statuses: BackingStatus[]) {
  if (statuses.length === 0) {
    return "unbacked" as const;
  }

  return statuses
    .slice()
    .sort((left, right) => backingRank(right) - backingRank(left))[0] as BackingStatus;
}
