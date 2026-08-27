import {
  DirectOpenBBFundamentalsTransport,
  OpenBBFundamentalsProvider
} from "../lib/broadstone/providers/openbb-fundamentals-provider.ts";

const baseUrl = process.env.OPENBB_BASE_URL ?? "http://127.0.0.1:6900";
const symbols = (process.env.OPENBB_VERIFY_SYMBOLS ?? "AAPL,MSFT,CAT,KO,BA")
  .split(",")
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);

const provider = new OpenBBFundamentalsProvider(
  new DirectOpenBBFundamentalsTransport(baseUrl)
);

for (const symbol of symbols) {
  const response = await provider.getFundamentals({
    broadstoneCompanyId: `manual-${symbol.toLowerCase()}`,
    displayName: symbol,
    ticker: symbol,
    maxAnnualPeriods: 3
  });
  console.log(JSON.stringify({
    symbol,
    providerCode: provider.providerCode,
    rightsPolicy: response.data?.rightsPolicy ?? null,
    periods: response.data?.periods.map((period) => ({
      id: period.id,
      type: period.periodType,
      endDate: period.endDate
    })) ?? [],
    observations: response.data?.financialObservations.map((observation) => ({
      metricCode: observation.metricCode,
      periodId: observation.periodId,
      value: observation.value,
      currency: observation.unit.currencyCode,
      sourceSystem: observation.provenance[0].sourceSystem,
      underlyingSource: observation.provenance[0].underlyingSource
    })) ?? [],
    issues: response.issues
  }, null, 2));
}
