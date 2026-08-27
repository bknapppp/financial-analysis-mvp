import type {
  CanonicalCompany,
  CanonicalFinancialObservation,
  CanonicalFinancialPeriod
} from "../canonical/index.ts";

export type CanonicalTranslationIssue = {
  code: "missing_monetary_unit" | "unsupported_metric";
  message: string;
  periodId?: string;
};

export type CanonicalFinancialDataset = {
  companies: CanonicalCompany[];
  periods: CanonicalFinancialPeriod[];
  observations: CanonicalFinancialObservation[];
  issues: CanonicalTranslationIssue[];
};

export interface CanonicalFinancialProvider<TInput> {
  readonly providerCode: string;
  translate(input: TInput): CanonicalFinancialDataset;
}
