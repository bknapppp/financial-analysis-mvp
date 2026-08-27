import type {
  CanonicalCompany,
  CanonicalFinancialObservation,
  CanonicalFinancialPeriod,
  DataProvenance
} from "../canonical/index.ts";

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly [infer Head, ...infer Tail]
    ? readonly [DeepReadonly<Head>, ...DeepReadonly<Tail>]
    : T extends readonly (infer Item)[]
      ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

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
  securityId?: string;
  metricCode: MarketMetricCode;
  value: number;
  unit: CanonicalMarketUnit;
  effectiveDate: string;
  priceConvention?: MarketPriceConvention;
  provenance: readonly [DataProvenance, ...DataProvenance[]];
};

export type MarketPriceConvention = "unadjusted_close";

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
  transportProviderCode?: string;
  underlyingProviderCode?: string;
  effectiveDate?: string;
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
  freshnessState?: "fresh" | "aging" | "stale" | "expired" | "unknown";
};

export type SnapshotObservation = SnapshotFinancialObservation | SnapshotMarketObservation;

export type MarketObservationBundle = {
  readonly bundleId: string;
  readonly company: DeepReadonly<CanonicalCompany>;
  readonly security?: DeepReadonly<MarketSecurityIdentity>;
  readonly valuationDate: string;
  readonly selectedPeriods: readonly DeepReadonly<CanonicalFinancialPeriod>[];
  readonly observations: readonly DeepReadonly<SnapshotObservation>[];
  readonly issues: readonly DeepReadonly<MarketAvailabilityIssue>[];
  readonly contentHash: string;
};

export type MarketObservationBundleInput = {
  bundleId: string;
  company: CanonicalCompany;
  security?: MarketSecurityIdentity;
  valuationDate: string;
  selectedPeriods: readonly CanonicalFinancialPeriod[];
  observations: readonly SnapshotObservation[];
  issues: readonly MarketAvailabilityIssue[];
};

export type MarketSnapshotPolicyPlaceholder = {
  policyCode: string;
  policyVersion?: string;
};

export type MarketOverrideReference = {
  overrideId: string;
  reason?: string;
};

export type CalculationSnapshotManifest = {
  readonly snapshotId: string;
  readonly analysisId: string;
  readonly analysisVersion: string;
  readonly valuationDate: string;
  readonly createdAt: string;
  readonly calculationEngineVersion: string;
  readonly methodologyVersion: string;
  readonly observationBundleId: string;
  readonly observationBundleHash: string;
  readonly selectedPeriodIds: readonly string[];
  readonly ebitdaBasisPolicy?: DeepReadonly<MarketSnapshotPolicyPlaceholder>;
  readonly currencyPolicy?: DeepReadonly<MarketSnapshotPolicyPlaceholder>;
  readonly issues: readonly DeepReadonly<MarketAvailabilityIssue>[];
  readonly warnings: readonly string[];
  readonly overrideReferences: readonly DeepReadonly<MarketOverrideReference>[];
  readonly predecessorSnapshotId?: string;
  readonly contentHash: string;
};

export type CalculationSnapshotManifestInput = Omit<
  CalculationSnapshotManifest,
  "observationBundleId" | "observationBundleHash" | "selectedPeriodIds" | "contentHash"
> & {
  observationBundle: MarketObservationBundle;
};
