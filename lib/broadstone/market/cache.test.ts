import assert from "node:assert/strict";
import {
  buildMarketCacheKey,
  deriveMarketCachePolicy,
  InMemoryMarketCache
} from "./cache.ts";
import {
  evaluateFreshness,
  SEC_COMPANY_IDENTITY_FRESHNESS,
  SEC_FILING_FACT_FRESHNESS
} from "./freshness.ts";
import { SEC_PUBLIC_DATA_RIGHTS_POLICY } from "./rights.ts";
import type { ProviderRequestedUse, ProviderRightsPolicy, ProviderUseRule } from "./rights.ts";

const allow: ProviderUseRule = { state: "allowed", reason: "Synthetic fixture permits this use." };
const prohibit: ProviderUseRule = { state: "prohibited", reason: "Synthetic fixture prohibits this use." };
const restrictiveUses = Object.fromEntries(
  ([
    "live_analysis",
    "temporary_cache",
    "persistent_retention",
    "saved_analysis",
    "internal_display",
    "external_display",
    "report",
    "export",
    "ai_context",
    "derived_calculation",
    "redistribution"
  ] satisfies ProviderRequestedUse[]).map((use) => [use, allow])
) as Record<ProviderRequestedUse, ProviderUseRule>;
restrictiveUses.persistent_retention = prohibit;
restrictiveUses.saved_analysis = prohibit;
restrictiveUses.export = prohibit;
restrictiveUses.ai_context = prohibit;
restrictiveUses.redistribution = prohibit;

// Synthetic cache-policy fixture only; this does not describe any real vendor agreement.
const RESTRICTIVE_PROVIDER_TEST_POLICY: ProviderRightsPolicy = {
  policyId: "synthetic-restrictive-provider",
  policyVersion: "test-v1",
  transportProviderCode: "future_aggregator_fixture",
  underlyingProviderCode: "synthetic_restricted_data",
  uses: restrictiveUses,
  maximumTemporaryCacheDurationMs: 30_000,
  attribution: { required: true, text: "Synthetic provider attribution" }
};

const keyInput = {
  providerCode: "broadstone_sec_direct",
  dataset: "company_facts",
  operation: "get_company_data",
  companyId: "public-apple",
  metricCode: "revenue",
  periodId: "fy2025",
  currencyCode: "USD",
  observationBasis: "reported"
};
const firstKey = buildMarketCacheKey(keyInput);
const equivalentKey = buildMarketCacheKey({
  currencyCode: "USD",
  periodId: "fy2025",
  metricCode: "revenue",
  companyId: "public-apple",
  operation: "get_company_data",
  dataset: "company_facts",
  providerCode: "broadstone_sec_direct",
  observationBasis: "reported"
});
assert.equal(firstKey, equivalentKey);
assert.notEqual(firstKey, buildMarketCacheKey({ ...keyInput, periodId: "fy2024" }));
assert.notEqual(firstKey, buildMarketCacheKey({ ...keyInput, companyId: "public-microsoft" }));

assert.equal(
  evaluateFreshness("2026-08-26T00:00:00.000Z", "2026-08-26T12:00:00.000Z", SEC_COMPANY_IDENTITY_FRESHNESS).state,
  "fresh"
);
assert.equal(
  evaluateFreshness("2026-08-01T00:00:00.000Z", "2026-08-26T00:00:00.000Z", SEC_COMPANY_IDENTITY_FRESHNESS).state,
  "stale"
);
assert.equal(
  evaluateFreshness("2026-01-31T00:00:00.000Z", "2026-08-26T00:00:00.000Z", SEC_FILING_FACT_FRESHNESS).state,
  "fresh"
);
assert.equal(
  evaluateFreshness("invalid", "2026-08-26T00:00:00.000Z", SEC_FILING_FACT_FRESHNESS).state,
  "unknown"
);

const cappedPolicy = deriveMarketCachePolicy({
  providerPolicy: RESTRICTIVE_PROVIDER_TEST_POLICY,
  tier: "temporary",
  dataClass: "financial_statement",
  intendedUse: "derived_calculation",
  requestedTtlMs: 120_000
});
assert.equal(cappedPolicy.eligible, true);
assert.equal(cappedPolicy.ttlMs, 30_000);

const restrictedPersistence = deriveMarketCachePolicy({
  providerPolicy: RESTRICTIVE_PROVIDER_TEST_POLICY,
  tier: "persistent",
  dataClass: "financial_statement",
  intendedUse: "saved_analysis"
});
assert.equal(restrictedPersistence.eligible, false);
assert.equal(restrictedPersistence.rightsDecision.decision, "denied");

const cache = new InMemoryMarketCache<{ revenue: number }>();
const storedAt = "2026-08-26T14:00:00.000Z";
const temporaryWrite = cache.set(firstKey, { revenue: 100 }, {
  providerPolicy: RESTRICTIVE_PROVIDER_TEST_POLICY,
  tier: "temporary",
  dataClass: "financial_statement",
  intendedUse: "derived_calculation",
  requestedTtlMs: 30_000,
  storedAt,
  sourceObservedAt: storedAt,
  freshnessPolicy: SEC_FILING_FACT_FRESHNESS
});
assert.equal(temporaryWrite.stored, true);
assert.equal(cache.isFresh(firstKey, "2026-08-26T14:00:20.000Z"), true);
assert.equal(cache.get(firstKey, "2026-08-26T14:00:31.000Z").entry, null);

const prohibitedKey = buildMarketCacheKey({ ...keyInput, operation: "saved_analysis" });
const prohibitedWrite = cache.set(prohibitedKey, { revenue: 100 }, {
  providerPolicy: RESTRICTIVE_PROVIDER_TEST_POLICY,
  tier: "persistent",
  dataClass: "financial_statement",
  intendedUse: "saved_analysis",
  storedAt,
  sourceObservedAt: storedAt,
  freshnessPolicy: SEC_FILING_FACT_FRESHNESS
});
assert.equal(prohibitedWrite.stored, false);
assert.equal(cache.get(prohibitedKey, storedAt).entry, null);

const secKey = buildMarketCacheKey({ ...keyInput, operation: "saved_sec_analysis" });
assert.equal(cache.set(secKey, { revenue: 100 }, {
  providerPolicy: SEC_PUBLIC_DATA_RIGHTS_POLICY,
  tier: "persistent",
  dataClass: "sec_filing_fact",
  intendedUse: "saved_analysis",
  storedAt,
  sourceObservedAt: "2026-01-31T00:00:00.000Z",
  freshnessPolicy: SEC_FILING_FACT_FRESHNESS
}).stored, true);
assert.equal(cache.get(secKey, "2026-08-26T14:00:00.000Z").freshness, "fresh");
assert.equal(cache.delete(secKey), true);

const expiredOne = buildMarketCacheKey({ ...keyInput, operation: "expired_one" });
const expiredTwo = buildMarketCacheKey({ ...keyInput, operation: "expired_two" });
for (const key of [expiredOne, expiredTwo]) {
  cache.set(key, { revenue: 100 }, {
    providerPolicy: RESTRICTIVE_PROVIDER_TEST_POLICY,
    tier: "temporary",
    dataClass: "financial_statement",
    intendedUse: "derived_calculation",
    requestedTtlMs: 1_000,
    storedAt,
    sourceObservedAt: storedAt,
    freshnessPolicy: SEC_FILING_FACT_FRESHNESS
  });
}
assert.equal(cache.clearExpired("2026-08-26T14:00:02.000Z"), 2);

console.log("market freshness and cache policy tests passed");
