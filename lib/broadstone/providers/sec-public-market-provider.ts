import type {
  CanonicalFinancialObservation,
  CanonicalFinancialPeriod,
  DataProvenance
} from "../canonical/index.ts";
import type { CanonicalMarketObservation } from "../market/index.ts";
import type {
  PublicCompanyData,
  PublicCompanyDataRequest,
  PublicCompanyMatch,
  PublicMarketProvider,
  PublicProviderIssue,
  PublicProviderIssueCode,
  PublicProviderResponse
} from "./public-market-contracts.ts";

type FetchLike = typeof fetch;

type SecTickerRecord = {
  cik_str: number;
  ticker: string;
  title: string;
};

type SecFact = {
  val: number;
  accn: string;
  fy?: number;
  fp?: string;
  form: string;
  filed: string;
  start?: string;
  end: string;
  frame?: string;
};

type SecConcept = {
  label?: string;
  units?: Record<string, SecFact[]>;
};

type SecCompanyFacts = {
  cik: number;
  entityName: string;
  facts: {
    "us-gaap"?: Record<string, SecConcept>;
    dei?: Record<string, SecConcept>;
  };
};

const REVENUE_TAGS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "SalesRevenueNet"
] as const;

const FINANCIAL_METRICS = [
  { metricCode: "revenue", tags: REVENUE_TAGS },
  { metricCode: "operating_income", tags: ["OperatingIncomeLoss"] as const },
  { metricCode: "net_income", tags: ["NetIncomeLoss"] as const }
] as const;

const BALANCE_SHEET_TAGS = {
  totalDebt: [
    "ShortAndLongTermDebtTotal",
    "DebtLongtermAndShorttermCombinedAmount",
    "LongTermDebtAndFinanceLeaseObligations"
  ],
  currentDebt: [
    "LongTermDebtAndFinanceLeaseObligationsCurrent",
    "LongTermDebtCurrent",
    "ShortTermBorrowings"
  ],
  noncurrentDebt: [
    "LongTermDebtAndFinanceLeaseObligationsNoncurrent",
    "LongTermDebtNoncurrent"
  ],
  cash: ["CashAndCashEquivalentsAtCarryingValue"],
  ambiguousCash: [
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsCurrent"
  ],
  preferredEquity: [
    "PreferredStocksIncludingAdditionalPaidInCapital",
    "PreferredStockValue"
  ],
  nonControllingInterest: [
    "NoncontrollingInterestInConsolidatedEntity",
    "MinorityInterest"
  ]
} as const;

class SecTransportError extends Error {
  readonly issueCode: PublicProviderIssueCode;
  readonly retryable: boolean;

  constructor(
    issueCode: PublicProviderIssueCode,
    message: string,
    retryable: boolean
  ) {
    super(message);
    this.issueCode = issueCode;
    this.retryable = retryable;
  }
}

export interface SecPublicDataTransport {
  getCompanyTickers(): Promise<unknown>;
  getCompanyFacts(cik: string): Promise<unknown>;
}

export class DirectSecPublicDataTransport implements SecPublicDataTransport {
  private readonly userAgent: string;
  private readonly fetchImpl: FetchLike;

  constructor(
    userAgent: string,
    fetchImpl: FetchLike = fetch
  ) {
    this.userAgent = userAgent;
    this.fetchImpl = fetchImpl;
  }

