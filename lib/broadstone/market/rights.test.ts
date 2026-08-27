import assert from "node:assert/strict";
import type { ProviderRequestedUse, ProviderRightsPolicy, ProviderUseRule } from "./rights.ts";
import {
  evaluateObservationBundleUse,
  evaluateProviderUse,
  policyReference,
  SEC_PUBLIC_DATA_RIGHTS_POLICY
} from "./rights.ts";
import { buildCalculationSnapshotManifest, buildMarketObservationBundle } from "./snapshot-builder.ts";

const allow = (reason = "Synthetic fixture permits this use."): ProviderUseRule => ({
  state: "allowed",
  reason
});
const prohibit = (reason = "Synthetic fixture prohibits this use."): ProviderUseRule => ({
  state: "prohibited",
  reason
});
const review = (reason = "Synthetic fixture requires review."): ProviderUseRule => ({
  state: "review_required",
  reason
});

function uses(
  defaultRule: ProviderUseRule,
  overrides: Partial<Record<ProviderRequestedUse, ProviderUseRule>> = {}
): Record<ProviderRequestedUse, ProviderUseRule> {
  return {
    live_analysis: defaultRule,
    temporary_cache: defaultRule,
    persistent_retention: defaultRule,
    saved_analysis: defaultRule,
    internal_display: defaultRule,
    external_display: defaultRule,
    report: defaultRule,
    export: defaultRule,
    ai_context: defaultRule,
    derived_calculation: defaultRule,
    redistribution: defaultRule,
    ...overrides
  };
}

const permissiveFixture: ProviderRightsPolicy = {
  policyId: "synthetic-permissive-provider",
  policyVersion: "test-v1",
  transportProviderCode: "synthetic_transport",
  underlyingProviderCode: "synthetic_permissive_data",
  uses: uses(allow()),
  maximumTemporaryCacheDurationMs: 60_000,
  attribution: { required: false }
};

// This fixture is intentionally fictional and does not describe any real vendor agreement.
const RESTRICTIVE_PROVIDER_TEST_POLICY: ProviderRightsPolicy = {
  policyId: "synthetic-restrictive-provider",
  policyVersion: "test-v1",
  transportProviderCode: "future_aggregator_fixture",
  underlyingProviderCode: "synthetic_restricted_data",
  uses: uses(review(), {
    live_analysis: allow(),
    temporary_cache: allow(),
    persistent_retention: prohibit(),
    saved_analysis: prohibit(),
    internal_display: allow(),
    derived_calculation: allow(),
    export: prohibit(),
    ai_context: prohibit(),
    redistribution: prohibit()
  }),
  maximumTemporaryCacheDurationMs: 30_000,
  attribution: {
    required: true,
    text: "Synthetic provider attribution",
    sourceName: "Synthetic Restricted Data"
  }
};

assert.equal(evaluateProviderUse(permissiveFixture, "export").decision, "allowed");
assert.equal(evaluateProviderUse(RESTRICTIVE_PROVIDER_TEST_POLICY, "export").decision, "denied");
assert.equal(
  evaluateProviderUse(RESTRICTIVE_PROVIDER_TEST_POLICY, "external_display").decision,
  "requires_review"
);
assert.equal(
  evaluateProviderUse(RESTRICTIVE_PROVIDER_TEST_POLICY, "derived_calculation").decision,
  "allowed"
);
assert.equal(evaluateProviderUse(RESTRICTIVE_PROVIDER_TEST_POLICY, "temporary_cache").decision, "allowed");
assert.equal(evaluateProviderUse(RESTRICTIVE_PROVIDER_TEST_POLICY, "saved_analysis").decision, "denied");
assert.equal(evaluateProviderUse(RESTRICTIVE_PROVIDER_TEST_POLICY, "ai_context").decision, "denied");

