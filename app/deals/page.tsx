import { DealsScreenerTable } from "@/components/deals-screener-table";
import { getDealScreenerRows } from "@/lib/data";

export const revalidate = 60;

export default async function DealsPage() {
  const rows = await getDealScreenerRows();

  return (
    <main className="min-h-screen px-4 py-6 md:px-6 md:py-6">
      <div className="mx-auto max-w-7xl">
        <DealsScreenerTable rows={rows} />
      </div>
    </main>
  );
}
