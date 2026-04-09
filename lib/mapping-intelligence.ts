import {
  normalizeAccountName,
  resolveMappingSelection,
  suggestAccountMapping
} from "@/lib/auto-mapping";
import type {
  AccountMapping,
  AuditConfidence,
  AuditMetric,
  AuditMetricKey,
  FinancialEntry,
  KpiTraceabilityBadge,
  MappingConsistencyIssue,
  NormalizedCategory,
  ReportingPeriod,
  StatementType,
  TraceableEntry
} from "@/lib/types";

type MappingMeta = {
  matchedBy: "memory" | "saved_mapping" | "keyword" | "manual" | "csv_value";
  confidence: AuditConfidence;
  explanation: string;
};

type PreviewMappingInput = {
  companyId?: string | null;
  accountName: string;
  category: NormalizedCategory | null;
  statementType: StatementType | null;
  savedMappings: AccountMapping[];
  manualCategory?: NormalizedCategory | null;
  manualStatementType?: StatementType | null;
  csvCategory?: NormalizedCategory | null;
  csvStatementType?: StatementType | null;
};

function toAuditMatchedBy(
  value: string | null | undefined
): MappingMeta["matchedBy"] | null {
  if (value === "saved_mapping") return "saved_mapping";
  if (value === "memory") return "memory";
  if (value === "keyword" || value === "keyword_rule") return "keyword";
  if (value === "manual") return "manual";
  if (value === "csv_value" || value === "csv") return "csv_value";
  return null;
}

function toAuditConfidence(
  value: string | null | undefined
): AuditConfidence | null {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return null;
}

export function getEntryMappingMeta(
  entry: Pick<
    FinancialEntry,
    | "account_name"
    | "category"
    | "statement_type"
    | "matched_by"
    | "confidence"
    | "mapping_explanation"
  >,
  savedMappings: AccountMapping[]
): MappingMeta {
  const storedMatchedBy = toAuditMatchedBy(entry.matched_by);
  const storedConfidence = toAuditConfidence(entry.confidence);

  if (storedMatchedBy && storedConfidence) {
    return {
      matchedBy: storedMatchedBy,
      confidence: storedConfidence,
      explanation:
        entry.mapping_explanation?.trim() ||
        (storedMatchedBy === "memory"
          ? "Previously confirmed mapping."
          : storedMatchedBy === "saved_mapping"
          ? "Using saved mapping for this company."
          : storedMatchedBy === "keyword"
            ? "Matched via keyword rule."
            : storedMatchedBy === "csv_value"
              ? "Using category or statement type provided in the CSV."
              : "Mapped manually in the app.")
    };
  }

  const savedSuggestion = suggestAccountMapping(entry.account_name, savedMappings);

  if (
    savedSuggestion.matchedBy === "memory" &&
    savedSuggestion.category === entry.category &&
    savedSuggestion.statementType === entry.statement_type
  ) {
    return {
      matchedBy: "memory",
      confidence: "high",
      explanation: savedSuggestion.explanation
    };
  }

  const keywordSuggestion = suggestAccountMapping(entry.account_name, []);

  if (
    keywordSuggestion.matchedBy === "keyword_rule" &&
    keywordSuggestion.category === entry.category &&
    keywordSuggestion.statementType === entry.statement_type
  ) {
    return {
      matchedBy: "keyword",
      confidence: "medium",
      explanation: keywordSuggestion.explanation
    };
  }

  return {
    matchedBy: "manual",
    confidence: "low",
    explanation: "Mapped manually or overridden from the suggested classification."
  };
}

