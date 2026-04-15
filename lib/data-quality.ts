import { suggestAccountMapping } from "@/lib/auto-mapping";
import type {
  AccountMapping,
  DataQualityReport,
  FinancialEntry,
  MappingClassification,
  PeriodSnapshot,
  StatementType
} from "@/lib/types";

function classifyEntryMapping(
  entry: FinancialEntry,
  savedMappings: AccountMapping[]
): MappingClassification {
  if (entry.matched_by === "saved_mapping") {
    return "saved_mapping";
  }

  if (entry.matched_by === "keyword" || entry.matched_by === "keyword_rule") {
    return "keyword_mapping";
  }

  if (entry.matched_by === "manual" || entry.matched_by === "csv_value") {
    return "manual_mapping";
  }

  if (!entry.category || !entry.statement_type) {
    return "unmapped";
  }

  const savedSuggestion = suggestAccountMapping(entry.account_name, savedMappings);
  if (
    savedSuggestion.matchedBy === "saved_mapping" &&
    savedSuggestion.category === entry.category &&
    savedSuggestion.statementType === entry.statement_type
  ) {
    return "saved_mapping";
  }

  const keywordSuggestion = suggestAccountMapping(entry.account_name, []);
  if (
    keywordSuggestion.matchedBy === "keyword_rule" &&
    keywordSuggestion.category === entry.category &&
    keywordSuggestion.statementType === entry.statement_type
  ) {
    return "keyword_mapping";
  }

  return "manual_mapping";
}

function findMissingCategories(
  latestSnapshot: PeriodSnapshot,
  entriesForLatestPeriod: FinancialEntry[]
) {
  const missing: string[] = [];

  const hasRevenue = entriesForLatestPeriod.some((entry) => entry.category === "Revenue");
  const hasCogs = entriesForLatestPeriod.some((entry) => entry.category === "COGS");
  const hasOperatingExpenses = entriesForLatestPeriod.some(
    (entry) => entry.category === "Operating Expenses"
  );

  if (!hasRevenue) missing.push("Revenue");
  if (!hasCogs) missing.push("COGS");
  if (!hasOperatingExpenses) {
    missing.push("Operating Expenses");
  }

  const hasAssets = entriesForLatestPeriod.some(
    (entry) =>
      entry.category === "Assets" ||
      entry.category === "current_assets" ||
      entry.category.startsWith("current_assets.") ||
      entry.category === "non_current_assets" ||
      entry.category.startsWith("non_current_assets.")
  );
  const hasLiabilities = entriesForLatestPeriod.some(
    (entry) =>
      entry.category === "Liabilities" ||
      entry.category === "current_liabilities" ||
      entry.category.startsWith("current_liabilities.") ||
      entry.category === "non_current_liabilities" ||
      entry.category.startsWith("non_current_liabilities.")
  );
  const hasEquity = entriesForLatestPeriod.some(
    (entry) =>
      entry.category === "Equity" ||
      entry.category === "equity" ||
      entry.category.startsWith("equity.")
  );

  if (!hasAssets || !hasLiabilities || !hasEquity) {
    missing.push("Balance sheet components");
  }

  return missing;
}

function findConsistencyIssues(entries: FinancialEntry[]) {
  const accountMap = new Map<string, Set<string>>();

  entries.forEach((entry) => {
    const key = entry.account_name.trim().toLowerCase();
    const mappingValue = `${entry.category}::${entry.statement_type}`;
    const existing = accountMap.get(key) ?? new Set<string>();
    existing.add(mappingValue);
    accountMap.set(key, existing);
  });

  return Array.from(accountMap.entries())
    .filter(([, mappings]) => mappings.size > 1)
    .map(([accountName]) => `${accountName} is mapped inconsistently across periods.`);
}

function hasLargeSwing(value: number | null) {
  return value !== null && Number.isFinite(value) && Math.abs(value) > 200;
}

function scoreLabel(score: number): "High" | "Medium" | "Low" {
  if (score >= 80) return "High";
  if (score >= 55) return "Medium";
  return "Low";
}

function summaryMessage(label: "High" | "Medium" | "Low") {
  if (label === "High") return "Data is reliable for analysis";
  if (label === "Medium") return "Some issues may affect insights";
  return "Data needs attention before relying on results";
}

function severityRank(severity: "Critical" | "Warning" | "Info") {
  if (severity === "Critical") return 0;
  if (severity === "Warning") return 1;
  return 2;
}

function sortIssues<T extends { severity: "Critical" | "Warning" | "Info" }>(
  issues: T[]
) {
  return [...issues].sort((left, right) => {
    return severityRank(left.severity) - severityRank(right.severity);
  });
}

