export type BenchmarkMetricKey =
  | "ebitdaMarginPercent"
  | "revenueGrowthPercent"
  | "evToEbitda"
  | "debtToEbitda";

export type BenchmarkIndustryKey = "manufacturing" | "services" | "tech";

export type IndustryBenchmarkMedian = {
  industryKey: BenchmarkIndustryKey;
  industryLabel: string;
  medians: Record<BenchmarkMetricKey, number | null>;
};

export const INDUSTRY_BENCHMARK_MEDIANS: Record<
  BenchmarkIndustryKey,
  IndustryBenchmarkMedian
> = {
  manufacturing: {
    industryKey: "manufacturing",
    industryLabel: "Manufacturing",
    medians: {
      ebitdaMarginPercent: 14,
      revenueGrowthPercent: 8,
      evToEbitda: 5.6,
      debtToEbitda: 3.1
    }
  },
  services: {
    industryKey: "services",
    industryLabel: "Services",
    medians: {
      ebitdaMarginPercent: 18,
      revenueGrowthPercent: 10,
      evToEbitda: 6.2,
      debtToEbitda: 3.4
    }
  },
  tech: {
    industryKey: "tech",
    industryLabel: "Tech",
    medians: {
      ebitdaMarginPercent: 22,
      revenueGrowthPercent: 18,
      evToEbitda: 8.5,
      debtToEbitda: 2.8
    }
  }
};

const INDUSTRY_ALIASES: Record<string, BenchmarkIndustryKey> = {
  manufacturing: "manufacturing",
  manufacturer: "manufacturing",
  industrial: "manufacturing",
  industrials: "manufacturing",
  distribution: "manufacturing",
  services: "services",
  service: "services",
  "business services": "services",
  professional: "services",
  "professional services": "services",
  tech: "tech",
  technology: "tech",
  software: "tech",
  saas: "tech",
  "information technology": "tech"
};

function normalizeIndustryName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function resolveBenchmarkIndustry(
  industry: string | null | undefined
): IndustryBenchmarkMedian | null {
  if (!industry) {
    return null;
  }

  const normalizedIndustry = normalizeIndustryName(industry);
  const directMatch = INDUSTRY_ALIASES[normalizedIndustry];

  if (directMatch) {
    return INDUSTRY_BENCHMARK_MEDIANS[directMatch];
  }

  const fuzzyMatch = Object.entries(INDUSTRY_ALIASES).find(([alias]) =>
    normalizedIndustry.includes(alias)
  )?.[1];

  return fuzzyMatch ? INDUSTRY_BENCHMARK_MEDIANS[fuzzyMatch] : null;
}
