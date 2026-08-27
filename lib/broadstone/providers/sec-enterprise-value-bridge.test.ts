import assert from "node:assert/strict";
import { MarketCalculationService } from "../market/calculation-service.ts";
import { buildCalculationSnapshotManifest, buildMarketObservationBundle } from "../market/snapshot-builder.ts";
import { TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY } from "../market/price-policy.ts";
import {
  policyReference,
  SEC_PUBLIC_DATA_RIGHTS_POLICY,
  type ProviderRequestedUse,
  type ProviderRightsPolicy,
  type ProviderUseRule
} from "../market/rights.ts";
import type { SnapshotObservation } from "../market/contracts.ts";
import { SecPublicMarketProvider, type SecPublicDataTransport } from "./sec-public-market-provider.ts";

const retrievedAt = new Date("2026-08-27T12:00:00.000Z");
const accession = "0000000001-26-000001";

function instant(value: number, end = "2025-12-31", filed = "2026-02-15", accn = accession) {
  return { val: value, accn, fy: 2025, fp: "FY", form: "10-K", filed, end, frame: "CY2025Q4I" };
}

function duration(value: number) {
  return { ...instant(value), start: "2025-01-01", frame: "CY2025" };
}

function concept(facts: ReturnType<typeof instant>[]) {
  return { units: { USD: facts } };
}

function fixtureFacts(usGaap: Record<string, unknown>) {
  return {
    cik: 1,
    entityName: "Enterprise Value Fixture",
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: concept([duration(200)]),
        OperatingIncomeLoss: concept([duration(50)]),
        NetIncomeLoss: concept([duration(20)]),
        ...usGaap
      },
      dei: {
        EntityCommonStockSharesOutstanding: { units: { shares: [instant(100)] } }
      }
    }
  };
}

class FactsTransport implements SecPublicDataTransport {
  private readonly facts: unknown;
  constructor(facts: unknown) { this.facts = facts; }
  getCompanyTickers() { return Promise.resolve({}); }
  getCompanyFacts() { return Promise.resolve(this.facts); }
}

async function providerResult(usGaap: Record<string, unknown>, valuationDate = "2026-08-26") {
  return new SecPublicMarketProvider(new FactsTransport(fixtureFacts(usGaap)), () => retrievedAt)
    .getCompanyData({
      broadstoneCompanyId: "ev-fixture",
      cik: "1",
      ticker: "EVF",
      valuationDate
    });
}

function metric(result: Awaited<ReturnType<typeof providerResult>>, metricCode: string) {
  return result.data?.financialObservations.find((item) => item.metricCode === metricCode);
}

const simple = await providerResult({
  ShortAndLongTermDebtTotal: concept([instant(300)]),
  CashAndCashEquivalentsAtCarryingValue: concept([instant(50)]),
  PreferredStockValue: concept([instant(10)]),
  NoncontrollingInterestInConsolidatedEntity: concept([instant(5)])
});
assert.equal(metric(simple, "total_debt")?.value, 300);
assert.equal(metric(simple, "cash_and_cash_equivalents")?.value, 50);
assert.equal(metric(simple, "preferred_equity")?.value, 10);
assert.equal(metric(simple, "non_controlling_interest")?.value, 5);
assert.equal(metric(simple, "total_debt")?.confidence, "high");
assert.equal(metric(simple, "total_debt")?.provenance[0].originalFieldName, "ShortAndLongTermDebtTotal");
assert.equal(metric(simple, "total_debt")?.provenance[0].sourceIdentifier, accession);
assert.equal(metric(simple, "total_debt")?.provenance[0].sourceMetadata?.filingDate, "2026-02-15");
assert.equal(metric(simple, "total_debt")?.provenance[0].sourceMetadata?.balanceSheetDate, "2025-12-31");

const components = await providerResult({
  LongTermDebtCurrent: concept([instant(25)]),
  LongTermDebtNoncurrent: concept([instant(275)]),
  CashAndCashEquivalentsAtCarryingValue: concept([instant(50)])
});
assert.equal(metric(components, "total_debt")?.value, 300);
assert.equal(metric(components, "total_debt")?.confidence, "medium");
assert.deepEqual(
  metric(components, "total_debt")?.provenance.map((item) => item.originalFieldName),
  ["LongTermDebtCurrent", "LongTermDebtNoncurrent"]
);

const noDoubleCount = await providerResult({
  ShortAndLongTermDebtTotal: concept([instant(300)]),
  LongTermDebtCurrent: concept([instant(25)]),
  LongTermDebtNoncurrent: concept([instant(275)]),
  CashAndCashEquivalentsAtCarryingValue: concept([instant(50)])
});
assert.equal(metric(noDoubleCount, "total_debt")?.value, 300);
assert.equal(metric(noDoubleCount, "total_debt")?.provenance.length, 1);

