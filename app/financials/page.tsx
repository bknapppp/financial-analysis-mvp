import { FinancialsView } from "@/components/financials-view";
import { getDashboardData } from "@/lib/data";

export const revalidate = 60;

export default async function FinancialsPage({
  searchParams
}: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const data = await getDashboardData(resolvedSearchParams.companyId);

  return <FinancialsView data={data} />;
}
