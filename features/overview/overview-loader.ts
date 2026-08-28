import { getDashboardData } from "@/lib/data";
import {
  buildOverviewPageViewModel,
  type OverviewPageViewModel,
  type OverviewReportingState
} from "@/features/overview/overview-view-model";
import { getReportingWorkflow } from "@/services/supabase/phase5-reporting";

function isReportingSchemaUnavailable(error: unknown) {
  const candidate = error as { code?: string };
  return candidate?.code === "42P01" || candidate?.code === "PGRST205";
}

export async function loadOverviewPageViewModel(
  companyId: string
): Promise<OverviewPageViewModel | null> {
  const data = await getDashboardData(companyId);

  if (!data.company || data.company.id !== companyId) {
    return null;
  }

  let reporting: OverviewReportingState = { mode: "uninitialized" };
  try {
    const workflow = await getReportingWorkflow(companyId);
    if (workflow?.report) {
      reporting = {
        mode: "persisted",
        phaseStatus: String(workflow.phase.status),
        completeSections: workflow.sections.filter((section) => section.status === "complete").length,
        totalSections: workflow.sections.length
      };
    }
  } catch (error) {
    if (!isReportingSchemaUnavailable(error)) throw error;
    reporting = { mode: "schema_unavailable" };
  }

  return buildOverviewPageViewModel(data, reporting);
}
