import type { FreshnessPolicy } from "./freshness.ts";
import type { ProviderRightsPolicy, ProviderUseRule } from "./rights.ts";

const allowed = (reason: string): ProviderUseRule => ({ state: "allowed", reason });
const prohibited = (reason: string): ProviderUseRule => ({ state: "prohibited", reason });
const review = (reason: string): ProviderUseRule => ({ state: "review_required", reason });

export const TWELVE_DATA_PROTOTYPE_RIGHTS_POLICY: ProviderRightsPolicy = {
  policyId: "broadstone-twelve-data-prototype",
  policyVersion: "terms-2026-01-01-prototype-v1",
  transportProviderCode: "twelve_data_direct",
  underlyingProviderCode: "twelve_data_market_data",
  effectiveFrom: "2026-01-01",
  publicAvailability: "restricted",
  uses: {
    live_analysis: allowed("Non-production evaluation and internal development use are permitted for this prototype."),
    temporary_cache: allowed("A five-minute in-memory cache is used only for request coalescing during prototype evaluation."),
    persistent_retention: prohibited("The prototype policy does not grant permanent market-data retention."),
    saved_analysis: prohibited("Price persistence in saved analyses requires an approved business subscription and rights review."),
    internal_display: allowed("Internal prototype display is permitted for authorized development users."),
    external_display: prohibited("External display is not permitted by this prototype policy."),
    report: prohibited("Report inclusion is not permitted by this prototype policy."),
    export: prohibited("Raw price export is not permitted by this prototype policy."),
    ai_context: review("AI-context use requires explicit plan and data-rights review."),
    derived_calculation: allowed("Internal non-production derived calculations are permitted for prototype evaluation."),
    redistribution: prohibited("Redistribution is not permitted by this prototype policy.")
  },
  maximumTemporaryCacheDurationMs: 5 * 60 * 1000,
  attribution: {
    required: true,
    text: "Source: Twelve Data",
    sourceName: "Twelve Data",
    sourceUrl: "https://twelvedata.com"
  },
  operationalRequirements: [
    "Use an authorized Twelve Data API key.",
    "Respect subscription credit and rate limits.",
    "Re-evaluate rights before production, external display, or persistence."
  ],
  notes: [
    "This policy is limited to Broadstone's non-production prototype evaluation.",
    "Underlying exchange and third-party data terms may impose additional requirements."
  ]
};

export const PROTOTYPE_DAILY_CLOSE_FRESHNESS: FreshnessPolicy = {
  policyCode: "prototype-daily-close-v1",
  freshForMs: 36 * 60 * 60 * 1000,
  agingForMs: 36 * 60 * 60 * 1000,
  expiresAfterMs: 7 * 24 * 60 * 60 * 1000
};

