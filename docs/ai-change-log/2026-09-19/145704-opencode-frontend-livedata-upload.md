# AI Change Record — Frontend ↔ PostGIS: live layers, server H3/DBSCAN/isochrones/reports, upload UI

- **UTC timestamp:** `2026-09-19T14:57:04Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `Take as much time as you want, make perfect changes…` (frontend workstream: connect the map to the real backend instead of demo-only data)
- **Intent:** Make the backend visible — every server capability (layers, H3, hotspots, isochrones, reports, upload) reachable from the UI with demo.ts fallback so the app works fully offline too.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `apps/web/src/livedata.ts` | Created | Server-first fetch helpers, all failures → `null`: catalog, features (stamps lens `relevance` on points), hotspots→weighted points, H3 GeoJSON, isochrone (45 s abort), server reports, `uploadLayer` (multipart file or GeoJSON/WKT JSON), `downloadJSON`. Zero new deps. |
| `apps/web/src/main.tsx` | Modified | Live catalog+features on mount (`liveOk` drives `LEGEND · LIVE POSTGIS` vs `SYNTH DEMO`); per-product server H3/hotspots with demo fallback; POI relevance re-stamped for live features; H3/hotspot/POI/raw sources refresh on product/map-ready/basemap; server isochrones per pin (populations in catchment rows, `ROUTED OSRM` vs `DEMO` + routing state) with geodesic fallback; `exportCompare` tries `POST /reports` first (falls back to client payload with polygon/rings); Layers panel gains upload form (kind/name/file-or-text → ingest → catalog refresh); per-layer badges flip `SYNTH/DEMO` → `LIVE`. `ScoreResponse.persisted?` added. |
| `apps/web/src/demo.test.ts`, `livedata.test.ts` | Created | 12 vitest tests: circle radius sanity, relevance table/bounds, determinism + per-product regroup + non-empty clusters, mocked fetchCatalog/Hotspots/Isochrone/Report success + offline-null paths. Also fixes the pre-existing `vitest run` failure (no test files). |
| `scripts/fetch_osm.py`, `scripts/fetch_worldpop.py` | Created | Real-data paths: Overpass city extracts (stdlib only, polite bboxes, optional direct upload, ODbL noted); WorldPop clip+upload with guarded rasterio import, exits 2 with instructions when no input (never writes fake data). Both byte-compile; worldpop no-arg behavior verified. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck/lint --workspace @geoready/web` | Passed | Fixed `no-explicit-any` via unknown + inference |
| `npm run build --workspace @geoready/web` | Passed | ~5 s, pre-existing chunk warning only |
| `npm run test --workspace @geoready/web` | Passed | 12 passed (2 files) |
| Live compose | Passed | Backend verified; UI wiring typechecked + unit-tested (no browser here) |
| Browser smoke | Not run | Needs `dev:web`: LIVE badge on, switch product (halos regroup from server), toggle rings (populations appear), upload a GeoJSON (LIVE badge + status), kill stack (falls back to DEMO, no blank map) |

## Assumptions, limitations, and follow-up

- Server H3 uses default profile weights (fetched per product, not per slider tick — 1.7 s × slider spam avoided); legend implies default-weight suitability.
- Server isochrone latency ~1–9 s first pin (cached after); `isoRouting` state covers the wait; 45 s abort keeps UI responsive.
- Upload probe layer created during live verification was deleted; demo dataset back to exactly 6 layers.
