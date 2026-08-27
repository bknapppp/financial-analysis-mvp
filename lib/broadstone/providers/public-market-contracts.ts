import type {
  CanonicalCompany,
  CanonicalCompanyExternalIdentifier,
  CanonicalFinancialObservation,
  CanonicalFinancialPeriod,
  DataProvenance
} from "../canonical/index.ts";
import type { CanonicalMarketObservation } from "../market/index.ts";

export type PublicProviderIssueCode =
  | "company_not_found"
  | "metric_unavailable"
  | "period_unavailable"
  | "provider_unavailable"
  | "malformed_response"
  | "rate_limited"
  | "authentication_failed";

export type PublicProviderIssue = {
  code: PublicProviderIssueCode;
  message: string;
  providerCode: string;
  metricCode?: string;
  retryable: boolean;
};

export type PublicProviderResponse<T> = {
  data: T | null;
  issues: PublicProviderIssue[];
};

export type PublicCompanyMatch = {
  name: string;
  externalIdentifiers: readonly CanonicalCompanyExternalIdentifier[];
  provenance: DataProvenance;
};

export type PublicCompanyDataRequest = {
  broadstoneCompanyId: string;
  cik: string;
  ticker?: string;
  maxAnnualPeriods?: number;
};

export type PublicCompanyData = {
  company: CanonicalCompany;
  periods: CanonicalFinancialPeriod[];
  financialObservations: CanonicalFinancialObservation[];
  marketObservations: CanonicalMarketObservation[];
};

export interface PublicMarketProvider {
  readonly providerCode: string;
  lookupCompany(ticker: string): Promise<PublicProviderResponse<PublicCompanyMatch>>;
  getCompanyData(
    request: PublicCompanyDataRequest
  ): Promise<PublicProviderResponse<PublicCompanyData>>;
}
