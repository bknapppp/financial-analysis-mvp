# Broadstone Frontend Migration Architecture

## Status and scope

This document governs new frontend work for Broadstone. Broadstone is an institutional transaction execution platform, and the migration is an incremental frontend and workflow-shell replacement around the existing financial engine. It is not a rewrite of financial calculations, Supabase persistence, import behavior, or exports.

The current application remains the operational baseline until each replacement route is verified. This architecture distinguishes immediate frontend migration work from future platform work such as tenant authorization and new workflow entities.

## A. Architectural objectives

The target architecture must support:

- A deal-centered workspace in which overview, phases, documents, workpapers, findings, reports, analytics, tasks, team, Q&A, and close share one canonical deal context.
- Incremental replacement of current routes and components without requiring a large initial file move.
- Behavioral preservation of the financial engine in `lib/`, including imports, mapping, normalization, calculations, reconciliation, underwriting, provenance, and exports.
- Direct URL navigation for every major workspace, phase, selected tab, and durable record context where sharing or browser history matters.
- Reusable institutional components, with tables as the primary interaction surface and cards used to support—not replace—operational tables.
- Server-authoritative domain data and page-specific typed view models rather than a single application-wide dashboard aggregate.
- Traceability from displayed values and issues to source documents, source records, normalized records, assumptions, mappings, and approvals.
- Consistent visibility of owner, status, due date, blocker, evidence, and financial impact wherever those concepts apply.
- A future path to multiple users, organizations, memberships, and deal-scoped authorization without embedding tenant assumptions in presentation components.

The architecture must answer the operating question: **what must the analyst accomplish next to advance this transaction?** Features that cannot participate in a transaction workflow should not become first-class navigation or isolated product surfaces.

## B. Current-state summary

Broadstone currently uses Next.js 15 App Router, React 19, strict TypeScript, Tailwind CSS, and Supabase. Server pages such as `app/page.tsx`, `app/financials/page.tsx`, and `app/deal/[companyId]/page.tsx` load a large `DashboardData` aggregate through `lib/data.ts` and pass it to client-side workspace components.

The financial and diligence domain logic is concentrated in `lib/` and is covered by the existing regression suite. The current frontend has only a small route set: `/`, `/financials`, `/deals`, `/deal/[companyId]`, `/deal/[companyId]/underwriting`, and `/source-data?companyId=...`. Several large client components combine presentation, local state, workflow orchestration, and derivation, notably:

- `components/deal-workspace-view.tsx`
- `components/csv-import-section.tsx`
- `components/step-based-import-flow.tsx`
- `components/deals-screener-table.tsx`
- `components/add-back-review-panel.tsx`

The current separation is directionally sound—server routes, API routes, components, domain modules, and Supabase SQL are distinct—but inconsistent. Some financial view construction and workflow classification remain inside React components or route files. The target architecture strengthens these boundaries without invalidating working code.

## C. Target directory structure

The following structure is the destination for new work. It is not an instruction to move all existing files immediately.

```text
app/
  deals/
  deal/
    [companyId]/
      layout.tsx
      overview/
      phases/
        planning/
        requests/
        analysis/
        findings/
        reporting/
        close/
      documents/
      workpapers/
      reports/
      analytics/
      tasks/
      team/
      qa/
      settings/
  api/

components/
  ui/                 # Shared visual primitives
  layout/             # App shell and deal-scoped layout components
  financial/          # Reusable financial display components

features/
  overview/
  planning/
  requests/
  analysis/
  documents/
  findings/
  workpapers/
  reporting/
  analytics/
  close/

lib/
  financial/          # Destination namespace for protected financial modules
  view-models/        # Page-specific, typed presentation models
  formatting/         # Pure display formatting
  validation/         # Transport/form validation without persistence

services/
  api/                # Typed client wrappers for application API routes
  supabase/           # Server-only repositories and persistence services

hooks/                # Focused client interaction/workflow hooks
types/                # Cross-feature contracts; domain-local types remain local
```

### Adoption rules

- New shared primitives go in `components/ui/`; new shell components go in `components/layout/`.
- New transaction capabilities go in `features/<domain>/`, with components, loaders, view models, and feature-local types colocated when practical.
- Existing protected modules in `lib/` remain in place during the frontend migration. Moving them is neither required nor desirable during early phases.
- Existing reusable financial components may remain under `components/` until migrated behind stable compatibility exports.
- `lib/types.ts` remains the compatibility type surface initially. New domains should define narrower feature-local contracts instead of enlarging it indefinitely.
- Compatibility exports may preserve imports while implementation files move gradually. A compatibility export must not alter runtime behavior.
- No migration phase should mix broad directory reorganization with visual replacement and financial behavior changes.

## D. Layer responsibilities

### App Router pages and layouts

Responsibilities:

