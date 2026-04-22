import assert from "node:assert/strict";
import {
  buildDiligenceIssueFeedback,
  buildSystemDiligenceIssueCandidatesForContext,
  planDiligenceIssueSync,
  resolveDiligenceIssueActionTarget,
  summarizeDiligenceIssues
} from "./diligence-issues.ts";
import type { DealDerivedContext } from "./deal-derived-context.ts";
import type {
  DiligenceIssue
} from "./types.ts";

function buildContext(): DealDerivedContext {
  return {
    company: {
      id: "company-1",
      name: "Test Co",
      industry: "Services",
      base_currency: "USD",
      created_at: "2026-04-17T00:00:00.000Z"
    },
    periods: [],
    entries: [
      {
        id: "entry-1",
        account_name: "Accounts Receivable",
        statement_type: "balance_sheet",
        amount: 100,
        period_id: "period-1",
        category: "current_assets.accounts_receivable",
        addback_flag: false,
        created_at: "2026-04-17T00:00:00.000Z"
      },
      {
        id: "entry-2",
        account_name: "Debt",
        statement_type: "balance_sheet",
        amount: 40,
        period_id: "period-1",
        category: "non_current_liabilities.long_term_debt",
        addback_flag: false,
        created_at: "2026-04-17T00:00:00.000Z"
      },
      {
        id: "entry-3",
        account_name: "Equity",
        statement_type: "balance_sheet",
        amount: 40,
        period_id: "period-1",
        category: "equity.retained_earnings",
        addback_flag: false,
        created_at: "2026-04-17T00:00:00.000Z"
      },
      {
        id: "entry-4",
        account_name: "Uncertain OpEx",
        statement_type: "income",
        amount: -50,
        period_id: "period-1",
        category: "Operating Expenses",
        addback_flag: false,
        confidence: "low",
        created_at: "2026-04-17T00:00:00.000Z"
      }
    ],
    accountMappings: [],
    addBacks: [],
    taxContext: {
      sourceType: "tax_return",
      periods: [],
      entries: [],
      documents: []
    },
    documents: [],
    documentLinks: [],
    documentVersions: [],
    selectedPeriodId: "period-1",
    ebitdaBasis: "adjusted",
    baselineSnapshots: [],
    snapshots: [],
    snapshot: {
      periodId: "period-1",
      label: "FY2025",
      revenue: 0,
      cogs: 0,
      grossProfit: null,
      operatingExpenses: 50,
      ebit: null,
      reportedOperatingIncome: null,
      reportedEbitda: null,
      ebitda: -100,
      acceptedAddBacks: 0,
      adjustedEbitda: null,
      grossMarginPercent: null,
      ebitdaMarginPercent: null,
      adjustedEbitdaMarginPercent: null,
      currentAssets: 100,
      currentLiabilities: 20,
      workingCapital: 80,
      revenueGrowthPercent: null,
      ebitdaGrowthPercent: null,
      adjustedEbitdaGrowthPercent: null,
      grossMarginChange: null,
      ebitdaMarginChange: null
    },
    addBackReviewItems: [
      {
        id: "review-1",
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
        description: "Suggested review item",
        amount: 10,
        classificationConfidence: "medium",
        source: "system",
        status: "suggested",
        justification: "Test",
        supportingReference: null,
        isPersisted: false,
        dependsOnLowConfidenceMapping: false
      }
    ],
    dataQuality: {
      mappingCoveragePercent: 60,
      mappingBreakdown: {
        saved_mapping: 0,
        keyword_mapping: 0,
        manual_mapping: 1,
        unmapped: 3
      },
      missingCategories: ["Revenue", "COGS"],
      confidenceScore: 55,
      confidenceLabel: "Low",
      hasSinglePeriodWarning: false,
      consistencyIssues: [],
      summaryMessage: "",
      issueGroups: []
    },
    readiness: {
      status: "blocked",
      label: "Not reliable",
      blockingReasons: ["Revenue is missing for the selected period."],
      cautionReasons: [],
      summaryMessage: ""
    },
    ebitdaBridge: null,
    normalizedPeriods: [],
    normalizedOutput: null,
    reconciliation: {
      status: "failed",
      label: "Does not reconcile",
      summaryMessage: "",
      withinTolerance: false,
      issues: [
        {
          key: "ebitda_formula",
          severity: "critical",
          section: "income_statement",
          metric: "EBITDA",
          message: "EBITDA does not reconcile within tolerance."
        }
      ]
    },
    series: [],
    incomeStatement: [],
    balanceSheet: [],
    insights: [],
    driverAnalyses: [],
    recommendedActions: [],
    executiveSummary: null,
    taxSourceStatus: {
      documentCount: 0,
      periodCount: 0,
      rowCount: 0,
      mappedLineCount: 0,
      lowConfidenceLineCount: 0,
      broadClassificationCount: 0,
      hasMatchingPeriod: false,
      matchingPeriodLabel: null,
      comparisonStatus: "partial",
      comparisonComputable: false,
      missingComponents: [],
      notes: [],
      revenueDeltaPercent: null,
      computedEbitdaDeltaPercent: null,
      adjustedEbitdaDeltaPercent: null
    },
    underwritingInputs: {
      loanAmount: null,
      annualInterestRatePercent: null,
      loanTermYears: null,
      amortizationYears: null,
      collateralValue: null
    },
    defaultCreditScenario: {
      annualInterestExpense: null,
      annualPrincipalPayment: null,
      annualDebtService: null,
      balanceAtMaturity: null,
      canComputeDebtService: false,
      adverseSignals: [
        "Negative EBITDA",
        "Coverage unsupported due to non-positive earnings"
      ],
      metrics: {
        dscr: {
          label: "DSCR",
          value: null,
          display: "Insufficient data",
          description: "",
          status: "insufficient",
          statusLabel: "Insufficient data"
        },
        debtToEbitda: {
          label: "Debt / EBITDA",
          value: null,
          display: "Insufficient data",
          description: "",
          status: "insufficient",
          statusLabel: "Insufficient data"
        },
        interestCoverage: {
          label: "Interest Coverage",
          value: null,
          display: "Insufficient data",
          description: "",
          status: "insufficient",
          statusLabel: "Insufficient data"
        },
        ltv: {
          label: "LTV",
          value: null,
          display: "Insufficient data",
          description: "",
          status: "insufficient",
          statusLabel: "Insufficient data"
        }
      }
    },
    completionSummary: {
      completionPercent: 35,
      completionStatus: "blocked",
      blockers: [],
      missingItems: [],
      completedItems: [],
      nextActions: [],
      sections: [
        {
          key: "financial_inputs",
          title: "Financial Inputs",
          weight: 25,
          completionPercent: 25,
          status: "blocked",
          completedCount: 1,
          totalCount: 4,
          items: [
            {
              key: "revenue",
              label: "Revenue available",
              isComplete: false,
              isBlocking: true,
              nextAction: "Load or map revenue for the selected period"
            },
            {
              key: "cogs",
              label: "COGS available",
              isComplete: false,
              isBlocking: false,
              nextAction: "Load or map COGS for the selected period"
            },
            {
              key: "ebitda_basis",
              label: "EBITDA basis available",
              isComplete: false,
              isBlocking: true,
              nextAction: "Complete the core income statement mapping needed to support EBITDA"
            }
          ]
        },
        {
          key: "mapping_completeness",
          title: "Mapping",
          weight: 20,
          completionPercent: 25,
          status: "blocked",
          completedCount: 1,
          totalCount: 4,
          items: [
            {
              key: "mapping_coverage",
              label: "Coverage supports usable outputs",
              isComplete: false,
              isBlocking: true,
              nextAction: "Improve mapping coverage before relying on underwriting outputs"
            },
            {
              key: "low_confidence_rows",
              label: "Low-confidence mappings resolved",
              isComplete: false,
              isBlocking: false,
              nextAction: "Review the low-confidence mapped rows"
            }
          ]
        },
        {
          key: "structure_inputs",
          title: "Structure Inputs",
          weight: 20,
          completionPercent: 0,
          status: "blocked",
          completedCount: 0,
          totalCount: 1,
          items: [
            {
              key: "loan_amount",
              label: "Loan amount entered",
              isComplete: false,
              isBlocking: true,
              nextAction: "Enter the proposed loan amount"
            }
          ]
        }
      ]
    },
    backing: {
      sourceRequirements: [
        {
          id: "income_statement",
          label: "Income Statement",
          groupLabel: "Financial Statements",
          documentTypes: ["income_statement"],
          periodLabel: "FY2025",
          fiscalYear: 2025,
          status: "unbacked",
          documents: [],
          linkedDocuments: [],
          missingReason: "No supporting documents linked.",
          actionTarget: {
            entityType: "source_requirement",
            entityId: "income_statement"
          }
        },
        {
          id: "balance_sheet",
          label: "Balance Sheet",
          groupLabel: "Financial Statements",
          documentTypes: ["balance_sheet"],
          periodLabel: "FY2025",
          fiscalYear: 2025,
          status: "unbacked",
          documents: [],
          linkedDocuments: [],
          missingReason: "No supporting documents linked.",
          actionTarget: {
            entityType: "source_requirement",
            entityId: "balance_sheet"
          }
        },
        {
          id: "debt_schedule",
          label: "Debt Schedule",
          groupLabel: "Debt & Credit",
          documentTypes: ["debt_schedule"],
          periodLabel: "FY2025",
          fiscalYear: 2025,
          status: "unbacked",
          documents: [],
          linkedDocuments: [],
          missingReason: "No supporting documents linked.",
          actionTarget: {
            entityType: "source_requirement",
            entityId: "debt_schedule"
          }
        }
      ],
      financialLineItems: [
        {
          id: "revenue",
          label: "Revenue",
          status: "unbacked",
          documents: [],
          linkedDocuments: [],
          sourceRequirementIds: ["income_statement"],
          note: "Line item exists but no supporting documents are linked.",
          actionTarget: {
            entityType: "financial_line_item",
            entityId: "revenue"
          }
        },
        {
          id: "ebitda",
          label: "EBITDA",
          status: "unbacked",
          documents: [],
          linkedDocuments: [],
          sourceRequirementIds: ["income_statement"],
          note: "Line item exists but no supporting documents are linked.",
          actionTarget: {
            entityType: "financial_line_item",
            entityId: "ebitda"
          }
        }
      ],
      underwritingAdjustments: [
        {
          adjustmentId: "review-1",
          label: "Suggested review item",
          status: "unbacked",
          documents: [],
          linkedDocuments: [],
          note: "Support: No supporting documents linked.",
          actionTarget: {
            entityType: "underwriting_adjustment",
            entityId: "review-1"
          }
        }
      ],
      underwritingMetrics: [
        {
          id: "dscr",
          label: "DSCR",
          status: "unbacked",
          documents: [],
          linkedDocuments: [],
          requiredSupportLabels: ["Debt Schedule"],
          missingSupportLabels: ["Debt Schedule"],
          note: "Missing support: Debt Schedule",
          actionTarget: {
            entityType: "underwriting_metric",
            entityId: "dscr"
          }
        }
      ],
      summary: {
        overall: {
          id: "overall",
          label: "Overall",
          status: "unbacked",
          href: "/deal/company-1",
          note: null
        },
        financials: {
          id: "financials",
          label: "Financials",
          status: "unbacked",
          href: "/financials?companyId=company-1",
          note: null
        },
        adjustments: {
          id: "adjustments",
          label: "Adjustments",
          status: "unbacked",
          href: "/deal/company-1/underwriting",
          note: null
        },
        creditInputs: {
          id: "credit_inputs",
          label: "Credit Inputs",
          status: "unbacked",
          href: "/deal/company-1/underwriting",
          note: null
        }
      }
    }
  } as unknown as DealDerivedContext;
}

