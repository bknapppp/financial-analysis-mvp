import type { Company } from "../types.ts";

export type ShellIconKey =
  | "overview"
  | "phases"
  | "planning"
  | "requests"
  | "analysis"
  | "findings"
  | "reporting"
  | "close"
  | "documents"
  | "tasks"
  | "issues"
  | "workpapers"
  | "reports"
  | "analytics"
  | "team"
  | "qa"
  | "settings";

export type ShellNavigationItem = {
  key: string;
  label: string;
  icon: ShellIconKey;
  href?: string;
  implemented: boolean;
  children?: ShellNavigationItem[];
};

export type DealShellViewModel = {
  topHeaderTitle?: string;
  companyId: string;
  dealName: string;
  companyName: string;
  dealType: string;
  targetCloseLabel: string;
  progressPercent: number;
  progressLabel: string;
  progressIsPreview: boolean;
  activeKey: string;
  activeLabel: string;
  navigation: ShellNavigationItem[];
  projectOverviewHref: string;
  legacyDealHref: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
  user: {
    name: string;
    role: string;
    initials: string;
    isPreview: boolean;
  };
};

function previewHref(companyId: string, section: string) {
  return `/deal/${companyId}/redesign-preview?section=${section}`;
}

function buildNavigation(companyId: string): ShellNavigationItem[] {
  const previewItem = (
    key: string,
    label: string,
    icon: ShellIconKey
  ): ShellNavigationItem => ({
    key,
    label,
    icon,
    href: previewHref(companyId, key),
    implemented: false
  });

  return [
    {
      key: "overview",
      label: "Overview",
      icon: "overview",
      href: `/deal/${companyId}/overview`,
      implemented: true
    },
    {
      key: "financials",
      label: "Financials",
      icon: "analytics",
      href: `/financials?companyId=${companyId}`,
      implemented: true
    },
    {
      key: "underwriting",
      label: "Underwriting",
      icon: "analysis",
      href: `/deal/${companyId}/underwriting`,
      implemented: true
    },
    {
      key: "source-data",
      label: "Source Data",
      icon: "documents",
      href: `/source-data?companyId=${companyId}`,
      implemented: true
    },
    {
      key: "phases",
      label: "Phases",
      icon: "phases",
      implemented: false,
      children: [
        {
          key: "planning",
          label: "1. Planning & Scoping",
          icon: "planning",
          href: `/deal/${companyId}/phases/planning`,
          implemented: true
        },
        {
          key: "information-request",
          label: "2. Information Request",
          icon: "requests",
          href: `/deal/${companyId}/phases/information-request`,
          implemented: true
        },
        {
          key: "data-review",
          label: "3. Data Review & Analysis",
          icon: "analysis",
          href: `/deal/${companyId}/phases/data-review`,
          implemented: true
        },
        { key:"findings", label:"4. Findings & Issues", icon:"findings", href:`/deal/${companyId}/phases/findings`, implemented:true },
        {
          key: "reporting",
          label: "5. Reporting",
          icon: "reporting",
          href: `/deal/${companyId}/phases/reporting`,
          implemented: true
        },
        previewItem("close", "6. Close & Handover", "close")
      ]
    },
    previewItem("documents", "Documents", "documents"),
    previewItem("requests", "Requests", "requests"),
    previewItem("tasks", "Tasks", "tasks"),
    previewItem("issues", "Issues", "issues"),
    previewItem("workpapers", "Workpapers", "workpapers"),
    previewItem("reports", "Reports", "reports"),
    previewItem("analytics", "Analytics", "analytics"),
    previewItem("team", "Team", "team"),
    previewItem("qa", "Q&A", "qa"),
    previewItem("settings", "Settings", "settings")
  ];
}

function findNavigationLabel(items: ShellNavigationItem[], key: string): string | null {
  for (const item of items) {
    if (item.key === key) {
      return item.label;
    }

    const childLabel = item.children
      ? findNavigationLabel(item.children, key)
      : null;

    if (childLabel) {
      return childLabel.replace(/^\d+\.\s*/, "");
    }
  }

  return null;
}

export function buildDealShellViewModel(params: {
  company: Company;
  requestedSection?: string;
  context?: "preview" | "overview" | "financials" | "planning" | "information-request" | "data-review" | "findings" | "reporting";
  progressPercent?: number;
  progressLabel?: string;
  progressIsPreview?: boolean;
}): DealShellViewModel {
  const { company } = params;
  const navigation = buildNavigation(company.id);
  const requestedSection = params.requestedSection ?? "overview";
  const activeLabel = findNavigationLabel(navigation, requestedSection);
  const activeKey = activeLabel ? requestedSection : "overview";
  const resolvedActiveLabel = activeLabel ?? "Overview";

  const context = params.context ?? "preview";
  const dealName = company.deal_name?.trim() || company.name;
  const breadcrumbs = context === "overview"
    ? [
        { label: "All Deals", href: "/deals" },
        { label: dealName },
        { label: "Project Overview" }
      ]
    : context === "financials"
      ? [
          { label: "All Deals", href: "/deals" },
          { label: dealName },
          { label: "Financials" }
        ]
    : context === "planning"
      ? [
          { label: "All Deals", href: "/deals" },
          { label: dealName },
          { label: "Phases" },
          { label: "Planning & Scoping" }
        ]
    : context === "information-request"
      ? [
          { label: "All Deals", href: "/deals" },
          { label: dealName },
          { label: "Phases" },
          { label: "Information Request & Data Collection" }
        ]
    : context === "data-review"
      ? [
          { label: "All Deals", href: "/deals" },
          { label: dealName },
          { label: "Phases" },
          { label: "Data Review & Analysis" }
        ]
    : context === "reporting"
      ? [
          { label: "All Deals", href: "/deals" },
          { label: dealName },
          { label: "Phases" },
          { label: "Reporting" }
        ]
    : [
        { label: "All Deals", href: "/deals" },
        { label: dealName },
        { label: "Redesign Preview" },
        { label: resolvedActiveLabel }
      ];

  return {
    topHeaderTitle: context === "overview" ? "Project Overview" : context === "financials" ? "Financials" : undefined,
    companyId: company.id,
    dealName,
    companyName: company.name,
    dealType: company.deal_type?.trim() || "Not configured",
    targetCloseLabel: "Not configured",
    progressPercent: params.progressPercent ?? 52,
    progressLabel: params.progressLabel ?? "Overall progress",
    progressIsPreview: params.progressIsPreview ?? true,
    activeKey,
    activeLabel: resolvedActiveLabel,
    navigation,
    projectOverviewHref: `/deal/${company.id}/overview`,
    legacyDealHref: `/deal/${company.id}`,
    breadcrumbs,
    user: {
      name: "Preview User",
      role: "Analyst (preview)",
      initials: "PU",
      isPreview: true
    }
  };
}
