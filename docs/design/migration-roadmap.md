# Broadstone Frontend Migration Roadmap

## Purpose

This roadmap sequences the incremental migration from the current financial-analysis MVP into Broadstone’s deal-centered transaction workspace. It preserves working routes and the protected financial engine until each replacement is verified. A migration phase is complete only when its workflow, traceability, accessibility, and regression criteria pass; resemblance to a wireframe is not sufficient.

## A. Migration principles

1. Replace incrementally. Do not combine a broad file reorganization, new workflow schema, financial refactor, and visual redesign in one phase.
2. Preserve every working legacy route until its replacement and redirect coverage are verified.
3. Do not change financial formulas, sign rules, mappings, tolerances, source precedence, persistence behavior, or export values during frontend migration.
4. Establish one stable, reviewable checkpoint per phase with a documented rollback point.
5. Build shared tokens and primitives before composing production pages.
6. Place typed adapters and page-specific view models around current domain outputs instead of copying calculations into new components.
7. Verify route parameters, loading, empty, error, and deep-link behavior at every route checkpoint.
8. Preserve source backing, evidence links, status, ownership, due dates, blockers, confidence, and financial impact.
9. Keep server state authoritative; use URL state for durable navigation and focused client state for interaction.
10. Separate additive product-domain schema work from UI-only migration and obtain approval before schema changes.

## Standard phase contract

Every implementation phase must document:

- **Objective:** the bounded architectural or product capability being migrated.
- **User outcome:** the analyst workflow enabled.
- **Current reusable capability:** exact routes, components, loaders, domain modules, or tables retained.
- **New components:** shared or feature components required.
- **New view models:** page-specific contracts required; avoid enlarging `DashboardData` by default.
- **Backend requirements:** none, reuse, or separately approved additive work.
- **Protected logic:** financial and persistence behavior that cannot change.
- **Likely files affected:** expected scope, not authorization to edit every listed file.
- **Acceptance criteria:** functional, visual, accessibility, and traceability gates.
- **Tests:** automated and manual validation required.
- **Rollback plan:** how to restore the preceding stable route or component.
- **Explicit exclusions:** work intentionally deferred.

## B. Phase 0: Preservation controls

### Objective

Create a reliable baseline before production frontend changes begin.

### User outcome

No visible product change. Future redesign work can be evaluated against known working financial and workflow behavior.

### Current reusable capability

- Existing ESLint configuration and `npm test` regression command.
- Tests covering imports, parsing, mapping, calculations, add-backs, reconciliation, tax EBITDA, underwriting, deal stages, diligence, deal memory, and financial view rollups.
- Existing legacy routes and current UI as behavioral references.
- Wireframes in `docs/design/` as visual and workflow references.

### New components and view models

None.

### Backend requirements

None. No schema or persistence changes.

### Protected logic

All modules identified in `architecture.md` under the financial-engine protection boundary.

### Likely files affected

Documentation, test fixtures, screenshot baselines, and future testing configuration only. No production file changes are required merely to establish the baseline.

### Acceptance criteria

- Confirm the implementation branch and record `git status` before work.
- Run current lint and test commands and record pre-existing failures separately.
- Capture baseline screenshots of every current route at agreed desktop and responsive widths.
- Identify representative companies, periods, imports, mappings, add-backs, tax sources, and incomplete-data cases.
- Record representative normalized financial, EBITDA, reconciliation, underwriting, and export outputs.
- Publish the protected-file list and rollback checkpoint.
- Establish small, phase-scoped commits and a documented revert strategy.

### Tests

- `npm run lint`
- `npm test`
- TypeScript/build validation when artifact creation is allowed.
- Manual route smoke test and screenshot capture.

### Rollback plan

No product behavior changes occur. Revert only baseline tooling or documentation if it is incorrect.

### Explicit exclusions

No UI, domain, API, schema, authentication, or financial changes.

## C. Phase 1: Design foundation

### Objective

Introduce the semantic visual system and shared primitives required by all wireframed pages.

### User outcome

