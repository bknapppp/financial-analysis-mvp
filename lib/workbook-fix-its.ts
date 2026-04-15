import { buildFixItHref } from "./fix-it.ts";
import type { WorkbookContext } from "./workbook-context.ts";

export type WorkbookFixItTaskKey =
  | "missing_income_statement"
  | "missing_balance_sheet"
  | "ambiguous_income_statement"
  | "ambiguous_balance_sheet"
  | "no_periods_on_primary_income_statement"
  | "no_periods_on_primary_balance_sheet"
  | "primary_statement_period_mismatch"
  | "primary_statement_period_count_mismatch"
  | "supporting_schedules_only"
  | "no_importable_statements"
  | "mixed_period_structure";

export type WorkbookFixItTask = {
  key: WorkbookFixItTaskKey;
  label: string;
  reason: string;
  actionLabel: string;
  href: string;
  severity: "critical" | "warning";
};

type DeriveWorkbookFixItsParams = {
  workbookContext: WorkbookContext | null;
  companyId?: string | null;
};

function buildSourceDataHref(companyId?: string | null) {
  return companyId ? `/source-data?companyId=${companyId}` : "/source-data";
}

function createTask(params: {
  key: WorkbookFixItTaskKey;
  label: string;
  reason: string;
  actionLabel: string;
  severity: "critical" | "warning";
  companyId?: string | null;
}): WorkbookFixItTask {
  const fallbackHref = buildSourceDataHref(params.companyId);

  return {
    key: params.key,
    label: params.label,
    reason: params.reason,
    actionLabel: params.actionLabel,
    href: buildFixItHref(params.actionLabel, fallbackHref),
    severity: params.severity
  };
}

export function deriveWorkbookFixIts({
  workbookContext,
  companyId
}: DeriveWorkbookFixItsParams): WorkbookFixItTask[] {
  if (!workbookContext) {
    return [];
  }

  const tasks: WorkbookFixItTask[] = [];
  const conflictText = workbookContext.conflicts.join(" ");
  const gapText = workbookContext.gaps.join(" ");

  if (!workbookContext.primaryIncomeStatementSheetName) {
    tasks.push(
      createTask({
        key: "missing_income_statement",
        label: "Upload or select an income statement",
        reason: "Workbook context did not identify a primary income statement sheet.",
        actionLabel: "Upload or select an income statement",
        severity: "critical",
        companyId
      })
    );
  }

  if (!workbookContext.primaryBalanceSheetSheetName) {
    tasks.push(
      createTask({
        key: "missing_balance_sheet",
        label: "Upload or select a balance sheet",
        reason: "Workbook context did not identify a primary balance sheet sheet.",
        actionLabel: "Upload or select a balance sheet",
        severity: "critical",
        companyId
      })
    );
  }

  if (conflictText.toLowerCase().includes("multiple possible income statement")) {
    tasks.push(
      createTask({
        key: "ambiguous_income_statement",
        label: "Review multiple income statement candidates",
        reason: "Multiple workbook sheets look like valid income statements and need selection review.",
        actionLabel: "Review multiple income statement candidates",
        severity: "warning",
        companyId
      })
    );
  }

  if (conflictText.toLowerCase().includes("multiple possible balance sheet")) {
    tasks.push(
      createTask({
        key: "ambiguous_balance_sheet",
        label: "Review multiple balance sheet candidates",
        reason: "Multiple workbook sheets look like valid balance sheets and need selection review.",
        actionLabel: "Review multiple balance sheet candidates",
        severity: "warning",
        companyId
      })
    );
  }

  if (gapText.toLowerCase().includes("no periods were detected on the primary income statement")) {
    tasks.push(
      createTask({
        key: "no_periods_on_primary_income_statement",
        label: "Review workbook periods before import",
        reason: "The primary income statement sheet does not expose a usable period structure yet.",
        actionLabel: "Review workbook periods before import",
        severity: "warning",
        companyId
      })
    );
  }

  if (gapText.toLowerCase().includes("no periods were detected on the primary balance sheet")) {
    tasks.push(
      createTask({
        key: "no_periods_on_primary_balance_sheet",
        label: "Review balance sheet periods before import",
        reason: "The primary balance sheet sheet does not expose a usable period structure yet.",
        actionLabel: "Review detected periods",
        severity: "warning",
        companyId
      })
    );
  }

  if (conflictText.toLowerCase().includes("primary statements use different period structures")) {
    tasks.push(
      createTask({
        key: "primary_statement_period_mismatch",
        label: "Resolve primary statement period mismatch",
        reason: "Primary workbook statements use different period structures and should be aligned.",
        actionLabel: "Resolve primary statement period mismatch",
        severity: "warning",
        companyId
      })
    );
  }

  if (conflictText.toLowerCase().includes("primary statements expose different period counts")) {
    tasks.push(
      createTask({
        key: "primary_statement_period_count_mismatch",
        label: "Review primary statement period coverage",
        reason: "Primary workbook statements expose different period counts and need review.",
        actionLabel: "Review detected periods",
        severity: "warning",
        companyId
      })
    );
  }

  if (gapText.toLowerCase().includes("only contains supporting schedules")) {
    tasks.push(
      createTask({
        key: "supporting_schedules_only",
        label: "Upload a usable financial statement workbook",
        reason: "The workbook appears to contain supporting schedules rather than importable statements.",
        actionLabel: "Upload a usable financial statement workbook",
        severity: "critical",
        companyId
      })
    );
  }

  if (gapText.toLowerCase().includes("no importable financial statements were detected")) {
    tasks.push(
      createTask({
        key: "no_importable_statements",
        label: "Review workbook sheet selection",
        reason: "No importable income statement or balance sheet was detected in the workbook.",
        actionLabel: "Review workbook sheet selection",
        severity: "critical",
        companyId
      })
    );
  }

  if (workbookContext.periodStructureSummary === "mixed") {
    tasks.push(
      createTask({
        key: "mixed_period_structure",
        label: "Review mixed workbook periods",
        reason: "Workbook context detected mixed period structures across the primary statements.",
        actionLabel: "Review detected periods",
        severity: "warning",
        companyId
      })
    );
  }

  return tasks.filter(
    (task, index, collection) =>
      collection.findIndex((candidate) => candidate.key === task.key) === index
  );
}
