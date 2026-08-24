import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { DataReviewPage } from "@/features/data-review/data-review-page";
import { loadDataReviewPageViewModel } from "@/features/data-review/data-review-loader";

export const revalidate = 60;

export default async function DataReviewRoute({
  params
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  const model = await loadDataReviewPageViewModel(companyId);
  if (!model) notFound();
  return <AppShell model={model.shell}><DataReviewPage model={model} /></AppShell>;
}
