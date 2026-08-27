import assert from "node:assert/strict";
import type { CanonicalMetricCode } from "../calculations/contracts.ts";
import type { CanonicalFinancialPeriod } from "../canonical/contracts.ts";
import { TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY } from "./price-policy.ts";
import { MarketCalculationService } from "./calculation-service.ts";
import type {
  MarketObservationBundleInput,
  SnapshotObservation
} from "./contracts.ts";
import { buildCalculationSnapshotManifest, buildMarketObservationBundle } from "./snapshot-builder.ts";
import {
  policyReference,
  SEC_PUBLIC_DATA_RIGHTS_POLICY,
  type ProviderRequestedUse,
  type ProviderRightsPolicy,
  type ProviderUseRule
} from "./rights.ts";

const allow: ProviderUseRule = { state: "allowed", reason: "Synthetic fixture permits use." };
const prohibit: ProviderUseRule = { state: "prohibited", reason: "Synthetic fixture blocks derived calculations." };

function allUses(rule: ProviderUseRule): Record<ProviderRequestedUse, ProviderUseRule> {
  return {
    live_analysis: rule,
    temporary_cache: rule,
    persistent_retention: rule,
    saved_analysis: rule,
    internal_display: rule,
    external_display: rule,
    report: rule,
    export: rule,
    ai_context: rule,
    derived_calculation: rule,
    redistribution: rule
  };
}

const BRIDGE_FIXTURE_POLICY: ProviderRightsPolicy = {
  policyId: "synthetic-bridge-fixture",
  policyVersion: "test-v1",
  transportProviderCode: "synthetic_fixture",
  underlyingProviderCode: "synthetic_fundamentals",
  uses: allUses(allow),
  attribution: { required: false }
};

const RIGHTS_BLOCK_FIXTURE_POLICY: ProviderRightsPolicy = {
  policyId: "synthetic-rights-block-fixture",
  policyVersion: "test-v1",
  transportProviderCode: "synthetic_fixture",
  underlyingProviderCode: "synthetic_restricted_data",
  uses: {
    ...allUses(allow),
    derived_calculation: prohibit
  },
  attribution: { required: false }
};

const policies = new Map([
  [SEC_PUBLIC_DATA_RIGHTS_POLICY.policyId, SEC_PUBLIC_DATA_RIGHTS_POLICY],
  [TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY.policyId, TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY],
  [BRIDGE_FIXTURE_POLICY.policyId, BRIDGE_FIXTURE_POLICY],
  [RIGHTS_BLOCK_FIXTURE_POLICY.policyId, RIGHTS_BLOCK_FIXTURE_POLICY]
]);
const service = new MarketCalculationService((reference) => policies.get(reference.policyId));

const annual2025: CanonicalFinancialPeriod = {
  id: "public-fixture:annual:2025-12-31",
  companyId: "public-fixture",
  label: "FY 2025",
  periodType: "annual",
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  fiscalYear: 2025,
  fiscalQuarter: null
};
const annual2024: CanonicalFinancialPeriod = {
  id: "public-fixture:annual:2024-12-31",
  companyId: "public-fixture",
  label: "FY 2024",
  periodType: "annual",
  startDate: "2024-01-01",
  endDate: "2024-12-31",
  fiscalYear: 2024,
  fiscalQuarter: null
};

function financial(
  metricCode: CanonicalMetricCode,
  value: number,
  period = annual2025,
  currencyCode = "USD",
  policy = SEC_PUBLIC_DATA_RIGHTS_POLICY
): SnapshotObservation {
  return {
    kind: "financial",
    basis: "reported",
    rightsPolicy: policyReference(policy),
    observation: {
      id: `${period.id}:${metricCode}`,
      companyId: "public-fixture",
      periodId: period.id,
      metricCode,
      value,
      unit: { kind: "currency", currencyCode, scale: "ones" },
      provenance: [{
        sourceType: "external_provider",
        sourceSystem: policy.transportProviderCode,
        underlyingSource: policy.underlyingProviderCode,
        sourceIdentifier: `${period.id}:${metricCode}`,
        observedAt: "2026-08-27T12:00:00.000Z"
      }]
    }
  };
}

function price(params: {
  effectiveDate?: string;
  freshnessState?: "fresh" | "aging" | "stale" | "expired" | "unknown";
  policy?: ProviderRightsPolicy;
} = {}): SnapshotObservation {
  const effectiveDate = params.effectiveDate ?? "2026-08-26";
  const policy = params.policy ?? TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY;
  return {
    kind: "market",
    basis: "market_observed",
    freshnessState: params.freshnessState ?? "fresh",
    rightsPolicy: policyReference(policy),
    observation: {
      id: `security-fixture:share_price:${effectiveDate}`,
      companyId: "public-fixture",
      securityId: "security-fixture",
      metricCode: "share_price",
      value: 10,
      unit: { kind: "currency", currencyCode: "USD", scale: "ones" },
      effectiveDate,
      priceConvention: "unadjusted_close",
      provenance: [{
        sourceType: "external_provider",
        sourceSystem: policy.transportProviderCode,
        underlyingSource: policy.underlyingProviderCode,
        sourceIdentifier: `price:${effectiveDate}`,
        observedAt: "2026-08-27T12:00:00.000Z"
      }]
    }
  };
}

