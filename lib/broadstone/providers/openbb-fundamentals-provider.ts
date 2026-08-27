import type {
  CanonicalFinancialObservation,
  CanonicalFinancialPeriod,
  DataProvenance
} from "../canonical/index.ts";
import { policyReference, type ProviderRightsPolicy } from "../market/rights.ts";
import type { PublicProviderIssue } from "./public-market-contracts.ts";
import type {
  FundamentalsProvider,
  OpenBBFundamentalsRequest,
  OpenBBFundamentalsResponse,
  OpenBBFundamentalsTransport,
  OpenBBFundamentalsTransportRequest
} from "./openbb-fundamentals-contracts.ts";
import { OPENBB_FMP_PROTOTYPE_RIGHTS_POLICY } from "./openbb-fmp-rights.ts";

const OPENBB_VERSION = "4.7.0";
const OPENBB_COMMIT = "dddc3b3";

type RecordValue = Record<string, unknown>;

type ParsedResponse = {
  provider: string;
  results: RecordValue[];
};

function parseResponse(value: unknown): ParsedResponse | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { provider?: unknown; results?: unknown };
  if (candidate.provider !== "fmp" || !Array.isArray(candidate.results)) return null;
  const results = candidate.results.filter((item): item is RecordValue =>
    Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
  return { provider: "fmp", results };
}

