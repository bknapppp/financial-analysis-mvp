# Broadstone Transaction Domain Model

## Status and scope

This document defines the target product domain for Broadstone as an institutional transaction execution platform. It distinguishes the current repository’s persisted and derived models from future capabilities. It does not authorize schema changes and does not prescribe a destructive migration.

Status terms used below:

- **Existing:** persisted or implemented as a recognizable first-class domain object.
- **Partial:** represented by current fields, derived data, or adjacent objects but not complete enough for the target workflow.
- **Absent:** no first-class implementation was identified in the audited repository.
- **Additive schema required:** the target capability needs separately approved persistence work.

## A. Core hierarchy

### Target hierarchy

```text
Organization
└── Workspace / Engagement
    └── Deal
        ├── Company / target entities
        ├── Phase
        │   └── Workstream
        └── Transaction objects
            ├── Milestones and tasks
            ├── Information requests
            ├── Documents and versions
            ├── Financial records and mappings
            ├── Reconciliations and underwriting scenarios
            ├── Issues and adjustments
            ├── Workpapers
            ├── Reports
            ├── Deliverables and closing items
            └── Activity, comments, Q&A, and notifications
```

### Reconciliation with the current schema

The current schema is company-centered. `companies.id` is used as the effective deal identifier across reporting periods, documents, mappings, add-backs, diligence issues, and route parameters named `companyId`. The table also contains deal-oriented fields such as deal name, deal type, stage, target close, and stage metadata.

During frontend migration, `companyId` remains the canonical route identifier and compatibility key. The application may treat a current `companies` record as the deal aggregate for routing without claiming that Company and Deal are permanently identical concepts.

Future organization, engagement, and deal entities should be introduced additively and mapped to existing company-centered records. No destructive rename, key replacement, or table split is required for the first frontend phases.

## B. Entity catalog

### Organization

- **Purpose:** Tenant boundary for firms using Broadstone.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** name, legal/display identity, status, settings, default currency/time zone.
- **Owner:** Organization administrators.
- **Lifecycle:** Active, suspended, archived.
- **Relationships:** Memberships, engagements/workspaces, deals, organization-level templates and settings.
- **Evidence/financial impact:** No direct financial impact; establishes access scope for all evidence and financial records.
- **Audit requirements:** Creation, status, settings, and administrator changes.
- **Future considerations:** Must become the tenant key used by authorization and RLS.

### User

- **Purpose:** Human identity acting in the application.
- **Current status:** Absent from the audited application/domain schema; Supabase authentication may exist externally but is not integrated visibly.
- **Authoritative fields:** identity-provider ID, name, email, status, profile metadata.
- **Owner:** The individual and organization administrators for managed fields.
- **Lifecycle:** Invited, active, suspended, deactivated.
- **Relationships:** Memberships, owned/reviewed objects, comments, activity events, approvals.
- **Evidence/financial impact:** Attribution only; never owns financial truth independently.
- **Audit requirements:** Identity, access, and material action attribution.
- **Future considerations:** Keep identity separate from organization membership and deal access.

### Membership

- **Purpose:** Relate a user to an organization with a role and access state.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** organization, user, role, status, invited/accepted timestamps.
- **Owner:** Organization administrators.
- **Lifecycle:** Invited, active, suspended, revoked.
- **Relationships:** Organization, user, engagement/deal access grants.
- **Evidence/financial impact:** Governs access; no direct financial impact.
- **Audit requirements:** Every grant, role change, suspension, and revocation.
- **Future considerations:** Must support least privilege and RLS alignment.

### Deal

- **Purpose:** Primary transaction aggregate from kickoff through close.
- **Current status:** Partial; currently represented by `companies` plus stage/readiness/derived context.
- **Authoritative fields:** deal name/type, target company, client, stage, status, kickoff, target close, currency, owner, transaction terms.
- **Owner:** Deal lead or project manager.
- **Lifecycle:** Pipeline or setup, active phases, on hold, closed, terminated, archived; exact statuses require product approval.
- **Relationships:** Organization/workspace, company, phases, workstreams, all transaction objects, deal memory.
- **Evidence/financial impact:** Aggregate scope for all evidence and financial outputs.
- **Audit requirements:** Stage, key dates, terms, ownership, and status history.
- **Future considerations:** Introduce additively; map current `companies.id` to a stable deal identity without breaking routes.

