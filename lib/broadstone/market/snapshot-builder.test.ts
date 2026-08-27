import assert from "node:assert/strict";
import type { CanonicalMarketObservation, MarketObservationBundleInput } from "./contracts.ts";
import {
  buildCalculationSnapshotManifest,
  buildMarketObservationBundle
} from "./snapshot-builder.ts";
import { stableSerialize } from "./hashing.ts";
import { SecPublicMarketProvider, type SecPublicDataTransport } from "../providers/sec-public-market-provider.ts";

const retrievedAt = new Date("2026-08-26T14:00:00.000Z");
const accession = "0000320193-25-000001";

const secFacts = {
  cik: 320193,
  entityName: "Apple Inc.",
  facts: {
    "us-gaap": {
      RevenueFromContractWithCustomerExcludingAssessedTax: {
        units: {
          USD: [{
            val: 400_000_000_000,
            accn: accession,
            fy: 2025,
            fp: "FY",
            form: "10-K",
            filed: "2026-01-31",
            start: "2025-01-01",
            end: "2025-12-31",
            frame: "CY2025"
          }]
        }
      }
    },
    dei: {
      EntityCommonStockSharesOutstanding: {
        units: {
          shares: [{
            val: 15_000_000_000,
            accn: accession,
            fy: 2025,
            fp: "FY",
            form: "10-K",
            filed: "2026-01-31",
            end: "2025-12-31",
            frame: "CY2025"
          }]
        }
      }
    }
  }
};

