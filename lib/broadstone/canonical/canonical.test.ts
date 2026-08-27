import assert from "node:assert/strict";
import type { CalculationReference } from "../calculations/contracts.ts";
import type {
  CanonicalCompany,
  CanonicalFinancialObservation,
  CanonicalFinancialPeriod,
  DataProvenance
} from "./index.ts";

const company: CanonicalCompany = {
  id: "company-broadstone-1",
  displayName: "Target Company",
  companyType: "private"
};

const period: CanonicalFinancialPeriod = {
  id: "period-fy2025",
  companyId: company.id,
  label: "FY 2025",
  periodType: "annual",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  fiscalYear: 2025,
  fiscalQuarter: null
};

const excelProvenance: DataProvenance = {
  sourceType: "file_import",
  sourceSystem: "Excel",
  sourceIdentifier: "target-financials-upload",
  sourceDocumentId: "document-1",
  location: {
    documentName: "Target_Financials.xlsx",
    sheetName: "Income Statement",
    row: 27,
    column: "FY2025"
  },
  observedAt: "2026-08-26T12:00:00.000Z",
  originalFieldName: "Total Sales",
  mapping: {
    mappingId: "mapping-total-sales",
    mappingMethod: "manual_mapping"
  }
};

const csvProvenance: DataProvenance = {
  sourceType: "file_import",
  sourceSystem: "CSV",
  sourceIdentifier: "target-financials-csv-upload",
  location: {
    documentName: "target_financials.csv",
    row: 12,
    field: "Revenue"
  },
  observedAt: "2026-08-26T12:01:00.000Z",
  originalFieldName: "Revenue"
};

const providerProvenance: DataProvenance = {
  sourceType: "external_provider",
  sourceSystem: "provider-adapter-fixture",
  underlyingSource: "provider-source-fixture",
  sourceIdentifier: "provider-company-123:FY2025:total_revenue",
  location: { field: "total_revenue" },
  observedAt: "2026-08-26T12:02:00.000Z",
  originalFieldName: "total_revenue",
  sourceMetadata: {
    providerRequestId: "request-789",
    restatementSequence: 2,
    audited: true
  }
};

function revenueObservation(
  id: string,
  provenance: DataProvenance
): CanonicalFinancialObservation {
  return {
    id,
    companyId: company.id,
    periodId: period.id,
    metricCode: "revenue",
    value: 50,
    unit: {
      kind: "currency",
      currencyCode: "USD",
      scale: "millions"
    },
    provenance: [provenance],
    confidence: "high"
  };
}

const observations = [
  revenueObservation("observation-excel", excelProvenance),
  revenueObservation("observation-csv", csvProvenance),
  revenueObservation("observation-provider", providerProvenance)
];

for (const observation of observations) {
  assert.equal(observation.companyId, company.id);
  assert.equal(observation.periodId, period.id);
  assert.equal(observation.metricCode, "revenue");
  assert.equal(observation.value, 50);
  assert.deepEqual(observation.unit, {
    kind: "currency",
    currencyCode: "USD",
    scale: "millions"
  });
  assert.equal(observation.provenance.length, 1);
}

assert.deepEqual(
  observations.map(({ companyId, periodId, metricCode, value, unit }) => ({
    companyId,
    periodId,
    metricCode,
    value,
    unit
  })),
  observations.map(() => ({
    companyId: company.id,
    periodId: period.id,
    metricCode: "revenue",
    value: 50,
    unit: { kind: "currency", currencyCode: "USD", scale: "millions" }
  }))
);

assert.deepEqual(
  observations.map((observation) => observation.provenance[0]?.originalFieldName),
  ["Total Sales", "Revenue", "total_revenue"]
);
assert.equal(
  observations[0]?.provenance[0]?.location?.documentName,
  "Target_Financials.xlsx"
);
assert.equal(
  observations[2]?.provenance[0]?.sourceMetadata?.providerRequestId,
  "request-789"
);

const calculationLineage: CalculationReference = {
  calculator: "buildSnapshots",
  field: "adjustedEbitda"
};

assert.equal("sourceType" in calculationLineage, false);
assert.equal("calculator" in excelProvenance, false);

console.log("canonical financial data provider-neutrality tests passed");
