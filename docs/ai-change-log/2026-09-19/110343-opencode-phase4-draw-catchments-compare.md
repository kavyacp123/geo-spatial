# AI Change Record — Phase 4 draw polygon + geodesic demo catchments + A/B/C compare

- **UTC timestamp:** `2026-09-19T11:03:43Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `yeah phase 4 now` — add breathtaking PS-2 §3.4/§3.5 interactions: vertex-drawn search polygon, 10/20/30 min geodesic demo catchments, and A/B/C compare tray with export, all synthetic-labeled and geodesic-correct.
- **Intent:** Deliver the interactive map requirements that were missing (draw custom search polygon, compare candidate sites, catchment areas) without adding dependencies or live routing, keeping scores reproducible and sources attributed per GEOSPATIAL_STANDARDS.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `apps/web/src/demo.ts` | Modified | Added `circlePolygon(center,radiusM,steps=64)` geodesic destination-formula helper (metres internally, EPSG:4326 output) with `ponytail:` header; kept to synthetic-demo. |
| `apps/web/src/styles.css` | Modified | Added draw/catchment/compare styles: `.draw-bar/.draw-status`, `.catchments/.catch-row/.swatch`, `.compare-tray/.compare-head/.compare-cards/.compare-card(.pinned)/.mini-orb/.cc-meta/.delta`, `.map-wrap.drawing` crosshair, plus `.atlas` grid `58px 1fr auto 30px` to host tray. Hand-rolled, no lib. |
| `apps/web/src/main.tsx` | Modified | Wired Phase 4: import `circlePolygon`; constants `ISO_MIN/ISO_CFG` (40 km/h → 6.7/13.3/20 km); states `drawActive/drawVerts/searchPoly/iso/compare`; refs to avoid stale closure for map `click` (draw vs score) and `dblclick` finish; `ensureDemoLayers` now adds `draw` + `isochrones` sources + 7 layers (`iso-fill/outline/label`, `draw-fill/outline/line/vertex`); draw source sync (LineString + vertices while drawing, Polygon after Finish) and isochrone sync (geodesic circles per `iso` toggles with `minutes` prop, labeled `DEMO`); ESC cancel + doubleClickZoom disable while drawing; left-rail "Search area · draw polygon" (Draw/Finish/Cancel/Clear, status), "Catchments · 10/20/30 min · DEMO" checkboxes with swatches (jade/gold/indigo) + DEMO note; map-hint switches to draw mode; legend adds polygon + DEMO catchments badge; observatory gains "Pin to compare" (≤3, dedup) + step copy updated; bottom `compare-tray` (Fly-to, Remove, delta vs best, leader star, Export JSON payload with CRS, config version, factors, polygon + catchment radii, synthetic note); provenance footer marks `H3/DBSCAN/rings synthetic demo`; ignition Phase 4 copy. MapLibre `styledata` re-add preserved. |
| `docs/product/map-experience.md` | Modified | Added §Phase 4 draw/catchments/compare contract: vertex draw, geodesic circles metres-internal, DEMO labeling, export inclusion. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck --workspace @geoready/web` | Passed | Clean |
| `npm run lint --workspace @geoready/web` | Passed | Clean |
| `npm run build --workspace @geoready/web` | Passed | 86 kB CSS / 1.24 MB JS (pre-existing >500kB chunk warning, MapLibre) ~14.5s |
| `pytest` (`services/analysis`, `PYTHONPATH=.`) | Passed | 6 passed |
| `npm run test --workspace @geoready/api` | Not run — unchanged from Phase 3 (4 passed) |  |
| Browser smoke | Not run | Needs `npm run dev:web` + API: draw polygon (Finish on 3+ pts / double-click / Esc), rings (10 on by default, toggle 20/30, move pin re-projects geodesically), pin A/B/C → delta + Fly-to + Export JSON + provenance; basemap switch retains layers. |

## Assumptions, limitations, and follow-up

- Catchments are geodesic circles at a fixed 40 km/h proxy, not routed isochrones (OSRM/Valhalla) and not population-weighted. Each ring and the map label/provenance/export is badged `DEMO CATCHMENT — geodesic, not routed`. Replace with OSRM adapter + cached `analysis_run_id` when live routing is wired.
- Search polygon is session-local, included in the compare export as GeoJSON `EPSG:4326` but not yet sent to `POST /api/v1/scores` for server-side filtering — next step is to add `search_geometry`/`search_polygon` to the scoring contract and validate it within the metro boundary.
- Compare is client-side pinned scores (max 3, dedup by coords), no persistent `candidate_site` yet — `POST /api/v1/candidates` + PostGIS when persistence is needed.
- All new overlays set `license: synthetic-demo` / `DEMO` where required; H3 remains a degree-grid proxy until `h3-py`.
- Next phase (5): polished printable export (1-pager with sources, factor table, caveats), mobile polish, and `layer_version` wiring to replace `demo.ts` stubs.
