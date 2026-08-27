import type {
  CalculationResult,
  MarketCalculationReference
} from "../calculations/contracts.ts";
import type { ProviderRightsPolicyReference } from "./contracts.ts";

export type MarketCalculationMetricCode =
  | "market_capitalization"
  | "revenue_growth"
  | "operating_margin"
  | "net_income_margin"
  | "price_to_earnings"
  | "enterprise_value"
  | "ev_to_revenue"
  | "ebitda"
  | "ebitda_margin"
  | "ev_to_ebitda";

export type MarketCalculationStatus =
  | "available"
  | "available_with_warning"
  | "stale"
  | "incomplete"
  | "unavailable"
  | "blocked_by_rights"
  | "invalid";

export type MarketCalculationUnit =
  | { kind: "currency"; currencyCode: string; scale: "ones" }
  | { kind: "ratio"; format: "decimal" | "multiple" };

export type PublicEbitdaBasis =
  | "public_reported"
  | "public_calculated"
  | "public_ltm"
  | "public_consensus"
  | "unavailable";

export type MarketCalculationResult<
  TCode extends MarketCalculationMetricCode = MarketCalculationMetricCode
> = Omit<CalculationResult<TCode>, "reference"> & {
  reference: MarketCalculationReference;
  status: MarketCalculationStatus;
  unit: MarketCalculationUnit | null;
  valuationDate: string;
  financialPeriodIds: readonly string[];
  warnings: readonly string[];
  blockers: readonly string[];
  rightsPolicies: readonly ProviderRightsPolicyReference[];
};

export type PublicCompanyMarketCalculations = {
  companyId: string;
  securityId: string | null;
  valuationDate: string;
  observationBundleHash: string;
  marketCapitalization: MarketCalculationResult<"market_capitalization">;
  revenueGrowth: MarketCalculationResult<"revenue_growth">;
  operatingMargin: MarketCalculationResult<"operating_margin">;
  netIncomeMargin: MarketCalculationResult<"net_income_margin">;
  priceToEarnings: MarketCalculationResult<"price_to_earnings">;
  enterpriseValue: MarketCalculationResult<"enterprise_value">;
  evToRevenue: MarketCalculationResult<"ev_to_revenue">;
  ebitda: MarketCalculationResult<"ebitda"> & { ebitdaBasis: PublicEbitdaBasis };
  ebitdaMargin: MarketCalculationResult<"ebitda_margin"> & { ebitdaBasis: PublicEbitdaBasis };
  evToEbitda: MarketCalculationResult<"ev_to_ebitda"> & { ebitdaBasis: PublicEbitdaBasis };
};

