# AI Change Record — Fix constant score when moving pin (location-sensitive demo fallback + stale-score clear)

- **UTC timestamp:** `2026-09-19T13:11:16Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `when i change the location pin, the score remains consistent with the 1st time it was placed so it doesnt change at all (unless i change the type of store/thing)`
- **Intent:** Fix the root cause in the shared scoring path (not per-caller): the no-DB fallback assigned a flat 0.65 to every factor at every coordinate, so the score could only ever change with profile/weights. Also close the frontend trap where a failed rescore kept displaying the previous pin's score.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `services/analysis/app/main.py` | Modified | Added `_haversine_km` + `_demo_fallback_value(lng,lat,factor_id)` (deterministic — no `hash()`, PYTHONHASHSEED is per-process salted; smooth `exp(-d/90km)` decay from the same 4 Gujarat demo centres as `demo.ts` plus ~11km-cell jitter, clamped `[0.05,0.95]`); fallback branch now uses it instead of flat `0.65`, with `method: 'synthetic location-sensitive demo…'` and notice `'Synthetic location-sensitive demo factors (no validated layers loaded).'`; removed two dead lines (`comp = None`, `unit = unit`). `provided_metric` and PostGIS paths untouched. |
| `services/analysis/tests/test_main.py` | Modified | 3 regression tests: distant pins differ by >5 (`Ahmedabad 78.86 vs Bhuj 43.43`), same pin repeat identical + bounded `[0,100]` with factors in `[0.05,0.95]`, ~500m move shifts <5 (smooth). |
| `apps/web/src/main.tsx` | Modified | `doScore` catch now `setScoreData(null)` — a failed rescore shows `NO SCORE YET` + error instead of the previous pin's score masquerading as the new one. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| repro before fix `score(Ahmedabad) vs score(Bhuj)` | Failed as reported | Both exactly `65.0`, all `demo_placeholder` |
| repro after fix | Passed | `78.86` vs `43.43`; repeat `78.86`; nearby `79.08` (smooth) |
| `pytest` (`services/analysis`, `PYTHONPATH=.`) | Passed | 9 passed (6 existing + 3 new) |
| `npm run test --workspace @geoready/api` | Passed | 4 passed |
| `npm run typecheck/lint/build --workspace @geoready/web` | Passed | Build ~6s, pre-existing >500kB chunk warning only |
| Browser smoke | Not run | Needs `dev:web` + API: move pin across districts, score must track location; kill analysis, move pin, orb must clear to `NO SCORE YET` + error |

## Assumptions, limitations, and follow-up

- With PostGIS up (`docker compose up --build`) scores already varied via real `ST_DWithin` queries — this fix covers the far more common local path (frontend-only dev / DB down / stale image), where every user was seeing 65.0.
- Fallback stays honestly labeled (`demo_placeholder`, synthetic notice, DEMO badges); real `WorldPop/OSM` vending (Phase 6 item 5) still replaces it.
- `score_config_version` semantics unchanged (1 default, 2 custom weights).
