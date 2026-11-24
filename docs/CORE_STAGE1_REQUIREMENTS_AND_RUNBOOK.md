# NIMIS operational implementation — controlled Stage 1

**Status: development implementation; real Ministry deployment is blocked.**  
**Requirements checked against** `NIMIS_Concept_and_GUI_Illustrations_PowerBI.pdf` (13 November 2026), `Irrigation_Survey - mWater Portal_3(1).pdf`, and `NIMIS_Data_Collection_App_Development_Prompt(1).pdf` (23 November 2026).

## Business objective
NIMIS is one authoritative national irrigation scheme register with linked water, area, infrastructure, crops, O&M, energy and project records. Capture → District verification → Provincial review → technical approval → publication; validated records flow to geographical dashboards and BI. The Collector app is offline-first and the main web app is the reporting and administrative workspace.

## What Stage 1 now executes (PostgreSQL, local development only)

| Capability | Evidence | Limit |
|---|---|---|
| Central scheme UUID and unique code | `nimis_stage.scheme`, uniqueness constraint, FastAPI scheme routes | Local `nimis_core_dev` only; official master not migrated |
| Four role labels and scoped geography | `nimis_stage.actor`, `assignment`, API scope checks | Synthetic actors supplied by loopback-only dev header; no SSO or MFA |
| Concurrent scheme edits | Row lock and `base_revision` compare, HTTP 409 on stale input | Verified by two-writer PostgreSQL CI test, not a scale benchmark |
| Assigned scheme capture | Collector submit requires active assignment and district match | Operational status form v1 with measured values only |
| Measured field provenance | Unit, value, source, timezone-aware observed_at, captured_at, received_at | Photos, polygon, evidence and all mWater fields still missing |
| Idempotent offline retry | UUID event ID and canonical SHA256 matching | No installed secure phone outbox linked to this new API |
| Multi-period history and corrections | Unique scheme/form/period/revision; linked prior submission; no overwrite | No user-facing correction UI outside development lab |
| Conflict detection | Base master revision mismatch stored as `CONFLICT` | DIDO conflict resolution screen not implemented |
| 4-stage workflow | District VERIFY → Provincial REVIEW → Admin delegated technical approve → Admin PUBLISH; RETURN supported district/province | Technical approver permission delegation and official identity remain unapproved |
| Immutable audit rows | Separate `audit` and `decision` tables | Formal audit retention and tamper resistance still unapproved |
| Published-only area totals | `/api/v1/stage/report/area` filters PUBLISHED, reporting period and geography | Demo only; 500-row cap; not the production Power BI warehouse |
| Interactive test operations | `Core Database Workflow (Test)` development menu | Development mode only; never enter real records |
| Windows startup | `scripts/START_NIMIS_CORE_LOCAL.ps1` | Requires previous project-local NIMIS Collect PostgreSQL already running |

### Implementation boundaries

- **Never point the development API at an official database.** The code refuses all PostgreSQL locations except localhost/127.0.0.1 and DB name `nimis_core_dev`.
- The database is separate from NIMIS Collect's `nimis_collect_dev`. Launching it does not merge the two databases.
- The `X-Nimis-Dev-Actor` header is for synthetic loopback use only; it is *not secure production authentication*. Default disabled.
- Stage 1 accepts only `operational_status` form version 1. The Collector repository has draft definitions for the eleven forms, but they are not all implemented or Department-approved.
- The main Registry still uses browser-local records. It no longer allows a browser-only verification shortcut, and a fresh browser does not silently populate national scheme records.
- No cloud deployment, production DB migration, official user provisioning, real offline sync, photograph upload, Power BI connection, national reporting, or live data import has occurred.

## Run development backend on Windows (without installing Docker)

Prerequisite: NIMIS Collect's existing project-local PostgreSQL 16 started on `127.0.0.1:55432`; its admin password file is in the ignored `DCA NIMIS/database/.env.local`. Both local project folders remain intact.

Clone the review branch to a **separate folder**, for example:
```powershell
cd "C:\Users\2025\Desktop"
git clone --depth 1 --single-branch --branch feat/nimis-core-transactional-backend https://github.com/CipherBloom07/NIMIS.git NIMIS-Core-Stage1
cd ".\NIMIS-Core-Stage1"
& ".\scripts\START_NIMIS_CORE_LOCAL.ps1" -SeedFictional
```

The launcher creates only the separate `nimis_core_dev` database on the existing local PostgreSQL server, applies schema/limited role grants and generates a random runtime password under ignored `database/local/core.env`. It then runs FastAPI on `127.0.0.1:8775`.

From another PowerShell terminal, use:
```powershell
cd "C:\Users\2025\Desktop\NIMIS-Core-Stage1"
npm ci
npm run dev -- --host 127.0.0.1 --port 8110 --strictPort
```

Open `http://127.0.0.1:8110`, then **Core Database Workflow (Test)** (development menu). Select a synthetic role, click Connect/Refresh, create a fictional scheme if needed, assign collector, submit fictitious observation and process staged decisions. An admin can view the published-only fictional area report.

For CI, see `.github/workflows/core-postgres.yml`. It runs real PostgreSQL 16 tests and does **not** require Docker on your own PC.

### Synthetic personas
```text
admin:      00000000-0000-4000-8000-000000000001
province:   00000000-0000-4000-8000-000000000002
district:   00000000-0000-4000-8000-000000000003
collector:  00000000-0000-4000-8000-000000000004
different district: 00000000-0000-4000-8000-000000000005
test scheme: 00000000-0000-4000-8000-000000001000
```

## Work still required before the project's original purpose is fully met

1. Approve the **full national scheme identifier policy and data dictionary** with DIDO/PIDO/Department ICT and integrate authoritative district/ward GIS geometry.
2. Approve all **eleven** form definitions against every mWater questionnaire question, its answer options, conditional rules and consent/privacy requirements, then build the server-driven form renderer.
3. Implement individual production accounts, official identity tokens/MFA, device enrolment, revocation, inactivity lock, secure offline key storage and data retention.
4. Convert the Collector app's *real* IndexedDB drafts/outbox/photos to approved `/sync/push`, `/sync/pull` with durable per-operation acknowledgements, deltas, chunked resumable attachments, clocks, tombstones and retries.
5. Provide DIDO duplicate/new-scheme assessment and conflict-resolution screens, offline review decisions and correction workflow with evidence.
6. Migrate main NIMIS forms and scheme Registry from browser `localStorage` to the authoritative PostGIS schema, with season/crop, water, asset, project, energy and O&M linked tables and protected revisions.
7. Implement formally delegated national **technical approval** (not an unrestricted admin shortcut), complete audit controls and publication/retraction policy.
8. Deliver curated, read-only Power BI data mart with agreed denominator definitions, provincial/district RLS, quality alerts, reporting dates and scheduled refresh; do not query the main write database indiscriminately.
9. Benchmark at least 100 concurrent officer sessions, burst upload/retry cycles, large scheme lists and restoration from outages. Measure p95 latency, data loss, duplicate rates and rollback/recovery.
10. Conduct Ministry security/privacy review, farmer privacy review, real-device rural offline UAT, backup and restore drill, signed acceptance and deployment approval.

**No merge or production deployment without explicit authorization.**
