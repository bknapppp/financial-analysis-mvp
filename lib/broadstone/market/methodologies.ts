import type { MarketCalculationMetricCode } from "./calculation-contracts.ts";

export type MarketMethodology = {
  id: string;
  version: "1.0.0";
  metricCode: MarketCalculationMetricCode;
};

export const MARKET_METHODOLOGIES = {
  marketCapitalization: {
    id: "market_cap.v1",
    version: "1.0.0",
    metricCode: "market_capitalization"
  },
  revenueGrowth: {
    id: "revenue_growth.v1",
    version: "1.0.0",
    metricCode: "revenue_growth"
  },
  operatingMargin: {
    id: "operating_margin.v1",
    version: "1.0.0",
    metricCode: "operating_margin"
  },
  netIncomeMargin: {
    id: "net_income_margin.v1",
    version: "1.0.0",
    metricCode: "net_income_margin"
  },
  priceToEarnings: {
    id: "pe_fiscal_year.v1",
    version: "1.0.0",
    metricCode: "price_to_earnings"
  },
  enterpriseValue: {
    id: "enterprise_value.v1",
    version: "1.0.0",
    metricCode: "enterprise_value"
  },
  evToRevenue: {
    id: "ev_revenue.v1",
    version: "1.0.0",
    metricCode: "ev_to_revenue"
  },
  ebitda: {
    id: "public_ebitda_selected_basis.v1",
    version: "1.0.0",
    metricCode: "ebitda"
  },
  ebitdaMargin: {
    id: "ebitda_margin.v1",
    version: "1.0.0",
    metricCode: "ebitda_margin"
  },
  evToEbitda: {
    id: "ev_ebitda.v1",
    version: "1.0.0",
    metricCode: "ev_to_ebitda"
  }
} as const satisfies Record<string, MarketMethodology>;
