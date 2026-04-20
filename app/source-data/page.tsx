import { CompanySetupForm } from "@/components/company-setup-form";
import { CsvImportSection } from "@/components/csv-import-section";
import { DealPageNavigation } from "@/components/deal-page-navigation";
import { DiligenceFeedbackPanel } from "@/components/diligence-feedback-panel";
import { DiligenceIssuesPanel } from "@/components/diligence-issues-panel";
import { DiligenceReadinessPanel } from "@/components/diligence-readiness-panel";
import { EntryForm } from "@/components/entry-form";
import { PeriodForm } from "@/components/period-form";
import { SourceDataSummaryPanel } from "@/components/source-data-summary-panel";
import { SourceReconciliationCard } from "@/components/source-reconciliation-card";
import { getDashboardData } from "@/lib/data";

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

        <section>
          <div className="space-y-6">
            <DiligenceFeedbackPanel
              feedback={data.diligenceIssueFeedback}
              title="Source Issue Changes"
            />
            {(data.diligenceReadiness.blockingGroupKey === "source_data" ||
              data.diligenceReadiness.blockingGroupKey === "reconciliation" ||
              sourceIssues.length > 0) ? (
              <DiligenceReadinessPanel
                readiness={data.diligenceReadiness}
                issueGroups={data.diligenceIssueGroups.filter(
                  (group) =>
                    group.groupKey === "source_data" ||
                    group.groupKey === "reconciliation" ||
                    group.groupKey === "tax"
                )}
                title="Source Readiness"
                description="How current source coverage, mapping, and reconciliation issues affect diligence readiness."
              />
            ) : null}
            {companyId ? (
              <DiligenceIssuesPanel
                companyId={companyId}
                periodId={data.snapshot.periodId}
                issues={sourceIssues}
                currentPage="source_data"
                title="Source Data Issues"
                description="Open source coverage, mapping, and reconciliation issues for the selected deal."
                emptyMessage="No open source-data issues are currently tracked."
                allowManualCreate
                preferredGroups={["source_data", "reconciliation", "tax"]}
              />
            ) : null}
            <SourceDataSummaryPanel data={data} />
            <SourceReconciliationCard
              companyId={data.company?.id ?? null}
              periodId={data.snapshot.periodId || null}
            />
          </div>
        </section>

        <section>
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
      </div>
    </main>
  );
}
