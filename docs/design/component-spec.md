# Broadstone Component and Interaction Specification

## Status and scope

This specification governs shared frontend components introduced during the Broadstone migration. It is based on the redesign brief and the Overview, six phase, Documents, Workpapers, Reports, and Analytics wireframes in `docs/design/`.

Broadstone is not a generic dashboard, CRM, document store, spreadsheet clone, or consumer fintech application. Components must support transaction execution, deterministic analysis, evidence traceability, and institutional information density.

## A. Visual principles

The interface must be:

- **Institutional:** appropriate for investment banking, private equity, lending, transaction advisory, valuation, and corporate development teams.
- **Dense:** optimized for analysts working across many records and financial periods.
- **Calm:** restrained color, motion, elevation, and decoration.
- **Information-rich:** key workflow and financial context should be visible without repeated navigation.
- **Deterministic:** show evidence, calculations, assumptions, ownership, confidence, and status rather than subjective scores.
- **Workflow-oriented:** each screen should make the next required action apparent.
- **High signal-to-noise:** tables, summaries, and inspectors must earn their screen space.

Avoid:

- Decorative gradients, including the current radial body gradients in `app/globals.css`.
- Oversized marketing cards and hero-style typography.
- Excessive whitespace that separates related transaction information.
- Playful illustrations, celebratory animation, or conversational chatbot styling.
- Consumer-fintech rounding, prominent shadows, and decorative color.
- Inconsistent pill shapes, radii, and local status colors.
- Unstructured dashboard widgets with no workflow or decision consequence.

## B. Design tokens

Tokens must be semantic CSS variables or equivalent Tailwind theme mappings. Feature components consume semantic tokens, not raw hex values or arbitrary color utilities.

### Color tokens

| Token | Intended use |
|---|---|
| `background-page` | Main workspace background; cool neutral with minimal contrast against surfaces |
| `surface` | Default cards, tables, headers, and panels |
| `surface-elevated` | Menus, dialogs, drawers, inspectors, and floating controls |
| `sidebar-background` | Deep institutional navy |
| `sidebar-active` | Blue active-route treatment with high contrast |
| `text-primary` | Primary headings, key numbers, and table values |
| `text-secondary` | Body copy and secondary metadata |
| `text-muted` | Timestamps, helper text, inactive labels, and placeholders |
| `border-subtle` | Standard panel and row separation |
| `border-strong` | Focused divisions, totals, selected records, and grouped regions |
| `action-primary` | Main action and selected interactive state; institutional blue |
| `action-primary-hover` | Hover/pressed state for primary actions |
| `focus-ring` | High-contrast keyboard focus indicator |
| `status-success` | Verified completion, reviewed, reconciled, or delivered |
| `status-warning` | Awaiting attention, medium severity, due soon, or partial completion |
| `status-danger` | Action required, high severity, failed reconciliation, blocked, or overdue |
| `status-info` | In progress, selected, informational, or under review |
| `status-neutral` | Not started, unavailable, archived, or inactive |

The intended direction is institutional navy/blue with cool neutral grays. Green, amber, red, and informational blue are reserved for semantic status. Final color values should be calibrated from the wireframes and tested for contrast before adoption.

### Chart tokens

Define an ordered chart series palette with:

- Primary blue
- Secondary green
- Tertiary amber/orange
- Comparison violet
- Neutral gray
- Danger red only for adverse or exception data

Series tokens must retain meaning across pages. A series color must not be chosen merely to decorate a chart.

### Radius scale

| Token | Use |
|---|---|
| `radius-none` | Dense table joins and full-width separators |
| `radius-sm` | Inputs, buttons, badges, and compact controls |
| `radius-md` | Cards, menus, and inspectors |
| `radius-lg` | Dialogs only when additional separation is needed |

Arbitrary radii such as the current `rounded-[1.75rem]` patterns are prohibited in new feature components. Pill radius is reserved for status badges, compact filters, avatars, and true segmented controls.

### Shadow scale

| Token | Use |
|---|---|
| `shadow-none` | Default cards and tables |
| `shadow-subtle` | Sticky headers and lightly separated elevated surfaces |
| `shadow-overlay` | Menus, dialogs, drawers, and inspectors |

Borders should provide most structure. Shadows must not be the primary page hierarchy.

