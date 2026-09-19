"""Factor queries — updated to return layer_version_id provenance correctly."""
from __future__ import annotations
from typing import Tuple, Optional, Dict, Any
from .db import get_conn, GUJARAT_STUDY_AREA_ID, ANALYSIS_SRID

CATCHMENT_M = {10: 667 * 10, 20: 667 * 20, 30: 667 * 30}
DEFAULT_CATCHMENT_M = CATCHMENT_M[20]

def _lv_for_kind(kind: str) -> Optional[str]:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT lv.id::text as id FROM data_layer dl JOIN layer_version lv ON lv.layer_id=dl.id WHERE dl.kind=%s AND dl.study_area_id=%s ORDER BY lv.version DESC LIMIT 1", (kind, GUJARAT_STUDY_AREA_ID))
                row = cur.fetchone()
                return row["id"] if row and row["id"] else None
    except Exception:
        return None

def _nearest_distance_m(lng: float, lat: float, layer_kind: str) -> Optional[Tuple[float, Optional[str]]]:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                      MIN(ST_Distance(
                        ST_Transform(ST_SetSRID(ST_MakePoint(%s,%s),4326), %s),
                        ST_Transform(sf.geom, %s)
                      )) AS d_m
                    FROM spatial_feature sf
                    JOIN layer_version lv ON lv.id = sf.layer_version_id
                    JOIN data_layer dl ON dl.id = lv.layer_id
                    WHERE dl.kind = %s AND dl.study_area_id = %s
                    """,
                    (lng, lat, ANALYSIS_SRID, ANALYSIS_SRID, layer_kind, GUJARAT_STUDY_AREA_ID),
                )
                row = cur.fetchone()
                if not row or row["d_m"] is None:
                    return None
                lv = _lv_for_kind(layer_kind)
                return float(row["d_m"]), lv
    except Exception:
        return None

def _count_within_m(lng: float, lat: float, layer_kind: str, radius_m: int, extra_where: str = "") -> Optional[Tuple[int, Optional[str]]]:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT COUNT(*) AS c
                    FROM spatial_feature sf
                    JOIN layer_version lv ON lv.id = sf.layer_version_id
                    JOIN data_layer dl ON dl.id = lv.layer_id
                    WHERE dl.kind = %s AND dl.study_area_id = %s
                      AND ST_DWithin(
                        ST_Transform(ST_SetSRID(ST_MakePoint(%s,%s),4326), %s),
                        ST_Transform(sf.geom, %s),
                        %s
                      )
                      {extra_where}
                    """,
                    (layer_kind, GUJARAT_STUDY_AREA_ID, lng, lat, ANALYSIS_SRID, ANALYSIS_SRID, radius_m),
                )
                row = cur.fetchone()
                if not row:
                    return None
                lv = _lv_for_kind(layer_kind)
                return int(row["c"]), lv
    except Exception:
        return None

def _sum_within_m(lng: float, lat: float, layer_kind: str, radius_m: int, prop_key: str) -> Optional[Tuple[float, Optional[str]]]:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COALESCE(SUM((sf.properties->>%s)::double precision),0) AS s
                    FROM spatial_feature sf
                    JOIN layer_version lv ON lv.id = sf.layer_version_id
                    JOIN data_layer dl ON dl.id = lv.layer_id
                    WHERE dl.kind = %s AND dl.study_area_id = %s
                      AND ST_DWithin(
                        ST_Transform(ST_SetSRID(ST_MakePoint(%s,%s),4326), %s),
                        ST_Transform(sf.geom, %s),
                        %s
                      )
                    """,
                    (prop_key, layer_kind, GUJARAT_STUDY_AREA_ID, lng, lat, ANALYSIS_SRID, ANALYSIS_SRID, radius_m),
                )
                row = cur.fetchone()
                if not row:
                    return None
                lv = _lv_for_kind(layer_kind)
                return float(row["s"] or 0), lv
    except Exception:
        return None

def _point_in_polygon(lng: float, lat: float, layer_kind: str) -> Optional[Tuple[bool, Optional[str], Dict[str, Any]]]:
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT sf.properties AS props
                    FROM spatial_feature sf
                    JOIN layer_version lv ON lv.id = sf.layer_version_id
                    JOIN data_layer dl ON dl.id = lv.layer_id
                    WHERE dl.kind = %s AND dl.study_area_id = %s
                      AND ST_Within(ST_SetSRID(ST_MakePoint(%s,%s),4326), sf.geom)
                    LIMIT 1
                    """,
                    (layer_kind, GUJARAT_STUDY_AREA_ID, lng, lat),
                )
                row = cur.fetchone()
                if not row:
                    return None
                lv = _lv_for_kind(layer_kind)
                return True, lv, row["props"] or {}
    except Exception:
        return None

def demand_factor(lng: float, lat: float, radius_m: int = DEFAULT_CATCHMENT_M):
    res = _sum_within_m(lng, lat, "demographics", radius_m, "population")
    if not res:
        return None
    total, lv = res
    max_pop = 500_000
    n = max(0.0, min(1.0, total / max_pop))
    return {"raw": total, "norm": n, "unit": "people", "lv": lv, "method": "population polygon overlap within catchment (metres, 32643)"}