function shares(effectiveDate = "2025-12-31"): SnapshotObservation {
  return {
    kind: "market",
    basis: "reported",
    rightsPolicy: policyReference(SEC_PUBLIC_DATA_RIGHTS_POLICY),
    observation: {
      id: `public-fixture:shares:${effectiveDate}`,
      companyId: "public-fixture",
      metricCode: "shares_outstanding",
      value: 100,
      unit: { kind: "shares", scale: "ones" },
      effectiveDate,
      provenance: [{
        sourceType: "external_provider",
        sourceSystem: "Broadstone SEC Direct",
        underlyingSource: "SEC EDGAR",
        sourceIdentifier: `shares:${effectiveDate}`,
        observedAt: "2026-08-27T12:00:00.000Z"
      }]
    }
  };
}

function baseObservations(): SnapshotObservation[] {
  return [
    price(),
    shares(),
    financial("revenue", 200, annual2025),
    financial("operating_income", 50, annual2025),
    financial("net_income", 20, annual2025),
    financial("revenue", 100, annual2024),
    financial("operating_income", 20, annual2024),
    financial("net_income", 10, annual2024)
  ];
}

function bundle(overrides: Partial<MarketObservationBundleInput> = {}) {
  return buildMarketObservationBundle({
    bundleId: "market-calculation-fixture",
    company: { id: "public-fixture", displayName: "Public Fixture", companyType: "public" },
    security: {
      id: "security-fixture",
      companyId: "public-fixture",
      ticker: "FIX",
      exchange: "NASDAQ",
      tradingCurrency: "USD"
    },
    valuationDate: "2026-08-26",
    selectedPeriods: [annual2025, annual2024],
    observations: baseObservations(),
    issues: [],
    ...overrides
  });
}

const calculations = service.calculate(bundle());
assert.equal(calculations.marketCapitalization.value, 1_000);
assert.equal(calculations.marketCapitalization.status, "available_with_warning");
assert.deepEqual(calculations.marketCapitalization.unit, {
  kind: "currency",
  currencyCode: "USD",
  scale: "ones"
});
assert.equal(calculations.marketCapitalization.valuationDate, "2026-08-26");
assert.deepEqual(calculations.marketCapitalization.reference.inputObservationIds, [
  "public-fixture:shares:2025-12-31",
  "security-fixture:share_price:2026-08-26"
]);
assert.equal(calculations.marketCapitalization.reference.methodologyId, "market_cap.v1");
assert.equal(calculations.marketCapitalization.warnings.length, 1);

assert.equal(calculations.revenueGrowth.value, 1);
assert.equal(calculations.revenueGrowth.status, "available");
assert.deepEqual(calculations.revenueGrowth.financialPeriodIds, [annual2024.id, annual2025.id]);
assert.equal(calculations.operatingMargin.value, 0.25);
assert.equal(calculations.netIncomeMargin.value, 0.1);
assert.equal(calculations.priceToEarnings.value, 50);
assert.equal(calculations.priceToEarnings.status, "available_with_warning");
assert.ok(calculations.priceToEarnings.warnings.some((warning) => warning.includes("not an LTM")));

assert.equal(calculations.enterpriseValue.value, null);
assert.equal(calculations.enterpriseValue.status, "incomplete");
assert.ok(calculations.enterpriseValue.blockers[0]?.includes("total_debt"));
assert.equal(calculations.evToRevenue.status, "unavailable");
assert.equal(calculations.ebitda.status, "unavailable");
assert.equal(calculations.ebitda.ebitdaBasis, "unavailable");
assert.equal(calculations.ebitdaMargin.status, "unavailable");
assert.equal(calculations.evToEbitda.status, "unavailable");

const missingShares = service.calculate(bundle({
  observations: baseObservations().filter((item) => item.observation.metricCode !== "shares_outstanding")
}));
assert.equal(missingShares.marketCapitalization.value, null);
assert.equal(missingShares.marketCapitalization.status, "unavailable");

const missingPrice = service.calculate(bundle({
  observations: baseObservations().filter((item) => item.observation.metricCode !== "share_price")
}));
assert.equal(missingPrice.marketCapitalization.value, null);
assert.equal(missingPrice.marketCapitalization.status, "unavailable");

const outdated = baseObservations().filter((item) => item.observation.metricCode !== "shares_outstanding");
outdated.push(shares("2020-12-31"));
assert.equal(service.calculate(bundle({ observations: outdated })).marketCapitalization.status, "incomplete");

