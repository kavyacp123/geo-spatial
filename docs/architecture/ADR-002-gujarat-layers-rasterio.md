# ADR-002: Gujarat State Coverage and Five-Layer Data Strategy (with WorldPop + rasterio)

- **Status:** Accepted
- **Date:** 2026-09-19
- **Deciders:** Owner (whole-Gujarat), Muse Spark agent

## Context

PS-2 requires five geospatial layers (demographics, transportation, POI, land-use, environmental risk) supporting GeoJSON/Shapefile/GeoTIFF/WKT, a 0–100 explainable score, spatial clustering, and a one-command reproducible demo. Prior ADR-001 chose hybrid TS+Python; the Gujarat scope was previously ambiguous (Ahmedabad metro vs Gujarat state). Owner confirmed: whole Gujarat, WorldPop for demographics via rasterio, recommended mix for the rest, include Shapefile ingestion.

## Decision

- **Coverage:** Whole Gujarat state boundary (68.2–74.7 E, 19.6–24.9 N, MultiPolygon in EPSG:4326, analysis in EPSG:32643). Keep the five seeded candidates as visible demos; they sit in different Gujarat districts, now within the metro.
- **Layer sources:**
  - **Demographics (GeoTIFF → GeoJSON):** WorldPop India 2020 100m UN-adjusted, clipped to Gujarat, ingested via `rasterio` zonal stats per ward/tehsil polygon, result polygons carry `population, density_km2`. Synthetic fallback (`synthetic-demo`) if raster fetch fails.
  - **Transportation (GeoJSON):** OSM roads + transit (Geofabrik Gujarat → clip to Gujarat polygon), plus synthetic corridor demo for fast judging, stored as LineString/Point.
  - **POI (GeoJSON):** Synthetic named competitors + complementary businesses (explicit per mvp-plan) plus OSM amenities as second sub-source; both labeled `synthetic-demo` / `osm`.
  - **Land-use & zoning (GeoJSON + Shapefile):** OSM `landuse` polygons + labeled synthetic zoning overlay (commercial/mixed/industrial/restricted) that drives block/cap constraints.
  - **Environmental risk (GeoJSON + WKT):** Sabarmati buffer flood model (modeled, not FEMA-grade) + CPCB AQI station points; risk polygons trigger `cap/warn`.
  - **Utilities (6th, small):** Synthetic substation points for EV/solar/telecom, same pipeline.
- **Pipeline:** `POST /api/v1/layers` validates format+schema+CRS, stores immutable `layer_version` + `spatial_feature` (GiST) via Python analysis service; GeoTIFF handled by `rasterio`, Shapefile `.zip` by `fiona`/`pyogrio` (both optional-deps, fail soft with clear demo badge). Scores read via PostGIS in projected metres (EPSG:32643), never in degrees, with per-factor `layer_version_id` provenance.

## Consequences

- Heavier `analysis` image (GDAL via `apt` + `rasterio/fiona`) and a new `DATABASE_URL` read-only wiring; no new services.
- Larger Gujarat hex grid (~250 hexes) vs. Ahmedabad-only; still client-synthetic until PostGIS H3 replaces `demo.ts`.
- Provenance `layer_version` traceability unchanged — frontend already shows `DEMO/SYNTH` vs real license, no contract break.
- Fallback synthetic paths keep judging reproducible when external raster/OSM fetch is unavailable; all synthetic/modeled sources stay visibly labeled per GEOSPATIAL_STANDARDS.