### Company

- **Purpose:** Legal or operating entity whose financials and transaction context are analyzed.
- **Current status:** Existing in `companies`; currently doubles as deal identity.
- **Authoritative fields:** name, industry, entity details, current status, and existing deal-oriented fields.
- **Owner:** Deal team; future system may distinguish relationship owner from deal owner.
- **Lifecycle:** Active/inactive as an entity; transaction lifecycle belongs to Deal.
- **Relationships:** Deal, reporting periods, source documents, financial records.
- **Evidence/financial impact:** Entity scope for financial statements and sources.
- **Audit requirements:** Identity and classification changes.
- **Future considerations:** A deal may eventually involve multiple companies; do not assume permanent one-to-one equivalence.

### Phase

- **Purpose:** Represent one of the six controlled transaction phases.
- **Current status:** Partial; stage and completion are derived, but phase records/checklists are absent.
- **Authoritative fields:** deal, phase key/order, status, owner, start/due/completed dates, completion definition.
- **Owner:** Phase lead.
- **Lifecycle:** Not started, in progress, blocked, awaiting review, complete.
- **Relationships:** Deal, workstreams, milestones, tasks, deliverables, phase-specific objects.
- **Evidence/financial impact:** Summarizes linked evidence and financial blockers; should not duplicate calculations.
- **Audit requirements:** Status, completion override, owner, and date changes.
- **Future considerations:** Additive schema required for authoritative workflow; calculated progress must expose its inputs.

### Workstream

- **Purpose:** Organize phase execution by analysis area or responsibility.
- **Current status:** Partial in UI concepts and issue categories; no first-class persisted model.
- **Authoritative fields:** deal, phase, name/type, owner, status, dates, scope, materiality.
- **Owner:** Workstream lead.
- **Lifecycle:** Not started, in progress, blocked, awaiting review, complete.
- **Relationships:** Tasks, requests, documents, workpapers, issues, report sections.
- **Evidence/financial impact:** Aggregates linked evidence and impacts; no independent formula layer.
- **Audit requirements:** Scope, owner, materiality, and completion changes.
- **Future considerations:** Additive schema required; planning should create/configure downstream workstreams.

### Milestone

- **Purpose:** Deal or phase checkpoint with a date and completion state.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** deal/phase, title, owner, due date, status, completion date.
- **Owner:** Assigned deal-team member.
- **Lifecycle:** Not started, in progress, blocked, complete, overdue as a derived condition.
- **Relationships:** Phase, tasks, deliverables.
- **Evidence/financial impact:** May be blocked by evidence or financial findings; usually no direct impact amount.
- **Audit requirements:** Due-date, owner, and completion changes.
- **Future considerations:** Avoid treating milestones as generic project-management records disconnected from transaction phases.

### Task

- **Purpose:** Assignable unit of transaction work.
- **Current status:** Partial; next actions and completion items are derived, but no general task table exists.
- **Authoritative fields:** deal, title, owner, status, priority, due date, linked object, completion date.
- **Owner:** Assigned user.
- **Lifecycle:** Not started, in progress, blocked, awaiting review where required, complete; overdue is derived.
- **Relationships:** Any phase or transaction object.
- **Evidence/financial impact:** Optional evidence and impact inherited from or linked to the subject object.
- **Audit requirements:** Assignment, due date, status, blocker, and completion.
- **Future considerations:** Additive schema required; tasks must remain transaction-object actions, not a general project tool.

### Information Request

- **Purpose:** Request evidence or explanation from a target-side or internal owner.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** request ID/title, category, requester, target owner, status, due date, sent date, response date, priority.
- **Owner:** Internal requester; target owner is a separate responsibility.
- **Lifecycle:** Draft, open/sent, response received, under review, closed, cancelled; overdue derived from due date.
- **Relationships:** Workstream, documents/responses, issues, tasks, comments.
- **Evidence/financial impact:** Produces or links evidence; may carry expected/material financial relevance.
- **Audit requirements:** Send, reminder, response, review, closure, and reassignment events.
- **Future considerations:** Responses should create/link source documents, not remain opaque attachments.

### Source Document

