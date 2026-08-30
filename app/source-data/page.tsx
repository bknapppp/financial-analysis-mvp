import { AppShell } from "@/components/layout/app-shell";
import { loadSourceDataPageViewModel } from "@/features/source-data/source-data-loader";
import {
  EmptySourceDataPage,
  SourceDataPage
} from "@/features/source-data/source-data-page";

export const revalidate = 60;

export default async function SourceDataRoute({
  searchParams
}: {
  searchParams?: Promise<{ companyId?: string }>;
}) {
  const { companyId } = (await searchParams) ?? {};
  const model = await loadSourceDataPageViewModel(companyId);

  if (!model || model.kind === "empty") {
    return (
      <EmptySourceDataPage
        model={
          model ?? {
            kind: "empty",
            title: "Source Data",
            description: "The selected deal is unavailable."
          }
        }
      />
    );
  }

  return (
    <AppShell model={model.shell}>
      <SourceDataPage model={model} />
    </AppShell>
  );
}
