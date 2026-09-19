# AI Change Record — Backend: 5 Gujarat layers + PostGIS scoring + ingestion APIs

- **UTC timestamp:** `2026-09-19T12:52:58Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `GO through everything in this context now we have to make a backend with all the 5 data layers mentioned in the problem statement` + `I want it done for the whole of gujarat please. zthe 1st one WorldPop. yea include via rasterio. yea go with recommended.`
- **Intent:** Deliver PS-2 §3.1 (≥5 layers) + §3.2 (0–100 explainable score with provenance) across whole Gujarat, wiring PostGIS as source of truth and replacing the placeholder `.65` math with metre-correct spatial queries, while adding validated ingestion for GeoJSON/WKT/Shapefile/GeoTIFF.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `docs/architecture/ADR-002-gujarat-layers-rasterio.md` | Created | Locks Gujarat state boundary (EPSG:4326, analysis 32643), layer source mix (WorldPop 100m via rasterio + OSM + synthetic labeled), and GeoTIFF/Shapefile pipeline decision with fallback. |
| `services/analysis/requirements.txt` | Modified | Added `psycopg[binary]==3.2.6, sqlalchemy==2.0.41, python-multipart==0.0.9, rasterio==1.4.3, fiona==1.10.1` for DB + GeoTIFF/Shapefile. |
| `services/analysis/Dockerfile` | Modified | `apt` GDAL (`gdal-bin libgdal-dev g++`) before pip for rasterio/fiona — keeps judging reproducible. |
| `docker-compose.yml` | Modified | `analysis` now has `DATABASE_URL` + `depends_on: db healthy`; compose config validated. |
| `services/analysis/app/db.py` | Created | `DATABASE_URL`, `get_conn()` (psycopg dict_row), `is_db_available()`, constants `GUJARAT_STUDY_AREA_ID=aaaaaaaa…` and `ANALYSIS_SRID=32643` (UTM 43N per GEOSPATIAL_STANDARDS). Graceful fallback when DB absent so `pytest` still passes. |
| `services/analysis/app/factors.py` | Created | 9 factor functions (`demand, access, competition, footfall, zoning, parcel, risk, utility, gap`) all in **metres via 32643**: `ST_Distance/ST_DWithin/ST_Within` on projected geom, distance-decay `exp(-d/750)`, road density bonus, competitor inverse, parcel area, flood intersect cap/warn, utility nearest, plus `FACTOR_FUNCS` map. Each returns `{raw, norm, unit, lv, method}` with layer_version provenance; fallbacks when layer empty. |
| `services/analysis/app/layers.py` | Created | `POST /api/v1/layers` (JSON GeoJSON/WKT, kind validation, shapely `make_valid`, Gujarat bbox 68–75×19–25, immutable `layer_version` + `spatial_feature` inserts), `GET /api/v1/layers`, `GET /{id}/versions/{v}`, `GET /{id}/features?bbox=&limit=` (viewport), `POST /api/v1/layers/upload` (multipart: `.tif` via **rasterio** extent polygon, `.zip` via **fiona** extract; both optional-deps, `501` soft-fail with clear message, `422` on parse, `413` on >25MB). All writes use `GUJARAT_STUDY_AREA_ID`. |
| `services/analysis/app/main.py` | Modified | Import `db.is_db_available`, `factors`, `layers.router`; `include_router(layers_router)`; `/health` now reports `db`; `POST /api/v1/score` now attempts **DB-backed factors** when `factor_values` not forced and DB available, else fallback to `provided_metric/demo_placeholder .65`; per-factor `raw_value/unit/normalized_value/weight/contribution/quality/method/layer_version_id` kept in response; notice switches to `PostGIS factor queries (EPSG:32643 metres) — Gujarat whole-state layers` when live, fallback warning otherwise; block/cap/warn + custom weights unchanged. |
| `infra/postgres/init/003-gujarat-features.sql` | Created | Whole-Gujarat deterministic synthetic features for all 5+1 layers (≈50 features, `synthetic-demo`/`modeled` labels, idempotent): 12 demographics polygons with `population 110k–420k`, 10 transport (4 NH corridors + 6 transit points), 24 POI (14 competitor + 10 complementary `category`), 7 land-use (commercial/mixed/industrial/restricted with `parcel_area_m2`), 5 risk (2 flood modeled polygons + 3 CPCB AQI points), 5 utilities (substations). Complements `002-demo-gujarat.sql` empty shells so `ST_DWithin` queries return data immediately. Utilities layer added if missing. |
| `apps/api/src/server.ts` | Modified | Added layer/catalog proxy (`GET /api/v1/layers`, `GET /:id/versions/:v`, `GET /:id/features`, `POST /api/v1/layers`, `POST /upload → 501` direct-to-analysis guidance) forwarding JSON to analysis at `ANALYSIS_URL`. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `pytest` (`services/analysis`, `PYTHONPATH=.`, psycopg+shapely installed) | Passed | 6 passed in ~38s — `is_db_available()` false (DB not running in test), fallback .65 path keeps tests green |
| `npm run typecheck --workspace @geoready/api` | Passed | No type errors with new proxy |
| `npm run test --workspace @geoready/api` | Passed | 4 passed |
| `npm run typecheck --workspace @geoready/web` | Passed | Frontend contract unchanged (extra `method/layer_version_id` ignored) |
| `npm run build --workspace @geoready/web` | Passed | 94.5 kB CSS / 1.25 MB JS, pre-existing chunk warning |
| `docker compose config` | Passed | Validated; `analysis` depends_on `db` healthy, `DATABASE_URL` set |
| Browser smoke | Not run | Needs `docker compose up --build` (DB + analysis + api) then `POST /api/v1/score` returns PostGIS provenance instead of `demo_placeholder` |

## Assumptions, limitations, and follow-up

- WorldPop raster fetch is documented (ADR-002) and `rasterio` is wired, but the live 100m clip is not vendored in this commit — demographics are synthetic calibrated polygons (same schema/bin) so factor queries work offline; replace via `POST /api/v1/layers/upload` (GeoTIFF) + rasterio zonal stats per tehsil when the raster is available.
- OSM transport/land-use/poi are synthetic mirrors of OSM extracts (same `highway/landuse/category` keys) for judging without PBF fetch; swap by uploading a clipped Geofabrik Gujarat extract via `POST /api/v1/layers` (GeoJSON) or zipped Shapefile.
- Scoring still returns `health.db=false` when DB unreachable — frontend shows `DEMO` badge; with DB (`docker compose`) it returns real `PostGIS Layer` quality and `layer_version_id`.
- Next: replace `apps/web/src/demo.ts` degree-grid H3 with DB-driven Mapbox vector tiles from `GET /features?bbox=`; H3 `h3-py` + `sklearn` DBSCAN to `analysis_cell`.
