# NIMIS: working two-application presentation (local demo)

This release pairs Main NIMIS and NIMIS Data Collection with one **real local PostgreSQL** database and the same protected FastAPI Core service. It is **functional, fictional pilot software**, not Ministry production. No real farmers, facilities, accounts or financial records should be captured.

## What is now connected

1. Main NIMIS District Officer assigns an irrigation scheme to Data Collector.
2. Data Collector saves a survey locally in IndexedDB, including photos when supplied.
3. Collector queues the saved revision. A server heartbeat checks Core, refreshes assignments and retries **only explicitly queued events** while the app is visible.
4. Core checks immutable event ID, authorized assignment, scheme revision, form types and evidence; a valid submission appears in the District Officer's **live** form inbox.
5. District Officer can **RETURN** with a visible reason or **VERIFY**.
6. Provincial Officer **REVIEW**; delegated Admin **TECHNICAL APPROVE** then **PUBLISH**. A returned form can be corrected and resubmitted as a new audited revision.
7. Only **PUBLISHED** records with an approved demo reporting mapping appear under Executive Dashboard > **Connected field reporting — Development Test**. No official national totals or other browser-registry records are modified.

## Starting all components on one Windows laptop

Keep your original code and database folders; do not copy, reset, or delete their files. Download/check out these two presentation branches (Git) into **sibling directories**:

- Main: `CipherBloom07/NIMIS` branch `feat/presentation-connected-workflow-v1`
- Collector: `CipherBloom07/NIMIS-Data-Collection` branch `feat/presentation-collector-sync-v1`

The older **Collector portable PostgreSQL 16 installation** (its `database/postgresql`, `database/data` and `database/.env.local` directory) must already exist. The presentation script uses that existing database with NO destructive reset. It creates or updates **separate local database `nimis_core_dev`**, never the Collector's original `nimis_collect_dev`.

From **Main NIMIS root**:

```powershell
& .\scripts\START_NIMIS_PRESENTATION.ps1 -CollectorApp "C:\path\to\NIMIS-Data-Collection" -DatabaseProject "C:\path\to\original\DCA NIMIS" -EnableFictionalSignoffs
```

The fictional signoffs switch changes **only isolated demo approval rows** and enables a complete four-role presentation. Remove the switch if you want to demonstrate rejection of unapproved forms.

The script starts the existing PostgreSQL instance if stopped, performs safe schema setup, seeds a fictional scheme and actors, starts Core, and opens both local frontends. It never opens a firewall port or kills another process. If another app owns a port, the launcher stops with an explanation.

| Component | URL |
|---|---|
| Main NIMIS | http://127.0.0.1:8110 |
| Data Collector | http://127.0.0.1:5191 |
| Core API health | http://127.0.0.1:8775/api/v1/stage/health |

For a read-only verification after start, from Main root run:

```powershell
& .\scripts\TEST_PRESENTATION_BRIDGE.ps1 -Month 2026-11
```

Expected: `CORE_HEALTH: PASS`, `DISTRICT_ASSIGNED_COLLECTOR: PASS`, `COLLECTOR_REPORT_DENIAL: PASS`, `READ_ONLY_PRESENTATION_PRECHECK: PASS`.

## Live presentation: what to click

1. Collector > **Requirements Forms (Draft)**. In Main Core Operations (Test) shows the seeded scheme `DEMO-NIMIS-0001` (`Fictional Canal Scheme — Training Only`, `DEMO-P/DEMO-D`). It is already assigned to the fictional collector.
2. Collector should display **Connection to Main NIMIS: Connected** and one or more assigned schemes. Pick **Water Availability and Abstraction**.
3. Reporting month: `2026-11`. Top-level source: `Synthetic NIMIS presentation`. Top-level observation date: `2026-11-24T09:00:00Z`.
4. Manually type the following **fictional answers** (all numbers are invented):

| Field | Type/select |
|---|---|
| water_source_id | DEMO-CANAL-01 |
| reading_type | gauge |
| water_level | 3.20 |
| storage_percent | 65 |
| flow | 0.42 |
| abstraction_volume | 1240 |
| rainfall | 18.5 |
| observed_at | 2026-11-24 09:00 |
| source | Fictional gauge reading |

5. **Save offline draft** → verify it appears under Saved local forms, then **Queue saved revision**. Turn the backend off or disconnect in DevTools to show that a pending event stays on the device. Restore the backend and click **Reconnect and sync queued forms**.
6. Main > **District Collector Inbox**. The new record appears automatically in the server-connected officer inbox with status `AWAITING_FORM_APPROVAL`.
7. Option A: click **Return for correction**, type `Recheck water level`. Collector > **Refresh officer decisions** → **Correct returned form**, change 3.20 to 3.10, save a **new revision** and queue it. It returns to District for verification.
8. **District Collector Inbox: Verify form** → **Provincial Review: Approve provincial review** → **Admin Publication: Technical approval** → **Admin Publication: Publish**. Each page refreshes the same PostgreSQL records automatically.
9. Main > **Reports & Analytics** (or Executive Dashboard) > **Connected field reporting — Development Test**. Set the same month, click **Read published test records**. The form should now appear under Water resources with units, scheme and district. Prior to PUBLISH it must not appear here.

### Additional negative controls to demonstrate

- Try `storage_percent=120`: Collector must flag it and prohibit queueing.
- Try the District Officer persona on another district's form: access must be refused.
- Collector persona cannot load the published reporting API (HTTP 403).
- Submitting an identical queued event twice must not create duplicate entries.
- Turning off internet does NOT delete saved forms; deleting browser site data **can** delete them because the pilot is not yet encrypted/backed up.

## Implementation limitations — important for an honest presentation

This is a **local, same-machine integration pilot**, not a deployed system accessible to phones over the internet. The Collector is a mobile-responsive PWA, not a production-enrolled native Android application. Cross-device private HTTPS, Ministry OIDC/MFA, encrypted offline storage, approved data dictionary, production GIS/BI integration, backups, security assessment and Ministry authorization remain necessary before real field deployment.

Do not claim that all legacy browser-local NIMIS dashboard modules read from PostgreSQL. The **Connected field reporting — Development Test** panel is the real server-backed integration proof.

## Actual four NIMIS officer/reporting modules

- **District Collector Inbox** uses Core `/api/v1/stage/forms/inbox` and verifies or returns saved Collector records.
- **Provincial Review** reads the exact same Core records under the Provincial Officer scope, not the old :8765 service.
- **Admin Publication** records a delegated technical approval and a final publication step in that same Core database.
- **Reports & Analytics** and published observation panels in Water, Infrastructure & O&M, Agronomy and Project Implementation read the Core published-only API; they do not silently import mutable browser drafts.

The web topbar now reports **Core connected** or **Core offline**, which is distinct from general internet connectivity. The Collector's **Save and send to District** action saves locally and attempts synchronization, showing a real receipt only when the Core confirms it. It retains unsent records offline for retry.
