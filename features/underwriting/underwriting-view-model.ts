import { buildEbitdaChain } from "../../lib/underwriting/ebitda.ts";
import { buildDealShellViewModel, type DealShellViewModel } from "../../lib/view-models/deal-shell.ts";
import type { DashboardData } from "../../lib/types.ts";

export type UnderwritingPageViewModel = {
  companyId: string;
  companyName: string;
  currency: string;
  defaultPeriodId: string;
  defaultPeriodLabel: string;
  readiness: DashboardData["readiness"];
  shell: DealShellViewModel;
  keyValues: {
    canonicalEbitda: number | null;
    acceptedAddBacks: number;
    adjustedEbitda: number | null;
  };
  workspaceData: DashboardData;
};

export function buildUnderwritingPageViewModel(data: DashboardData): UnderwritingPageViewModel | null {
  if (!data.company) return null;
  const bridge = data.normalizedOutput?.bridge ?? data.ebitdaBridge;
  const canonicalEbitda = bridge?.canonicalEbitda ?? data.snapshot.ebitda ?? data.snapshot.reportedEbitda ?? null;
  const acceptedAddBacks = bridge?.addBackTotal ?? data.snapshot.acceptedAddBacks ?? 0;
  const chain = buildEbitdaChain({ canonicalEbitda, acceptedAddbacks: acceptedAddBacks });

  return {
    companyId: data.company.id,
    companyName: data.company.name,
    currency: data.company.base_currency,
    defaultPeriodId: data.snapshot.periodId,
    defaultPeriodLabel: data.snapshot.label,
    readiness: data.readiness,
    shell: buildDealShellViewModel({
      company: data.company,
      requestedSection: "underwriting",
      context: "underwriting",
      progressPercent: data.completionSummary.completionPercent,
      progressLabel: "Underwriting readiness",
      progressIsPreview: false
    }),
    keyValues: {
      canonicalEbitda: chain.canonicalEbitda,
      acceptedAddBacks: chain.acceptedAddbacks,
      adjustedEbitda: chain.adjustedEbitda
    },
    workspaceData: data
  };
}
