import { FinancialsView } from "@/components/financials-view";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getDashboardData();

  return <FinancialsView data={data} />;
}
