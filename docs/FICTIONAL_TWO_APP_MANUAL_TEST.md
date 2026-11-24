# NIMIS — hands-on fictional two-app acceptance test (24 November 2026)

**Development demonstration only**. This uses a local PostgreSQL database named `nimis_core_dev`, synthetic accounts and fake irrigation figures. **Never enter real farmer details or Ministry records.** The official dashboard/Power BI numbers are unchanged.

## 1. Use separate Git checkouts

From PowerShell, choose an empty test workspace:

```powershell
$HomeTest = Join-Path $env:USERPROFILE 'Desktop\NIMIS_PAIRED_MANUAL_TEST'
New-Item -ItemType Directory -Force -Path $HomeTest | Out-Null
cd $HomeTest
git clone --branch feat/field-reporting-dashboard-test-v1 --single-branch https://github.com/CipherBloom07/NIMIS.git NIMIS_MAIN_TEST
git clone --branch feat/collector-quality-demo-v1 --single-branch https://github.com/CipherBloom07/NIMIS-Data-Collection.git NIMIS_COLLECTOR_TEST
```

Both checkouts must use these paired branches. No Git reset/clean is required on your existing working folders.

## 2. Start the **existing** portable PostgreSQL

You must already have the Collector's development PostgreSQL running at `127.0.0.1:55432`, including its admin password file `database\.env.local`. If not, set it up using the earlier Collector database runbook; do not point these scripts at any real database.

## 3. Start Main Core (PowerShell window A)

```powershell
$Test = Join-Path $env:USERPROFILE 'Desktop\NIMIS_PAIRED_MANUAL_TEST'
$CollectorOriginal = Join-Path $env:USERPROFILE 'Desktop\DCA NIMIS'
cd (Join-Path $Test 'NIMIS_MAIN_TEST')
& .\scripts\START_NIMIS_CORE_LOCAL.ps1 -CollectorProject $CollectorOriginal -SeedFictional
```

Expected: `NIMIS_CORE_DB_AND_ROLE: PASS`; API at `http://127.0.0.1:8775/api/v1/stage/health`. Leave window A open.

## 4. Explicitly enable fictional signoffs (PowerShell window B)

This is **only for the demo**, not Ministry form or officer approval. The script independently checks database name, synthetic account and synthetic scheme, and refuses other databases. The existing runtime cannot self-grant these permissions.

```powershell
$Test = Join-Path $env:USERPROFILE 'Desktop\NIMIS_PAIRED_MANUAL_TEST'
$CollectorOriginal = Join-Path $env:USERPROFILE 'Desktop\DCA NIMIS'
cd (Join-Path $Test 'NIMIS_MAIN_TEST')
& .\scripts\ENABLE_FICTIONAL_FORM_REVIEW.ps1 -CollectorProject $CollectorOriginal -EnableDemoOnly
```

Expected: `FICTIONAL_FORM_REVIEW: PASS`. Four test forms are enabled (water, operational status, seasonal production, energy); synthetic Admin has technical delegation. Other forms remain deliberately unapproved.

## 5. Start the two frontends (PowerShell windows C and D)

Window C:

```powershell
cd "$env:USERPROFILE\Desktop\NIMIS_PAIRED_MANUAL_TEST\NIMIS_MAIN_TEST"
npm ci
npm run dev -- --host 127.0.0.1 --port 8110 --strictPort
```

Window D:

```powershell
cd "$env:USERPROFILE\Desktop\NIMIS_PAIRED_MANUAL_TEST\NIMIS_COLLECTOR_TEST"
npm ci
& .\scripts\START_CONNECTED_COLLECTOR_PILOT.ps1 -CollectorPath (Get-Location).Path -CollectorPort 5191
```

Visit Main `http://127.0.0.1:8110/` and Collector `http://127.0.0.1:5191/`. In both, open the clearly marked **Development Test** views.

## 6. Enter fictional collector data manually

The already seeded, assigned scheme is **Fictional Canal Scheme — Training Only** (`DEMO-NIMIS-0001`; UUID `00000000-0000-4000-8000-000000001000`; `DEMO-P/DEMO-D`). If it is missing, Main → **Core Database Workflow (Test)** → Test persona District → **Connect / Refresh**. Collector → **Data collection — requirements forms** → choose that assigned scheme.