- Resolve route parameters and search parameters.
- Establish deal context and route-level authorization when available.
- Invoke server loaders.
- Compose feature components, loading boundaries, error boundaries, and metadata.
- Define canonical URLs and redirect verified legacy routes.

Prohibited concerns:

- Financial formulas, sign normalization, category mapping, reconciliation rules, or source precedence.
- Large presentation-specific derivations.
- Direct construction of complex database queries when a repository or loader exists.
- Page-local copies of shared navigation or shell markup.

Route files should remain composition-oriented. The benchmark mapping and formatting currently embedded in `app/deal/[companyId]/page.tsx` should eventually move to a view-model builder, but this refactor is incremental.

### Server data loaders

Responsibilities:

- Load deal-scoped authoritative records through server-only services.
- Coordinate domain services required by one page.
- Distinguish not-found, empty, unauthorized, degraded, and infrastructure-error results.
- Return typed domain inputs or a page-specific view model.

Prohibited concerns:

- JSX, CSS classes, icon selection, or client interaction state.
- Silent conversion of infrastructure failures into empty results.
- Unrelated application-wide data aggregation.

`lib/data.ts` remains the compatibility loader during migration. New routes should prefer narrower loaders rather than adding more fields to `DashboardData`.

### View-model builders

Responsibilities:

- Convert authoritative domain output into a typed, page-specific model.
- Group records for tables and inspectors.
- Add display labels, URLs, permissions, empty-state reasons, and formatting-ready values.
- Expose evidence, ownership, status, due dates, blockers, confidence, and financial impact.

Prohibited concerns:

- Changing formulas, signs, tolerances, category decisions, or source selection.
- Writing to the database.
- Hiding missing or failed data behind a fabricated zero.

View models may format a calculated EBITDA value; they may not calculate EBITDA.

### Feature modules

Responsibilities:

- Implement one transaction capability or phase.
- Compose loaders, view models, domain components, and shared primitives.
- Own feature-specific client state and feature-local types.
- Provide explicit interfaces to linked transaction objects.

Prohibited concerns:

- Reimplementing shared tables, badges, drawers, formatting, or financial logic.
- Accessing Supabase directly from client components.
- Depending on unrelated feature internals.

### Shared UI primitives

Responsibilities:

- Provide semantic, accessible, presentation-only building blocks.
- Encode the institutional token system, density, states, and interaction behavior.
- Support composition through typed variants.

Prohibited concerns:

- Deal, financial, diligence, or reporting calculations.
- Fetching data.
- Page-specific labels or status rules.
- Raw business-object mutation.

### Domain components

Responsibilities:

- Display a recognized domain concept using already-derived data, such as a financial statement, reconciliation result, issue summary, or evidence backing.
- Preserve domain semantics and drill-down affordances.

Prohibited concerns:

- Recomputing authoritative financial results.
- Bypassing view-model contracts to query persistence.

### Financial-domain modules

Responsibilities:

- Own financial ingestion, mapping, normalization, calculations, reconciliation, underwriting, provenance, and exports.
- Remain deterministic and testable.
- Expose stable typed functions to loaders and adapters.

Prohibited concerns:

- JSX, Tailwind classes, route construction, page labels, or UI state.

### API routes

Responsibilities:

- Validate transport input.
- Enforce authentication and authorization when those controls are available.
- Call domain and persistence services.
- Return typed success or error responses.

Prohibited concerns:

- Page formatting, UI labels, CSS, or navigation decisions.
- Duplicating domain formulas.
- Unbounded orchestration when it can be extracted into a service.

The current `app/api/financial-import/route.ts` remains a compatibility endpoint but should be decomposed behind services as the import UI migrates.

### Persistence services

Responsibilities:

- Remain server-only.
- Encapsulate Supabase queries, inserts, updates, transactions, and record mapping.
- Enforce deal and organization scope when authorization exists.
- Preserve current persistence semantics unless separately approved.

Prohibited concerns:

- UI formatting or feature-specific layout decisions.
- Exposure of service-role credentials to client code.

### Client hooks

Responsibilities:

- Encapsulate local interaction state, workflow reducers, debouncing, selection, and typed mutation calls.
- Expose explicit pending, success, and error states.

Prohibited concerns:

- Financial calculations.
- Hidden global state.
- Direct service-role or Supabase access.

### Formatting utilities

Responsibilities:

- Pure formatting of currency, percentages, multiples, dates, periods, units, and labels.
- Preserve null and unavailable states distinctly from zero.

Prohibited concerns:

- Calculating business values or choosing authoritative sources.

### Shared types

Responsibilities:

- Define stable contracts shared across more than one feature.
- Separate persistence rows, domain models, API contracts, and presentation view models.

Prohibited concerns:

- Becoming an unbounded registry of every component prop and local state shape.

## E. Target routing strategy

### Canonical hierarchy

