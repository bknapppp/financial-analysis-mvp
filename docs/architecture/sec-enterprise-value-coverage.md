# SEC Enterprise Value Bridge Coverage

This prototype extends the direct SEC EDGAR Company Facts adapter with provider-neutral balance-sheet observations used by the authoritative Market Calculation Service. It does not change the enterprise-value formula, add a provider, persist data, or expose Public Comps UI.

## Canonical translation

| Canonical metric | Supported SEC concepts | Translation rule | Confidence |
| --- | --- | --- | --- |
| `total_debt` | `ShortAndLongTermDebtTotal`, `DebtLongtermAndShorttermCombinedAmount`, `LongTermDebtAndFinanceLeaseObligations` | Use the first supported aggregate by precedence. | High |
| `total_debt` | Current: `LongTermDebtAndFinanceLeaseObligationsCurrent`, `LongTermDebtCurrent`, `ShortTermBorrowings`; non-current: `LongTermDebtAndFinanceLeaseObligationsNoncurrent`, `LongTermDebtNoncurrent` | Sum one current and one non-current component only when balance-sheet date, accession, and filing date align. Do not emit an aggregate otherwise. A direct total takes precedence so components are not double-counted. | Medium |
| `cash_and_cash_equivalents` | `CashAndCashEquivalentsAtCarryingValue` | Use the narrow reported cash-and-cash-equivalents balance. | High |
| `preferred_equity` | `PreferredStocksIncludingAdditionalPaidInCapital`, `PreferredStockValue` | Emit only an explicit reported observation. | High |
| `non_controlling_interest` | `NoncontrollingInterestInConsolidatedEntity`, `MinorityInterest` | Emit only an explicit reported observation. | High |

`CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents` and its current variant are detected but deliberately rejected as EV cash inputs. Restricted cash and marketable securities are not included in the cash deduction. Missing preferred equity or NCI is unknown, not zero; an explicitly reported zero remains a valid observation.

## Period, provenance, and reproducibility

- Balance-sheet facts are point-in-time 10-K or 10-K/A observations in USD.
- Facts filed after the requested valuation date are excluded. The same anti-look-ahead filter applies to annual income-statement facts and shares returned with the historical request.
- Each canonical observation retains its original XBRL tag, accession, form, filing date, balance-sheet date, fiscal period, SEC frame, CIK, ticker, source unit, and retrieval timestamp.
- Component-derived debt retains both component provenance records and is marked medium confidence.
- Existing SEC rights policy references travel with the observations into the bundle. `derived_calculation` is evaluated before EV uses them.
- Existing observation-bundle and snapshot hashes freeze the selected facts. Later filings or amendments create new observations and hashes rather than mutating old results.

## Coverage assessment

| EV component | Coverage | Reliability | Main limitation |
| --- | --- | --- | --- |
| Total debt | Partial-to-good for issuers using supported standard tags | High for direct aggregates; medium for strictly aligned component sums | Issuer extensions, alternative debt classifications, and incomplete component reporting can leave debt unavailable. |
| Cash | Good when the narrow standard cash tag is reported | High | Combined cash/restricted-cash facts are intentionally rejected; marketable securities are excluded. |
| Preferred equity | Sparse but explicit | High when reported | Absence cannot establish a zero balance; issuer-specific or mezzanine classifications may be missed. |
| NCI | Variable but explicit | High when reported | Absence cannot establish zero; redeemable or issuer-extension concepts are not normalized in V1. |

Direct SEC data is **not sufficient by itself for a universally reliable production EV V1**. It can produce a complete and well-supported EV for issuers that explicitly report all four components through supported standard concepts. For many ordinary issuers, however, preferred equity and NCI are omitted because they are not applicable or material, and Company Facts alone does not safely distinguish that state from unknown. Broadstone therefore correctly returns incomplete EV rather than fabricating zeros.

## Public Comps readiness after this slice

| Metric | Status | Missing input or limitation |
| --- | --- | --- |
| Revenue | Ready where supported SEC revenue tags exist | Issuer taxonomy variability remains. |
| Revenue growth | Ready | Two comparable annual observations. |
| Operating margin | Ready | Period-aligned revenue and operating income. |
| Net income margin | Ready | Period-aligned revenue and net income. |
| Market cap | Ready | Canonical price and shares. |
| Enterprise value | Conditionally ready | All four explicit EV bridge observations; missing optional-looking components cannot default to zero. |
| P/E | Ready with limitation | Fiscal-year earnings, not LTM. |
| EV / Revenue | Conditionally ready | Complete EV and aligned revenue. |
| EBITDA | Unavailable | Approved public EBITDA basis and source. |
| EBITDA margin | Unavailable | Approved public EBITDA basis and source. |
| EV / EBITDA | Unavailable | Complete EV plus approved EBITDA basis. |

## EBITDA next-step analysis

| Path | Expected coverage | Reliability | Cost | Licensing / rights | Engineering | Fit |
| --- | --- | --- | --- | --- | --- | --- |
| Direct SEC-derived calculated EBITDA | Moderate and taxonomy-dependent | Medium at best until D&A and operating-income policies cover issuer variation | No data fee | Low licensing complexity; SEC access and attribution policy still apply | High because calculation, tag precedence, period alignment, and exceptions become Broadstone methodology | Useful validation path, but not the primary production source |
| OpenBB with provider-routed fundamentals | Depends on the selected underlying provider | Potentially good; OpenBB does not improve the underlying data definition | OpenBB layer can be open source, while providers may be paid | Must evaluate each provider's license and permitted uses | Medium; routing is accelerated but canonicalization and rights remain Broadstone-owned | Best next prototype path for comparing providers behind the existing boundary |
| Direct free fundamentals provider | Often broad headline coverage with rate or history limits | Low-to-medium without contractual guarantees and definition validation | Low | Free-tier terms may restrict commercial, stored, derived, or redistributed use | Medium | Suitable only for evaluation fixtures, not the default production foundation |
| Licensed institutional provider | Broad historical, LTM, standardized, and often consensus coverage | Highest, subject to diligence and reconciliation | High | Contractual rights are complex but explicit | Medium-to-high integration effort; lower methodology ambiguity | Preferred production destination once requirements and budget are approved |

### Recommendation

Use **OpenBB with one explicitly selected underlying fundamentals provider** as the next controlled prototype slice. Treat OpenBB only as a replaceable transport/router, retain Broadstone canonical contracts and rights evaluation, and compare reported annual/LTM EBITDA definitions against SEC filings. This gives the fastest evidence on coverage and definition quality without coupling Market Calculations to OpenBB. Production adoption should still require provider licensing and validation; a future institutional provider remains the likely production-grade destination if commercial rights or coverage are insufficient.