export function getPreviewMappingMeta({
  companyId = null,
  accountName,
  category,
  statementType,
  savedMappings,
  manualCategory = null,
  manualStatementType = null,
  csvCategory = null,
  csvStatementType = null
}: PreviewMappingInput): MappingMeta {
  if (!accountName || !category || !statementType) {
    return {
      matchedBy: "manual",
      confidence: "low",
      explanation: "Review is required before this row can be imported."
    };
  }

  const suggestion = resolveMappingSelection({
    accountName,
    companyId,
    savedMappings,
    preferredStatementType: statementType,
    manualCategory,
    manualStatementType,
    csvCategory,
    csvStatementType
  });

  if (
    (suggestion.matchedBy === "memory" ||
      suggestion.matchedBy === "manual" ||
      suggestion.matchedBy === "csv_value") &&
    suggestion.category === category &&
    suggestion.statementType === statementType
  ) {
    return {
      matchedBy: "memory",
      confidence: "high",
      explanation: suggestion.explanation
    };
  }

  if (
    suggestion.matchedBy === "keyword_rule" &&
    suggestion.category === category &&
    suggestion.statementType === statementType
  ) {
    return {
      matchedBy: "keyword",
      confidence: "medium",
      explanation: suggestion.explanation
    };
  }

  return {
    matchedBy: "manual",
    confidence: "medium",
    explanation: "Review-selected mapping does not match a saved mapping or keyword rule."
  };
}

function getBadge(rows: TraceableEntry[]): KpiTraceabilityBadge | null {
  if (rows.length === 0) {
    return {
      label: "Unmapped data",
      tone: "rose"
    };
  }

  const lowConfidenceCount = rows.filter((row) => row.confidence === "low").length;
  const partialCount = rows.filter(
    (row) => row.matchedBy === "manual" || row.matchedBy === "csv_value"
  ).length;

  if (lowConfidenceCount > 0) {
    return {
      label: "Low confidence",
      tone: "rose"
    };
  }

  if (partialCount > 0) {
    return {
      label: "Partial mapping",
      tone: "amber"
    };
  }

  return null;
}

function sortRows(rows: TraceableEntry[]) {
  return [...rows].sort((left, right) => Math.abs(right.displayAmount) - Math.abs(left.displayAmount));
}

function buildTraceableEntry(
  entry: FinancialEntry,
  savedMappings: AccountMapping[],
  displayAmount: number
): TraceableEntry {
  const meta = getEntryMappingMeta(entry, savedMappings);

  return {
    id: entry.id,
    accountName: entry.account_name,
    amount: Number(entry.amount),
    displayAmount,
    category: entry.category,
    statementType: entry.statement_type,
    addbackFlag: entry.addback_flag,
    matchedBy: meta.matchedBy,
    confidence: meta.confidence,
    mappingExplanation: meta.explanation
  };
}

function buildMetric(
  key: AuditMetricKey,
  label: string,
  total: number,
  groups: AuditMetric["groups"]
): AuditMetric {
  const rows = groups.flatMap((group) => group.rows);

  return {
    key,
    label,
    total,
    groups,
    rowCount: rows.length,
    mappedCount: rows.filter(
      (row) => row.matchedBy !== "manual" && row.matchedBy !== "csv_value"
    ).length,
    manualCount: rows.filter(
      (row) => row.matchedBy === "manual" || row.matchedBy === "csv_value"
    ).length,
    badge: getBadge(rows)
  };
}