### Spacing and density

Use a compact 4px-derived spacing scale. Standard steps should cover 4, 8, 12, 16, 20, 24, and 32px, with larger spacing reserved for page boundaries. Feature code should not introduce arbitrary spacing values without extending the token system.

Table density tokens must include:

- `compact`: routine operational tables and inspectors.
- `standard`: mixed-content tables requiring two-line cells.
- `financial`: compact numeric rows with strong subtotal hierarchy.

### Layout tokens

Define and centrally maintain:

- `page-max-width`: wide enough for dense institutional workspaces; wireframes use nearly the full available content width.
- `inspector-width`: approximately one quarter to one third of the desktop content region, with a practical min/max.
- `header-height`: consistent top utility header height.
- `sidebar-width-expanded`: fixed desktop width supporting phase labels and deal context.
- `sidebar-width-collapsed`: icon-only desktop width.
- `content-gutter`: compact responsive page padding.

## C. Typography

### Font strategy

Use a professional sans-serif with strong small-size rendering, broad numeric support, and tabular numerals. Prefer a locally or framework-managed font that does not make the application dependent on runtime third-party font delivery. The fallback stack must remain legible on Windows and macOS.

### Type roles

| Role | Requirements |
|---|---|
| Page title | Restrained, semibold, compact line height; never marketing scale |
| Section title | Semibold and clearly subordinate to page title |
| Card title | Compact semibold label; generally one line |
| Body | Regular weight, compact but readable line height |
| Metadata | Smaller, secondary or muted color; avoid excessive uppercase |
| Table header | Compact, medium weight, consistent capitalization |
| Table body | Compact line height; two-line content only when meaningful |
| Numeric cells | Tabular numerals, right aligned, stable width where practical |
| Labels | Concise; sentence case by default |
| Status text | Medium weight with icon or shape support; never color-only |

Financial currency, percentages, multiples, dates, and period values must use tabular numerals. Financial values are right aligned. Text labels are left aligned. Column headings follow the alignment of their data where this improves scanning.

All caps is reserved for compact metadata labels, not primary navigation or long headings. Title case must be used consistently and not mixed arbitrarily with sentence case.

## D. Shared layout components

### `AppShell`

**Purpose:** Establish the global application frame for deal and portfolio workspaces.

**Required props:** `children`, `navigation`, `activeRoute`.

**Optional props:** `sidebarCollapsed`, `utilityHeader`, `announcement`, `onSidebarToggle`.

**Behavior:** Renders sidebar, utility header, and scrollable content region without loading deal-specific business data itself.

**Responsive:** Persistent sidebar on wide screens; collapsible icon sidebar at intermediate widths; modal navigation drawer on narrow screens.

**Accessibility:** Skip link to main content, landmark roles, keyboard-operable collapse control, announced navigation state.

**Prohibited:** Financial calculations, route-specific data queries, page-level actions, or nested competing application shells.

### `DealSidebar`

**Purpose:** Render canonical Overview, phase, and transaction-object navigation for the active deal.

**Required props:** `dealId`, `items`, `activeHref`, `phaseProgress`.

**Optional props:** `collapsed`, `dealContext`, `helpItem`, `userMenu`.

**Responsive:** Full labels on desktop; icons and tooltips when collapsed; drawer on mobile.

**Accessibility:** Use `nav`, `aria-current`, expandable phase semantics, and descriptive labels for icons.

**Prohibited:** Hardcoded financial completion calculations or page-specific filters.

### `DealContextCard`

**Purpose:** Provide persistent transaction identity and limited critical context, as shown at the bottom of the wireframe sidebar.

**Required props:** `dealName`, `dealType`, `targetClose`, `progress`.

**Optional props:** `status`, `clientName`, `targetName`, `href`.

**Responsive:** Hidden or condensed in collapsed/mobile navigation while remaining available in a context menu.

**Accessibility:** Progress must have an accessible label and numeric value.

**Prohibited:** Becoming a general KPI card or duplicating page overview metrics.

### `TopUtilityHeader`

**Purpose:** Host global search, notifications, help, and user identity.

**Required props:** `search`, `user`.

**Optional props:** `notifications`, `helpHref`, `keyboardShortcut`, `breadcrumbs` for compact layouts.

