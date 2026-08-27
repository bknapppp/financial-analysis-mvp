import type {
  CanonicalMarketObservation,
  MarketPriceConvention,
  MarketSecurityIdentity,
  ProviderRightsPolicyReference
} from "../market/contracts.ts";
import type { FreshnessState } from "../market/freshness.ts";

export type MarketPriceIssueCode =
  | "security_not_found"
  | "price_unavailable"
  | "requested_date_unavailable"
  | "provider_unavailable"
  | "rate_limited"
  | "authentication_failed"
  | "malformed_response"
  | "unsupported_currency"
  | "blocked_by_rights";

export type MarketPriceIssue = {
  code: MarketPriceIssueCode;
  message: string;
  providerCode: string;
  retryable: boolean;
};

export type MarketPriceRequest = {
  companyId: string;
  security: MarketSecurityIdentity;
  valuationDate?: string;
};

export type MarketPriceData = {
  security: MarketSecurityIdentity;
  observation: CanonicalMarketObservation;
  convention: MarketPriceConvention;
  rightsPolicy: ProviderRightsPolicyReference;
  freshness: FreshnessState;
};

export type MarketPriceResponse = {
  data: MarketPriceData | null;
  issues: MarketPriceIssue[];
  source: "provider" | "cache";
};

export interface MarketPriceProvider {
  readonly providerCode: string;
  getClosingPrice(request: MarketPriceRequest): Promise<MarketPriceResponse>;
}
