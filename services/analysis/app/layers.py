from __future__ import annotations
import json
import uuid
from typing import Optional, Literal, List, Dict, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from shapely import wkt as shapely_wkt
from shapely.geometry import shape, mapping
from shapely.validation import make_valid

from .db import get_conn, GUJARAT_STUDY_AREA_ID

router = APIRouter(prefix="/api/v1/layers", tags=["layers"])

VALID_KINDS = {"demographics","transport","poi","land_use","environmental_risk","utilities"}

class CreateLayerJSON(BaseModel):
    kind: str
    name: str = Field(min_length=1, max_length=120)
    source_name: str = Field(min_length=1)
    source_license: str = Field(default="synthetic-demo")
    source_crs: str = Field(default="EPSG:4326")
    geojson: Optional[Dict[str,Any]] = None
    wkt: Optional[str] = None

def _validate_kind(k: str):
    if k not in VALID_KINDS:
        raise HTTPException(400, f"kind must be one of {sorted(VALID_KINDS)}")

def _ensure_study_area(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT id FROM study_area WHERE id=%s", (GUJARAT_STUDY_AREA_ID,))
        if cur.fetchone() is None:
            raise HTTPException(500, "Gujarat study_area not seeded — run 002-demo-gujarat.sql")

@router.post("")
def create_layer(payload: CreateLayerJSON):
    _validate_kind(payload.kind)
    if not payload.geojson and not payload.wkt:
        raise HTTPException(400, "Provide geojson or wkt")
    if payload.geojson and payload.wkt:
        raise HTTPException(400, "Provide only one of geojson or wkt")
    # parse geometries
    features: List[Dict[str,Any]] = []
    if payload.geojson:
        gj = payload.geojson
        if gj.get("type") == "FeatureCollection":
            for f in gj.get("features", []):
                geom = f.get("geometry")
                if not geom: continue
                try:
                    shp = shape(geom)
                    if not shp.is_valid:
                        shp = make_valid(shp)
                    if shp.is_empty:
                        raise ValueError("empty geometry")
                    # crude Gujarat bbox check
                    minx, miny, maxx, maxy = shp.bounds
                    if not (68 <= minx <= 75 and 68 <= maxx <= 75 and 19 <= miny <= 25 and 19 <= maxy <= 25):
                        raise HTTPException(422, "geometry outside Gujarat bbox")
                    features.append({"geom": shp, "props": f.get("properties") or {}})
                except HTTPException:
                    raise
                except Exception as e:
                    raise HTTPException(422, f"invalid GeoJSON geometry: {e}")
        elif gj.get("type") == "Feature":
            geom = gj.get("geometry")
            shp = shape(geom)
            if not shp.is_valid: shp = make_valid(shp)
            features.append({"geom": shp, "props": gj.get("properties") or {}})
        else:
            # bare geometry
            shp = shape(gj)
            if not shp.is_valid: shp = make_valid(shp)
            features.append({"geom": shp, "props": {}})
    else:
        # wkt
        try:
            shp = shapely_wkt.loads(payload.wkt)
            if not shp.is_valid: shp = make_valid(shp)
            features.append({"geom": shp, "props": {}})
        except Exception as e:
            raise HTTPException(422, f"invalid WKT: {e}")

    # store
    layer_id = str(uuid.uuid4())
    lv_id = str(uuid.uuid4())
    try:
        with get_conn() as conn:
            _ensure_study_area(conn)
            with conn.cursor() as cur:
                cur.execute("INSERT INTO data_layer (id, study_area_id, kind, name, status) VALUES (%s,%s,%s,%s,'ready')", (layer_id, GUJARAT_STUDY_AREA_ID, payload.kind, payload.name))
                cur.execute("INSERT INTO layer_version (id, layer_id, version, source_name, source_license, source_crs, normalized_crs, quality_report) VALUES (%s,%s,1,%s,%s,%s,'EPSG:4326', %s)", (lv_id, layer_id, payload.source_name, payload.source_license, payload.source_crs, json.dumps({"status":"passed","features": len(features)})))
                for idx, feat in enumerate(features):
                    shp = feat["geom"]
                    wkt_str = shp.wkt
                    cur.execute("INSERT INTO spatial_feature (id, layer_version_id, source_feature_id, properties, geom) VALUES (gen_random_uuid(), %s, %s, %s, ST_GeomFromText(%s,4326))", (lv_id, str(idx), json.dumps(feat["props"]), wkt_str))
                # return manifest
                cur.execute("SELECT ST_AsGeoJSON(boundary) as gj FROM study_area WHERE id=%s", (GUJARAT_STUDY_AREA_ID,))
                return {"layer_id": layer_id, "layer_version_id": lv_id, "kind": payload.kind, "version": 1, "feature_count": len(features), "status": "ready"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"DB error: {e}")

@router.get("")
def list_layers():
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT dl.id, dl.kind, dl.name, dl.status,
                           lv.id as lv_id, lv.version, lv.source_name, lv.source_license, lv.source_crs, lv.quality_report,
                           (SELECT COUNT(*) FROM spatial_feature sf WHERE sf.layer_version_id = lv.id) as feature_count,
                           ST_AsGeoJSON(ST_Envelope(ST_Collect(sf.geom))) as extent
                    FROM data_layer dl
                    LEFT JOIN layer_version lv ON lv.layer_id = dl.id AND lv.version = (SELECT MAX(version) FROM layer_version WHERE layer_id=dl.id)
                    LEFT JOIN spatial_feature sf ON sf.layer_version_id = lv.id
                    WHERE dl.study_area_id = %s
                    GROUP BY dl.id, lv.id
                    ORDER BY dl.kind
                """, (GUJARAT_STUDY_AREA_ID,))
                rows = cur.fetchall()
                return {"data": rows}
    except Exception as e:
        raise HTTPException(500, str(e))

@router.get("/{layer_id}/versions/{version}")
def get_version(layer_id: str, version: int):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM layer_version WHERE layer_id=%s AND version=%s", (layer_id, version))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(404, "layer version not found")
                cur.execute("SELECT COUNT(*) as c FROM spatial_feature WHERE layer_version_id=%s", (row["id"],))
                cnt = cur.fetchone()
                row["feature_count"] = cnt["c"] if cnt else 0
                return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))

@router.post("/upload")
async def upload_layer(
    kind: str = Form(...),
    name: str = Form(...),
    source_name: str = Form(...),
    source_license: str = Form("synthetic-demo"),
    file: UploadFile = File(...),
):
    _validate_kind(kind)
    fname = (file.filename or "").lower()
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "file too large (25MB limit)")
    # GeoTIFF path
    if fname.endswith((".tif",".tiff",".geotiff")):
        try:
            import rasterio  # type: ignore
            import tempfile, os
            with tempfile.NamedTemporaryFile(suffix=".tif", delete=False) as tmp:
                tmp.write(data)
                tmp.flush()
                path = tmp.name
            try:
                with rasterio.open(path) as src:
                    bounds = src.bounds
                    crs = src.crs.to_string() if src.crs else "EPSG:4326"
                    # create a single polygon feature for raster extent
                    wkt_str = f"POLYGON(({bounds.left} {bounds.bottom}, {bounds.right} {bounds.bottom}, {bounds.right} {bounds.top}, {bounds.left} {bounds.top}, {bounds.left} {bounds.bottom}))"
                    # store as one feature
                    layer_id = str(uuid.uuid4()); lv_id = str(uuid.uuid4())
                    with get_conn() as conn:
                        _ensure_study_area(conn)
                        with conn.cursor() as cur:
                            cur.execute("INSERT INTO data_layer (id, study_area_id, kind, name, status) VALUES (%s,%s,%s,%s,'ready')", (layer_id, GUJARAT_STUDY_AREA_ID, kind, name))
                            cur.execute("INSERT INTO layer_version (id, layer_id, version, source_name, source_license, source_crs, normalized_crs, quality_report) VALUES (%s,%s,1,%s,%s,%s,'EPSG:4326', %s)", (lv_id, layer_id, source_name, source_license, crs, json.dumps({"status":"passed","raster": {"width": src.width, "height": src.height, "bounds": [bounds.left, bounds.bottom, bounds.right, bounds.top]}})))
                            cur.execute("INSERT INTO spatial_feature (id, layer_version_id, properties, geom) VALUES (gen_random_uuid(), %s, %s, ST_GeomFromText(%s,4326))", (lv_id, json.dumps({"raster_width": src.width, "raster_height": src.height}), wkt_str))
                    return {"layer_id": layer_id, "layer_version_id": lv_id, "kind": kind, "version": 1, "feature_count": 1, "note": "GeoTIFF ingested via rasterio — extent polygon stored"}
            finally:
                try: os.unlink(path)
                except: pass
        except ImportError:
            raise HTTPException(501, "GeoTIFF support requires rasterio (install GDAL)")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(422, f"GeoTIFF parse failed: {e}")
    # Shapefile zip
    if fname.endswith(".zip"):
        try:
            import fiona  # type: ignore
            import tempfile, zipfile, os, glob
            with tempfile.TemporaryDirectory() as tmpdir:
                zpath = os.path.join(tmpdir, "upload.zip")
                with open(zpath, "wb") as f: f.write(data)
                with zipfile.ZipFile(zpath) as z: z.extractall(tmpdir)
                shps = glob.glob(os.path.join(tmpdir, "**", "*.shp"), recursive=True)
                if not shps:
                    raise HTTPException(422, "zip contains no .shp")
                shp_path = shps[0]
                feats = []
                with fiona.open(shp_path) as src:
                    src_crs = src.crs.to_string() if src.crs else "EPSG:4326"
                    for feat in src:
                        geom = shape(feat["geometry"])
                        if not geom.is_valid: geom = make_valid(geom)
                        feats.append({"geom": geom, "props": feat["properties"] or {}})
                    layer_id = str(uuid.uuid4()); lv_id = str(uuid.uuid4())
                    with get_conn() as conn:
                        _ensure_study_area(conn)
                        with conn.cursor() as cur:
                            cur.execute("INSERT INTO data_layer (id, study_area_id, kind, name, status) VALUES (%s,%s,%s,%s,'ready')", (layer_id, GUJARAT_STUDY_AREA_ID, kind, name))
                            cur.execute("INSERT INTO layer_version (id, layer_id, version, source_name, source_license, source_crs, normalized_crs, quality_report) VALUES (%s,%s,1,%s,%s,%s,'EPSG:4326', %s)", (lv_id, layer_id, source_name, source_license, src_crs, json.dumps({"status":"passed","features": len(feats)})))
                            for idx, f in enumerate(feats):
                                cur.execute("INSERT INTO spatial_feature (id, layer_version_id, source_feature_id, properties, geom) VALUES (gen_random_uuid(), %s, %s, %s, ST_GeomFromText(%s,4326))", (lv_id, str(idx), json.dumps(f["props"]), f["geom"].wkt))
                    return {"layer_id": layer_id, "layer_version_id": lv_id, "kind": kind, "version": 1, "feature_count": len(feats)}
        except ImportError:
            raise HTTPException(501, "Shapefile support requires fiona")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(422, f"Shapefile parse failed: {e}")
    raise HTTPException(400, "unsupported file type — use .tif/.tiff or .zip (Shapefile)")

@router.get("/{layer_id}/features")
def list_features(layer_id: str, limit: int = 100, offset: int = 0, bbox: Optional[str] = None):
    if limit > 500:
        raise HTTPException(400, "limit max 500")
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM layer_version WHERE layer_id=%s ORDER BY version DESC LIMIT 1", (layer_id,))
                lv = cur.fetchone()
                if not lv:
                    raise HTTPException(404, "layer not found")
                # optional bbox filter
                where = ""
                params: list = [lv["id"]]
                if bbox:
                    try:
                        minx, miny, maxx, maxy = map(float, bbox.split(","))
                        where = " AND ST_Intersects(sf.geom, ST_MakeEnvelope(%s,%s,%s,%s,4326))"
                        params.extend([minx, miny, maxx, maxy])
                    except:
                        raise HTTPException(400, "bbox must be minx,miny,maxx,maxy")
                params.extend([limit, offset])
                cur.execute(f"SELECT id, source_feature_id, properties, ST_AsGeoJSON(geom)::json as geometry FROM spatial_feature sf WHERE sf.layer_version_id=%s{where} LIMIT %s OFFSET %s", params)
                rows = cur.fetchall()
                cur.execute(f"SELECT COUNT(*) as c FROM spatial_feature sf WHERE sf.layer_version_id=%s{where}", params[:-2])
                total = cur.fetchone()
                return {"type":"FeatureCollection", "features": [{"type":"Feature","geometry":r["geometry"],"properties": {**(r["properties"] or {}), "_layer_version_id": str(lv["id"])}, "id": str(r["id"])} for r in rows], "total": total["c"] if total else 0}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
