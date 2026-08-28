import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export default function ReportingLoading() {
  return <main aria-label="Loading Reporting" className="mx-auto max-w-bs-content space-y-4 px-4 py-6 md:px-6"><LoadingSkeleton className="h-20" /><div className="grid gap-4 md:grid-cols-3"><LoadingSkeleton className="h-36" /><LoadingSkeleton className="h-36" /><LoadingSkeleton className="h-36" /></div><LoadingSkeleton className="h-96" /></main>;
}
