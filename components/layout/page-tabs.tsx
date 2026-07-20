import Link from "next/link";
import { clsx } from "clsx";

export type PageTab = {
  key: string;
  label: string;
  href: string;
  disabled?: boolean;
};

type PageTabsProps = {
  items: PageTab[];
  activeKey: string;
  ariaLabel: string;
};

export function PageTabs({ items, activeKey, ariaLabel }: PageTabsProps) {
  return (
    <nav aria-label={ariaLabel} className="overflow-x-auto border-b border-bs-border-subtle bg-bs-surface px-4 md:px-6">
      <div className="mx-auto flex min-w-max max-w-bs-content gap-5">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.key === activeKey ? "page" : undefined}
            aria-disabled={item.disabled || undefined}
            tabIndex={item.disabled ? -1 : undefined}
            className={clsx(
              "border-b-2 px-0.5 py-2.5 text-xs font-medium",
              item.key === activeKey
                ? "border-bs-primary text-bs-primary"
                : "border-transparent text-bs-text-secondary hover:border-bs-border-strong hover:text-bs-text-primary",
              item.disabled && "pointer-events-none opacity-50"
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
