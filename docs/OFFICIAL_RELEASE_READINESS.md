# NIMIS — official deployment readiness gate

**Status 24 November 2026: NOT APPROVED FOR LIVE MINISTRY DATA.**
This repository's current core is an isolated, loopback-only PostgreSQL development service. The attached collector is a React/PWA prototype, not yet the approved Android-first secure mobile application. No deployed production installation or national official records are modified by this branch.

## Technical features available for controlled review

- Permanent scheme UUIDs, district-assigned collector access and four-role geography filtering in local development.
- Proposed eleven collector datasets; immutable field revisions, GPS/data checks and per-event duplicate acknowledgements.
- Offline queue in Collector, idempotent staged sync, private evidence transfer with SHA-256 validation (bounded to 512 KiB per image in the local pilot), and per-scheme officer read access.
- OIDC RS256 identity verification, issuer/audience validation, and server-owned mapping from verified external subject to an active actor record. When OIDC mode is on, synthetic actor headers are ignored.
- Explicit stage form approval table and separate delegated national technical permission, append-only officer decision and audit records. Published records do **not** update the authoritative scheme master or national analytics automatically.

## Hard release blockers and their responsible owners

| Gate | Must be demonstrated | Owner |
| --- | --- | --- |
| Identity | Approved institutional OIDC provider, registered public mobile/web clients, permitted redirect URLs, issuer, audience, JWKS, individual officer accounts, MFA policy and tested offboarding | Ministry ICT |
| Official schema | Approved form 1–11 data dictionary, unique IDs, conditional questions, repeating assets/plots, units/ranges, province/district/ward codes, retention/classification and privacy rules | Irrigation Department technical owners |
| Authoritative registry | One production PostgreSQL/PostGIS scheme registry; verified duplicate cleansing, GPS/boundary provenance, immutable history and reviewed migrations/rollback | ICT + GIS teams |
| Secure storage | Encrypted Android offline store and media, secure platform keystore, tamper-resistant device enrolment, revocation, key rotation and lost-phone response | Mobile development + ICT |
| Server | Separate production ASGI deployment with real TLS, allowed origins and rate limits, narrow SQL grants, audit and backups; no loopback-stage flags or synthetic accounts | Ministry ICT |
| Evidence | Private durable object storage, AV/content validation, resumable upload and checksum, authorized downloads, backup/retention and photo-to-submission linkage | ICT/security |
| Review/publication | DIDO → PIDO → specifically delegated national technical approval → administrator; approved forms, evidence, correction chains and verified source before typed reporting mappings | Department managers |
| GIS/BI | Defined published-only reporting materializations, seasons/units and province filters; reconcile sampled forms against dashboard/map totals and Power BI | GIS + BI + technical owners |
| Performance | Two-device offline retry test, concurrent duplicate and conflict tests, throughput/load/backup/restore, UAT and responsive mobile field testing | ICT + pilot officers |
| Governance | Documented authority to host/process data, privacy and security reviews, restoration drill, ownership/handover and written go-live approval | Ministry-designated officials |

## OIDC configuration for a **local test**, not a public release

Server (local variables supplied by ICT, not checked into Git):
- `NIMIS_STAGE_ENABLE=1`
- `NIMIS_STAGE_OIDC_ENABLED=1`
- `NIMIS_STAGE_DEV_AUTH=0`
- `NIMIS_OIDC_ISSUER=https://<approved-idp-issuer>`
- `NIMIS_OIDC_AUDIENCE=<registered-nimis-api-audience>`
- `NIMIS_OIDC_JWKS_URL=https://<approved-idp-jwks>`

The server requires `nimis_stage.actor.oidc_subject` to be uniquely provisioned and mapped to an active local test actor with one of **admin, provincial_officer, district_officer, data_collector**. The subject must be an exact trusted provider subject; never map roles from client JWT claims. Database administrators alone provision `nimis_stage.approved_field_form` and `nimis_stage.actor_permission`. No approved form rows are seeded.

Collector built with `VITE_NIMIS_AUTH_MODE=oidc`, `VITE_NIMIS_OIDC_ISSUER`, `VITE_NIMIS_OIDC_CLIENT_ID`, and `VITE_NIMIS_OIDC_REDIRECT_URI` uses authorization code + PKCE. The identity provider MUST allow token exchange from the public client origin and the exact callback URL. The Core stage remains loopback-only and hardcodes the local `nimis_core_dev` database: these settings are for proof-of-integration, not remote public operation.

## Validation sequence before promoting a new platform

1. Branch PR review, dependency audit, tests and reproducible build artifact hashes.
2. Authority-approved identity provider test with four distinct officers, terminated accounts, spoofed role, bad JWT/JWKS, expired token and lost device.
3. Formal sign-off of all form versions, units, validation and publication mapping; do not change `reporting_mapping_approved` merely to make a UI button work.
4. End-to-end synthetic pilot: assigned schemes → offline GPS/photos/forms → checksum uploads → synced receipts → DIDO/PIDO/delegated approval → typed published statistics → district and national report reconciliation.
5. Staging penetration testing, spatial privacy isolation, secure backup/restore, mobile offline stress/load and Department UAT.
6. Only then an explicitly authorized, logged production migration and deployment, with rollback and change-freeze plan.

**Do not set `NIMIS_STAGE_*` to turn the pilot into production.** The stage database and frontend contain synthetic workflows and are not a substitute for institutional release approval.
