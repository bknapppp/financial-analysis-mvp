export type MarketDataClass =
  | "company_identity"
  | "company_search"
  | "sec_filing_fact"
  | "financial_statement"
  | "market_observation"
  | "other";

export type FreshnessState = "fresh" | "aging" | "stale" | "expired" | "unknown";

export type FreshnessPolicy = {
  policyCode: string;
  freshForMs: number;
  agingForMs: number;
  expiresAfterMs?: number;
};

export type FreshnessEvaluation = {
  state: FreshnessState;
  ageMs: number | null;
  policyCode: string;
};

export const SEC_FILING_FACT_FRESHNESS: FreshnessPolicy = {
  policyCode: "sec-filed-fact-v1",
  freshForMs: 365 * 24 * 60 * 60 * 1000,
  agingForMs: 5 * 365 * 24 * 60 * 60 * 1000
};

export const SEC_COMPANY_IDENTITY_FRESHNESS: FreshnessPolicy = {
  policyCode: "sec-company-identity-v1",
  freshForMs: 24 * 60 * 60 * 1000,
  agingForMs: 7 * 24 * 60 * 60 * 1000,
  expiresAfterMs: 30 * 24 * 60 * 60 * 1000
};

export function evaluateFreshness(
  observedAt: string,
  asOf: string,
  policy: FreshnessPolicy
): FreshnessEvaluation {
  const observedTime = Date.parse(observedAt);
  const asOfTime = Date.parse(asOf);
  if (!Number.isFinite(observedTime) || !Number.isFinite(asOfTime) || asOfTime < observedTime) {
    return { state: "unknown", ageMs: null, policyCode: policy.policyCode };
  }
  const ageMs = asOfTime - observedTime;
  const staleAt = policy.freshForMs + policy.agingForMs;
  const state = ageMs <= policy.freshForMs
    ? "fresh"
    : ageMs <= staleAt
      ? "aging"
      : policy.expiresAfterMs !== undefined && ageMs > policy.expiresAfterMs
        ? "expired"
        : "stale";
  return { state, ageMs, policyCode: policy.policyCode };
}

