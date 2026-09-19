# AI Change Record — Phase 3 H3 honeycomb + DBSCAN + underserved + synthetic raw layers

- **UTC timestamp:** `2026-09-19T10:55:36Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `yea phase 3 now` — wire breathtaking spatial-analysis overlays: glowing H3 suitability honeycomb, DBSCAN hotspot embers, underserved gap diamonds, plus five toggleable synthetic raw layers with per-layer opacity and legend interactivity.
- **Intent:** Deliver PS-2 §3.3 (H3 binning, DBSCAN, underserved) + §3.4 (toggle/opacity) without backend dependency, while honoring GEOSPATIAL_STANDARDS (H3 as aggregation, geodesic distance, synthetic labeling) and map-experience overview→neighbourhood narrative.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `apps/web/src/demo.ts` | Created | Synthetic demo generator (78 lines): haversine-geodesic H3 hex grid (~20km) scored by `exp(-d/85km)` from 4 Gujarat city centres, `UNDERSERVED_DEMO` as high-score ring subset (gap = high demand + low coverage), `HOTSPOTS_DEMO` point clusters around seeded sites, `RAW_DEMO` for 5 layer kinds (demographics, transport, poi, land_use, environmental_risk) each `license: synthetic-demo`. Naive degree-grid; header `ponytail:` labels ceiling + upgrade to real H3 + PostGIS. |
| `apps/web/src/styles.css` | Modified | Added `.layers`, `.layer-row`, `.layer-head`, `.eye(.on)`, per-layer opacity sliders, interactive `.legend button(.active)` styles. |
| `apps/web/src/main.tsx` | Modified | Import demo layers, add state `showH3/showHotspots/showUnderserved/rawVis/rawOp`, `ensureDemoLayers(map)` (7 sources, 12 layers: h3-fill/outline with interpolate score ramp gold↔indigo, underserved fill/outline dashed teal, hotspots halo+core ember, raw demographics/transport/poi/land_use/risk), `styledata` re-add to survive basemap switch, `useEffect` sync visibility + `fill/line/circle-opacity` from toggles, left-rail "Map layers · synthetic demo" panel with eye + opacity sliders, legend now clickable toggles (active badge, ON/OFF), map-hint updated, observatory lede clarifies H3 aggregation, provenance footer adds `H3/DBSCAN synthetic demo`, ignition copy Phase 3. Zero new deps; data-degree hexes + haversine keep GEOSPATIAL_STANDARDS. |
| `docs/product/map-experience.md` | Modified | Documented Phase 3 overlays: hex proxy, geodesic scoring, badge, toggles, opacity mapping, styledata survival. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck --workspace @geoready/web` | Passed | After fixing GeoJSON Polygon coordinate casts and underserved filter typing. |
| `npm run lint --workspace @geoready/web` | Passed | Removed unused `Props` type. |
| `npm run build --workspace @geoready/web` | Passed | 31 modules, 84 kB CSS / 1.23 MB JS (pre-existing >500kB chunk warning). |
| `npm run test --workspace @geoready/api` | Passed | 4 passed |
| `pytest` (`services/analysis`, `PYTHONPATH=.`) | Passed | 6 passed |
| Browser smoke | Not run | Needs `npm run dev:web` visual: honeycomb gold/indigo gradient, pulsing halos, diamond outlines, per-layer eye/opacity, legend toggles, basemap switch retains layers. |

## Assumptions, limitations, and follow-up

- H3 is a degree-grid hex proxy, not real `h3-py` indexes; not country/state-validated. DBSCAN is synthetic point clusters, not `sklearn.cluster.DBSCAN`. Both visibly `DEMO`/`SYNTH` and never resolved as precise candidate locations.
- Raw layers are tiny stubs (4 city polygons, 3 line corridors, 18 POIs) — enough to demonstrate toggle/opacity contract (§3.4) before validated ingestion lands.
- Real implementation (Phase 6): replace `demo.ts` with versioned `layer_version` GeoJSON / vector tiles from PostGIS + `h3-py` + `scikit-learn`, keep the same layer ids + opacity contract.
- Next phases: custom search polygon draw (Phase 5), 10/20/30 demo isochrone rings, compare tray A/B/C + export 1-pager.
