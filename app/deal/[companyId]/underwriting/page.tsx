import { notFound } from "next/navigation";
import { UnderwritingView } from "@/components/financials-view";
import { getDashboardData } from "@/lib/data";

export const revalidate = 60;

export default async function DealUnderwritingPage({
  params
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const data = await getDashboardData(companyId);

  if (!data.company || data.company.id !== companyId) {
    notFound();
  }

  return <UnderwritingView data={data} />;
}