const futureRelative = baseObservations().filter((item) =>
  item.observation.metricCode !== "share_price" && item.observation.metricCode !== "shares_outstanding"
);
futureRelative.push(price({ effectiveDate: "2026-08-20" }), shares("2026-08-25"));
assert.equal(
  service.calculate(bundle({ observations: futureRelative })).marketCapitalization.status,
  "incomplete"
);

const rightsBlocked = baseObservations().filter((item) => item.observation.metricCode !== "share_price");
rightsBlocked.push(price({ policy: RIGHTS_BLOCK_FIXTURE_POLICY }));
assert.equal(
  service.calculate(bundle({ observations: rightsBlocked })).marketCapitalization.status,
  "blocked_by_rights"
);

const staleObservations = baseObservations().filter((item) => item.observation.metricCode !== "share_price");
staleObservations.push(price({ freshnessState: "stale" }));
assert.equal(service.calculate(bundle({ observations: staleObservations })).marketCapitalization.status, "stale");

const incompatiblePeriods: CanonicalFinancialPeriod[] = [
  { ...annual2025, startDate: "2025-07-01" },
  annual2024
];
assert.equal(
  service.calculate(bundle({ selectedPeriods: incompatiblePeriods })).revenueGrowth.status,
  "incomplete"
);

assert.equal(
  service.calculate(bundle({ selectedPeriods: [annual2025] })).revenueGrowth.status,
  "unavailable"
);

const zeroRevenue = baseObservations().map((item) =>
  item.kind === "financial"
    && item.observation.metricCode === "revenue"
    && item.observation.periodId === annual2025.id
    ? { ...item, observation: { ...item.observation, value: 0 } }
    : item
);
assert.equal(service.calculate(bundle({ observations: zeroRevenue })).operatingMargin.status, "invalid");

const periodMismatch = baseObservations().filter((item) =>
  !(item.kind === "financial"
    && item.observation.metricCode === "operating_income"
    && item.observation.periodId === annual2025.id)
);
assert.equal(service.calculate(bundle({ observations: periodMismatch })).operatingMargin.status, "unavailable");

const completeBridge = [
  ...baseObservations(),
  financial("total_debt", 300, annual2025, "USD", BRIDGE_FIXTURE_POLICY),
  financial("cash_and_cash_equivalents", 50, annual2025, "USD", BRIDGE_FIXTURE_POLICY),
  financial("preferred_equity", 10, annual2025, "USD", BRIDGE_FIXTURE_POLICY),
  financial("non_controlling_interest", 5, annual2025, "USD", BRIDGE_FIXTURE_POLICY)
];
const complete = service.calculate(bundle({ observations: completeBridge }));
assert.equal(complete.enterpriseValue.value, 1_265);
assert.equal(complete.enterpriseValue.reference.methodologyId, "enterprise_value.v1");
assert.equal(complete.evToRevenue.value, 6.325);
assert.equal(complete.evToRevenue.reference.inputObservationIds.length, 7);

const currencyMismatch = completeBridge.map((item) =>
  item.kind === "financial" && item.observation.metricCode === "cash_and_cash_equivalents"
    ? { ...item, observation: { ...item.observation, unit: { ...item.observation.unit, currencyCode: "EUR" } } }
    : item
);
assert.equal(
  service.calculate(bundle({ observations: currencyMismatch })).enterpriseValue.status,
  "incomplete"
);

const frozenBundle = bundle();
const frozenCalculations = service.calculate(frozenBundle);
const manifest = buildCalculationSnapshotManifest({
  snapshotId: "market-calculation-snapshot",
  analysisId: "market-calculation-analysis",
  analysisVersion: "1",
  valuationDate: frozenBundle.valuationDate,
  createdAt: "2026-08-27T12:00:00.000Z",
  calculationEngineVersion: "market-engine-v1",
  methodologyVersion: "market-methodologies-v1",
  observationBundle: frozenBundle,
  issues: [],
  warnings: [],
  overrideReferences: []
});
assert.equal(frozenCalculations.observationBundleHash, manifest.observationBundleHash);
assert.equal(
  frozenCalculations.marketCapitalization.reference.observationBundleHash,
  manifest.observationBundleHash
);
assert.ok(Object.isFrozen(frozenCalculations));
assert.ok(Object.isFrozen(frozenCalculations.marketCapitalization.reference.inputObservationIds));

const refreshedObservations = baseObservations().map((item) =>
  item.kind === "market" && item.observation.metricCode === "share_price"
    ? { ...item, observation: { ...item.observation, value: 12 } }
    : item
);
const refreshedBundle = bundle({ bundleId: "market-calculation-refreshed", observations: refreshedObservations });
assert.notEqual(refreshedBundle.contentHash, frozenBundle.contentHash);
assert.equal(service.calculate(refreshedBundle).marketCapitalization.value, 1_200);
assert.equal(frozenCalculations.marketCapitalization.value, 1_000);

console.log("authoritative market calculation tests passed");

