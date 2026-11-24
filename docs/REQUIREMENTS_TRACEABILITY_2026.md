# NIMIS requirements traceability — source-aligned implementation assessment
**Review date:** 24 November 2026  
**Review branch:** `feat/requirements-aligned-main-nimis`  
**Status:** Development increment, not a completed or approved national system.

## Authoritative inputs supplied for this review
1. **NIMIS Concept and GUI Illustrations — Power BI** (18 pages), 13 November 2026. Seven-screen visual board (p.4); modular architecture (p.5), scheme entity model (p.6), workflow (p.7), integrations (p.8), governance (p.9), roadmap and KPI targets (p.10), minimum national registration set (pp.11–12), Power BI addendum (pp.13–18).
2. **Irrigation Schemes Survey Questionnaire — mWater Portal** (11 pages). Scheme demographics (pp.1–2), area, water and beneficiaries (pp.2–3), technology/energy and management (pp.4–5), condition surveys (pp.5–7), water management (pp.8–9), agronomy and markets (p.10), sustainability challenges (p.11).
3. **Senior Management Briefing — Week Ending 13 November 2026**, slide 2 national area and NIMIS objective; slide 4 provincial irrigated-area statistics (as at 30 October 2026) and summer target; slide 5 conceptual dashboard; slide 6 SI 87 spatial schemes. These are historical/source references, not a live feed.
4. **User screenshot: seven NIMIS module views** (24 November 2026). Authoritative visible design baseline: government emerald top bar, pale sidebar, coat-of-arms branding, white KPI cards, compact charts, data tables, maps, light workspace, crisp readable type; avoid decorative emoji.

## Implementation map
| Source requirement | Development implementation | Real-world acceptance remaining |
|---|---|---|
| Seven main GUIs, screenshot layout | Existing Executive, GIS, Water, Infrastructure, Agronomy, Projects and Registry modules; `src/requirements-theme.css` new visual fidelity layer | Compare real browser screenshots on desktop/mobile to supplied seven-view reference |
| One scheme, one master, many linked streams | Local scheme master exists; proposal `database/proposed/001_nimis_core_REVIEW_ONLY.sql` adds canonical scheme + facts | Approve data dictionary and constraints, deploy to reviewed database with migrations and row-level security |
| All 24 minimum scheme-registration items | `src/SchemeAssessment.jsx` expandable national baseline form + validation + local draft export; uses survey concepts | Confirm field names, mandatory conditions and units with Department; implement server validation and secure attachments |
| Geo scheme identity, source, bounds | Current GIS Leaflet layer illustrative; proposal includes PostGIS point and boundary | Authoritative GPS/geometry capture and verification, admin geography table, GIS quality assurance |
| Water and infrastructure source observations | Local module UI; schema proposal for water source, asset, assessment and O&M | Official data collection forms, evidence, inspection frequency, data validation and domain services |
| Season-specific agronomy, area status | Local module UI and proposed `season_area`/`crop_record` tables | Period-based records and verified denominators, prohibit double counting |
| Projects, energy and maintenance | Local module UI and proposed programme/milestone, energy and maintenance tables | Actual project financial/contract milestones and weekly updates |
| Collector → district → province → admin | Fictional-only FastAPI/PostgreSQL demonstration in separate NIMIS Collect and main NIMIS review branches | Ministry-approved named identity, full technical sign-off stage, assignment-based role authorization and persistent official approvals |
| Offline-first mobile field collection | NIMIS Collect IndexedDB drafts/photos, fictional demo upload test | Real secure versioned outbox push/pull, resumable evidence upload, revocation, conflict resolution, load and field trials |
| National stats and BI | Existing local browser dashboard clearly marked prototype; `HistoricalBriefing.jsx` displays sourced Oct 2026 totals separately | Agreed KPI catalogue, curated read-only reporting store, Power BI licence/tenant setup, row-level security, scheduled refresh and reproducible comparisons |
| Auditability & security | Proposed workflow decisions and audit entities; branch-based review; no real login | MFA, individual identities, storage encryption, backup/restore, audit retention, scopes, privacy/legal compliance |
| External feeds | No real ZINWA/ZESA/Meteorology/markets integration connected | Formal agreements, data-sharing APIs, quality controls, licences |
| Pilot | Demo includes examples but not representative verified schemes | Approval, sampling across provinces and technologies, UAT, measured reliability and national roll-out sign-off |

## Indicator standards: definitions to approve, not assumptions
- **Equipped hectares:** area with irrigation equipment, regardless of operational condition.
- **Functional hectares:** equipped area capable of delivering intended service as at verified assessment; never equate with equipped or irrigated automatically.
- **Actually irrigated hectares:** verified area receiving irrigation in a defined reporting period/season, not a timeless scheme property.
- **Functionality rate:** `100 × functional_ha / equipped_ha` only when the denominator is positive, both measurements are verified and the reporting periods align.
- **Cropping intensity:** seasonal cumulative cropped area / net irrigable command area × 100, subject to approved national agronomic definitions.
- **Project progress:** verified weighted physical milestones, *not* paid amount divided by budget.
- **Historical briefing data (30 October 2026):** 308,969 ha irrigated and 119,068 ha summer cropping target, per slide 4 of the 13 November 2026 briefing. The concept's example dashboard (including various larger totals/targets) is **illustrative** and must never be silently presented as verified records.

## Official workflow — design target
1. Data Collector / approved scheme source captures form, photographs and GPS offline.
2. Device enrolment and authenticated `/sync/push` with per-event idempotency; District Officer receives assigned submissions.
3. District Officer verifies original evidence, mandatory fields and location, or returns with actionable reasons.
4. Provincial Officer reviews district reports by authorised scope, or returns corrections.
5. National technical approver validates delegated specialist information without bypassing higher-level sign-off.
6. Admin publishes **approved version only** and preserves original evidence plus a permanent audit trail.
7. Curated reporting layer and Power BI read only approved, time-versioned facts.

## Concrete issues identified in current main repository
- Main NIMIS is still a **React/Vite frontend prototype**, not a production PostgreSQL-backed national system.
- Local prototype data in `localStorage` is device/browser-specific and unsafe as an authoritative master.
- Existing five scheme rows and GIS points are illustrative. They require source review before promotion.
- Existing operational module forms are general-purpose and do not yet capture complete discipline-specific details.
- Screenshot-driven styling needed a consistent theme override; available CI checks do not prove pixel-by-pixel fidelity.
- Power BI described in the addendum is not a live configured integration, and no Ministry licence/tenant is connected.
- The concept calls for a national technical approval stage, but the chosen four application roles do not automatically grant technical approval. A formal delegated permission under Admin is proposed, subject to business-owner approval.

## Governance and handover gates
- Department ICT and relevant business units approve data definitions, code lists, functional requirements and authority rules.
- Development & staging run against synthetic/reviewed test datasets only.
- Conduct stakeholder UAT for District, Province, National and Collector use cases; including offline interruptions.
- Run schema migrations only after review, tested backups and restoration.
- Review access control, privacy and legal obligations; deployment, Power BI licences and data-hosting contracts.
- **Do not merge PR #3, enable production sync or deploy without user and Department approval.**

## Scope of this increment
Code in this PR creates/edits a **UI prototype and reviewed database design**. It does not claim to have completed the full NIMIS national implementation roadmap. Actual production completion involves institutional governance, verified national data migration and extensive backend/security work.
