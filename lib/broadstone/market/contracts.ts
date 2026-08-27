import type {
  CanonicalCompany,
  CanonicalFinancialObservation,
  CanonicalFinancialPeriod,
  DataProvenance
} from "../canonical/index.ts";

export type MarketMetricCode =
  | "share_price"
  | "shares_outstanding"
  | "market_capitalization";

export type CanonicalMarketUnit =
  | { kind: "currency"; currencyCode: string; scale: "ones" | "thousands" | "millions" }
  | { kind: "shares"; scale: "ones" | "thousands" | "millions" };

export type CanonicalMarketObservation = {
  id: string;
  companyId: string;
  metricCode: MarketMetricCode;
  value: number;
  unit: CanonicalMarketUnit;
  effectiveDate: string;
  provenance: readonly [DataProvenance, ...DataProvenance[]];
};

export type MarketSecurityIdentity = {
  id: string;
  companyId: string;
  ticker?: string;
  exchange?: string;
  shareClass?: string;
  tradingCurrency?: string;
  externalIdentifiers?: Readonly<Record<string, string>>;
};

export type ProviderRightsPolicyReference = {
  policyId: string;
  policyVersion?: string;
  providerCode?: string;
};

export type MarketAvailabilityStatus =
  | "available"
  | "available_with_warning"
  | "stale"
  | "incomplete"
  | "conflicting"
  | "unavailable"
  | "blocked_by_rights"
  | "invalid";

export type MarketAvailabilityIssue = {
  code: string;
  message: string;
  status: MarketAvailabilityStatus;
  observationId?: string;
};

export type SnapshotObservationBasis =
  | "reported"
  | "calculated"
  | "consensus"
  | "market_observed"
  | "unknown";

export type SnapshotFinancialObservation = {
  kind: "financial";
  observation: CanonicalFinancialObservation;
  basis: SnapshotObservationBasis;
  rightsPolicy?: ProviderRightsPolicyReference;
};

export type SnapshotMarketObservation = {
  kind: "market";
  observation: CanonicalMarketObservation;
  basis: SnapshotObservationBasis;
  rightsPolicy?: ProviderRightsPolicyReference;
};

export type SnapshotObservation = SnapshotFinancialObservation | SnapshotMarketObservation;

export type MarketObservationBundle = {
  bundleId: string;
  company: CanonicalCompany;
  security?: MarketSecurityIdentity;
  valuationDate: string;
  selectedPeriods: readonly CanonicalFinancialPeriod[];
  observations: readonly SnapshotObservation[];
  issues: readonly MarketAvailabilityIssue[];
  contentHash: string;
};

export type MarketObservationBundleInput = Omit<MarketObservationBundle, "contentHash">;

export type MarketSnapshotPolicyPlaceholder = {
  policyCode: string;
  policyVersion?: string;
};

export type MarketOverrideReference = {
  overrideId: string;
  reason?: string;
};

export type CalculationSnapshotManifest = {
  snapshotId: string;
  analysisId: string;
  analysisVersion: string;
  valuationDate: string;
  createdAt: string;
  calculationEngineVersion: string;
  methodologyVersion: string;
  observationBundleId: string;
  observationBundleHash: string;
  selectedPeriodIds: readonly string[];
  ebitdaBasisPolicy?: MarketSnapshotPolicyPlaceholder;
  currencyPolicy?: MarketSnapshotPolicyPlaceholder;
  issues: readonly MarketAvailabilityIssue[];
  warnings: readonly string[];
  overrideReferences: readonly MarketOverrideReference[];
  predecessorSnapshotId?: string;
  contentHash: string;
};

export type CalculationSnapshotManifestInput = Omit<
  CalculationSnapshotManifest,
  "observationBundleId" | "observationBundleHash" | "selectedPeriodIds" | "contentHash"
> & {
  observationBundle: MarketObservationBundle;
};