  private async getJson(url: string) {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": this.userAgent
        }
      });
    } catch {
      throw new SecTransportError(
        "provider_unavailable",
        "SEC EDGAR could not be reached.",
        true
      );
    }

    if (response.status === 404) {
      throw new SecTransportError("company_not_found", "SEC company data was not found.", false);
    }
    if (response.status === 429) {
      throw new SecTransportError("rate_limited", "SEC EDGAR rate limit reached.", true);
    }
    if (response.status === 401 || response.status === 403) {
      throw new SecTransportError(
        "authentication_failed",
        "SEC EDGAR rejected the request credentials or User-Agent policy.",
        false
      );
    }
    if (!response.ok) {
      throw new SecTransportError(
        "provider_unavailable",
        `SEC EDGAR returned HTTP ${response.status}.`,
        response.status >= 500
      );
    }

    try {
      return await response.json();
    } catch {
      throw new SecTransportError(
        "malformed_response",
        "SEC EDGAR returned malformed JSON.",
        false
      );
    }
  }

  getCompanyTickers() {
    return this.getJson("https://www.sec.gov/files/company_tickers.json");
  }

  getCompanyFacts(cik: string) {
    return this.getJson(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${normalizeCik(cik)}.json`
    );
  }
}

function normalizeCik(cik: string | number) {
  return String(cik).replace(/^0+/, "").padStart(10, "0");
}

function issue(
  code: PublicProviderIssueCode,
  message: string,
  retryable: boolean,
  metricCode?: string
): PublicProviderIssue {
  return {
    code,
    message,
    providerCode: "broadstone_sec_direct",
    retryable,
    ...(metricCode ? { metricCode } : {})
  };
}

function failure<T>(error: unknown): PublicProviderResponse<T> {
  if (error instanceof SecTransportError) {
    return { data: null, issues: [issue(error.issueCode, error.message, error.retryable)] };
  }

  return {
    data: null,
    issues: [issue("malformed_response", "SEC provider response was not recognized.", false)]
  };
}

function parseTickerRecords(value: unknown): SecTickerRecord[] | null {
  if (!value || typeof value !== "object") return null;
  const records = Object.values(value).filter(
    (item): item is SecTickerRecord =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as SecTickerRecord).cik_str === "number" &&
      typeof (item as SecTickerRecord).ticker === "string" &&
      typeof (item as SecTickerRecord).title === "string"
  );
  return records.length > 0 ? records : null;
}

function parseCompanyFacts(value: unknown): SecCompanyFacts | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<SecCompanyFacts>;
  if (
    typeof candidate.cik !== "number" ||
    typeof candidate.entityName !== "string" ||
    !candidate.facts ||
    typeof candidate.facts !== "object"
  ) {
    return null;
  }
  return candidate as SecCompanyFacts;
}

function annualFacts(concept: SecConcept | undefined, unit: string, valuationDate: string) {
  const facts = concept?.units?.[unit] ?? [];
  const annual = facts.filter(
    (fact) =>
      Number.isFinite(fact.val) &&
      Boolean(fact.start) &&
      fact.fp === "FY" &&
      eligibleAsOf(fact, valuationDate) &&
      (fact.form === "10-K" || fact.form === "10-K/A")
  );
  annual.sort((left, right) =>
    right.end.localeCompare(left.end) || right.filed.localeCompare(left.filed)
  );

  const byEndDate = new Map<string, SecFact>();
  for (const fact of annual) {
    if (!byEndDate.has(fact.end)) byEndDate.set(fact.end, fact);
  }
  return [...byEndDate.values()];
}

function eligibleAsOf(fact: SecFact, valuationDate: string) {
  return fact.filed <= valuationDate;
}

function pointInTimeFacts(
  concept: SecConcept | undefined,
  unit: string,
  valuationDate: string
) {
  const facts = concept?.units?.[unit] ?? [];
  const selected = facts.filter(
    (fact) =>
      Number.isFinite(fact.val) &&
      !fact.start &&
      (fact.form === "10-K" || fact.form === "10-K/A") &&
      eligibleAsOf(fact, valuationDate)
  );
  selected.sort((left, right) =>
    right.end.localeCompare(left.end) || right.filed.localeCompare(left.filed)
  );

  const byEndDate = new Map<string, SecFact>();
  for (const fact of selected) {
    if (!byEndDate.has(fact.end)) byEndDate.set(fact.end, fact);
  }
  return [...byEndDate.values()];
}

function firstPointInTimeConcept(
  concepts: Record<string, SecConcept> | undefined,
  tags: readonly string[],
  unit: string,
  valuationDate: string
) {
  for (const tag of tags) {
    const facts = pointInTimeFacts(concepts?.[tag], unit, valuationDate);
    if (facts.length > 0) return { tag, facts };
  }
  return null;
}

function firstConcept(
  concepts: Record<string, SecConcept> | undefined,
  tags: readonly string[],
  unit: string,
  valuationDate: string
) {
  for (const tag of tags) {
    const facts = annualFacts(concepts?.[tag], unit, valuationDate);
    if (facts.length > 0) return { tag, facts };
  }
  return null;
}

function provenance(params: {
  fact: SecFact;
  tag: string;
  cik: string;
  ticker?: string;
  retrievedAt: string;
  unit: string;
}): DataProvenance {
  return {
    sourceType: "external_provider",
    sourceSystem: "Broadstone SEC Direct",
    underlyingSource: "SEC EDGAR",
    sourceIdentifier: params.fact.accn,
    location: { field: params.tag },
    observedAt: params.retrievedAt,
    originalFieldName: params.tag,
    sourceMetadata: {
      transport: "direct_sec_api",
      cik: normalizeCik(params.cik),
      ...(params.ticker ? { ticker: params.ticker.toUpperCase() } : {}),
      form: params.fact.form,
      filingDate: params.fact.filed,
      fiscalPeriod: params.fact.fp ?? null,
      sourceUnit: params.unit,
      frame: params.fact.frame ?? null,
      balanceSheetDate: params.fact.end
    }
  };
}

function balancePeriod(
  periodsByEndDate: Map<string, CanonicalFinancialPeriod>,
  companyId: string,
  fact: SecFact
) {
  const periodId = `${companyId}:annual:${fact.end}`;
  if (!periodsByEndDate.has(fact.end)) {
    periodsByEndDate.set(fact.end, {
      id: periodId,
      companyId,
      label: fact.fy ? `FY ${fact.fy}` : `Balance sheet ${fact.end}`,
      periodType: "annual",
      startDate: null,
      endDate: fact.end,
      fiscalYear: fact.fy ?? null,
      fiscalQuarter: null
    });
  }
  return periodId;
}

export class SecPublicMarketProvider implements PublicMarketProvider {
  readonly providerCode = "broadstone_sec_direct";
  private readonly transport: SecPublicDataTransport;
  private readonly now: () => Date;

  constructor(
    transport: SecPublicDataTransport,
    now: () => Date = () => new Date()
  ) {
    this.transport = transport;
    this.now = now;
  }

  async lookupCompany(ticker: string): Promise<PublicProviderResponse<PublicCompanyMatch>> {
    try {
      const records = parseTickerRecords(await this.transport.getCompanyTickers());
      if (!records) {
        return failure(
          new SecTransportError("malformed_response", "SEC ticker response was malformed.", false)
        );
      }
      const normalizedTicker = ticker.trim().toUpperCase();
      const match = records.find((record) => record.ticker.toUpperCase() === normalizedTicker);
      if (!match) {
        return {
          data: null,
          issues: [issue("company_not_found", `Ticker ${normalizedTicker} was not found.`, false)]
        };
      }
      const retrievedAt = this.now().toISOString();
      return {
        data: {
          name: match.title,
          externalIdentifiers: [
            { scheme: "ticker", value: match.ticker.toUpperCase() },
            { scheme: "cik", value: normalizeCik(match.cik_str), provider: "SEC" }
          ],
          provenance: {
            sourceType: "external_provider",
            sourceSystem: "Broadstone SEC Direct",
            underlyingSource: "SEC EDGAR",
            sourceIdentifier: normalizeCik(match.cik_str),
            location: { field: "company_tickers.json" },
            observedAt: retrievedAt,
            originalFieldName: "ticker/title",
            sourceMetadata: { requestedTicker: normalizedTicker }
          }
        },
        issues: []
      };
    } catch (error) {
      return failure(error);
    }
  }

  async getCompanyData(
    request: PublicCompanyDataRequest
  ): Promise<PublicProviderResponse<PublicCompanyData>> {
    try {
      const parsed = parseCompanyFacts(await this.transport.getCompanyFacts(request.cik));
      if (!parsed) {
        return failure(
          new SecTransportError("malformed_response", "SEC company facts response was malformed.", false)
        );
      }

      const maxPeriods = Math.max(1, request.maxAnnualPeriods ?? 3);
      const retrievedAt = this.now().toISOString();
      const valuationDate = request.valuationDate ?? retrievedAt.slice(0, 10);
      const periodsByEndDate = new Map<string, CanonicalFinancialPeriod>();
      const financialObservations: CanonicalFinancialObservation[] = [];
      const issues: PublicProviderIssue[] = [];
      const concepts = parsed.facts["us-gaap"];

      for (const metric of FINANCIAL_METRICS) {
        const selected = firstConcept(concepts, metric.tags, "USD", valuationDate);
        if (!selected) {
          issues.push(
            issue(
              "metric_unavailable",
              `${metric.metricCode} was not available from supported SEC XBRL tags.`,
              false,
              metric.metricCode
            )
          );
          continue;
        }

        for (const fact of selected.facts.slice(0, maxPeriods)) {
          const periodId = `${request.broadstoneCompanyId}:annual:${fact.end}`;
          if (!periodsByEndDate.has(fact.end)) {
            periodsByEndDate.set(fact.end, {
              id: periodId,
              companyId: request.broadstoneCompanyId,
              label: fact.fy ? `FY ${fact.fy}` : `Year ended ${fact.end}`,
              periodType: "annual",
              startDate: fact.start ?? null,
              endDate: fact.end,
              fiscalYear: fact.fy ?? null,
              fiscalQuarter: null
            });
          }
          financialObservations.push({
            id: `${request.broadstoneCompanyId}:${metric.metricCode}:${fact.end}:${fact.accn}`,
            companyId: request.broadstoneCompanyId,
            periodId,
            metricCode: metric.metricCode,
            value: fact.val,
            unit: { kind: "currency", currencyCode: "USD", scale: "ones" },
            provenance: [
              provenance({
                fact,
                tag: selected.tag,
                cik: request.cik,
                ticker: request.ticker,
                retrievedAt,
                unit: "USD"
              })
            ]
          });
        }
      }

      const addBalanceObservation = (params: {
        metricCode: "total_debt" | "cash_and_cash_equivalents" | "preferred_equity" | "non_controlling_interest";
        fact: SecFact;
        tags: readonly string[];
        value: number;
        componentFacts?: readonly SecFact[];
      }) => {
        const facts = params.componentFacts ?? [params.fact];
        const periodId = balancePeriod(periodsByEndDate, request.broadstoneCompanyId, params.fact);
        financialObservations.push({
          id: `${request.broadstoneCompanyId}:${params.metricCode}:${params.fact.end}:${facts.map((fact) => fact.accn).join("+")}`,
          companyId: request.broadstoneCompanyId,
          periodId,
          metricCode: params.metricCode,
          value: params.value,
          unit: { kind: "currency", currencyCode: "USD", scale: "ones" },
          provenance: facts.map((fact, index) => provenance({
            fact,
            tag: params.tags[index] ?? params.tags[0]!,
            cik: request.cik,
            ticker: request.ticker,
            retrievedAt,
            unit: "USD"
          })) as [DataProvenance, ...DataProvenance[]],
          confidence: params.componentFacts ? "medium" : "high"
        });
      };

      const directDebt = firstPointInTimeConcept(
        concepts,
        BALANCE_SHEET_TAGS.totalDebt,
        "USD",
        valuationDate
      );
      const currentDebt = firstPointInTimeConcept(
        concepts,
        BALANCE_SHEET_TAGS.currentDebt,
        "USD",
        valuationDate
      );
      const noncurrentDebt = firstPointInTimeConcept(
        concepts,
        BALANCE_SHEET_TAGS.noncurrentDebt,
        "USD",
        valuationDate
      );
      if (directDebt) {
        for (const fact of directDebt.facts.slice(0, maxPeriods)) {
          addBalanceObservation({ metricCode: "total_debt", fact, tags: [directDebt.tag], value: fact.val });
        }
      } else if (currentDebt && noncurrentDebt) {
        const noncurrentByEnd = new Map(noncurrentDebt.facts.map((fact) => [fact.end, fact]));
        const aligned = currentDebt.facts
          .map((current) => ({ current, noncurrent: noncurrentByEnd.get(current.end) }))
          .filter((pair): pair is { current: SecFact; noncurrent: SecFact } => Boolean(pair.noncurrent))
          .filter((pair) => pair.current.accn === pair.noncurrent.accn && pair.current.filed === pair.noncurrent.filed);
        for (const pair of aligned.slice(0, maxPeriods)) {
          addBalanceObservation({
            metricCode: "total_debt",
            fact: pair.current,
            tags: [currentDebt.tag, noncurrentDebt.tag],
            value: pair.current.val + pair.noncurrent.val,
            componentFacts: [pair.current, pair.noncurrent]
          });
        }
        if (aligned.length === 0) {
          issues.push(issue("metric_unavailable", "Debt components were present but could not be aligned without ambiguity.", false, "total_debt"));
        }
      } else {
        issues.push(issue("metric_unavailable", "Total debt was not available from a supported aggregate or an aligned current/non-current SEC debt pair.", false, "total_debt"));
      }

      const cash = firstPointInTimeConcept(concepts, BALANCE_SHEET_TAGS.cash, "USD", valuationDate);
      if (cash) {
        for (const fact of cash.facts.slice(0, maxPeriods)) {
          addBalanceObservation({ metricCode: "cash_and_cash_equivalents", fact, tags: [cash.tag], value: fact.val });
        }
      } else {
        const ambiguousCash = firstPointInTimeConcept(concepts, BALANCE_SHEET_TAGS.ambiguousCash, "USD", valuationDate);
        issues.push(issue(
          "metric_unavailable",
          ambiguousCash
            ? "Only a cash/restricted-cash aggregate was available; restricted cash is not an approved EV cash deduction."
            : "Cash and cash equivalents was not available from the supported narrow SEC concept.",
          false,
          "cash_and_cash_equivalents"
        ));
      }

      for (const optionalMetric of [
        { metricCode: "preferred_equity" as const, tags: BALANCE_SHEET_TAGS.preferredEquity },
        { metricCode: "non_controlling_interest" as const, tags: BALANCE_SHEET_TAGS.nonControllingInterest }
      ]) {
        const selected = firstPointInTimeConcept(concepts, optionalMetric.tags, "USD", valuationDate);
        if (selected) {
          for (const fact of selected.facts.slice(0, maxPeriods)) {
            addBalanceObservation({ metricCode: optionalMetric.metricCode, fact, tags: [selected.tag], value: fact.val });
          }
        } else {
          issues.push(issue(
            "metric_unavailable",
            `${optionalMetric.metricCode} was not explicitly reported in a supported SEC concept; absence is not treated as zero.`,
            false,
            optionalMetric.metricCode
          ));
        }
      }

      issues.push(
        issue(
          "metric_unavailable",
          "reported_ebitda is not a consistently standardized SEC XBRL company fact.",
          false,
          "reported_ebitda"
        )
      );

      const marketObservations: CanonicalMarketObservation[] = [];
      const sharesConcept = parsed.facts.dei?.EntityCommonStockSharesOutstanding;
      const sharesFacts = (sharesConcept?.units?.shares ?? [])
        .filter(
          (fact) =>
            Number.isFinite(fact.val) &&
            eligibleAsOf(fact, valuationDate) &&
            (fact.form === "10-K" || fact.form === "10-K/A")
        )
        .sort((left, right) =>
          right.end.localeCompare(left.end) || right.filed.localeCompare(left.filed)
        );
      const latestShares = sharesFacts[0];
      if (latestShares) {
        marketObservations.push({
          id: `${request.broadstoneCompanyId}:shares_outstanding:${latestShares.end}:${latestShares.accn}`,
          companyId: request.broadstoneCompanyId,
          metricCode: "shares_outstanding",
          value: latestShares.val,
          unit: { kind: "shares", scale: "ones" },
          effectiveDate: latestShares.end,
          provenance: [
            provenance({
              fact: latestShares,
              tag: "EntityCommonStockSharesOutstanding",
              cik: request.cik,
              ticker: request.ticker,
              retrievedAt,
              unit: "shares"
            })
          ]
        });
      } else {
        issues.push(
          issue(
            "metric_unavailable",
            "shares_outstanding was not available from the supported SEC DEI tag.",
            false,
            "shares_outstanding"
          )
        );
      }

      if (periodsByEndDate.size === 0) {
        issues.push(issue("period_unavailable", "No supported annual SEC periods were found.", false));
      }

      return {
        data: {
          company: {
            id: request.broadstoneCompanyId,
            displayName: parsed.entityName,
            companyType: "public",
            externalIdentifiers: [
              ...(request.ticker
                ? [{ scheme: "ticker" as const, value: request.ticker.toUpperCase() }]
                : []),
              { scheme: "cik", value: normalizeCik(parsed.cik), provider: "SEC" }
            ]
          },
          periods: [...periodsByEndDate.values()].sort((a, b) =>
            b.endDate.localeCompare(a.endDate)
          ),
          financialObservations,
          marketObservations
        },
        issues
      };
    } catch (error) {
      return failure(error);
    }
  }
}
