import type { CanonicalFinancialObservation } from "../canonical/contracts.ts";
import type { MarketCalculationReference } from "../calculations/contracts.ts";
import type {
  MarketCalculationMetricCode,
  MarketCalculationResult,
  MarketCalculationStatus,
  MarketCalculationUnit,
  PublicCompanyMarketCalculations
} from "./calculation-contracts.ts";
import type {
  MarketObservationBundle,
  ProviderRightsPolicyReference
} from "./contracts.ts";
import { MARKET_METHODOLOGIES, type MarketMethodology } from "./methodologies.ts";
import type { ProviderPolicyResolver } from "./rights.ts";
import { evaluateProviderUse } from "./rights.ts";

const MAX_SHARE_COUNT_AGE_DAYS = 450;
const DAY_MS = 24 * 60 * 60 * 1000;

type BundleObservation = MarketObservationBundle["observations"][number];
type BundleFinancialObservation = Extract<BundleObservation, { kind: "financial" }>;
type BundleMarketObservation = Extract<BundleObservation, { kind: "market" }>;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function daysBetween(later: string, earlier: string): number {
  return Math.floor((Date.parse(`${later}T00:00:00.000Z`) - Date.parse(`${earlier}T00:00:00.000Z`)) / DAY_MS);
}

function scaleMultiplier(scale: "ones" | "thousands" | "millions"): number {
  if (scale === "thousands") return 1_000;
  if (scale === "millions") return 1_000_000;
  return 1;
}

function observationValue(observation: CanonicalFinancialObservation): number {
  return observation.value * scaleMultiplier(observation.unit.scale);
}

function uniqueRights(items: readonly BundleObservation[]): ProviderRightsPolicyReference[] {
  const policies = new Map<string, ProviderRightsPolicyReference>();
  for (const item of items) {
    if (!item.rightsPolicy) continue;
    policies.set(
      `${item.rightsPolicy.policyId}:${item.rightsPolicy.policyVersion ?? "unknown"}`,
      item.rightsPolicy
    );
  }
  return [...policies.values()];
}

function rightsBlockers(
  items: readonly BundleObservation[],
  resolvePolicy: ProviderPolicyResolver
): string[] {
  const blockers: string[] = [];
  for (const item of items) {
    if (!item.rightsPolicy) {
      blockers.push(`Observation ${item.observation.id} has no provider-rights policy.`);
      continue;
    }
    const policy = resolvePolicy(item.rightsPolicy);
    if (!policy) {
      blockers.push(
        `Rights policy ${item.rightsPolicy.policyId}@${item.rightsPolicy.policyVersion ?? "unknown"} could not be resolved.`
      );
      continue;
    }
    const decision = evaluateProviderUse(policy, "derived_calculation");
    if (decision.decision !== "allowed") blockers.push(decision.reason);
  }
  return blockers;
}

function reference(
  methodology: MarketMethodology,
  bundle: MarketObservationBundle,
  items: readonly BundleObservation[]
): MarketCalculationReference {
  return {
    calculator: "market_engine",
    methodologyId: methodology.id,
    methodologyVersion: methodology.version,
    observationBundleHash: bundle.contentHash,
    inputObservationIds: items.map((item) => item.observation.id).sort()
  };
}

function result<TCode extends MarketCalculationMetricCode>(params: {
  metricCode: TCode;
  methodology: MarketMethodology;
  bundle: MarketObservationBundle;
  items?: readonly BundleObservation[];
  value?: number | null;
  status: MarketCalculationStatus;
  unit?: MarketCalculationUnit | null;
  financialPeriodIds?: readonly string[];
  warnings?: readonly string[];
  blockers?: readonly string[];
}): MarketCalculationResult<TCode> {
  const items = params.items ?? [];
  return {
    metricCode: params.metricCode,
    value: params.value ?? null,
    reference: reference(params.methodology, params.bundle, items),
    status: params.status,
    unit: params.unit ?? null,
    valuationDate: params.bundle.valuationDate,
    financialPeriodIds: [...(params.financialPeriodIds ?? [])].sort(),
    warnings: [...(params.warnings ?? [])],
    blockers: [...(params.blockers ?? [])],
    rightsPolicies: uniqueRights(items)
  };
}

function financialItems(bundle: MarketObservationBundle): BundleFinancialObservation[] {
  return bundle.observations.filter(
    (item): item is BundleFinancialObservation => item.kind === "financial"
  );
}