export function buildAuditMetrics(
  entries: FinancialEntry[],
  savedMappings: AccountMapping[]
): Record<AuditMetricKey, AuditMetric> {
  const revenueRows = sortRows(
    entries
      .filter((entry) => entry.category === "Revenue")
      .map((entry) => buildTraceableEntry(entry, savedMappings, Number(entry.amount)))
  );
  const cogsRows = sortRows(
    entries
      .filter((entry) => entry.category === "COGS")
      .map((entry) => buildTraceableEntry(entry, savedMappings, Number(entry.amount)))
  );
  const operatingExpenseRows = sortRows(
    entries
      .filter((entry) => entry.category === "Operating Expenses")
      .map((entry) => buildTraceableEntry(entry, savedMappings, Number(entry.amount)))
  );
  const ebitdaRevenueRows = sortRows(
    entries
      .filter((entry) => entry.category === "Revenue")
      .map((entry) => buildTraceableEntry(entry, savedMappings, Number(entry.amount)))
  );
  const ebitdaCogsRows = sortRows(
    entries
      .filter((entry) => entry.category === "COGS")
      .map((entry) => buildTraceableEntry(entry, savedMappings, -Number(entry.amount)))
  );
  const ebitdaOperatingExpenseRows = sortRows(
    entries
      .filter((entry) => entry.category === "Operating Expenses")
      .map((entry) => buildTraceableEntry(entry, savedMappings, -Number(entry.amount)))
  );

  const revenueTotal = revenueRows.reduce((sum, row) => sum + row.displayAmount, 0);
  const cogsTotal = cogsRows.reduce((sum, row) => sum + row.displayAmount, 0);
  const operatingExpenseTotal = operatingExpenseRows.reduce(
    (sum, row) => sum + row.displayAmount,
    0
  );
  const ebitdaTotal = [
    ...ebitdaRevenueRows,
    ...ebitdaCogsRows,
    ...ebitdaOperatingExpenseRows
  ].reduce((sum, row) => sum + row.displayAmount, 0);

  return {
    revenue: buildMetric("revenue", "Revenue", revenueTotal, [
      {
        label: "Revenue",
        subtotal: revenueTotal,
        rows: revenueRows
      }
    ]),
    cogs: buildMetric("cogs", "COGS", cogsTotal, [
      {
        label: "COGS",
        subtotal: cogsTotal,
        rows: cogsRows
      }
    ]),
    operatingExpenses: buildMetric(
      "operatingExpenses",
      "Operating Expenses",
      operatingExpenseTotal,
      [
        {
          label: "Operating Expenses",
          subtotal: operatingExpenseTotal,
          rows: operatingExpenseRows
        }
      ]
    ),
    ebitda: buildMetric("ebitda", "EBITDA", ebitdaTotal, [
      {
        label: "Revenue",
        subtotal: revenueTotal,
        rows: ebitdaRevenueRows
      },
      {
        label: "COGS",
        subtotal: -cogsTotal,
        rows: ebitdaCogsRows
      },
      {
        label: "Operating Expenses",
        subtotal: -operatingExpenseTotal,
        rows: ebitdaOperatingExpenseRows
      }
    ])
  };
}

export function buildMappingConsistencyIssues(
  entries: FinancialEntry[],
  periods: ReportingPeriod[]
): MappingConsistencyIssue[] {
  const periodLabels = new Map(periods.map((period) => [period.id, period.label]));
  const periodOrder = new Map(periods.map((period, index) => [period.id, index]));
  const accountHistory = new Map<
    string,
    Array<{
      periodId: string;
      periodLabel: string;
      category: NormalizedCategory;
      statementType: StatementType;
    }>
  >();

  entries.forEach((entry) => {
    const key = normalizeAccountName(entry.account_name);
    const history = accountHistory.get(key) ?? [];
    const periodLabel = periodLabels.get(entry.period_id) ?? "Unknown period";
    const mapping = {
      periodId: entry.period_id,
      periodLabel,
      category: entry.category,
      statementType: entry.statement_type
    };

    if (
      !history.some(
        (item) =>
          item.periodLabel === mapping.periodLabel &&
          item.category === mapping.category &&
          item.statementType === mapping.statementType
      )
    ) {
      history.push(mapping);
    }

    accountHistory.set(key, history);
  });

  return Array.from(accountHistory.entries())
    .map(([normalizedName, mappings]) => {
      const uniqueMappings = new Set(
        mappings.map((mapping) => `${mapping.category}::${mapping.statementType}`)
      );

      if (uniqueMappings.size < 2) {
        return null;
      }

      const accountName =
        entries.find(
          (entry) => normalizeAccountName(entry.account_name) === normalizedName
        )?.account_name ?? normalizedName;
      const sortedMappings = [...mappings].sort(
        (left, right) =>
          (periodOrder.get(left.periodId) ?? 0) -
          (periodOrder.get(right.periodId) ?? 0)
      );
      const [first, second] = sortedMappings;

      return {
        accountName,
        message: `'${accountName}' mapped as ${first.category} in ${first.periodLabel} but ${second.category} in ${second.periodLabel}.`,
        mappings: sortedMappings
        .map(({ periodId: _periodId, ...mapping }) => mapping)
      };
    })
    .filter((issue): issue is MappingConsistencyIssue => Boolean(issue))
    .sort((left, right) => left.accountName.localeCompare(right.accountName));
}
