import assert from "node:assert/strict";
import type { CanonicalFinancialObservation } from "../canonical/index.ts";
import { MarketCalculationService } from "../market/calculation-service.ts";
import type { SnapshotObservation } from "../market/contracts.ts";
import { TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY } from "../market/price-policy.ts";
import {
  policyReference,
  SEC_PUBLIC_DATA_RIGHTS_POLICY,
  type ProviderRequestedUse,
  type ProviderRightsPolicy,
  type ProviderUseRule
} from "../market/rights.ts";
import { buildCalculationSnapshotManifest, buildMarketObservationBundle } from "../market/snapshot-builder.ts";
import {
  calculateFundamentalsCoverage,
  compareCanonicalFundamentals
} from "./fundamentals-evaluation.ts";
import type {
  FundamentalsProvider,
  OpenBBFundamentalsRequest,
  OpenBBFundamentalsResponse,
  OpenBBFundamentalsTransport,
  OpenBBFundamentalsTransportRequest
} from "./openbb-fundamentals-contracts.ts";
import { OPENBB_FMP_PROTOTYPE_RIGHTS_POLICY } from "./openbb-fmp-rights.ts";
import { OpenBBFundamentalsProvider } from "./openbb-fundamentals-provider.ts";

const now = new Date("2026-08-27T12:00:00.000Z");
const annualBase = {
  symbol: "COMP",
  period_ending: "2025-12-31",
  fiscal_year: 2025,
  fiscal_period: "FY",
  reported_currency: "USD"
};
const ltmBase = {
  symbol: "COMP",
  period_ending: "2026-06-30",
  fiscal_year: 2026,
  fiscal_period: "TTM",
  reported_currency: "USD"
};

type Profile = {
  ticker: string;
  annual: Record<string, unknown>;
  ltm: Record<string, unknown>;
  balance: Record<string, unknown>;
};

function profile(ticker: string, missing: readonly string[] = []): Profile {
  const annual: Record<string, unknown> = {
    ...annualBase, symbol: ticker, revenue: 200, operating_income: 50, net_income: 20, ebitda: 60
  };
  const ltm: Record<string, unknown> = {
    ...ltmBase, symbol: ticker, revenue: 220, net_income: 22, ebitda: 66
  };
  const balance: Record<string, unknown> = {
    ...annualBase, symbol: ticker, total_debt: 300, cash_and_cash_equivalents: 50
  };
  for (const field of missing) {
    delete annual[field];
    delete ltm[field];
    delete balance[field];
  }
  return { ticker, annual, ltm, balance };
}

const profiles: Profile[] = [
  { ...profile("SOFT"), balance: { ...profile("SOFT").balance, preferred_stock: 10 } },
  { ...profile("IND"), balance: { ...profile("IND").balance, total_equity_non_controlling_interests: 5 } },
  { ...profile("CONS"), balance: { ...profile("CONS").balance, preferred_stock: 8 } },
  { ...profile("DEBT"), balance: { ...profile("DEBT").balance, total_equity_non_controlling_interests: 12 } },
  profile("NODEBT", ["total_debt"]),
  { ...profile("LOSS", ["ebitda"]), annual: { ...profile("LOSS", ["ebitda"]).annual, net_income: -30 } },
  { ...profile("NCI", ["ebitda"]), balance: { ...profile("NCI", ["ebitda"]).balance, total_equity_non_controlling_interests: 15 } },
  profile("JUNE")
];
delete profiles[6]!.annual.ebitda;
delete profiles[6]!.ltm.ebitda;

class FixtureTransport implements OpenBBFundamentalsTransport {
  private readonly fixture: Profile;
  constructor(fixture: Profile) { this.fixture = fixture; }
  getIncome(request: OpenBBFundamentalsTransportRequest) {
    return Promise.resolve({ provider: "fmp", results: [request.period === "ttm" ? this.fixture.ltm : this.fixture.annual] });
  }
  getBalance() { return Promise.resolve({ provider: "fmp", results: [this.fixture.balance] }); }
}

