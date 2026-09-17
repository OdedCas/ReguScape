# ReguScape - Development Guidelines

## Overview

Next.js web app for searching planning/zoning information on properties in Israel. Uses GovMap's internal APIs for geocoding, parcel lookup, planning layers, and taba plans.

## Commands

```bash
pnpm dev          # Dev server on http://localhost:3000
pnpm build        # Production build
pnpm lint         # ESLint
pnpm test         # Jest tests
```

## Architecture

```
src/
  app/
    page.tsx              # Main search orchestrator (client component)
    api/
      search/             # Address/gush-helka geocoding
      planning-info/      # 6 planning layers + taba plans (WFS pipeline)
      taba-info/          # Taba plans via scraper + tabanow
      building-regulations/  # Max floors, buildable area
      land-plot-identifiers/ # Address <-> parcel resolution
      parcel-info/        # MAVAT registration & usage codes
  services/
    govmap.ts             # Search orchestration (uses autocomplete API)
    govmap-api.ts         # Direct GovMap REST client (WFS, entitiesByPoint, taba)
    govmap-parcel.ts      # Coordinate -> parcel via WFS point query
    scraper.ts            # Parse.bot scraper (broken as of Feb 2026)
    tabanow.ts            # Tabanow plan enrichment
  components/
    SearchForm.tsx         # Address or gush/helka input
    ResultsDisplay.tsx     # All result cards (location, plans, regulations, planning layers)
  types/
    index.ts              # All TypeScript interfaces
```

## Data Flow

1. User searches address or gush/helka
2. `page.tsx` calls `/api/search` -> `govmap.ts` -> autocomplete API (EPSG:3857)
3. Resolves gush/helka via WFS point query if needed
4. Parallel enrichment: taba-info, building-regulations, parcel-info, **planning-info**
5. Each enrichment uses `.catch(() => null)` — failures don't block other data
6. `ResultsDisplay` renders all available cards

## Key APIs (GovMap)

| Endpoint | Purpose |
|----------|---------|
| `/api/search-service/autocomplete` | Geocoding (accurate EPSG:3857 coords) |
| `/api/geoserver/wfs` | Exact parcel + coordinate->parcel lookup |
| `/api/layers-catalog/entitiesByPoint` | Planning layer data at a point |
| `/api/taba/taba/radius` | Taba plans via geoJson point |

**All GovMap APIs require full browser headers** (User-Agent, Origin, Referer, Content-Type).

## Conventions

| Rule | Details |
|------|---------|
| No mock data | Display "אין מידע" when no data available |
| No `any` | Full TypeScript typing, interfaces in `src/types/` |
| Logging | Every API call must be logged with `console.log` |
| Coordinates | EPSG:3857 (Web Mercator) for GovMap APIs |
| Error handling | Each enrichment `.catch(() => null)`, never block entire flow |
| Styling | Scoped `<style jsx>` in components, CSS variables from `globals.css` |
| RTL | Hebrew UI, right-to-left layout |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOVMAP_TOKEN` | No | GovMap auth token (most APIs work without) |
| `LOG_LEVEL` | No | debug, info, warn, error |
