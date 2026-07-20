import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: React.ReactNode;
  density?: "standard" | "compact";
};

export function EmptyState({ title, description, icon: Icon, action, density = "standard" }: EmptyStateProps) {
  return (
    <div className={density === "compact" ? "flex min-h-28 flex-col items-center justify-center px-3 py-4 text-center" : "flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center"}>
      <div className="flex size-9 items-center justify-center rounded-bs-md border border-bs-border-subtle bg-bs-page text-bs-text-muted">
        <Icon aria-hidden="true" className="size-4" />
      </div>
      <h3 className={density === "compact" ? "mt-2 text-[11px] font-semibold text-bs-text-primary" : "bs-section-title mt-3"}>{title}</h3>
      <p className={density === "compact" ? "mt-1 max-w-md text-[9px] leading-3 text-bs-text-muted" : "bs-body-text mt-1 max-w-md"}>{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