function financialItem(
  items: readonly BundleFinancialObservation[],
  metricCode: CanonicalFinancialObservation["metricCode"],
  periodId: string
): BundleFinancialObservation | undefined {
  return items.find(
    (item) => item.observation.metricCode === metricCode && item.observation.periodId === periodId
  );
}

function compatibleFinancialUnits(items: readonly BundleFinancialObservation[]): boolean {
  const currencies = new Set(items.map((item) => item.observation.unit.currencyCode));
  return currencies.size === 1;
}

function latestAnnualPeriods(bundle: MarketObservationBundle) {
  return bundle.selectedPeriods
    .filter((period) => period.periodType === "annual" && period.endDate <= bundle.valuationDate)
    .sort((left, right) => right.endDate.localeCompare(left.endDate));
}

function unavailableMetric<TCode extends MarketCalculationMetricCode>(
  metricCode: TCode,
  methodology: MarketMethodology,
  bundle: MarketObservationBundle,
  blockers: readonly string[],
  status: MarketCalculationStatus = "unavailable"
): MarketCalculationResult<TCode> {
  return result({ metricCode, methodology, bundle, status, blockers });
}

export class MarketCalculationService {
  private readonly resolvePolicy: ProviderPolicyResolver;

  constructor(resolvePolicy: ProviderPolicyResolver) {
    this.resolvePolicy = resolvePolicy;
  }

  calculate(bundle: MarketObservationBundle): PublicCompanyMarketCalculations {
    const marketCapitalization = this.marketCapitalization(bundle);
    const revenueGrowth = this.revenueGrowth(bundle);
    const operatingMargin = this.margin(bundle, "operating_income", "operating_margin");
    const netIncomeMargin = this.margin(bundle, "net_income", "net_income_margin");
    const priceToEarnings = this.priceToEarnings(bundle, marketCapitalization);
    const enterpriseValue = this.enterpriseValue(bundle, marketCapitalization);
    const evToRevenue = this.evToRevenue(bundle, enterpriseValue);
    const ebitda = {
      ...unavailableMetric(
        "ebitda",
        MARKET_METHODOLOGIES.ebitda,
        bundle,
        ["No approved public-company EBITDA observation basis is available from current providers."]
      ),
      ebitdaBasis: "unavailable" as const
    };
    const ebitdaMargin = {
      ...unavailableMetric(
        "ebitda_margin",
        MARKET_METHODOLOGIES.ebitdaMargin,
        bundle,
        ["EBITDA margin requires an approved public-company EBITDA observation basis."]
      ),
      ebitdaBasis: "unavailable" as const
    };
    const evToEbitda = {
      ...unavailableMetric(
        "ev_to_ebitda",
        MARKET_METHODOLOGIES.evToEbitda,
        bundle,
        ["EV/EBITDA requires both complete enterprise value and an approved public EBITDA basis."]
      ),
      ebitdaBasis: "unavailable" as const
    };

    return deepFreeze({
      companyId: bundle.company.id,
      securityId: bundle.security?.id ?? null,
      valuationDate: bundle.valuationDate,
      observationBundleHash: bundle.contentHash,
      marketCapitalization,
      revenueGrowth,
      operatingMargin,
      netIncomeMargin,
      priceToEarnings,
      enterpriseValue,
      evToRevenue,
      ebitda,
      ebitdaMargin,
      evToEbitda
    });
  }