No mandatory production-route change. A safe preview demonstrates institutional typography, density, controls, tables, statuses, loading, empty, and error states.

### Current reusable capability

- Tailwind configuration and global CSS.
- Lucide icon dependency.
- Existing table, KPI, badge-like, export, and feedback patterns as behavior references.

### New components

- Token layer and typography roles.
- `Button`, `IconButton`, `StatusBadge`, `SeverityBadge`, `ProgressBar`, `Avatar`, `OwnerCell`.
- `ContentCard`, `SectionHeader`, `MetricCard`, `MetricStrip`.
- `SearchInput`, `FilterBar`, `Select`, `Checkbox`, `Tabs`, `DropdownMenu`, `Tooltip`.
- `Dialog`, `Drawer`, `Alert`, `Toast`, `EmptyState`, `LoadingSkeleton`.
- Typed `DataTable` foundation and financial extensions.

### New view models

Primitive preview fixtures only; no domain view model.

### Backend requirements

None.

### Protected logic

All financial modules and existing persistence behavior.

### Likely files affected

- `app/globals.css`
- `tailwind.config.ts`
- New `components/ui/` files
- A safe preview route or route group
- Optional shared formatting compatibility exports

### Acceptance criteria

- No decorative gradients in the new preview surface.
- Institutional navy/blue-neutral semantics with accessible status colors.
- Compact controls and table density align with the wireframes.
- No feature component uses raw color values.
- All primitives define loading, disabled, error, keyboard, focus, and responsive behavior.
- The table supports typed columns, sorting, filtering composition, selection, pagination, row actions, numeric alignment, and empty/loading states.
- Existing production routes remain behaviorally unchanged.

### Tests

- Existing lint and regression suite.
- Component interaction tests when the testing layer is approved.
- Manual keyboard, contrast, zoom, and responsive verification.
- Initial visual regression baselines for the preview.

### Rollback plan

Remove or disable the isolated preview and revert token imports. Production routes retain current styling until adoption.

### Explicit exclusions

No production page redesign, financial changes, schema work, or authorization redesign.

## D. Phase 2: Application shell

### Objective

Create the shared deal-scoped shell and canonical navigation behind a safe preview route or route group.

### User outcome

Analysts can navigate a consistent deal workspace with persistent transaction context and six-phase navigation without losing access to legacy pages.

### Current reusable capability

- Deal identity, stage, progress, and company fields from `DashboardData` and `companies`.
- Existing `DealPageNavigation`, `DealStageSelect`, and current links as compatibility references.
- Wireframe sidebar, utility header, breadcrumbs, page header, and deal context card.

### New components

`AppShell`, `DealSidebar`, `DealContextCard`, `TopUtilityHeader`, `Breadcrumbs`, `PageHeader`, `PageActions`, `PageTabs`, `ContentGrid`, and `InspectorPanel`.

### New view models

- `DealShellViewModel`: minimal deal identity, stage, target close, progress, phase navigation, active route, and permitted navigation.
- `UtilityHeaderViewModel`: current user placeholder/identity contract, search affordance, notification summary, and help destination.

### Backend requirements

Reuse current company/deal data. Authentication and organization membership remain a parallel future workstream.

### Protected logic

Current stage assessment, completion, readiness, and next-action calculations are consumed, not rewritten.

### Likely files affected

- New `app/deal/[companyId]/layout.tsx` or preview route group
- New `components/layout/`
- New shell loader and view model
- Compatibility navigation mapping

### Acceptance criteria

- All canonical destinations are represented, with unavailable future surfaces clearly disabled or routed to explicit placeholders only in preview.
- Current routes remain available.
- Deal identity is loaded once at the shared boundary; page-specific datasets are not.
- Sidebar, header, breadcrumbs, and main content landmarks are keyboard accessible.
- Layout supports expanded, collapsed, and mobile navigation states.
- No new route directly imports a service-role client.

### Tests

- Existing regression suite.
- Shell route-parameter and not-found tests.
- Keyboard navigation and focus tests.
- Responsive and visual baselines.
- Legacy-link smoke tests.

