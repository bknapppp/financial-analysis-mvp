import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

export default function FinancialsLoading() {
  return <main className="mx-auto max-w-bs-content space-y-4 px-4 py-6 md:px-6"><LoadingSkeleton lines={2} label="Loading Financials header" /><div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <div key={index} className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4"><LoadingSkeleton lines={3} /></div>)}</div><div className="grid gap-4 xl:grid-cols-2">{Array.from({ length: 2 }, (_, index) => <div key={index} className="rounded-bs-md border border-bs-border-subtle bg-bs-surface p-4"><LoadingSkeleton lines={8} /></div>)}</div></main>;
}
