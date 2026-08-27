# OpenBB and public-data prototype decision record

Date examined: 2026-08-26

## OpenBB evidence examined

- Repository: `https://github.com/OpenBB-finance/OpenBB`
- Branch and commit: `develop` at `3e071fcc2cd9f891cac6040ae60296dba76dab46`
- Reference tag queried: `v4.5.0` at `88947ab5d9de28a4c90cc650a87d6d5444938019`
- Component evaluated: Open Data Platform, including `openbb_platform` and its SEC provider extension
- Repository license: GNU Affero General Public License v3.0. The repository license states that all files are AGPLv3.
- Architecture: Python packages and provider extensions, with an optional self-hosted FastAPI service (`openbb-api`). Provider credentials vary; the SEC connector does not require a paid subscription.
- Primary sources:
  - `https://github.com/OpenBB-finance/OpenBB`
  - `https://raw.githubusercontent.com/OpenBB-finance/OpenBB/develop/LICENSE`
  - `https://github.com/OpenBB-finance/OpenBB/blob/develop/openbb_platform/README.md`

This is an engineering dependency assessment, not legal advice.

## Decision

No OpenBB code, package, type, hosted API, or runtime service is incorporated in this prototype.

The current OpenBB repository's AGPLv3 license and Python/framework dependency surface create avoidable coupling for a proprietary TypeScript product at this stage. Broadstone instead implements its own provider contract and a removable direct SEC EDGAR adapter. An isolated OpenBB service can be reconsidered later if its multi-provider normalization materially outweighs deployment and license-compliance costs.

## Selected V1 source

The prototype uses official SEC EDGAR JSON endpoints directly:

- Company/ticker identity: `https://www.sec.gov/files/company_tickers.json`
- Company facts: `https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json`

SEC documentation states that `data.sec.gov` provides JSON submissions and XBRL APIs without authentication or API keys. Automated requests must follow SEC access policies and identify the caller through a User-Agent.

The direct adapter currently translates supported annual 10-K facts for:

- Revenue
- Operating income
- Net income
- Shares outstanding

Reported EBITDA is deliberately unavailable because it is not a consistently standardized SEC company fact. Share price and market capitalization are also unavailable because SEC EDGAR is not a market-price source. No values are synthesized.

## Provenance boundary

Canonical observations distinguish:

- Broadstone provider/transport: `Broadstone SEC Direct`
- Underlying data source: `SEC EDGAR`
- Original XBRL tag
- CIK and requested ticker
- Accession number and filing date
- Form, fiscal period, frame, unit, effective period, and retrieval timestamp

SEC response objects stay inside `SecPublicMarketProvider`; downstream code receives only Broadstone contracts.

## Failure behavior

The provider returns structured issues for company-not-found, missing metric, missing period, provider unavailable, malformed response, rate limiting, and rejected access/User-Agent policy. It never substitutes fabricated values.

## OpenBB shutdown simulation

If OpenBB disappears permanently tomorrow:

- Broadstone's canonical contracts, public-provider interface, SEC transport, SEC translation, tests, and future downstream business logic continue working.
- Nothing in this prototype stops working because no OpenBB runtime or hosted service is used.
- A future OpenBB-backed implementation would be replaced behind `PublicMarketProvider`; canonical contracts and Market Engine/Public Comps logic would not change.
- Direct access to the current underlying SEC source is already implemented.
- Replacement complexity is localized to one provider adapter and its tests.

## Maintenance and persistence notes

- SEC taxonomy tags and filing practices can evolve, so supported-tag priorities and fixtures require maintenance.
- Production use should add respectful request throttling, response caching, reproducible snapshots, and monitoring.
- No database or cache persistence is introduced in this slice.
- Historical reproducibility and a price-data provider belong to the future Market Engine design.

## Manual live verification

Network verification is intentionally separate from deterministic automated tests. Supply a real SEC-compliant contact identity:

```powershell
$env:SEC_USER_AGENT = "Broadstone engineering-contact@example.com"
npm run verify:public-data -- AAPL 320193
npm run verify:public-data -- MSFT 789019
```

Review the JSON for company lookup, annual periods, financial observations, shares outstanding, provenance, and explicit unavailable-metric issues. Do not use a placeholder contact identity against SEC production endpoints.
