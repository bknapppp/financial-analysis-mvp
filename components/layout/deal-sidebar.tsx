"use client";

import Link from "next/link";
import { useState } from "react";
import { clsx } from "clsx";
import {
  Activity,
  BarChart3,
  Building2,
  CheckSquare,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileBarChart,
  FileSearch,
  Files,
  FolderKanban,
  Handshake,
  Home,
  LayoutList,
  MessageSquareText,
  Settings,
  ShieldAlert,
  Users,
  X,
  type LucideIcon
} from "lucide-react";
import { DealContextCard } from "@/components/layout/deal-context-card";
import type {
  DealShellViewModel,
  ShellIconKey,
  ShellNavigationItem
} from "@/lib/view-models/deal-shell";

const iconByKey: Record<ShellIconKey, LucideIcon> = {
  overview: Home,
  phases: FolderKanban,
  planning: ClipboardList,
  requests: FileSearch,
  analysis: BarChart3,
  findings: ShieldAlert,
  reporting: FileBarChart,
  close: Handshake,
  documents: Files,
  tasks: CheckSquare,
  issues: ShieldAlert,
  workpapers: LayoutList,
  reports: FileBarChart,
  analytics: Activity,
  team: Users,
  qa: MessageSquareText,
  settings: Settings
};

type DealSidebarProps = {
  model: DealShellViewModel;
  collapsed: boolean;
  mobileOpen: boolean;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
};

function NavigationLink({
  item,
  activeKey,
  collapsed,
  nested = false,
  onNavigate
}: {
  item: ShellNavigationItem;
  activeKey: string;
  collapsed: boolean;
  nested?: boolean;
  onNavigate: () => void;
}) {
  const Icon = iconByKey[item.icon];
  const isActive = item.key === activeKey;

  if (!item.href) {
    return null;
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      title={
        collapsed
          ? item.label
          : item.implemented
            ? item.label
            : `${item.label} — preview destination`
      }
      className={clsx(
        "group flex min-h-8 items-center rounded-bs-sm text-[11px] font-medium outline-none",
        collapsed ? "justify-center px-2" : nested ? "gap-2 px-2.5 pl-7" : "gap-2.5 px-2.5",
        isActive
          ? "bg-bs-sidebar-active text-white"
          : "text-slate-200 hover:bg-white/[0.07] hover:text-white"
      )}
    >
      {!nested || collapsed ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      {collapsed ? <span className="sr-only">{item.label}</span> : <span className="truncate">{item.label}</span>}
      {!collapsed && !item.implemented ? (
        <span className="ml-auto shrink-0 text-[8px] font-medium uppercase tracking-wide text-sky-300/75">
          Preview
        </span>
      ) : null}
    </Link>
  );
}

export function DealSidebar({
  model,
  collapsed,
  mobileOpen,
  onToggleCollapsed,
  onCloseMobile
}: DealSidebarProps) {
  const phasesContainActive = model.navigation
    .find((item) => item.key === "phases")
    ?.children?.some((item) => item.key === model.activeKey);
  const [phasesOpen, setPhasesOpen] = useState(() => Boolean(phasesContainActive));

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close navigation overlay"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
        />
      ) : null}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-50 flex bg-bs-sidebar text-white transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          collapsed ? "w-bs-sidebar-collapsed" : "w-bs-sidebar",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className={clsx("flex h-bs-topbar shrink-0 items-center border-b border-white/10", collapsed ? "justify-center px-2" : "justify-between px-3")}>
            <Link href="/deals" className="flex min-w-0 items-center gap-2 rounded-sm" aria-label="Broadstone deals">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-bs-sm border border-sky-400/30 bg-sky-400/10 text-sky-300">
                <Building2 aria-hidden="true" className="size-4" />
              </span>
              {!collapsed ? (
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold leading-4">Broadstone</span>
                  <span className="block truncate text-[9px] uppercase tracking-[0.14em] text-slate-400">Transactions</span>
                </span>
              ) : null}
            </Link>
            {!collapsed ? (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation"
                className="inline-flex size-7 items-center justify-center rounded-bs-sm text-slate-300 hover:bg-white/10 lg:hidden"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            ) : null}
          </div>

          <nav aria-label="Deal workspace" className="bs-sidebar-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-3">
            <ul className="space-y-0.5">
              {model.navigation.map((item) => {
                if (!item.children) {
                  return (
                    <li key={item.key}>
                      <NavigationLink
                        item={item}
                        activeKey={model.activeKey}
                        collapsed={collapsed}
                        onNavigate={onCloseMobile}
                      />
                    </li>
                  );
                }

                const Icon = iconByKey[item.icon];
                const expanded = phasesOpen;

                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => setPhasesOpen((current) => !current)}
                      aria-expanded={expanded}
                      className={clsx(
                        "flex min-h-8 w-full items-center rounded-bs-sm text-[11px] font-medium text-slate-200 hover:bg-white/[0.07] hover:text-white",
                        collapsed ? "justify-center px-2" : "gap-2.5 px-2.5"
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                      {collapsed ? (
                        <span className="sr-only">{item.label}</span>
                      ) : (
                        <>
                          <span className="truncate">{item.label}</span>
                          <ChevronDown
                            aria-hidden="true"
                            className={clsx("ml-auto size-3.5 transition-transform", expanded && "rotate-180")}
                          />
                        </>
                      )}
                    </button>
                    {expanded && !collapsed ? (
                      <ul className="mt-0.5 space-y-0.5">
                        {item.children.map((child) => (
                          <li key={child.key}>
                            <NavigationLink
                              item={child}
                              activeKey={model.activeKey}
                              collapsed={collapsed}
                              nested
                              onNavigate={onCloseMobile}
                            />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="shrink-0 border-t border-white/10 px-2.5 pb-2.5 pt-3">
            <DealContextCard
              dealName={model.dealName}
              dealType={model.dealType}
              targetCloseLabel={model.targetCloseLabel}
              progressPercent={model.progressPercent}
              progressLabel={model.progressLabel}
              progressIsPreview={model.progressIsPreview}
              overviewHref={model.projectOverviewHref}
              collapsed={collapsed}
            />
            <div className="my-2.5 border-t border-white/10" />
            <button
              type="button"
              disabled
              aria-label="Help is unavailable"
              className={clsx(
                "flex min-h-8 w-full cursor-not-allowed items-center rounded-bs-sm text-[11px] text-slate-500",
                collapsed ? "justify-center" : "gap-2 px-2"
              )}
              title={collapsed ? "Help" : undefined}
            >
              <CircleHelp aria-hidden="true" className="size-3.5" />
              {!collapsed ? <span>Help</span> : <span className="sr-only">Help</span>}
            </button>
            <div className={clsx("mt-1.5 flex items-center rounded-bs-sm bg-white/[0.04]", collapsed ? "justify-center py-1.5" : "gap-2.5 px-2 py-2")}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-bs-primary text-[9px] font-semibold">
                {model.user.initials}
              </span>
              {!collapsed ? (
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium">{model.user.name}</p>
                  <p className="truncate text-[9px] text-slate-400">{model.user.role}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          className="absolute -right-3 top-20 hidden size-6 items-center justify-center rounded-full border border-bs-border-strong bg-bs-surface text-bs-text-secondary shadow-bs-subtle hover:bg-bs-page lg:flex"
        >
          {collapsed ? <ChevronRight aria-hidden="true" className="size-3" /> : <ChevronLeft aria-hidden="true" className="size-3" />}
        </button>
      </aside>
    </>
  );
}
