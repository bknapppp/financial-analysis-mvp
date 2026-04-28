import type {
  AddBack,
  AddBackClassificationConfidence,
  AddBackSource,
  AddBackReviewItem,
  AddBackSuggestion,
  DataReadiness,
  AddBackType,
  EbitdaBridge,
  FinancialEntry,
  PeriodSnapshot,
  ReportingPeriod
} from "./types";
import { getAdjustedEbitda } from "./underwriting/ebitda.ts";
import { normalizeReportedValue } from "./reported-sign-normalization.ts";

const KEYWORD_RULES: Array<{
  type: AddBackType;
  confidence: AddBackClassificationConfidence;
  keywords: string[];
  description: string;
}> = [
  {
    type: "owner_related",
    confidence: "high",
    keywords: ["owner", "personal", "family", "auto", "vehicle"],
    description: "Owner-related spend identified from the account name."
  },
  {
    type: "non_recurring",
    confidence: "high",
    keywords: ["one-time", "one time", "nonrecurring", "non-recurring", "lawsuit", "settlement"],
    description: "Non-recurring expense identified from the account name."
  },
  {
    type: "discretionary",
    confidence: "medium",
    keywords: ["travel", "entertainment", "meals"],
    description: "Discretionary spend identified from the account name."
  },
  {
    type: "non_operating",
    confidence: "medium",
    keywords: ["legal", "interest", "charitable", "donation"],
    description: "Potential non-operating expense identified from the account name."
  }
];