**Responsive:** Search may collapse to an icon-triggered field; user and notification controls remain reachable.

**Accessibility:** Search label, icon-button labels, menu semantics, focus restoration.

**Prohibited:** Page-primary actions or feature-specific filters.

### `Breadcrumbs`

**Purpose:** Communicate route hierarchy and allow return navigation.

**Required props:** `items` with label and optional href.

**Optional props:** `maxItems`, `separator`.

**Responsive:** Collapse middle items while retaining deal and current page.

**Accessibility:** `nav` with breadcrumb label and `aria-current` on the final item.

**Prohibited:** Replacing phase navigation or tabs.

### `PageHeader`

**Purpose:** Standardize title, status, progress, context, and primary actions.

**Required props:** `title`.

**Optional props:** `description`, `status`, `progress`, `metadata`, `actions`, `breadcrumbs`, `tabs`.

**Responsive:** Actions wrap below title; progress remains readable; low-priority metadata collapses deliberately.

**Accessibility:** One page-level `h1`; progress and status must be announced meaningfully.

**Prohibited:** Arbitrary card grids, business calculations, or unrelated utility controls.

### `PageActions`

**Purpose:** Lay out one primary action and ordered secondary actions.

**Required props:** `children`.

**Optional props:** `overflowAt`, `sticky`.

**Responsive:** Preserve the primary action; move secondary actions into an accessible overflow menu.

**Accessibility:** Logical tab order and descriptive control names.

**Prohibited:** Multiple visually competing primary actions.

### `PageTabs`

**Purpose:** Represent peer views within a route or phase.

**Required props:** `items`, `activeKey`.

**Optional props:** `onChange`, `ariaLabel`, `variant`, `counts`.

**Responsive:** Horizontal scrolling without wrapping where labels would become ambiguous.

**Accessibility:** Use links for navigational tabs and ARIA tabs only for same-route panel switching.

**Prohibited:** Using tabs to hide unrelated transaction phases or critical workflow blockers.

### `ContentGrid`

**Purpose:** Provide consistent page columns matching the wide wireframe layouts.

**Required props:** `children`.

**Optional props:** `columns`, `sidebar`, `gap`, `collapseOrder`.

**Responsive:** Defined collapse order; primary workflow content precedes supporting analytics.

**Accessibility:** DOM order must remain logical when columns collapse.

**Prohibited:** Arbitrary masonry or rearrangement based only on visual balance.

### `ContentCard`

**Purpose:** Group one coherent table, summary, chart, or workflow section.

**Required props:** `children`.

**Optional props:** `title`, `description`, `actions`, `padding`, `overflow`, `selected`.

**Responsive:** Content owns overflow behavior; card must not force unreadable table shrinkage.

**Accessibility:** Use a labelled section when the card has a title.

**Prohibited:** Nested card stacks for decoration or oversized blank padding.

### `SectionHeader`

**Purpose:** Standardize title, explanatory text, count, and compact actions inside a card or page section.

**Required props:** `title`.

**Optional props:** `description`, `count`, `actions`, `status`.

**Accessibility:** Correct heading level supplied or inferred from context.

**Prohibited:** Page-level breadcrumbs or duplicated page actions.

### `InspectorPanel`

**Purpose:** Display selected-record detail alongside a table, following the Documents, Workpapers, Reports, and Findings wireframes.

**Required props:** `recordId`, `title`, `onClose`, `children`.

**Optional props:** `icon`, `status`, `tabs`, `actions`, `width`, `loading`.

**Responsive:** Fixed companion column on wide screens; overlay drawer or full-screen detail route on narrow screens.

**Accessibility:** Labelled complementary region or dialog, focus management in overlay mode, close control, return focus to selected row.

**Prohibited:** Acting as the sole location of critical fields that cannot be reached on mobile or by direct navigation.

## E. Core UI primitives

All primitives use semantic variants and the central token system.

