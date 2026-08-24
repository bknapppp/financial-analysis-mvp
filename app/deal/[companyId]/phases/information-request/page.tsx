import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { InformationRequestPage } from "@/features/information-request/information-request-page";
import { loadInformationRequestPageViewModel } from "@/features/information-request/information-request-loader";

export const revalidate = 60;
export default async function InformationRequestRoute({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const model = await loadInformationRequestPageViewModel(companyId);
  if (!model) notFound();
  return <AppShell model={model.shell}><InformationRequestPage model={model} /></AppShell>;
}
