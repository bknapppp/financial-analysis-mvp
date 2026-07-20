import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export default function ProjectOverviewLoading() {
  return (
    <main className="bs-foundation min-h-screen bg-bs-page p-4 md:p-6" aria-label="Loading Project Overview">
      <div className="mx-auto max-w-bs-content space-y-4">
        <div className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
          <LoadingSkeleton lines={3} label="Loading transaction identity" />
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
              <LoadingSkeleton lines={6} label={`Loading overview section ${index + 1}`} />
            </div>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
              <LoadingSkeleton lines={5} label={`Loading phase summary ${index + 1}`} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
