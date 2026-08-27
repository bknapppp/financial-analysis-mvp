import type {
  CanonicalCompany,
  CanonicalFinancialObservation,
  CanonicalFinancialPeriod
} from "../canonical/index.ts";
import type { ProviderRightsPolicyReference } from "../market/index.ts";
import type { PublicProviderIssue } from "./public-market-contracts.ts";

export type OpenBBFundamentalsPeriod = "annual" | "ttm";

export type OpenBBFundamentalsTransportRequest = {
  symbol: string;
  provider: "fmp";
  period: OpenBBFundamentalsPeriod;
  limit: number;
};

export interface OpenBBFundamentalsTransport {
  getIncome(request: OpenBBFundamentalsTransportRequest): Promise<unknown>;
  getBalance(request: Omit<OpenBBFundamentalsTransportRequest, "period"> & { period: "annual" }): Promise<unknown>;
}

export type OpenBBFundamentalsRequest = {
  broadstoneCompanyId: string;
  displayName: string;
  ticker: string;
  maxAnnualPeriods?: number;
};

export type OpenBBFundamentalsData = {
  company: CanonicalCompany;
  periods: CanonicalFinancialPeriod[];
  financialObservations: CanonicalFinancialObservation[];
  rightsPolicy: ProviderRightsPolicyReference;
};

export type OpenBBFundamentalsResponse = {
  data: OpenBBFundamentalsData | null;
  issues: PublicProviderIssue[];
};

export interface FundamentalsProvider {
  readonly providerCode: string;
  getFundamentals(request: OpenBBFundamentalsRequest): Promise<OpenBBFundamentalsResponse>;
}
