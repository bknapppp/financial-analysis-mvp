import type { CanonicalMetricCode } from "../calculations/contracts.ts";
import type { DataProvenance } from "./provenance.ts";

export type CanonicalCompanyType = "private" | "public" | "other";

export type CanonicalCompanyExternalIdentifier = {
  scheme: "ticker" | "cik" | "provider";
  value: string;
  provider?: string;
};

export type CanonicalCompany = {
  id: string;
  displayName: string;
  legalName?: string;
  companyType?: CanonicalCompanyType;
  externalIdentifiers?: readonly CanonicalCompanyExternalIdentifier[];
};

export type CanonicalPeriodType =
  | "monthly"
  | "quarterly"
  | "annual"
  | "ltm"
  | "unknown";

export type CanonicalFinancialPeriod = {
  id: string;
  companyId: string;
  label: string;
  periodType: CanonicalPeriodType;
  startDate: string | null;
  endDate: string;
  fiscalYear: number | null;
  fiscalQuarter: 1 | 2 | 3 | 4 | null;
};

export type CurrencyCode = string;

export type MonetaryScale = "ones" | "thousands" | "millions";

export type CanonicalMonetaryUnit = {
  kind: "currency";
  currencyCode: CurrencyCode;
  scale: MonetaryScale;
};

export type CanonicalObservationConfidence = "high" | "medium" | "low" | "unknown";

export type CanonicalFinancialObservation = {
  id: string;
  companyId: string;
  periodId: string;
  metricCode: CanonicalMetricCode;
  value: number;
  unit: CanonicalMonetaryUnit;
  provenance: readonly [DataProvenance, ...DataProvenance[]];
  confidence?: CanonicalObservationConfidence;
};
