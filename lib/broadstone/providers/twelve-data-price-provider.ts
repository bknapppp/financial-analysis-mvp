import type { CanonicalMarketObservation } from "../market/contracts.ts";
import { evaluateFreshness, type FreshnessPolicy } from "../market/freshness.ts";
import { evaluateProviderUse, policyReference, type ProviderRightsPolicy } from "../market/rights.ts";
import type {
  MarketPriceIssue,
  MarketPriceProvider,
  MarketPriceRequest,
  MarketPriceResponse
} from "./price-contracts.ts";

export type TwelveDataTransportRequest = {
  symbol: string;
  endDate?: string;
};

export type TwelveDataTransportResponse = {
  status: number;
  body: unknown;
};

export interface TwelveDataPriceTransport {
  getDailyTimeSeries(request: TwelveDataTransportRequest): Promise<TwelveDataTransportResponse>;
}

export class DirectTwelveDataPriceTransport implements TwelveDataPriceTransport {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImplementation: typeof fetch = fetch
  ) {}

  async getDailyTimeSeries(
    request: TwelveDataTransportRequest
  ): Promise<TwelveDataTransportResponse> {
    const url = new URL("https://api.twelvedata.com/time_series");
    url.searchParams.set("apikey", this.apiKey);
    url.searchParams.set("symbol", request.symbol);
    url.searchParams.set("interval", "1day");
    url.searchParams.set("outputsize", "7");
    url.searchParams.set("order", "DESC");
    url.searchParams.set("timezone", "Exchange");
    url.searchParams.set("adjust", "none");
    if (request.endDate) url.searchParams.set("end_date", request.endDate);
    const response = await this.fetchImplementation(url);
    return { status: response.status, body: await response.json() as unknown };
  }
}

