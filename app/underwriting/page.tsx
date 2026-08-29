import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { UnderwritingPage } from "@/features/underwriting/underwriting-page";
import { loadUnderwritingPageViewModel } from "@/features/underwriting/underwriting-loader";

export const revalidate = 60;

export default async function UnderwritingRoute({
  searchParams
}: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  const { companyId } = (await searchParams) ?? {};
  const model = await loadUnderwritingPageViewModel(companyId);
  if (!model) notFound();

  return <AppShell model={model.shell}><UnderwritingPage model={model} /></AppShell>;
}
