import { getDashboardData } from "@/lib/data";
import { buildPlanningPageViewModel, buildPlanningPreviewViewModel, type PlanningPageViewModel } from "@/features/planning/planning-view-model";

export async function loadPlanningPageViewModel(companyId: string): Promise<PlanningPageViewModel | null> {
  if (companyId === "preview") return buildPlanningPreviewViewModel();
  const data = await getDashboardData(companyId);
  if (!data.company || data.company.id !== companyId) return null;
  return buildPlanningPageViewModel(data);
}