const CATEGORY_LABELS: Record<AddBackType, string> = {
  owner_related: "Owner related",
  non_recurring: "Non-recurring",
  discretionary: "Discretionary",
  non_operating: "Non-operating",
  accounting_normalization: "Accounting normalization",
  run_rate_adjustment: "Run-rate adjustment"
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function buildPersistedKey(item: {
  linkedEntryId: string | null;
  periodId: string;
  type: AddBackType;
  description: string;
}) {
  return [
    item.periodId,
    item.linkedEntryId ?? "manual",
    item.type,
    normalizeText(item.description)
  ].join("::");
}

function getEntrySeriesForAccount(entries: FinancialEntry[], accountName: string) {
  const normalized = normalizeText(accountName);

  return entries.filter(
    (entry) =>
      entry.statement_type === "income" &&
      normalizeText(entry.account_name) === normalized
  );
}

function buildKeywordSuggestion(
  entry: FinancialEntry,
  companyId: string
): AddBackSuggestion | null {
  const normalizedExpenseAmount = normalizeReportedValue({
    kind: "expense",
    value: Number(entry.amount)
  });

  if (normalizedExpenseAmount === null || normalizedExpenseAmount <= 0) {
    return null;
  }

  const accountName = normalizeText(entry.account_name);

  for (const rule of KEYWORD_RULES) {
    const matchedKeyword = rule.keywords.find((keyword) =>
      accountName.includes(keyword)
    );

    if (!matchedKeyword) {
      continue;
    }

    return {
      companyId,
      periodId: entry.period_id,
      linkedEntryId: entry.id,
      type: rule.type,
      description: entry.account_name,
      amount: normalizedExpenseAmount,
      classificationConfidence: rule.confidence,
      source: "system",
      status: "suggested",
      justification: `${rule.description} Matched keyword: "${matchedKeyword}".`,
      supportingReference: null
    };
  }

  return null;
}

function buildSpikeSuggestion(
  entry: FinancialEntry,
  companyId: string,
  entries: FinancialEntry[],
  periodsById: Map<string, ReportingPeriod>
): AddBackSuggestion | null {
  const history = getEntrySeriesForAccount(entries, entry.account_name)
    .filter((item) => item.period_id !== entry.period_id)
    .sort((left, right) => {
      const leftDate = periodsById.get(left.period_id)?.period_date ?? "";
      const rightDate = periodsById.get(right.period_id)?.period_date ?? "";
      return leftDate.localeCompare(rightDate);
    });

  if (history.length === 0) {
    return null;
  }

  const recentHistory = history.slice(-2);
  const averagePriorAmount =
    recentHistory.reduce(
      (total, item) =>
        total +
        (normalizeReportedValue({
          kind: "expense",
          value: Number(item.amount)
        }) ?? 0),
      0
    ) /
    recentHistory.length;

  if (averagePriorAmount <= 0) {
    return null;
  }

  const currentAmount = normalizeReportedValue({
    kind: "expense",
    value: Number(entry.amount)
  });

  if (currentAmount === null || currentAmount <= 0) {
    return null;
  }

  const ratio = currentAmount / averagePriorAmount;

  if (ratio < 2 || currentAmount - averagePriorAmount < 1000) {
    return null;
  }

  return {
    companyId,
    periodId: entry.period_id,
    linkedEntryId: entry.id,
    type: "run_rate_adjustment",
    description: entry.account_name,
    amount: currentAmount - averagePriorAmount,
    classificationConfidence: ratio >= 3 ? "high" : "medium",
    source: "system",
    status: "suggested",
    justification: `Expense is ${ratio.toFixed(1)}x the recent run rate for this account.`,
    supportingReference: null
  };
}

function buildLowConfidenceSuggestion(
  entry: FinancialEntry,
  companyId: string
): AddBackSuggestion | null {
  if (entry.confidence !== "low") {
    return null;
  }

  if (entry.category !== "Operating Expenses") {
    return null;
  }

  const keywordSuggestion = buildKeywordSuggestion(entry, companyId);

  if (!keywordSuggestion) {
    return null;
  }

  return {
    ...keywordSuggestion,
    classificationConfidence: "low",
    justification: `${keywordSuggestion.justification} Source mapping is low confidence.`
  };
}

export function getAcceptedAddBacksForPeriod(
  addBacks: AddBack[],
  periodId: string
) {
  return addBacks.filter(
    (item) => item.period_id === periodId && item.status === "accepted"
  );
}

export function calculateAcceptedAddBackAmount(
  addBacks: AddBack[],
  periodId: string
) {
  return getAcceptedAddBacksForPeriod(addBacks, periodId).reduce(
    (total, item) => total + Number(item.amount),
    0
  );
}

export type CanonicalAcceptedAddBackLine = {
  id: string | null;
  linkedEntryId: string | null;
  type: AddBackType;
  description: string;
  amount: number;
  source: AddBackSource;
};

export type CanonicalPeriodAdjustment = {
  periodId: string;
  source: "persisted";
  usesLegacyFallback: boolean;
  acceptedAddBackTotal: number;
  lines: CanonicalAcceptedAddBackLine[];
};

export function getCanonicalPeriodAdjustment(params: {
  periodId: string;
  addBacks: AddBack[];
  entries: FinancialEntry[];
}) {
  const { periodId, addBacks } = params;
  const periodAddBacks = addBacks.filter((item) => item.period_id === periodId);
  const acceptedAddBacks = periodAddBacks.filter(
    (item) => item.status === "accepted"
  );

  if (acceptedAddBacks.length > 0) {
    return {
      periodId,
      source: "persisted" as const,
      usesLegacyFallback: false,
      acceptedAddBackTotal: acceptedAddBacks.reduce(
        (total, item) => total + Number(item.amount),
        0
      ),
      lines: acceptedAddBacks.map((item) => ({
        id: item.id,
        linkedEntryId: item.linked_entry_id,
        type: item.type,
        description: item.description,
        amount: Number(item.amount),
        source: item.source
      }))
    };
  }

  return {
    periodId,
    source: "persisted" as const,
    usesLegacyFallback: false,
    acceptedAddBackTotal: 0,
    lines: []
  };
}

export function calculateAdjustedEbitdaForPeriod(params: {
  periodId: string;
  canonicalEbitda: number | null;
  addBacks: AddBack[];
  entries: FinancialEntry[];
}) {
  const adjustment = getCanonicalPeriodAdjustment({
    periodId: params.periodId,
    addBacks: params.addBacks,
    entries: params.entries
  });

  return {
    ...adjustment,
    canonicalEbitda: params.canonicalEbitda,
    adjustedEbitda: getAdjustedEbitda({
      canonicalEbitda: params.canonicalEbitda,
      acceptedAddbacks: adjustment.acceptedAddBackTotal
    })
  };
}

export function generateAddBackSuggestions(params: {
  companyId: string;
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  existingAddBacks: AddBack[];
}): AddBackSuggestion[] {
  const { companyId, periods, entries, existingAddBacks } = params;
  const periodsById = new Map(periods.map((period) => [period.id, period]));
  const existingKeys = new Set(
    existingAddBacks.map((item) =>
      buildPersistedKey({
        linkedEntryId: item.linked_entry_id,
        periodId: item.period_id,
        type: item.type,
        description: item.description
      })
    )
  );
  const suggestions: AddBackSuggestion[] = [];

  entries
    .filter(
      (entry) =>
        entry.statement_type === "income" &&
        entry.category === "Operating Expenses" &&
        (normalizeReportedValue({
          kind: "expense",
          value: Number(entry.amount)
        }) ?? 0) > 0
    )
    .forEach((entry) => {
      const candidates = [
        buildKeywordSuggestion(entry, companyId),
        buildSpikeSuggestion(entry, companyId, entries, periodsById),
        buildLowConfidenceSuggestion(entry, companyId)
      ].filter(Boolean) as AddBackSuggestion[];

      candidates.forEach((candidate) => {
        const key = buildPersistedKey({
          linkedEntryId: candidate.linkedEntryId,
          periodId: candidate.periodId,
          type: candidate.type,
          description: candidate.description
        });

        if (existingKeys.has(key)) {
          return;
        }

        existingKeys.add(key);
        suggestions.push(candidate);
      });
    });

  return suggestions.sort((left, right) => right.amount - left.amount);
}

export function buildAddBackReviewItems(params: {
  addBacks: AddBack[];
  suggestions: AddBackSuggestion[];
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
}): AddBackReviewItem[] {
  const { addBacks, suggestions, periods, entries } = params;
  const periodsById = new Map(periods.map((period) => [period.id, period]));
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const items: AddBackReviewItem[] = [];

  addBacks.forEach((item) => {
    const linkedEntry = item.linked_entry_id
      ? entriesById.get(item.linked_entry_id) ?? null
      : null;

    items.push({
      id: item.id,
      companyId: item.company_id,
      periodId: item.period_id,
      periodLabel: periodsById.get(item.period_id)?.label ?? "Unknown period",
      linkedEntryId: item.linked_entry_id,
      entryAccountName: linkedEntry?.account_name ?? null,
      entryCategory: linkedEntry?.category ?? null,
      entryStatementType: linkedEntry?.statement_type ?? null,
      addbackFlag: linkedEntry?.addback_flag ?? false,
      matchedBy: linkedEntry?.matched_by ?? null,
      confidence: linkedEntry?.confidence ?? null,
      mappingExplanation: linkedEntry?.mapping_explanation ?? null,
      type: item.type,
      description: item.description,
      amount: Number(item.amount),
      classificationConfidence: item.classification_confidence,
      source: item.source,
      status: item.status,
      justification: item.justification,
      supportingReference: item.supporting_reference,
      isPersisted: true,
      dependsOnLowConfidenceMapping: linkedEntry?.confidence === "low"
    });
  });

  suggestions.forEach((item, index) => {
    const linkedEntry = item.linkedEntryId
      ? entriesById.get(item.linkedEntryId) ?? null
      : null;

    items.push({
      id: null,
      companyId: item.companyId,
      periodId: item.periodId,
      periodLabel: periodsById.get(item.periodId)?.label ?? "Unknown period",
      linkedEntryId: item.linkedEntryId,
      entryAccountName: linkedEntry?.account_name ?? item.description,
      entryCategory: linkedEntry?.category ?? null,
      entryStatementType: linkedEntry?.statement_type ?? null,
      addbackFlag: linkedEntry?.addback_flag ?? false,
      matchedBy: linkedEntry?.matched_by ?? null,
      confidence: linkedEntry?.confidence ?? null,
      mappingExplanation: linkedEntry?.mapping_explanation ?? null,
      type: item.type,
      description: item.description,
      amount: item.amount,
      classificationConfidence: item.classificationConfidence,
      source: item.source,
      status: item.status,
      justification: item.justification,
      supportingReference: item.supportingReference,
      isPersisted: false,
      dependsOnLowConfidenceMapping: linkedEntry?.confidence === "low"
    });
  });

  return items.sort((left, right) => {
    if (left.status !== right.status) {
      const order = { accepted: 0, suggested: 1, rejected: 2 };
      return order[left.status] - order[right.status];
    }

    if (left.periodId !== right.periodId) {
      return left.periodId.localeCompare(right.periodId);
    }

    if (left.amount !== right.amount) {
      return right.amount - left.amount;
    }

    return `${left.description}-${left.id ?? "suggestion"}-${indexSafe(left)}`
      .localeCompare(`${right.description}-${right.id ?? "suggestion"}-${indexSafe(right)}`);
  });
}

function indexSafe(item: AddBackReviewItem) {
  return item.linkedEntryId ?? item.periodId;
}

export function buildEbitdaBridge(params: {
  snapshot: PeriodSnapshot;
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  addBacks: AddBack[];
  reviewItems: AddBackReviewItem[];
  readiness: DataReadiness;
}): EbitdaBridge | null {
  const { snapshot, periods, entries, addBacks, reviewItems, readiness } = params;

  if (!snapshot.periodId) {
    return null;
  }

  const periodLabel =
    periods.find((period) => period.id === snapshot.periodId)?.label ?? snapshot.label;
  const canonicalAdjustment = getCanonicalPeriodAdjustment({
    periodId: snapshot.periodId,
    addBacks,
    entries
  });
  const acceptedItems = reviewItems.filter(
    (item) => item.periodId === snapshot.periodId && item.status === "accepted"
  );
  const bridgeItems = acceptedItems;
  const warnings: string[] = [];

  if (bridgeItems.some((item) => item.dependsOnLowConfidenceMapping)) {
    warnings.push("Some accepted add-backs rely on low-confidence mappings.");
  }

  const groups = Object.entries(
    bridgeItems.reduce<Record<AddBackType, AddBackReviewItem[]>>((accumulator, item) => {
      if (!accumulator[item.type]) {
        accumulator[item.type] = [];
      }

      accumulator[item.type].push(item);
      return accumulator;
    }, {} as Record<AddBackType, AddBackReviewItem[]>)
  )
    .map(([type, items]) => ({
      type: type as AddBackType,
      label: CATEGORY_LABELS[type as AddBackType],
      total: items.reduce((total, item) => total + Number(item.amount), 0),
      items: items.sort((left, right) => right.amount - left.amount)
    }))
    .sort((left, right) => right.total - left.total);

  return {
    periodId: snapshot.periodId,
    periodLabel,
    canonicalEbitda: snapshot.ebitda,
    reportedEbitdaReference: snapshot.reportedEbitda ?? null,
    addBackTotal: canonicalAdjustment.acceptedAddBackTotal,
    adjustedEbitda:
      readiness.status === "blocked" || snapshot.ebitda === null
        ? null
        : calculateAdjustedEbitdaForPeriod({
            periodId: snapshot.periodId,
            canonicalEbitda: snapshot.ebitda,
            addBacks,
            entries
          }).adjustedEbitda,
    canComputeAdjustedEbitda:
      readiness.status !== "blocked" && snapshot.ebitda !== null,
    invalidReasons: readiness.blockingReasons,
    warnings: Array.from(
      new Set([...readiness.cautionReasons, ...warnings])
    ),
    groups
  };
}

export function getAddBackTypeLabel(type: AddBackType) {
  return CATEGORY_LABELS[type];
}
