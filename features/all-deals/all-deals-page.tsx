import { Building2, LayoutDashboard } from "lucide-react";
import { DealsScreenerTable } from "@/components/deals-screener-table";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AllDealsPageViewModel } from "@/features/all-deals/all-deals-view-model";

export function AllDealsPage({ model }: { model: AllDealsPageViewModel }) {
  return (
    <div className="bs-foundation min-h-screen bg-bs-page">
      <header className="border-b border-white/10 bg-bs-sidebar text-white">
        <div className="mx-auto flex min-h-bs-topbar max-w-bs-content items-center justify-between gap-4 px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-bs-sm border border-sky-400/30 bg-sky-400/10 text-sky-300">
              <Building2 aria-hidden="true" className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-4">Broadstone</p>
              <p className="truncate text-[9px] uppercase tracking-[0.14em] text-slate-400">
                Transactions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <LayoutDashboard aria-hidden="true" className="size-3.5" />
            <span>Deal portfolio</span>
          </div>
        </div>
      </header>

      <PageHeader
        eyebrow="Transaction portfolio"
        title={model.title}
        description={model.description}
        status={
          <StatusBadge tone={model.summary.activeDeals > 0 ? "informational" : "neutral"}>
            {model.summary.activeDeals} active
          </StatusBadge>
        }
      />

      <main className="mx-auto max-w-bs-content px-4 py-4 md:px-6 md:py-5">
        <DealsScreenerTable rows={model.rows} />
      </main>
    </div>
  );
}
