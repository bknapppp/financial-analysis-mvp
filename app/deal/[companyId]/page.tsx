import { redirect } from "next/navigation";

export default async function DealWorkspacePage({
  params
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;
  redirect(`/deal/${companyId}/overview`);
}