const allow: ProviderUseRule = { state: "allowed", reason: "Contract fixture represents approved prototype rights." };
const approvedUses = Object.fromEntries(([
  "live_analysis", "temporary_cache", "persistent_retention", "saved_analysis", "internal_display",
  "external_display", "report", "export", "ai_context", "derived_calculation", "redistribution"
] satisfies ProviderRequestedUse[]).map((use) => [use, allow])) as Record<ProviderRequestedUse, ProviderUseRule>;
const APPROVED_FIXTURE_POLICY: ProviderRightsPolicy = {
  policyId: "approved-fmp-contract-fixture",
  policyVersion: "test-v1",
  transportProviderCode: "openbb_isolated_v4_7_0",
  underlyingProviderCode: "fmp",
  uses: approvedUses,
  attribution: { required: true, text: "Fixture: OpenBB transport / FMP underlying" }
};

async function resultFor(fixture: Profile, policy = APPROVED_FIXTURE_POLICY) {
  return new OpenBBFundamentalsProvider(new FixtureTransport(fixture), policy, () => now)
    .getFundamentals({
      broadstoneCompanyId: `company-${fixture.ticker.toLowerCase()}`,
      displayName: `${fixture.ticker} Company`,
      ticker: fixture.ticker
    });
}

const translated = await resultFor({
  ...profiles[0]!,
  balance: { ...profiles[0]!.balance, total_equity_non_controlling_interests: 5 }
});
assert.ok(translated.data);
const annualPeriod = translated.data.periods.find((period) => period.periodType === "annual");
const ltmPeriod = translated.data.periods.find((period) => period.periodType === "ltm");
assert.ok(annualPeriod);
assert.ok(ltmPeriod);
const annualEbitda = translated.data.financialObservations.find((item) => item.metricCode === "public_reported_ebitda");
const ltmEbitda = translated.data.financialObservations.find((item) => item.metricCode === "public_ltm_ebitda");
assert.equal(annualEbitda?.value, 60);
assert.equal(annualEbitda?.periodId, annualPeriod.id);
assert.equal(ltmEbitda?.value, 66);
assert.equal(ltmEbitda?.periodId, ltmPeriod.id);
assert.equal(annualEbitda?.provenance[0].sourceSystem, "OpenBB 4.7.0 isolated service");
assert.equal(annualEbitda?.provenance[0].underlyingSource, "Financial Modeling Prep");
assert.equal(annualEbitda?.provenance[0].sourceMetadata?.transportCommit, "dddc3b3");
assert.equal(annualEbitda?.provenance[0].sourceMetadata?.underlyingProvider, "fmp");
assert.equal(translated.data.rightsPolicy.transportProviderCode, "openbb_isolated_v4_7_0");
assert.equal(translated.data.rightsPolicy.underlyingProviderCode, "fmp");

const missing = await resultFor(profile("MISS", ["ebitda", "preferred_stock", "total_equity_non_controlling_interests"]));
assert.ok(missing.data);
assert.equal(missing.data.financialObservations.some((item) => item.metricCode === "public_reported_ebitda"), false);
assert.equal(missing.data.financialObservations.some((item) => item.metricCode === "preferred_equity"), false);
assert.ok(missing.issues.some((item) => item.metricCode === "preferred_equity"));

const defaultPolicyResult = await new OpenBBFundamentalsProvider(new FixtureTransport(profiles[0]!), undefined, () => now)
  .getFundamentals({ broadstoneCompanyId: "default-rights", displayName: "Default Rights", ticker: "SOFT" });
assert.equal(defaultPolicyResult.data?.rightsPolicy.policyId, OPENBB_FMP_PROTOTYPE_RIGHTS_POLICY.policyId);

const malformed = await new OpenBBFundamentalsProvider({
  getIncome: () => Promise.resolve({ provider: "not-fmp", results: [] }),
  getBalance: () => Promise.resolve({ provider: "fmp", results: [] })
}).getFundamentals({ broadstoneCompanyId: "bad", displayName: "Bad", ticker: "BAD" });
assert.equal(malformed.data, null);
assert.equal(malformed.issues[0]?.code, "malformed_response");

