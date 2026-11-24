# NIMIS gaps that can be implemented without external Ministry prerequisites

## Implemented and tested in paired review branches

- [x] Authoritative scheme UUID and district-assigned collector validation in isolated Core
- [x] Offline draft revision queue with stable idempotency keys
- [x] Separate checksum-verified photo transfer and restricted review access
- [x] District and provincial return decisions and collector-visible reasons
- [x] **Correction reconciliation:** only a returned/conflicted submission may be revised under the same record identity. Different schemes/forms/collectors and in-review or published overwrites are rejected.
- [x] Explicit form approval, evidence, technical delegation and reporting mapping gates
- [x] Per-record typed published-only reporting, periods and role-based geographical scope
- [x] Paginated reporting read model; refuses truncated CSV (500+ records)
- [x] Local Core Windows launch PowerShell repaired
- [x] Database regression checks for return -> correction -> retry, scoping, idempotency, reporting and publication

## Institutional requirements still open (cannot invent substitutes)

- [ ] Department-approved forms, controlled codes and complete nested field/validation dictionary
- [ ] Official NIMIS identity issuer, real user enrolment and approved hosting/security design
- [ ] Official scheme registry migration and PostGIS boundary validation
- [ ] Approved national BI metrics including indicator definitions, de-duplication and season semantics
- [ ] Production object store, retention and protected media / secure mobile storage
- [ ] Real device end-to-end UAT, security audit, backups/restore and written launch authorization

## Paired review branches and test scope

Main repo: `feat/collector-correction-reconciliation-v1` (review on top of `feat/published-form-reporting-v1`); Collector: `feat/collector-correction-ux-v1` (review on top of Collector `main`). These are **development only**, not official field deployments. Their role of `PUBLISHED` means *approved fictional stage sample*, not an official NIMIS statistical record.

## How to test the correction loop

1. Use a fictional assigned scheme and collector; capture and queue a form.
2. Sync the form to isolated Core; District returns it with a reason.
3. Collector **Refresh officer decisions**, opens **Correct returned form** and saves a new revision.
4. Sync new revision; verify previous immutable record is still `RETURNED`, new revision is `AWAITING_FORM_APPROVAL`, duplicate replay is accepted, and in-review overwrite is blocked.
5. If Ministry technical/form approval is not provisioned, stop before approval/publishing. It is intentionally not bypassed to make a test green.
6. On published reporting view, use page navigation and confirm CSV reports an explicit error when a bounded export cannot include all results.

No official database, network deployment or real Ministry data is affected.
