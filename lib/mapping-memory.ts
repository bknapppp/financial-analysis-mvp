import type {
  AccountMapping,
  FinancialSourceType,
  NormalizedCategory,
  StatementType
} from "./types";

export type SavedMappingScope = "company" | "shared";
export type SavedMappingSourceMatch = "exact" | "generic";

export type SavedMappingLookupResult = {
  record: AccountMapping;
  scope: SavedMappingScope;
  sourceMatch: SavedMappingSourceMatch;
};

export type PersistedMappingMemoryRecord = AccountMapping & {
  normalized_label?: string | null;
  concept?: string | null;
  confidence?: string | null;
  source?: string | null;
  usage_count?: number | null;
  use_count?: number | null;
  times_used?: number | null;
  last_used_at?: string | null;
  source_type?: FinancialSourceType | null;
  mapping_method?: string | null;
  mapping_explanation?: string | null;
  matched_rule?: string | null;
};

export type SaveConfirmedMappingResult =
  | {
      status: "inserted" | "updated" | "unchanged";
      record: PersistedMappingMemoryRecord | null;
    }
  | {
      status: "conflict";
      existingRecord: PersistedMappingMemoryRecord;
    };

export function normalizeMappingLabel(label: string): string {
  if (!label) {
    return "";
  }

  let value = label.toLowerCase().trim();

  value = value.replace(/\bsg\s*&\s*a\b/g, "sga");
  value = value.replace(/\bs\s*g\s*&\s*a\b/g, "sga");
  value = value.replace(/\bd\s*&\s*a\b/g, "depreciation amortization");
  value = value.replace(
    /\bdep(?:reciation)?\s*&\s*amort(?:ization)?\b/g,
    "depreciation amortization"
  );
  value = value.replace(/&/g, " and ");

  value = value.replace(/[^\w\s]/g, " ");
  value = value.replace(/\s+/g, " ").trim();

  return value;
}

function getMappingNormalizedLabel(
  mapping: AccountMapping | PersistedMappingMemoryRecord
) {
  return (
    ("normalized_label" in mapping ? mapping.normalized_label : null) ??
    mapping.account_name_key
  );
}

function getMappingSourceType(
  mapping: AccountMapping | PersistedMappingMemoryRecord
) {
  return ("source_type" in mapping ? mapping.source_type : null) ?? null;
}

function getMappingUsageCount(mapping: PersistedMappingMemoryRecord) {
  return (
    mapping.usage_count ??
    mapping.use_count ??
    mapping.times_used ??
    0
  );
}

