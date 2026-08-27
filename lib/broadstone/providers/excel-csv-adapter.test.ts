import assert from "node:assert/strict";
import { buildSnapshots } from "../../calculations.ts";
import type { Company, FinancialEntry, ReportingPeriod } from "../../types.ts";
import { ExcelCsvCanonicalAdapter } from "./excel-csv-adapter.ts";

const company: Company = {
  id: "company-adapter",
  name: "Adapter Target",
  industry: null,
  base_currency: "USD",
  stage: "new",
  stage_updated_at: null,
  stage_notes: null,
  created_at: "2026-08-26T00:00:00.000Z"
};

const period: ReportingPeriod = {
  id: "period-fy2025",
  company_id: company.id,
  label: "FY 2025",
  period_date: "2025-12-31",
  created_at: "2026-08-26T00:00:00.000Z"
};

function mappedEntry(params: {
  id: string;
  accountName: string;
  category: "Revenue" | "EBITDA";
  amount: number;
  matchedBy: "manual" | "csv_value";
}): FinancialEntry {
  return {
    id: params.id,
    account_name: params.accountName,
    statement_type: "income",
    amount: params.amount,
    period_id: period.id,
    category: params.category,
    addback_flag: false,
    matched_by: params.matchedBy,
    confidence: "high",
    mapping_explanation: `${params.accountName} mapped to ${params.category}`,
    created_at: "2026-08-26T00:00:00.000Z"
  };
}

const excelEntries = [
  mappedEntry({
    id: "excel-revenue",
    accountName: "Total Sales",
    category: "Revenue",
    amount: 50,
    matchedBy: "manual"
  }),
  mappedEntry({
    id: "excel-ebitda",
    accountName: "Reported EBITDA",
    category: "EBITDA",
    amount: 8,
    matchedBy: "manual"
  })
];

const csvEntries = [
  mappedEntry({
    id: "csv-revenue",
    accountName: "Revenue",
    category: "Revenue",
    amount: 50,
    matchedBy: "csv_value"
  }),
  mappedEntry({
    id: "csv-ebitda",
    accountName: "EBITDA",
    category: "EBITDA",
    amount: 8,
    matchedBy: "csv_value"
  })
];

const adapter = new ExcelCsvCanonicalAdapter();
assert.equal(adapter.providerCode, "broadstone_excel_csv");

const excel = adapter.translate({
  company,
  periods: [period],
  entries: excelEntries,
  source: {
    format: "excel",
    sourceIdentifier: "excel-upload-1",
    importedAt: "2026-08-26T12:00:00.000Z",
    fileName: "Target_Financials.xlsx",
    sheetName: "Income Statement",
    monetaryContext: {
      currencyCode: "USD",
      scale: "millions",
      basis: "source"
    },
    entryLocations: {
      "excel-revenue": { row: 27, column: "F", field: "FY2025" },
      "excel-ebitda": { row: 42, column: "F", field: "FY2025" }
    },
    periodHints: {
      [period.id]: {
        startDate: "2025-01-01",
        periodType: "annual",
        fiscalYear: 2025
      }
    }
  }
});

const csv = adapter.translate({
  company,
  periods: [period],
  entries: csvEntries,
  source: {
    format: "csv",
    sourceIdentifier: "csv-upload-1",
    importedAt: "2026-08-26T12:01:00.000Z",
    fileName: "target_financials.csv",
    monetaryContext: {
      currencyCode: company.base_currency,
      scale: "millions",
      basis: "company_default"
    },
    entryLocations: {
      "csv-revenue": { row: 2, field: "Revenue" },
      "csv-ebitda": { row: 3, field: "EBITDA" }
    }
  }
});

assert.deepEqual(excel.companies, [
  { id: company.id, displayName: company.name, companyType: "private" }
]);
assert.deepEqual(excel.periods, [
  {
    id: period.id,
    companyId: company.id,
    label: period.label,
    periodType: "annual",
    startDate: "2025-01-01",
    endDate: "2025-12-31",
    fiscalYear: 2025,
    fiscalQuarter: null
  }
]);
assert.equal(csv.periods[0]?.periodType, "unknown");
assert.equal(csv.periods[0]?.startDate, null);
assert.equal(csv.periods[0]?.fiscalYear, null);

const canonicalProjection = (dataset: typeof excel) =>
  dataset.observations.map(({ metricCode, value, unit }) => ({
    metricCode,
    value,
    unit
  }));

assert.deepEqual(canonicalProjection(excel), canonicalProjection(csv));
assert.deepEqual(canonicalProjection(excel), [
  {
    metricCode: "revenue",
    value: 50,
    unit: { kind: "currency", currencyCode: "USD", scale: "millions" }
  },
  {
    metricCode: "reported_ebitda",
    value: 8,
    unit: { kind: "currency", currencyCode: "USD", scale: "millions" }
  }
]);

const legacyExcel = buildSnapshots([period], excelEntries)[0];
assert.ok(legacyExcel);
assert.equal(
  excel.observations.find((item) => item.metricCode === "revenue")?.value,
  legacyExcel.revenue
);
assert.equal(
  excel.observations.find((item) => item.metricCode === "reported_ebitda")?.value,
  legacyExcel.reportedEbitda
);

const excelRevenueProvenance = excel.observations.find(
  (item) => item.metricCode === "revenue"
)?.provenance[0];
assert.equal(excelRevenueProvenance?.originalFieldName, "Total Sales");
assert.equal(excelRevenueProvenance?.location?.documentName, "Target_Financials.xlsx");
assert.equal(excelRevenueProvenance?.location?.sheetName, "Income Statement");
assert.equal(excelRevenueProvenance?.location?.row, 27);
assert.equal(excelRevenueProvenance?.location?.column, "F");
assert.equal(excelRevenueProvenance?.mapping?.mappingMethod, "manual");
assert.equal(excelRevenueProvenance?.sourceMetadata?.originalPeriodLabel, "FY 2025");
assert.equal(excelRevenueProvenance?.sourceMetadata?.currencyBasis, "source");

const csvRevenueProvenance = csv.observations.find(
  (item) => item.metricCode === "revenue"
)?.provenance[0];
assert.equal(csvRevenueProvenance?.originalFieldName, "Revenue");
assert.equal(csvRevenueProvenance?.location?.documentName, "target_financials.csv");
assert.equal(csvRevenueProvenance?.location?.sheetName, undefined);
assert.equal(csvRevenueProvenance?.mapping?.mappingMethod, "csv_value");
assert.equal(csvRevenueProvenance?.sourceMetadata?.currencyBasis, "company_default");

const missingMonetaryContext = adapter.translate({
  company,
  periods: [period],
  entries: excelEntries,
  source: {
    format: "excel",
    sourceIdentifier: "excel-upload-without-unit",
    importedAt: "2026-08-26T12:02:00.000Z",
    fileName: "No_Currency.xlsx"
  }
});

assert.deepEqual(missingMonetaryContext.observations, []);
assert.deepEqual(missingMonetaryContext.issues, [
  {
    code: "missing_monetary_unit",
    message:
      "Canonical monetary observations were omitted because currency and scale were not supplied."
  }
]);

console.log("excel csv canonical adapter parity tests passed");