{
  const candidates = buildSystemDiligenceIssueCandidatesForContext(buildContext());
  const issueCodes = candidates.map((candidate) => candidate.issue_code);

  assert.ok(issueCodes.includes("missing_revenue"));
  assert.ok(issueCodes.includes("missing_cogs"));
  assert.ok(issueCodes.includes("missing_income_statement"));
  assert.ok(issueCodes.includes("missing_balance_sheet"));
  assert.ok(issueCodes.includes("required_mappings_incomplete"));
  assert.ok(issueCodes.includes("financial_line_item_unbacked"));
  assert.ok(issueCodes.includes("balance_sheet_out_of_balance"));
  assert.ok(issueCodes.includes("underwriting_adjustment_unbacked"));
  assert.ok(issueCodes.includes("debt_schedule_missing_for_credit_metric"));
  assert.ok(issueCodes.includes("ebitda_non_positive"));
  assert.ok(issueCodes.includes("dscr_not_meaningful_non_positive_earnings"));
}

{
  const existingIssues: DiligenceIssue[] = [
    {
      id: "issue-1",
      company_id: "company-1",
      period_id: "period-1",
      source_type: "system",
      issue_code: "missing_cogs",
      title: "Old title",
      description: "Old description",
      category: "source_data",
      severity: "high",
      status: "open",
      linked_page: "source_data",
      linked_field: null,
      linked_route: null,
      dedupe_key: "missing_cogs:period-1",
      created_at: "2026-04-17T00:00:00.000Z",
      updated_at: "2026-04-17T00:00:00.000Z",
      resolved_at: null,
      waived_at: null,
      created_by: null,
      owner: null
    }
  ];
  const candidates = [
    {
      company_id: "company-1",
      period_id: "period-1",
      source_type: "system" as const,
      issue_code: "missing_cogs" as const,
      title: "COGS missing for selected period",
      description: "COGS is missing for the selected period.",
      category: "source_data" as const,
      severity: "high" as const,
      status: "open" as const,
      linked_page: "source_data" as const,
      linked_field: null,
      linked_route: "/source-data?companyId=company-1",
      dedupe_key: "missing_cogs:period-1",
      created_by: null,
      owner: null
    }
  ];

  const plan = planDiligenceIssueSync({
    existingIssues,
    candidates,
    now: "2026-04-17T12:00:00.000Z"
  });

  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toUpdate.length, 1);
  assert.equal(plan.toUpdate[0]?.updates.title, "COGS missing for selected period");
}

