# Broadstone Data Foundation Checkpoint

## Purpose

This checkpoint closes the Broadstone Data Foundation workstream after the isolated OpenBB/FMP fundamentals and EBITDA prototype. The architecture gives Broadstone provider-neutral financial observations, Broadstone-owned calculation methodologies, explicit data rights, reproducible analytical snapshots, and replaceable public-data adapters. It deliberately stops before Public Comps, persistence, UI, Intelligence, Excel add-in, or MCP implementation.

Checkpoint branch: `feature/broadstone-data-foundation`

Verified implementation HEAD before this documentation commit: `38ff37dc7d8b51c44a8946329e99c8b0233bd8f7`

## Current Architecture

Private data path:

`Excel/CSV and existing private financial inputs`

→ `Broadstone canonical company / period / observation / unit / provenance model`

→ `Broadstone authoritative private calculation facade`

Public data path:

`SEC / Twelve Data / isolated OpenBB-routed FMP`

→ `replaceable Broadstone provider adapters`

→ `Broadstone canonical observations`

→ `provider rights + freshness/cache + provenance`

→ `immutable Market Observation Bundle`

→ `versioned Calculation Snapshot Manifest`

→ `Broadstone Market Calculation Service`

→ future `Public Comps / Workspace Intelligence / Excel / MCP`

The Market Calculation Service supports market capitalization, annual revenue growth, operating margin, net income margin, fiscal-year P/E, complete enterprise value, EV/Revenue, explicitly selected annual or LTM public EBITDA, EBITDA margin, and basis-labeled EV/EBITDA. Missing inputs never become implicit zeros. Currency and period compatibility, provider rights, lineage, and incomplete states are enforced.

## Providers

### SEC

Role: independent primary-source public filing integration through direct SEC EDGAR Company Facts access.

The SEC adapter translates supported revenue, operating income, net income, shares, debt, cash, preferred equity, and non-controlling-interest concepts while retaining XBRL tag, accession, form, filing date, reporting/balance-sheet date, fiscal context, frame, and retrieval timestamp. Historical valuation requests exclude facts filed after the valuation date. Unsupported or ambiguous EV components remain unavailable.

### Twelve Data

Role: prototype replaceable market-price feed.

The price adapter emits canonical security-matched unadjusted closing prices with effective date, currency, provenance, freshness, and a provider-specific rights-policy reference. Twelve Data prototype commercial-use restrictions remain intact.

### OpenBB

Role: isolated routing and normalization layer only.

The inspected prototype baseline is OpenBB `v4.7.0`, commit `dddc3b3`, licensed AGPLv3. Broadstone does not incorporate OpenBB implementation or types into its domain. OpenBB operates as a separately replaceable HTTP service. Two calculation warning strings describe observations as routed through OpenBB, but no calculation contract, formula, canonical type, snapshot type, or rights type depends on OpenBB.

### FMP

Role: prototype underlying fundamentals provider routed through OpenBB.

FMP and OpenBB are recorded separately in provenance. Annual and LTM EBITDA remain distinct canonical observations and require an explicit calculation basis. The conservative FMP policy marks all uses `review_required` until an applicable commercial agreement is approved. Deterministic fixtures prove translation and calculations; live production coverage has not been validated.

## Architectural Independence

### If OpenBB disappears

Only the OpenBB transport/provider refresh path stops. Broadstone canonical contracts, SEC integration, Twelve Data adapter, rights engine, cache/freshness policies, snapshots, calculations, and future Public Comps contracts remain. A direct FMP adapter can satisfy the same Broadstone `FundamentalsProvider` boundary.

### If FMP is replaced

Replace the provider adapter/transport, provider-specific translation, rights policy, and provider tests. Do not replace canonical contracts, calculation methodologies, snapshot architecture, or Public Comps-facing results.

### If Twelve Data is replaced

Replace only the market-price provider implementation, its provider policy, and related fixtures. The canonical market observation and Market Calculation Service remain unchanged.

### SEC independence

Direct SEC EDGAR integration remains available independently of OpenBB and FMP, preserving a primary-source filing path and historical anti-look-ahead behavior.

No unexpected functional or type-level provider coupling was found.

## Financial Integrity

- Existing private-company calculations retain golden-fixture parity; formulas were not rewritten.
- Provider-reported market capitalization and enterprise value do not replace Broadstone authoritative calculations.
- Enterprise value requires market capitalization, debt, cash, preferred equity, and NCI; an incomplete bridge remains incomplete.
- Missing preferred equity, NCI, debt, cash, revenue, or EBITDA is not treated as zero.
- Annual provider EBITDA and LTM provider EBITDA are separate metrics and periods.
- No generic EBITDA precedence exists; callers must request `public_reported` or `public_ltm`.
- Fiscal-year P/E remains explicitly distinguished from LTM P/E.
- Currency and period compatibility remain enforced; FX conversion is not implemented.
- SEC historical fact selection preserves anti-look-ahead behavior.
- Every calculation result retains methodology ID/version, bundle hash, and exact input observation IDs.

## Provenance

Private data:

`Canonical observation → Excel/CSV adapter → source document / sheet or file / row / field where supplied`

SEC:

`Canonical observation → Broadstone SEC adapter → SEC EDGAR → XBRL concept → accession → filing date → reporting or balance-sheet date → retrieval timestamp`