### Rollback plan

Disable the preview route group and retain legacy routes unchanged.

### Explicit exclusions

No production Overview replacement, global search implementation, notification backend, tenant authorization, or phase workflow implementation.

## E. Phase 3: Overview

### Objective

Replace the current deal landing workspace with the wireframed Overview under `/deal/[companyId]/overview`.

### User outcome

An analyst sees transaction identity, overall progress, phase progress, critical metrics, activity, issues, ownership, blockers, and next actions in one operational workspace.

### Current reusable capability

- Deal identity and stage from `companies` and `lib/deal-stage.ts`.
- Readiness and completion from `lib/data-readiness.ts`, `lib/diligence-readiness.ts`, and underwriting completion.
- Diligence issues and groups.
- Next actions and backing summaries.
- Deal-memory benchmarks.
- Current `/deal/[companyId]` route as the legacy baseline.

### New components

Overview progress timeline, phase progress table, key-metric summary, recent-activity list, issue severity summary, team activity summary, and workflow next-action panel composed from shared primitives.

### New view models

`OverviewPageViewModel` with deal header, phase progress, critical metrics, recent activity availability, issue summary, team summary availability, blockers, and next actions. Missing future data must be explicit rather than fabricated.

### Backend requirements

Current data is sufficient for a partial production Overview. Activity and team workload require future additive models; initial UI must disclose their unavailable state rather than use mock production data.

### Protected logic

Stage, readiness, completion, risk, backing, benchmark, and financial metric derivations.

### Likely files affected

- New canonical Overview route and feature module
- New overview loader/view model
- Shared shell adoption
- Compatibility redirect from `/deal/[companyId]` after verification
- Gradual reduction of route-specific benchmark formatting in the legacy page

### Acceptance criteria

- Overview answers what happened, what needs attention, who owns it, what is blocking progress, and the financial impact available from current data.
- Every number is sourced from existing authoritative domain output.
- Missing activity/team data is not invented.
- Current deal route remains usable until comparison and redirect tests pass.
- Overview matches the wireframe hierarchy without copying unsupported mock functionality.

### Tests

View-model tests, route empty/error tests, accessibility checks, visual regression, deep-link tests, and financial value comparison with the legacy page.

### Rollback plan

Remove the redirect or feature flag and return `/deal/[companyId]` to the legacy component.

### Explicit exclusions

No activity schema, staffing model, task engine, or benchmark formula changes.

## F. Phase 4: Data Review & Analysis

### Objective

Migrate current source-data, normalization, reconciliation, add-back, and underwriting capabilities into `/deal/[companyId]/phases/analysis`.

### User outcome

Analysts can ingest, review, map, reconcile, normalize, analyze, and trace financial data inside the transaction phase rather than navigating disconnected dashboard screens.

### Current reusable capability

- `/source-data?companyId=...`
- `/deal/[companyId]/underwriting`
- `CsvImportSection`, `StepBasedImportFlow`, `SourceReconciliationCard`, `DocumentSection`, `AddBackReviewPanel`, `StatementTable`, `DataQualityPanel`, underwriting panels, and financial charts.
- Protected import, mapping, normalized-output, reconciliation, add-back, tax, and underwriting modules.

### New components

Analysis workstream progress, phase tabs, dense financial tables, data-quality issue table, source review inspector, workstream activity summary, and shared import workflow framing.

### New view models

- `AnalysisOverviewViewModel`
- `FinancialOverviewViewModel`
- `SourceDataViewModel`
- `ReconciliationViewModel`
- `AddBackReviewViewModel`
- `UnderwritingViewModel`

### Backend requirements

Reuse current APIs and Supabase tables. New workstream, notes, and activity persistence are future additive requirements and must not block migrating existing capability.

### Controlled decomposition strategy

- Wrap `deal-workspace-view.tsx`, `csv-import-section.tsx`, and `step-based-import-flow.tsx` behind narrow adapters first.
- Extract shared formatting, table cells, and status presentation without changing behavior.
- Introduce view models around existing inputs before moving calculations.
- Migrate one tab/workflow at a time; do not require complete decomposition before any visual progress.
- Keep legacy routes operational and compare financial outputs after each tab migration.

