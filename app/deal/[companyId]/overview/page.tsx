import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { loadOverviewPageViewModel } from "@/features/overview/overview-loader";
import { OverviewPage } from "@/features/overview/overview-page";

export const revalidate = 60;

export default async function ProjectOverviewPage({
  params
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const model = await loadOverviewPageViewModel(companyId);

  if (!model) {
    notFound();
  }

  return (
    <AppShell model={model.shell}>
      <OverviewPage model={model} />
    </AppShell>
  );
}
