import { clsx } from "clsx";

export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "informational"
  | "neutral";

type StatusBadgeProps = {
  children: React.ReactNode;
  tone?: StatusTone;
  dot?: boolean;
};

const toneClasses: Record<StatusTone, string> = {
  success: "border-bs-success/20 bg-bs-success/10 text-bs-success",
  warning: "border-bs-warning/20 bg-bs-warning/10 text-bs-warning",
  danger: "border-bs-danger/20 bg-bs-danger/10 text-bs-danger",
  informational: "border-bs-info/20 bg-bs-info/10 text-bs-info",
  neutral: "border-bs-border-subtle bg-bs-page text-bs-neutral"
};

export function StatusBadge({
  children,
  tone = "neutral",
  dot = true
}: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        "bs-status-text inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5",
        toneClasses[tone]
      )}
    >
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}
