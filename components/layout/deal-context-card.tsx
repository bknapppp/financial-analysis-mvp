import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { ProgressBar } from "@/components/ui/progress-bar";

type DealContextCardProps = {
  dealName: string;
  dealType: string;
  targetCloseLabel: string;
  progressPercent: number;
  progressLabel?: string;
  progressIsPreview?: boolean;
  overviewHref: string;
  collapsed?: boolean;
};

export function DealContextCard({
  dealName,
  dealType,
  targetCloseLabel,
  progressPercent,
  progressLabel = "Overall progress",
  progressIsPreview = false,
  overviewHref,
  collapsed = false
}: DealContextCardProps) {
  if (collapsed) {
    return (
      <Link
        href={overviewHref}
        aria-label={`Open project overview for ${dealName}`}
        className="mx-auto flex size-9 items-center justify-center rounded-bs-sm border border-white/15 bg-white/5 text-xs font-semibold text-white hover:bg-white/10"
      >
        {dealName.slice(0, 2).toUpperCase()}
      </Link>
    );
  }

  return (
    <section aria-label="Deal context" className="rounded-bs-md border border-white/15 bg-white/[0.04] p-3.5 text-white">
      <p className="truncate text-xs font-semibold">{dealName}</p>
      <dl className="mt-3.5 space-y-2.5 text-[11px]">
        <div>
          <dt className="text-white/55">Deal type</dt>
          <dd className="mt-0.5 truncate text-white/90">{dealType}</dd>
        </div>
        <div>
          <dt className="text-white/55">Target close</dt>
          <dd className="mt-0.5 text-white/90">{targetCloseLabel}</dd>
        </div>
      </dl>
      <div className="mt-3.5 border-t border-white/10 pt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px]">
          <span className="text-white/60">{progressLabel}</span>
          <span className="font-medium tabular-nums">{progressPercent}%</span>
        </div>
        <ProgressBar value={progressPercent} label={progressLabel} />
        {progressIsPreview ? (
          <p className="mt-1.5 text-[10px] text-sky-200">Preview data</p>
        ) : null}
      </div>
      <Link
        href={overviewHref}
        className="mt-3.5 inline-flex w-full items-center justify-center gap-1.5 rounded-bs-sm border border-white/15 px-2 py-1.5 text-[11px] font-medium hover:bg-white/10"
      >
        Project overview
        <ExternalLink aria-hidden="true" className="size-3" />
      </Link>
    </section>
  );
}
