import assert from "node:assert/strict";
import type { CanonicalFinancialObservation } from "../canonical/index.ts";
import type {
  PublicCompanyData,
  PublicCompanyDataRequest,
  PublicCompanyMatch,
  PublicMarketProvider,
  PublicProviderResponse
} from "./public-market-contracts.ts";
import {
  DirectSecPublicDataTransport,
  SecPublicMarketProvider,
  type SecPublicDataTransport
} from "./sec-public-market-provider.ts";

const retrievedAt = new Date("2026-08-26T14:00:00.000Z");
const tickers = {
  0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  1: { cik_str: 789019, ticker: "MSFT", title: "Microsoft Corporation" }
};

function annualFact(params: {
  value: number;
  accession: string;
  fiscalYear: number;
  start?: string;
  end: string;
}) {
  return {
    val: params.value,
    accn: params.accession,
    fy: params.fiscalYear,
    fp: "FY",
    form: "10-K",
    filed: `${params.fiscalYear + 1}-01-31`,
    ...(params.start ? { start: params.start } : {}),
    end: params.end,
    frame: `CY${params.fiscalYear}`
  };
}

function companyFacts(params: {
  cik: number;
  name: string;
  revenue: number;
  operatingIncome: number;
  netIncome: number;
  shares: number;
}) {
  const accession = `${params.cik}-25-000001`;
  const duration = {
    accession,
    fiscalYear: 2025,
    start: "2025-01-01",
    end: "2025-12-31"
  };
  return {
    cik: params.cik,
    entityName: params.name,
    facts: {
      "us-gaap": {
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: { USD: [annualFact({ value: params.revenue, ...duration })] }
        },
        OperatingIncomeLoss: {
          units: { USD: [annualFact({ value: params.operatingIncome, ...duration })] }
        },
        NetIncomeLoss: {
          units: { USD: [annualFact({ value: params.netIncome, ...duration })] }
        }
      },
      dei: {
        EntityCommonStockSharesOutstanding: {
          units: {
            shares: [
              annualFact({
                value: params.shares,
                accession,
                fiscalYear: 2025,
                end: "2025-12-31"
              })
            ]
          }
        }
      }
    }
  };
}

const factsByCik: Record<string, unknown> = {
  "0000320193": companyFacts({
    cik: 320193,
    name: "Apple Inc.",
    revenue: 400_000_000_000,
    operatingIncome: 125_000_000_000,
    netIncome: 100_000_000_000,
    shares: 15_000_000_000
  }),
  "0000789019": companyFacts({
    cik: 789019,
    name: "Microsoft Corporation",
    revenue: 250_000_000_000,
    operatingIncome: 110_000_000_000,
    netIncome: 90_000_000_000,
    shares: 7_500_000_000
  })
};

class FixtureSecTransport implements SecPublicDataTransport {
  getCompanyTickers() {
    return Promise.resolve(tickers);
  }
  getCompanyFacts(cik: string) {
    return Promise.resolve(factsByCik[cik.padStart(10, "0")]);
  }
}

const provider = new SecPublicMarketProvider(new FixtureSecTransport(), () => retrievedAt);

for (const fixture of [
  { ticker: "AAPL", cik: "320193", companyId: "public-apple", revenue: 400_000_000_000 },
  { ticker: "MSFT", cik: "789019", companyId: "public-microsoft", revenue: 250_000_000_000 }
]) {
  const lookup = await provider.lookupCompany(fixture.ticker.toLowerCase());
  assert.equal(lookup.issues.length, 0);
  assert.equal(lookup.data?.externalIdentifiers[0]?.value, fixture.ticker);
  assert.equal(lookup.data?.provenance.sourceSystem, "Broadstone SEC Direct");
  assert.equal(lookup.data?.provenance.underlyingSource, "SEC EDGAR");

  const result = await provider.getCompanyData({
    broadstoneCompanyId: fixture.companyId,
    cik: fixture.cik,
    ticker: fixture.ticker
  });
  assert.ok(result.data);
  assert.equal(result.data.company.id, fixture.companyId);
  assert.equal(result.data.company.companyType, "public");
  assert.equal(result.data.periods[0]?.periodType, "annual");
  assert.equal(result.data.periods[0]?.startDate, "2025-01-01");
  assert.equal(result.data.periods[0]?.endDate, "2025-12-31");

  const revenue = result.data.financialObservations.find(
    (observation) => observation.metricCode === "revenue"
  );
  assert.equal(revenue?.value, fixture.revenue);
  assert.deepEqual(revenue?.unit, {
    kind: "currency",
    currencyCode: "USD",
    scale: "ones"
  });
  assert.equal(revenue?.provenance[0].sourceSystem, "Broadstone SEC Direct");
  assert.equal(revenue?.provenance[0].underlyingSource, "SEC EDGAR");
  assert.equal(
    revenue?.provenance[0].originalFieldName,
    "RevenueFromContractWithCustomerExcludingAssessedTax"
  );
  assert.equal(revenue?.provenance[0].sourceMetadata?.ticker, fixture.ticker);
  assert.equal(revenue?.provenance[0].observedAt, retrievedAt.toISOString());
  assert.ok(
    result.data.financialObservations.some(
      (observation) => observation.metricCode === "operating_income"
    )
  );
  assert.ok(
    result.data.financialObservations.some(
      (observation) => observation.metricCode === "net_income"
    )
  );
  assert.equal(result.data.marketObservations[0]?.metricCode, "shares_outstanding");
  assert.ok(
    result.issues.some(
      (item) => item.code === "metric_unavailable" && item.metricCode === "reported_ebitda"
    )
  );
  assert.equal(
    result.data.financialObservations.some(
      (observation) => observation.metricCode === "reported_ebitda"
    ),
    false
  );
}