type TwelveDataValue = { datetime: string; close: string };
type TwelveDataSuccess = {
  status?: "ok";
  meta: {
    symbol: string;
    currency: string;
    exchange?: string;
    mic_code?: string;
    interval: string;
  };
  values: TwelveDataValue[];
};
type TwelveDataError = { status?: "error"; code?: number; message?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isSuccess(value: unknown): value is TwelveDataSuccess {
  if (!isRecord(value) || !isRecord(value.meta) || !Array.isArray(value.values)) return false;
  return typeof value.meta.symbol === "string"
    && typeof value.meta.currency === "string"
    && typeof value.meta.interval === "string"
    && value.values.every((item) =>
      isRecord(item) && typeof item.datetime === "string" && typeof item.close === "string"
    );
}

function errorBody(value: unknown): TwelveDataError {
  return isRecord(value) ? value as TwelveDataError : {};
}

function issue(
  code: MarketPriceIssue["code"],
  message: string,
  retryable = false
): MarketPriceIssue {
  return { code, message, providerCode: "twelve_data_direct", retryable };
}

function datePart(value: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match?.[1] ?? null;
}

export class TwelveDataPriceProvider implements MarketPriceProvider {
  readonly providerCode = "twelve_data_direct";

  constructor(
    private readonly transport: TwelveDataPriceTransport,
    private readonly rightsPolicy: ProviderRightsPolicy,
    private readonly freshnessPolicy: FreshnessPolicy,
    private readonly now: () => Date = () => new Date()
  ) {}

  async getClosingPrice(request: MarketPriceRequest): Promise<MarketPriceResponse> {
    const liveDecision = evaluateProviderUse(this.rightsPolicy, "live_analysis");
    if (liveDecision.decision !== "allowed") {
      return {
        data: null,
        issues: [issue("blocked_by_rights", liveDecision.reason)],
        source: "provider"
      };
    }
    const ticker = request.security.ticker?.trim();
    if (!ticker || request.security.companyId !== request.companyId) {
      return {
        data: null,
        issues: [issue("security_not_found", "A matching security ticker is required.")],
        source: "provider"
      };
    }

    let response: TwelveDataTransportResponse;
    try {
      response = await this.transport.getDailyTimeSeries({
        symbol: ticker,
        endDate: request.valuationDate
      });
    } catch {
      return {
        data: null,
        issues: [issue("provider_unavailable", "Twelve Data could not be reached.", true)],
        source: "provider"
      };
    }

    const providerError = errorBody(response.body);
    if (response.status === 429 || providerError.code === 429) {
      return { data: null, issues: [issue("rate_limited", "Twelve Data rate limit reached.", true)], source: "provider" };
    }
    if (response.status === 401 || response.status === 403 || providerError.code === 401) {
      return { data: null, issues: [issue("authentication_failed", "Twelve Data rejected the API credentials.")], source: "provider" };
    }
    if (response.status >= 500) {
      return { data: null, issues: [issue("provider_unavailable", "Twelve Data is unavailable.", true)], source: "provider" };
    }
    if (providerError.status === "error") {
      const notFound = providerError.code === 404 || /symbol|not found/i.test(providerError.message ?? "");
      return {
        data: null,
        issues: [issue(notFound ? "security_not_found" : "price_unavailable", providerError.message ?? "Price is unavailable.")],
        source: "provider"
      };
    }
    if (!isSuccess(response.body)) {
      return { data: null, issues: [issue("malformed_response", "Twelve Data returned an invalid daily-price response.")], source: "provider" };
    }

    const currency = response.body.meta.currency.toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)
      || (request.security.tradingCurrency && request.security.tradingCurrency !== currency)) {
      return {
        data: null,
        issues: [issue("unsupported_currency", `Price currency ${currency || "unknown"} does not match the security.`)],
        source: "provider"
      };
    }

    const candidates = response.body.values
      .map((item) => ({ date: datePart(item.datetime), value: Number(item.close) }))
      .filter((item): item is { date: string; value: number } =>
        item.date !== null && Number.isFinite(item.value) && item.value > 0
          && (!request.valuationDate || item.date <= request.valuationDate)
      )
      .sort((left, right) => right.date.localeCompare(left.date));
    const selected = candidates[0];
    if (!selected) {
      return {
        data: null,
        issues: [issue(
          request.valuationDate ? "requested_date_unavailable" : "price_unavailable",
          request.valuationDate
            ? `No completed close was available on or before ${request.valuationDate}.`
            : "No completed closing price was available."
        )],
        source: "provider"
      };
    }

    const retrievedAt = this.now().toISOString();
    const observation: CanonicalMarketObservation = {
      id: `twelve-data:${request.security.id}:unadjusted-close:${selected.date}`,
      companyId: request.companyId,
      securityId: request.security.id,
      metricCode: "share_price",
      value: selected.value,
      unit: { kind: "currency", currencyCode: currency, scale: "ones" },
      effectiveDate: selected.date,
      priceConvention: "unadjusted_close",
      provenance: [{
        sourceType: "external_provider",
        sourceSystem: "Broadstone Twelve Data Direct",
        underlyingSource: "Twelve Data market data",
        sourceIdentifier: `${response.body.meta.symbol}:${selected.date}:1day:close`,
        observedAt: retrievedAt,
        originalFieldName: "close",
        sourceMetadata: {
          ticker,
          exchange: response.body.meta.exchange ?? request.security.exchange ?? null,
          micCode: response.body.meta.mic_code ?? null,
          interval: response.body.meta.interval,
          adjustment: "none",
          requestedValuationDate: request.valuationDate ?? null
        }
      }]
    };
    const freshness = evaluateFreshness(
      `${selected.date}T00:00:00.000Z`,
      retrievedAt,
      this.freshnessPolicy
    ).state;
    return {
      data: {
        security: structuredClone(request.security),
        observation,
        convention: "unadjusted_close",
        rightsPolicy: policyReference(this.rightsPolicy),
        freshness
      },
      issues: [],
      source: "provider"
    };
  }
}
