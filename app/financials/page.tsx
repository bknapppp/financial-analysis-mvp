import { FinancialsView } from "@/components/financials-view";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function FinancialsPage() {
  const data = await getDashboardData();

  return <FinancialsView data={data} />;
}
