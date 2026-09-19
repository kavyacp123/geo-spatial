# AI Change Record — Dual theme (Paper + Obsidian), retractable shell, minimizable weights, smooth polish

- **UTC timestamp:** `2026-09-19T11:42:58Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `Make it dual, keep the current one as is but make the light one as well which would be clean and sleek as well as amazing. Also i dont get why we have a drop down in the top right when we can select from left sidebar (could you make the sidebar and all the things retractable?) Keep weights as is for now minimizable if possible. smooth throughout for now. all 5 seeds + current defaults for now please.` + follow-ups about blocky/choppy/obsidian clutter.
- **Intent:** Keep Obsidian as the dark cinematic default for stage impact, but add a clean Paper light alternative that feels editorial not AI-generated; remove duplicated header dropdown, make the shell breathe via retractable rails, make Weight studio collapsible while preserving defaults/Σ guard, and make every interaction feel smooth (count-up, stagger, hover lift, panel easing) without choppiness.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `apps/web/src/styles.css` | Modified | Dual-tokens: `:root` Obsidian + `[data-theme='light']` Paper (`#f8f5ef` paper, `#14201d` ink, softer shadow, muted jade/gold/ember, `teal-dim` neutralized), motion tokens `--ease/--dur-*`/`--shadow`, `body`/`.atlas`/`.commandbar`/`.rail`/`.profile-card`/`.btn`/`.seeded`/`.layer-row`/`.note`/`.waterfall-row`/`.compare-*`/`.provenance`/`.ignition`/`.map-wrap` now transition on theme (280ms ease), hover lift (`translateY -1px`) + press shrink (`scale 0.97`), retractable rail styles (`.rail{width 302/344, flex-shrink, transition width/opacity/transform/padding}` + `.rail.collapsed{width:0,opacity:0,translateX±8px}`, `.atlas-main` flex for smooth collapse, mobile `.collapsed{display:none}`), weight collapse (`.studio-wrap{max-height 1200→0, opacity}` + `.studio-toggle` with `chev` rotate), print + responsive flex fixes. |
| `apps/web/src/main.tsx` | Modified | `LIGHT_STYLE` positron URL + `useCountUp(target,900)` rAF cubic hook; states `theme` (localStorage `geoready-theme`, dark default), `leftCollapsed/rightCollapsed/weightsOpen`, refs for staleness fix kept; `document.documentElement[data-theme]` + localStorage persist effect; `initStyle` + `basemap+theme` effect now picks Positron when `theme=light && basemap=dark` (so Paper UI gets a light map, not a jarring dark one); header: `data-theme={theme}` on `.atlas`, brand + scope badge now theme-aware (`Paper Atlas` label when light), left/right `rail-toggle` buttons in header (←/→), removed duplicated `.profile-pick` `<select>` — header now shows read-only pill of active `profile.label` while left rail cards remain the single selector, added `theme-toggle` (☀ Light / ◐ Obsidian) next to basemap segmented control; `atlas-main` still flex, rails get `collapsed` class + `aria-hidden`; weight studio header became `button.studio-toggle[aria-expanded]` + `div#studio-panel.studio-wrap.collapsed` wrapping the existing `.studio` (defaults/Σ guard unchanged); orb now shows `animatedScore.toFixed(1)` via count-up (smooth 900ms) instead of instant swap; waterfall rows now `style={{transitionDelay: i*70ms}}` for stagger; emojis trimmed (📌/🖨/◈ → plain text) for less AI-look; seeded/map-layer defaults and layer toggles unchanged (5 seeds + current layer defaults kept). |
| `docs/product/map-experience.md` | Modified | Added §Theme duality & shell polish (Paper + Obsidian, retractable, smooth): theme tokens, map style switching, header toggle persistence, animation system, retractable flex shell, header dropdown removal (pill + rail), minimizable weight disclosure with Σ guard. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| `npm run typecheck --workspace @geoready/web` | Passed |  |
| `npm run lint --workspace @geoready/web` | Passed | Fixed empty `catch{}` (`void 0`) vs `no-empty` |
| `npm run build --workspace @geoready/web` | Passed | 94.5 kB CSS / 1.25 MB JS, ~5s, pre-existing >500kB chunk warning |
| `pytest` / API tests | Not run — web-only change |  |

## Assumptions, limitations, and follow-up

- Paper uses Carto Positron (`/gl/positron-gl-style/style.json`) token-free; dark uses Carto dark-matter. Both carry OSM/CARTO attribution. If Carto is unreachable, the OSM raster toggle is the fallback.
- Retractable rails use `flex` + `width` transition for smoothness; on ≤900px they switch to `display:none` when collapsed to avoid an empty column. No layout shift on toggle due to `transform` + `opacity` easing.
- Header dropdown removal keeps deep-linking via `?profile=` and `profile.label` pill for context; a11y focus stays on rail cards (`aria-pressed`).
- Weight studio defaults/5 seeds/6 layer toggles + opacity kept exactly as Phase 5 polish — minimizable via disclosure rather than hidden.