### Protected logic

All ingestion, parsing, period inference, mapping, memory, sign normalization, rollups, add-backs, adjusted/tax EBITDA, reconciliation, underwriting, risk, quality, readiness, backing, export, and persistence behavior.

### Likely files affected

New Analysis routes/features/view models; shared financial components; compatibility wrappers around the three large components; current `/source-data` and underwriting routes only when redirects are verified.

### Acceptance criteria

- Imported and displayed financial outputs match legacy values.
- Analyst can reach evidence and mapping provenance from displayed values.
- Import and reconciliation errors remain distinguishable from empty data.
- Existing deep links and fix-it links resolve.
- No protected formula or API persistence semantics change.

### Tests

Full regression suite, canonical fixture comparisons, import browser flow, mapping review flow, reconciliation flow, add-back flow, underwriting comparison, accessibility, and visual regression.

### Rollback plan

Route each incomplete tab back to the legacy page or embedded compatibility component. Do not delete legacy components during this phase.

### Explicit exclusions

No new calculation methodology, automated recommendation scoring, workpaper model, or broad API rewrite.

## G. Phase 5: Documents

### Objective

Promote documents to `/deal/[companyId]/documents` as a first-class evidence workspace.

### User outcome

Analysts can search, review, inspect, version, and navigate linked transaction evidence in one place.

### Current reusable capability

`source_documents`, `document_versions`, `document_links`, `DocumentSection`, `DocumentDrawer`, document APIs, source metadata, and backing relationships.

### New components

Folder/category tree, document table, review status cells, document preview/metadata inspector, linked-object panel, required-document progress, and upload toolbar.

### New view models

`DocumentsPageViewModel`, `DocumentListRowViewModel`, and `DocumentInspectorViewModel`.

### Backend requirements

Current data supports a useful initial workspace. Folder hierarchy, tags, assigned reviewer, formal review lifecycle, confidence persistence, and richer activity may require separately approved additive schema work later.

### Protected logic

Source-document identity, version/link persistence, backing calculations, source financial relationships, and import behavior.

### Likely files affected

New Documents route/feature/view models, shared inspector/table components, and compatibility wrappers around current document components and APIs.

### Acceptance criteria

- Documents display authoritative metadata and version/link relationships.
- Preview failure does not hide metadata or links.
- A document is not presented as reviewed unless authoritative state supports it.
- Selected document is shareable when operationally required.
- Existing source-data document behavior remains available until verified.

### Tests

Document list/inspector view-model tests, upload/link/version route tests, keyboard selection, preview failure states, accessibility, and visual regression.

### Rollback plan

Disable the canonical Documents route and retain embedded `DocumentSection`/`DocumentDrawer` workflows.

### Explicit exclusions

No VDR replacement claim, OCR/AI scoring, storage migration, or unapproved document schema changes.

## H. Phase 6: Findings & Issues

### Objective

Build `/deal/[companyId]/phases/findings` using the existing diligence issue engine and the wireframed operational master-detail layout.

### User outcome

Analysts can triage issues by severity and impact, assign ownership, review evidence and management responses, and track resolution.

### Current reusable capability

`diligence_issues`, issue synchronization, grouping, readiness, action targets, `DiligenceIssuesPanel`, `DiligenceReadinessPanel`, and feedback summaries.

### New components

Issue metric strip, severity composition, issue trend, issue table, issue inspector, risk heat map, actions-required summary, and linked-evidence list.

### New view models

`FindingsPageViewModel`, `IssueRowViewModel`, `IssueInspectorViewModel`, and `RiskHeatMapViewModel`.

### Backend requirements

Current schema supports core issue operations. Owner identity, due dates, management response history, potential impact currency, likelihood, action checklist, and richer links may require additive schema work.

### Protected logic

Existing issue generation, codes, severity, grouping, readiness, action-target resolution, and financial evidence relationships.