{
  const existingIssues: DiligenceIssue[] = [
    {
      id: "issue-2",
      company_id: "company-1",
      period_id: "period-1",
      source_type: "system",
      issue_code: "missing_revenue",
      title: "Revenue missing for selected period",
      description: "Revenue is missing for the selected period.",
      category: "source_data",
      severity: "critical",
      status: "open",
      linked_page: "source_data",
      linked_field: null,
      linked_route: null,
      dedupe_key: "missing_revenue:period-1",
      created_at: "2026-04-17T00:00:00.000Z",
      updated_at: "2026-04-17T00:00:00.000Z",
      resolved_at: null,
      waived_at: null,
      created_by: null,
      owner: null
    }
  ];

  const plan = planDiligenceIssueSync({
    existingIssues,
    candidates: [],
    now: "2026-04-17T12:00:00.000Z"
  });

  assert.equal(plan.toCreate.length, 0);
  assert.equal(plan.toUpdate.length, 1);
  assert.equal(plan.toUpdate[0]?.updates.status, "resolved");
}

{
  const existingIssues: DiligenceIssue[] = [
    {
      id: "issue-3",
      company_id: "company-1",
      period_id: "period-1",
      source_type: "manual",
      issue_code: null,
      title: "Manual request",
      description: "Request the monthly AR aging.",
      category: "diligence_request",
      severity: "medium",
      status: "open",
      linked_page: "source_data",
      linked_field: null,
      linked_route: null,
      dedupe_key: null,
      created_at: "2026-04-17T00:00:00.000Z",
      updated_at: "2026-04-17T00:00:00.000Z",
      resolved_at: null,
      waived_at: null,
      created_by: null,
      owner: null
    }
  ];

  const plan = planDiligenceIssueSync({
    existingIssues,
    candidates: [],
    now: "2026-04-17T12:00:00.000Z"
  });

  assert.equal(plan.toUpdate.length, 0);
}

