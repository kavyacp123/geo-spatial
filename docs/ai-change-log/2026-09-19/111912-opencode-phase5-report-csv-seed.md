# AI Change Record — Phase 5 polish, 1-pager report + CSV/JSON exports + reproducible seed

- **UTC timestamp:** `2026-09-19T11:19:12Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `yea phase 5 please` — polish the Obsidian Atlas to a breathtaking, hackathon-ready product with a print-perfect 1-pager report, CSV/JSON exports, responsive/a11y polish, and a one-command reproducible seed.
- **Intent:** Deliver PS-2 §3.4 (compare + export reports) and MVP-plan §6 (reproducible demo) with visible source/weight/layer provenance, while keeping synthetic/demo labeling and geodesic correctness.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `apps/web/src/report.ts` | Created | Report builder: `buildReportHtml()` (90 lines, light print sheet, 900px max, Space Grotesk/Inter/JetBrains Mono, leader card, score/eligibility, factor table with weight/val/+pts + bar, constraints pills, catchments/search-polygon/method/sources footers, all `DEMO` badged, EPSG:4326 notice), `openReport()` (popup → print or HTML download fallback), `toCsv()` (flat per-factor CSV with label/lat/lng/score/eligibility/version/weight_source/factor fields). |
| `apps/web/src/styles.css` | Modified | Print + a11y polish: `@media print { .atlas{display:none} }` to avoid printing dark app shell when report is separate window, `.compare-head` now `flex-wrap:wrap` for mobile, existing `prefers-reduced-motion` retained. |
| `apps/web/src/main.tsx` | Modified | Wired report: `import {buildReportHtml,openReport,toCsv}`, added `exportCsv()` + `printReport()` (uses `compare` if pinned else current `scoreData`, builds `ReportSite[]`, enriches with `profileLabel`, `searchPoly`, `iso`, `generatedAt`), observatory "📌 Pin to compare" row now also shows "🖨 Report" + "CSV" buttons, compare tray head now has "🖨 Report · JSON · CSV · Clear" (all include polygon + catchment radii when set), provenance/report copy updated. |
| `infra/postgres/init/002-demo-gujarat.sql` | Created | Deterministic, idempotent demo seed (5 lines comment + 60 lines SQL): fixed-UUID `study_area` Gujarat multipolygon (EPSG:4326), eleven `score_config` v1 rows (mirrors siteTypes + kernel, `::jsonb`), five synthetic `data_layer` + `layer_version` stubs (`license synthetic-demo`), five `candidate_site` seeded points (SG Highway, Maninagar, Surat Vesu, Vadodara Alkapuri, Rajkot Ring). Enables `docker compose up --build` one-command reproducible demo without live APIs. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck --workspace @geoready/web` | Passed | Clean, report types checked |
| `npm run lint --workspace @geoready/web` | Passed | Clean |
| `npm run build --workspace @geoready/web` | Passed | 86 kB CSS / 1.24 MB JS (pre-existing >500kB chunk warning, MapLibre), ~4.8s |
| `pytest` (`services/analysis`, `PYTHONPATH=.`) | Not run — unchanged from Phase 4 (6 passed) | Seed SQL not yet executed against live PostGIS in this env |
| Browser smoke | Not run | Needs `npm run dev:web` + API: pin A/B → Report opens print window with leader, factor tables, WKT polygon, catchment rings, method + DEMO notice · Print → Save as PDF · CSV download · Compare JSON sibling · mobile compare wraps · Esc/Print keyboard · reduced-motion respected |

## Assumptions, limitations, and follow-up

- 1-pager is a client-side print window (light sheet) with all provenance — map snapshot not embedded (canvas capture would add deps); add `<canvas>.toDataURL` screenshot when MapLibre snapshot is stable.
- Report + CSV are derived from the browser's pinned `ScoreResponse`s; they remain `DEMO` with synthetic layers/rings — not a substitute for server-persisted `analysis_run` + `site_score/analysis_cell` until PostGIS reporting is wired. Next: `POST /api/v1/reports` + `GET /api/v1/analysis-runs/{id}/reports` backed by seeded `analysis_run` + PostGIS.
- Seed SQL uses fixed UUIDs for reproducibility; spatial features tables are intentionally sparse (frontend demo layers remain synthetic GeoJSON) — populate `spatial_feature` + `analysis_run/analysis_cell/site_score` when backend scoring reads PostGIS instead of placeholder `.65`.
- All exports carry `notice: DEMO — synthetic layers + geodesic demo catchments` and CRS `EPSG:4326 [lon,lat]` per `GEOSPATIAL_STANDARDS`; H3 remains a degree-grid proxy until `h3-py`.