const missingDebt = await providerResult({
  CashAndCashEquivalentsAtCarryingValue: concept([instant(50)])
});
assert.equal(metric(missingDebt, "total_debt"), undefined);
assert.ok(missingDebt.issues.some((item) => item.metricCode === "total_debt"));

const ambiguousComponents = await providerResult({
  LongTermDebtCurrent: concept([instant(25)]),
  LongTermDebtNoncurrent: concept([instant(275, "2025-12-31", "2026-02-16", "different-accession")]),
  CashAndCashEquivalentsAtCarryingValue: concept([instant(50)])
});
assert.equal(metric(ambiguousComponents, "total_debt"), undefined);

const ambiguousCash = await providerResult({
  ShortAndLongTermDebtTotal: concept([instant(300)]),
  CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents: concept([instant(75)])
});
assert.equal(metric(ambiguousCash, "cash_and_cash_equivalents"), undefined);
assert.ok(ambiguousCash.issues.some((item) =>
  item.metricCode === "cash_and_cash_equivalents" && item.message.includes("restricted cash")
));

const optionalUnknown = await providerResult({
  ShortAndLongTermDebtTotal: concept([instant(300)]),
  CashAndCashEquivalentsAtCarryingValue: concept([instant(50)])
});
assert.equal(metric(optionalUnknown, "preferred_equity"), undefined);
assert.equal(metric(optionalUnknown, "non_controlling_interest"), undefined);
assert.ok(optionalUnknown.issues.some((item) => item.metricCode === "preferred_equity"));
assert.ok(optionalUnknown.issues.some((item) => item.metricCode === "non_controlling_interest"));

const explicitZero = await providerResult({
  ShortAndLongTermDebtTotal: concept([instant(300)]),
  CashAndCashEquivalentsAtCarryingValue: concept([instant(50)]),
  PreferredStockValue: concept([instant(0)]),
  MinorityInterest: concept([instant(0)])
});
assert.equal(metric(explicitZero, "preferred_equity")?.value, 0);
assert.equal(metric(explicitZero, "non_controlling_interest")?.value, 0);

const historicalFacts = fixtureFacts({
  ShortAndLongTermDebtTotal: concept([
    instant(400, "2025-12-31", "2026-02-15", "future-filing"),
    instant(250, "2024-12-31", "2025-02-15", "available-filing")
  ]),
  CashAndCashEquivalentsAtCarryingValue: concept([
    instant(60, "2025-12-31", "2026-02-15", "future-filing"),
    instant(40, "2024-12-31", "2025-02-15", "available-filing")
  ])
});
const historical = await new SecPublicMarketProvider(new FactsTransport(historicalFacts), () => retrievedAt)
  .getCompanyData({ broadstoneCompanyId: "ev-fixture", cik: "1", valuationDate: "2025-12-31" });
assert.equal(metric(historical, "total_debt")?.value, 250);
assert.equal(metric(historical, "total_debt")?.provenance[0].sourceIdentifier, "available-filing");
assert.equal(metric(historical, "cash_and_cash_equivalents")?.value, 40);

