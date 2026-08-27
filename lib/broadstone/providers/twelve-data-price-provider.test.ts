import assert from "node:assert/strict";
import { InMemoryMarketCache } from "../market/cache.ts";
import {
  PROTOTYPE_DAILY_CLOSE_FRESHNESS,
  TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY
} from "../market/price-policy.ts";
import { evaluateFreshness } from "../market/freshness.ts";
import { evaluateObservationBundleUse, evaluateProviderUse } from "../market/rights.ts";
import { buildCalculationSnapshotManifest, buildMarketObservationBundle } from "../market/snapshot-builder.ts";
import { CachedMarketPriceProvider } from "./cached-price-provider.ts";
import type {
  MarketPriceProvider,
  MarketPriceRequest,
  MarketPriceResponse
} from "./price-contracts.ts";
import {
  TwelveDataPriceProvider,
  type TwelveDataPriceTransport,
  type TwelveDataTransportRequest,
  type TwelveDataTransportResponse
} from "./twelve-data-price-provider.ts";

const appleSecurity = {
  id: "security-aapl-common",
  companyId: "public-apple",
  ticker: "AAPL",
  exchange: "NASDAQ",
  tradingCurrency: "USD"
};
const microsoftSecurity = {
  id: "security-msft-common",
  companyId: "public-microsoft",
  ticker: "MSFT",
  exchange: "NASDAQ",
  tradingCurrency: "USD"
};

function successBody(symbol: string, values: Array<{ datetime: string; close: string }>) {
  return {
    meta: {
      symbol,
      interval: "1day",
      currency: "USD",
      exchange: "NASDAQ",
      mic_code: "XNAS"
    },
    values,
    status: "ok"
  };
}

class FixtureTwelveDataTransport implements TwelveDataPriceTransport {
  calls: TwelveDataTransportRequest[] = [];
  private readonly response?: TwelveDataTransportResponse;
  constructor(response?: TwelveDataTransportResponse) {
    this.response = response;
  }

  getDailyTimeSeries(request: TwelveDataTransportRequest) {
    this.calls.push(request);
    if (this.response) return Promise.resolve(this.response);
    const close = request.symbol === "AAPL" ? "225.50" : "510.25";
    return Promise.resolve({
      status: 200,
      body: successBody(request.symbol, [
        { datetime: "2026-08-26", close },
        { datetime: "2026-08-25", close: request.symbol === "AAPL" ? "224.00" : "508.00" },
        { datetime: "2026-08-21", close: request.symbol === "AAPL" ? "220.00" : "500.00" }
      ])
    });
  }
}

function provider(transport: TwelveDataPriceTransport, now = "2026-08-27T12:00:00.000Z") {
  return new TwelveDataPriceProvider(
    transport,
    TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY,
    PROTOTYPE_DAILY_CLOSE_FRESHNESS,
    () => new Date(now)
  );
}

const transport = new FixtureTwelveDataTransport();
const apple = await provider(transport).getClosingPrice({
  companyId: "public-apple",
  security: appleSecurity
});
assert.ok(apple.data);
assert.equal(apple.data.observation.metricCode, "share_price");
assert.equal(apple.data.observation.value, 225.5);
assert.equal(apple.data.observation.securityId, appleSecurity.id);
assert.equal(apple.data.observation.effectiveDate, "2026-08-26");
assert.equal(apple.data.observation.priceConvention, "unadjusted_close");
assert.deepEqual(apple.data.observation.unit, {
  kind: "currency",
  currencyCode: "USD",
  scale: "ones"
});
assert.equal(apple.data.observation.provenance[0].sourceSystem, "Broadstone Twelve Data Direct");
assert.equal(apple.data.observation.provenance[0].underlyingSource, "Twelve Data market data");
assert.equal(apple.data.observation.provenance[0].observedAt, "2026-08-27T12:00:00.000Z");
assert.equal(apple.data.rightsPolicy.transportProviderCode, "twelve_data_direct");
assert.equal(apple.data.rightsPolicy.underlyingProviderCode, "twelve_data_market_data");