- **Purpose:** Authoritative evidence file or externally sourced record.
- **Current status:** Existing as `source_documents` with current services/components.
- **Authoritative fields:** company/deal scope, source type, file/storage identity, name, status, uploaded date/source, document type, metadata.
- **Owner:** Uploader or assigned document owner when added.
- **Lifecycle:** Active, archived; formal review lifecycle is partial/absent.
- **Relationships:** Versions, source reporting periods, links, requests, workpapers, issues, reports.
- **Evidence/financial impact:** Primary evidence source; financial impact occurs through extracted/source records and linked analysis.
- **Audit requirements:** Upload, metadata, archive, version, and link changes.
- **Future considerations:** Folder, tags, reviewer, review status, and access scope may require additive fields.

### Document Version

- **Purpose:** Preserve document revision history.
- **Current status:** Existing as `document_versions`.
- **Authoritative fields:** document, version identity/number, storage path, created timestamp, creator, version metadata.
- **Owner:** Document owner; creator attribution is distinct.
- **Lifecycle:** Immutable version records; current version is selected by document metadata or ordering.
- **Relationships:** Source document and activity events.
- **Evidence/financial impact:** Preserves the exact evidence revision supporting analysis.
- **Audit requirements:** Version creation and current-version selection.
- **Future considerations:** Add checksum, reason, superseded-by, and immutable attribution as needed.

### Document Link

- **Purpose:** Connect evidence to another transaction object.
- **Current status:** Existing as `document_links`, with a limited set of target types.
- **Authoritative fields:** deal/company, document, target type, target identifier/context, created date.
- **Owner:** User creating the link; business ownership follows linked objects.
- **Lifecycle:** Active or removed; removal must be audited.
- **Relationships:** Documents to financial lines, adjustments, metrics, issues, and future objects.
- **Evidence/financial impact:** Critical traceability edge; may indicate the evidence supporting a financial impact.
- **Audit requirements:** Link creation/removal and rationale where material.
- **Future considerations:** Expand target types additively and consider typed link tables or a governed polymorphic model.

### Reporting Period

- **Purpose:** Canonical company reporting period for normalized financials.
- **Current status:** Existing as `reporting_periods`.
- **Authoritative fields:** company, label, period date/end, created timestamp.
- **Owner:** System/import workflow with analyst confirmation.
- **Lifecycle:** Created and referenced; deletion is constrained by downstream use.
- **Relationships:** Normalized financial entries and add-backs; maps to source periods through ingestion logic.
- **Evidence/financial impact:** Core dimension for every financial output.
- **Audit requirements:** Creation, correction, merge/delete, and source-period mapping.
- **Future considerations:** Preserve period inference behavior and distinguish fiscal, monthly, quarterly, annual, YTD, and LTM semantics.

### Source Financial Entry

- **Purpose:** Preserve a financial line as received from a source document/period before canonical normalization.
- **Current status:** Existing as `source_financial_entries`.
- **Authoritative fields:** source period, account label, amount, category/statement context, source metadata.
- **Owner:** Source import; analyst may review mapping but should not erase original source identity.
- **Lifecycle:** Ingested, mapped/reviewed through adjacent models; source record remains traceable.
- **Relationships:** Source period/document, mappings, normalized outputs, reconciliation.
- **Evidence/financial impact:** Direct source value feeding normalization and comparison.
- **Audit requirements:** Ingestion, correction, mapping application, and exclusion.
- **Future considerations:** Immutable raw/source representation is preferable; corrections should be versioned or attributed.

### Normalized Financial Entry

- **Purpose:** Canonical financial line used by the authoritative model.
- **Current status:** Existing as `financial_entries`, with normalized outputs derived through `lib/`.
- **Authoritative fields:** company, period, statement type/category, account, normalized amount, mapping/source context.
- **Owner:** Financial model; analyst owns approved mapping or manual adjustment decisions.
- **Lifecycle:** Created/imported, corrected, or deleted under controlled workflows.
- **Relationships:** Reporting period, source entries/documents, account mapping, add-backs, calculations, workpapers, reports.
- **Evidence/financial impact:** Authoritative base for financial calculations.
- **Audit requirements:** Every value, category, sign, source, and manual change.
- **Future considerations:** Preserve one source of truth and avoid storing duplicate derived metrics as independent facts.

### Account Mapping