  private marketCapitalization(
    bundle: MarketObservationBundle
  ): MarketCalculationResult<"market_capitalization"> {
    const marketItems = bundle.observations.filter(
      (item): item is BundleMarketObservation => item.kind === "market"
    );
    const price = marketItems
      .filter((item) =>
        item.observation.metricCode === "share_price"
        && item.observation.effectiveDate <= bundle.valuationDate
        && (!bundle.security || item.observation.securityId === bundle.security.id)
      )
      .sort((left, right) => right.observation.effectiveDate.localeCompare(left.observation.effectiveDate))[0];
    const shares = marketItems
      .filter((item) =>
        item.observation.metricCode === "shares_outstanding"
        && item.observation.effectiveDate <= bundle.valuationDate
      )
      .sort((left, right) => right.observation.effectiveDate.localeCompare(left.observation.effectiveDate))[0];
    if (!price || !shares) {
      return unavailableMetric(
        "market_capitalization",
        MARKET_METHODOLOGIES.marketCapitalization,
        bundle,
        [!price ? "A valid closing-price observation is required." : "A shares-outstanding observation is required."]
      );
    }
    if (price.observation.unit.kind !== "currency" || shares.observation.unit.kind !== "shares") {
      return result({
        metricCode: "market_capitalization",
        methodology: MARKET_METHODOLOGIES.marketCapitalization,
        bundle,
        items: [price, shares],
        status: "invalid",
        blockers: ["Market capitalization requires a currency price and a share-count observation."]
      });
    }
    const blockers = rightsBlockers([price, shares], this.resolvePolicy);
    if (blockers.length > 0) {
      return result({
        metricCode: "market_capitalization",
        methodology: MARKET_METHODOLOGIES.marketCapitalization,
        bundle,
        items: [price, shares],
        status: "blocked_by_rights",
        blockers
      });
    }
    if (shares.observation.effectiveDate > price.observation.effectiveDate) {
      return result({
        metricCode: "market_capitalization",
        methodology: MARKET_METHODOLOGIES.marketCapitalization,
        bundle,
        items: [price, shares],
        status: "incomplete",
        blockers: ["The selected share count is future-dated relative to the closing price."]
      });
    }
    const shareAgeDays = daysBetween(price.observation.effectiveDate, shares.observation.effectiveDate);
    if (shareAgeDays > MAX_SHARE_COUNT_AGE_DAYS) {
      return result({
        metricCode: "market_capitalization",
        methodology: MARKET_METHODOLOGIES.marketCapitalization,
        bundle,
        items: [price, shares],
        status: "incomplete",
        blockers: [`The shares-outstanding observation is ${shareAgeDays} days older than the price; the prototype limit is ${MAX_SHARE_COUNT_AGE_DAYS} days.`]
      });
    }
    if (price.freshnessState === "expired") {
      return result({
        metricCode: "market_capitalization",
        methodology: MARKET_METHODOLOGIES.marketCapitalization,
        bundle,
        items: [price, shares],
        status: "unavailable",
        blockers: ["The selected closing price is expired under its freshness policy."]
      });
    }
    const warnings: string[] = [];
    if (shareAgeDays > 0) warnings.push(`Shares outstanding predate the closing price by ${shareAgeDays} days.`);
    if (price.freshnessState === "aging") warnings.push("The selected closing price is aging.");
    if (price.freshnessState === "stale") warnings.push("The selected closing price is stale.");
    if (price.freshnessState === "unknown") warnings.push("Closing-price freshness is unknown.");
    const status: MarketCalculationStatus = price.freshnessState === "stale"
      ? "stale"
      : warnings.length > 0
        ? "available_with_warning"
        : "available";
    return result({
      metricCode: "market_capitalization",
      methodology: MARKET_METHODOLOGIES.marketCapitalization,
      bundle,
      items: [price, shares],
      value: price.observation.value * scaleMultiplier(price.observation.unit.scale)
        * shares.observation.value * scaleMultiplier(shares.observation.unit.scale),
      status,
      unit: {
        kind: "currency",
        currencyCode: price.observation.unit.currencyCode,
        scale: "ones"
      },
      warnings
    });
  }

