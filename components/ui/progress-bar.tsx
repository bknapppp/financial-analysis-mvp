import { clsx } from "clsx";

type ProgressBarProps = {
  value: number;
  label: string;
  showValue?: boolean;
  size?: "compact" | "standard";
};

export function ProgressBar({
  value,
  label,
  showValue = false,
  size = "compact"
}: ProgressBarProps) {
  const boundedValue = Math.min(100, Math.max(0, value));

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <div
          className={clsx(
            "min-w-0 flex-1 overflow-hidden rounded-full bg-bs-border-subtle",
            size === "compact" ? "h-1.5" : "h-2"
          )}
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(boundedValue)}
        >
          <div
            className="h-full rounded-full bg-bs-primary transition-[width]"
            style={{ width: `${boundedValue}%` }}
          />
        </div>
        {showValue ? (
          <span className="bs-metadata w-9 text-right tabular-nums">
            {Math.round(boundedValue)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}
