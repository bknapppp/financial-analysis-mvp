import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { FinancialsPage as FinancialsFeaturePage } from "@/features/financials/financials-page";
import { loadFinancialsPageViewModel } from "@/features/financials/financials-loader";

export const revalidate = 60;

export default async function FinancialsPage({
  searchParams
}: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const model = await loadFinancialsPageViewModel(resolvedSearchParams.companyId);
  if (!model) notFound();

  return <AppShell model={model.shell}><FinancialsFeaturePage model={model} /></AppShell>;
}
