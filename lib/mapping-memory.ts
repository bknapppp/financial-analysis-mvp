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

function filterSavedMappings(params: {
  mappings: AccountMapping[];
  companyId: string | null;
  normalizedLabel: string;
  statementType: StatementType | null;
  scope: SavedMappingScope;
}) {
  return params.mappings.filter((mapping) => {
    const mappingWithNormalizedLabel = mapping as AccountMapping & {
      normalized_label?: string | null;
    };
    const mappingNormalizedLabel =
      mappingWithNormalizedLabel.normalized_label ?? mapping.account_name_key;
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
  });
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
    const companyResult = await params.supabase
      .from("account_mappings")
      .select("*")
      .eq("company_id", params.companyId)
      .eq("normalized_label", normalizedLabel)
      .eq("statement_type", params.statementType)
      .maybeSingle();

    if (companyResult.data) {
      return {
        record: companyResult.data,
        scope: "company"
      };
    }
  }

  const globalResult = await params.supabase
    .from("account_mappings")
    .select("*")
    .is("company_id", null)
    .eq("normalized_label", normalizedLabel)
    .eq("statement_type", params.statementType)
    .maybeSingle();

  if (globalResult.data) {
    return {
      record: globalResult.data,
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
        source: "user",
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
      source: "user"
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