- **Button:** `primary`, `secondary`, `quiet`, and `danger`; sizes tied to density tokens; pending and disabled states distinct.
- **IconButton:** icon-only control with mandatory accessible label and tooltip when meaning is not universal.
- **StatusBadge:** canonical lifecycle status; optional icon and compact label.
- **SeverityBadge:** high, medium, low, informational, and critical when supported by the domain.
- **ProgressBar:** numeric value, optional completed/total label, accessible min/max/value.
- **MetricCard:** one decision-relevant metric, comparison, status, and optional destination; never an unstructured widget.
- **MetricStrip:** compact peer metrics across the page width, as used in Documents and Workpapers.
- **Avatar:** initials or image with accessible name and consistent sizes.
- **OwnerCell:** avatar, owner name, optional role/team, and unassigned state.
- **SearchInput:** labelled search with clear control, keyboard shortcut presentation, and debounced behavior where needed.
- **FilterBar:** composes search, typed filters, saved view, reset, and result count without owning business filtering rules.
- **Select:** labelled native or accessible composite select with pending/invalid states.
- **Checkbox:** row selection or explicit boolean input; never a substitute for status when completion has workflow consequences.
- **Tabs:** navigational and panel variants with distinct semantics.
- **DropdownMenu:** keyboard-operable contextual actions, destructive separation, and focus restoration.
- **Tooltip:** supplemental text only; essential information cannot exist only in a tooltip.
- **Dialog:** blocking confirmation or focused short-form task.
- **Drawer:** temporary detail/editing surface; inspector rules apply when it represents a record.
- **EmptyState:** explains why data is absent and provides an appropriate next action.
- **LoadingSkeleton:** mirrors final structure and does not imply false values.
- **Alert:** persistent contextual success, warning, danger, or informational message.
- **Toast:** transient confirmation for completed reversible actions; errors requiring remediation remain visible in context.

## F. Data-table standard

Tables are the primary interaction surface across Broadstone. A shared typed `DataTable<T>` foundation must support:

- Typed column definitions and stable row identifiers.
- Sortable columns with announced direction.
- Typed filter controls and active-filter summary.
- Single and multi-row selection where bulk actions exist.
- Client or server pagination through an explicit adapter.
- Row-level action menus with accessible names.
- Sticky headers for long operational tables where the scroll container is unambiguous.
- Right-aligned numeric, currency, percentage, multiple, and variance cells.
- Central currency, date, period, percentage, and unavailable-value formatting.
- Standard `OwnerCell`, `StatusBadge`, `SeverityBadge`, and `ProgressBar` renderers.
- Linked-object count cells with type labels or icons and accessible text.
- Loading, empty, filtered-empty, failed, and partial-data states.
- Expandable rows only when the expansion preserves scanning and does not duplicate an inspector.
- Visible row and cell focus, keyboard access to links and actions, and predictable selection shortcuts.
- Horizontal overflow on narrow screens with preserved first-column context where practical.
- Column priority or responsive alternatives for narrow layouts; financial tables must never silently drop material values.
- Optional density, column visibility, saved view, and export controls through composition.

Table semantics must use actual table elements unless a required interaction pattern cannot be implemented accessibly. Div-based visual tables require explicit review.

Pages must not create new local table foundations. Specialized behavior extends the shared typed column and cell system.

## G. Financial-table extensions

Financial tables extend `DataTable` or a shared `FinancialTable` composition with:

- Period-group headers and clear units.
- Right-aligned tabular numeric cells.
- Standard subtotal, total, and grand-total hierarchy.
- Variance columns with absolute and percentage options.
- Explicit favorable/unfavorable semantics determined by a domain-provided classification, not guessed from sign in the UI.
- Source-backing indicators and drill-down destinations.
- Reconciliation status and tolerance context supplied by domain output.
- Confidence and mapping provenance where relevant.
- Expandable account detail and source-record detail when supported.
- Clear zero, null, unavailable, not-applicable, and not-yet-calculated states.
- Copy/export behavior that preserves displayed units and authoritative values.

The UI must never silently recompute formulas, net values, signs, margins, EBITDA, add-backs, reconciliation differences, leverage, DSCR, or LTV. It renders values and classifications produced by protected domain modules.

## H. Inspector standard

The shared right-side inspector pattern applies to documents, workpapers, reports, issues, and requests.

### Required structure

1. Selected-record header with type icon, identifier/title, status, and close action.
2. Contextual actions appropriate to permission and lifecycle.
3. Tabs appropriate to the entity, such as Overview, Details/Content, Activity, Versions, Links, Checklist, or Permissions.
4. Authoritative metadata: owner, reviewer, dates, period, source, confidence, financial impact, and location where applicable.
5. Linked transaction objects with type and count.
6. Evidence or preview area when the entity supports it.
7. Activity and version history when available.
8. Checklist and required next action when workflow-enabled.

