# AI Change Record — Backend 100%: persistence, server H3+DBSCAN, OSRM routing, reports, flood constraints

- **UTC timestamp:** `2026-09-19T14:43:37Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `Take as much time as you want, make perfect changes in order to make this project 100% ready` (backend workstream: all PS §3.x gaps behind the UI)
- **Intent:** Close every verified backend gap: nothing persisted, unused h3/sklearn deps, geodesic-only catchments, client-only reports, silent risk zeros, and a BFF proxy bug — all proven live via `docker compose`.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `services/analysis/app/cluster.py` | Created | `POI_LENS` mirror + `poi_relevance()`; `cluster_hotspots()` (sklearn DBSCAN haversine, deterministic, noise→singletons, top 24); `h3_cell_scores()` (real h3 polyfill res 3–7/cap 2000, shapely aggregates in EPSG:32643 metres, demand/access/competition blend with profile weights, `high/mid/low` at 68/34). h3 4.1↔4.5 compat via `LatLngPoly`-when-available. |
| `services/analysis/app/routing.py` | Created | OSRM `/table` drive rings (12 bearings × 7 radii = 1 call, per-bearing crossing interpolation), in-memory origin cache, geodesic fallback labeled `geodesic-fallback`/`routed:false`; `reachable_population()` via area-weighted demographics intersection (strict containment wrongly summed 0 — fixed). `OSRM_URL`/`OSRM_TIMEOUT_S` envs, urllib only. |
| `services/analysis/app/registry.py` | Created | `persist_score()` (score_config upsert incl. v2 custom, boundary-checked candidate insert/reuse, run + site_score; never raises — ephemeral UUIDs on failure); `POST/GET /candidates`; `GET /analysis-runs/{id}`; `POST /reports` (cross-run merge with deltas + caveats). |
| `services/analysis/app/main.py` | Modified | `candidate_id`/`candidate_name` request fields; `_resolve_weights()` shared by score + H3; score persists when DB up (`persisted` flag); **auto `flood_zone` warn** when risk factor is blocked (constraints discovered, not only echoed); new `POST /hotspots|/h3|/isochrone` endpoints (503 no DB, 501 missing lib, 422 bad res/minutes). |
| `services/analysis/requirements.txt` | Modified | Dropped unused `sqlalchemy` (nothing imports it; broken on the local 3.13 env). |
| `services/analysis/tests/test_cluster.py` | Created | Relevance table/bounds, determinism, empty/singleton, profile composition, H3 validation pre-DB. |
| `services/analysis/tests/test_routing.py` | Created | Circle radius sanity, crossing interpolation, bad-host → None, labeled fallback, population None offline. |
| `services/analysis/tests/test_main.py` | Modified | `test_flood_zone_warn_auto_triggered` via monkeypatched factors (no DB needed). |
| `apps/api/src/server.ts` | Modified | zod schemas + `proxied()` wrapper for candidates/hotspots/h3/isochrone/reports; **real multipart streaming** for `/layers/upload` (replaces 501); **fixed `{...req}` spread dropping non-enumerable getters** (`headers` → TypeError → phantom 503 on every validated proxy). |
| `apps/api/test/server.test.ts` | Modified | 19 tests: candidate/hotspot/h3/isochrone/report shape validation (400) + passthrough (503\|200). |
| `docs/architecture/ADR-003-osrm-catchments.md` | Created | OSRM public table + fallback decision, rate/latency consequences. |
| `docs/architecture/data-contracts.md` | Modified | Implemented-endpoints table + persistence semantics + auto flood constraint. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `pytest` offline (`PYTHONPATH=.`) | Passed | 21 passed |
| `pytest` vs live compose DB | Passed | 22 passed in ~11 s |
| `npm run test/typecheck --workspace @geoready/api` | Passed | 19 passed |
| Live `docker compose` curl matrix | Passed | health `db:true`; 6 layers w/ counts; score 64.42 persisted w/ 5×`postgis_layer` + auto `flood_zone` warn; Bhuj 67.43; 11 DBSCAN clusters; 1690 H3 cells in 1.7 s persisted; OSRM routed rings (8/20/30 km) + pops 26k/117k/317k; cross-run report deltas; candidates listed |
| Browser smoke | Not run | No browser here; frontend workstream covers UI |

## Assumptions, limitations, and follow-up

- OSRM public latency ~1–9 s per fresh pin (cached after); UI carries the loading state.
- H3 `high` cells are few (13) on synthetic seeds — real WorldPop/OSM densities will spread the distribution; normalization is per-run min–max so it self-calibrates.
- Gi* stays stretch per system-design; worker/queue stays sync (fast enough: score <300 ms, H3 ~2 s).
