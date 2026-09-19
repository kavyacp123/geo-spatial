"""Server-side H3 suitability + DBSCAN hotspots over real PostGIS layers.

Replaces the client degree-grid proxy: real h3 cells, real POI clusters, scores
blended from layer aggregates in projected metres (EPSG:32643). Pure helpers
take prefetched points so unit tests run without a database.
"""
from __future__ import annotations
import json
import math
from typing import Dict, Any, List, Optional, Tuple

from .db import get_conn, GUJARAT_STUDY_AREA_ID, ANALYSIS_SRID

# Mirrors apps/web/src/demo.ts POI_LENS — keep comp/compl/affinity in sync.
POI_LENS: Dict[str, Dict[str, Any]] = {
    "fmcg_retail": {"comp": 1.0, "compl": 0.7, "affinity": ["mall", "market"]},
    "convenience_store": {"comp": 1.0, "compl": 0.8, "affinity": ["atm", "pharmacy", "fuel"]},
    "hospital_clinic": {"comp": 0.6, "compl": 1.0, "affinity": ["hospital", "clinic", "pharmacy"]},
    "ev_charging": {"comp": 0.3, "compl": 0.9, "affinity": ["mall", "market", "college"]},
    "fuel_station": {"comp": 1.0, "compl": 0.5, "affinity": ["fuel"]},
    "warehouse_logistics": {"comp": 0.4, "compl": 0.4, "affinity": []},
    "restaurant_cafe": {"comp": 1.0, "compl": 1.0, "affinity": ["mall", "market", "college"]},
    "pharmacy": {"comp": 1.0, "compl": 0.9, "affinity": ["pharmacy", "hospital", "clinic"]},
    "bank_atm": {"comp": 0.7, "compl": 1.0, "affinity": ["bank", "atm", "mall"]},
    "telecom_tower": {"comp": 0.2, "compl": 0.5, "affinity": []},
    "solar_installation": {"comp": 0.2, "compl": 0.4, "affinity": []},
}
RELEVANT_THRESHOLD = 0.4


def poi_relevance(profile_id: str, kind: str, sub: str) -> float:
    lens = POI_LENS.get(profile_id, POI_LENS["fmcg_retail"])
    r = lens["comp"] if kind == "competitor" else lens["compl"]
    if kind != "competitor" and sub in lens["affinity"]:
        r = min(1.0, r + 0.2)
    return round(r * 100) / 100


def fetch_poi_points() -> List[Dict[str, Any]]:
    """All POI points for Gujarat: lng/lat + kind/sub/name. Small enough to hold in memory."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT ST_X(sf.geom) AS lng, ST_Y(sf.geom) AS lat,
                       COALESCE(sf.properties->>'category', sf.properties->>'kind', '') AS kind,
                       COALESCE(sf.properties->>'sub', '') AS sub,
                       COALESCE(sf.properties->>'name', sf.source_feature_id, '') AS name
                FROM spatial_feature sf
                JOIN layer_version lv ON lv.id = sf.layer_version_id
                JOIN data_layer dl ON dl.id = lv.layer_id
                WHERE dl.kind = 'poi' AND dl.study_area_id = %s
                  AND GeometryType(sf.geom) = 'POINT'
                ORDER BY lng, lat
                """,
                (GUJARAT_STUDY_AREA_ID,),
            )
            return [dict(r) for r in (cur.fetchall() or [])]