### Likely files affected

New Findings route/feature/view models; shared table/inspector/chart components; compatibility use of current diligence APIs and panels.

### Acceptance criteria

- System-generated and manual issues remain distinguishable.
- Financial impact is shown only when authoritative data exists.
- Evidence and linked routes remain accessible.
- Status changes preserve current API behavior.
- No invented history or impact values.

### Tests

Existing diligence tests, view-model tests, issue mutation integration tests, inspector and keyboard tests, accessibility, and visual regression.

### Rollback plan

Return navigation to the current embedded diligence panel; retain all existing APIs.

### Explicit exclusions

No new issue formula, AI severity score, or unapproved issue schema migration.

## I. Phase 7: Workpapers

### Objective

Create a first-class Workpapers workspace and domain capability.

### User outcome

Analysts can prepare, review, version, and link workpapers to documents, financial records, issues, requests, and reports.

### Current reusable capability

Documents, document versions, backing links, normalized financial outputs, issues, and exports provide supporting inputs. There is no current first-class workpaper entity.

### New components

Workpaper table, workpaper inspector, review checklist, linked-object summary, version/activity views, ownership and status controls.

### New view models

`WorkpapersPageViewModel`, `WorkpaperRowViewModel`, and `WorkpaperInspectorViewModel`.

### Backend requirements

Requires separately approved additive workpaper, checklist, version/link, ownership, and review persistence. An uploaded spreadsheet is evidence or content, not the complete workpaper identity.

### Protected logic

All financial outputs referenced by workpapers; no workpaper may duplicate their calculations as a second authoritative model.

### Likely files affected

Future route/feature/view models, new approved APIs/services, and separately approved migrations.

### Acceptance criteria

Workpapers have stable identity, purpose, preparer, reviewer, period, lifecycle, checklist, versions, and links. Every financial value references authoritative output or explicit workpaper input provenance.

### Tests

Domain lifecycle, permission, link, version, checklist, route, component, accessibility, and browser workflow tests.

### Rollback plan

Feature-flag the route and retain documents/exports; additive records remain dormant rather than destructively removed.

### Explicit exclusions

No spreadsheet replacement engine, silent embedded recalculation, or treatment of files as complete workpaper records.

## J. Phase 8: Information Requests

### Objective

Implement `/deal/[companyId]/phases/requests` after Documents and Workpapers establish evidence destinations.

### User outcome

Analysts can issue, assign, track, remind, receive, review, and close information requests linked to transaction evidence.

### Current reusable capability

Documents, issues, company/deal identity, and future workpapers. No first-class request entity currently exists.

### New components

Request metric strip, category/status summary, request table, request inspector, upload/response area, activity list, reminder actions.

### New view models

`RequestsPageViewModel`, `RequestRowViewModel`, `RequestInspectorViewModel`, and `RequestCategorySummaryViewModel`.

### Backend requirements

Separately approved request, response, category, reminder, owner, due-date, and link persistence. Requests must produce or link documents rather than store opaque responses.

### Protected logic

Document identity, versions, backing, and existing issue behavior.

### Likely files affected

Future route/feature/view models, approved APIs/services/migrations, and Documents/Workpapers link adapters.

### Acceptance criteria

Requests have owner, target owner, due date, lifecycle, response evidence, and audit history. Overdue status derives from authoritative due date and lifecycle.

### Tests

Lifecycle, reminder, response/link, pagination/filter, accessibility, and browser workflow tests.

### Rollback plan

Feature-flag the route; preserve response documents and additive records.

### Explicit exclusions

No email integration, target portal, or automated request generation unless separately scoped.

## K. Phase 9: Planning & Scoping

### Objective

Implement `/deal/[companyId]/phases/planning` as configuration for downstream execution.

### User outcome

Teams define scope, workstreams, materiality, milestones, ownership, key questions, risks, and deliverables that configure later phases.

### Current reusable capability

Company/deal fields, stage, readiness, current financial context, issues, and future task/workstream foundations. Planning is not currently first-class.

