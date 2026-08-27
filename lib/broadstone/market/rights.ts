import type {
  MarketAvailabilityIssue,
  MarketObservationBundle,
  ProviderRightsPolicyReference
} from "./contracts.ts";

export type ProviderRightState = "allowed" | "prohibited" | "review_required";

export type ProviderRequestedUse =
  | "live_analysis"
  | "temporary_cache"
  | "persistent_retention"
  | "saved_analysis"
  | "internal_display"
  | "external_display"
  | "report"
  | "export"
  | "ai_context"
  | "derived_calculation"
  | "redistribution";

export type ProviderUseRule = {
  state: ProviderRightState;
  reason: string;
};

export type ProviderAttributionRequirement = {
  required: boolean;
  text?: string;
  sourceName?: string;
  sourceUrl?: string;
};

export type ProviderRightsPolicy = {
  policyId: string;
  policyVersion: string;
  transportProviderCode: string;
  underlyingProviderCode: string;
  effectiveFrom?: string;
  expiresAt?: string;
  publicAvailability?: "public" | "restricted" | "unknown";
  uses: Readonly<Record<ProviderRequestedUse, ProviderUseRule>>;
  maximumTemporaryCacheDurationMs?: number;
  attribution: ProviderAttributionRequirement;
  operationalRequirements?: readonly string[];
  notes?: readonly string[];
};

export type ProviderUseDecision = {
  decision: "allowed" | "denied" | "requires_review";
  requestedUse: ProviderRequestedUse;
  reason: string;
  policyReference: ProviderRightsPolicyReference;
  restriction: ProviderRightState;
  attribution?: ProviderAttributionRequirement;
};

export type ProviderPolicyResolver = (
  reference: ProviderRightsPolicyReference
) => ProviderRightsPolicy | undefined;

export type BundleUseDecision = {
  decision: "allowed" | "denied" | "requires_review";
  requestedUse: ProviderRequestedUse;
  providerDecisions: readonly ProviderUseDecision[];
  issues: readonly MarketAvailabilityIssue[];
};

export function policyReference(policy: ProviderRightsPolicy): ProviderRightsPolicyReference {
  return {
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    providerCode: policy.transportProviderCode,
    transportProviderCode: policy.transportProviderCode,
    underlyingProviderCode: policy.underlyingProviderCode,
    effectiveDate: policy.effectiveFrom
  };
}

export function evaluateProviderUse(
  policy: ProviderRightsPolicy,
  requestedUse: ProviderRequestedUse
): ProviderUseDecision {
  const rule = policy.uses[requestedUse];
  const decision = rule.state === "allowed"
    ? "allowed"
    : rule.state === "prohibited"
      ? "denied"
      : "requires_review";
  return {
    decision,
    requestedUse,
    reason: rule.reason,
    policyReference: policyReference(policy),
    restriction: rule.state,
    ...(policy.attribution.required ? { attribution: policy.attribution } : {})
  };
}

function unresolvedPolicyDecision(
  reference: ProviderRightsPolicyReference,
  requestedUse: ProviderRequestedUse
): ProviderUseDecision {
  return {
    decision: "requires_review",
    requestedUse,
    reason: `Rights policy ${reference.policyId}@${reference.policyVersion ?? "unknown"} is unavailable.`,
    policyReference: reference,
    restriction: "review_required"
  };
}

export function evaluateObservationBundleUse(
  bundle: MarketObservationBundle,
  requestedUse: ProviderRequestedUse,
  resolvePolicy: ProviderPolicyResolver
): BundleUseDecision {
  const references = new Map<string, ProviderRightsPolicyReference>();
  let hasUnreferencedObservation = false;
  for (const item of bundle.observations) {
    if (!item.rightsPolicy) {
      hasUnreferencedObservation = true;
      continue;
    }
    const key = `${item.rightsPolicy.policyId}:${item.rightsPolicy.policyVersion ?? "unknown"}`;
    references.set(key, item.rightsPolicy);
  }

  const providerDecisions = [...references.values()].map((reference) => {
    const policy = resolvePolicy(reference);
    return policy
      ? evaluateProviderUse(policy, requestedUse)
      : unresolvedPolicyDecision(reference, requestedUse);
  });
  if (hasUnreferencedObservation) {
    providerDecisions.push(unresolvedPolicyDecision({ policyId: "unreferenced" }, requestedUse));
  }

  const decision = providerDecisions.some((item) => item.decision === "denied")
    ? "denied"
    : providerDecisions.some((item) => item.decision === "requires_review")
      ? "requires_review"
      : "allowed";
  const issues = providerDecisions
    .filter((item) => item.decision !== "allowed")
    .map((item): MarketAvailabilityIssue => ({
      code: item.decision === "denied" ? "provider_rights_denied" : "provider_rights_review_required",
      message: item.reason,
      status: item.decision === "denied" ? "blocked_by_rights" : "available_with_warning"
    }));
  return { decision, requestedUse, providerDecisions, issues };
}

const allowed = (reason: string): ProviderUseRule => ({ state: "allowed", reason });
const review = (reason: string): ProviderUseRule => ({ state: "review_required", reason });

export const SEC_PUBLIC_DATA_RIGHTS_POLICY: ProviderRightsPolicy = {
  policyId: "broadstone-sec-public-data",
  policyVersion: "2026-08-26",
  transportProviderCode: "broadstone_sec_direct",
  underlyingProviderCode: "sec_edgar",
  effectiveFrom: "2026-08-26",
  publicAvailability: "public",
  uses: {
    live_analysis: allowed("SEC filing data is publicly accessible for analysis."),
    temporary_cache: allowed("Temporary caching supports responsible SEC access and repeatable analysis."),
    persistent_retention: allowed("Broadstone may retain the public filing facts used in an analysis with source lineage."),
    saved_analysis: allowed("Saved analyses may retain the selected public filing facts and provenance."),
    internal_display: allowed("Public filing facts may be shown internally with source preservation."),
    external_display: review("External presentation requirements depend on the specific content and context."),
    report: review("Report inclusion requires context-specific attribution and content review."),
    export: review("Export treatment requires review rather than an assumed blanket permission."),
    ai_context: review("AI use is not inferred solely from public availability and requires review."),
    derived_calculation: allowed("Broadstone may calculate internal analytical results from public filing facts."),
    redistribution: review("Broadstone does not infer unrestricted redistribution rights from SEC availability.")
  },
  maximumTemporaryCacheDurationMs: 7 * 24 * 60 * 60 * 1000,
  attribution: {
    required: true,
    text: "Source: SEC EDGAR",
    sourceName: "U.S. Securities and Exchange Commission EDGAR",
    sourceUrl: "https://www.sec.gov/edgar"
  },
  operationalRequirements: [
    "Use an identifying User-Agent.",
    "Respect SEC fair-access guidance and rate limits.",
    "Preserve filing accession and source provenance."
  ],
  notes: [
    "This policy records Broadstone's operational assumptions; it is not a general legal conclusion.",
    "Uses without a supported conclusion remain review_required."
  ]
};

