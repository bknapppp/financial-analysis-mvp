import type { AddBack, FinancialEntry, ReportingPeriod } from "../../types";

export type CalculationParityExpectation = {
  revenue: number | null;
  reportedEbitda: number | null;
  calculatedEbitda: number | null;
  selectedEbitda: number | null;
  normalizedEbitda: number | null;
  acceptedAdjustments: number;
};

export type CalculationParityFixture = {
  name: string;
  period: ReportingPeriod;
  entries: FinancialEntry[];
  addBacks: AddBack[];
  expected: CalculationParityExpectation;
};

const CREATED_AT = "2026-01-01T00:00:00.000Z";

function period(id: string): ReportingPeriod {
  return {
    id,
    company_id: "company-parity",
    label: "FY 2025",
    period_date: "2025-12-31",
    created_at: CREATED_AT
  };
}

function entry(
  periodId: string,
  accountName: string,
  category: FinancialEntry["category"],
  amount: number
): FinancialEntry {
  return {
    id: `${periodId}-${accountName}`,
    account_name: accountName,
    statement_type: "income",
    amount,
    period_id: periodId,
    category,
    addback_flag: false,
    created_at: CREATED_AT
  };
}

function adjustment(
  periodId: string,
  id: string,
  amount: number,
  status: AddBack["status"]
): AddBack {
  return {
    id,
    company_id: "company-parity",
    period_id: periodId,
    linked_entry_id: null,
    type: "non_recurring",
    description: id,
    amount,
    classification_confidence: "high",
    source: "user",
    status,
    justification: `${status} parity fixture`,
    supporting_reference: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT
  };
}

const reportedPeriod = period("reported-ebitda");
const calculatedPeriod = period("calculated-fallback");
const adjustmentPeriod = period("adjustment-treatment");
const missingPeriod = period("missing-components");

export const calculationParityFixtures: CalculationParityFixture[] = [
  {
    name: "reported EBITDA is selected while calculated EBITDA remains observable",
    period: reportedPeriod,
    entries: [
      entry(reportedPeriod.id, "Revenue", "Revenue", 1_000),
      entry(reportedPeriod.id, "COGS", "COGS", 400),
      entry(reportedPeriod.id, "Operating Expenses", "Operating Expenses", 300),
      entry(reportedPeriod.id, "Depreciation", "Depreciation / Amortization", 50),
      entry(reportedPeriod.id, "Net Income", "Net Income", 200),
      entry(reportedPeriod.id, "Interest Expense", "Non-operating", 20),
      entry(reportedPeriod.id, "Tax Expense", "Tax Expense", 30),
      entry(reportedPeriod.id, "Reported EBITDA", "EBITDA", 375)
    ],
    addBacks: [],
    expected: {
      revenue: 1_000,
      reportedEbitda: 375,
      calculatedEbitda: 350,
      selectedEbitda: 375,
      normalizedEbitda: 375,
      acceptedAdjustments: 0
    }
  },
  {
    name: "calculated EBITDA is selected when reported EBITDA is unavailable",
    period: calculatedPeriod,
    entries: [
      entry(calculatedPeriod.id, "Revenue", "Revenue", 900),
      entry(calculatedPeriod.id, "COGS", "COGS", 350),
      entry(calculatedPeriod.id, "Operating Expenses", "Operating Expenses", 250),
      entry(calculatedPeriod.id, "Depreciation", "Depreciation / Amortization", 40),
      entry(calculatedPeriod.id, "Net Income", "Net Income", 250),
      entry(calculatedPeriod.id, "Interest Expense", "Non-operating", 15),
      entry(calculatedPeriod.id, "Tax Expense", "Tax Expense", 35)
    ],
    addBacks: [],
    expected: {
      revenue: 900,
      reportedEbitda: null,
      calculatedEbitda: 340,
      selectedEbitda: 340,
      normalizedEbitda: 340,
      acceptedAdjustments: 0
    }
  },
  {
    name: "only accepted adjustments normalize selected EBITDA",
    period: adjustmentPeriod,
    entries: [
      entry(adjustmentPeriod.id, "Revenue", "Revenue", 1_200),
      entry(adjustmentPeriod.id, "COGS", "COGS", 500),
      entry(adjustmentPeriod.id, "Operating Expenses", "Operating Expenses", 350),
      entry(adjustmentPeriod.id, "Depreciation", "Depreciation / Amortization", 50),
      entry(adjustmentPeriod.id, "Net Income", "Net Income", 290),
      entry(adjustmentPeriod.id, "Interest Expense", "Non-operating", 20),
      entry(adjustmentPeriod.id, "Tax Expense", "Tax Expense", 40)
    ],
    addBacks: [
      adjustment(adjustmentPeriod.id, "accepted-adjustment", 25, "accepted"),
      adjustment(adjustmentPeriod.id, "rejected-adjustment", 80, "rejected"),
      adjustment(adjustmentPeriod.id, "suggested-adjustment", 45, "suggested")
    ],
    expected: {
      revenue: 1_200,
      reportedEbitda: null,
      calculatedEbitda: 400,
      selectedEbitda: 400,
      normalizedEbitda: 425,
      acceptedAdjustments: 25
    }
  },
  {
    name: "missing EBITDA components preserve null behavior",
    period: missingPeriod,
    entries: [
      entry(missingPeriod.id, "Revenue", "Revenue", 700),
      entry(missingPeriod.id, "COGS", "COGS", 300),
      entry(missingPeriod.id, "Operating Expenses", "Operating Expenses", 200)
    ],
    addBacks: [adjustment(missingPeriod.id, "accepted-without-basis", 30, "accepted")],
    expected: {
      revenue: 700,
      reportedEbitda: null,
      calculatedEbitda: null,
      selectedEbitda: null,
      normalizedEbitda: null,
      acceptedAdjustments: 30
    }
  }
];
