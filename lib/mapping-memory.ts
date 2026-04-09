import type { AccountMapping, NormalizedCategory, StatementType } from "./types";

export type SavedMappingScope = "company" | "global";

export type SavedMappingLookupResult = {
  record: AccountMapping;
  scope: SavedMappingScope;
};

export type PersistedMappingMemoryRecord = AccountMapping & {
  normalized_label?: string | null;
  concept?: string | null;
  confidence?: string | null;
  source?: string | null;
  usage_count?: number | null;
  use_count?: number | null;
  times_used?: number | null;
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

function filterSavedMappings(params: {
  mappings: AccountMapping[];
  companyId: string | null;
  normalizedLabel: string;
  statementType: StatementType | null;
  scope: SavedMappingScope;
}) {
  return params.mappings
    .filter((mapping) => {
      const mappingNormalizedLabel = getMappingNormalizedLabel(
        mapping as PersistedMappingMemoryRecord
      );
    const sameScope =
      params.scope === "company"
        ? mapping.company_id === params.companyId
        : mapping.company_id === null;

      if (!sameScope || mappingNormalizedLabel !== params.normalizedLabel) {
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
}): SavedMappingLookupResult | null {
  const normalizedLabel = normalizeMappingLabel(params.accountName);

  if (!normalizedLabel) {
    return null;
  }

  const companyMatch = filterSavedMappings({
    mappings: params.mappings,
    companyId: params.companyId,
    normalizedLabel,
    statementType: params.statementType,
    scope: "company"
  })[0];

  if (companyMatch) {
    return {
      record: companyMatch,
      scope: "company"
    };
  }

  const globalMatch = filterSavedMappings({
    mappings: params.mappings,
    companyId: params.companyId,
    normalizedLabel,
    statementType: params.statementType,
    scope: "global"
  })[0];

  if (globalMatch) {
    return {
      record: globalMatch,
      scope: "global"
    };
  }

  return null;
}

export async function getSavedMapping(params: {
  supabase: any;
  companyId: string | null;
  accountName: string;
  statementType: StatementType;
}): Promise<SavedMappingLookupResult | null> {
  const normalizedLabel = normalizeMappingLabel(params.accountName);

  if (!normalizedLabel) {
    return null;
  }

  if (params.companyId) {
    const companyMatches = await fetchSavedMappingCandidates(
      params.supabase
      .from("account_mappings")
      .select("*")
      .eq("company_id", params.companyId)
      .eq("normalized_label", normalizedLabel)
      .eq("statement_type", params.statementType)
    );

    if (companyMatches[0]) {
      return {
        record: companyMatches[0],
        scope: "company"
      };
    }
  }

  const globalMatches = await fetchSavedMappingCandidates(
    params.supabase
    .from("account_mappings")
    .select("*")
    .is("company_id", null)
    .eq("normalized_label", normalizedLabel)
    .eq("statement_type", params.statementType)
  );

  if (globalMatches[0]) {
    return {
      record: globalMatches[0],
      scope: "global"
    };
  }

  return null;
}

export async function saveConfirmedMappingToMemory(params: {
  supabase: any;
  companyId: string | null;
  accountName: string;
  statementType: StatementType;
  concept: string;
  category: NormalizedCategory;
  allowOverwrite?: boolean;
  source?: string;
}): Promise<SaveConfirmedMappingResult> {
  const normalizedLabel = normalizeMappingLabel(params.accountName);

  if (!normalizedLabel) {
    throw new Error("A normalized mapping label is required to save mapping memory.");
  }

  const existingQuery = params.supabase
    .from("account_mappings")
    .select("*")
    .eq("normalized_label", normalizedLabel)
    .eq("statement_type", params.statementType);
  const existingResult = params.companyId
    ? await existingQuery.eq("company_id", params.companyId).maybeSingle()
    : await existingQuery.is("company_id", null).maybeSingle();

  const existingRecord = (existingResult.data ?? null) as PersistedMappingMemoryRecord | null;

  if (existingRecord) {
    const sameConcept = (existingRecord.concept ?? null) === params.concept;
    const sameCategory = existingRecord.category === params.category;

    if (sameConcept && sameCategory) {
      return {
        status: "unchanged",
        record: existingRecord
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
        confidence: "high",
        source: params.source ?? "manual_override",
        updated_at: new Date().toISOString()
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
      confidence: "high",
      source: params.source ?? "manual_override"
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