{
  const action = resolveDiligenceIssueActionTarget({
    linked_page: "underwriting",
    linked_route: "/deal/company-1/underwriting",
    linked_field: "add_backs",
    issue_code: "add_back_review_incomplete"
  });

  assert.equal(action.actionLabel, "Review Adjustments");
  assert.equal(action.linkedPage, "underwriting");
  assert.equal(action.linkedRoute, "/deal/company-1/underwriting");
  assert.equal(action.isActionable, true);
}

{
  const previousIssues: DiligenceIssue[] = [
    {
      id: "resolved-1",
      company_id: "company-1",
      period_id: "period-1",
      source_type: "system",
      issue_code: "missing_revenue",
      title: "Revenue missing for selected period",
      description: "",
      category: "source_data",
      severity: "critical",
      status: "open",
      linked_page: "source_data",
      linked_field: "revenue",
      linked_route: "/source-data?companyId=company-1",
      dedupe_key: "missing_revenue:period-1",
      created_at: "",
      updated_at: "",
      resolved_at: null,
      waived_at: null,
      created_by: null,
      owner: null
    }
  ];
  const nextIssues: DiligenceIssue[] = [
    {
      ...previousIssues[0]!,
      status: "resolved",
      resolved_at: "2026-04-17T12:00:00.000Z"
    }
  ];
  const feedback = buildDiligenceIssueFeedback({
    previousIssues,
    nextIssues,
    plan: {
      toCreate: [],
      toUpdate: [
        {
          id: "resolved-1",
          updates: {
            status: "resolved"
          }
        }
      ]
    }
  });

  assert.equal(feedback.resolvedIssueCount, 1);
  assert.deepEqual(feedback.resolvedIssueTitles, ["Revenue missing for selected period"]);
  assert.equal(feedback.readinessChanged, true);
  assert.equal(feedback.previousReadinessLabel, "Not Ready");
  assert.equal(feedback.currentReadinessLabel, "Ready for Lender");
}

