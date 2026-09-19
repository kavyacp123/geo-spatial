# AI Change Record — Initialize the GeoReady stack

- **UTC timestamp:** `2026-09-19T08:15:00Z`
- **Agent/tool:** `Codex`
- **Prompt summary:** Add popular configurable site types, make Gujarat the initial coverage area, and initialize the frontend, Node API, Python analysis service, Docker setup, and database schema.
- **Intent:** Create a runnable local platform foundation without representing placeholder scoring values as real Gujarat analysis.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `apps/web/` | Created | React, TypeScript, Vite, and MapLibre UI. |
| `apps/api/` | Created | Fastify profile and score-orchestration API. |
| `services/analysis/` | Created | FastAPI scoring kernel, tests, and geospatial dependencies. |
| `infra/postgres/init/001-schema.sql` | Created | Versioned PostGIS data model. |
| Docker and root configuration | Created | Compose topology, Dockerfiles, environment template, workspace setup, and ignores. |
| `docs/product/site-types.md` | Created | Eleven configurable Gujarat-first profiles and caveats. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `npm install --include=dev --package-lock` | Passed | Lockfile and local tool dependencies installed; npm reported dependency vulnerabilities for later remediation. |
| TypeScript checks | In progress | A Vite environment typing issue was corrected after the first check. |
| Python tests and Docker Compose build | Not run | Remaining verification steps. |

## Assumptions, limitations, and follow-up

- The score endpoint has clearly labeled placeholder factor values; it is not yet connected to validated Gujarat layers.
- The API exposes eleven profiles; the Python scoring kernel has demonstrable retail, EV charging, and warehouse calculations.
- Ingestion, persisted analysis jobs, H3/DBSCAN, routing, and reports remain future increments after source data selection.
