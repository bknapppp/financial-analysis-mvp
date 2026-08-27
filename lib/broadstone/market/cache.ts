import { deterministicContentHash } from "./hashing.ts";
import type { FreshnessPolicy, FreshnessState, MarketDataClass } from "./freshness.ts";
import { evaluateFreshness } from "./freshness.ts";
import type {
  ProviderRequestedUse,
  ProviderRightsPolicy,
  ProviderUseDecision
} from "./rights.ts";
import { evaluateProviderUse, policyReference } from "./rights.ts";
import type { ProviderRightsPolicyReference } from "./contracts.ts";

export type CacheTier = "ephemeral" | "temporary" | "persistent";

export type MarketCacheKeyInput = {
  providerCode: string;
  dataset: string;
  operation: string;
  companyId?: string;
  securityId?: string;
  metricCode?: string;
  periodId?: string;
  effectiveDate?: string;
  valuationDate?: string;
  currencyCode?: string;
  observationBasis?: string;
};

export type MarketCachePolicy = {
  tier: CacheTier;
  eligible: boolean;
  ttlMs: number | null;
  rightsDecision: ProviderUseDecision;
  intendedUseDecision?: ProviderUseDecision;
  reason: string;
};

export type DeriveCachePolicyInput = {
  providerPolicy: ProviderRightsPolicy;
  tier: CacheTier;
  dataClass: MarketDataClass;
  intendedUse: ProviderRequestedUse;
  requestedTtlMs?: number;
};

export type MarketCacheEntry<T> = {
  key: string;
  value: T;
  storedAt: string;
  expiresAt: string | null;
  sourceObservedAt: string;
  dataClass: MarketDataClass;
  freshnessPolicy: FreshnessPolicy;
  rightsPolicy: ProviderRightsPolicyReference;
  cachePolicy: MarketCachePolicy;
};

export type MarketCacheRead<T> = {
  entry: MarketCacheEntry<T> | null;
  freshness: FreshnessState | null;
};

export type MarketCacheWriteResult<T> = {
  stored: boolean;
  entry: MarketCacheEntry<T> | null;
  policy: MarketCachePolicy;
};

export type MarketCacheSetOptions = DeriveCachePolicyInput & {
  storedAt: string;
  sourceObservedAt: string;
  freshnessPolicy: FreshnessPolicy;
};

export interface MarketCache<T> {
  get(key: string, asOf: string): MarketCacheRead<T>;
  set(key: string, value: T, options: MarketCacheSetOptions): MarketCacheWriteResult<T>;
  delete(key: string): boolean;
  isFresh(key: string, asOf: string): boolean;
  clearExpired(asOf: string): number;
}

export function buildMarketCacheKey(input: MarketCacheKeyInput): string {
  return `market-cache:${deterministicContentHash(input).slice("sha256:".length)}`;
}

export function deriveMarketCachePolicy(input: DeriveCachePolicyInput): MarketCachePolicy {
  const rightsUse: ProviderRequestedUse = input.tier === "temporary"
    ? "temporary_cache"
    : input.tier === "persistent"
      ? "persistent_retention"
      : "live_analysis";
  const rightsDecision = evaluateProviderUse(input.providerPolicy, rightsUse);
  const intendedUseDecision = input.intendedUse === rightsUse
    ? undefined
    : evaluateProviderUse(input.providerPolicy, input.intendedUse);
  const eligible = rightsDecision.decision === "allowed"
    && (intendedUseDecision === undefined || intendedUseDecision.decision === "allowed");

  if (input.tier === "ephemeral") {
    return {
      tier: "ephemeral",
      eligible,
      ttlMs: 0,
      rightsDecision,
      intendedUseDecision,
      reason: eligible ? "Use is allowed but no reusable cache entry is retained." : "Rights do not permit the requested use."
    };
  }

  const requestedTtlMs = input.requestedTtlMs ?? input.providerPolicy.maximumTemporaryCacheDurationMs;
  const ttlMs = input.tier === "persistent"
    ? null
    : requestedTtlMs === undefined
      ? null
      : Math.min(requestedTtlMs, input.providerPolicy.maximumTemporaryCacheDurationMs ?? requestedTtlMs);
  const durationKnown = input.tier === "persistent" || ttlMs !== null;
  return {
    tier: input.tier,
    eligible: eligible && durationKnown,
    ttlMs,
    rightsDecision,
    intendedUseDecision,
    reason: !eligible
      ? "Provider rights do not permit the requested cache or intended use."
      : !durationKnown
        ? `No temporary retention duration is defined for ${input.dataClass}.`
        : "Provider rights and cache duration permit retention."
  };
}

export class InMemoryMarketCache<T> implements MarketCache<T> {
  readonly #entries = new Map<string, MarketCacheEntry<T>>();

  get(key: string, asOf: string): MarketCacheRead<T> {
    const entry = this.#entries.get(key);
    if (!entry) return { entry: null, freshness: null };
    if (entry.expiresAt !== null && Date.parse(asOf) > Date.parse(entry.expiresAt)) {
      this.#entries.delete(key);
      return { entry: null, freshness: "expired" };
    }
    return {
      entry,
      freshness: evaluateFreshness(entry.sourceObservedAt, asOf, entry.freshnessPolicy).state
    };
  }

  set(key: string, value: T, options: MarketCacheSetOptions): MarketCacheWriteResult<T> {
    const cachePolicy = deriveMarketCachePolicy(options);
    if (!cachePolicy.eligible || cachePolicy.tier === "ephemeral") {
      return { stored: false, entry: null, policy: cachePolicy };
    }
    const expiresAt = cachePolicy.ttlMs === null
      ? null
      : new Date(Date.parse(options.storedAt) + cachePolicy.ttlMs).toISOString();
    const entry: MarketCacheEntry<T> = Object.freeze({
      key,
      value: structuredClone(value),
      storedAt: options.storedAt,
      expiresAt,
      sourceObservedAt: options.sourceObservedAt,
      dataClass: options.dataClass,
      freshnessPolicy: structuredClone(options.freshnessPolicy),
      rightsPolicy: policyReference(options.providerPolicy),
      cachePolicy
    });
    this.#entries.set(key, entry);
    return { stored: true, entry, policy: cachePolicy };
  }

  delete(key: string): boolean {
    return this.#entries.delete(key);
  }

  isFresh(key: string, asOf: string): boolean {
    return this.get(key, asOf).freshness === "fresh";
  }

  clearExpired(asOf: string): number {
    let deleted = 0;
    for (const [key, entry] of this.#entries) {
      if (entry.expiresAt !== null && Date.parse(asOf) > Date.parse(entry.expiresAt)) {
        this.#entries.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }
}

