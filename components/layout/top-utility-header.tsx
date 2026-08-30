import { Bell, HelpCircle, Menu, Search } from "lucide-react";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";

type TopUtilityHeaderProps = {
  title?: string;
  breadcrumbs: BreadcrumbItem[];
  user: {
    name: string;
    role: string;
    initials: string;
  };
  onOpenNavigation: () => void;
};

export function TopUtilityHeader({
  title,
  breadcrumbs,
  user,
  onOpenNavigation
}: TopUtilityHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex min-h-bs-topbar items-center gap-3 border-b border-bs-border-subtle bg-bs-surface/95 px-3 backdrop-blur md:px-5">
      <button
        type="button"
        onClick={onOpenNavigation}
        aria-label="Open navigation"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-bs-sm border border-bs-border-subtle text-bs-text-secondary hover:bg-bs-page lg:hidden"
      >
        <Menu aria-hidden="true" className="size-4" />
      </button>

      <div className="min-w-0 flex-1 overflow-hidden">
        {title ? (
          <p className="truncate text-sm font-semibold text-bs-text-primary">{title}</p>
        ) : (
          <Breadcrumbs items={breadcrumbs} />
        )}
      </div>

      <div className="hidden w-64 items-center gap-2 rounded-bs-sm border border-bs-border-subtle bg-bs-surface px-2.5 py-1.5 text-bs-text-muted shadow-bs-subtle md:flex">
        <Search aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="truncate text-xs">Search workspace...</span>
        <span className="ml-auto rounded border border-bs-border-subtle bg-bs-page px-1 text-[10px]">⌘ K</span>
      </div>

      <button
        type="button"
        disabled
        aria-label="Notifications are unavailable"
        className="inline-flex size-8 shrink-0 cursor-not-allowed items-center justify-center rounded-bs-sm text-bs-text-muted"
      >
        <Bell aria-hidden="true" className="size-4" />
      </button>
      <button
        type="button"
        disabled
        aria-label="Help is unavailable"
        className="inline-flex size-8 shrink-0 cursor-not-allowed items-center justify-center rounded-bs-sm text-bs-text-muted"
      >
        <HelpCircle aria-hidden="true" className="size-4" />
      </button>

      <div className="flex shrink-0 items-center gap-2 border-l border-bs-border-subtle pl-3">
        <span className="flex size-7 items-center justify-center rounded-full bg-bs-primary text-[10px] font-semibold text-white">
          {user.initials}
        </span>
        <div className="hidden min-w-0 sm:block">
          <p className="max-w-28 truncate text-[11px] font-semibold text-bs-text-primary">{user.name}</p>
          <p className="max-w-28 truncate text-[10px] text-bs-text-muted">{user.role}</p>
        </div>
      </div>
    </header>
  );
}