def cluster_hotspots(
    profile_id: str,
    points: Optional[List[Dict[str, Any]]] = None,
    eps_km: float = 30.0,
    min_samples: int = 2,
) -> List[Dict[str, Any]]:
    """DBSCAN (haversine) over profile-relevant POIs. Deterministic. Returns
    clusters sorted by strength desc: {lng, lat, weight, n}."""
    from sklearn.cluster import DBSCAN
    import numpy as np

    pts = points if points is not None else fetch_poi_points()
    rel = [p for p in pts if poi_relevance(profile_id, p.get("kind", ""), p.get("sub", "")) >= RELEVANT_THRESHOLD]
    if not rel:
        return []
    if len(rel) == 1:
        p = rel[0]
        return [{"lng": p["lng"], "lat": p["lat"], "weight": poi_relevance(profile_id, p.get("kind", ""), p.get("sub", "")), "n": 1}]
    coords = np.radians([[p["lat"], p["lng"]] for p in rel])  # sklearn haversine wants [lat, lng]
    labels = DBSCAN(eps=eps_km / 6371.0088, min_samples=min_samples, metric="haversine").fit_predict(coords)
    groups: Dict[int, List[int]] = {}
    noise: List[int] = []
    for i, lab in enumerate(labels):
        if int(lab) < 0:
            noise.append(i)
        else:
            groups.setdefault(int(lab), []).append(i)
    out: List[Dict[str, Any]] = []
    for idxs in groups.values():
        sw = sum(poi_relevance(profile_id, rel[i].get("kind", ""), rel[i].get("sub", "")) for i in idxs)
        sw = sw or 1.0
        cx = sum(rel[i]["lng"] * poi_relevance(profile_id, rel[i].get("kind", ""), rel[i].get("sub", "")) for i in idxs) / sw
        cy = sum(rel[i]["lat"] * poi_relevance(profile_id, rel[i].get("kind", ""), rel[i].get("sub", "")) for i in idxs) / sw
        out.append({"lng": round(cx, 5), "lat": round(cy, 5), "weight": round(sw, 2), "n": len(idxs)})
    # noise points become singleton clusters so no relevant POI disappears
    for i in noise:
        p = rel[i]
        out.append({"lng": p["lng"], "lat": p["lat"], "weight": poi_relevance(profile_id, p.get("kind", ""), p.get("sub", "")), "n": 1})
    out.sort(key=lambda c: -c["weight"])
    return out[:24]


def _study_boundary_geojson(bbox: Optional[Tuple[float, float, float, float]] = None) -> Dict[str, Any]:
    if bbox:
        minx, miny, maxx, maxy = bbox
        return {"type": "Polygon", "coordinates": [[[minx, miny], [maxx, miny], [maxx, maxy], [minx, maxy], [minx, miny]]]}
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT ST_AsGeoJSON(boundary) AS gj FROM study_area WHERE id = %s", (GUJARAT_STUDY_AREA_ID,))
            row = cur.fetchone()
            if not row or not row["gj"]:
                raise RuntimeError("Gujarat study_area boundary not seeded")
            return json.loads(row["gj"])


