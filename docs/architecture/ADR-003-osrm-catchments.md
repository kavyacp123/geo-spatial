# ADR-003: OSRM Public Table API for Drive-Time Catchments (with Geodesic Fallback)

- **Status:** Accepted
- **Date:** 2026-09-19
- **Deciders:** Muse Spark agent (system-design §7 already named "OSRM adapter for demo")

## Context

PS-2 §3.5 requires drive-time isochrones and reachable population. Self-hosting
OSRM needs a Gujarat extract + preprocessing + disk + a fifth compose service —
heavy for hackathon judging. OSRM exposes no isochrone endpoint, only
`/route` and `/table`.

## Decision

- Use the **public OSRM demo server** (`https://router.project-osrm.org`, overridable
  via `OSRM_URL`, timeout via `OSRM_TIMEOUT_S`) with the **`/table` API**: sample
  84 destinations (12 bearings × 7 radii), one call, interpolate per-bearing
  crossing radii for 10/20/30 min, build polygons. Reachable population comes
  from area-weighted PostGIS demographics intersected with each ring.
- **Cache** results in-memory by rounded origin + minutes; **fallback** to labeled
  geodesic circles (`geodesic-fallback` provider, `routed: false`) on any failure.
- Every response carries `routed`, `provider`, and a human `notice`; the UI shows
  `ROUTED OSRM` vs `DEMO CATCHMENTS` and per-ring populations.

## Consequences

- Zero new services or secrets; demo-friendly rate profile (1 call per pin).
- Public-server latency (~1–9 s) needs the UI loading state (shipped).
- A self-hosted OSRM (or Valhalla `/isochrone`) can replace `OSRM_URL` with no
  contract change; Getis-Ord Gi* remains the only unimplemented stretch goal.
