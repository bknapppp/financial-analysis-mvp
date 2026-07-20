"use client";

import { useState } from "react";
import { DealSidebar } from "@/components/layout/deal-sidebar";
import { TopUtilityHeader } from "@/components/layout/top-utility-header";
import type { DealShellViewModel } from "@/lib/view-models/deal-shell";

type AppShellProps = {
  model: DealShellViewModel;
  children: React.ReactNode;
};

export function AppShell({ model, children }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);

  return (
    <div className="bs-foundation min-h-screen bg-bs-page">
      <a
        href="#broadstone-main-content"
        className="fixed left-3 top-3 z-[60] -translate-y-20 rounded-bs-sm bg-bs-surface px-3 py-2 text-xs font-medium text-bs-text-primary shadow-bs-overlay focus:translate-y-0"
      >
        Skip to main content
      </a>
      <div className="flex min-h-screen min-w-0">
        <DealSidebar
          model={model}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileNavigationOpen}
          onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
          onCloseMobile={() => setMobileNavigationOpen(false)}
        />
        <div className="min-w-0 max-w-full flex-1 overflow-x-clip">
          <TopUtilityHeader
            title={model.topHeaderTitle}
            breadcrumbs={model.breadcrumbs}
            user={model.user}
            onOpenNavigation={() => setMobileNavigationOpen(true)}
          />
          <main id="broadstone-main-content" className="min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