class SnapshotFixtureTransport implements SecPublicDataTransport {
  getCompanyTickers() {
    return Promise.resolve({ 0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." } });
  }
  getCompanyFacts() {
    return Promise.resolve(secFacts);
  }
}

const publicData = await new SecPublicMarketProvider(
  new SnapshotFixtureTransport(),
  () => retrievedAt
).getCompanyData({ broadstoneCompanyId: "public-apple", cik: "320193", ticker: "AAPL" });
assert.ok(publicData.data);

const priceObservation: CanonicalMarketObservation = {
  id: "fixture-price-aapl-2026-08-25",
  companyId: "public-apple",
  metricCode: "share_price",
  value: 225,
  unit: { kind: "currency", currencyCode: "USD", scale: "ones" },
  effectiveDate: "2026-08-25",
  provenance: [{
    sourceType: "external_provider",
    sourceSystem: "Broadstone Fixture Provider",
    underlyingSource: "Fixture Exchange Close",
    sourceIdentifier: "AAPL:2026-08-25",
    observedAt: retrievedAt.toISOString(),
    originalFieldName: "close"
  }]
};

function bundleInput(overrides: Partial<MarketObservationBundleInput> = {}): MarketObservationBundleInput {
  const data = publicData.data!;
  return {
    bundleId: "bundle-apple-1",
    company: data.company,
    security: {
      id: "security-aapl-common",
      companyId: data.company.id,
      ticker: "AAPL",
      exchange: "NASDAQ",
      tradingCurrency: "USD",
      externalIdentifiers: { ticker: "AAPL", cik: "320193" }
    },
    valuationDate: "2026-08-25",
    selectedPeriods: data.periods,
    observations: [
      ...data.financialObservations.map((observation) => ({
        kind: "financial" as const,
        observation,
        basis: "reported" as const,
        rightsPolicy: { policyId: "sec-public-data", policyVersion: "1" }
      })),
      ...data.marketObservations.map((observation) => ({
        kind: "market" as const,
        observation,
        basis: "reported" as const,
        rightsPolicy: { policyId: "sec-public-data", policyVersion: "1" }
      })),
      { kind: "market", observation: priceObservation, basis: "market_observed" }
    ],
    issues: [{
      code: "reported_ebitda_unavailable",
      message: "Reported EBITDA was not present in the source filing.",
      status: "unavailable"
    }],
    ...overrides
  };
}

function manifest(bundle = buildMarketObservationBundle(bundleInput()), methodologyVersion = "market-v1") {
  return buildCalculationSnapshotManifest({
    snapshotId: "snapshot-1",
    analysisId: "analysis-1",
    analysisVersion: "1",
    valuationDate: bundle.valuationDate,
    createdAt: "2026-08-26T15:00:00.000Z",
    calculationEngineVersion: "engine-v1",
    methodologyVersion,
    observationBundle: bundle,
    ebitdaBasisPolicy: { policyCode: "reported-first", policyVersion: "placeholder" },
    currencyPolicy: { policyCode: "native-currency", policyVersion: "placeholder" },
    issues: bundle.issues,
    warnings: ["Reported EBITDA unavailable"],
    overrideReferences: []
  });
}

const first = buildMarketObservationBundle(bundleInput());
const identical = buildMarketObservationBundle({ ...bundleInput(), bundleId: "runtime-id-does-not-matter" });
assert.equal(first.contentHash, identical.contentHash);

const reorderedInput = bundleInput();
const reordered = buildMarketObservationBundle({
  ...reorderedInput,
  company: {
    ...reorderedInput.company,
    externalIdentifiers: [...(reorderedInput.company.externalIdentifiers ?? [])].reverse(),
  },
  security: reorderedInput.security && {
    ...reorderedInput.security,
    externalIdentifiers: { cik: "320193", ticker: "AAPL" },
  },
  observations: [...reorderedInput.observations].reverse(),
  selectedPeriods: [...reorderedInput.selectedPeriods].reverse()
});
assert.equal(
  stableSerialize({ ...first, contentHash: undefined }),
  stableSerialize({ ...reordered, contentHash: undefined })
);
assert.equal(first.contentHash, reordered.contentHash);

const changedRevenueInput = bundleInput();
const changedRevenue = buildMarketObservationBundle({
  ...changedRevenueInput,
  observations: changedRevenueInput.observations.map((item) =>
    item.kind === "financial" && item.observation.metricCode === "revenue"
      ? { ...item, observation: { ...item.observation, value: item.observation.value + 1 } }
      : item
  )
});
assert.notEqual(first.contentHash, changedRevenue.contentHash);

const changedPriceInput = bundleInput();
const changedPrice = buildMarketObservationBundle({
  ...changedPriceInput,
  observations: changedPriceInput.observations.map((item) =>
    item.kind === "market" && item.observation.metricCode === "share_price"
      ? { ...item, observation: { ...item.observation, value: 226 } }
      : item
  )
});
assert.notEqual(first.contentHash, changedPrice.contentHash);

const laterDateBundle = buildMarketObservationBundle(bundleInput({ valuationDate: "2026-08-26" }));
assert.notEqual(manifest(first).contentHash, manifest(laterDateBundle).contentHash);
assert.notEqual(manifest(first).contentHash, manifest(first, "market-v2").contentHash);

const providerNeutral = buildMarketObservationBundle(structuredClone(bundleInput()));
assert.equal(providerNeutral.contentHash, first.contentHash);
assert.equal("facts" in providerNeutral, false);

const mutableInput = bundleInput();
const frozen = buildMarketObservationBundle(mutableInput);
mutableInput.company.displayName = "Caller mutation";
mutableInput.observations[0]!.observation.value = -1;
assert.equal(frozen.company.displayName, "Apple Inc.");
assert.notEqual(frozen.observations[0]!.observation.value, -1);
assert.ok(Object.isFrozen(frozen));
assert.ok(Object.isFrozen(frozen.observations[0]!.observation.provenance[0]));

const revenue = first.observations.find(
  (item) => item.kind === "financial" && item.observation.metricCode === "revenue"
);
assert.equal(revenue?.observation.provenance[0].sourceSystem, "Broadstone SEC Direct");
assert.equal(revenue?.observation.provenance[0].underlyingSource, "SEC EDGAR");
assert.equal(revenue?.observation.provenance[0].sourceIdentifier, accession);
assert.equal(revenue?.observation.provenance[0].observedAt, retrievedAt.toISOString());

assert.equal(first.issues[0]?.status, "unavailable");
assert.equal(
  first.observations.some((item) => item.observation.id.includes("reported_ebitda")),
  false
);
assert.equal(first.observations.some((item) => item.observation.value === 0), false);

const snapshot = manifest(first);
assert.equal(snapshot.observationBundleHash, first.contentHash);
assert.deepEqual(snapshot.selectedPeriodIds, first.selectedPeriods.map((period) => period.id).sort());
assert.ok(Object.isFrozen(snapshot));

console.log("market snapshot reproducibility tests passed");