const observationsByCompany: CanonicalFinancialObservation[][] = [];
for (const fixture of profiles) {
  const response = await resultFor(fixture);
  assert.ok(response.data);
  observationsByCompany.push(response.data.financialObservations);
}
const coverage = calculateFundamentalsCoverage(observationsByCompany, [
  "revenue", "public_reported_ebitda", "public_ltm_ebitda", "operating_income", "net_income",
  "total_debt", "cash_and_cash_equivalents", "preferred_equity", "non_controlling_interest"
]);
const percent = (metricCode: string) => coverage.find((item) => item.metricCode === metricCode)?.coveragePercent;
assert.equal(percent("revenue"), 100);
assert.equal(percent("public_reported_ebitda"), 75);
assert.equal(percent("public_ltm_ebitda"), 75);
assert.equal(percent("operating_income"), 100);
assert.equal(percent("net_income"), 100);
assert.equal(percent("total_debt"), 87.5);
assert.equal(percent("cash_and_cash_equivalents"), 100);
assert.equal(percent("preferred_equity"), 25);
assert.equal(percent("non_controlling_interest"), 37.5);

function secObservation(metricCode: "revenue" | "operating_income" | "net_income" | "total_debt" | "cash_and_cash_equivalents", value: number) {
  return {
    ...translated.data!.financialObservations.find((item) => item.metricCode === metricCode)!,
    id: `sec:${metricCode}`,
    value,
    provenance: [{
      sourceType: "external_provider" as const,
      sourceSystem: "Broadstone SEC Direct",
      underlyingSource: "SEC EDGAR",
      sourceIdentifier: `sec:${metricCode}`,
      observedAt: now.toISOString()
    }] as const
  };
}
const comparison = compareCanonicalFundamentals({
  sec: [
    secObservation("revenue", 200), secObservation("operating_income", 49.75),
    secObservation("net_income", 20), secObservation("total_debt", 250)
  ],
  provider: translated.data.financialObservations.filter((item) => item.periodId === annualPeriod.id),
  metricCodes: ["revenue", "operating_income", "net_income", "total_debt", "cash_and_cash_equivalents"]
});
assert.equal(comparison.find((item) => item.metricCode === "revenue")?.classification, "same");
assert.equal(comparison.find((item) => item.metricCode === "operating_income")?.classification, "within_tolerance");
assert.equal(comparison.find((item) => item.metricCode === "total_debt")?.classification, "material_unexplained_difference");
assert.equal(comparison.find((item) => item.metricCode === "cash_and_cash_equivalents")?.classification, "missing_on_one_side");