For each form, use **Reporting month 2026-11**, top-level **Observation 2026-11-24T09:00:00Z**, and top-level **Evidence source Synthetic NIMIS field training observation**. Expand **Fictional test values** on the Collector page and type the listed values. The same examples are saved in `schemas/fictional-manual-test-data.v1.json` in the Collector checkout.

For a quick first test, choose **Water Availability and Abstraction** and manually enter:

| Field | Value |
|---|---|
| water_source_id | DEMO-CANAL-01 |
| reading_type | gauge |
| water_level | 3.20 |
| storage_percent | 65 |
| flow | 0.42 |
| abstraction_volume | 1240 |
| rainfall | 18.5 |
| observed_at (field datetime input) | 2026-11-24 09:00 |
| source (field answer) | Fictional gauge reading |

Save offline draft → Queue saved revision → Sync test queue to NIMIS Core. Expected: queue `synced`, Core field inbox status `AWAITING_FORM_APPROVAL`, and **zero increase in published-only reporting counts** before approval.

## 7. Test complete stage-only officer chain

Main → **Core Database Workflow (Test)**: choose **Demo District Officer**, select **Connect / Refresh**, locate the new field form. You can **Inspect test data**, **Return for correction**, or **Verify**. For the positive path:

1. District → **VERIFY** → `DISTRICT_VERIFIED`
2. Provincial test persona → **REVIEW** → `PROVINCIAL_REVIEWED`
3. Demo Admin (explicit local technical delegation) → **TECHNICAL APPROVE** → `TECHNICAL_APPROVED`
4. Demo Admin → **PUBLISH** → `PUBLISHED`

Refresh the form inbox after changing persona. Then Main → **Executive Dashboard** → **Connected field reporting — Development Test**. Set reporting month `2026-11` and District Officer; click **Read published test records**.

Expected for this single water record: one **Water resources** row with water level `3.20 m`, storage `65 percent`, flow `0.42 m3_per_s`, abstraction `1240 m3`, rainfall `18.5 mm`. Other existing synthetic records may increase the total; compare before/after counts.

**Important:** `PUBLISHED_DEMO_ONLY` is still a fictional, isolated Core read model. Main dashboard KPIs, authoritative scheme master and official Power BI totals remain unchanged.

## 8. Test officer return, correction and resubmit

Use a **different** new test record, e.g., Operational Status. First submit it, then in Main choose District Officer → **Return for correction** and enter `Recheck functional area on site`. In Collector click **Refresh officer decisions**, select **Correct returned form**, change `functional_area_ha` from `95` to `90`, then **Save offline draft** (creates a new revision), queue and sync. Expected original revision remains **RETURNED**, new revision becomes **AWAITING_FORM_APPROVAL**. Officer can verify the corrected revision.

## 9. Test offline and validation behavior

- Before clicking Sync, disable network via browser DevTools, save and queue another fictional draft. Re-enable network, focus the Collector app; only previously queued events are retried.
- Set Operational Status **functional_area_ha=150** and **equipped_area_ha=120**: local quality issue, queue disallowed.
- Set Water **storage_percent=120**: local quality issue, queue disallowed.
- Set Seasonal Production **harvested_area_ha=75** and **planted_area_ha=70**: local quality issue, queue disallowed.
- Stage an unapproved `baseline` form: intake may occur, but **District VERIFY must refuse** without a separately approved form version.
- Collector should **not** see the officer reporting export, and a different district cannot see this scheme.

## Evidence to capture

Take screenshots of (1) offline saved draft + pending queue, (2) confirmed sync receipt, (3) district review, (4) returned reason and corrected revision, (5) Main published-only dashboard result, (6) failed negative validation. Keep screenshots free of real personal data.

## Limits

This is a working proof of the data path, **not** production NIMIS. No official authentication, approved real questionnaire data dictionary, encrypted Android storage, production PostGIS/Power BI schema, national aggregation, backup/restore validation or signed go-live approval is supplied. A successful demo must not be represented as official Ministry statistics.
