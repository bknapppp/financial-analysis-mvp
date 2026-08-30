import type { DealScreenerRow } from "../../lib/data.ts";

export type AllDealsPageViewModel = {
  title: "All Deals";
  description: string;
  state: "populated" | "empty";
  rows: DealScreenerRow[];
  summary: {
    totalDeals: number;
    activeDeals: number;
    blockedDeals: number;
    readyDeals: number;
  };
  companyXAvailable: boolean;
};

export function getDealOverviewHref(companyId: string) {
  return `/deal/${companyId}/overview`;
}

export function buildAllDealsPageViewModel(
  rows: DealScreenerRow[]
): AllDealsPageViewModel {
  return {
    title: "All Deals",
    description:
      "Monitor transaction readiness, key blockers, and the next action across the active portfolio.",
    state: rows.length > 0 ? "populated" : "empty",
    rows,
    summary: {
      totalDeals: rows.length,
      activeDeals: rows.filter((row) => row.isActiveStage).length,
      blockedDeals: rows.filter(
        (row) =>
          row.criticalIssueCount > 0 ||
          row.diligenceReadinessLabel === "Not Ready"
      ).length,
      readyDeals: rows.filter(
        (row) =>
          row.status === "Ready for structure" ||
          row.status === "Ready for output"
      ).length
    },
    companyXAvailable: rows.some((row) => row.companyName === "Company X")
  };
}
