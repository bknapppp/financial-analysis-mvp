import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export default function RedesignPreviewLoading() {
  return (
    <main className="bs-foundation min-h-screen bg-bs-page p-6" aria-label="Loading Broadstone shell preview">
      <div className="mx-auto max-w-bs-content space-y-4">
        <div className="h-12 rounded-bs-md border border-bs-border-subtle bg-bs-surface" />
        <div className="grid gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
          <div className="hidden min-h-[36rem] rounded-bs-md bg-bs-sidebar lg:block" />
          <div className="space-y-4">
            <div className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
              <LoadingSkeleton lines={4} label="Loading preview header" />
            </div>
            <div className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4">
              <LoadingSkeleton lines={8} label="Loading preview content" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