- **Purpose:** Map source account labels to canonical financial categories and statements.
- **Current status:** Existing as `account_mappings`, with mapping memory and intelligence in `lib/`.
- **Authoritative fields:** company/shared scope, normalized source label, target category, statement type, confidence/provenance where available.
- **Owner:** Analyst for saved mappings; system for deterministic rule outputs.
- **Lifecycle:** Suggested, applied, reviewed/overridden through current behavior; exact persistence statuses vary.
- **Relationships:** Source entries, normalized entries, mapping memory.
- **Evidence/financial impact:** Determines category placement and therefore downstream financial outputs.
- **Audit requirements:** Original suggestion, applied rule/memory, user override, scope, and timestamp.
- **Future considerations:** Preserve company-versus-shared precedence and regression behavior.

### Add-Back

- **Purpose:** Represent a potential or accepted EBITDA normalization adjustment.
- **Current status:** Existing as `add_backs` with statuses, source, classification, and linked entry support.
- **Authoritative fields:** company, period, type, amount, status, source, linked entry, rationale, confidence.
- **Owner:** Analyst; reviewer/approver is future workflow metadata.
- **Lifecycle:** Suggested, accepted, rejected; later report/close review may require approved/superseded states.
- **Relationships:** Period, financial entry, documents/backing, underwriting, issues, workpapers, reports.
- **Evidence/financial impact:** Direct adjusted EBITDA impact with required source backing.
- **Audit requirements:** Suggestion source, amount, classification, status, rationale, and every approval/reversal.
- **Future considerations:** Do not alter existing adjusted EBITDA treatment during UI migration.

### Reconciliation Result

- **Purpose:** Deterministic result comparing sources or verifying financial consistency.
- **Current status:** Existing as derived outputs from `reconciliation.ts` and `source-reconciliation.ts`; not clearly persisted as a first-class result.
- **Authoritative fields:** scope, sources, period, status, differences, tolerance, issues, calculated timestamp.
- **Owner:** System calculation; analyst owns resolution and evidence.
- **Lifecycle:** Reconciled, warning, failed/unreconciled; recalculated when authoritative inputs change.
- **Relationships:** Source and normalized entries, documents, issues, workpapers.
- **Evidence/financial impact:** Quantifies discrepancies and confidence in downstream values.
- **Audit requirements:** Inputs, tolerance/version, result, timestamp, and resolution.
- **Future considerations:** Persistence may be useful for historical audit but must not create stale competing truth.

### Underwriting Scenario

- **Purpose:** Represent base/upside/downside or financing assumptions and derived credit outputs.
- **Current status:** Partial; scenario types and calculations exist, while most scenario state is client-local or based on defaults.
- **Authoritative fields:** deal, scenario key, assumptions, basis, version, owner, status, calculated outputs.
- **Owner:** Underwriting analyst; reviewer when approved.
- **Lifecycle:** Draft, in review, approved, superseded.
- **Relationships:** Financial outputs, add-backs, credit metrics, risks, workpapers, reports.
- **Evidence/financial impact:** Directly informs leverage, DSCR, LTV, and transaction decision context.
- **Audit requirements:** Every assumption, basis, formula version, output, reviewer, and supersession.
- **Future considerations:** Additive persistence may be required; protected formulas remain unchanged.

### Diligence Issue

- **Purpose:** Record a deterministic finding, discrepancy, risk, or required resolution.
- **Current status:** Existing as `diligence_issues`, with system/manual sources, categories, severity, status, evidence context, and derived readiness.
- **Authoritative fields:** company/deal, period where applicable, code/title/description, source type, category, severity, status, linked page/field, backing status.
- **Owner:** Partial/absent in current schema; future assigned owner.
- **Lifecycle:** Open, in review, resolved, waived.
- **Relationships:** Evidence, source/financial records, workstream, tasks, workpapers, reports, closing items.
- **Evidence/financial impact:** Must link evidence; potential/actual impact should be explicit when known, never inferred in presentation.
- **Audit requirements:** Creation source, severity, status, evidence, management response, resolution, and waiver rationale.
- **Future considerations:** Owner, due date, financial impact, likelihood, responses, and checklist may require additive fields.

### Workpaper

