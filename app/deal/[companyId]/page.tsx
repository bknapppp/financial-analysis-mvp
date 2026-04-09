import { notFound } from "next/navigation";
import { FinancialsView } from "@/components/financials-view";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function DealWorkspacePage({
  params
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const data = await getDashboardData(companyId);

  if (!data.company || data.company.id !== companyId) {
    notFound();
  }

  return <FinancialsView data={data} />;
}
