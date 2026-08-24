import { getDashboardData } from "@/lib/data";
import {
  buildDataReviewPageViewModel,
  buildDataReviewPreviewViewModel
} from "@/features/data-review/data-review-view-model";

export async function loadDataReviewPageViewModel(companyId: string) {
  if (companyId === "preview") return buildDataReviewPreviewViewModel();
  const data = await getDashboardData(companyId);
  if (!data.company || data.company.id !== companyId) return null;
  return buildDataReviewPageViewModel(data);
}
