# Market price provider prototype decision

Date examined: 2026-08-27

## Decision

Broadstone uses a removable direct Twelve Data adapter for the first daily closing-price prototype. No Twelve Data SDK is installed: the adapter calls the documented REST `time_series` endpoint through an injectable transport and translates the response into Broadstone contracts.

The supported convention is the unadjusted completed daily close. The adapter supports the latest returned close and the most recent completed close on or before a requested valuation date. A date-only Twelve Data `end_date` is treated as an exclusive boundary, so the transport requests the following calendar date and the adapter independently rejects observations after the requested valuation date.

Official sources examined:

- API and time-series schema: `https://twelvedata.com/docs`
- Historical `end_date` behavior: `https://support.twelvedata.com/en/articles/5214728-getting-historical-data`
- Terms, last updated January 1, 2026: `https://twelvedata.com/terms`
- Commercial versus personal usage: `https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage`

This is an engineering and policy-boundary assessment, not legal advice.

## Rights posture

The Twelve Data free/basic path is suitable only for Broadstone's non-production development and evaluation. The provider terms distinguish internal use from external display and prohibit Free Tier commercial use. Subscription tiers, underlying exchanges, and third-party providers can impose additional terms.

Broadstone therefore encodes a conservative prototype policy:

- Internal live analysis, internal display, and internal derived calculations: allowed for non-production evaluation.
- In-memory request-coalescing cache: allowed for at most five minutes under the prototype policy.
- Persistent retention, saved-analysis persistence, external display, reports, raw export, and redistribution: prohibited.
- AI context: review required.
- Production or client use: requires a business subscription and explicit rights review.

The policy is versioned and travels with the canonical observation into snapshot content.

## Why direct access instead of OpenBB

OpenBB was evaluated at the existing pinned repository decision point:

- Repository: `https://github.com/OpenBB-finance/OpenBB`
- Branch and commit: `develop` at `3e071fcc2cd9f891cac6040ae60296dba76dab46`
- Component: Open Data Platform `equity.price.historical` provider routing
- Repository license: GNU Affero General Public License v3.0
- Runtime shape: Python packages or an isolated self-hosted FastAPI service

OpenBB supports historical-price routing across providers and could accelerate a future multi-provider service. It does not, however, grant or clarify rights to the underlying market data. For one narrow REST endpoint, adding a Python/AGPL service would increase deployment, maintenance, shutdown, and compliance work without reducing the Twelve Data adapter or policy work.

No OpenBB code, package, type, account, hosted control plane, or runtime service entered Broadstone in this slice.

## Replacement and shutdown behavior

If Twelve Data stops working, replacement is localized to:

- one `MarketPriceProvider` adapter;
- its transport and response translation;
- its provider-specific rights and freshness policy;
- provider fixtures and operational configuration.

Canonical observations, rights evaluation, caching, observation bundles, snapshots, future calculations, and consumers do not depend on Twelve Data objects.

If the provider is unavailable or credentials are removed, the adapter returns a structured issue and no price. It never substitutes zero or a stale fabricated value.

## Security and persistence notes

- API credentials remain environment/runtime configuration and are never stored in observations or cache keys.
- Cache storage is in process memory only.
- No market-price table or database migration exists.
- The snapshot compatibility test freezes price data in memory, but the prototype rights policy blocks saved-analysis persistence.
- A lightweight security identity is sufficient for this prototype. Production persistence will eventually need a reviewed company/security master with exchange, share class, identifier history, and corporate-action handling.

## Manual live verification

Automated tests use deterministic transports and make no network calls. With an authorized Twelve Data key:

```powershell
$env:TWELVE_DATA_API_KEY = "your-authorized-key"
npm run verify:price-data -- AAPL
npm run verify:price-data -- AAPL 2026-06-30
```

Review the canonical observation, security ID, unadjusted-close convention, currency, effective date, provider versus underlying source, retrieval timestamp, freshness state, and rights reference. Remove the environment variable after verification.