### New components

Phase overview, checklist, transaction detail panel, thesis/key-question table, initial risk table, milestone table, document references, and notes.

### New view models

`PlanningPageViewModel`, `ScopeViewModel`, `MilestoneViewModel`, and `InitialRiskViewModel`.

### Backend requirements

Separately approved phase, workstream, milestone, scope, key-question, risk, note, and deliverable persistence.

### Protected logic

Current deal-stage semantics and financial outputs used to inform materiality; planning cannot alter protected calculations.

### Likely files affected

Future route/feature/view models and approved workflow services/schema.

### Acceptance criteria

Planning records drive downstream request categories, analysis workstreams, tasks, and deliverables. Planning is not a static metadata page.

### Tests

Configuration-to-downstream relationship tests, lifecycle tests, accessibility, and browser workflows.

### Rollback plan

Feature-flag the route; preserve created planning data for later re-enable.

### Explicit exclusions

No project-management suite, resource scheduling engine, or formula changes.

## L. Phase 10: Reporting and Reports Home

### Objective

Implement the Reporting phase and `/deal/[companyId]/reports` as a reviewable report workflow distinct from file export.

### User outcome

Analysts assemble report sections from authoritative financial outputs and findings, manage ownership and review, version deliverables, and publish exports.

### Current reusable capability

Executive summary, normalized financial outputs, EBITDA bridge, findings, backing, `report-export.ts`, `report-export-xlsx.ts`, and export controls.

### New components

Report status/progress, report section table, report list, report inspector, preview, version history, templates, linked objects, review actions, and delivery checklist.

### New view models

`ReportingPhaseViewModel`, `ReportsPageViewModel`, `ReportInspectorViewModel`, and `ReportSectionViewModel`.

### Backend requirements

Separately approved report, section, version, template, review, permission, and delivery persistence. Existing export functions remain output adapters, not report identity.

### Protected logic

All financial calculations, findings, backing, and PDF/Excel/CSV export values.

### Likely files affected

Future routes/features/view models, approved report services/schema, and compatibility wrappers around export modules.

### Acceptance criteria

Reports reference authoritative outputs instead of duplicating formulas. Versions are immutable snapshots or explicitly versioned compositions. Exported values match the existing engine.

### Tests

Report lifecycle/version tests, section-link tests, output value comparisons, route/component/accessibility tests, and end-to-end review/export flow.

### Rollback plan

Feature-flag report workflow and retain current direct exports.

### Explicit exclusions

No formula rewrite, unapproved document editor, or assumption that a generated export alone is a report record.

## M. Phase 11: Analytics

### Objective

Implement `/deal/[companyId]/analytics` from normalized outputs and shared chart primitives.

### User outcome

Analysts review financial performance, quality of earnings, working capital, leverage, benchmarks, trends, and data quality without creating a second calculation layer.

### Current reusable capability

Snapshots, series, statements, driver analyses, EBITDA bridge, credit metrics, risk flags, benchmarks, data quality, and existing Recharts dependency.

### New components

Analytics tabs, metric strip, standard chart wrapper, trend charts, bridges, working-capital and leverage charts, insight list, and recent-analysis list when authoritative records exist.

### New view models

`AnalyticsPageViewModel` and chart-specific typed series models derived from protected outputs.

### Backend requirements

Current financial data supports the core page. Persisted analysis records and activity are later additive capabilities.

### Protected logic

All normalized outputs, benchmarks, EBITDA, leverage, DSCR, data quality, and risk classifications.

### Likely files affected

New Analytics route/feature/view models, shared chart components, and compatibility use of current dashboard charts.

### Acceptance criteria

Every chart has units, periods, accessible description, incomplete-data state, and authoritative input. Analytics does not become the primary transaction navigation.

### Tests

Series/view-model tests, value comparisons, chart accessibility, visual regression, responsive behavior, and export checks where supported.

### Rollback plan

Disable the route and retain current dashboard/underwriting analytics.

### Explicit exclusions

No AI score, decorative visualization, or recalculation in chart components.

