# System Design — AI-Powered GeoSpatial Site Readiness Analyzer

## 1. Product goal and first-release boundary

The system helps a user evaluate candidate sites within **one defined metropolitan area**. It ingests versioned layers, performs repeatable spatial analysis, calculates an explainable 0–100 readiness score, and presents results on an interactive map.

The hackathon MVP must demonstrate, end to end:

1. At least five layers: demographics, roads/accessibility, competitors/POIs, land-use/zoning, and environmental risk.
2. Upload/select a layer, validate and normalize it, then display it on a map.
3. Create/select a candidate point or draw an area of interest.
4. Calculate and explain a score using configurable weights, distance decay, competitor density, and hard constraints.
5. Show H3 high-/low-potential bins and DBSCAN hotspots; label advanced methods/estimates clearly.
6. Compare two or more candidates and export a compact report.

Drive-time isochrones and Getis-Ord Gi* are valuable stretch goals. A UI control must not promise a live route analysis unless a routing source is actually configured.

## 2. Recommended architecture

Use a hybrid TypeScript + Python architecture:

```text
Browser (React + TypeScript + MapLibre GL)
  |  HTTPS / JSON / GeoJSON
  v
Node.js API/BFF (Fastify or NestJS) ─── PostgreSQL + PostGIS
  |        |                               |
  |        └── job state / metadata         └── source, normalized, and derived spatial layers
  |  internal HTTP / queue
  v
Python Spatial Analysis Service (FastAPI + GeoPandas/Shapely/PyProj
 + scikit-learn + h3-py)
  |
  └── optional routing adapter: OSRM first, provider adapters later
```

### Why not Node.js alone?

Node.js is excellent for the product API, real-time job status, exports, and a cohesive TypeScript frontend/backend workflow. It can perform simple geometry tasks using Turf and H3, but Python has substantially better, mature support for GeoPandas, Shapely, PyProj, statistical spatial analysis, raster handling, and reproducible scientific calculations. The hybrid approach reduces spatial risk while keeping the primary web product in Node.js.

If the team is constrained to a single runtime, choose Python/FastAPI for the API plus React for the frontend. Do not force a JavaScript-only architecture at the cost of correct spatial analysis.

## 3. Component responsibilities

| Component | Responsibilities | Must not do |
| --- | --- | --- |
| React + MapLibre client | Map rendering, layer toggles/opacity, drawing, candidate selection/comparison, readable score breakdown, report request | Authoritative scoring or hidden spatial calculations |
| Node API/BFF | Authentication later, request validation, orchestration, metadata CRUD, jobs, exports, API aggregation, signed upload flow | Expensive geometry scans or statistical algorithms in request handlers |
| Python analysis service | Layer normalization, spatial joins, score metrics, H3/DBSCAN/Gi*, isochrones, reproducible analysis artifacts | Browser-session state or direct external-facing auth |
| PostgreSQL/PostGIS | Transactional entities, source/normalized/derived geometries, spatial indexes, queryable result layers | Unversioned destructive replacement of source data |
| Object storage (local/MinIO for demo) | Original uploads, GeoTIFFs, exports, tile artifacts | The only source of queryable spatial truth |
| Worker/queue | Long-running ingestion, scoring batches, clustering, routing, report generation | Blocking interactive HTTP requests |

For the hackathon, the queue may be a database-backed worker or a simple in-process development worker. Preserve a `job` interface so it can be replaced by BullMQ/Redis later.

## 4. Data lifecycle

```text
Data source/upload
  -> format + schema + CRS validation
  -> immutable source asset and layer-version record
  -> normalized EPSG:4326 geometry + standardized attributes
  -> quality report / spatial index
  -> analysis run (config + layer versions + target area)
  -> factor metrics + score breakdown + clusters/hexes/catchments
  -> API/vector tiles/GeoJSON -> interactive map and export
```

### Ingestion policy

Support GeoJSON and WKT in the MVP. Add zipped Shapefile after validation is working. Treat GeoTIFF as a planned raster pipeline unless a demonstrable raster risk layer is implemented; never claim support merely because a file can be uploaded.

Each `layer_version` is immutable and stores: layer type, source/license/attribution, source and normalized CRS, schema, feature count, geometry extent, validation report, source asset reference, and timestamps. Preserve source data separately; normalized attributes are a controlled derived representation.

## 5. Spatial data model

Core PostGIS tables (simplified):

| Table | Key fields |
| --- | --- |
| `metro_area` | `id`, `name`, `boundary geometry(Polygon,4326)`, `analysis_srid` |
| `data_layer` | `id`, `metro_area_id`, `kind`, `name`, `status` |
| `layer_version` | `id`, `layer_id`, `version`, `source_crs`, `normalized_crs`, `source_uri`, `quality_report`, `created_at` |
| `spatial_feature` | `layer_version_id`, `source_feature_id`, `properties jsonb`, `geom geometry(Geometry,4326)` |
| `score_config` | `id`, `version`, `factors jsonb`, `constraints jsonb`, `active` |
| `candidate_site` | `id`, `name`, `geom geometry(Point,4326)`, `metro_area_id` |
| `analysis_run` | `id`, `config_id`, `input_manifest jsonb`, `status`, `algorithm_version`, `started_at`, `completed_at` |
| `site_score` | `analysis_run_id`, `candidate_site_id`, `score`, `eligibility`, `breakdown jsonb` |
| `analysis_cell` | `analysis_run_id`, `h3_index`, `score`, `cluster_type`, `geom geometry(Polygon,4326)` |

Use GiST indexes on every geometry column and ordinary indexes on foreign keys/status fields. Use a local projected `analysis_srid` per metro for distance/area operations, then transform results to 4326 for delivery.