  private revenueGrowth(bundle: MarketObservationBundle): MarketCalculationResult<"revenue_growth"> {
    const periods = latestAnnualPeriods(bundle);
    if (periods.length < 2) {
      return unavailableMetric(
        "revenue_growth",
        MARKET_METHODOLOGIES.revenueGrowth,
        bundle,
        ["Two comparable completed annual periods are required."]
      );
    }
    const [currentPeriod, priorPeriod] = periods;
    if (!currentPeriod || !priorPeriod) throw new Error("Annual-period selection failed.");
    const items = financialItems(bundle);
    const current = financialItem(items, "revenue", currentPeriod.id);
    const prior = financialItem(items, "revenue", priorPeriod.id);
    if (!current || !prior) {
      return unavailableMetric(
        "revenue_growth",
        MARKET_METHODOLOGIES.revenueGrowth,
        bundle,
        ["Revenue is missing for the current or prior annual period."]
      );
    }
    const selected = [current, prior];
    const rights = rightsBlockers(selected, this.resolvePolicy);
    if (rights.length > 0) return result({
      metricCode: "revenue_growth",
      methodology: MARKET_METHODOLOGIES.revenueGrowth,
      bundle,
      items: selected,
      status: "blocked_by_rights",
      blockers: rights,
      financialPeriodIds: [currentPeriod.id, priorPeriod.id]
    });
    if (!compatibleFinancialUnits(selected)) return result({
      metricCode: "revenue_growth",
      methodology: MARKET_METHODOLOGIES.revenueGrowth,
      bundle,
      items: selected,
      status: "incomplete",
      blockers: ["Revenue periods use incompatible currencies."],
      financialPeriodIds: [currentPeriod.id, priorPeriod.id]
    });
    const currentDuration = currentPeriod.startDate
      ? daysBetween(currentPeriod.endDate, currentPeriod.startDate)
      : null;
    const priorDuration = priorPeriod.startDate
      ? daysBetween(priorPeriod.endDate, priorPeriod.startDate)
      : null;
    if (currentDuration === null || priorDuration === null || Math.abs(currentDuration - priorDuration) > 45) {
      return result({
        metricCode: "revenue_growth",
        methodology: MARKET_METHODOLOGIES.revenueGrowth,
        bundle,
        items: selected,
        status: "incomplete",
        blockers: ["Annual revenue periods are not duration-compatible."],
        financialPeriodIds: [currentPeriod.id, priorPeriod.id]
      });
    }
    const priorValue = observationValue(prior.observation);
    if (priorValue === 0) return result({
      metricCode: "revenue_growth",
      methodology: MARKET_METHODOLOGIES.revenueGrowth,
      bundle,
      items: selected,
      status: "invalid",
      blockers: ["Prior-period revenue is zero, so growth is undefined."],
      financialPeriodIds: [currentPeriod.id, priorPeriod.id]
    });
    return result({
      metricCode: "revenue_growth",
      methodology: MARKET_METHODOLOGIES.revenueGrowth,
      bundle,
      items: selected,
      value: observationValue(current.observation) / priorValue - 1,
      status: "available",
      unit: { kind: "ratio", format: "decimal" },
      financialPeriodIds: [currentPeriod.id, priorPeriod.id]
    });
  }

  private margin(
    bundle: MarketObservationBundle,
    numeratorCode: "operating_income",
    resultCode: "operating_margin"
  ): MarketCalculationResult<"operating_margin">;
  private margin(
    bundle: MarketObservationBundle,
    numeratorCode: "net_income",
    resultCode: "net_income_margin"
  ): MarketCalculationResult<"net_income_margin">;
  private margin(
    bundle: MarketObservationBundle,
    numeratorCode: "operating_income" | "net_income",
    resultCode: "operating_margin" | "net_income_margin"
  ): MarketCalculationResult<typeof resultCode> {
    const period = latestAnnualPeriods(bundle)[0];
    const methodology = resultCode === "operating_margin"
      ? MARKET_METHODOLOGIES.operatingMargin
      : MARKET_METHODOLOGIES.netIncomeMargin;
    if (!period) return unavailableMetric(resultCode, methodology, bundle, ["A completed annual period is required."]);
    const items = financialItems(bundle);
    const numerator = financialItem(items, numeratorCode, period.id);
    const revenue = financialItem(items, "revenue", period.id);
    if (!numerator || !revenue) {
      return unavailableMetric(resultCode, methodology, bundle, ["The numerator and revenue must exist for the same annual period."]);
    }
    const selected = [numerator, revenue];
    const rights = rightsBlockers(selected, this.resolvePolicy);
    if (rights.length > 0) return result({
      metricCode: resultCode,
      methodology,
      bundle,
      items: selected,
      status: "blocked_by_rights",
      blockers: rights,
      financialPeriodIds: [period.id]
    });
    if (!compatibleFinancialUnits(selected)) return result({
      metricCode: resultCode,
      methodology,
      bundle,
      items: selected,
      status: "incomplete",
      blockers: ["Margin inputs use incompatible currencies."],
      financialPeriodIds: [period.id]
    });
    const revenueValue = observationValue(revenue.observation);
    if (revenueValue === 0) return result({
      metricCode: resultCode,
      methodology,
      bundle,
      items: selected,
      status: "invalid",
      blockers: ["Revenue is zero, so margin is undefined."],
      financialPeriodIds: [period.id]
    });
    return result({
      metricCode: resultCode,
      methodology,
      bundle,
      items: selected,
      value: observationValue(numerator.observation) / revenueValue,
      status: "available",
      unit: { kind: "ratio", format: "decimal" },
      financialPeriodIds: [period.id]
    });
  }