- **Purpose:** Govern a prepared and reviewed unit of diligence analysis.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** deal/workstream, ID/title, purpose, period, preparer, reviewer, status, template, current version, location.
- **Owner:** Preparer; reviewer has separate accountability.
- **Lifecycle:** Not started, in progress, awaiting review, reviewed/complete, reopened, archived.
- **Relationships:** Documents, financial records, issues, requests, report sections, checklist, versions.
- **Evidence/financial impact:** Supports analysis and findings; financial values reference the authoritative model.
- **Audit requirements:** Preparation, review, version, link, checklist, and reopening history.
- **Future considerations:** A file is workpaper content, not the complete workpaper identity.

### Workpaper Checklist

- **Purpose:** Define completion and review controls for a workpaper.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** workpaper, checklist item, required flag, status, completed/reviewed by and at.
- **Owner:** Workpaper preparer or reviewer according to item type.
- **Lifecycle:** Not started, complete, failed/reopened.
- **Relationships:** Workpaper, evidence, review activity.
- **Evidence/financial impact:** May require tie-out or source support; no independent financial value.
- **Audit requirements:** Completion identity/time, reversal, reviewer disposition.
- **Future considerations:** Templates should create versioned checklist definitions.

### Report

- **Purpose:** First-class diligence deliverable assembled from authoritative transaction outputs.
- **Current status:** Partial; export functions and summary content exist, but no persisted report workflow.
- **Authoritative fields:** deal, title/type, owner, status, period coverage, template, current version, delivery metadata.
- **Owner:** Report owner/editor; reviewer and approver are distinct.
- **Lifecycle:** Draft, in progress, in review, approved/complete, delivered, superseded/archived.
- **Relationships:** Sections, versions, documents, workpapers, findings, financial outputs, deliverables.
- **Evidence/financial impact:** Presents authoritative financial values and findings without recalculation.
- **Audit requirements:** Section composition, review, approval, version, export, share, and delivery.
- **Future considerations:** Additive schema required; an export file is not automatically a report record.

### Report Section

- **Purpose:** Owned, reviewable component of a report.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** report, section key/title/order, owner, status, content reference, completion, updated timestamp.
- **Owner:** Assigned author; reviewer separately tracked.
- **Lifecycle:** Not started, draft/in progress, awaiting review, complete/approved.
- **Relationships:** Report, findings, workpapers, financial outputs, comments.
- **Evidence/financial impact:** References source-backed outputs; no duplicate formulas.
- **Audit requirements:** Content/version, ownership, status, linked-output changes.
- **Future considerations:** Store structured references separately from rendered narrative where practical.

### Report Version

- **Purpose:** Preserve immutable report composition/output history.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** report, version number, creator, created timestamp, source section versions, output locations, status.
- **Owner:** Report owner; creator attribution retained.
- **Lifecycle:** Immutable draft/review/final snapshots; may be superseded but not rewritten.
- **Relationships:** Report, sections, exported files, delivery event.
- **Evidence/financial impact:** Captures exact reported values and evidence references at a point in time.
- **Audit requirements:** Creation, approval, export, delivery, supersession.
- **Future considerations:** Record calculation/output version identifiers for reproducibility.

### Comment

- **Purpose:** Contextual collaboration attached to a transaction object.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** author, body, parent object, mentions, created/edited/resolved timestamps.
- **Owner:** Author; resolution owner may differ.
- **Lifecycle:** Active, edited, resolved, deleted/archived under policy.
- **Relationships:** Any commentable object, users, activity events.
- **Evidence/financial impact:** Commentary is not evidence or a financial fact unless explicitly linked and promoted through a controlled workflow.
- **Audit requirements:** Original text, edits, resolution, deletion, mentions.
- **Future considerations:** Avoid storing comments as unstructured replacements for statuses or approvals.

### Q&A Item

- **Purpose:** Track a question and authoritative answer within a deal.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** question, asker, assigned respondent, status, due date, answer, linked objects.
- **Owner:** Assigned respondent; question owner remains visible.
- **Lifecycle:** Open, assigned, answered, under review, resolved/closed.
- **Relationships:** Requests, documents, issues, workpapers, comments.
- **Evidence/financial impact:** Answer may provide context but must link evidence before supporting material conclusions.
- **Audit requirements:** Question, assignment, answer versions, review, resolution.
- **Future considerations:** Keep distinct from information requests and comments.

### Deliverable

