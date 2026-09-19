"""Drive-time catchments via OSRM table API with an honest geodesic fallback.

Approach: sample destinations on concentric rings around the origin, fetch
durations with 1–2 OSRM /table calls (up to 100 coords each), then interpolate
per-bearing crossing radii for each target minute. On any failure (no network,
bad response, missing urllib) fall back to geodesic circles and say so.
Reachable population comes from PostGIS demographics intersected with each ring.
"""
from __future__ import annotations
import json
import math
import os
import urllib.parse
import urllib.request
from typing import Dict, Any, List, Optional, Tuple

OSRM_URL = os.getenv("OSRM_URL", "https://router.project-osrm.org")
OSRM_TIMEOUT_S = float(os.getenv("OSRM_TIMEOUT_S", "15"))
BEARINGS = 12  # 12 bearings x 7 radii = 84 destinations = 1 OSRM table call
SAMPLE_RADII_KM = [2, 5, 10, 15, 20, 30, 40]
TABLE_CHUNK = 99  # OSRM table cap is 100 coordinates per call

_CACHE: Dict[tuple, Dict[str, Any]] = {}  # (lng, lat, minutes) -> routed result; pins re-query rarely


def _dest(lng: float, lat: float, bearing_deg: float, dist_km: float) -> Tuple[float, float]:
    R = 6371.0
    brng = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lng1 = math.radians(lng)
    d = dist_km / R
    lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brng))
    lng2 = lng1 + math.atan2(math.sin(brng) * math.sin(d) * math.cos(lat1), math.cos(d) - math.sin(lat1) * math.sin(lat2))
    return (math.degrees(lng2), math.degrees(lat2))


def _circle_coords(lng: float, lat: float, radius_m: float, steps: int = 64) -> List[List[float]]:
    R = 6371000.0
    lat1 = math.radians(lat)
    lng1 = math.radians(lng)
    d = radius_m / R
    ring: List[List[float]] = []
    for i in range(steps + 1):
        brng = 2 * math.pi * i / steps
        lat2 = math.asin(math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(brng))
        lng2 = lng1 + math.atan2(math.sin(brng) * math.sin(d) * math.cos(lat1), math.cos(d) - math.sin(lat1) * math.sin(lat2))
        ring.append([math.degrees(lng2), math.degrees(lat2)])
    return ring


def fetch_durations(origin: Tuple[float, float], destinations: List[Tuple[float, float]]) -> Optional[List[Optional[float]]]:
    """OSRM /table durations (seconds) from origin to each destination. None on any failure."""
    try:
        coords = [f"{origin[0]},{origin[1]}"] + [f"{x},{y}" for x, y in destinations]
        out: List[Optional[float]] = []
        for i in range(0, len(coords), TABLE_CHUNK):
            chunk = coords[i:i + TABLE_CHUNK]
            if i > 0:
                chunk = [coords[0]] + chunk  # origin must lead every chunk (sources=0)
            url = f"{OSRM_URL}/table/v1/driving/{';'.join(chunk)}?{urllib.parse.urlencode({'annotations': 'duration', 'sources': '0'})}"
            req = urllib.request.Request(url, headers={"User-Agent": "GeoReady-Hackathon/0.1"})
            with urllib.request.urlopen(req, timeout=OSRM_TIMEOUT_S) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            if data.get("code") != "Ok" or "durations" not in data:
                return None
            out.extend(data["durations"][0][1:])  # [0] is origin→origin in every chunk
        return out
    except Exception:
        return None


def _crossing_radius(samples: List[Tuple[float, Optional[float]]], target_min: float) -> Optional[float]:
    """samples: (radius_km, duration_s|None) sorted by radius. Linear-interp crossing."""
    target = target_min * 60.0
    prev: Optional[Tuple[float, float]] = None
    for r_km, dur in samples:
        if dur is None:
            continue
        if dur >= target:
            if prev is None:
                return r_km
            (r0, d0) = prev
            if dur == d0:
                return r_km
            t = (target - d0) / (dur - d0)
            return r0 + t * (r_km - r0)
        prev = (r_km, dur)
    return None  # target beyond sampled range


