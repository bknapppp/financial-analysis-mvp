import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { PlanningPage } from "@/features/planning/planning-page";
import { loadPlanningPageViewModel } from "@/features/planning/planning-loader";

export const revalidate = 60;

export default async function PlanningPhaseRoute({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const model = await loadPlanningPageViewModel(companyId);
  if (!model) notFound();
  return <AppShell model={model.shell}><PlanningPage model={model} /></AppShell>;
}
