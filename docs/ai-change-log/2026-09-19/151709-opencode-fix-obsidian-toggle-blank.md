# AI Change Record — Fix obsidian basemap lost on light→dark toggle (style-swap guard)

- **UTC timestamp:** `2026-09-19T15:17:09Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `once i go to light mode then i return to obsidian, the obsidian is gone. I then have to refresh the page in order to see the obsidian`
- **Intent:** Make theme/basemap swaps deterministic: no redundant style reloads, full layer re-sync after every swap. No new features.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `apps/web/src/main.tsx` | Modified | `styleKeyOf()` + `styleKeyRef`: the sync effect now skips `setStyle` when the requested style is already showing (previously it re-fired on mount, aborting the initial load mid-flight, and on every redundant render path). `setStyle` now passes `{ diff: false }` — verified in the installed maplibre-gl source that diffing defaults on, and cross-basemap diffs tear down custom layers mid-update, the blank-canvas hazard behind this report; the `styledata` handler re-adds everything after a clean reload. Visibility/opacity sync effect deps gained `theme` + `mapTick` so user toggles re-apply after each swap (previously only `basemap`: layers silently snapped back to defaults). Verified in the same source that layout/paint setters early-return on equal values and don't emit `styledata`, so no render loop. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck --workspace @geoready/web` | Passed |  |
| `npm run lint --workspace @geoready/web` | Passed |  |
| `npm run build --workspace @geoready/web` | Passed | ~5 s, pre-existing chunk warning only |
| `npm run test --workspace @geoready/web` | Passed | 12 passed |
| Both CARTO style URLs probed | Passed | dark-matter 200 (70 KB), positron 200 (107 KB) — not a network/URL issue |
| Browser toggle repro | Not run | No browser here — please verify: dark → light → dark keeps the dark tiles with zero refresh, toggles (e.g. land_use off) survive the round trip |

## Assumptions, limitations, and follow-up

- Root cause stated as mechanism class (redundant/aborted reloads + diff-across-styles + lost toggle sync), verified against the installed maplibre-gl source; the exact user-visible blank canvas could not be reproduced headlessly.
- If the blank canvas ever recurs, the next step is a style-error listener with a one-shot retry affordance — deliberately not added (no evidence it is needed, avoids retry-loop risk).
