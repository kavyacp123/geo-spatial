# AI Change Record — Phase A score-contract + polygon/H3 + provenance surfacing

- **UTC timestamp:** `2026-09-20T09:55:50Z`
- **Agent/tool:** `Muse Spark (opencode)`
- **Prompt summary:** `User asked "What else in the project feels important to implement?" then "Do that then." — implemented Phase A (non-escalating items only).`
- **Intent:** `Close the cheapest spec gaps first: score-response provenance fields, search-polygon H3 scoping, UI/report provenance display, honest boundary labeling. No weight/semantics changes, no licensed-data ingestion, no new services.`

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `services/analysis/app/main.py` | Modified | `score()` constraints now carry `triggered: true` + `layer_version_id` (risk lv on auto `flood_zone`, else null); `input_manifest` gains `layer_versions` (sorted, distinct factor sources). Additive only. |
| `services/analysis/tests/test_main.py` | Modified | New `test_score_contract_provenance_fields` + flood-zone `layer_version_id` assert. |
| `apps/web/src/livedata.ts` | Modified | `fetchH3` accepts optional `bbox` and forwards it in the `POST /h3` body. |
| `apps/web/src/main.tsx` | Modified | Added `polyBbox` helper; server-H3 effect scopes to drawn-polygon bbox and refetches on polygon change; `ScoreFactor`/constraint/`input_manifest` types extended; waterfall shows method + short layer id; `printReport` passes routed/provider catchment state; polygon status label updated (was "not yet sent to scoring"). |
| `apps/web/src/report.ts` | Modified | `ReportSite` factors/constraints carry method + `layer_version_id`; factor rows render method + short layer id; catchment block shows `ROUTED (provider)` with drive-time wording when routed instead of hardcoded DEMO text; CSV gains trailing `method,layer_version_id` columns. |
| `infra/postgres/init/002-demo-gujarat.sql` | Modified | Comment-only: boundary documented as bounding-box proxy, not the state polygon; replacement flagged as owner-gated follow-up. No data changed. |
| `docs/architecture/data-contracts.md` | Modified | `POST /scores` row notes `triggered`/`layer_version_id` + `layer_versions`; `POST /h3` row notes optional `bbox` scoping. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `python -m pytest -q` in `services/analysis` | Passed | `23 passed` (incl. new contract test). |
| `npm run typecheck --workspace @geoready/web` | Passed | `tsc -b` clean. |
| `npm run test --workspace @geoready/web` | Passed | `12 passed` (2 files). |
| `npm run test --workspace @geoready/api` | Passed | `20 passed`. |
| `npm run lint --workspace @geoready/web` | Passed | `eslint src` clean. |
| Browser smoke (map + score flow) | Not run | UI changed but no browser harness available in this session; visual check deferred to owner. |

## Assumptions, limitations, and follow-up

- `insufficient_data` eligibility, `score_config` metric/unit/normalization metadata, and real Gujarat polygon all deferred: each touches score semantics or licensed data and needs owner direction per `AGENTS.md` stop-and-escalate.
- H3 `bbox` overrides the study boundary server-side without a containment check (`main.py` passes it straight to `h3_cell_scores`); acceptable for session-local scoping, server should verify bbox ⊆ study area as a follow-up.
- Client-supplied `triggered_constraints` get `layer_version_id: null` (source unknown) — honest but incomplete; BFF could attach provenance later.
- Phase B (WorldPop/OSM ingestion), Phase C (missing run routes, worker, rate limits, OpenAPI, MinIO decision), Phase D (Gi*, UX polish, ops) remain open and were NOT started.