## N. Phase 12: Close & Handover

### Objective

Implement `/deal/[companyId]/phases/close` after the supporting transaction objects are authoritative.

### User outcome

Teams execute the closing checklist, review purchase-price and working-capital adjustments, resolve open items, deliver final materials, and track post-close obligations.

### Current reusable capability

Financial statements, add-backs, debt/credit metrics, issues, backing, reports/exports, and future workpapers/documents/tasks. No complete closing domain exists.

### New components

Closing checklist, purchase-price bridge, NWC table, debt and debt-like table, key dates, open-items summary, funds-flow summary, deliverables table, and post-close task list.

### New view models

`ClosePageViewModel`, `ClosingAdjustmentViewModel`, `NwcSummaryViewModel`, `DebtLikeSummaryViewModel`, and `DeliverableViewModel`.

### Backend requirements

Separately approved closing adjustment, NWC item, debt-like item, approval, deliverable, key-date, and post-close task persistence.

### Protected logic

Existing financial outputs and source backing. Closing computations require separately approved domain rules and cannot be inferred inside presentation code.

### Likely files affected

Future close route/feature/view models and approved domain/services/schema.

### Acceptance criteria

Every adjustment retains source, owner, reviewer/approval, version, currency, and effect on closing output. Open blockers and unapproved changes are explicit.

### Tests

Calculation tests for separately approved closing rules, provenance tests, approval/lifecycle tests, route/component/accessibility tests, and end-to-end close workflow.

### Rollback plan

Feature-flag the route and preserve additive records; no closing data may be deleted as rollback.

### Explicit exclusions

No unapproved purchase-price, NWC, debt-like, funds-flow, or legal-close methodology.

## O. Phase 13: Cross-cutting enterprise surfaces

### Objective

Complete shared execution and governance capabilities across all transaction objects.

### User outcome

Users can coordinate tasks, teams, Q&A, search, notifications, permissions, audit history, shortcuts, and settings without leaving the deal workspace.

### Current reusable capability

Deal links, issues, current local actions, source backing, and future workflow entities. Most enterprise capabilities are not currently modeled.

### New components

Global search, task tables and inspectors, team roster/workload, Q&A workspace, notification center, permission editor, audit timeline, shortcut help, and settings forms.

### New view models

Feature-specific models for tasks, team, Q&A, search results, notifications, permissions, activity, and settings.

### Backend requirements

Identity, organization membership, deal access, tasks, Q&A, notifications, activity events, permissions, and settings require separately approved platform work.

### Protected logic

All existing financial, diligence, evidence, and export behavior.

### Likely files affected

Future canonical routes/features/services and separately approved authorization/workflow schema.

### Acceptance criteria

Enterprise features respect organization and deal scope, preserve audit attribution, link to authoritative transaction objects, and do not become a separate CRM/project-management product.

### Tests

Authorization matrix tests, search relevance/permissions tests, notification/activity tests, accessibility, and end-to-end cross-object workflows.

### Rollback plan

Feature-flag individual surfaces; preserve durable user and activity records.

### Explicit exclusions

No external messaging/calendar integrations, generalized CRM, or organization-wide resource planning unless separately scoped.

## P. Phase execution checklist

Before starting any phase, copy the Standard phase contract and confirm every field is answered with repository-specific scope. A phase cannot start with “backend TBD” if the user outcome requires authoritative persistence; it must either narrow the outcome or obtain approval for additive backend work.

At completion, record:

- Legacy and replacement URLs.
- Financial output comparison result.
- Deep links and redirects verified.
- Accessibility and responsive verification.
- Tests run and pre-existing failures.
- Known deferred fields or workflows.
- Rollback commit or feature-flag procedure.

## Q. Recommended immediate next step

Create the shared design tokens and application shell behind a safe preview route or route group. Do not begin multiple production pages simultaneously. The preview should prove the institutional density, semantic status system, navigation hierarchy, responsive shell, and accessible shared primitives while leaving every current production route and all protected financial behavior unchanged.
