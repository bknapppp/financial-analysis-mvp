import { clsx } from "clsx";

type ContentCardProps = {
  children: React.ReactNode;
  className?: string;
  padding?: "none" | "compact" | "standard";
  ariaLabel?: string;
};

export function ContentCard({
  children,
  className,
  padding = "standard",
  ariaLabel
}: ContentCardProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={clsx(
        "rounded-bs-md border border-bs-border-subtle bg-bs-surface shadow-bs-subtle",
        padding === "compact" && "p-3",
        padding === "standard" && "p-4",
        className
      )}
    >
      {children}
    </section>
  );
}
