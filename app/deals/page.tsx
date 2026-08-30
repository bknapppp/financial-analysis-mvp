import { AllDealsPage } from "@/features/all-deals/all-deals-page";
import { loadAllDealsPageViewModel } from "@/features/all-deals/all-deals-loader";

export const revalidate = 60;

export default async function DealsPage() {
  const model = await loadAllDealsPageViewModel();

  return <AllDealsPage model={model} />;
}