- **Purpose:** Required output for a phase, report, close, or handover.
- **Current status:** Partial through exports and wireframe concepts; no first-class persisted model.
- **Authoritative fields:** deal/phase, title/type, owner, status, due/delivered date, linked report/document/version.
- **Owner:** Assigned producer or deal lead.
- **Lifecycle:** Not started, in progress, awaiting review, approved, delivered, accepted/complete.
- **Relationships:** Phase, report, document, workpaper, task, recipient.
- **Evidence/financial impact:** May contain financial outputs; retains exact version/link.
- **Audit requirements:** Owner, review, approval, delivery, recipient, and version.
- **Future considerations:** Additive schema required; delivery must identify the delivered artifact version.

### Closing Adjustment

- **Purpose:** Represent an approved or proposed change affecting transaction value at close.
- **Current status:** Absent as a closing entity; add-backs and financial adjustments are adjacent but not interchangeable.
- **Authoritative fields:** deal, type, description, amount, currency, source, owner, reviewer/approver, status, effective date.
- **Owner:** Closing/finance workstream lead.
- **Lifecycle:** Proposed, in review, approved, rejected, finalized, superseded.
- **Relationships:** NWC/debt-like items, documents, workpapers, issues, purchase-price bridge, deliverables.
- **Evidence/financial impact:** Direct financial impact; complete provenance required.
- **Audit requirements:** Source, amount, methodology, approval, version, and bridge effect.
- **Future considerations:** Requires separately approved domain rules and additive schema.

### Net Working Capital Item

- **Purpose:** Line item contributing to peg, closing balance, variance, and NWC adjustment.
- **Current status:** Partial through normalized balance-sheet outputs; no closing-specific entity.
- **Authoritative fields:** deal, account/component, classification, peg, closing balance, variance, tolerance/status, source.
- **Owner:** Working-capital workstream owner.
- **Lifecycle:** Draft, reconciled, in review, approved/final.
- **Relationships:** Financial entries, documents, workpapers, closing adjustment.
- **Evidence/financial impact:** Direct purchase-price impact.
- **Audit requirements:** Classification, source, peg method, balance, variance, approval, and version.
- **Future considerations:** Additive schema and separately approved calculation methodology required.

### Debt and Debt-Like Item

- **Purpose:** Identify obligations affecting purchase price or funds flow.
- **Current status:** Partial through balance-sheet normalization and credit metrics; no closing-specific item model.
- **Authoritative fields:** deal, item type, description, amount, currency, source, treatment, owner, approval status.
- **Owner:** Debt/debt-like workstream owner.
- **Lifecycle:** Identified, under review, agreed, approved/final, excluded with rationale.
- **Relationships:** Financial records, documents, workpapers, issues, closing adjustments.
- **Evidence/financial impact:** Direct transaction-value impact.
- **Audit requirements:** Source, classification, treatment, amount, approval, and changes.
- **Future considerations:** Additive schema and separately approved classification rules required.

### Activity Event

- **Purpose:** Durable audit-oriented record of material transaction activity.
- **Current status:** Absent as a generalized model; timestamps and debug logs are not equivalent.
- **Authoritative fields:** organization/deal, actor, action, object type/ID, timestamp, before/after summary, correlation ID.
- **Owner:** System-generated and immutable.
- **Lifecycle:** Append-only; retention/archival policy may apply.
- **Relationships:** Any material transaction object and user.
- **Evidence/financial impact:** May record changes to financial-impacting objects but is not the authoritative value.
- **Audit requirements:** It is itself an audit record; prevent silent mutation.
- **Future considerations:** Additive schema required and sensitive data minimization needed.

### Notification

- **Purpose:** Deliver user-specific awareness of assigned or changed transaction work.
- **Current status:** Absent; additive schema required.
- **Authoritative fields:** recipient, event/source object, type, read state, created/seen timestamp, delivery channel status.
- **Owner:** Recipient for read state; system for content/event association.
- **Lifecycle:** Unread, read, archived; external delivery states remain separate.
- **Relationships:** Activity event, user, deal, source object.
- **Evidence/financial impact:** No independent impact; links to authoritative object.
- **Audit requirements:** Creation and external delivery where applicable; read state is operational metadata.
- **Future considerations:** Must respect deal access and notification preferences.

### Deal Memory / Benchmark Snapshot

