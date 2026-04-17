"use client";

import { DealWorkspaceView } from "@/components/deal-workspace-view";
import type { DashboardData } from "@/lib/types";

type WorkspaceViewProps = {
  data: DashboardData;
};

export function OverviewView({ data }: WorkspaceViewProps) {
  return <DealWorkspaceView data={data} section="overview" />;
}

export function FinancialsView({ data }: WorkspaceViewProps) {
  return <DealWorkspaceView data={data} section="financials" />;
}

export function UnderwritingView({ data }: WorkspaceViewProps) {
  return <DealWorkspaceView data={data} section="underwriting" />;
}
