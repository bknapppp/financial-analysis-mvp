import { getDashboardData } from "@/lib/data";
import {
  buildOverviewPageViewModel,
  type OverviewPageViewModel
} from "@/features/overview/overview-view-model";

export async function loadOverviewPageViewModel(
  companyId: string
): Promise<OverviewPageViewModel | null> {
  const data = await getDashboardData(companyId);

  if (!data.company || data.company.id !== companyId) {
    return null;
  }

  return buildOverviewPageViewModel(data);
}
