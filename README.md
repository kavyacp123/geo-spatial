# GeoSpatial Site Readiness Analyzer

An explainable, map-first site-selection tool for evaluating candidate locations across Gujarat: five PostGIS layers, a versioned 0–100 score with factor breakdown, real H3 + DBSCAN overlays, OSRM drive-time catchments, and one-page reports.

## Run it (one command)

Prereqs: Node ≥ 20, Docker Desktop running.

```powershell
docker compose up --build        # db → analysis → api → web
```

- Web: http://localhost:5173 · API: http://localhost:3000 · Analysis: http://localhost:8000
- Seeds (`infra/postgres/init/`) load Gujarat + 11 score configs + six layers automatically on a fresh volume. Re-seed: `docker compose down -v` then up again (demo data only — safe to wipe).
- Without Docker: `npm run dev:web` + `npm run dev:api` still work; the map falls back to labeled synthetic demo layers (`OFFLINE` pills, `SYNTH DEMO` legend).

## Verify it

```powershell
curl http://localhost:8000/health
curl "http://localhost:3000/api/v1/layers"
npm run typecheck --workspace @geoready/web
npm run lint --workspace @geoready/web
npm run test --workspace @geoready/web
npm run test --workspace @geoready/api
$env:PYTHONPATH="."; pytest -q          # in services/analysis (no DB needed)
$env:DATABASE_URL="postgresql://geoready:geoready@localhost:5432/geoready"; $env:PYTHONPATH="."; pytest -q  # against compose DB
python scripts/fetch_osm.py --out data/osm   # real OSM extracts (ODbL)
python scripts/fetch_worldpop.py              # WorldPop raster instructions (CC-BY-4.0)
```

## Project guides

- [System design](docs/architecture/system-design.md)
- [Data and API contracts](docs/architecture/data-contracts.md)
- [Technology decisions](docs/architecture/ADR-001-hybrid-typescript-python.md) · [ADR-002 Gujarat layers](docs/architecture/ADR-002-gujarat-layers-rasterio.md) · [ADR-003 OSRM catchments](docs/architecture/ADR-003-osrm-catchments.md)
- [Hackathon MVP plan](docs/product/mvp-plan.md)
- [Contributor and AI-agent instructions](AGENTS.md)

Before changing the repository, read `AGENTS.md`. Every AI-driven repository change must be recorded under `docs/ai-change-log/`.
