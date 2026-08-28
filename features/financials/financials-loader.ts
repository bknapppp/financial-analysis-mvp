import "server-only";
import { getDashboardData } from "@/lib/data";
import { buildFinancialsPageViewModel } from "@/features/financials/financials-view-model";

export async function loadFinancialsPageViewModel(companyId?: string) {
  const data = await getDashboardData(companyId);
  if (companyId && data.company?.id !== companyId) return null;
  return buildFinancialsPageViewModel(data);
}