const financialSnapshots: SnapshotObservation[] = translated.data.financialObservations.map((observation) => ({
  kind: "financial", observation, basis: observation.metricCode === "public_ltm_ebitda" ? "calculated" : "reported",
  rightsPolicy: policyReference(APPROVED_FIXTURE_POLICY)
}));
const priceAndShares: SnapshotObservation[] = [{
  kind: "market",
  basis: "market_observed",
  freshnessState: "fresh",
  rightsPolicy: policyReference(TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY),
  observation: {
    id: "comp-price", companyId: translated.data.company.id, securityId: "comp-security",
    metricCode: "share_price", value: 10,
    unit: { kind: "currency", currencyCode: "USD", scale: "ones" }, effectiveDate: "2026-08-26",
    priceConvention: "unadjusted_close",
    provenance: [{ sourceType: "external_provider", sourceSystem: "Twelve Data", underlyingSource: "Twelve Data", sourceIdentifier: "COMP", observedAt: now.toISOString() }]
  }
}, {
  kind: "market",
  basis: "reported",
  rightsPolicy: policyReference(SEC_PUBLIC_DATA_RIGHTS_POLICY),
  observation: {
    id: "comp-shares", companyId: translated.data.company.id, metricCode: "shares_outstanding", value: 100,
    unit: { kind: "shares", scale: "ones" }, effectiveDate: "2025-12-31",
    provenance: [{ sourceType: "external_provider", sourceSystem: "Broadstone SEC Direct", underlyingSource: "SEC EDGAR", sourceIdentifier: "COMP-shares", observedAt: now.toISOString() }]
  }
}];
const bundle = buildMarketObservationBundle({
  bundleId: "openbb-fundamentals-fixture",
  company: translated.data.company,
  security: { id: "comp-security", companyId: translated.data.company.id, ticker: "COMP", tradingCurrency: "USD" },
  valuationDate: "2026-08-26",
  selectedPeriods: translated.data.periods,
  observations: [...priceAndShares, ...financialSnapshots],
  issues: []
});
const policies = new Map([
  [APPROVED_FIXTURE_POLICY.policyId, APPROVED_FIXTURE_POLICY],
  [TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY.policyId, TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY],
  [SEC_PUBLIC_DATA_RIGHTS_POLICY.policyId, SEC_PUBLIC_DATA_RIGHTS_POLICY]
]);
const service = new MarketCalculationService((reference) => policies.get(reference.policyId));
const annual = service.calculate(bundle, { ebitdaBasis: "public_reported" });
assert.equal(annual.enterpriseValue.value, 1_265);
assert.equal(annual.evToRevenue.value, 6.325);
assert.equal(annual.ebitda.value, 60);
assert.equal(annual.ebitda.ebitdaBasis, "public_reported");
assert.equal(annual.ebitdaMargin.value, 0.3);
assert.equal(annual.evToEbitda.value, 1_265 / 60);
const ltm = service.calculate(bundle, { ebitdaBasis: "public_ltm" });
assert.equal(ltm.ebitda.value, 66);
assert.equal(ltm.ebitda.ebitdaBasis, "public_ltm");
assert.equal(ltm.ebitdaMargin.value, 0.3);
assert.equal(ltm.evToEbitda.value, 1_265 / 66);
assert.equal(service.calculate(bundle).ebitda.status, "unavailable");

const reviewBundle = buildMarketObservationBundle({
  ...bundle,
  bundleId: "openbb-review-required",
  observations: bundle.observations.map((item) => item.kind === "financial"
    ? { ...item, rightsPolicy: policyReference(OPENBB_FMP_PROTOTYPE_RIGHTS_POLICY) }
    : item)
});
const reviewService = new MarketCalculationService((reference) =>
  reference.policyId === OPENBB_FMP_PROTOTYPE_RIGHTS_POLICY.policyId
    ? OPENBB_FMP_PROTOTYPE_RIGHTS_POLICY
    : policies.get(reference.policyId)
);
assert.equal(reviewService.calculate(reviewBundle, { ebitdaBasis: "public_ltm" }).ebitda.status, "blocked_by_rights");

const manifest = buildCalculationSnapshotManifest({
  snapshotId: "openbb-fixture-snapshot", analysisId: "openbb-fixture-analysis", analysisVersion: "1",
  valuationDate: bundle.valuationDate, createdAt: now.toISOString(), calculationEngineVersion: "market-engine-v1",
  methodologyVersion: "market-methodologies-v1", observationBundle: bundle,
  ebitdaBasisPolicy: { policyCode: "public_ltm", policyVersion: "prototype-v1" },
  issues: [], warnings: [], overrideReferences: []
});
assert.equal(manifest.observationBundleHash, bundle.contentHash);
assert.ok(Object.isFrozen(bundle.observations));

class DirectFmpReplacementFixture implements FundamentalsProvider {
  readonly providerCode = "direct_fmp_replacement_fixture";
  private readonly response: OpenBBFundamentalsResponse;
  constructor(response: OpenBBFundamentalsResponse) { this.response = response; }
  getFundamentals(_request: OpenBBFundamentalsRequest) { return Promise.resolve(this.response); }
}
const replacement = await new DirectFmpReplacementFixture(translated).getFundamentals({
  broadstoneCompanyId: translated.data.company.id,
  displayName: translated.data.company.displayName,
  ticker: "COMP"
});
assert.deepEqual(
  replacement.data?.financialObservations.map((item) => [item.metricCode, item.value, item.periodId]),
  translated.data.financialObservations.map((item) => [item.metricCode, item.value, item.periodId])
);

console.log("isolated openbb fundamentals provider and coverage tests passed");
