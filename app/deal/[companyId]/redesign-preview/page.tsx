import Link from "next/link";
import { ArrowLeft, FileSearch, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { PageTabs } from "@/components/layout/page-tabs";
import { ContentCard } from "@/components/ui/content-card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { getCompanies } from "@/lib/deal-derived-context";
import { buildDealShellViewModel } from "@/lib/view-models/deal-shell";

export const revalidate = 60;

type PreviewTab = "foundation" | "responsive" | "guardrails";

function getPreviewTab(value: string | undefined): PreviewTab {
  if (value === "responsive" || value === "guardrails") {
    return value;
  }

  return "foundation";
}

export default async function RedesignPreviewPage({
  params,
  searchParams
}: {
  params: Promise<{ companyId: string }>;
  searchParams?: Promise<{ section?: string; tab?: string }>;
}) {
  const [{ companyId }, resolvedSearchParams, companies] = await Promise.all([
    params,
    searchParams ?? Promise.resolve<{ section?: string; tab?: string }>({}),
    getCompanies()
  ]);
  const company = companies.find((item) => item.id === companyId);

  if (!company) {
    notFound();
  }

  const model = buildDealShellViewModel({
    company,
    requestedSection: resolvedSearchParams.section
  });
  const activeTab = getPreviewTab(resolvedSearchParams.tab);
  const tabHref = (tab: PreviewTab) =>
    `/deal/${companyId}/redesign-preview?section=${model.activeKey}&tab=${tab}`;

  return (
    <AppShell model={model}>
      <PageHeader
        eyebrow="Broadstone frontend migration"
        title={`${model.activeLabel} shell preview`}
        description="Shared visual foundation and deal-scoped application shell. Page-specific workflows and production functionality are intentionally excluded."
        status={<StatusBadge tone="informational">Preview only</StatusBadge>}
        progress={
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="bs-label">Shell foundation</span>
              <span className="bs-metadata tabular-nums">Phase 1 of migration</span>
            </div>
            <ProgressBar value={100} label="Shared shell foundation complete" />
          </div>
        }
        actions={
          <Link
            href={model.legacyDealHref}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-bs-sm border border-bs-border-strong bg-bs-surface px-3 text-xs font-medium text-bs-text-secondary hover:bg-bs-page"
          >
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Current project overview
          </Link>
        }
      />

      <PageTabs
        ariaLabel="Preview sections"
        activeKey={activeTab}
        items={[
          { key: "foundation", label: "Foundation", href: tabHref("foundation") },
          { key: "responsive", label: "Responsive workspace", href: tabHref("responsive") },
          { key: "guardrails", label: "Migration guardrails", href: tabHref("guardrails") }
        ]}
      />

      <div className="mx-auto grid max-w-bs-content gap-4 px-4 py-4 md:px-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <ContentCard padding="none" ariaLabel="Preview destination status">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bs-border-subtle px-4 py-3">
              <div>
                <p className="bs-card-title">{model.activeLabel}</p>
                <p className="bs-metadata mt-0.5">Navigation destination represented in the shared shell</p>
              </div>
              <StatusBadge tone="neutral">Not implemented</StatusBadge>
            </div>
            <EmptyState
              icon={FileSearch}
              title="Page workspace intentionally excluded"
              description="This route validates the reusable shell only. The selected destination will be implemented in its own migration phase after route-specific view models and acceptance criteria are approved."
            />
          </ContentCard>

          <ContentCard>
            <SectionHeader
              title="Dense table foundation"
              description="Typography, alignment, row density, and controlled overflow preview"
              count={3}
            />
            <div className="mt-3 overflow-x-auto rounded-bs-sm border border-bs-border-subtle">
              <table className="w-full min-w-full border-collapse" aria-label="Shell typography preview">
                <thead className="bg-bs-page">
                  <tr className="h-bs-table-row border-b border-bs-border-subtle">
                    <th scope="col" className="bs-table-header px-3 text-left">Control</th>
                    <th scope="col" className="bs-table-header px-3 text-left">Status</th>
                    <th scope="col" className="bs-table-header px-3 text-left">Owner</th>
                    <th scope="col" className="bs-table-header px-3 text-left">Due date</th>
                    <th scope="col" className="bs-table-header px-3 text-right">Financial impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bs-border-subtle bg-bs-surface">
                  <tr className="h-bs-table-row">
                    <td className="bs-table-body px-3 font-medium text-bs-text-primary">Source evidence linked</td>
                    <td className="px-3"><StatusBadge tone="success">Verified</StatusBadge></td>
                    <td className="bs-table-body px-3">Preview User</td>
                    <td className="bs-table-body px-3 tabular-nums">Not configured</td>
                    <td className="bs-table-body bs-numeric px-3">—</td>
                  </tr>
                  <tr className="h-bs-table-row">
                    <td className="bs-table-body px-3 font-medium text-bs-text-primary">Manager review</td>
                    <td className="px-3"><StatusBadge tone="warning">Awaiting review</StatusBadge></td>
                    <td className="bs-table-body px-3">Unassigned</td>
                    <td className="bs-table-body px-3 tabular-nums">Not configured</td>
                    <td className="bs-table-body bs-numeric px-3">—</td>
                  </tr>
                  <tr className="h-bs-table-row">
                    <td className="bs-table-body px-3 font-medium text-bs-text-primary">Legacy route verification</td>
                    <td className="px-3"><StatusBadge tone="informational">In progress</StatusBadge></td>
                    <td className="bs-table-body px-3">Preview User</td>
                    <td className="bs-table-body px-3 tabular-nums">Not configured</td>
                    <td className="bs-table-body bs-numeric px-3">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </ContentCard>
        </div>

        <aside className="min-w-0 space-y-4" aria-label="Foundation notes">
          <ContentCard>
            <SectionHeader title="Preview data disclosure" />
            <dl className="mt-3 space-y-3">
              <div>
                <dt className="bs-label">Authoritative company</dt>
                <dd className="bs-body-text mt-0.5">{model.companyName}</dd>
              </div>
              <div>
                <dt className="bs-label">Deal type</dt>
                <dd className="bs-body-text mt-0.5">{model.dealType}</dd>
              </div>
              <div>
                <dt className="bs-label">Target close</dt>
                <dd className="bs-body-text mt-0.5">{model.targetCloseLabel}</dd>
              </div>
              <div>
                <dt className="bs-label">Overall progress</dt>
                <dd className="bs-body-text mt-0.5">52% — explicitly labeled preview data</dd>
              </div>
              <div>
                <dt className="bs-label">User identity</dt>
                <dd className="bs-body-text mt-0.5">Preview placeholder; no authentication changes</dd>
              </div>
            </dl>
          </ContentCard>

          <ContentCard>
            <SectionHeader title="Loading treatment" description="Structure-first, reduced-motion aware" />
            <LoadingSkeleton className="mt-4" lines={5} label="Preview loading treatment" />
          </ContentCard>

          <ContentCard>
            <div className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-bs-sm bg-bs-success/10 text-bs-success">
                <ShieldCheck aria-hidden="true" className="size-4" />
              </div>
              <div>
                <h2 className="bs-section-title">Migration-safe boundary</h2>
                <p className="bs-metadata mt-1">
                  Existing routes, financial modules, APIs, exports, and Supabase persistence remain unchanged.
                </p>
              </div>
            </div>
          </ContentCard>
        </aside>
      </div>
    </AppShell>
  );
}
