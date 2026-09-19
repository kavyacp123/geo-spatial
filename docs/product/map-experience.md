# Map Experience Direction

The production map experience will use MapLibre with OpenStreetMap raster tiles and visible OpenStreetMap attribution. This provides real Gujarat road, settlement, and landmark geography without a commercial map-token dependency.

At the statewide overview, the interface must cluster contextual locations and expose clear density/coverage patterns. At city and neighbourhood zoom, it must reveal individual nearby locations and candidate information. Synthetic, inferred, and verified layers must use distinct legends and labels.

## Basemap policy (Obsidian Atlas, Phase 1)

The client ships two token-free basemaps with a visible toggle: Carto dark-matter (default, cinematic stage look) and OSM standard raster. Both carry visible attribution (`© OpenStreetMap contributors`, plus `© CARTO` on dark). MapLibre `demotiles` is retired. No commercial map token is required for judging.

## H3 / DBSCAN / layer overlays (Phase 3 — synthetic demo)

H3 hexagonal binning, DBSCAN hotspots, and underserved gaps render as MapLibre GeoJSON overlays generated client-side from a degree-grid hex proxy (§GEOSPATIAL_STANDARDS: H3 is aggregation, not a precise site). Scores for H3 use a geodesic haversine decay from Gujarat city centres so high-potential clusters sit near Ahmedabad/Surat/Vadodara, with each cell carrying `score, h3_index, cluster_type, license: synthetic-demo`. DBSCAN hotspots are synthetic point clusters around seeded sites; underserved gaps are the high-potential ring subset per “high demand + adequate access + low coverage” gap definition. All three carry a visible `DEMO`/`SYNTH` badge, toggle (left rail + legend) and distinct legend entries, and survive basemap switches via `styledata` re-add. Five raw layer stubs (demographics, transport, poi, land_use, environmental_risk) are also synthetic GeoJSON with per-layer eye toggle and opacity (0–1) mapped to `fill-opacity`/`line-opacity`/`circle-opacity`.

## Draw, catchments, and compare (Phase 4 — synthetic demo)

Custom search polygons are drawn vertex-by-vertex (click to add, double-click or Finish to close, Esc to cancel) and rendered as a dashed gold fill/outline from a `GeoJSON Polygon` in EPSG:4326; the polygon is session-local and included in the compare export but not yet used for server-side filtering. Drive-time catchments are geodesic circles (64-pt destination formula, metres internally, km displayed) at `10/20/30 min` × `~40 km/h` (≈6.7/13.3/20 km) with per-minute toggles; each feature carries `minutes, radius_m, license: synthetic-demo` and is clearly labeled `DEMO CATCHMENT — geodesic, not routed` in legend, map labels, and provenance/export. Compare pins up to 3 current scores (A/B/C) to a bottom tray showing mini-orb, delta vs best, eligibility, top-3 factor contributions, Fly-to/Remove, and Export JSON (CRS, config version, factors, plus polygon + catchment radii when set), honoring PS-2 §3.4 compare/export and keeping every value traceable.
