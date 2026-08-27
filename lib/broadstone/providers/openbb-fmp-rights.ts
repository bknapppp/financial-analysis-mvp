import type { ProviderRequestedUse, ProviderRightsPolicy, ProviderUseRule } from "../market/rights.ts";

const review = (reason: string): ProviderUseRule => ({ state: "review_required", reason });

const uses = Object.fromEntries(([
  "live_analysis",
  "temporary_cache",
  "persistent_retention",
  "saved_analysis",
  "internal_display",
  "external_display",
  "report",
  "export",
  "ai_context",
  "derived_calculation",
  "redistribution"
] satisfies ProviderRequestedUse[]).map((use) => [
  use,
  review(`FMP ${use} requires an applicable commercial order form and legal review.`)
])) as Record<ProviderRequestedUse, ProviderUseRule>;

export const OPENBB_FMP_PROTOTYPE_RIGHTS_POLICY: ProviderRightsPolicy = {
  policyId: "openbb-fmp-prototype-review",
  policyVersion: "2026-08-27",
  transportProviderCode: "openbb_isolated_v4_7_0",
  underlyingProviderCode: "fmp",
  effectiveFrom: "2026-08-27",
  publicAvailability: "restricted",
  uses,
  attribution: {
    required: true,
    text: "Transport: OpenBB; underlying data: Financial Modeling Prep",
    sourceName: "Financial Modeling Prep",
    sourceUrl: "https://financialmodelingprep.com"
  },
  operationalRequirements: [
    "Run OpenBB v4.7.0 as an isolated external service; do not incorporate AGPL implementation into Broadstone.",
    "Use only an FMP subscription/order form approved for Broadstone's intended uses.",
    "Keep FMP credentials in the isolated service and out of Broadstone source and snapshots."
  ],
  notes: [
    "This conservative engineering policy is not legal advice.",
    "An API key or personal plan does not establish commercial, retention, derived-use, display, export, AI, or redistribution rights."
  ]
};