const missingCompany = await provider.lookupCompany("NOTREAL");
assert.equal(missingCompany.data, null);
assert.equal(missingCompany.issues[0]?.code, "company_not_found");

const missingMetrics = await new SecPublicMarketProvider(
  {
    getCompanyTickers: () => Promise.resolve(tickers),
    getCompanyFacts: () =>
      Promise.resolve({ cik: 320193, entityName: "Apple Inc.", facts: { "us-gaap": {}, dei: {} } })
  },
  () => retrievedAt
).getCompanyData({ broadstoneCompanyId: "public-apple", cik: "320193", ticker: "AAPL" });
assert.ok(missingMetrics.data);
assert.deepEqual(missingMetrics.data.financialObservations, []);
assert.deepEqual(missingMetrics.data.marketObservations, []);
assert.ok(missingMetrics.issues.some((item) => item.code === "period_unavailable"));
assert.ok(missingMetrics.issues.some((item) => item.metricCode === "revenue"));

const malformed = await new SecPublicMarketProvider(
  {
    getCompanyTickers: () => Promise.resolve([]),
    getCompanyFacts: () => Promise.resolve({ invalid: true })
  },
  () => retrievedAt
).getCompanyData({ broadstoneCompanyId: "malformed", cik: "1" });
assert.equal(malformed.data, null);
assert.equal(malformed.issues[0]?.code, "malformed_response");

async function responseForStatus(status: number) {
  const transport = new DirectSecPublicDataTransport(
    "Broadstone prototype test@example.com",
    (async () => new Response("{}", { status })) as typeof fetch
  );
  return new SecPublicMarketProvider(transport, () => retrievedAt).lookupCompany("AAPL");
}

assert.equal((await responseForStatus(429)).issues[0]?.code, "rate_limited");
assert.equal((await responseForStatus(403)).issues[0]?.code, "authentication_failed");
assert.equal((await responseForStatus(404)).issues[0]?.code, "company_not_found");

const unavailableTransport = new DirectSecPublicDataTransport(
  "Broadstone prototype test@example.com",
  (async () => {
    throw new Error("network unavailable");
  }) as typeof fetch
);
const unavailable = await new SecPublicMarketProvider(
  unavailableTransport,
  () => retrievedAt
).lookupCompany("AAPL");
assert.equal(unavailable.issues[0]?.code, "provider_unavailable");
assert.equal(unavailable.issues[0]?.retryable, true);

class ReplacementFixtureProvider implements PublicMarketProvider {
  readonly providerCode = "replacement_fixture";
  lookupCompany(): Promise<PublicProviderResponse<PublicCompanyMatch>> {
    return provider.lookupCompany("AAPL");
  }
  getCompanyData(
    request: PublicCompanyDataRequest
  ): Promise<PublicProviderResponse<PublicCompanyData>> {
    return provider.getCompanyData({ ...request, cik: "320193", ticker: "AAPL" });
  }
}

function canonicalRevenue(result: PublicProviderResponse<PublicCompanyData>) {
  return result.data?.financialObservations.find(
    (observation): observation is CanonicalFinancialObservation =>
      observation.metricCode === "revenue"
  )?.value;
}

const secResult = await provider.getCompanyData({
  broadstoneCompanyId: "public-apple",
  cik: "320193",
  ticker: "AAPL"
});
const replacementResult = await new ReplacementFixtureProvider().getCompanyData({
  broadstoneCompanyId: "public-apple",
  cik: "provider-specific-id"
});
assert.equal(canonicalRevenue(secResult), canonicalRevenue(replacementResult));

console.log("sec public market provider tests passed");