- **Purpose:** Capture eligible point-in-time deal metrics for comparison and institutional memory.
- **Current status:** Existing as `deal_memory` with runtime, read, capture, and benchmark modules.
- **Authoritative fields:** deal/company identity, snapshot timestamp, financial metrics, industry/model/band, completeness, sources, risks, blockers, stage, eligibility/confidence.
- **Owner:** System capture; deal team owns source records and eligibility resolution.
- **Lifecycle:** Immutable snapshots; eligibility may be evaluated at capture.
- **Relationships:** Deal/company and benchmark peer sets.
- **Evidence/financial impact:** Comparative context only; it must not overwrite current authoritative financials.
- **Audit requirements:** Snapshot inputs, timestamp, eligibility reason, calculation/version context.
- **Future considerations:** Add organization scoping and approved read policy; current RLS policy status requires review.

## C. Relationship model

Broadstone’s transaction objects form a directed evidence and execution graph:

```text
Planning scope and workstreams
  → information requests and tasks
  → source documents and responses
  → source financial records
  → mappings and normalized financial records
  → reconciliations, underwriting, and workpapers
  → issues, add-backs, and other adjustments
  → report sections and reports
  → closing adjustments, deliverables, and handover
```

Required relationship semantics:

- Requests produce or link documents and responses.
- Documents support source records, workpapers, issues, adjustments, report sections, and closing items.
- Workpapers reference authoritative financial outputs and supporting documents.
- Workpapers support findings; findings do not become authoritative merely because they appear in narrative.
- Findings feed reports through explicit links.
- Findings, add-backs, NWC items, debt-like items, and approved closing adjustments may affect close, but each remains a distinct domain concept.
- Reports reference authoritative financial outputs and their evidence. Reports do not calculate a second EBITDA or reconciliation value.
- Deliverables identify the exact report/document version delivered.
- Material object creation, assignment, review, approval, status change, and delivery create activity events when that platform capability exists.
- All financial outputs preserve source backing or explicitly state that backing is unavailable/partial.

## D. Canonical cross-cutting fields

Where relevant, new entities should standardize the following fields and semantics:

| Field | Meaning |
|---|---|
| `id` | Stable object identity |
| `organization_id` | Future tenant boundary |
| `deal_id` | Canonical transaction scope |
| `title` | Human-readable object name |
| `description` | Controlled explanatory text |
| `owner_id` | Person accountable for advancing the object |
| `reviewer_id` | Person accountable for review/approval where distinct |
| `status` | Entity-specific lifecycle state |
| `severity` | Materiality/urgency classification where relevant |
| `due_date` | Contracted or internal deadline |
| `completed_at` | Timestamp at which lifecycle requirements were met |
| `financial_impact` | Signed or explicitly directed amount under defined methodology |
| `currency` | Currency of monetary fields |
| `source` | System/manual/import/integration origin or source reference |
| `confidence` | Evidence/calculation confidence under a defined vocabulary |
| `created_at` / `updated_at` | Record timestamps |
| `created_by` / `updated_by` | Attributed user/system actor |
| `version` | Optimistic concurrency or business version as explicitly defined |
| `archived_at` | Recoverable retirement without destructive deletion |

Not every field applies to every entity. Fields must not be added merely for uniformity. In particular, financial impact, severity, reviewer, currency, and due date require actual domain meaning.

## E. Status lifecycles

Status vocabularies are entity-specific and map to shared visual tones; they must not be forced into one universal database enum.

### Task

`not_started → in_progress → complete`, with `blocked` as an actionable state and optional `awaiting_review` before completion. `overdue` is normally derived from due date and incomplete status.

### Information request

`draft → sent/open → response_received → under_review → closed`, with cancellation as a terminal exception. Reminders do not change lifecycle by themselves.

### Document review

`pending → under_review → reviewed`, with `issues_flagged` or `rejected/needs_revision` only if the product defines their operational consequences. Archive status remains distinct from review status.

### Diligence issue

Current lifecycle remains `open → in_review → resolved`, with `waived` as a separately justified terminal disposition. Reopening must be auditable.

### Workpaper

`not_started → in_progress → awaiting_review → reviewed/complete`, with `reopened` returning to active work and `archived` separate from completion.

### Report