def h3_cell_scores(
    profile_id: str,
    weights: Dict[str, float],
    resolution: int = 5,
    bbox: Optional[Tuple[float, float, float, float]] = None,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Real h3 cells over Gujarat (or bbox) scored from layer aggregates.
    Returns (cells, meta). Each cell: {h3_index, score, cluster_type, breakdown}."""
    import h3
    from shapely.geometry import shape
    from shapely.ops import transform as shp_transform
    from pyproj import Transformer

    if resolution not in (3, 4, 5, 6, 7):
        raise ValueError("resolution must be 3..7")
    boundary = _study_boundary_geojson(bbox)
    # h3 4.1 wants LatLngPoly objects, 4.3+ also accepts GeoJSON dicts — build
    # LatLngPoly per outer ring when available so one path works on both.
    if boundary["type"] == "Polygon":
        outers = [boundary["coordinates"][0]]
    elif boundary["type"] == "MultiPolygon":
        outers = [poly[0] for poly in boundary["coordinates"]]
    else:
        raise ValueError("boundary must be Polygon/MultiPolygon")
    fill_fn = getattr(h3, "polygon_to_cells", None) or getattr(h3, "polyfill", None)
    if fill_fn is None:
        raise ImportError("h3 polyfill API not found")
    mk_poly = getattr(h3, "LatLngPoly", None)
    cells_set = set()
    for ring in outers:
        latlng = tuple((lat, lng) for lng, lat in ring)
        shape_obj = mk_poly(latlng) if mk_poly else {"type": "Polygon", "coordinates": [ring]}
        cells_set.update(fill_fn(shape_obj, resolution))
    cells = sorted(cells_set)
    if len(cells) > 2000:
        raise ValueError(f"{len(cells)} cells exceed cap 2000 — pass a bbox or coarser resolution")

    to_proj = Transformer.from_crs("EPSG:4326", f"EPSG:{ANALYSIS_SRID}", always_xy=True).transform

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT ST_AsGeoJSON(sf.geom) AS gj, sf.properties AS props, dl.kind AS kind
                   FROM spatial_feature sf JOIN layer_version lv ON lv.id = sf.layer_version_id
                   JOIN data_layer dl ON dl.id = lv.layer_id
                   WHERE dl.study_area_id = %s AND dl.kind IN ('demographics','poi','transport','land_use')""",
                (GUJARAT_STUDY_AREA_ID,),
            )
            rows = cur.fetchall() or []

    dem, pois, trans = [], [], []
    for r in rows:
        try:
            g = shp_transform(to_proj, shape(json.loads(r["gj"])))
        except Exception:
            continue
        props = r["props"] or {}
        if r["kind"] == "demographics":
            try:
                pop = float(props.get("population", 0) or 0)
            except (TypeError, ValueError):
                pop = 0.0
            dem.append((g, pop))
        elif r["kind"] == "poi":
            kind = props.get("category", props.get("kind", ""))
            sub = props.get("sub", "")
            pois.append((g, poi_relevance(profile_id, kind, sub)))
        else:
            trans.append(g)

    wd = weights.get("demand", 0.0)
    wa = max(weights.get("access", 0.0), weights.get("footfall", 0.0))
    wc = max(weights.get("competition", 0.0), weights.get("gap", 0.0))
    wsum = wd + wa + wc

    feats: List[Dict[str, Any]] = []
    for cell in cells:
        latlng = h3.cell_to_boundary(cell)  # (lat, lng) tuples
        ring = [(lng, lat) for lat, lng in latlng]
        ring.append(ring[0])
        poly_geo = {"type": "Polygon", "coordinates": [ring]}
        try:
            cell_p = shp_transform(to_proj, shape(poly_geo))
        except Exception:
            continue
        pop = sum(p for g, p in dem if g.intersects(cell_p))
        comp = sum(1 for g, _ in pois if cell_p.contains(g))
        access_d = None
        if trans:
            c = cell_p.centroid
            access_d = min(c.distance(t) for t in trans)
        feats.append({"h3_index": cell, "poly": poly_geo, "pop": pop, "comp": comp, "access_d": access_d})

    max_pop = max([f["pop"] for f in feats] + [1.0])
    max_comp = max([f["comp"] for f in feats] + [1])
    cells_out: List[Dict[str, Any]] = []
    for f in feats:
        n_d = f["pop"] / max_pop
        n_c = 1.0 - min(1.0, f["comp"] / max_comp)
        n_a = math.exp(-(f["access_d"] or 1e9) / 5000.0) if f["access_d"] is not None else 0.5
        score = round(100 * (wd * n_d + wa * n_a + wc * n_c) / wsum, 1) if wsum > 0 else 50.0
        score = max(0.0, min(100.0, score))
        cluster_type = "high" if score >= 68 else ("low" if score <= 34 else "mid")
        cells_out.append({
            "h3_index": f["h3_index"],
            "score": score,
            "cluster_type": cluster_type,
            "breakdown": {"demand_n": round(n_d, 3), "access_n": round(n_a, 3), "competition_n": round(n_c, 3)},
            "poly": f["poly"],
        })
    meta = {
        "resolution": resolution,
        "cell_count": len(cells_out),
        "algorithm": f"h3-py + shapely aggregates (EPSG:{ANALYSIS_SRID} metres)",
        "license": "synthetic-demo" if not rows else "mixed: see layer_versions",
    }
    return cells_out, meta
