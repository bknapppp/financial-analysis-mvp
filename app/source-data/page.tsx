import Link from "next/link";
import { CompanySetupForm } from "@/components/company-setup-form";
import { CsvImportSection } from "@/components/csv-import-section";
import { DealNextActionsPanel } from "@/components/deal-next-actions-panel";
import { DealPageNavigation } from "@/components/deal-page-navigation";
import { DiligenceFeedbackPanel } from "@/components/diligence-feedback-panel";
import { DocumentSection } from "@/components/document-section";
import { EntryForm } from "@/components/entry-form";
import { PeriodForm } from "@/components/period-form";
import { SourceDataSummaryPanel } from "@/components/source-data-summary-panel";
import { SourceReconciliationCard } from "@/components/source-reconciliation-card";
import { resolveDiligenceIssueActionTarget } from "@/lib/diligence-issues";
import { getDashboardData } from "@/lib/data";
import { DEFAULT_UNDERWRITING_INPUTS } from "@/lib/deal-derived-context";
import { buildDealState } from "@/lib/deal-state";
import { buildUnderwritingAnalysis } from "@/lib/underwriting/analysis";
import type { DiligenceIssue, DiligenceIssueSeverity } from "@/lib/types";

export const revalidate = 60;

export default async function SourceDataPage({
  searchParams
}: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const data = await getDashboardData(resolvedSearchParams.companyId);
  const companyName = data.company?.name || "No company selected";
  const companyId = data.company?.id ?? null;
  const overviewHref = companyId ? `/deal/${companyId}` : "/";
  const financialsHref = companyId ? `/financials?companyId=${companyId}` : "/financials";
  const underwritingHref = companyId ? `/deal/${companyId}/underwriting` : "/";
  const sourceDataHref = companyId ? `/source-data?companyId=${companyId}` : "/source-data";
  const underwritingAnalysis = buildUnderwritingAnalysis({
    snapshot: data.snapshot,
    entries: data.entries,
    dataQuality: data.dataQuality,
    taxSourceStatus: data.taxSourceStatus,
    reconciliation: data.reconciliation,
    underwritingInputs: DEFAULT_UNDERWRITING_INPUTS,
    ebitdaBasis: "adjusted"
  });
  const dealState = buildDealState(data.snapshot, {
    completionSummary: data.completionSummary,
    dataQuality: data.dataQuality,
    reconciliation: data.reconciliation,
    creditScenario: underwritingAnalysis.creditScenario
  });
  const sourceActions = dealState.actions.filter((action) => action.location === "source");
  const sourceIssueIds = new Set(sourceActions.map((action) => action.issueId));
  const sourceIssuesForActions = dealState.issues.filter((issue) => sourceIssueIds.has(issue.id));
  const sourceIssues = data.diligenceIssues.filter(
    (issue) =>
      (issue.status === "open" || issue.status === "in_review") &&
      (issue.period_id === null || issue.period_id === data.snapshot.periodId) &&
      (
        issue.linked_page === "source_data" ||
        issue.category === "source_data" ||
        issue.category === "reconciliation" ||
        issue.category === "tax"
      )
  );
  const supportByIssueId = Object.fromEntries(
    sourceIssues.map((issue) => {
      const requirement =
        data.backing.sourceRequirements.find((item) => item.id === issue.linked_field) ??
        data.backing.sourceRequirements.find((item) =>
          issue.issue_code === "missing_income_statement"
            ? item.id === "income_statement"
            : issue.issue_code === "missing_balance_sheet"
              ? item.id === "balance_sheet"
              : false
        );

      if (!requirement) {
        return [
          issue.id,
          {
            status: "unbacked" as const,
            detail: "Support: No supporting documents linked."
          }
        ] as const;
      }

      return [
        issue.id,
        {
          status: requirement.status,
          detail:
            requirement.linkedDocuments.length > 0
              ? "Supporting documents linked."
              : requirement.missingReason ?? "Support: No supporting documents linked.",
          documents: requirement.linkedDocuments.map((document) => document.name ?? document.source_file_name ?? "Document")
        }
      ] as const;
    })
  );
  const missingDocumentCount = data.backing.sourceRequirements.filter(
    (row) => row.status === "unbacked"
  ).length;
  const outstandingIssueCount = sourceIssues.length;
  const mappingCoveragePercent = Math.round(data.dataQuality.mappingCoveragePercent);

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-6 shadow-panel md:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <DealPageNavigation
                companyName={companyName}
                currentSection="Source Data"
                allDealsHref="/deals"
                overviewHref={overviewHref}
                financialsHref={financialsHref}
                underwritingHref={underwritingHref}
                sourceDataHref={sourceDataHref}
              />
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                {data.company?.name || "No company selected"} •{" "}
                {data.snapshot.label || "No reporting period loaded"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Source Data
              </h1>
              <p className="mt-3 text-sm text-slate-600 md:text-base">
                Ingestion, mapping, and reconciliation for the reported source package.
              </p>
            </div>

          </div>
        </section>

        <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Data Intake Status
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-900">
                Source data intake workflow
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Understand what&apos;s missing, upload source files, resolve issues, and complete intake.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="#source-data-upload"
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
              >
                Upload Documents
              </a>
              <a
                href="#source-data-issues"
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Review Issues
              </a>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <StatusMetricCard label="Missing Documents" value={String(missingDocumentCount)} helper="Required source support still missing" />
            <StatusMetricCard label="Mapping Coverage" value={`${mappingCoveragePercent}%`} helper="Mapped financial rows across current intake" />
            <StatusMetricCard label="Outstanding Issues" value={String(outstandingIssueCount)} helper="Open source, mapping, or reconciliation items" />
          </div>
        </section>

        <section id="source-data-upload">
          <CsvImportSection
            companies={data.companies}
            initialCompanyId={data.company?.id ?? null}
            initialPeriods={data.periods}
            companySetupSlot={<CompanySetupForm />}
            advancedToolsSlot={
              <div className="space-y-4">
                <details className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                    Manual period tools
                  </summary>
                  <p className="mt-2 text-sm text-slate-500">
                    Use these only when the uploaded source is missing period structure or needs a targeted manual adjustment.
                  </p>
                  <div className="mt-4">
                    <PeriodForm companyId={data.company?.id ?? null} />
                  </div>
                </details>

                <details className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                    Manual entry fallback
                  </summary>
                  <p className="mt-2 text-sm text-slate-500">
                    Use manual line-by-line entry only when the uploaded source needs a targeted adjustment or a small missing line item.
                  </p>
                  <div className="mt-4">
                    <EntryForm companyId={data.company?.id ?? null} periods={data.periods} />
                  </div>
                </details>
              </div>
            }
          />
        </section>

        <section>
          <div className="space-y-4">
            <SourceDataSummaryPanel data={data} />
            {companyId ? (
              <DocumentSection
                companyId={companyId}
                rows={data.backing.sourceRequirements}
                documents={data.documents}
                documentLinks={data.documentLinks}
                documentVersions={data.documentVersions}
                issues={sourceIssues}
              />
            ) : null}
            <SourceIssuesCompactPanel
              issues={sourceIssues}
              issueSupport={supportByIssueId}
            />
            <SourceReconciliationCard
              companyId={data.company?.id ?? null}
              periodId={data.snapshot.periodId || null}
            />
            {companyId ? (
              <DealNextActionsPanel
                companyId={companyId}
                actions={sourceActions}
                issues={sourceIssuesForActions}
                completeness={dealState.completeness}
                trustScore={dealState.trustScore}
              />
            ) : null}
            <DiligenceFeedbackPanel
              feedback={data.diligenceIssueFeedback}
              title="Source Issue Changes"
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusMetricCard(props: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
        {props.label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
        {props.value}
      </p>
      <p className="mt-1 text-xs text-slate-500">{props.helper}</p>
    </div>
  );
}

function severityTone(severity: DiligenceIssueSeverity) {
  if (severity === "critical") return "bg-rose-100 text-rose-800";
  if (severity === "high") return "bg-amber-100 text-amber-800";
  if (severity === "medium") return "bg-sky-100 text-sky-800";
  return "bg-slate-100 text-slate-700";
}

function SourceIssuesCompactPanel(props: {
  issues: DiligenceIssue[];
  issueSupport: Record<
    string,
    {
      status: "backed" | "partial" | "unbacked";
      detail: string;
      documents?: string[];
    }
  >;
}) {
  const { issues, issueSupport } = props;

  return (
    <details
      id="source-data-issues"
      className="rounded-[1.6rem] border border-slate-200/80 bg-white p-4 shadow-panel"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
            Step 3
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Source Data Issues</h2>
          <p className="mt-1 text-sm text-slate-600">
            Fix issues
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
          {issues.length} open
        </div>
      </summary>

      {issues.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200/70">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Issue</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Severity</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {issues.map((issue) => {
                const actionTarget = resolveDiligenceIssueActionTarget(issue);
                const support = issueSupport[issue.id];

                return (
                  <tr key={issue.id}>
                    <td className="px-4 py-3 align-top">
                      <p className="font-medium text-slate-900">{issue.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{issue.description}</p>
                      {support ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {support.detail}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${severityTone(issue.severity)}`}>
                        {issue.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {actionTarget.isActionable && actionTarget.linkedRoute && actionTarget.actionLabel ? (
                        <Link
                          href={actionTarget.linkedRoute}
                          className="inline-flex rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          {actionTarget.actionLabel}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">No action linked</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 px-4 py-3 text-sm text-slate-600">
          No open source-data issues are currently tracked.
        </div>
      )}
    </details>
  );
}
