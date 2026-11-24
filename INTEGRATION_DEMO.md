# Main NIMIS ↔ NIMIS Collect: Collector-District review integration

**Status: developer demonstration only — no production backend, no real farmers or official records.**

The main NIMIS application is currently a React/Vite browser prototype. It does not yet have production access-control roles or a PostgreSQL master registry. This feature branch adds the **District Collector Inbox (Test)** page as a separately testable integration seam.

## Demonstration

NIMIS Collect runs on `http://127.0.0.1:5173`; its FastAPI fictional integration API runs on `http://127.0.0.1:8765`; this main NIMIS frontend should run on `http://127.0.0.1:8081`.

```powershell
# In main NIMIS development clone:
npm install
npm run dev -- --port 8081 --strictPort
```

- In NIMIS Collect, choose **Collector–District test** and send a fictional scheme observation.
- In the main NIMIS app, choose **District Collector Inbox (Test)** → **Connect fictional district inbox**.
- Verify or return the synthetic row; returning requires a reason.
- Refresh to inspect server-persisted status.

The new page and demo credentials are **development-only**. The existing Scheme Registry, Data Management browser sync queue, executive dashboard and sample metrics are unchanged. The fictional review does **not** publish or verify actual Ministry records.

## Important limitations

This demonstration does not implement a real officer login, encrypted devices, district/zone permissions, real offline survey outbox transfer, GPS/photograph upload, approval governance, or shared national PostgreSQL migrations. It is a first integration proof that the two codebases can exchange scoped test submissions via an API, with PostgreSQL as the data store.

The real system must use official NIMIS scheme IDs, approved backend credentials, auditable decisions, photo object storage and server-controlled workflows before accepting any real data.

Detailed backend instructions: `CipherBloom07/NIMIS-Data-Collection/docs/CROSS_REPO_INTEGRATION.md`.

**This branch is intended for a reviewable draft PR; do not merge into main or deploy it without explicit authorization.**