  private priceToEarnings(
    bundle: MarketObservationBundle,
    marketCap: MarketCalculationResult<"market_capitalization">
  ): MarketCalculationResult<"price_to_earnings"> {
    if (marketCap.value === null) return unavailableMetric(
      "price_to_earnings",
      MARKET_METHODOLOGIES.priceToEarnings,
      bundle,
      ["P/E requires available authoritative market capitalization."]
    );
    const period = latestAnnualPeriods(bundle)[0];
    const netIncome = period ? financialItem(financialItems(bundle), "net_income", period.id) : undefined;
    if (!period || !netIncome) return unavailableMetric(
      "price_to_earnings",
      MARKET_METHODOLOGIES.priceToEarnings,
      bundle,
      ["P/E requires net income for the latest completed fiscal year."]
    );
    const marketInputs = bundle.observations.filter((item) =>
      marketCap.reference.inputObservationIds.includes(item.observation.id)
    );
    const selected = [...marketInputs, netIncome];
    const rights = rightsBlockers(selected, this.resolvePolicy);
    if (rights.length > 0) return result({
      metricCode: "price_to_earnings",
      methodology: MARKET_METHODOLOGIES.priceToEarnings,
      bundle,
      items: selected,
      status: "blocked_by_rights",
      blockers: rights,
      financialPeriodIds: [period.id]
    });
    if (marketCap.unit?.kind !== "currency"
      || marketCap.unit.currencyCode !== netIncome.observation.unit.currencyCode) {
      return result({
        metricCode: "price_to_earnings",
        methodology: MARKET_METHODOLOGIES.priceToEarnings,
        bundle,
        items: selected,
        status: "incomplete",
        blockers: ["Market capitalization and net income use incompatible currencies."],
        financialPeriodIds: [period.id]
      });
    }
    const earnings = observationValue(netIncome.observation);
    if (earnings <= 0) return result({
      metricCode: "price_to_earnings",
      methodology: MARKET_METHODOLOGIES.priceToEarnings,
      bundle,
      items: selected,
      status: "unavailable",
      blockers: ["Fiscal-year net income must be positive for a meaningful P/E multiple."],
      financialPeriodIds: [period.id]
    });
    return result({
      metricCode: "price_to_earnings",
      methodology: MARKET_METHODOLOGIES.priceToEarnings,
      bundle,
      items: selected,
      value: marketCap.value / earnings,
      status: marketCap.status === "available" ? "available_with_warning" : marketCap.status,
      unit: { kind: "ratio", format: "multiple" },
      financialPeriodIds: [period.id],
      warnings: [
        ...marketCap.warnings,
        "P/E uses latest completed fiscal-year net income and is not an LTM multiple."
      ]
    });
  }

