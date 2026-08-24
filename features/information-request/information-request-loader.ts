import { getDashboardData } from "@/lib/data";
import { buildInformationRequestPageViewModel, buildInformationRequestPreviewViewModel } from "@/features/information-request/information-request-view-model";

export async function loadInformationRequestPageViewModel(companyId: string) {
  if (companyId === "preview") return buildInformationRequestPreviewViewModel();
  const data = await getDashboardData(companyId);
  if (!data.company || data.company.id !== companyId) return null;
  return buildInformationRequestPageViewModel(data);
}

