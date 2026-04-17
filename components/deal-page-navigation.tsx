import Link from "next/link";

type DealSection = "Overview" | "Financials" | "Underwriting" | "Source Data";

type DealPageNavigationProps = {
  companyName: string;
  currentSection: DealSection;
  allDealsHref: string;
  overviewHref: string;
  financialsHref: string;
  underwritingHref: string;
  sourceDataHref: string;
};

export function DealPageNavigation({
  companyName,
  currentSection,
  allDealsHref,
  overviewHref,
  financialsHref,
  underwritingHref,
  sourceDataHref
}: DealPageNavigationProps) {
  const sectionLinks: Array<{ label: DealSection; href: string }> = [
    { label: "Overview", href: overviewHref },
    { label: "Financials", href: financialsHref },
    { label: "Underwriting", href: underwritingHref },
    { label: "Source Data", href: sourceDataHref }
  ];

  return (
    <div className="mb-4 flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link href={allDealsHref} className="hover:text-slate-700">
          All Deals
        </Link>
        <span aria-hidden="true">&gt;</span>
        <span className="text-slate-700">{companyName}</span>
        <span aria-hidden="true">&gt;</span>
        <span className="font-medium text-slate-950">{currentSection}</span>
      </nav>

      <div className="flex flex-wrap gap-3">
        <Link
          href={allDealsHref}
          className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          All Deals
        </Link>

        {sectionLinks.map((section) => {
          const isCurrent = currentSection === section.label;

          return (
            <Link
              key={section.label}
              href={section.href}
              aria-current={isCurrent ? "page" : undefined}
              className={`rounded-xl border px-4 py-2.5 text-sm font-medium ${
                isCurrent
                  ? "border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}