function text(record: RecordValue, key: string) {
  const value = record[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function number(record: RecordValue, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function issue(message: string, metricCode?: string): PublicProviderIssue {
  return {
    code: "metric_unavailable",
    message,
    providerCode: "broadstone_openbb_fmp",
    retryable: false,
    ...(metricCode ? { metricCode } : {})
  };
}

function periodFor(
  periods: Map<string, CanonicalFinancialPeriod>,
  companyId: string,
  record: RecordValue,
  basis: "annual" | "ttm"
) {
  const endDate = text(record, "period_ending");
  if (!endDate) return null;
  const id = `${companyId}:${basis}:${endDate}`;
  if (!periods.has(id)) {
    const fiscalYear = number(record, "fiscal_year");
    periods.set(id, {
      id,
      companyId,
      label: basis === "ttm" ? `LTM ended ${endDate}` : fiscalYear ? `FY ${fiscalYear}` : `Year ended ${endDate}`,
      periodType: basis === "ttm" ? "ltm" : "annual",
      startDate: null,
      endDate,
      fiscalYear,
      fiscalQuarter: null
    });
  }
  return periods.get(id)!;
}

function provenance(params: {
  ticker: string;
  route: "income" | "balance";
  record: RecordValue;
  field: string;
  basis: "annual" | "ttm";
  retrievedAt: string;
}): DataProvenance {
  const periodEnding = text(params.record, "period_ending");
  return {
    sourceType: "external_provider",
    sourceSystem: `OpenBB ${OPENBB_VERSION} isolated service`,
    underlyingSource: "Financial Modeling Prep",
    sourceIdentifier: `fmp:${params.ticker.toUpperCase()}:${params.route}:${params.basis}:${periodEnding ?? "unknown"}`,
    location: { field: params.field },
    observedAt: params.retrievedAt,
    originalFieldName: params.field,
    sourceMetadata: {
      transportProvider: "OpenBB",
      transportVersion: OPENBB_VERSION,
      transportCommit: OPENBB_COMMIT,
      underlyingProvider: "fmp",
      route: `/api/v1/equity/fundamental/${params.route}`,
      symbol: params.ticker.toUpperCase(),
      periodBasis: params.basis,
      periodEnding,
      fiscalYear: number(params.record, "fiscal_year"),
      fiscalPeriod: text(params.record, "fiscal_period"),
      providerReportedCurrency: text(params.record, "reported_currency") ?? text(params.record, "currency")
    }
  };
}

export class DirectOpenBBFundamentalsTransport implements OpenBBFundamentalsTransport {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(baseUrl = "http://127.0.0.1:6900", fetchImpl: typeof fetch = fetch) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
  }

  private async get(route: "income" | "balance", request: OpenBBFundamentalsTransportRequest) {
    const query = new URLSearchParams({
      symbol: request.symbol,
      provider: request.provider,
      period: request.period,
      limit: String(request.limit)
    });
    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/equity/fundamental/${route}?${query}`);
    if (!response.ok) throw new Error(`OpenBB ${route} route returned HTTP ${response.status}.`);
    return response.json();
  }

  getIncome(request: OpenBBFundamentalsTransportRequest) { return this.get("income", request); }
  getBalance(request: Omit<OpenBBFundamentalsTransportRequest, "period"> & { period: "annual" }) {
    return this.get("balance", request);
  }
}

export class OpenBBFundamentalsProvider implements FundamentalsProvider {
  readonly providerCode = "broadstone_openbb_fmp";
  private readonly transport: OpenBBFundamentalsTransport;
  private readonly rightsPolicy: ProviderRightsPolicy;
  private readonly now: () => Date;

  constructor(
    transport: OpenBBFundamentalsTransport,
    rightsPolicy: ProviderRightsPolicy = OPENBB_FMP_PROTOTYPE_RIGHTS_POLICY,
    now: () => Date = () => new Date()
  ) {
    this.transport = transport;
    this.rightsPolicy = rightsPolicy;
    this.now = now;
  }

  async getFundamentals(request: OpenBBFundamentalsRequest): Promise<OpenBBFundamentalsResponse> {
    const limit = Math.max(1, request.maxAnnualPeriods ?? 3);
    let responses: [unknown, unknown, unknown];
    try {
      responses = await Promise.all([
        this.transport.getIncome({ symbol: request.ticker, provider: "fmp", period: "annual", limit }),
        this.transport.getIncome({ symbol: request.ticker, provider: "fmp", period: "ttm", limit: 1 }),
        this.transport.getBalance({ symbol: request.ticker, provider: "fmp", period: "annual", limit })
      ]);
    } catch (error) {
      return {
        data: null,
        issues: [{
          code: "provider_unavailable",
          message: error instanceof Error ? error.message : "OpenBB fundamentals transport failed.",
          providerCode: this.providerCode,
          retryable: true
        }]
      };
    }
    const [annualIncome, ltmIncome, annualBalance] = responses.map(parseResponse);
    if (!annualIncome || !ltmIncome || !annualBalance) {
      return {
        data: null,
        issues: [{
          code: "malformed_response",
          message: "OpenBB response was malformed or did not identify FMP as the underlying provider.",
          providerCode: this.providerCode,
          retryable: false
        }]
      };
    }

    const retrievedAt = this.now().toISOString();
    const periods = new Map<string, CanonicalFinancialPeriod>();
    const observations: CanonicalFinancialObservation[] = [];
    const issues: PublicProviderIssue[] = [];
    const translate = (params: {
      record: RecordValue;
      route: "income" | "balance";
      basis: "annual" | "ttm";
      field: string;
      metricCode: CanonicalFinancialObservation["metricCode"];
    }) => {
      const value = number(params.record, params.field);
      if (value === null) return false;
      const period = periodFor(periods, request.broadstoneCompanyId, params.record, params.basis);
      const currency = text(params.record, "reported_currency") ?? text(params.record, "currency");
      if (!period || !currency) return false;
      observations.push({
        id: `${request.broadstoneCompanyId}:${params.metricCode}:${params.basis}:${period.endDate}:fmp`,
        companyId: request.broadstoneCompanyId,
        periodId: period.id,
        metricCode: params.metricCode,
        value,
        unit: { kind: "currency", currencyCode: currency, scale: "ones" },
        provenance: [provenance({
          ticker: request.ticker,
          route: params.route,
          record: params.record,
          field: params.field,
          basis: params.basis,
          retrievedAt
        })],
        confidence: "medium"
      });
      return true;
    };

    const incomeFields = [
      ["revenue", "revenue"],
      ["operating_income", "operating_income"],
      ["net_income", "net_income"]
    ] as const;
    for (const record of annualIncome.results) {
      for (const [field, metricCode] of incomeFields) translate({ record, route: "income", basis: "annual", field, metricCode });
      translate({ record, route: "income", basis: "annual", field: "ebitda", metricCode: "public_reported_ebitda" });
    }
    for (const record of ltmIncome.results) {
      for (const [field, metricCode] of [["revenue", "revenue"], ["net_income", "net_income"]] as const) {
        translate({ record, route: "income", basis: "ttm", field, metricCode });
      }
      translate({ record, route: "income", basis: "ttm", field: "ebitda", metricCode: "public_ltm_ebitda" });
    }
    for (const record of annualBalance.results) {
      for (const [field, metricCode] of [
        ["total_debt", "total_debt"],
        ["cash_and_cash_equivalents", "cash_and_cash_equivalents"],
        ["preferred_stock", "preferred_equity"],
        ["total_equity_non_controlling_interests", "non_controlling_interest"]
      ] as const) translate({ record, route: "balance", basis: "annual", field, metricCode });
    }

    for (const metricCode of [
      "revenue", "public_reported_ebitda", "public_ltm_ebitda", "operating_income", "net_income",
      "total_debt", "cash_and_cash_equivalents", "preferred_equity", "non_controlling_interest"
    ]) {
      if (!observations.some((item) => item.metricCode === metricCode)) {
        issues.push(issue(`${metricCode} was not supplied by the OpenBB-routed FMP fixture.`, metricCode));
      }
    }

    return {
      data: {
        company: {
          id: request.broadstoneCompanyId,
          displayName: request.displayName,
          companyType: "public",
          externalIdentifiers: [{ scheme: "ticker", value: request.ticker.toUpperCase() }]
        },
        periods: [...periods.values()].sort((a, b) => b.endDate.localeCompare(a.endDate)),
        financialObservations: observations,
        rightsPolicy: policyReference(this.rightsPolicy)
      },
      issues
    };
  }
}