def access_factor(lng: float, lat: float):
    d_res = _nearest_distance_m(lng, lat, "transport")
    if d_res is None:
        return None
    d, lv = d_res
    scale = 750; max_d = 5000
    n = 0.0 if d > max_d else pow(2.718281828, -d / scale)
    cnt = _count_within_m(lng, lat, "transport", DEFAULT_CATCHMENT_M)
    density_bonus = min(0.2, (cnt[0] if cnt else 0) * 0.02) if cnt else 0
    n = min(1.0, n + density_bonus)
    return {"raw": d, "norm": n, "unit": "m", "lv": lv, "method": "nearest major road distance decay (m, exp -d/750) + density"}

def competition_factor(lng: float, lat: float, radius_m: int = DEFAULT_CATCHMENT_M):
    res = _count_within_m(lng, lat, "poi", radius_m, " AND (sf.properties->>'category' = 'competitor' OR sf.properties->>'kind'='competitor')")
    if not res:
        return None
    c, lv = res
    max_c = 12
    n = 1.0 - min(1.0, c / max_c)
    return {"raw": c, "norm": n, "unit": "competitors", "lv": lv, "method": "competitor count inverse within catchment"}

def footfall_factor(lng: float, lat: float, radius_m: int = DEFAULT_CATCHMENT_M):
    res = _count_within_m(lng, lat, "transport", radius_m)
    if res is None:
        return None
    cnt, lv = res
    poi = _count_within_m(lng, lat, "poi", radius_m, " AND (sf.properties->>'category'='complementary' OR sf.properties->>'kind'='complementary')")
    total = cnt + (poi[0] if poi else 0)
    max_f = 20
    n = min(1.0, total / max_f)
    return {"raw": total, "norm": n, "unit": "stops_and_pois", "lv": lv, "method": "transit stops + complementary POIs within catchment"}

def zoning_factor(lng: float, lat: float):
    hit = _point_in_polygon(lng, lat, "land_use")
    if not hit:
        lv = _lv_for_kind("land_use")
        return {"raw": 0.5, "norm": 0.5, "unit": "zoning_fit", "lv": lv, "method": "no zoning polygon — neutral 0.5"}
    _, lv, props = hit
    zoning = (props.get("zoning") or props.get("class") or "").lower()
    mapping = {"commercial": 1.0, "mixed": 0.7, "industrial": 0.6, "residential": 0.3, "restricted": 0.0}
    n = mapping.get(zoning, 0.5)
    return {"raw": n, "norm": n, "unit": "zoning_fit", "lv": lv, "method": f"zoning={zoning or 'unknown'}"}

def parcel_factor(lng: float, lat: float):
    hit = _point_in_polygon(lng, lat, "land_use")
    if not hit:
        lv = _lv_for_kind("land_use")
        return {"raw": 0.5, "norm": 0.5, "unit": "parcel_suitability", "lv": lv, "method": "no parcel — neutral"}
    _, lv, props = hit
    area = float(props.get("parcel_area_m2") or props.get("area_m2") or 0) or 0
    n = min(1.0, area / 5000) if area else 0.5
    return {"raw": area, "norm": n, "unit": "m2", "lv": lv, "method": "parcel area_m2 within land-use polygon (32643)"}

def risk_factor(lng: float, lat: float):
    hit = _point_in_polygon(lng, lat, "environmental_risk")
    if hit:
        _, lv, _ = hit
        return {"raw": 0, "norm": 0.0, "unit": "risk_index", "lv": lv, "method": "inside flood/risk polygon — capped/warn", "blocked": True}
    d_res = _nearest_distance_m(lng, lat, "environmental_risk")
    if d_res is None:
        lv = _lv_for_kind("environmental_risk")
        return {"raw": 1, "norm": 1.0, "unit": "risk_index", "lv": lv, "method": "no risk layers"}
    d, lv = d_res
    n = min(1.0, d / 3000)
    return {"raw": d, "norm": n, "unit": "m", "lv": lv, "method": "distance to nearest risk polygon"}

def utility_factor(lng: float, lat: float):
    d_res = _nearest_distance_m(lng, lat, "utilities")
    if d_res is None:
        d_res = _nearest_distance_m(lng, lat, "poi")
        if d_res is None:
            lv = _lv_for_kind("utilities")
            return {"raw": 0.5, "norm": 0.5, "unit": "utility_readiness", "lv": lv, "method": "no utility — neutral"}
    d, lv = d_res
    n = 0.0 if d is None else (1.0 if d < 500 else max(0, 1 - (d - 500) / 5000))
    return {"raw": d or 0, "norm": n, "unit": "m", "lv": lv or _lv_for_kind("utilities"), "method": "nearest utility distance decay"}

def gap_factor(lng: float, lat: float, radius_m: int = DEFAULT_CATCHMENT_M):
    comp = competition_factor(lng, lat, radius_m)
    if not comp:
        return None
    return {"raw": comp["raw"], "norm": comp["norm"], "unit": "gap_index", "lv": comp["lv"], "method": "coverage gap = competitor gap"}

FACTOR_FUNCS = {
    "demand": demand_factor,
    "access": access_factor,
    "competition": competition_factor,
    "zoning": zoning_factor,
    "risk": risk_factor,
    "utility": utility_factor,
    "footfall": footfall_factor,
    "parcel": parcel_factor,
    "gap": gap_factor,
}
