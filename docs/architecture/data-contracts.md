# Data and API Contracts

These contracts keep the React client, Node API, Python analysis service, and PostGIS data model aligned. They are implementation-neutral but should become OpenAPI and typed schemas before development begins.

## Coordinate and common rules

- JSON geometry follows GeoJSON and uses WGS 84 `[longitude, latitude]` coordinates.
- All distance fields include a `_m` suffix; duration fields include `_min`; area fields include `_m2` or `_km2`.
- IDs are UUIDs. Timestamps are UTC ISO-8601 strings.
- Every derived payload includes `analysis_run_id`, `score_config_version`, and the source `layer_versions` manifest.

## Layer manifest

```json
{
  "layer_version_id": "uuid",
  "kind": "demographics|transport|poi|land_use|environmental_risk",
  "source_name": "Census demo extract",
  "license": "source license identifier or URL",
  "source_crs": "EPSG:4326",
  "normalized_crs": "EPSG:4326",
  "feature_count": 1250,
  "extent": [-74.2, 40.5, -73.6, 40.9],
  "quality": {"status": "passed", "warnings": []}
}
```

## Score configuration

```json
{
  "id": "retail-v1",
  "version": 1,
  "target_use_case": "retail_store",
  "factors": [
    {
      "id": "population_demand",
      "weight": 0.30,
      "metric": "population_within_catchment",
      "unit": "people",
      "normalization": {"type": "percentile", "lower": 0.05, "upper": 0.95}
    },
    {
      "id": "road_access",
      "weight": 0.20,
      "metric": "nearest_major_road_distance_m",
      "unit": "m",
      "normalization": {"type": "distance_decay", "scale_m": 750, "max_distance_m": 5000, "direction": "lower_is_better"}
    }
  ],
  "constraints": [
    {"id": "restricted_zoning", "effect": "block", "layer_kind": "land_use", "rule": "zoning IN ('restricted')"}
  ]
}
```

Validation: factor IDs are unique; weights sum to 1.0 within `0.0001`; every metric has units, normalization, and a layer dependency; constraints have an effect of `block`, `cap`, or `warn`.

## Candidate score response

```json
{
  "candidate_id": "uuid",
  "analysis_run_id": "uuid",
  "score": 78.4,
  "eligibility": "eligible",
  "score_config_version": 1,
  "factors": [
    {
      "factor_id": "population_demand",
      "raw_value": 18250,
      "unit": "people",
      "normalized_value": 0.84,
      "weight": 0.30,
      "contribution": 25.2,
      "method": "population polygon overlap within 20-minute catchment",
      "layer_version_id": "uuid",
      "quality": "estimated"
    }
  ],
  "constraints": [
    {
      "constraint_id": "flood_zone",
      "effect": "warn",
      "triggered": true,
      "message": "Candidate intersects a documented flood-risk area.",
      "layer_version_id": "uuid"
    }
  ],
  "input_manifest": {"layer_version_ids": ["uuid"]},
  "generated_at": "2026-09-19T00:00:00Z"
}
```

`score` is always between 0 and 100. `eligibility` is `eligible`, `capped`, `warning`, `ineligible`, or `insufficient_data`. An ineligible result must contain the triggering block constraint and must never be displayed as an unqualified recommendation.

## Candidate score request (live scoring)

```json
{
  "profile_id": "fmcg_retail",
  "longitude": 72.57,
  "latitude": 23.02,
  "factor_values": {"demand": 0.8},
  "weight_overrides": {"demand": 0.35, "access": 0.15, "competition": 0.20, "zoning": 0.15, "risk": 0.15},
  "triggered_constraints": [{"id": "flood_zone", "effect": "warn", "message": "..."}]
}
```

`weight_overrides` is optional. When present it must contain known factor ids in `[0,1]` and sum to `1.0` within `0.0001`; the server returns `score_config_version: 2` and `weight_source: "custom"` for traceability. Omit it for the default versioned weights. Mirrors the eleven Gujarat profiles (`fmcg_retail` … `solar_installation`).

## Analysis-run request

```json
{
  "metro_area_id": "uuid",
  "score_config_id": "retail-v1",
  "layer_version_ids": ["uuid", "uuid", "uuid", "uuid", "uuid"],
  "candidate_ids": ["uuid"],
  "search_geometry": {"type": "Polygon", "coordinates": []},
  "analyses": ["site_scores", "h3_suitability", "dbscan_hotspots"],
  "routing": {"mode": "drive", "minutes": [10, 20, 30]}
}
```

The server verifies that all layer versions belong to the chosen metro and are validated, that candidates/search geometry lie within the metro boundary, and that requested analyses are supported by available data.

## Inter-service analysis job

```json
{
  "analysis_run_id": "uuid",
  "metro_area": {"id": "uuid", "analysis_srid": 32643},
  "layer_versions": [{"id": "uuid", "kind": "poi"}],
  "score_config": {"id": "retail-v1", "version": 1},
  "candidate_sites": [{"id": "uuid", "geometry": {"type": "Point", "coordinates": [77.59, 12.97]}}],
  "requested_analyses": ["site_scores", "h3_suitability"]
}
```

The analysis service returns/persists results with method name, parameter values, calculation version, warnings, and per-result provenance. It may never resolve an unspecified layer “latest” during a run.

## Implemented endpoints (2026-09-19, all behind `/api/v1`, Node BFF proxies to analysis)

Score responses now persist when PostGIS is up and return `persisted: true` with
database-backed `candidate_id` / `analysis_run_id` (ephemeral UUIDs otherwise —
a score never 500s for provenance). New optional score fields: `candidate_id`,
`candidate_name` (reused when the id exists, else a boundary-checked insert).

| Method + path | Purpose | Key validation |
|---|---|---|
| `POST /scores` | Score a pin (PostGIS factors → fallback demo) | profile known, weights Σ 1.0 ±0.0001, coords in range; constraints carry `triggered` + `layer_version_id`, `input_manifest` lists `layer_versions` |
| `GET /layers` | Layer catalog with counts + extents | — |
| `GET /layers/{id}/versions/{v}` | Version manifest + quality report | 404 unknown |
| `GET /layers/{id}/features?bbox=&limit=` | Viewport GeoJSON (≤500) | bbox `minx,miny,maxx,maxy` |
| `POST /layers` | Ingest GeoJSON/WKT (validated, versioned) | kind enum, Gujarat bbox, ≤25MB |
| `POST /layers/upload` | Ingest `.zip` Shapefile (fiona) / GeoTIFF (rasterio) | 501 with message when GDAL missing |
| `POST /candidates`, `GET /candidates` | Persist / list candidate pins | inside study boundary (422) |
| `GET /analysis-runs/{id}` | Run + its site_scores | 404 unknown |
| `POST /hotspots` | sklearn DBSCAN (haversine) over profile-relevant POIs | profile known; 503 no DB; 501 no sklearn |
| `POST /h3` | Real h3 cells (res 3–7, default 5) blended from layer aggregates, persisted to `analysis_cell` | 422 over cell cap 2000 / bad res; optional `bbox` scopes cells (client sends the drawn search-polygon bbox) |
| `POST /isochrone` | OSRM table-API drive rings + reachable population, geodesic fallback | minutes 1–120; always labeled `routed` bool + provider |
| `POST /reports` | Assemble cross-run report from persisted site_scores | 404 on missing pair |

`flood_zone` (warn) is auto-appended when a pin falls inside a risk polygon, so
constraints are discovered — not only echoed — while client-supplied
`triggered_constraints` keep working for policy overrides.
