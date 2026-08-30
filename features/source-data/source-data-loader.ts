import "server-only";
import { getDashboardData } from "@/lib/data";
import { buildSourceDataPageViewModel } from "@/features/source-data/source-data-view-model";

export async function loadSourceDataPageViewModel(companyId?: string) {
  const data = await getDashboardData(companyId);
  if (companyId && data.company?.id !== companyId) return null;
  return buildSourceDataPageViewModel(data);
}
