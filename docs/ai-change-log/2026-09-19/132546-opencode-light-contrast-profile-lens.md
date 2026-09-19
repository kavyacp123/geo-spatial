# AI Change Record — Light-mode contrast fixes + profile-aware POIs and derived hotspots

- **UTC timestamp:** `2026-09-19T13:25:46Z`
- **Agent/tool:** `opencode / muse-spark`
- **Prompt summary:** `fix the ui like words not showing and stuff for the light mode and the obsidians should be correctly representing the interest points and the circle points should change when changing objects for location as in to find the best locations for that object/product`
- **Intent:** (1) Fix Paper-theme illegible text from hardcoded dark surfaces; (2) make hotspot ember circles actually represent interest points by deriving them from POI clusters; (3) make POIs + hotspot circles regroup per selected product so the map hunts best locations for that product.

## Changes

| Path | Action | Summary |
| --- | --- | --- |
| `apps/web/src/styles.css` | Modified | Light-contrast fixes, all token-driven: `.catch-row` paper card (was dark `#0f1e2a` w/ invisible ink text), `.orb` + `.orb.live/warn/bad` paper radial backgrounds (was dark hole hiding the count-up number), `.eligibility` base light pill, `.skeleton` paper shimmer, dark range tracks → `#e8e4dc/#e0d9cc` (factor bar, weight + layer sliders; waterfall already had it), `.legend button:hover` dark-ink tint for light. |
| `apps/web/src/demo.ts` | Modified | Named/sub-typed master `POI_POINTS` (6 rivals + 12 anchors: hospital, school, fuel, atm, mall, clinic, bank, pharmacy, college, market); `POI_LENS` per-product relevance (competitor/complementary weights + affinity subs + legend blurb); `poiRelevance()` capped `[0,1]`; `poiForProfile()` stamps `relevance`; `hotspotsForProfile()` greedy deterministic haversine clustering (30 km, threshold 0.4, relevance-weighted centroid + strength, top 8). Verified via esbuild eval: 11/11 distinct patterns, deterministic, never empty. Kept `HOTSPOTS_DEMO`/`RAW_DEMO` exports (initial paint + compat). |
| `apps/web/src/main.tsx` | Modified | Import new lens fns; hotspot + `raw-poi` sources init from `initialProfile()`; halo radius interpolates on `weight`, POI radius/opacity interpolate on `relevance` (opacity expression multiplied by user slider in sync effect, so toggles still scale); `mapReady`/`mapTick` states + `[id, mapReady, mapTick]` refresh effect re-`setData`s both sources on product change, map load, and basemap switch (no stale closures); `lensInfo` memo drives legend (`Hotspots · N clusters` + `M of 18 POIs matter for {product} — {blurb}`). Seeded sites, H3, weights, exports untouched. |
| `docs/product/map-experience.md` | Modified | New `## Profile lens` section documenting relevance model, derived clustering, legend counts, refresh triggers. |

## Validation

| Check | Result | Notes |
| --- | --- | --- |
| esbuild eval of `demo.ts` clustering | Passed | 11/11 distinct per-product patterns (e.g. retail `[4.1,4,…]` vs warehouse `[2,2,…]` vs telecom 5 clusters); deterministic repeat identical |
| `npm run typecheck --workspace @geoready/web` | Passed |  |
| `npm run lint --workspace @geoready/web` | Passed |  |
| `npm run build --workspace @geoready/web` | Passed | ~12s, pre-existing >500kB chunk warning only |
| `pytest` (`services/analysis`) | Passed | 9 passed — no backend change |
| Browser smoke | Not run | Needs `dev:web`: toggle Paper theme (catchment rows/orb/eligibility legible), switch product retail→warehouse→telecom (halos resize/regroup, POIs dim, legend counts update), basemap switch keeps lens |

## Assumptions, limitations, and follow-up

- Still synthetic demo (`license: synthetic-demo` everywhere); real PostGIS POIs (`GET .../features`) replace `POI_POINTS` without changing the lens/cluster contract — lens then applies to real `category/sub` props.
- H3 honeycomb intentionally stays product-agnostic (overall suitability); the lens lives on POIs + hotspot circles per the request.
- Iso-label halo stays dark on both themes (readable over either basemap); revisit only if muddy on Positron.
