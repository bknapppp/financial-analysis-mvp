import { clsx } from "clsx";

type LoadingSkeletonProps = {
  lines?: number;
  className?: string;
  label?: string;
};

export function LoadingSkeleton({
  lines = 4,
  className,
  label = "Loading content"
}: LoadingSkeletonProps) {
  return (
    <div className={clsx("space-y-2.5", className)} role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={clsx(
            "h-3 animate-pulse rounded-sm bg-bs-border-subtle motion-reduce:animate-none",
            index === lines - 1 ? "w-2/3" : "w-full"
          )}
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
