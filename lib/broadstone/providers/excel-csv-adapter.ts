import { buildSnapshots } from "../../calculations.ts";
import type {
  AddBack,
  Company,
  FinancialEntry,
  ReportingPeriod
} from "../../types.ts";
import type {
  CanonicalFinancialObservation,
  CanonicalFinancialPeriod,
  CanonicalMonetaryUnit,
  CanonicalObservationConfidence,
  CanonicalPeriodType,
  DataProvenance,
  DataSourceLocation,
  MonetaryScale
} from "../canonical/index.ts";
import type {
  CanonicalFinancialDataset,
  CanonicalFinancialProvider
} from "./contracts.ts";

export type ExcelCsvSourceLocation = DataSourceLocation;

export type ExcelCsvPeriodHint = {
  startDate?: string;
  periodType?: Exclude<CanonicalPeriodType, "unknown">;
  fiscalYear?: number;
  fiscalQuarter?: 1 | 2 | 3 | 4;
};

export type ExcelCsvMonetaryContext = {
  currencyCode: string;
  scale: MonetaryScale;
  basis: "source" | "company_default";
};

export type ExcelCsvCanonicalAdapterInput = {
  company: Company;
  periods: ReportingPeriod[];
  entries: FinancialEntry[];
  addBacks?: AddBack[];
  source: {
    format: "excel" | "csv";
    sourceIdentifier: string;
    importedAt: string;
    fileName?: string;
    sheetName?: string;
    monetaryContext?: ExcelCsvMonetaryContext;
    entryLocations?: Readonly<Record<string, ExcelCsvSourceLocation>>;
    periodHints?: Readonly<Record<string, ExcelCsvPeriodHint>>;
  };
};

function translatePeriod(
  period: ReportingPeriod,
  hint?: ExcelCsvPeriodHint
): CanonicalFinancialPeriod {
  return {
    id: period.id,
    companyId: period.company_id,
    label: period.label,
    periodType: hint?.periodType ?? "unknown",
    startDate: hint?.startDate ?? null,
    endDate: period.period_date,
    fiscalYear: hint?.fiscalYear ?? null,
    fiscalQuarter: hint?.fiscalQuarter ?? null
  };
}

function confidenceForEntries(
  entries: FinancialEntry[]
): CanonicalObservationConfidence | undefined {
  const confidences = entries
    .map((entry) => entry.confidence)
    .filter((value): value is NonNullable<FinancialEntry["confidence"]> => Boolean(value));

  if (confidences.length === 0) return undefined;
  if (confidences.includes("low")) return "low";
  if (confidences.includes("medium")) return "medium";
  return "high";
}

function sourceEntriesForMetric(params: {
  entries: FinancialEntry[];
  periodId: string;
  category: "Revenue" | "EBITDA";
  selectedLabels: string[];
}) {
  const periodEntries = params.entries.filter(
    (entry) =>
      entry.period_id === params.periodId && entry.category === params.category
  );
  const selected = new Set(params.selectedLabels);
  const selectedEntries = periodEntries.filter((entry) => selected.has(entry.account_name));

  return selectedEntries.length > 0 ? selectedEntries : periodEntries;
}