### Selection and navigation

- Use a URL parameter or nested record route when a selected record must be shareable, restorable after refresh, or opened from another feature.
- Local selection is acceptable for temporary same-page review if loss on refresh has no operational consequence.
- Closing returns focus to the originating table row.
- Browser Back should restore the previous selection when selection is URL-addressable.

### Responsive fallback

At narrow widths, the inspector becomes an accessible drawer or full-screen detail route. It must not render as an unusably narrow column beneath the table.

## I. Chart standard

Every chart uses a shared wrapper with:

- Title and optional decision-oriented subtitle.
- Explicit unit and period coverage.
- Legend only when more than one series or category requires it.
- Accessible axis labels and readable ticks.
- Typed tooltip formatting using shared financial formatters.
- Period, scenario, or unit controls when the underlying view model supports them.
- A textual summary or accessible data representation.
- Export behavior consistent with report and page exports.
- Visible empty, incomplete, unavailable, and failed-data states.

Supported initial types:

- Line charts for time-series movement.
- Bar charts for discrete comparison.
- Stacked bars for meaningful composition over categories or periods.
- Bridge/waterfall charts for EBITDA and transaction-value movement.
- Donut charts only when part-to-whole composition is important and the number of segments is small.
- Heat maps for likelihood/impact or similarly defined matrices.
- Compact sparklines for table or metric context.

Charts must support a transaction decision or workflow. Three-dimensional, decorative, unlabeled, and redundant charts are prohibited.

## J. Status vocabulary

| Canonical label | Tone | Intended meaning |
|---|---|---|
| Not started | Neutral | Workflow has not begun |
| In progress | Informational | Active work is underway |
| Blocked | Danger | Work cannot advance without resolution |
| Awaiting review | Warning | Work is complete enough for assigned review |
| Reviewed | Success | Review has occurred; not necessarily final approval |
| Complete | Success | Lifecycle requirements are satisfied |
| Overdue | Danger | Due date has passed without qualifying completion |
| Open | Danger or informational by context | Unresolved record requiring attention |
| Resolved | Success | Issue or question has been dispositioned |
| High | Danger | High severity or impact |
| Medium | Warning | Medium severity or impact |
| Low | Success or neutral | Low severity; not equivalent to completion |
| Informational | Informational | Non-action or contextual item |
| Verified | Success | Evidence or calculation has been explicitly verified |
| Unreconciled | Danger | Reconciliation requirements are not satisfied |

Domain-specific statuses remain distinct where meaning would be lost. Examples include `waived` for diligence issues, `accepted/rejected/suggested` for add-backs, `reconciled/warning/failed` for reconciliation, and source confidence values. Shared badges normalize visual tone and wording presentation; they must not collapse domain state into one universal enum.

## K. Accessibility

All new components require:

- Complete keyboard navigation and logical tab order.
- Visible high-contrast focus states.
- Semantic page and section headings.
- Programmatic labels, descriptions, and validation messages.
- Screen-reader text for icon-only controls.
- Adequate text, status, and chart contrast.
- Icons, text, shapes, or patterns so status is never communicated by color alone.
- Correct table headers, scopes, captions or accessible names, and announced sort state.
- Focus trapping and restoration for modal overlays.
- Respect for reduced-motion preferences.
- No essential hover-only interaction.
- Support for browser zoom and narrow responsive layouts without loss of required content.

## L. Component governance

1. Build or extend shared primitives before adding page-specific visual variants.
2. Do not create duplicate badge, button, tab, inspector, filter-bar, or table systems.
3. Do not create page-local table foundations.
4. Do not use raw colors or arbitrary radii in feature components.
5. Do not embed page-specific business calculations in shared primitives.
6. Extend components through typed variants and composition rather than prop combinations that encode one page.
7. Use shared formatting for currency, percentages, dates, periods, multiples, and unavailable values.
8. Prefer borders and hierarchy to decorative shadow and card nesting.
9. Treat tables, inspectors, actions, loading, empty, and error states as one complete component contract.
10. A component is not complete until keyboard, screen-reader, zoom, and responsive behavior are defined and verified.
