# GeoReady — Explainable Site-Selection for Gujarat

Pick a site. See **why it wins** — 0–100 score, factor breakdown, constraints, and map evidence. No black box.

`React + MapLibre · Fastify BFF · FastAPI spatial engine · PostGIS` — one command to run, reproducible demo with zero network dependence.

## What it answers

> "Which candidate site is best, why, and what data supports that recommendation?"

Click any pin in Gujarat → immediate score + eligibility + ranked factors → toggle H3 suitability, DBSCAN hotspots, drive-time catchments, and raw layers → adjust weights → compare up to 3 sites → export a one-page report with sources, config version, and caveats.

## Highlights

- **Explainable 0–100 score** — deterministic weighted model, versioned config, every factor cites raw value, unit, method, and `layer_version_id`. Custom weights return `score_config_version: 2` + `weight_source: "custom"` for traceability.
- **11 site-type profiles** — FMCG retail, convenience, hospital, EV charging, fuel, warehouse, restaurant, pharmacy, bank/ATM, telecom, solar. Each with its own weights and constraints (`apps/api/src/siteTypes.ts`).
- **Map-first UX** — Obsidian / Paper / OSM basemaps, 5 seeded sites (SG Highway, Maninagar, Vesu, Alkapuri, 150ft Ring Rd), click-to-score, draw-a-polygon search area, layer opacity, Weight Studio with Σ=1.000 guard.
- **Real spatial overlays** — server H3 hexes (res 3–7, persisted to `analysis_cell`), sklearn DBSCAN hotspots (haversine), OSRM drive-time rings (10/20/30 min) + reachable population, underserved-gap layer. Everything badged `LIVE` vs `DEMO`/`SYNTH`.
- **Layer ingestion** — GeoJSON / WKT / zipped Shapefile / GeoTIFF upload, validated (kind enum, Gujarat bbox, ≤25 MB), versioned, never destructively replaced.
- **Compare + export** — server-assembled report (cross-run merge, `delta_vs_best`) with JSON / CSV / print-HTML fallback. Offline-capable: labeled synthetic demo layers when Docker is down.
- **Honest provenance** — `candidate_id` + `analysis_run_id` on every score, persisted when PostGIS is up, ephemeral UUIDs otherwise (a score never 500s for provenance).

## Architecture

```text
Browser (React 18 + MapLibre GL 5)
  │ HTTPS / JSON / GeoJSON
  ▼
Node BFF (Fastify + Zod) ─── PostgreSQL 16 + PostGIS 3.4
  │  validation, orchestration,      source / normalized / derived layers,
  │  proxy, exports                  candidates, runs, scores, H3 cells
  │  internal HTTP
  ▼
Python analysis (FastAPI + GeoPandas/Shapely/PyProj + sklearn + h3-py)
  │  factors, H3/DBSCAN, OSRM adapter, reports
  └── OSRM public table API → geodesic fallback (always labeled routed/provider)
```

See [system design](docs/architecture/system-design.md), [data contracts](docs/architecture/data-contracts.md), [ADRs](docs/architecture/ADR-001-hybrid-typescript-python.md).

## Scoring model

`score = clamp(Σ 100 · wᵢ · nᵢ, 0, 100)`, weights Σ 1.0 ± 0.0001. Missing values are disclosed, never silently zeroed.

| Factor | Metric | Normalization |
| --- | --- | --- |
| Demand | population within 20-min catchment | capped min–max |
| Access | nearest road distance + density | `exp(-d/750m)`, cap 5 km |
| Competition | competitor count in catchment | inverse density |
| Land use / parcel / footfall / utility / gap | zoning fit, parcel m², stops+POIs, utility distance, coverage gap | categorical / decay / count |

Constraints are separate from weights: `block` → ineligible, `cap` → max score, `warn` → score kept with warning (e.g. `flood_zone` auto-appended when a pin lands inside a risk polygon). Eligibility: `eligible · warning · capped · ineligible · insufficient_data`.

## Run it

Prereqs: Node ≥ 20, Docker Desktop running.

