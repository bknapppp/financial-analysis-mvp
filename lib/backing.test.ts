import assert from "node:assert/strict";
import { buildDealBackingContext, getBackingStatusLabel } from "./backing.ts";
import type { AddBackReviewItem, DocumentLink, SourceDocument, TaxSourceStatus } from "./types.ts";

const documents: SourceDocument[] = [
  {
    id: "doc-income",
    company_id: "company-1",
    name: "FY2025 Income Statement",
    document_type: "income_statement",
    period_label: "FY2025",
    fiscal_year: 2025,
    uploaded_at: "2026-04-20T12:00:00.000Z",
    uploaded_by: null,
    source_kind: "manual",
    status: "active",
    source_type: "reported_financials",
    source_file_name: "fy2025-income-statement.pdf",
    upload_id: null,
    source_currency: "USD",
    source_confidence: "high",
    created_at: "2026-04-20T12:00:00.000Z"
  },
  {
    id: "doc-debt",
    company_id: "company-1",
    name: "FY2025 Debt Schedule",
    document_type: "debt_schedule",
    period_label: "FY2025",
    fiscal_year: 2025,
    uploaded_at: "2026-04-20T12:00:00.000Z",
    uploaded_by: null,
    source_kind: "manual",
    status: "active",
    source_type: "reported_financials",
    source_file_name: "fy2025-debt-schedule.pdf",
    upload_id: null,
    source_currency: "USD",
    source_confidence: "high",
    created_at: "2026-04-20T12:00:00.000Z"
  }
];

const documentLinks: DocumentLink[] = [
  {
    id: "link-income-requirement",
    company_id: "company-1",
    document_id: "doc-income",
    entity_type: "source_requirement",
    entity_id: "income_statement",
    created_at: "2026-04-20T12:00:00.000Z"
  },
  {
    id: "link-income-revenue",
    company_id: "company-1",
    document_id: "doc-income",
    entity_type: "financial_line_item",
    entity_id: "revenue",
    created_at: "2026-04-20T12:00:00.000Z"
  },
  {
    id: "link-income-ebitda",
    company_id: "company-1",
    document_id: "doc-income",
    entity_type: "financial_line_item",
    entity_id: "ebitda",
    created_at: "2026-04-20T12:00:00.000Z"
  },
  {
    id: "link-debt-dscr",
    company_id: "company-1",
    document_id: "doc-debt",
    entity_type: "underwriting_metric",
    entity_id: "dscr",
    created_at: "2026-04-20T12:00:00.000Z"
  }
];

const addBacks: AddBackReviewItem[] = [
  {
    id: "adjustment-1",
    companyId: "company-1",
    periodId: "period-1",
    periodLabel: "FY2025",
    linkedEntryId: null,
    entryAccountName: null,
    entryCategory: null,
    entryStatementType: null,
    addbackFlag: false,
    matchedBy: null,
    confidence: null,
    mappingExplanation: null,
    type: "non_recurring",
    description: "One-time legal expense",
    amount: 25000,
    classificationConfidence: "high",
    source: "user",
    status: "accepted",
    justification: "Non-recurring expense identified in diligence.",
    supportingReference: "Adjustment memo",
    isPersisted: true,
    dependsOnLowConfidenceMapping: false
  }
];

const taxSourceStatus: TaxSourceStatus = {
  documentCount: 0,
  periodCount: 0,
  rowCount: 0,
  mappedLineCount: 0,
  lowConfidenceLineCount: 0,
  broadClassificationCount: 0,
  hasMatchingPeriod: false,
  matchingPeriodLabel: null,
  comparisonStatus: "not_loaded",
  comparisonComputable: false,
  missingComponents: [],
  notes: [],
  revenueDeltaPercent: null,
  reportedEbitdaDeltaPercent: null,
  computedEbitdaDeltaPercent: null,
  adjustedEbitdaDeltaPercent: null
};

{
  const backing = buildDealBackingContext({
    companyId: "company-1",
    periodLabel: "FY2025",
    fiscalYear: 2025,
    entries: [
      {
        id: "entry-revenue",
        account_name: "Revenue",
        statement_type: "income",
        amount: 1000,
        period_id: "period-1",
        category: "Revenue",
        addback_flag: false,
        matched_by: "saved_mapping",
        confidence: "high",
        mapping_explanation: "Mapped to revenue",
        created_at: "2026-04-20T12:00:00.000Z"
      },
      {
        id: "entry-ebitda",
        account_name: "EBITDA",
        statement_type: "income",
        amount: 200,
        period_id: "period-1",
        category: "EBITDA",
        addback_flag: false,
        matched_by: "saved_mapping",
        confidence: "high",
        mapping_explanation: "Mapped to EBITDA",
        created_at: "2026-04-20T12:00:00.000Z"
      }
    ],
    documents,
    documentLinks,
    addBackReviewItems: addBacks,
    underwritingAnalysis: {
      ebitdaBasis: "adjusted",
      selectedEbitda: 200,
      underwritingInputs: {
        loanAmount: 500,
        annualInterestRatePercent: 10,
        loanTermYears: 5,
        amortizationYears: 10,
        collateralValue: 800
      },
      missingInputs: [],
      acceptedAddBackTotal: 25000,
      creditScenario: {
        annualInterestExpense: 50,
        annualPrincipalPayment: 20,
        annualDebtService: 70,
        balanceAtMaturity: 200,
        canComputeDebtService: true,
        adverseSignals: [],
        metrics: {
          dscr: {
            label: "DSCR",
            value: 2.85,
            display: "2.85x",
            description: "",
            status: "strong",
            statusLabel: "Strong"
          },
          debtToEbitda: {
            label: "Debt / EBITDA",
            value: 2.5,
            display: "2.50x",
            description: "",
            status: "strong",
            statusLabel: "Strong"
          },
          interestCoverage: {
            label: "Interest Coverage",
            value: 4,
            display: "4.00x",
            description: "",
            status: "strong",
            statusLabel: "Strong"
          },
          ltv: {
            label: "LTV",
            value: 0.62,
            display: "62%",
            description: "",
            status: "moderate",
            statusLabel: "Moderate"
          }
        }
      },
      completionSummary: {
        completionPercent: 100,
        completionStatus: "ready",
        blockers: [],
        missingItems: [],
        completedItems: [],
        nextActions: [],
        sections: []
      },
      investmentOverview: {
        title: "Investment Overview",
        summary: "Summary",
        sections: []
      }
    },
    taxSourceStatus
  });

  assert.equal(backing.sourceRequirements.find((item) => item.id === "income_statement")?.status, "backed");
  assert.equal(backing.sourceRequirements.find((item) => item.id === "balance_sheet")?.status, "unbacked");
  assert.equal(backing.financialLineItems.find((item) => item.id === "revenue")?.status, "backed");
  assert.equal(backing.summary.financials.status, "unbacked");
  assert.equal(backing.summary.creditInputs.status, "partial");
  assert.equal(getBackingStatusLabel(backing.summary.overall.status), "Unbacked");
}

console.log("backing tests passed");
