import Link from "next/link";
import { CompanySetupForm } from "@/components/company-setup-form";
import { CsvImportSection } from "@/components/csv-import-section";
import { EntryForm } from "@/components/entry-form";
import { PeriodForm } from "@/components/period-form";
import { getDashboardData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function SourceDataPage() {
  const data = await getDashboardData();

  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">
        <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-6 shadow-panel md:px-8">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">
                {data.company?.name || "No company selected"} •{" "}
                {data.snapshot.label || "No reporting period loaded"}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
                Source Data
              </h1>
              <p className="mt-3 text-sm text-slate-600 md:text-base">
                Complete company setup, upload financial data, and handle targeted manual adjustments outside the main review workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to Adjusted EBITDA Review
              </Link>
              <Link
                href="/financials"
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View Financials
              </Link>
            </div>
          </div>
        </section>

        <section>
          <CsvImportSection
            companies={data.companies}
            initialCompanyId={data.company?.id ?? null}
            initialPeriods={data.periods}
            companySetupSlot={<CompanySetupForm />}
            advancedToolsSlot={
              <div className="space-y-4">
                <details className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                    Manual period tools
                  </summary>
                  <p className="mt-2 text-sm text-slate-500">
                    Use these only when the uploaded source is missing period structure or needs a targeted manual adjustment.
                  </p>
                  <div className="mt-4">
                    <PeriodForm companyId={data.company?.id ?? null} />
                  </div>
                </details>

                <details className="rounded-[1.5rem] border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
                    Manual entry fallback
                  </summary>
                  <p className="mt-2 text-sm text-slate-500">
                    Use manual line-by-line entry only when the uploaded source needs a targeted adjustment or a small missing line item.
                  </p>
                  <div className="mt-4">
                    <EntryForm companyId={data.company?.id ?? null} periods={data.periods} />
                  </div>
                </details>
              </div>
            }
          />
        </section>
      </div>
    </main>
  );
}
