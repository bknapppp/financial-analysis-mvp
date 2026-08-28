import { getDashboardData } from "@/lib/data";
import { getPhase4Workflow, getPhase5FindingProjection } from "@/services/supabase/phase4-workflow";
import { getReportingWorkflow } from "@/services/supabase/phase5-reporting";
import { buildReportingPageViewModel } from "@/features/reporting/reporting-view-model";

const SCHEMA_ERROR_CODES = new Set(["42P01", "PGRST205"]);

export type ReportingLoaderDependencies = {
  loadDashboard: typeof getDashboardData;
  loadPhase4: typeof getPhase4Workflow;
  loadProjection: typeof getPhase5FindingProjection;
  loadReporting: typeof getReportingWorkflow;
};

const defaultDependencies: ReportingLoaderDependencies = {
  loadDashboard: getDashboardData,
  loadPhase4: getPhase4Workflow,
  loadProjection: getPhase5FindingProjection,
  loadReporting: getReportingWorkflow
};

export async function loadReportingPage(
  companyId: string,
  dependencies: ReportingLoaderDependencies = defaultDependencies
) {
  const data = await dependencies.loadDashboard(companyId);
  if (!data.company || data.company.id !== companyId) return null;
  const [phase4, findings] = await Promise.all([
    dependencies.loadPhase4(companyId),
    dependencies.loadProjection(companyId)
  ]);
  try {
    const workflow = await dependencies.loadReporting(companyId);
    return buildReportingPageViewModel({
      data,
      workflow,
      phase4Complete: phase4?.phase.status === "complete",
      findings
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (!SCHEMA_ERROR_CODES.has(code)) throw error;
    return buildReportingPageViewModel({
      data,
      workflow: null,
      phase4Complete: phase4?.phase.status === "complete",
      findings,
      schemaUnavailable: true
    });
  }
}