OpenBB/FMP:

`Canonical observation → Broadstone OpenBB adapter → OpenBB version/route → FMP underlying provider → original field / period / currency → retrieval timestamp`

Price:

`Canonical price → Broadstone Twelve Data adapter → Twelve Data symbol/series → effective date / retrieval timestamp`

Known provenance gaps are provider-originated: FMP fixture data does not establish the provider's exact EBITDA calculation or underlying filing reconciliation, and live FMP coverage has not been verified. Some private source locations are available only when the originating import supplied them.

## Rights, Cache, and Snapshot Integrity

Rights policies remain provider-specific and independently govern:

- live analysis
- temporary cache
- persistent retention
- saved analysis
- derived calculation
- internal and external display
- reports
- export
- AI context
- redistribution

The SEC policy is unchanged. Twelve Data prototype restrictions are unchanged. All actual OpenBB/FMP uses remain `review_required`; tests requiring calculation use an explicitly synthetic approved-rights fixture and do not loosen the production prototype policy.

Market Observation Bundles and Calculation Snapshot Manifests are recursively immutable and deterministically hashed. Analytically material state includes valuation date, selected period IDs, exact observations, provenance and retrieval timestamps, rights-policy references, provider identity, issues, methodology/calculation-engine versions, warnings, overrides, and predecessor references. Later provider responses create new bundles and hashes and cannot mutate a frozen prior analysis.

## Final Verification

Verified at implementation HEAD `38ff37dc7d8b51c44a8946329e99c8b0233bd8f7` before this documentation-only checkpoint:

- all targeted private calculation, canonical, Excel/CSV, SEC, SEC EV, price, rights, cache/freshness, snapshot, Market Calculation, OpenBB/FMP translation, EBITDA-basis, replacement/shutdown, coverage, and SEC-comparison tests: pass
- `npm test`: pass
- `npm run lint`: pass
- `npm run build`: pass; existing sandbox-denied page-generation fetches are logged but all 23 static pages generate successfully
- `npx tsc --noEmit`: fails only with the same 11 documented errors classified as **PRE-EXISTING TEST FIXTURE DEBT**; no Data Foundation error is present

Unrelated existing UI modifications, `.npm-cache` logs, and the stray `l.includes(t))){const` artifact are intentionally excluded from this checkpoint.

## Broadstone-Controlled Architecture

Broadstone owns or controls its independently implemented:

- canonical financial model
- provider interfaces and adapters
- provenance model
- calculation methodologies and calculation services
- provider-rights architecture
- freshness and cache policies
- observation-bundle and snapshot architecture
- future provider-composition logic

This section describes the Broadstone architecture and does not make ownership or licensing conclusions about third-party software or data.

## Known Limitations

- FMP commercial rights are unresolved; all actual uses remain review-required.
- FMP live production coverage is unverified.
- Provider annual/LTM EBITDA methodology has not been reconciled to filings.
- SEC-versus-provider precedence and conflict resolution are not approved.
- Direct SEC EV coverage remains incomplete for issuers without safely classifiable standard facts.
- Twelve Data remains a restricted prototype price source pending commercial review.
- There is no persistent market-data or calculation-snapshot store.
- There is no Public Comps UI, peer selection, quartiles, or valuation table.
- There is no platform-wide AI or Workspace Intelligence implementation.
- There is no Excel add-in or MCP/agent infrastructure implementation.
- The 11 pre-existing test-fixture TypeScript errors remain outside this workstream.

## Resume Conditions

Before production Public Comps integration:

1. Resolve FMP or replacement-provider commercial rights for all intended uses.
2. Run controlled live coverage validation across a representative issuer universe.
3. Reconcile provider annual and LTM EBITDA methodology against source filings.
4. Approve an explicit SEC/provider composition and discrepancy policy.

Do not redesign completed canonical, calculation, provenance, rights, cache, snapshot, or provider-boundary foundations without evidence of a genuine defect.

## Architecture Progress

`Existing Broadstone`

→ `Authoritative Calculation Foundation` ✓

→ `Canonical Financial Data + Provenance` ✓

→ `Excel/CSV Provider Adapter` ✓

→ `Public Data Prototype` ✓

→ `Market Engine: Snapshot Foundation` ✓

→ `Market Engine: Rights + Cache` ✓

→ `Market Engine: Price Data` ✓

→ `Market Engine: Calculations` ✓

→ `SEC Enterprise Value Inputs` ✓

→ `Fundamentals / EBITDA Prototype` ✓

→ **DATA FOUNDATION CHECKPOINT ✓**

Future:

→ `Public Comps`

→ `Workspace Intelligence`

→ `Excel Add-in`

→ `MCP / Agent Infrastructure`

## Resume Reading Order

1. `docs/architecture/broadstone-data-foundation-checkpoint.md`
2. `docs/architecture/market-calculation-methodologies.md`
3. `docs/architecture/sec-enterprise-value-coverage.md`
4. `docs/architecture/openbb-fundamentals-prototype-decision.md`
5. `docs/architecture/market-price-provider-decision.md`
6. `lib/broadstone/canonical/`
7. `lib/broadstone/market/`
8. `lib/broadstone/providers/`