## 6. Scoring model and explainability

The score is not an AI guess. It is a transparent weighted model whose factors are computed spatially and whose configuration is versioned. AI may later narrate explanations, but it must not invent values or override the deterministic result.

### Example MVP configuration

| Factor | Metric | Normalization / contribution | Example weight |
| --- | --- | --- | ---: |
| Demand | Population density within catchment | percentile or capped min–max, higher is better | 0.30 |
| Access | nearest major road/transit and road density | distance-decay plus density normalization | 0.20 |
| Competition | competitor count or kernel density | lower density gives higher score | 0.20 |
| Land use | zoning/buildable eligibility | categorical fit; may be a hard constraint | 0.15 |
| Environmental risk | flood/air/risk intersection | lower risk gives higher score | 0.15 |

For each non-constraint factor, calculate a raw metric `m_i`, normalize it to `n_i` in `[0,1]`, and compute `c_i = 100 * w_i * n_i`. The base score is `clamp(sum(c_i), 0, 100)`. Weights must sum to 1.0 (allow a small floating tolerance) and values missing from a layer must be disclosed, never silently treated as zero.

Distance-decay example for a positive nearby amenity:

`decay(d) = exp(-d / scale_m)` for `0 <= d <= max_distance_m`, otherwise `0`.

For competitors, use the inverse suitability (`1 - normalized competition density`) or a policy-specific optimal-distance curve. Configure the function name and parameters in `score_config`, and return them in every score result.

### Constraints

Model constraints separately: `block` (ineligible; score not actionable), `cap` (maximum allowed score), and `warn` (score retained with visible warning). Examples: prohibited zoning = block; flood zone = cap or warn depending on policy. The UI must show the exact rule and source layer.

### Response contract

Every score response includes `score`, `eligibility`, `config_version`, `analysis_run_id`, and for every factor: raw value + unit, normalized value, weight, contribution, source layer/version, calculation method, and confidence/data-quality flag.

## 7. Analysis methods

| Method | MVP purpose | Implementation notes |
| --- | --- | --- |
| Buffers/spatial joins | Catchments, risk intersections, population/POI metrics | Project before buffering; use spatial index. |
| H3 binning | Aggregate candidate suitability and demand into readable map cells | Fix metro-specific resolution after visual testing; calculate feature aggregation consistently. |
| DBSCAN | Find dense candidate/POI clusters or underserved gaps | Explain `eps` in metres and `min_samples`; parameterize and record values. |
| Getis-Ord Gi* | Statistically identify hot/cold spots | Stretch goal; requires a defensible spatial-weight matrix and p-value display. |
| Isochrone | Drive/walk catchment and reachable population | OSRM adapter for demo; cache by origin/profile/time/config, display source/provider. |

For “underserved”, define it explicitly for the selected use case, for example: high demand score + adequate access + low competitor density. It is not simply “no competitors”.

## 8. API surface

See `data-contracts.md` for payloads. First endpoints:

- `POST /api/v1/layers` — initiate validated upload/ingestion.
- `GET /api/v1/layers`, `GET /api/v1/layers/{id}/versions/{version}` — metadata and quality report.
- `POST /api/v1/candidates`, `GET /api/v1/candidates` — candidate management.
- `POST /api/v1/analysis-runs` — start a run with layer versions and score config.
- `GET /api/v1/analysis-runs/{id}` — status and provenance.
- `GET /api/v1/analysis-runs/{id}/scores` — score breakdowns and comparison.
- `GET /api/v1/analysis-runs/{id}/map/{layer}` — viewport-filtered GeoJSON initially; vector tiles later.
- `POST /api/v1/reports` — generate a downloadable candidate-comparison report.

## 9. Frontend interaction design

The main screen has a full map, a left layer panel, a contextual candidate/analysis drawer, and a small legend. Essential interactions:

1. Toggle each layer and adjust opacity without rerunning the analysis.
2. Click the map to create/select a candidate; draw a polygon to constrain the search area.
3. Display a score badge, eligibility state, factor waterfall/list, constraints, sources, and last analysis time.
4. Switch H3 score map, hotspots, coldspots, and raw layers with an interpretable legend.
5. Pin candidates to a comparison tray; display common-factor comparison and export.

Avoid an opaque “AI score” visual. The narrative explanation must be generated strictly from the returned factor breakdown and cite the data gaps/constraints.

## 10. Reliability, performance, and observability

- Target interactive candidate scores under 3 seconds when layer data is already indexed; send expensive batches/routing/report jobs asynchronously.
- Cache isochrones, H3 aggregate tiles, and read-only map responses by input manifest/config version. Invalidate by version, not time alone.
- Log `analysis_run_id`, layer-version IDs, config version, duration, feature counts, and failed validation reason; exclude sensitive geometry/property data from logs.
- Use structured error states: `queued`, `running`, `succeeded`, `failed`, `cancelled`, plus failure code and safe message.
- Snapshot demo data and score config so the final demo is reproducible without unreliable live APIs.

## 11. Deployment shape

Docker Compose is sufficient for local judging: `web`, `api`, `analysis`, `worker`, `postgres-postgis`, and `minio` (optional). Provide a one-command seed that loads only documented demo data. A cloud deployment can use managed Postgres with PostGIS, object storage, containers, and a routing provider only after secrets and cost limits are configured.

## 12. Decisions required before coding

1. Pick the single metro area and approved/open source datasets with licenses.
2. Choose the target use case (retail, EV charging, warehouse, telecom, or renewable energy); factor definitions depend on it.
3. Confirm the initial scoring policy/weights and which constraints block vs cap vs warn.
4. Choose mock versus live routing and the cost/availability fallback.
5. Select local-only versus cloud judging deployment.
