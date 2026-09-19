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
