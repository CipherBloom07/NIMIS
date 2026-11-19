# NIMIS — National Irrigation Management Information System

**Frontend prototype — build 0.1.0**

This repo starts the NIMIS interface from an empty project. The first milestone includes a responsive application shell, Executive Dashboard and navigation for all seven concept modules.

## Included now
- Executive Dashboard with clearly labelled illustrative KPIs
- Scheme distribution visual (stylised illustrative map, not GIS data)
- Province coverage bars
- Sample scheme activity table
- Module workspaces for GIS, water, infrastructure/O&M, agronomy, project implementation, scheme registry and reports
- Responsive sidebar/mobile navigation
- No backend/API/database/authentication/live data integration yet

## Tech
React 18, Vite 6, JavaScript, Lucide React icons. Leaflet dependency is reserved for a real map integration in a later milestone.

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
All dashboard numbers and scheme records are sample/illustrative data. They are not verified Ministry figures. The stylised map does not represent actual scheme coordinates. This project is not connected to the prototype website, a backend, database, GIS services, sensors, or Power BI.

## Architecture decisions
The UI is intentionally decoupled from server services. Before backend implementation, validate system requirements, permissions, entity relationships, hosting, GIS platform, security, licensing and integration constraints with authorised stakeholders.
