# NIMIS Collector → Officer Approval → Published Reporting (local pilot)

**Status: code implemented and covered by development tests. NOT official national reporting.** This integration is kept in a reviewable branch. Do not connect it to actual Ministry data.

## End-to-end path now supported

Collector draft (one of 11 proposed datasets, canonical scheme UUID) → saved immutable offline revision → signed/dev-only test identity → SHA-256 photo upload (when an assigned scheme exists) → idempotent Core stage form receipt → officer inbox → DIDO VERIFY → PIDO REVIEW → delegated NATIONAL TECHNICAL_APPROVE → Admin PUBLISH → published-only typed read model → NIMIS Core Workflow (Test) and optional CSV.

The collector can retrieve the authoritative review status and district return reason from `GET /api/v1/stage/forms/sync/status/{event_id}`. A returned or scheme-conflicted event remains on-device and requires a new corrected revision rather than silently overwriting the old event.

## Technical reporting contract

- `GET /api/v1/stage/forms/reports/published?period_code=YYYY-MM` returns only entries having `status='PUBLISHED'` **and** a separately approved form/version with `reporting_mapping_approved=true`.
- `GET /api/v1/stage/forms/reports/published.csv?period_code=YYYY-MM` exports the same scope-controlled, per-record view. It prevents spreadsheet formula injection.
- Queries enforce administrator/provincial/district database-owned geographic restrictions. Collectors cannot retrieve reporting exports. Each result retains scheme UUID, period, form, version, observation date and source.
- Typed measurements are mapped to NIMIS modules: registry, scheme operations, agronomy, water resources, infrastructure, O&M, energy, projects, monitoring and beneficiaries. Mixed-currency finance values are **not** converted or aggregated.
- The report shows latest published revision **per original record ID**; independent crop/plot/water readings remain distinct. **It deliberately does not calculate national/provincial area totals** from overlapping datasets. Reporting domain owners must approve exact indicator definitions and deduplication before enabling roll-up dashboards.
- The main user-facing dashboards are unchanged. New reporting is displayed only under **Core Database Workflow (Test)**, with a clear `PUBLISHED_DEMO_ONLY` label.

## Automated acceptance

See `server/core/test_core.py`: unassigned or cross-district data denied; idempotent queue receipts; geo-scope; verified form approvals, technical delegation, and mapping approval; PUBLISHED-only visibility, explicit units, CSV injection defense, returned feedback and typed field validation.

Run the paired **development review branches** in fresh local clones using:
- Main: `feat/published-form-reporting-v1`
- Collector: `feat/collector-sync-ack-review-v1`

Use `scripts/START_NIMIS_CORE_LOCAL.ps1` in the Main clone after following `docs/CORE_STAGE1_REQUIREMENTS_AND_RUNBOOK.md`; the Core backend requires the separate `nimis_core_dev` database and synthetic actors. Use the Collector's existing `docs/TWO_APP_FORM_PILOT_RUNBOOK.md` to start the standalone Vite frontend.

## Outstanding institutional/production work

1. Final Ministry-signed form data dictionary, nested field schemas, privacy rules and approved selections.
2. Approved public OIDC provider/client, individual officer enrolment, secure TLS API hosting and token lifetimes.
3. Encrypted Android native offline database, device-keychain secrets and remote revocation.
4. Production object storage and resilient media transfer, backed up and classified; current stage photo store is local PostgreSQL only.
5. Approved domain table projections, GIS/postgis geometry, Power BI indicator definitions, season/currency standards, revision reconciliation and published-only national totals.
6. End-to-end real device UAT, load testing, security assessment, backup/restore drills and signed production authorization.

**Never treat this fictional staging `PUBLISHED` state as real Ministry publication.** The API deliberately reports `official:false` and does not update production scheme masters or national analytics.