```powershell
docker compose up --build        # db → analysis → api → web
```

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API | http://localhost:3000 (`/health`, `/api/v1/site-types`) |
| Analysis | http://localhost:8000 (`/health`, `/api/v1/score`) |

Fresh volumes auto-seed Gujarat + 11 score configs + 6 layers (`infra/postgres/init/`). Re-seed: `docker compose down -v` then up again (demo data only — safe to wipe). Without Docker: `npm run dev:web` + `npm run dev:api` still work; the map falls back to labeled synthetic demo layers.

Try: open the web app → pick **FMCG / Retail** → click **Surat — Vesu** → open the factor waterfall → toggle H3 + hotspots → drag a weight in Weight Studio → pin 2 more sites → **Export**.

## API (behind `/api/v1`, Node proxies to analysis)

| Method + path | Purpose |
| --- | --- |
| `POST /scores` | Score a pin (PostGIS factors → location-sensitive demo fallback) |
| `GET /layers`, `GET /layers/{id}/versions/{v}` | Catalog, version manifest + quality report |
| `GET /layers/{id}/features?bbox=&limit=` | Viewport GeoJSON (≤500) |
| `POST /layers`, `POST /layers/upload` | Ingest GeoJSON/WKT, or `.zip` Shapefile / GeoTIFF |
| `POST /candidates`, `GET /candidates` | Persist / list pins (422 outside Gujarat) |
| `POST /hotspots`, `POST /h3` | DBSCAN clusters; H3 cells (res 3–7, ≤2000, optional bbox) |
| `POST /isochrone` | OSRM drive rings + population (`routed` + `provider` always set) |
| `POST /reports`, `GET /analysis-runs/{id}` | Cross-run comparison report; run + scores |

All distances in `_m`, durations in `_min`, CRS `EPSG:4326` on the wire (`EPSG:32643` for metre math internally).

## Verify it

```powershell
curl http://localhost:8000/health
curl http://localhost:3000/api/v1/layers
npm run typecheck --workspace @geoready/web
npm run lint --workspace @geoready/web
npm run test --workspace @geoready/web
npm run test --workspace @geoready/api
$env:PYTHONPATH="."; pytest -q          # in services/analysis (no DB needed)
python scripts/fetch_osm.py --out data/osm   # real OSM extracts (ODbL)
python scripts/fetch_worldpop.py              # WorldPop raster instructions (CC-BY-4.0)
```

## Project layout

```text
apps/web/          React + MapLibre client (demo.ts, livedata.ts, report.ts)
apps/api/          Fastify BFF (siteTypes.ts, zod-validated proxy)
services/analysis/ FastAPI engine (factors.py, cluster.py, routing.py, layers.py, registry.py)
infra/postgres/init/ schema + Gujarat seed (bbox proxy, 11 configs, 6 layers, 5 sites)
scripts/           fetch_osm.py, fetch_worldpop.py (real data with synthetic fallback)
docs/              architecture, product MVP plan, ai-change-log/
pitch/             hackathon deck
```

## Data, licenses, caveats

- Seed layers are **synthetic demo** (`synthetic-demo` license tag) so judging never depends on the network. Real-data scripts cover OSM (ODbL) and WorldPop (CC-BY-4.0) with attribution preserved in `layer_version`.
- `study_area.boundary` is a **bounding-box proxy** (68.2,19.6,74.7,24.9), not the state polygon — replace before statutory use.
- Scores are **decision support only** until validated layers replace synthetic sources. Every export carries this notice plus config/layer provenance.
- Never commit credentials, PII, or restricted datasets (see `AGENTS.md`).

## Docs

- [System design](docs/architecture/system-design.md) · [Data contracts](docs/architecture/data-contracts.md) · [MVP plan](docs/product/mvp-plan.md)
- [ADR-001 hybrid runtime](docs/architecture/ADR-001-hybrid-typescript-python.md) · [ADR-002 Gujarat layers](docs/architecture/ADR-002-gujarat-layers-rasterio.md) · [ADR-003 OSRM catchments](docs/architecture/ADR-003-osrm-catchments.md)
- [Contributing / AI-agent workflow](AGENTS.md) — every AI-driven change is logged under `docs/ai-change-log/`.
