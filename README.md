# NIMIS — National Irrigation Management Information System

**Frontend prototype — build 0.1.0**

This repo starts the NIMIS interface from an empty project. The first milestone includes a responsive application shell, Executive Dashboard and navigation for all seven concept modules.

## Included now
- Executive Dashboard with clearly labelled illustrative KPIs
- Interactive Zimbabwe map powered by Leaflet and OpenStreetMap tiles; sample scheme markers are illustrative until verified coordinates are loaded
- Province coverage bars
- Sample scheme activity table
- Module workspaces for GIS, water, infrastructure/O&M, agronomy, project implementation, scheme registry and reports
- Responsive sidebar/mobile navigation
- No backend/API/database/authentication/live data integration yet

## Tech
React 18, Vite 6, JavaScript, Lucide React icons, Leaflet and OpenStreetMap tiles for the prototype map.

## Run locally (Windows PowerShell)
Install Node.js LTS first, then from this folder:

```powershell
npm install
npm run dev
```
Open the localhost URL shown in terminal (usually http://localhost:5173).

Production build check:
```powershell
npm run build
```

## Publish to the empty GitHub repository
From the project folder, run:
```powershell
git init
git add .
git commit -m "Build NIMIS frontend foundation"
git branch -M main
git remote add origin https://github.com/CipherBloom07/NIMIS.git
git push -u origin main
```
If Git already exists in this folder, do not repeat `git init` or `git remote add`; check `git remote -v` first.

## Data disclaimer
All dashboard numbers and scheme records are sample/illustrative data. They are not verified Ministry figures. The map uses real OpenStreetMap geography, but the five scheme markers currently use illustrative approximate coordinates and must be replaced with official surveyed GIS coordinates before operational use. This project is not connected to a backend, national database, official GIS data service, sensors, or Power BI. OpenStreetMap tiles require an internet connection.

## Architecture decisions
The UI is intentionally decoupled from server services. Before backend implementation, validate system requirements, permissions, entity relationships, hosting, GIS platform, security, licensing and integration constraints with authorised stakeholders.


## Data capture and synchronization
- NIMIS supports gradual scheme registration; unknown area and water-source fields can remain blank until collected and verified.
- The Data Management & Verification workspace imports CSV scheme registers, validates rows and places accepted records into a local synchronization outbox.
- Scheme Registry create/edit/delete operations are added to the same outbox.
- The outbox can POST events to a configured HTTPS API endpoint. The receiving service must validate each event and return JSON with an `acceptedEventIds` array; unacknowledged events remain pending.
- **This repository is still a frontend prototype.** Browser-local data does not synchronize between devices or users until an approved backend, shared PostgreSQL database, authentication and server-side authorization are implemented. No external institutional integrations are connected.
- CSV headers: `id,name,province,district,water,status,developed,equipped,irrigated`. The import accepts partial records and checks the developed/equipped/irrigated relationship where values are supplied.
