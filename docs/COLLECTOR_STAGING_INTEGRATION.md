# Two-app NIMIS field-data ingestion — isolated review integration

**Status:** DEVELOPMENT REVIEW ONLY. Not enabled for real Ministry information.

## Branches

- Main NIMIS Core: `CipherBloom07/NIMIS` → `feat/collector-field-form-staging-contract`.
- NIMIS Collect: `CipherBloom07/NIMIS-Data-Collection` → `feat/requirements-aligned-collection-v1`.

Both branches must be paired; older Core cannot receive proposed forms. Do not merge or deploy without authorization.

## Actual transport

1. The Collector React/PWA displays the existing eleven proposed forms, saves revisions offline into `nimis_requirements_drafts_v1`.
2. A user explicitly queues a saved revision in the separate durable IndexedDB `queue` object store. Exact event UUID and payload persist on retries.
3. The pilot `POST http://127.0.0.1:8775/api/v1/stage/forms/sync/push` accepts batches of 1–25. CORS is restricted to allowed local dev origins.
4. Main Core checks its synthetic test identity, active collector role, server-owned scheme UUID, geographic scope, active assignment, form/version, allowed keys and measurement/GPS constraints. A new-scheme request is an unlinked proposal; it must not create a scheme.
5. PostgreSQL writes immutable rows into `nimis_stage.field_form_submission` and an audit event. Stable replay is acknowledged duplicate; changed UUID/revision conflicts.
6. `GET /api/v1/stage/forms/inbox` exposes **metadata only** to district/provincial/admin test officers with geographic scope.
7. The existing **Core Database Workflow (Test)** page shows proposed form receipts; they **never** enter national report area totals or publish into scheme master. Status is `AWAITING_FORM_APPROVAL`, `EVIDENCE_PENDING` or `SCHEME_REVISION_CONFLICT`.

## Important remaining work

- **Photo/GPS evidence:** GPS JSON values can be staged with basic checks. Image IDs can be referenced, but actual binary photographs are **not uploaded**; receipts are `EVIDENCE_PENDING` if present. Do not claim field evidence is synchronized.
- **Questionnaire fidelity:** Eleven schema entries are proposed, not approved; current complex/repeating answers remain draft text inputs. mWater conditional/repeating questions and full NIMIS modules must be approved and validated field-by-field.
- **Identity/security:** Loopback-only synthetic actor header; no real accounts, OIDC, enrolled device, cryptographic offline storage or official authorization.
- **Review:** Form receipts await an institutional form dictionary, evidence policies and linked domain entities before district verification, provincial review, delegated national technical approval and official publication can be enabled.
- **Main reports:** `nimis_stage.field_form_submission` is explicitly outside production dashboards; no source-unsafe values become national statistics.
- **New scheme identity:** proposed schemes do not get authoritative UUIDs until district deduplication and approved registration.
- **Operational-status pilot:** existing typed Core `/api/v1/stage/sync/push` remains separate; it is the only path that currently exercises full fictional verify→review→technical→publish.
- **Release:** complete privacy, field UAT, security, backup/restore, dataset verification and authorizations before any live usage.

## Local CI

PostgreSQL core workflow validates: original Core transaction tests; new per-form staging acceptance, same-event duplicate handling, changed-data conflict, unassigned collector rejection, district isolation and no synthetic scheme master creation. The Collector PWA CI builds the new offline form/queue UI. These are **separate** automated tests; combined browser-to-Core acceptance still requires a running pair of local apps.

**No production database, deployed main NIMIS, or official data is modified.**