const microsoft = await provider(transport).getClosingPrice({
  companyId: "public-microsoft",
  security: microsoftSecurity
});
assert.ok(microsoft.data);
assert.equal(microsoft.data.observation.value, 510.25);
assert.equal(microsoft.data.observation.companyId, "public-microsoft");
assert.notEqual(microsoft.data.observation.id, apple.data.observation.id);

const historical = await provider(transport).getClosingPrice({
  companyId: "public-apple",
  security: appleSecurity,
  valuationDate: "2026-08-23"
});
assert.equal(historical.data?.observation.effectiveDate, "2026-08-21");
assert.equal(historical.data?.observation.value, 220);
assert.equal(transport.calls.at(-1)?.endDate, "2026-08-24");

const unsupportedCurrency = await provider(new FixtureTwelveDataTransport({
  status: 200,
  body: {
    ...successBody("AAPL", [{ datetime: "2026-08-26", close: "225.50" }]),
    meta: { symbol: "AAPL", interval: "1day", currency: "GBX", exchange: "LSE" }
  }
})).getClosingPrice({ companyId: "public-apple", security: appleSecurity });
assert.equal(unsupportedCurrency.data, null);
assert.equal(unsupportedCurrency.issues[0]?.code, "unsupported_currency");

for (const fixture of [
  {
    response: { status: 429, body: { status: "error", code: 429, message: "limit" } },
    code: "rate_limited"
  },
  {
    response: { status: 200, body: { status: "error", code: 404, message: "symbol not found" } },
    code: "security_not_found"
  },
  { response: { status: 200, body: { unexpected: true } }, code: "malformed_response" },
  {
    response: { status: 200, body: successBody("AAPL", [{ datetime: "2026-08-26", close: "0" }]) },
    code: "price_unavailable"
  }
] as const) {
  const result = await provider(new FixtureTwelveDataTransport(fixture.response)).getClosingPrice({
    companyId: "public-apple",
    security: appleSecurity
  });
  assert.equal(result.data, null);
  assert.equal(result.issues[0]?.code, fixture.code);
}

const unavailable = await provider({
  getDailyTimeSeries: () => Promise.reject(new Error("offline"))
}).getClosingPrice({ companyId: "public-apple", security: appleSecurity });
assert.equal(unavailable.issues[0]?.code, "provider_unavailable");

const requestedDateUnavailable = await provider(new FixtureTwelveDataTransport({
  status: 200,
  body: successBody("AAPL", [])
})).getClosingPrice({
  companyId: "public-apple",
  security: appleSecurity,
  valuationDate: "1990-01-01"
});
assert.equal(requestedDateUnavailable.issues[0]?.code, "requested_date_unavailable");
assert.equal(requestedDateUnavailable.data, null);

for (const [use, decision] of [
  ["live_analysis", "allowed"],
  ["temporary_cache", "allowed"],
  ["saved_analysis", "denied"],
  ["internal_display", "allowed"],
  ["derived_calculation", "allowed"],
  ["export", "denied"],
  ["ai_context", "requires_review"]
] as const) {
  assert.equal(evaluateProviderUse(TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY, use).decision, decision);
}

assert.equal(
  evaluateFreshness(
    "2026-08-26T00:00:00.000Z",
    "2026-08-27T00:00:00.000Z",
    PROTOTYPE_DAILY_CLOSE_FRESHNESS
  ).state,
  "fresh"
);
assert.equal(
  evaluateFreshness(
    "2026-08-20T00:00:00.000Z",
    "2026-08-27T00:00:00.000Z",
    PROTOTYPE_DAILY_CLOSE_FRESHNESS
  ).state,
  "stale"
);
assert.equal(
  evaluateFreshness(
    "2026-08-19T00:00:00.000Z",
    "2026-08-27T00:00:00.001Z",
    PROTOTYPE_DAILY_CLOSE_FRESHNESS
  ).state,
  "expired"
);

