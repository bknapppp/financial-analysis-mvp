import { getDashboardData } from "@/lib/data";
import {
  buildDataReviewPageViewModel,
  buildDataReviewPreviewViewModel
} from "@/features/data-review/data-review-view-model";
import { buildDurableDataReviewPageViewModel } from "@/features/data-review/durable-data-review-view-model";
import { getPhase3Workflow } from "@/services/supabase/phase3-workflow";

export async function loadDataReviewPageViewModel(companyId: string) {
  if (companyId === "preview") return { kind: "preview" as const, model: buildDataReviewPreviewViewModel() };
  const data = await getDashboardData(companyId);
  if (!data.company || data.company.id !== companyId) return null;
  try {
    const workflow = await getPhase3Workflow(companyId);
    return { kind: "real" as const, model: buildDurableDataReviewPageViewModel(data, workflow) };
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "42P01" || code === "PGRST205") {
      return { kind: "real" as const, model: buildDurableDataReviewPageViewModel(data, null, "schema_unavailable") };
    }
    throw error;
  }
}
