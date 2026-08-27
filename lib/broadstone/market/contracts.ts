import type { DataProvenance } from "../canonical/provenance.ts";

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