let currentTime = new Date("2026-08-27T12:00:00.000Z");
const cachedTransport = new FixtureTwelveDataTransport();
const directProvider = new TwelveDataPriceProvider(
  cachedTransport,
  TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY,
  PROTOTYPE_DAILY_CLOSE_FRESHNESS,
  () => currentTime
);
const cachedProvider = new CachedMarketPriceProvider(
  directProvider,
  new InMemoryMarketCache(),
  TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY,
  PROTOTYPE_DAILY_CLOSE_FRESHNESS,
  () => currentTime
);
const request: MarketPriceRequest = { companyId: "public-apple", security: appleSecurity };
assert.equal((await cachedProvider.getClosingPrice(request)).source, "provider");
assert.equal(cachedTransport.calls.length, 1);
currentTime = new Date("2026-08-27T12:04:00.000Z");
assert.equal((await cachedProvider.getClosingPrice(request)).source, "cache");
assert.equal(cachedTransport.calls.length, 1);
currentTime = new Date("2026-08-27T12:06:00.000Z");
assert.equal((await cachedProvider.getClosingPrice(request)).source, "provider");
assert.equal(cachedTransport.calls.length, 2);

class FixturePriceProvider implements MarketPriceProvider {
  readonly providerCode = "fixture_price_provider";
  private readonly fixture: MarketPriceResponse;
  constructor(fixture: MarketPriceResponse) {
    this.fixture = fixture;
  }
  getClosingPrice(_request?: MarketPriceRequest): Promise<MarketPriceResponse> {
    return Promise.resolve(structuredClone(this.fixture));
  }
}
const fixtureResult = await new FixturePriceProvider({ ...apple, source: "provider" })
  .getClosingPrice(request);
assert.ok(fixtureResult.data);
assert.deepEqual(
  Object.keys(fixtureResult.data.observation).sort(),
  Object.keys(apple.data.observation).sort()
);

const bundle = buildMarketObservationBundle({
  bundleId: "bundle-price-test",
  company: { id: "public-apple", displayName: "Apple Inc.", companyType: "public" },
  security: appleSecurity,
  valuationDate: "2026-08-26",
  selectedPeriods: [],
  observations: [{
    kind: "market",
    observation: apple.data.observation,
    basis: "market_observed",
    rightsPolicy: apple.data.rightsPolicy,
    freshnessState: apple.data.freshness
  }],
  issues: []
});
const snapshot = buildCalculationSnapshotManifest({
  snapshotId: "snapshot-price-test",
  analysisId: "analysis-price-test",
  analysisVersion: "1",
  valuationDate: bundle.valuationDate,
  createdAt: "2026-08-27T12:00:00.000Z",
  calculationEngineVersion: "engine-v1",
  methodologyVersion: "method-v1",
  observationBundle: bundle,
  issues: [],
  warnings: [],
  overrideReferences: []
});
assert.equal(snapshot.observationBundleHash, bundle.contentHash);
assert.equal(bundle.observations[0]?.observation.value, 225.5);
assert.equal(bundle.observations[0]?.rightsPolicy?.policyId, "broadstone-twelve-data-prototype");
assert.equal(
  bundle.observations[0]?.kind === "market"
    ? bundle.observations[0].freshnessState
    : undefined,
  "fresh"
);
assert.equal(
  evaluateObservationBundleUse(bundle, "saved_analysis", () => TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY).decision,
  "denied"
);
const originalHash = bundle.contentHash;
const refreshed = await provider(
  new FixtureTwelveDataTransport({
    status: 200,
    body: successBody("AAPL", [{ datetime: "2026-08-27", close: "230.00" }])
  }),
  "2026-08-28T12:00:00.000Z"
).getClosingPrice(request);
assert.equal(refreshed.data?.observation.value, 230);
assert.equal(bundle.observations[0]?.observation.value, 225.5);
assert.equal(bundle.contentHash, originalHash);

console.log("twelve data canonical price provider tests passed");
