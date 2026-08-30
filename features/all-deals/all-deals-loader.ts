import { getDealScreenerRows } from "../../lib/data.ts";
import { buildAllDealsPageViewModel } from "./all-deals-view-model.ts";

export async function loadAllDealsPageViewModel() {
  return buildAllDealsPageViewModel(await getDealScreenerRows());
}
