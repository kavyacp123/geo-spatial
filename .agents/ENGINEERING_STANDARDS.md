# Engineering Standards

## Architecture and interfaces

- Use TypeScript with strict compiler settings for frontend and Node.js services. Use Python type hints for the spatial-analysis service.
- Keep the browser thin: presentation, interactions, and API orchestration belong there; authoritative scoring and spatial computation belong server-side.
- Version public APIs (`/api/v1`) and score configurations. Define OpenAPI contracts before cross-service implementation.
- Use explicit domain names: `candidate_site`, `analysis_run`, `layer_version`, `score_config`, `score_breakdown`, and `constraint_result`.
- Prefer idempotent ingestion and analysis requests. Every derived result must trace to layer versions, analysis parameters, code version, and score-config version.

## Quality and tests

- Format and lint all changed code; keep type checking clean.
- Add unit tests for calculations and boundary validation. Use fixtures with known geometries and expected scores.
- Add integration tests for service/database boundaries and a browser smoke test for the primary demo path.
- Test edge cases: missing attributes, invalid/empty geometries, points on boundaries, mixed CRS, null values, duplicates, and zero/very high density.

## API and security

- Validate requests and normalized data schemas; reject unsupported geometry types, malformed coordinates, oversized uploads, and unknown CRS.
- Use parameterized SQL only. Enforce content type, size limits, and rate limits on uploads and analysis endpoints.
- Store secrets in local environment configuration excluded from version control. Provide `.env.example` with names only.
- Return actionable errors without exposing stack traces, credentials, or internal paths.

## Maintainability

- Favor clear, boring code over clever abstractions. Keep functions small and domain-oriented.
- Add comments only for rationale, spatial assumptions, or counterintuitive trade-offs.
- Do not commit `node_modules`, Python virtual environments, generated tiles, database dumps, or raw datasets unless an explicit small demo fixture is approved.