```text
/deals
/deal/[companyId]/overview
/deal/[companyId]/phases/planning
/deal/[companyId]/phases/requests
/deal/[companyId]/phases/analysis
/deal/[companyId]/phases/findings
/deal/[companyId]/phases/reporting
/deal/[companyId]/phases/close
/deal/[companyId]/documents
/deal/[companyId]/workpapers
/deal/[companyId]/reports
/deal/[companyId]/analytics
/deal/[companyId]/tasks
/deal/[companyId]/team
/deal/[companyId]/qa
/deal/[companyId]/settings
```

`app/deal/[companyId]/layout.tsx` should load the minimum deal identity and access context required by every child route and render the persistent shell. Page-specific data must remain in page-level loaders so navigation does not force all transaction data into one aggregate.

### Legacy route continuity

- `/deal/[companyId]` remains available until Overview is verified, then redirects to `/deal/[companyId]/overview`.
- `/deal/[companyId]/underwriting` remains available until the relevant Analysis/Analytics replacement is verified. Existing deep links must either continue rendering or redirect to the exact replacement tab.
- `/source-data?companyId=...` remains available throughout Analysis migration. Its eventual canonical destination is `/deal/[companyId]/phases/analysis`, with a query or nested route selecting the source-data/import tab.
- `/financials?companyId=...` and `/` remain compatibility routes until all financial deep links have a verified destination.
- Existing `buildFixItHref`, backing links, diligence action links, export links, and next-action links must receive explicit compatibility mapping before a legacy route is removed.

### Route states

Every canonical route must provide:

- A route-level loading state shaped like the final page rather than a generic spinner.
- A visible, recoverable infrastructure-error state.
- A distinct no-deal/not-found state.
- A distinct empty-workspace state when the request succeeded but no records exist.
- A permission-denied state when authorization is introduced.
- Nested loading boundaries for inspectors or secondary panels when they can load independently.

## F. Data flow

The target render flow is:

```text
Route
  → server loader
  → persistence and domain services
  → typed page-specific view model
  → server feature component where possible
  → focused client component where interaction requires it
  → shared UI primitives
```

Server components are preferred for initial rendering, tables that do not require immediate client interaction, summaries, static metadata, and composition. Client components are justified for forms, sortable/filterable interactive tables, inspectors with local selection, upload workflows, dialogs, optimistic mutations, charts requiring browser APIs, and complex keyboard interaction.

A client boundary should be placed around the smallest useful interactive region. Marking an entire page `"use client"` solely because one control needs state is prohibited for new pages.

## G. State management

- **Authoritative server state:** deals, financial records, mappings, issues, documents, workflow status, owners, due dates, versions, and approvals.
- **URL-addressable state:** current deal, major route, phase, durable tab, filters worth sharing, pagination when required, and selected inspector record when deep linking has operational value.
- **Local interaction state:** open menus, draft input, hover, disclosure state, non-durable inspector selection, and temporary upload progress.
- **Workflow reducers:** use explicit reducers or workflow hooks for multi-step import, request response, workpaper review, and report review flows with multiple transitions.
- **Forms:** maintain typed drafts locally; validate at both client boundary and server mutation boundary; never treat unsaved form state as authoritative.
- **Filters and pagination:** initialize from URL state for shareable tables; server-side pagination is preferred for unbounded datasets.
- **Inspectors:** use the URL when selection must survive refresh or be shared; otherwise local state is acceptable. Closing must restore focus to the originating row.
- **Optimistic updates:** permitted only for reversible, low-risk workflow mutations with a clear rollback state. Financial imports, mapping changes, add-back approvals, reconciliations, and closing adjustments require confirmed server results.
- **Refresh:** mutations must refresh or invalidate the narrowest authoritative route data. Full-page reloads are a compatibility fallback, not the target pattern.

A global client-state library must not be introduced unless a concrete cross-route state requirement cannot be met by server state, URL state, composition, or focused hooks.

## H. Financial-engine protection boundary

### Protected modules

The following existing modules are behaviorally protected during frontend migration:

- Ingestion and parsing: `lib/statement-parser.ts`, `lib/import-preview.ts`, `lib/import-periods.ts`, `lib/import-mapping.ts`, `lib/workbook-context.ts`, `lib/manual-tax-ingestion.ts`
- Mapping and normalization: `lib/auto-mapping.ts`, `lib/mapping-memory.ts`, `lib/mapping-intelligence.ts`, `lib/reported-sign-normalization.ts`, `lib/income-statement-rollup.ts`, `lib/normalized-outputs.ts`
- Calculations and sources: `lib/calculations.ts`, `lib/add-backs.ts`, `lib/tax-ebitda.ts`, `lib/financial-sources.ts`, `lib/reconciliation.ts`, `lib/source-reconciliation.ts`
- Underwriting and risk: `lib/credit-scenario.ts`, `lib/underwriting/analysis.ts`, `lib/underwriting/ebitda.ts`, `lib/underwriting/completion.ts`, `lib/underwriting/investment-overview.ts`, `lib/risk-flags.ts`, `lib/data-quality.ts`, `lib/data-readiness.ts`
- Provenance and output: `lib/backing.ts`, `lib/report-export.ts`, `lib/report-export-xlsx.ts`, `components/financials-view-rollup.ts`