def isochrone_rings(
    lng: float, lat: float, minutes: Tuple[int, ...] = (10, 20, 30)
) -> Dict[str, Any]:
    """Routed isochrones when OSRM answers, else geodesic circles. Always labeled."""
    key = (round(lng, 3), round(lat, 3), minutes)
    if key in _CACHE:
        return _CACHE[key]
    dests: List[Tuple[float, Tuple[float, float]]] = []  # (bearing, coord)
    for b in range(BEARINGS):
        bearing = b * 360.0 / BEARINGS
        for r in SAMPLE_RADII_KM:
            dests.append((bearing, _dest(lng, lat, bearing, r)))
    durations = fetch_durations((lng, lat), [c for _, c in dests])
    rings: List[Dict[str, Any]] = []
    if durations is not None and len(durations) == len(dests):
        # per bearing, samples sorted by radius (SAMPLE_RADII_KM ascending by construction)
        by_bearing: Dict[float, List[Tuple[float, Optional[float]]]] = {}
        for (bearing, _), dur in zip(dests, durations):
            # radius lookup: index within bearing group
            by_bearing.setdefault(bearing, []).append(dur)
        for m in minutes:
            poly: List[List[float]] = []
            ok = True
            for b in range(BEARINGS):
                bearing = b * 360.0 / BEARINGS
                durs = by_bearing.get(bearing, [])
                samples = list(zip(SAMPLE_RADII_KM[: len(durs)], durs))
                r_km = _crossing_radius(samples, m)
                if r_km is None:
                    ok = False
                    break
                poly.append(list(_dest(lng, lat, bearing, r_km)))
            if ok and poly:
                poly.append(poly[0])
                rings.append({"minutes": m, "polygon": poly, "routed": True})
        if rings:
            res = {
                "rings": rings,
                "routed": all(r["routed"] for r in rings),
                "provider": "osrm",
                "notice": "Routed isochrones via OSRM table API (driving).",
            }
            _CACHE[key] = res
            return res
    # fallback: geodesic circles at ~40 km/h drive proxy (matches web ISO_CFG 667 m/min)
    fb = [
        {"minutes": m, "polygon": _circle_coords(lng, lat, 667 * m), "routed": False}
        for m in minutes
    ]
    return {
        "rings": fb,
        "routed": False,
        "provider": "geodesic-fallback",
        "notice": "DEMO CATCHMENT — OSRM unreachable; geodesic circles at ~40 km/h, not routed.",
    }


def reachable_population(ring_polygon: List[List[float]]) -> Optional[float]:
    """Area-weighted demographics population inside a ring polygon (wards are
    larger than catchments, so strict containment would wrongly sum 0). None when DB is down."""
    try:
        from .db import get_conn, GUJARAT_STUDY_AREA_ID, ANALYSIS_SRID
        ring_wkt = "POLYGON((" + ", ".join(f"{x} {y}" for x, y in ring_polygon) + "))"
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT COALESCE(SUM((sf.properties->>'population')::double precision *
                         (ST_Area(ST_Intersection(ST_Transform(sf.geom,%s), ST_Transform(ST_GeomFromText(%s,4326),%s)))
                          / NULLIF(ST_Area(ST_Transform(sf.geom,%s)),0))),0) AS s
                       FROM spatial_feature sf JOIN layer_version lv ON lv.id = sf.layer_version_id
                       JOIN data_layer dl ON dl.id = lv.layer_id
                       WHERE dl.kind='demographics' AND dl.study_area_id=%s
                         AND ST_Intersects(sf.geom, ST_GeomFromText(%s,4326))""",
                    (ANALYSIS_SRID, ring_wkt, ANALYSIS_SRID, ANALYSIS_SRID, GUJARAT_STUDY_AREA_ID, ring_wkt),
                )
                row = cur.fetchone()
                return float(row["s"] or 0) if row else 0.0
    except Exception:
        return None
