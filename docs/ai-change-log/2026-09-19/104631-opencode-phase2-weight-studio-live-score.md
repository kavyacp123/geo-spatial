# AI Change Record — Phase 2 eleven-profile scoring + weight studio + live observatory

- **UTC timestamp:** `2026-09-19T10:46:31Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `phase 2 now` — extend scoring to all 11 Gujarat profiles, add configurable weights via safe weight studio, wire live click/seeded-site scoring with observatory orb + waterfall + provenance.
- **Intent:** Unblock Gujarat 11-profile explorer boot (PS-2), make weights transparent/data-driven per GEOSPATIAL_STANDARDS, and deliver the "click → score → explain → tweak" loop judges can run in 60s.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `services/analysis/app/main.py` | Modified | Expanded `F` from 3 → 11 profiles (mirrors `siteTypes.ts` sums 1.0), added `weight_overrides` field with `[0,1]` range check, server-side sum-to-1.0 validation (422), per-profile unknown-factor guard, `weight_source` + `score_config_version` (2 when custom) + `input_manifest.weights` for provenance. |
| `services/analysis/tests/test_main.py` | Modified | Added 4 tests: all-eleven score, weight-override applied (50 pts), sum-must-be-one guard, weights-sum-to-one per profile. |
| `apps/api/src/server.ts` | Modified | Added `weight_overrides` to zod `requestSchema` (0-1 range) for passthrough to analysis service. |
| `apps/api/test/server.test.ts` | Modified | Added tests: rejects invalid weight range, passes valid weight_overrides (503/200). |
| `apps/web/src/styles.css` | Modified | Added weight studio (sliders, head Σ, actions, Normalize/Reset), seeded site buttons, waterfall rows, orb live/warn/bad + pulse, eligibility ok/warn/bad/detached, detail meta. |
| `apps/web/src/main.tsx` | Modified | Full Phase 2 interactivity: 11 profile cards, 5 seeded Gujarat sites (flyTo + score), weight studio (per-factor range 0-1 step 0.01, Σ display, Normalize to 1.0, Reset, Rescore/Score-again disabled when Σ≠1 or no pin), click-to-score POST `/api/v1/scores` with `weight_overrides` when dirty+valid, orb count + eligibility pill, waterfall (wt/val/quality), constraints, provenance (`config vX · custom/default · run … · UTC`), ignition copy updated. Zero new deps. |
| `docs/architecture/data-contracts.md` | Modified | Documented new `POST /api/v1/scores` live-scoring payload with optional `weight_overrides` semantics and versioning. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `pytest` (`services/analysis`, `PYTHONPATH=.`) | Passed | 6 passed in 0.41s |
| `npm run test --workspace @geoready/api` | Passed | 4 passed (71ms) |
| `npm run typecheck --workspace @geoready/web` | Passed | Clean |
| `npm run lint --workspace @geoready/web` | Passed | Clean |
| `npm run build --workspace @geoready/web` | Passed | dist built ~4.9s; pre-existing >500kB chunk warning (maplibre ~1.2MB) |
| Browser smoke | Not run | Needs `npm run dev:api` + `npm run dev:web` + analysis service; Phase 2 visual (seeded jump, orb, studio) requires human check. |

## Assumptions, limitations, and follow-up

- Factor values still demo placeholders (.65 default) until validated layers land; `quality: demo_placeholder` remains flagged.
- Weights validated both client (Σ display, Normalize) and server (sum 1.0 ±0.0001, 422 on bad) per thin-browser standard — API never trusts client alone.
- No H3/DBSCAN/rings/export yet — Phase 4/5. Map style toggle preserves marker; GeoJSON layers not yet wired.
- H3/DBSCAN + compare + draw polygon + demo rings are next; H3 cells remain `synthetic` labeled when added.