function provenanceForEntries(params: {
  input: ExcelCsvCanonicalAdapterInput;
  period: ReportingPeriod;
  entries: FinancialEntry[];
}): readonly [DataProvenance, ...DataProvenance[]] {
  const sourceSystem = params.input.source.format === "excel" ? "Excel" : "CSV";
  const provenances = params.entries.map((entry) => {
    const entryLocation = params.input.source.entryLocations?.[entry.id];

    return {
      sourceType: "file_import" as const,
      sourceSystem,
      sourceIdentifier: params.input.source.sourceIdentifier,
      location: {
        ...(params.input.source.fileName
          ? { documentName: params.input.source.fileName }
          : {}),
        ...(params.input.source.sheetName
          ? { sheetName: params.input.source.sheetName }
          : {}),
        ...entryLocation,
        field: entryLocation?.field ?? entry.account_name
      },
      observedAt: params.input.source.importedAt,
      originalFieldName: entry.account_name,
      mapping:
        entry.matched_by || entry.mapping_explanation
          ? {
              mappingMethod: entry.matched_by ?? undefined,
              mappingExplanation: entry.mapping_explanation ?? undefined
            }
          : undefined,
      sourceMetadata: {
        sourceFormat: params.input.source.format,
        originalPeriodLabel: params.period.label,
        currencyBasis: params.input.source.monetaryContext!.basis
      }
    } satisfies DataProvenance;
  });

  const [first, ...rest] = provenances;
  if (!first) {
    throw new Error("Canonical provenance requires at least one mapped source entry.");
  }

  return [first, ...rest];
}

function observation(params: {
  input: ExcelCsvCanonicalAdapterInput;
  period: ReportingPeriod;
  metricCode: "revenue" | "reported_ebitda";
  value: number;
  entries: FinancialEntry[];
}): CanonicalFinancialObservation | null {
  const monetaryContext = params.input.source.monetaryContext;
  if (!monetaryContext || params.entries.length === 0) return null;

  const unit: CanonicalMonetaryUnit = {
    kind: "currency",
    currencyCode: monetaryContext.currencyCode,
    scale: monetaryContext.scale
  };

  return {
    id: `${params.input.source.sourceIdentifier}:${params.period.id}:${params.metricCode}`,
    companyId: params.input.company.id,
    periodId: params.period.id,
    metricCode: params.metricCode,
    value: params.value,
    unit,
    provenance: provenanceForEntries({
      input: params.input,
      period: params.period,
      entries: params.entries
    }),
    confidence: confidenceForEntries(params.entries)
  };
}

export class ExcelCsvCanonicalAdapter
  implements CanonicalFinancialProvider<ExcelCsvCanonicalAdapterInput>
{
  readonly providerCode = "broadstone_excel_csv";

  translate(input: ExcelCsvCanonicalAdapterInput): CanonicalFinancialDataset {
    const snapshots = buildSnapshots(
      input.periods,
      input.entries,
      input.addBacks ?? []
    );
    const observations: CanonicalFinancialObservation[] = [];

    for (const period of input.periods) {
      const snapshot = snapshots.find((candidate) => candidate.periodId === period.id);
      if (!snapshot || !input.source.monetaryContext) continue;

      if (snapshot.revenue !== null) {
        const translated = observation({
          input,
          period,
          metricCode: "revenue",
          value: snapshot.revenue,
          entries: sourceEntriesForMetric({
            entries: input.entries,
            periodId: period.id,
            category: "Revenue",
            selectedLabels: snapshot.incomeStatementDebug?.revenue.selectedLabels ?? []
          })
        });
        if (translated) observations.push(translated);
      }

      if (snapshot.reportedEbitda !== null && snapshot.reportedEbitda !== undefined) {
        const translated = observation({
          input,
          period,
          metricCode: "reported_ebitda",
          value: snapshot.reportedEbitda,
          entries: sourceEntriesForMetric({
            entries: input.entries,
            periodId: period.id,
            category: "EBITDA",
            selectedLabels: snapshot.incomeStatementDebug?.ebitda.selectedLabels ?? []
          })
        });
        if (translated) observations.push(translated);
      }
    }

    return {
      companies: [
        {
          id: input.company.id,
          displayName: input.company.name,
          companyType: "private"
        }
      ],
      periods: input.periods.map((period) =>
        translatePeriod(period, input.source.periodHints?.[period.id])
      ),
      observations,
      issues: input.source.monetaryContext
        ? []
        : [
            {
              code: "missing_monetary_unit",
              message:
                "Canonical monetary observations were omitted because currency and scale were not supplied."
            }
          ]
    };
  }
}
