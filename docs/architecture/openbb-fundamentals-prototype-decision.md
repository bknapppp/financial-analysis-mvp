# Isolated OpenBB Fundamentals Prototype Decision

## Decision record

- Inspected repository: `OpenBB-finance/OpenBB`
- Inspected release/tag: `v4.7.0`
- Inspected release commit: `dddc3b3`
- Release date shown by GitHub: March 9, 2026
- Repository license at that tag: GNU Affero General Public License v3.0 (AGPLv3)
- Selected underlying provider: Financial Modeling Prep (`fmp`)
- Broadstone integration form: HTTP calls to a separately operated OpenBB FastAPI service; no OpenBB package or type is incorporated into Broadstone

OpenBB is a Python data-integration platform. The inspected repository documents `pip install openbb`, a local `openbb-api` FastAPI/Uvicorn server, and provider credentials supplied through local configuration or environment variables. OpenBB Workspace, hosted authentication, and its control plane are not required for this prototype. OpenBB must remain an isolated service unless legal review approves another arrangement because the inspected implementation is AGPLv3.

Relevant inspected routes:

- `/api/v1/equity/fundamental/income?provider=fmp` for annual and TTM income data
- `/api/v1/equity/fundamental/balance?provider=fmp` for annual balance sheets
- `/equity/fundamental/metrics` documents FMP EBITDA, total debt, enterprise value, and TTM selection
- `/equity/estimates/forward_ebitda` supports FMP and Intrinio, but consensus EBITDA is outside this slice

Sources inspected on August 27, 2026:

- https://github.com/OpenBB-finance/OpenBB/tree/v4.7.0
- https://github.com/OpenBB-finance/OpenBB/releases/tag/v4.7.0
- https://raw.githubusercontent.com/OpenBB-finance/OpenBB/v4.7.0/LICENSE
- https://docs.openbb.co/odp/python/reference/equity/fundamental/income
- https://docs.openbb.co/odp/python/reference/equity/fundamental/balance
- https://docs.openbb.co/odp/python/reference/equity/fundamental/metrics
- https://site.financialmodelingprep.com/terms-of-service

## Why FMP was selected

FMP was selected over a multi-provider experiment because OpenBB documents it across annual/TTM income, balance sheets, key metrics, filings, and forward EBITDA. It therefore offers the best single-provider prototype surface for EBITDA plus EV components, historical periods, and later estimates. It also has a commercial upgrade path. This selection evaluates technical coverage only; it does not approve FMP licensing.

## Rights policy

FMP's published terms distinguish personal from commercial use and state that commercial analysis, internal or external multi-user display, derivative works, and distribution require the applicable subscription or specific agreement. No Broadstone order form was available for this slice. Consequently, `OPENBB_FMP_PROTOTYPE_RIGHTS_POLICY` marks every requested use `review_required`, including live analysis, caching, retention, saved analysis, derived calculations, display, reporting, export, AI context, and redistribution.

An API key working would not change that policy. Before any real provider data is used, Broadstone must obtain and review an order form that explicitly covers intended internal users, caching and retention, derived analytics, saved analyses, reports, exports, and any AI use. This is a conservative engineering control, not legal advice.

## Canonical translation and EBITDA bases

OpenBB response objects terminate inside `OpenBBFundamentalsProvider`. The provider emits only Broadstone contracts and preserves:

- transport: OpenBB 4.7.0 / `dddc3b3`
- underlying provider: FMP
- route and original provider field
- ticker, fiscal period, fiscal year, period ending, currency, and retrieval time
- versioned FMP rights-policy reference

Translated metrics:

- annual and LTM revenue
- annual operating income
- annual and LTM net income
- annual provider EBITDA as `public_reported_ebitda`
- provider LTM EBITDA as `public_ltm_ebitda`
- total debt
- cash and cash equivalents
- preferred equity when explicitly supplied
- non-controlling interest when explicitly supplied

The `public_reported` label means “provider annual EBITDA observation,” not a claim that the issuer explicitly reported a standardized GAAP EBITDA line. Results carry a warning that FMP methodology may be calculated. `public_ltm` remains a separate period and basis. The calculation caller must explicitly request a basis; no default precedence exists.

## Deterministic eight-profile coverage study

The automated study uses sanitized deterministic profiles representing software, industrial, consumer, highly levered, low/no-debt, loss-making, NCI, preferred-equity, and differing fiscal-year patterns. It is an architecture and missing-data study, not a claim about live FMP coverage.