### Interaction rules

- New pages consume these modules through existing functions or typed adapters.
- No frontend migration may change formulas, sign rules, category rules, tolerances, source precedence, mapping behavior, or export values.
- Presentation code must not recreate a protected calculation for convenience.
- Existing regression tests must remain green at every checkpoint.
- Refactors inside the protected boundary require separate approval and dedicated equivalence evidence.
- Canonical fixtures and output snapshots should be added in a later preservation task for representative imports, normalized statements, EBITDA, reconciliation, underwriting, and PDF/Excel/CSV outputs.

## I. Supabase and authorization boundary

The current `lib/supabase.ts` creates a server client with `SUPABASE_SERVICE_ROLE_KEY`. This bypasses RLS. Although the SQL enables RLS and defines authenticated-user policies, the audited repository does not show a complete application-level user, organization, membership, or deal-access architecture.

The desired future boundary is:

- Application-level user identity established on the server.
- Organization membership and role assignment.
- Explicit deal access scoped through organization or engagement membership.
- Server-only privileged operations with narrow purposes.
- Ordinary reads and mutations executed with tenant context.
- RLS policies aligned with organization membership and deal access.
- Audit attribution through `created_by` and `updated_by` identities.

No client component may call Supabase with privileged credentials. New persistence code must remain server-only even before the future authorization model is implemented.

Authorization is a **critical parallel platform workstream**, not part of the first visual redesign phase. The frontend shell must avoid assumptions that make tenant enforcement harder, but this documentation does not redesign authentication or authorize schema changes.

## J. Error handling and observability

- API routes should return a typed error envelope containing a stable code, user-safe message, optional field errors, correlation identifier, and retry guidance where appropriate.
- Loaders must distinguish successful empty results from infrastructure errors. Broad catch blocks that return empty arrays or empty dashboards should not be copied into new loaders.
- Empty states must explain what is absent and the valid next action.
- User-facing errors must preserve entered data when possible and identify whether retry is safe.
- Mutation failures must be displayed beside the affected control or in a durable alert; console-only failures are insufficient.
- Server logs should include route, operation, deal identifier, correlation identifier, duration, and failure category without logging financial source contents or credentials.
- Material workflow mutations should eventually create activity events containing actor, object, action, timestamp, prior status, and resulting status.
- Audit activity is not the same as debug logging. Audit records must be durable and user-attributable when the platform model supports them.

## K. Testing strategy

### Required immediately

- Existing protected financial regression tests on every migration checkpoint.
- ESLint and TypeScript validation.
- Focused view-model unit tests for every new non-trivial page model.
- Route-level tests for parameter handling, not-found, empty, and failure states where infrastructure permits.
- Manual keyboard and responsive verification for new shared primitives until automated coverage exists.

### Required as the component foundation is introduced

- Component interaction tests for tables, menus, dialogs, tabs, inspectors, forms, and status presentation.
- Accessibility tests covering semantics, focus management, labels, contrast, and keyboard flows.
- Visual regression baselines for the application shell, dense tables, financial tables, and each completed wireframe-aligned route.

### Required before legacy route retirement

- Browser-level tests for the end-to-end workflow supported by the replacement route.
- Financial-output comparison between legacy and replacement views.
- Deep-link and redirect verification.
- Export-value regression verification where the page exposes exports.

## L. Architecture decision rules

1. No financial calculations in pages, shared UI primitives, or presentation components.
2. No formula, sign, category, tolerance, source-precedence, or export-value changes during frontend migration.
3. No new page-specific status-color functions; use the canonical semantic status system.
4. No new page-local table foundations; extend the shared `DataTable` system.
5. No direct Supabase access from client components and no exposure of service-role credentials.
6. No new deal workspace route may bypass the shared deal context layout.
7. New routes use page-specific view models rather than enlarging `DashboardData` by default.
8. Server components are the default; client components require a concrete interaction need.
9. Empty data, unavailable data, and infrastructure failure must remain distinct.
10. Every material financial value must retain a path to source backing or an explicit unavailable state.
11. Every operational table should expose owner, status, due date, blocker, and financial impact when relevant.
12. No migration phase may remove a working legacy route before replacement verification and redirect coverage.
13. No broad source-file move should be combined with a page redesign unless required for a narrow, reviewed boundary.
14. Additive workflow and authorization schema work requires separate approval from visual migration work.
