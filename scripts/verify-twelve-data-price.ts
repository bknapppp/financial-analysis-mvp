import { InMemoryMarketCache } from "../lib/broadstone/market/cache.ts";
import {
  PROTOTYPE_DAILY_CLOSE_FRESHNESS,
  TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY
} from "../lib/broadstone/market/price-policy.ts";
import {
  CachedMarketPriceProvider,
  DirectTwelveDataPriceTransport,
  TwelveDataPriceProvider
} from "../lib/broadstone/providers/index.ts";

const apiKey = process.env.TWELVE_DATA_API_KEY;
if (!apiKey) {
  throw new Error("Set TWELVE_DATA_API_KEY before running live price verification.");
}

const ticker = (process.argv[2] ?? "AAPL").toUpperCase();
const valuationDate = process.argv[3];
const companyId = `manual-${ticker.toLowerCase()}`;
const security = {
  id: `${companyId}-common`,
  companyId,
  ticker,
  tradingCurrency: "USD"
};
const direct = new TwelveDataPriceProvider(
  new DirectTwelveDataPriceTransport(apiKey),
  TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY,
  PROTOTYPE_DAILY_CLOSE_FRESHNESS
);
const provider = new CachedMarketPriceProvider(
  direct,
  new InMemoryMarketCache(),
  TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY,
  PROTOTYPE_DAILY_CLOSE_FRESHNESS
);

const result = await provider.getClosingPrice({
  companyId,
  security,
  ...(valuationDate ? { valuationDate } : {})
});
console.log(JSON.stringify(result, null, 2));