| Metric | Coverage | Confidence | Main failure mode | Basis |
| --- | ---: | --- | --- | --- |
| Revenue | 100% | Medium | Provider/filing period or definition difference | Annual and LTM |
| EBITDA | 75% | Medium-low | Missing value or unclear provider calculation methodology | Provider annual |
| LTM EBITDA | 75% | Medium-low | Missing LTM value or unclear roll-forward methodology | Provider LTM |
| Operating income | 100% | Medium | Provider normalization or period difference | Annual |
| Net income | 100% | Medium | Attributable/consolidated definition difference | Annual and LTM |
| Total debt | 87.5% | Medium | No debt field does not prove zero; classification differences | Point-in-time annual |
| Cash | 100% | Medium | Cash versus cash-plus-investments/restricted-cash definition | Point-in-time annual |
| Preferred equity | 25% | Medium when explicit | Usually missing; absence is not zero | Point-in-time annual |
| NCI | 37.5% | Medium when explicit | Usually missing; redeemable classifications vary | Point-in-time annual |

No provider market-cap or enterprise-value observation is translated in this slice. Broadstone continues to calculate authoritative market capitalization and EV.

## SEC comparison

The comparison utility retains provider and SEC observations independently and classifies exact matches, values within a configurable tolerance, material unexplained differences, and missing-on-one-side cases. Deterministic tests cover all four classifications across revenue, operating income, net income, debt, and cash.

SEC remains superior for primary-source filing provenance, original XBRL tags, accessions, filing dates, and point-in-time anti-look-ahead analysis. FMP through OpenBB improves normalized EBITDA/LTM availability and can fill standard balance-sheet fields across issuer tag variation. It is not automatically authoritative: period, consolidation, debt, cash, and EBITDA methodology differences must remain visible until a future composition policy is approved.

## Calculation and snapshot result

With a synthetic policy representing approved contractual rights, the same Market Calculation Service calculates:

- EV and EV/Revenue from complete canonical EV inputs
- annual provider EBITDA and EBITDA margin under `public_reported`
- LTM provider EBITDA and EBITDA margin under `public_ltm`
- basis-labeled EV/EBITDA for either explicit basis

With the actual conservative prototype policy, derived calculations are blocked pending review. Missing values never become zero. Observation bundles and calculation manifests freeze the transport, provider, basis, periods, rights version, and provenance without redesign.

## Live verification

No approved FMP credentials/order form were available, so no live provider call was made. Automated tests use deterministic fixtures. After licensing approval:

1. Operate unmodified OpenBB v4.7.0 as a separate service.
2. Configure the FMP API key inside that service, never in Broadstone source.
3. Set `OPENBB_BASE_URL` if the service is not at `http://127.0.0.1:6900`.
4. Optionally set `OPENBB_VERIFY_SYMBOLS` to a comma-separated representative set.
5. Run `node --experimental-strip-types scripts/verify-openbb-fundamentals.ts`.

The manual output excludes credentials and reports canonical values, periods, transport, underlying provider, rights reference, and issues.

## OpenBB shutdown test

If OpenBB disappears tomorrow:

- Broadstone canonical contracts, rights engine, cache/snapshot boundaries, SEC adapter, price provider, calculation methodologies, and Public Comps-facing contracts remain.
- Only `DirectOpenBBFundamentalsTransport` stops refreshing.
- A direct FMP transport or different provider adapter can implement `FundamentalsProvider` and emit the same canonical observations.
- Canonical contracts and Market Calculation formulas do not change.
- Future Public Comps behavior does not change except for data availability, freshness, or provider-attribution details.

The test suite proves a direct replacement implementation can satisfy the same provider boundary. The desired shutdown outcome—replace transport/adapter while the Broadstone domain remains unchanged—is achieved.

## Recommendation

Choose **A: continue the OpenBB-routed FMP provider for prototype evaluation**, subject to an approved commercial FMP order form before live use. OpenBB materially accelerates route normalization and annual/TTM experimentation while remaining replaceable. Do not adopt OpenBB as a domain dependency or assume FMP data rights. If FMP cannot contractually support Broadstone's internal analysis, retention, derived results, reporting, and future AI requirements, evaluate another provider before Public Comps rather than weakening the rights policy.

Broadstone is **data-ready for Public Comps V1 with limitations** after contractual rights and live coverage validation. The formulas and basis controls are ready; the remaining blockers are commercial authorization, live EBITDA definition reconciliation, and incomplete preferred-equity/NCI coverage.
