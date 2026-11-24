# NIMIS UI deployment-review gate (November 2026)

This branch fixes the squashed, unreadably small Ministry UI shown in the submitted screenshot. It is a **reviewable UI candidate**, not an approved national production deployment.

## UI scope
- Replaces the previous `reference-fidelity.css` import (which forced 7–9px text and excessive compactness) with `readable-ui.css`.
- Keeps the dark-green government header, national coat of arms, official branding, existing modules and seven-screen information architecture.
- Uses 13–15px navigation and content text, accessible focus indicators, comfortable tables/buttons and a responsive sidebar that becomes a mobile drawer.
- Dashboard data remains browser-local and clearly labelled prototype data; sample layout records are explicitly fictional and never written to the registry.

## Required checks before any rollout
1. Run `npm test` and `npm run build`.
2. Open the review branch on a separate local port and compare the Reports & Analytics page, Executive Dashboard, Scheme Registry, GIS, assessment and review screens at 1920×1080, 1366×768, 1024×768 and 390×844.
3. Verify keyboard navigation, text sizing, scrolling, search, CSV exports, and browser zoom at 125–200%.
4. Validate network-limited rural device behaviour.
5. Security gate: replace the current browser-local scheme master and mutable verification button with approved server-side authorization and audit before accepting real records.
6. Integrate the real identity provider, scoped roles, central PostgreSQL/PostGIS migrations, versioned offline sync, evidence storage, server-controlled approvals and verified reporting.
7. Obtain business owner/ICT signoff and carry out concurrent multi-user load testing and backup/restore.

**Do not merge or deploy this development branch without explicit approval.** UI build success does not establish production readiness.

## Local preview
```powershell
cd "C:\Users\2025\Desktop"
git clone --depth 1 --single-branch --branch feat/ui-readability-deployment-review https://github.com/CipherBloom07/NIMIS.git NIMIS-Readable-Preview
cd ".\NIMIS-Readable-Preview"
npm ci
npm test
npm run build
npm run dev -- --host 127.0.0.1 --port 8110 --strictPort
```
Open `http://127.0.0.1:8110/`. The isolated port avoids previous Vite servers and browser-local records in other origins. A prior service worker on this origin may need unregistering, but dev mode does not register a new worker.
