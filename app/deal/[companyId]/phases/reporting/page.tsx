import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { ReportingPage } from "@/features/reporting/reporting-page";
import { loadReportingPage } from "@/features/reporting/reporting-loader";

export const revalidate = 60;

export default async function ReportingRoute({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const model = await loadReportingPage(companyId);
  if (!model) notFound();
  return <AppShell model={model.shell}><ReportingPage model={model} /></AppShell>;
}
