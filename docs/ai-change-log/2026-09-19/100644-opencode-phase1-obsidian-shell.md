# AI Change Record — Phase 1 Obsidian Atlas shell + OSM basemap

- **UTC timestamp:** `2026-09-19T10:06:44Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `Start the phase 1` — Obsidian Atlas dark rehash, Gujarat 11-profile explorer boot, labeled demo rings, full rewrite (Phase 1: tokens + shell + OSM basemap).
- **Intent:** Replace the minimal light sidebar + demotiles map with the breathtaking Obsidian Atlas foundation: dark cinematic shell, token-free basemap toggle (Carto dark / OSM raster) with attribution, ignition overlay, mission rail, score-observatory placeholder, provenance strip — zero new dependencies.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `apps/web/src/styles.css` | Modified | Full rewrite: Obsidian tokens (`--bg`, `--jade/gold/ember/indigo`), command bar / mission rail / map / observatory / legend / provenance / ignition styles, focus states, reduced-motion guard, responsive breakpoints. |
| `apps/web/src/main.tsx` | Modified | Full rewrite: atlas shell (command bar + mission rail + map + observatory + provenance), Carto dark default with OSM raster toggle via `map.setStyle`, `attributionControl: compact`, click-to-drop candidate marker, profile cards + factor bars from `GET /site-types`, `?profile=` URL sync, ignition overlay with `flyTo` entry, loading/error states. |
| `apps/web/index.html` | Modified | Proper document skeleton: title, meta, theme-color, progressive webfonts (Inter + Space Grotesk with system fallback for offline judging). |
| `docs/product/map-experience.md` | Modified | Basemap policy: Carto dark default + OSM raster toggle, attribution requirement, demotiles retired, no map token needed. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck --workspace @geoready/web` | Passed | Clean, strict TS. |
| `npm run lint --workspace @geoready/web` | Passed | Clean eslint. |
| `npm run build --workspace @geoready/web` | Passed | `dist/` built in ~13s; pre-existing >500kB chunk warning (maplibre-gl ~1.2MB), not introduced here. |
| `npm run test --workspace @geoready/web` | Not run | No test files exist in `apps/web` (`vitest run` exits 1 with "No test files found"); pre-existing condition, unchanged. |
| Browser smoke | Not run | No headless browser in this environment; needs human `npm run dev:web` visual check (map renders, toggle switches, pin drops). |

## Assumptions, limitations, and follow-up

- Scoring UI is a labeled placeholder (`DEMO · AWAITING VALIDATED LAYERS`); no client-side scoring added, per thin-browser standard. Real orb + waterfall land in Phase 3.
- H3 / DBSCAN / rings / compare / export are legend/steps placeholders only; Phases 4–6.
- Python kernel still serves only 3 of 11 profiles (known mismatch) — Phase 2 extends it so all explorer cards score.
- Fonts fall back to system stack offline; acceptable for judging.
- Next decision: Phase 2 (mission rail weight studio + 11-profile kernel fix) — say the word.