assert.equal(evaluateProviderUse(SEC_PUBLIC_DATA_RIGHTS_POLICY, "derived_calculation").decision, "allowed");
assert.equal(evaluateProviderUse(SEC_PUBLIC_DATA_RIGHTS_POLICY, "saved_analysis").decision, "allowed");
assert.equal(evaluateProviderUse(SEC_PUBLIC_DATA_RIGHTS_POLICY, "export").decision, "requires_review");
assert.equal(
  evaluateProviderUse(SEC_PUBLIC_DATA_RIGHTS_POLICY, "internal_display").attribution?.text,
  "Source: SEC EDGAR"
);

function bundleFor(policy: ProviderRightsPolicy, version = policy.policyVersion) {
  return buildMarketObservationBundle({
    bundleId: "bundle-rights-test",
    company: { id: "public-fixture", displayName: "Public Fixture", companyType: "public" },
    valuationDate: "2026-08-26",
    selectedPeriods: [{
      id: "public-fixture-fy2025",
      companyId: "public-fixture",
      label: "FY2025",
      periodType: "annual",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      fiscalYear: 2025,
      fiscalQuarter: null
    }],
    observations: [{
      kind: "financial",
      basis: "reported",
      rightsPolicy: { ...policyReference(policy), policyVersion: version },
      observation: {
        id: "public-fixture-revenue-fy2025",
        companyId: "public-fixture",
        periodId: "public-fixture-fy2025",
        metricCode: "revenue",
        value: 100,
        unit: { kind: "currency", currencyCode: "USD", scale: "ones" },
        provenance: [{
          sourceType: "external_provider",
          sourceSystem: policy.transportProviderCode,
          underlyingSource: policy.underlyingProviderCode,
          sourceIdentifier: "fixture-source-record",
          observedAt: "2026-08-26T14:00:00.000Z"
        }]
      }
    }],
    issues: []
  });
}

const restrictiveBundle = bundleFor(RESTRICTIVE_PROVIDER_TEST_POLICY);
const restrictiveResolver = () => RESTRICTIVE_PROVIDER_TEST_POLICY;
const calculationUse = evaluateObservationBundleUse(
  restrictiveBundle,
  "derived_calculation",
  restrictiveResolver
);
assert.equal(calculationUse.decision, "allowed");

const savedUse = evaluateObservationBundleUse(restrictiveBundle, "saved_analysis", restrictiveResolver);
assert.equal(savedUse.decision, "denied");
assert.equal(savedUse.issues[0]?.status, "blocked_by_rights");

const unresolvedUse = evaluateObservationBundleUse(restrictiveBundle, "saved_analysis", () => undefined);
assert.equal(unresolvedUse.decision, "requires_review");

const secBundle = bundleFor(SEC_PUBLIC_DATA_RIGHTS_POLICY);
const secSavedUse = evaluateObservationBundleUse(
  secBundle,
  "saved_analysis",
  () => SEC_PUBLIC_DATA_RIGHTS_POLICY
);
assert.equal(secSavedUse.decision, "allowed");
assert.equal(secBundle.observations[0]?.observation.provenance[0].underlyingSource, "sec_edgar");

const snapshot = buildCalculationSnapshotManifest({
  snapshotId: "snapshot-rights-test",
  analysisId: "analysis-rights-test",
  analysisVersion: "1",
  valuationDate: secBundle.valuationDate,
  createdAt: "2026-08-26T15:00:00.000Z",
  calculationEngineVersion: "engine-v1",
  methodologyVersion: "method-v1",
  observationBundle: secBundle,
  issues: secBundle.issues,
  warnings: [],
  overrideReferences: []
});
assert.equal(snapshot.observationBundleHash, secBundle.contentHash);
assert.equal(secBundle.observations[0]?.rightsPolicy?.policyVersion, "2026-08-26");
assert.notEqual(
  bundleFor(SEC_PUBLIC_DATA_RIGHTS_POLICY, "future-policy-version").contentHash,
  secBundle.contentHash
);

console.log("market provider rights tests passed");