function getMappingTimestamp(value: string | null | undefined) {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareSavedMappingPriority(
  left: PersistedMappingMemoryRecord,
  right: PersistedMappingMemoryRecord
) {
  const updatedAtDelta =
    getMappingTimestamp(right.updated_at) - getMappingTimestamp(left.updated_at);

  if (updatedAtDelta !== 0) {
    return updatedAtDelta;
  }

  const usageDelta = getMappingUsageCount(right) - getMappingUsageCount(left);

  if (usageDelta !== 0) {
    return usageDelta;
  }

  const createdAtDelta =
    getMappingTimestamp(right.created_at) - getMappingTimestamp(left.created_at);

  if (createdAtDelta !== 0) {
    return createdAtDelta;
  }

  return right.id.localeCompare(left.id);
}

async function fetchSavedMappingCandidates(query: {
  limit?: (value: number) => PromiseLike<{ data?: unknown; error?: unknown }>;
  maybeSingle?: () => Promise<{ data?: unknown; error?: unknown }>;
}) {
  if (typeof query.limit === "function") {
    const result = await query.limit(20);
    return Array.isArray(result.data)
      ? [...result.data].sort(compareSavedMappingPriority)
      : [];
  }

  if (typeof query.maybeSingle === "function") {
    const result = await query.maybeSingle();
    return result.data ? [result.data as PersistedMappingMemoryRecord] : [];
  }

  return [];
}

const BROAD_SHARED_MEMORY_LABELS = new Set([
  "other",
  "other income",
  "other expense",
  "other expenses",
  "other deduction",
  "other deductions",
  "misc",
  "miscellaneous"
]);

function isBroadSharedMemoryLabel(normalizedLabel: string) {
  return BROAD_SHARED_MEMORY_LABELS.has(normalizedLabel);
}

function filterSavedMappings(params: {
  mappings: AccountMapping[];
  companyId: string | null;
  normalizedLabel: string;
  statementType: StatementType | null;
  sourceType?: FinancialSourceType | null;
  scope: SavedMappingScope;
  sourceMatch: SavedMappingSourceMatch;
}) {
  if (
    params.scope === "shared" &&
    isBroadSharedMemoryLabel(params.normalizedLabel)
  ) {
    return [];
  }

  return params.mappings
    .filter((mapping) => {
      const mappingNormalizedLabel = getMappingNormalizedLabel(
        mapping as PersistedMappingMemoryRecord
      );

      const sameScope =
        params.scope === "company"
          ? mapping.company_id === params.companyId
          : mapping.company_id === null;

      const mappingSourceType = getMappingSourceType(
        mapping as PersistedMappingMemoryRecord
      );
      const sameSourceType =
        params.sourceMatch === "exact"
          ? Boolean(params.sourceType) && mappingSourceType === params.sourceType
          : mappingSourceType === null;

      if (
        !sameScope ||
        !sameSourceType ||
        mappingNormalizedLabel !== params.normalizedLabel
      ) {
        return false;
      }

      if (params.statementType) {
        return mapping.statement_type === params.statementType;
      }

      return true;
    })
    .sort((left, right) =>
      compareSavedMappingPriority(
        left as PersistedMappingMemoryRecord,
        right as PersistedMappingMemoryRecord
      )
    );
}

export function findSavedMapping(params: {
  mappings: AccountMapping[];
  companyId: string | null;
  accountName: string;
  statementType: StatementType | null;
  sourceType?: FinancialSourceType | null;
}): SavedMappingLookupResult | null {
  const normalizedLabel = normalizeMappingLabel(params.accountName);

  if (!normalizedLabel) {
    return null;
  }

  const lookupOrder: Array<{
    scope: SavedMappingScope;
    sourceMatch: SavedMappingSourceMatch;
  }> = [
    { scope: "company", sourceMatch: "exact" },
    { scope: "company", sourceMatch: "generic" },
    { scope: "shared", sourceMatch: "exact" },
    { scope: "shared", sourceMatch: "generic" }
  ];

  for (const candidate of lookupOrder) {
    const match = filterSavedMappings({
      mappings: params.mappings,
      companyId: params.companyId,
      normalizedLabel,
      statementType: params.statementType,
      sourceType: params.sourceType ?? null,
      scope: candidate.scope,
      sourceMatch: candidate.sourceMatch
    })[0];

    if (match) {
      return {
        record: match,
        scope: candidate.scope,
        sourceMatch: candidate.sourceMatch
      };
    }
  }

  return null;
}

export async function getSavedMapping(params: {
  supabase: any;
  companyId: string | null;
  accountName: string;
  statementType: StatementType;
  sourceType?: FinancialSourceType | null;
}): Promise<SavedMappingLookupResult | null> {
  const normalizedLabel = normalizeMappingLabel(params.accountName);

  if (!normalizedLabel) {
    return null;
  }

  const companyMappings = params.companyId
    ? await fetchSavedMappingCandidates(
        params.supabase
          .from("account_mappings")
          .select("*")
          .eq("company_id", params.companyId)
          .eq("normalized_label", normalizedLabel)
          .eq("statement_type", params.statementType)
      )
    : [];

  const sharedMappings = isBroadSharedMemoryLabel(normalizedLabel)
    ? []
    : await fetchSavedMappingCandidates(
        params.supabase
          .from("account_mappings")
          .select("*")
          .is("company_id", null)
          .eq("normalized_label", normalizedLabel)
          .eq("statement_type", params.statementType)
      );

  return findSavedMapping({
    mappings: [
      ...(companyMappings as AccountMapping[]),
      ...(sharedMappings as AccountMapping[])
    ],
    companyId: params.companyId,
    accountName: params.accountName,
    statementType: params.statementType,
    sourceType: params.sourceType ?? null
  });
}

export async function loadSavedMappings(params: {
  supabase: any;
  companyId: string | null;
}): Promise<AccountMapping[]> {
  const companyMappingsPromise = params.companyId
    ? params.supabase
        .from("account_mappings")
        .select("*")
        .eq("company_id", params.companyId)
        .returns()
    : Promise.resolve({ data: [], error: null });

  const sharedMappingsPromise = params.supabase
    .from("account_mappings")
    .select("*")
    .is("company_id", null)
    .returns();

  const [companyMappingsResult, sharedMappingsResult] = await Promise.all([
    companyMappingsPromise,
    sharedMappingsPromise
  ]);

  const error = companyMappingsResult.error ?? sharedMappingsResult.error;

  if (error) {
    throw error;
  }

  return [
    ...(Array.isArray(companyMappingsResult.data)
      ? companyMappingsResult.data
      : []),
    ...(Array.isArray(sharedMappingsResult.data)
      ? sharedMappingsResult.data
      : [])
  ];
}

export async function saveConfirmedMappingToMemory(params: {
  supabase: any;
  companyId: string | null;
  accountName: string;
  statementType: StatementType;
  sourceType?: FinancialSourceType | null;
  concept: string;
  category: NormalizedCategory;
  allowOverwrite?: boolean;
  source?: string;
  confidence?: "high" | "medium" | "low";
  mappingMethod?: string | null;
  mappingExplanation?: string | null;
  matchedRule?: string | null;
}): Promise<SaveConfirmedMappingResult> {
  const normalizedLabel = normalizeMappingLabel(params.accountName);

  if (!normalizedLabel) {
    throw new Error("A normalized mapping label is required to save mapping memory.");
  }

  const now = new Date().toISOString();
  const existingQuery = params.supabase
    .from("account_mappings")
    .select("*")
    .eq("normalized_label", normalizedLabel)
    .eq("statement_type", params.statementType);
  const scopedQuery = params.companyId
    ? existingQuery.eq("company_id", params.companyId)
    : existingQuery.is("company_id", null);
  const existingResult =
    params.sourceType != null
      ? await scopedQuery.eq("source_type", params.sourceType).maybeSingle()
      : await scopedQuery.is("source_type", null).maybeSingle();

  const existingRecord = (existingResult.data ?? null) as PersistedMappingMemoryRecord | null;

  if (existingRecord) {
    const sameConcept = (existingRecord.concept ?? null) === params.concept;
    const sameCategory = existingRecord.category === params.category;

    if (sameConcept && sameCategory) {
      const nextUsageCount = getMappingUsageCount(existingRecord) + 1;
      const { data, error } = await params.supabase
        .from("account_mappings")
        .update({
          account_name: params.accountName,
          account_name_key: normalizedLabel,
          normalized_label: normalizedLabel,
          source_type: params.sourceType ?? null,
          confidence: params.confidence ?? existingRecord.confidence ?? "high",
          source: params.source ?? existingRecord.source ?? "manual_override",
          usage_count: nextUsageCount,
          last_used_at: now,
          mapping_method:
            params.mappingMethod ?? existingRecord.mapping_method ?? null,
          mapping_explanation:
            params.mappingExplanation ??
            existingRecord.mapping_explanation ??
            null,
          matched_rule: params.matchedRule ?? existingRecord.matched_rule ?? null,
          updated_at: now
        })
        .eq("id", existingRecord.id)
        .select("*")
        .single();

      if (error) {
        throw error;
      }

      return {
        status: "unchanged",
        record: data as PersistedMappingMemoryRecord | null
      };
    }

    if (!params.allowOverwrite) {
      return {
        status: "conflict",
        existingRecord
      };
    }

    const { data, error } = await params.supabase
      .from("account_mappings")
      .update({
        account_name: params.accountName,
        account_name_key: normalizedLabel,
        normalized_label: normalizedLabel,
        concept: params.concept,
        category: params.category,
        statement_type: params.statementType,
        source_type: params.sourceType ?? null,
        confidence: params.confidence ?? "high",
        source: params.source ?? "manual_override",
        usage_count: getMappingUsageCount(existingRecord) + 1,
        last_used_at: now,
        mapping_method: params.mappingMethod ?? null,
        mapping_explanation: params.mappingExplanation ?? null,
        matched_rule: params.matchedRule ?? null,
        updated_at: now
      })
      .eq("id", existingRecord.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return {
      status: "updated",
      record: data as PersistedMappingMemoryRecord | null
    };
  }

  const { data, error } = await params.supabase
    .from("account_mappings")
    .insert({
      company_id: params.companyId,
      account_name: params.accountName,
      account_name_key: normalizedLabel,
      normalized_label: normalizedLabel,
      concept: params.concept,
      category: params.category,
      statement_type: params.statementType,
      source_type: params.sourceType ?? null,
      confidence: params.confidence ?? "high",
      source: params.source ?? "manual_override",
      usage_count: 1,
      last_used_at: now,
      mapping_method: params.mappingMethod ?? null,
      mapping_explanation: params.mappingExplanation ?? null,
      matched_rule: params.matchedRule ?? null
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return {
    status: "inserted",
    record: data as PersistedMappingMemoryRecord | null
  };
}
