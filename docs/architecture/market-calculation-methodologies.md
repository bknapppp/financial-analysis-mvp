# Authoritative Market Calculation Methodologies

This record defines the first provider-neutral Broadstone Market Calculation Service. The service consumes only canonical `MarketObservationBundle` inputs, applies Broadstone-owned methodology, and returns immutable results with observation-level lineage. It does not fetch provider data, persist results, or implement Public Comps presentation.

## Methodology registry

| Metric | Method ID | Version | Formula / availability rule |
| --- | --- | --- | --- |
| Market capitalization | `market_cap.v1` | `1.0.0` | Security-matched price multiplied by shares outstanding. |
| Revenue growth | `revenue_growth.v1` | `1.0.0` | `(current annual revenue / prior comparable annual revenue) - 1`. |
| Operating margin | `operating_margin.v1` | `1.0.0` | Operating income divided by revenue for the same period and currency. |
| Net income margin | `net_income_margin.v1` | `1.0.0` | Net income divided by revenue for the same period and currency. |
| Price to earnings | `pe_fiscal_year.v1` | `1.0.0` | Market capitalization divided by positive net income from the latest completed fiscal year. This is not an LTM multiple. |
| Enterprise value | `enterprise_value.v1` | `1.0.0` | Market capitalization + total debt + preferred equity + non-controlling interest - cash and cash equivalents. All bridge components are required. |
| EV / Revenue | `ev_revenue.v1` | `1.0.0` | Complete enterprise value divided by period-aligned revenue. |
| Public EBITDA | `public_ebitda_availability.v1` | `1.0.0` | Unavailable until an approved public-company EBITDA basis is supplied. |
| EBITDA margin | `ebitda_margin.v1` | `1.0.0` | Unavailable until an approved public-company EBITDA basis is supplied. |
| EV / EBITDA | `ev_ebitda.v1` | `1.0.0` | Unavailable until an approved public-company EBITDA basis is supplied. |

## Input and safety policies

- Every input observation must permit `derived_calculation`. Missing, unresolved, review-required, or denied rights block the dependent result.
- Result lineage records the exact input observation IDs, observation-bundle hash, method ID, and method version.
- Expired price observations are unavailable. Stale prices remain calculable but propagate stale status. Unknown or aging freshness produces a warning.
- Shares outstanding may not be dated after the price. A mismatch of at most 450 days is allowed with a warning; older shares block market capitalization.
- Revenue growth requires comparable annual periods in the same currency. Period-duration differences greater than 45 days block calculation.
- Ratio denominators must be valid: prior revenue and current revenue cannot be zero; P/E requires positive net income.
- Enterprise-value components must share a period and currency. Missing components are never treated as zero. Foreign-exchange conversion is not implemented.
- Outputs are recursively frozen so a refreshed observation bundle produces a new reproducible result without changing prior calculations.

## Public Comps readiness

| Capability | Status | Remaining input need |
| --- | --- | --- |
| Market capitalization | Ready | Canonical price and shares outstanding. |
| Revenue growth | Ready | Two comparable annual revenue observations. |
| Operating and net margins | Ready | Period-aligned income statement observations. |
| Fiscal-year P/E | Ready with explicit limitation | Latest completed fiscal-year positive net income; LTM earnings are not yet modeled. |
| Enterprise value | Method ready, data incomplete | Total debt, cash, preferred equity, and non-controlling interest. |
| EV / Revenue | Method ready, data incomplete | Complete enterprise-value bridge plus aligned revenue. |
| EBITDA metrics | Intentionally unavailable | Approved reported/calculated public EBITDA basis and period definition. |

## Remaining data work and OpenBB reassessment

The next smallest provider-data slice should add canonical balance-sheet observations for total debt, cash and cash equivalents, preferred equity, and non-controlling interest. Extending Broadstone's existing direct SEC adapter is the simplest first path where SEC concepts provide reliable coverage; it preserves the current provider boundary and does not require OpenBB.

Public-company EBITDA is the larger unresolved methodology and data problem. Broadstone must define acceptable reported versus calculated bases, annual versus LTM periods, and source rights before enabling EBITDA, EBITDA margin, or EV / EBITDA. A licensed fundamental-data provider may be required for consistent coverage and later consensus estimates.

OpenBB remains a potential provider-routing accelerator because its provider-specific fundamental metrics, balance-sheet, and estimates interfaces expose many of these fields. It is not itself the data source or a substitute for provider licensing, rights evaluation, canonical normalization, or Broadstone methodology. Reassess it after direct SEC balance-sheet coverage is measured and before selecting a licensed fundamentals or estimates provider.

Public Comps V1 should not be considered complete until the enterprise-value bridge and an approved EBITDA basis are available. The current foundation can safely support market capitalization, fiscal-year P/E, revenue growth, and operating/net margins without exposing incomplete EV or EBITDA multiples.