export function buildDataQualityReport({
  entries,
  savedMappings,
  snapshots
}: {
  entries: FinancialEntry[];
  savedMappings: AccountMapping[];
  snapshots: PeriodSnapshot[];
}): DataQualityReport {
  const mappingBreakdown: Record<MappingClassification, number> = {
    saved_mapping: 0,
    keyword_mapping: 0,
    manual_mapping: 0,
    unmapped: 0
  };

  entries.forEach((entry) => {
    const classification = classifyEntryMapping(entry, savedMappings);
    mappingBreakdown[classification] += 1;
  });

  const mappedCount =
    mappingBreakdown.saved_mapping +
    mappingBreakdown.keyword_mapping +
    mappingBreakdown.manual_mapping;
  const totalRows = entries.length;
  const mappingCoveragePercent =
    totalRows === 0 ? 0 : (mappedCount / totalRows) * 100;

  const latestSnapshot = snapshots[snapshots.length - 1] ?? null;
  const latestEntries = latestSnapshot
    ? entries.filter((entry) => entry.period_id === latestSnapshot.periodId)
    : [];
  const missingCategories = latestSnapshot
    ? findMissingCategories(latestSnapshot, latestEntries)
    : ["Revenue", "COGS", "Operating Expenses", "Balance sheet components"];

  const consistencyIssues = findConsistencyIssues(entries);
  const completenessIssues: DataQualityReport["issueGroups"][number]["issues"] = [];
  const consistencyGroupIssues: DataQualityReport["issueGroups"][number]["issues"] = [];
  const sanityIssues: DataQualityReport["issueGroups"][number]["issues"] = [];
  const mappingIssues: DataQualityReport["issueGroups"][number]["issues"] = [];

  if (snapshots.length < 2) {
    completenessIssues.push({
      message: "Only one reporting period is available — trend analysis is limited.",
      severity: "Info"
    });
  }

  if (latestSnapshot) {
    if (
      latestSnapshot.grossMarginPercent < 0 ||
      latestSnapshot.grossMarginPercent > 100
    ) {
      sanityIssues.push({
        message: "Gross margin is outside a normal 0% to 100% range — classifications may need review.",
        severity: "Critical"
      });
    }

    if (
      latestSnapshot.ebitdaMarginPercent !== null &&
      (latestSnapshot.ebitdaMarginPercent < 0 ||
        latestSnapshot.ebitdaMarginPercent > 100)
    ) {
      sanityIssues.push({
        message: "EBITDA margin is outside a normal 0% to 100% range — profitability may be misstated.",
        severity: "Critical"
      });
    }

    if (
      latestSnapshot.ebitda !== null &&
      latestSnapshot.ebitda > latestSnapshot.revenue &&
      latestSnapshot.revenue > 0
    ) {
      sanityIssues.push({
        message: "EBITDA exceeds revenue — account classification likely needs attention.",
        severity: "Critical"
      });
    }

    if (
      hasLargeSwing(latestSnapshot.revenueGrowthPercent) ||
      hasLargeSwing(latestSnapshot.ebitdaGrowthPercent)
    ) {
      sanityIssues.push({
        message: "Large swings above 200% were detected — confirm the current and prior period data is complete.",
        severity: "Warning"
      });
    }
  }

  missingCategories.forEach((item) => {
    const message =
      item === "COGS"
        ? "COGS is missing for this period — margins may be inaccurate."
        : item === "Revenue"
          ? "Revenue is missing for this period — profitability analysis may not be meaningful."
          : item === "Operating Expenses"
            ? "Operating expenses are missing for this period — EBITDA may be overstated."
            : "Balance sheet components are incomplete — working capital analysis may be unreliable.";

    completenessIssues.push({
      message,
      severity: item === "Revenue" ? "Critical" : "Warning"
    });
  });

  consistencyIssues.forEach((issue) => {
    consistencyGroupIssues.push({
      message: "Some accounts are mapped differently across periods — this may affect trend analysis.",
      severity: "Warning"
    });
  });

  if (mappingCoveragePercent < 70) {
    mappingIssues.push({
      message: "Mapping coverage is low — imported results may rely too heavily on manual review.",
      severity: "Critical"
    });
  } else if (mappingCoveragePercent < 90) {
    mappingIssues.push({
      message: "Mapping coverage is incomplete — some rows may still need review.",
      severity: "Warning"
    });
  } else {
    mappingIssues.push({
      message: "Most rows are mapped cleanly across saved, keyword, or manual classifications.",
      severity: "Info"
    });
  }

  if (mappingBreakdown.unmapped > 0) {
    mappingIssues.push({
      message: `${mappingBreakdown.unmapped} row(s) remain unmapped — review them before relying on trend analysis.`,
      severity: "Warning"
    });
  }

  const manualMappingShare =
    totalRows === 0 ? 0 : (mappingBreakdown.manual_mapping / totalRows) * 100;

  if (manualMappingShare >= 40) {
    mappingIssues.push({
      message: `${mappingBreakdown.manual_mapping} row(s) use manual mapping — a large share of the dataset still depends on manual classification.`,
      severity: "Warning"
    });
  } else if (mappingBreakdown.manual_mapping > 0) {
    mappingIssues.push({
      message: `${mappingBreakdown.manual_mapping} row(s) use manual mapping — consider saving consistent mappings over time.`,
      severity: "Info"
    });
  }

  let confidenceScore = Math.round(mappingCoveragePercent);
  confidenceScore -= missingCategories.length * 10;
  confidenceScore -= sanityIssues.filter((issue) => issue.severity === "Critical").length * 12;
  confidenceScore -= sanityIssues.filter((issue) => issue.severity === "Warning").length * 10;
  confidenceScore -= consistencyIssues.length * 10;
  if (snapshots.length < 2) {
    confidenceScore -= 8;
  }

  confidenceScore = Math.max(0, Math.min(100, confidenceScore));
  const confidenceLabel = scoreLabel(confidenceScore);
  const issueGroups: DataQualityReport["issueGroups"] = [
    {
      key: "completeness",
      title: "Completeness",
      issues: sortIssues(completenessIssues).slice(0, 3)
    },
    {
      key: "consistency",
      title: "Consistency",
      issues: sortIssues(consistencyGroupIssues).slice(0, 3)
    },
    {
      key: "sanity",
      title: "Sanity Checks",
      issues: sortIssues(sanityIssues).slice(0, 3)
    },
    {
      key: "mapping",
      title: "Mapping Coverage",
      issues: sortIssues(mappingIssues).slice(0, 3)
    }
  ];

  return {
    mappingCoveragePercent,
    mappingBreakdown,
    missingCategories,
    confidenceScore,
    confidenceLabel,
    hasSinglePeriodWarning: snapshots.length < 2,
    consistencyIssues,
    summaryMessage: summaryMessage(confidenceLabel),
    issueGroups
  };
}
