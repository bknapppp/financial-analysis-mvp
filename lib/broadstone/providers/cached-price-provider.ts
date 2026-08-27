import {
  buildMarketCacheKey,
  type MarketCache
} from "../market/cache.ts";
import type { FreshnessPolicy } from "../market/freshness.ts";
import type { ProviderRightsPolicy } from "../market/rights.ts";
import { evaluateProviderUse } from "../market/rights.ts";
import type {
  MarketPriceData,
  MarketPriceProvider,
  MarketPriceRequest,
  MarketPriceResponse
} from "./price-contracts.ts";

export class CachedMarketPriceProvider implements MarketPriceProvider {
  readonly providerCode: string;

  constructor(
    private readonly provider: MarketPriceProvider,
    private readonly cache: MarketCache<MarketPriceData>,
    private readonly rightsPolicy: ProviderRightsPolicy,
    private readonly freshnessPolicy: FreshnessPolicy,
    private readonly now: () => Date = () => new Date()
  ) {
    this.providerCode = provider.providerCode;
  }

  async getClosingPrice(request: MarketPriceRequest): Promise<MarketPriceResponse> {
    const liveDecision = evaluateProviderUse(this.rightsPolicy, "live_analysis");
    if (liveDecision.decision !== "allowed") {
      return {
        data: null,
        issues: [{
          code: "blocked_by_rights",
          message: liveDecision.reason,
          providerCode: this.providerCode,
          retryable: false
        }],
        source: "provider"
      };
    }

    const key = buildMarketCacheKey({
      providerCode: this.providerCode,
      dataset: "daily_price",
      operation: "closing_price_on_or_before",
      companyId: request.companyId,
      securityId: request.security.id,
      metricCode: "share_price",
      valuationDate: request.valuationDate,
      currencyCode: request.security.tradingCurrency,
      observationBasis: "unadjusted_close"
    });
    const now = this.now().toISOString();
    const cached = this.cache.get(key, now);
    if (cached.entry) {
      return {
        data: { ...cached.entry.value, freshness: cached.freshness ?? "unknown" },
        issues: [],
        source: "cache"
      };
    }

    const response = await this.provider.getClosingPrice(request);
    if (!response.data) return response;
    this.cache.set(key, response.data, {
      providerPolicy: this.rightsPolicy,
      tier: "temporary",
      dataClass: "market_observation",
      intendedUse: "live_analysis",
      requestedTtlMs: 5 * 60 * 1000,
      storedAt: now,
      sourceObservedAt: `${response.data.observation.effectiveDate}T00:00:00.000Z`,
      freshnessPolicy: this.freshnessPolicy
    });
    return response;
  }
}

