# Geospatial Standards

## Coordinates and geometry

- Store interchange and web-map geometries as WGS 84 longitude/latitude (`EPSG:4326`), always in `[longitude, latitude]` order.
- Never calculate distance, area, buffers, density, or clustering directly in geographic degrees. Transform to an appropriate local projected CRS or use an explicitly tested geodesic method.
- Record source CRS, normalized CRS, geometry type, feature count, extent, ingestion time, license/source, and schema version for every layer version.
- Validate geometries on ingestion: valid coordinates, supported type, non-empty shape, valid topology where applicable, and coordinates plausibly within the configured metro boundary.
- Normalize/repair only with an auditable rule and record the original feature identifier plus repair outcome.

## Analysis correctness

- State units for every radius, duration, area, density, and threshold in APIs/UI/docs. Default distance units to metres internally and show user-friendly units in the UI.
- Use spatial indexes for joins, nearest-neighbour queries, and polygon containment. Avoid full-table geometry scans for interactive requests.
- Define inclusion rules once for boundary cases (e.g., `ST_Covers` versus `ST_Contains`) and test them.
- Treat H3 cells as an analysis/visualization aggregation. Do not represent a cell centroid as a precise candidate location.
- Label synthetic layers, heuristics, estimates, and unavailable routing data visibly. Never imply census, FEMA, EPA, or routing accuracy when using demo data.

## Scores and explainability

- Scores must remain bounded in `[0, 100]`, deterministic for identical inputs, and traceable to a versioned config.
- Return the raw metric, normalized metric, weight, weighted contribution, data source/version, and constraint status for every factor.
- Hard constraints must be visible separately from weighted factors and must explain whether they cap, block, or warn on a score.
- Calibrate and test distance-decay functions at zero, threshold distance, maximum search radius, and missing-data conditions.