  private enterpriseValue(
    bundle: MarketObservationBundle,
    marketCap: MarketCalculationResult<"market_capitalization">
  ): MarketCalculationResult<"enterprise_value"> {
    if (marketCap.value === null || marketCap.unit?.kind !== "currency") return unavailableMetric(
      "enterprise_value",
      MARKET_METHODOLOGIES.enterpriseValue,
      bundle,
      ["Enterprise value requires available authoritative market capitalization."],
      "incomplete"
    );
    const period = latestAnnualPeriods(bundle)[0];
    if (!period) return unavailableMetric(
      "enterprise_value",
      MARKET_METHODOLOGIES.enterpriseValue,
      bundle,
      ["Enterprise value requires a completed financial period for its bridge components."],
      "incomplete"
    );
    const financial = financialItems(bundle);
    const bridgeCodes = [
      "total_debt",
      "cash_and_cash_equivalents",
      "preferred_equity",
      "non_controlling_interest"
    ] as const;
    const bridge = bridgeCodes.map((code) => financialItem(financial, code, period.id));
    const missing = bridgeCodes.filter((_, index) => !bridge[index]);
    if (missing.length > 0) return unavailableMetric(
      "enterprise_value",
      MARKET_METHODOLOGIES.enterpriseValue,
      bundle,
      [`Enterprise-value bridge is incomplete; missing: ${missing.join(", ")}.`],
      "incomplete"
    );
    const bridgeItems = bridge.filter((item): item is BundleFinancialObservation => Boolean(item));
    const marketInputs = bundle.observations.filter((item) =>
      marketCap.reference.inputObservationIds.includes(item.observation.id)
    );
    const selected = [...marketInputs, ...bridgeItems];
    const rights = rightsBlockers(selected, this.resolvePolicy);
    if (rights.length > 0) return result({
      metricCode: "enterprise_value",
      methodology: MARKET_METHODOLOGIES.enterpriseValue,
      bundle,
      items: selected,
      status: "blocked_by_rights",
      blockers: rights,
      financialPeriodIds: [period.id]
    });
    if (!compatibleFinancialUnits(bridgeItems)
      || bridgeItems[0]?.observation.unit.currencyCode !== marketCap.unit.currencyCode) {
      return result({
        metricCode: "enterprise_value",
        methodology: MARKET_METHODOLOGIES.enterpriseValue,
        bundle,
        items: selected,
        status: "incomplete",
        blockers: ["Enterprise-value bridge components are not currency-compatible; FX is not supported."],
        financialPeriodIds: [period.id]
      });
    }
    const [debt, cash, preferred, nonControllingInterest] = bridgeItems.map((item) =>
      observationValue(item.observation)
    );
    if (debt === undefined || cash === undefined || preferred === undefined || nonControllingInterest === undefined) {
      throw new Error("Enterprise-value bridge selection failed.");
    }
    return result({
      metricCode: "enterprise_value",
      methodology: MARKET_METHODOLOGIES.enterpriseValue,
      bundle,
      items: selected,
      value: marketCap.value + debt + preferred + nonControllingInterest - cash,
      status: marketCap.status,
      unit: marketCap.unit,
      financialPeriodIds: [period.id],
      warnings: marketCap.warnings
    });
  }

  private evToRevenue(
    bundle: MarketObservationBundle,
    enterpriseValue: MarketCalculationResult<"enterprise_value">
  ): MarketCalculationResult<"ev_to_revenue"> {
    if (enterpriseValue.value === null || enterpriseValue.unit?.kind !== "currency") {
      return unavailableMetric(
        "ev_to_revenue",
        MARKET_METHODOLOGIES.evToRevenue,
        bundle,
        ["EV/Revenue requires complete authoritative enterprise value."]
      );
    }
    const periodId = enterpriseValue.financialPeriodIds[0];
    const revenue = periodId ? financialItem(financialItems(bundle), "revenue", periodId) : undefined;
    if (!periodId || !revenue) return unavailableMetric(
      "ev_to_revenue",
      MARKET_METHODOLOGIES.evToRevenue,
      bundle,
      ["EV/Revenue requires revenue aligned to the enterprise-value bridge period."]
    );
    const evInputs = bundle.observations.filter((item) =>
      enterpriseValue.reference.inputObservationIds.includes(item.observation.id)
    );
    const selected = [...evInputs, revenue];
    const rights = rightsBlockers(selected, this.resolvePolicy);
    if (rights.length > 0) return result({
      metricCode: "ev_to_revenue",
      methodology: MARKET_METHODOLOGIES.evToRevenue,
      bundle,
      items: selected,
      status: "blocked_by_rights",
      blockers: rights,
      financialPeriodIds: [periodId]
    });
    if (enterpriseValue.unit.currencyCode !== revenue.observation.unit.currencyCode) return result({
      metricCode: "ev_to_revenue",
      methodology: MARKET_METHODOLOGIES.evToRevenue,
      bundle,
      items: selected,
      status: "incomplete",
      blockers: ["Enterprise value and revenue use incompatible currencies; FX is not supported."],
      financialPeriodIds: [periodId]
    });
    const revenueValue = observationValue(revenue.observation);
    if (revenueValue === 0) return result({
      metricCode: "ev_to_revenue",
      methodology: MARKET_METHODOLOGIES.evToRevenue,
      bundle,
      items: selected,
      status: "invalid",
      blockers: ["Revenue is zero, so EV/Revenue is undefined."],
      financialPeriodIds: [periodId]
    });
    return result({
      metricCode: "ev_to_revenue",
      methodology: MARKET_METHODOLOGIES.evToRevenue,
      bundle,
      items: selected,
      value: enterpriseValue.value / revenueValue,
      status: enterpriseValue.status,
      unit: { kind: "ratio", format: "multiple" },
      financialPeriodIds: [periodId],
      warnings: enterpriseValue.warnings
    });
  }
}