assert.ok(simple.data);
const financialSnapshots: SnapshotObservation[] = simple.data.financialObservations.map((observation) => ({
  kind: "financial",
  observation,
  basis: "reported",
  rightsPolicy: policyReference(SEC_PUBLIC_DATA_RIGHTS_POLICY)
}));
const marketSnapshots: SnapshotObservation[] = simple.data.marketObservations.map((observation) => ({
  kind: "market",
  observation,
  basis: "reported",
  rightsPolicy: policyReference(SEC_PUBLIC_DATA_RIGHTS_POLICY)
}));
const price: SnapshotObservation = {
  kind: "market",
  basis: "market_observed",
  freshnessState: "fresh",
  rightsPolicy: policyReference(TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY),
  observation: {
    id: "ev-fixture:price:2026-08-26",
    companyId: "ev-fixture",
    securityId: "ev-security",
    metricCode: "share_price",
    value: 10,
    unit: { kind: "currency", currencyCode: "USD", scale: "ones" },
    effectiveDate: "2026-08-26",
    priceConvention: "unadjusted_close",
    provenance: [{
      sourceType: "external_provider",
      sourceSystem: "Twelve Data",
      underlyingSource: "Twelve Data",
      sourceIdentifier: "EVF:2026-08-26",
      observedAt: retrievedAt.toISOString()
    }]
  }
};
const bundle = buildMarketObservationBundle({
  bundleId: "sec-ev-bridge",
  company: simple.data.company,
  security: { id: "ev-security", companyId: "ev-fixture", ticker: "EVF", tradingCurrency: "USD" },
  valuationDate: "2026-08-26",
  selectedPeriods: simple.data.periods,
  observations: [price, ...marketSnapshots, ...financialSnapshots],
  issues: []
});
const policies = new Map([
  [SEC_PUBLIC_DATA_RIGHTS_POLICY.policyId, SEC_PUBLIC_DATA_RIGHTS_POLICY],
  [TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY.policyId, TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY]
]);
const service = new MarketCalculationService((reference) => policies.get(reference.policyId));
const calculations = service.calculate(bundle);
assert.equal(calculations.marketCapitalization.value, 1_000);
assert.equal(calculations.enterpriseValue.value, 1_265);
assert.equal(calculations.evToRevenue.value, 6.325);
assert.deepEqual(calculations.enterpriseValue.unit, { kind: "currency", currencyCode: "USD", scale: "ones" });
assert.equal(calculations.enterpriseValue.reference.inputObservationIds.length, 6);
for (const code of ["total_debt", "cash_and_cash_equivalents", "preferred_equity", "non_controlling_interest"]) {
  const observationId = metric(simple, code)?.id;
  assert.ok(observationId && calculations.enterpriseValue.reference.inputObservationIds.includes(observationId));
}

const incompleteBundle = buildMarketObservationBundle({
  ...bundle,
  bundleId: "sec-ev-incomplete",
  observations: bundle.observations.filter((item) =>
    item.kind !== "financial" || item.observation.metricCode !== "preferred_equity"
  )
});
assert.equal(service.calculate(incompleteBundle).enterpriseValue.status, "incomplete");
assert.equal(service.calculate(incompleteBundle).enterpriseValue.value, null);

const allowed: ProviderUseRule = { state: "allowed", reason: "Fixture allows use." };
const blocked: ProviderUseRule = { state: "prohibited", reason: "Fixture blocks derivation." };
const uses = Object.fromEntries([
  "live_analysis", "temporary_cache", "persistent_retention", "saved_analysis", "internal_display",
  "external_display", "report", "export", "ai_context", "derived_calculation", "redistribution"
].map((key) => [key, allowed])) as Record<ProviderRequestedUse, ProviderUseRule>;
const blockedPolicy: ProviderRightsPolicy = {
  ...SEC_PUBLIC_DATA_RIGHTS_POLICY,
  policyId: "sec-rights-block-fixture",
  uses: { ...uses, derived_calculation: blocked }
};
const blockedObservations = bundle.observations.map((item) =>
  item.kind === "financial" && item.observation.metricCode === "cash_and_cash_equivalents"
    ? { ...item, rightsPolicy: policyReference(blockedPolicy) }
    : item
);
const blockedBundle = buildMarketObservationBundle({ ...bundle, bundleId: "sec-ev-blocked", observations: blockedObservations });
const blockedService = new MarketCalculationService((reference) =>
  reference.policyId === blockedPolicy.policyId ? blockedPolicy : policies.get(reference.policyId)
);
assert.equal(blockedService.calculate(blockedBundle).enterpriseValue.status, "blocked_by_rights");

const manifest = buildCalculationSnapshotManifest({
  snapshotId: "sec-ev-snapshot",
  analysisId: "sec-ev-analysis",
  analysisVersion: "1",
  valuationDate: bundle.valuationDate,
  createdAt: retrievedAt.toISOString(),
  calculationEngineVersion: "market-engine-v1",
  methodologyVersion: "market-methodologies-v1",
  observationBundle: bundle,
  issues: [],
  warnings: [],
  overrideReferences: []
});
assert.equal(manifest.observationBundleHash, bundle.contentHash);
assert.equal(calculations.enterpriseValue.reference.observationBundleHash, bundle.contentHash);
assert.ok(Object.isFrozen(bundle.observations));

const revised = await providerResult({
  ShortAndLongTermDebtTotal: concept([instant(325, "2025-12-31", "2026-03-01", "restatement")]),
  CashAndCashEquivalentsAtCarryingValue: concept([instant(50)]),
  PreferredStockValue: concept([instant(10)]),
  NoncontrollingInterestInConsolidatedEntity: concept([instant(5)])
});
assert.equal(metric(revised, "total_debt")?.value, 325);
assert.equal(metric(simple, "total_debt")?.value, 300);

console.log("sec enterprise value bridge coverage tests passed");
