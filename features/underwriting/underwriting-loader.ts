import "server-only";
import { getDashboardData } from "@/lib/data";
import { buildUnderwritingPageViewModel } from "@/features/underwriting/underwriting-view-model";

export async function loadUnderwritingPageViewModel(companyId?: string) {
  const data = await getDashboardData(companyId);
  if (companyId && data.company?.id !== companyId) return null;
  return buildUnderwritingPageViewModel(data);
}