{
  const issues: DiligenceIssue[] = [
    {
      id: "a",
      company_id: "company-1",
      period_id: "period-1",
      source_type: "system",
      issue_code: "missing_revenue",
      title: "Revenue missing for selected period",
      description: "",
      category: "source_data",
      severity: "critical",
      status: "open",
      linked_page: "source_data",
      linked_field: null,
      linked_route: null,
      dedupe_key: "missing_revenue:period-1",
      created_at: "",
      updated_at: "",
      resolved_at: null,
      waived_at: null,
      created_by: null,
      owner: null
    },
    {
      id: "b",
      company_id: "company-1",
      period_id: "period-1",
      source_type: "manual",
      issue_code: null,
      title: "Manual tax request",
      description: "",
      category: "tax",
      severity: "medium",
      status: "in_review",
      linked_page: "source_data",
      linked_field: null,
      linked_route: null,
      dedupe_key: null,
      created_at: "",
      updated_at: "",
      resolved_at: null,
      waived_at: null,
      created_by: null,
      owner: null
    },
    {
      id: "c",
      company_id: "company-1",
      period_id: "period-1",
      source_type: "system",
      issue_code: "ebitda_non_positive",
      title: "EBITDA is non-positive",
      description: "",
      category: "credit",
      severity: "high",
      status: "resolved",
      linked_page: "underwriting",
      linked_field: null,
      linked_route: null,
      dedupe_key: "ebitda_non_positive:period-1",
      created_at: "",
      updated_at: "",
      resolved_at: "",
      waived_at: null,
      created_by: null,
      owner: null
    }
  ];

  const summary = summarizeDiligenceIssues(issues);

  assert.equal(summary.total, 3);
  assert.equal(summary.open, 1);
  assert.equal(summary.inReview, 1);
  assert.equal(summary.resolved, 1);
  assert.equal(summary.criticalOpen, 1);
  assert.equal(summary.byPage.source_data, 2);
  assert.equal(summary.topOpenIssue?.title, "Revenue missing for selected period");
}

console.log("diligence issues tests passed");