`draft → in_progress → in_review → approved/complete → delivered`, with supersession/versioning rather than destructive replacement.

### Phase

`not_started → in_progress → awaiting_review → complete`, with `blocked` when a defined blocker prevents advancement. Completion must expose its checklist or calculation basis.

### Deliverable

`not_started → in_progress → awaiting_review → approved → delivered → accepted/complete` where recipient acceptance is required.

## F. Traceability model

The expected financial and evidence chain is:

```text
Source file
→ source document version
→ source reporting period and source financial record
→ account mapping and sign/category provenance
→ normalized financial record
→ protected calculation or reconciliation output
→ workpaper and review controls
→ issue, add-back, underwriting adjustment, or closing adjustment
→ report section and report version
→ closing output or delivered artifact
```

Every reported number should expose:

- Authoritative value and unit.
- Period and entity scope.
- Calculation/basis label.
- Source records and document versions.
- Mapping and normalization provenance where applicable.
- Adjustments and approvals affecting the value.
- Confidence, reconciliation, and backing state.
- Report or closing version in which the value was used.

Every issue should expose its originating rule or manual source, evidence, affected period/workstream, owner, status, financial impact when known, and resolution/waiver history.

Traceability metadata must not be recomputed differently on each page. Pages consume the same backing and domain outputs.

## G. Current-schema mapping

| Current table | Target domain mapping | Status and gap |
|---|---|---|
| `companies` | Company plus temporary Deal aggregate | Existing but conflates company and transaction identity; no organization/workspace key |
| `reporting_periods` | Reporting Period | Existing; preserve period semantics and downstream keys |
| `financial_entries` | Normalized Financial Entry | Existing authoritative normalized base; derived metrics should not become duplicate facts |
| `account_mappings` | Account Mapping and mapping memory persistence | Existing; preserve company/shared scope and precedence |
| `add_backs` | Add-Back | Existing; future reviewer/approval/version fields may be additive |
| `source_documents` | Source Document | Existing; review, folder, tags, ownership, and richer access metadata are incomplete |
| `source_reporting_periods` | Source reporting-period evidence layer | Existing; connects document evidence to source entries |
| `source_financial_entries` | Source Financial Entry | Existing; preserve raw/source provenance |
| `document_links` | Document Link | Existing; target object coverage must expand in a governed way |
| `document_versions` | Document Version | Existing; stronger immutability/attribution may be required |
| `diligence_issues` | Diligence Issue | Existing; owner, due date, impact, likelihood, responses, and richer links are gaps |
| `deal_memory` | Deal Memory / Benchmark Snapshot | Existing; organization scope and active access policy require future review |

Major target gaps include Organization, User, Membership, Engagement/Workspace, explicit Deal, Phase, Workstream, Milestone, Task, Information Request, Workpaper, Workpaper Checklist, Report, Report Section, Report Version, Comment, Q&A Item, Deliverable, Closing Adjustment, NWC Item, Debt and Debt-Like Item, Activity Event, and Notification.

These gaps are not authorization to generate migrations. Each requires product semantics, authorization design, lifecycle tests, and separately approved additive schema work.

## H. Domain-model constraints

1. A document is evidence or content; it is not automatically a workpaper.
2. An export is an output artifact; it is not automatically a report record or report version.
3. A company is not necessarily the complete or permanent deal identity.
4. A dashboard metric is not an authoritative stored fact unless explicitly modeled; most metrics should be derived from the financial model.
5. Reports reference authoritative financial outputs and must not duplicate calculations.
6. Issues must link to supporting evidence or explicitly disclose missing/partial backing.
7. Add-backs, underwriting assumptions, closing adjustments, NWC items, and debt-like items are distinct concepts even when they affect related values.
8. Closing adjustments must preserve source, calculation/basis, owner, reviewer/approval, version, currency, and history.
9. Source records must remain distinguishable from normalized records.
10. Mapping suggestions, saved mappings, user overrides, and applied provenance must remain distinguishable.
11. Empty, unavailable, incomplete, failed, and zero are different states.
12. Activity events and comments do not replace authoritative lifecycle fields.
13. Every tenant-scoped entity must eventually enforce organization and deal access through application authorization and aligned RLS.
14. Future schema evolution should be additive and compatibility-preserving until existing routes, APIs, financial outputs, and deep links have migrated.
