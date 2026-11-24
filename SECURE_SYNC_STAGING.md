# Main NIMIS ↔ Collector secure sync staging contract

This review branch follows `feat/technical-approval-gate-v1` and adds a separate `src/secureDistrictClient.js` adapter. It does not replace the currently functional **fictional-only** district/provincial/admin demonstration.

## Read-only district integration seam

`loadAuthorizedDistrictSubmissions(accessToken)` calls `GET /api/v1/secure/district/inbox`, requiring an individual verified OIDC token and database-backed scheme assignments. There is no browser-side login fallback or localStorage token cache. The staging response includes only submission metadata (event ID, record ID, canonical scheme ID, form version, captured and received timestamps).

The endpoint is implemented by the **NIMIS-Data-Collection** repo's `server/secure_sync.py` on the matching feature branch, behind `NIMIS_SECURE_SYNC_ENABLED=1`. An ICT-approved service, TLS origin, identity provider and canonical scope view are mandatory. Do not enable on public servers yet.

## Deliberately NOT connected

- No user interface calls this adapter until the approved officer identity flow exists.
- The existing `DistrictInbox.jsx` still uses fictional local credentials.
- It cannot approve, publish or modify official records.
- No unsecured browser draft or pending photo is sent.
- The live scheme registry and dashboards remain untouched.

## Next security gates

1. Approve central identity and officer-role mapping, including per-scheme assignments.
2. Implement authenticated main web app sessions and a same-origin BFF/secure HTTPS proxy.
3. Add officially approved decision endpoints and server-side workflow transactions.
4. Validate RLS/DB grants, audit trail, per-field access, logout, token expiration and scoped loads.
5. Perform integrated tests against a disposable approved staging master schema, then review with Department ICT.

The team must not merge or deploy solely because CI builds the adapters.
