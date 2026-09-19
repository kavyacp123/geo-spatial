import json
import math
from datetime import datetime, timezone
from uuid import uuid4
from typing import Literal, Optional, List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator
from .db import is_db_available
from . import factors as fac
from . import cluster as clu
from . import routing as rte
from .layers import router as layers_router
from .registry import router as registry_router, persist_score

# Demo city centres mirror apps/web/src/demo.ts so the no-DB fallback agrees with the map honeycomb.
_DEMO_CITIES = [(72.58,23.02),(72.83,21.17),(73.18,22.31),(70.8,22.3)]

def _haversine_km(alng, alat, blng, blat):
    R = 6371.0
    dlat = math.radians(blat-alat); dlon = math.radians(blng-alng)
    la1 = math.radians(alat); la2 = math.radians(blat)
    h = math.sin(dlat/2)**2 + math.cos(la1)*math.cos(la2)*math.sin(dlon/2)**2
    return 2*R*math.asin(math.sqrt(h))

def _demo_fallback_value(lng, lat, factor_id):
    # Deterministic + location-sensitive (no hash(): PYTHONHASHSEED is salted per process).
    # Smooth decay from Gujarat centres dominates; coarse-grid jitter (~11km cells)
    # adds texture so rural areas aren't perfectly flat. Nearby pins move smoothly.
    dmin = min(_haversine_km(lng,lat,cx,cy) for cx,cy in _DEMO_CITIES)
    salt = sum(ord(c) for c in factor_id) % 100
    jitter = abs(math.sin(round(lng,1)*12.9898 + round(lat,1)*78.233 + salt)*43758.5453) % 1
    v = 0.30 + 0.48*math.exp(-dmin/90.0) + 0.12*jitter
    return max(0.05, min(0.95, v))

class Constraint(BaseModel):
    id: str
    effect: Literal['block','cap','warn']
    cap: float | None = Field(default=None, ge=0, le=100)
    message: str

# Mirrors apps/api/src/siteTypes.ts — keep labels + weights in sync. Sum must be 1.0.
F: dict[str, list[tuple[str,str,float]]] = {
    'fmcg_retail': [('demand','Population demand',.30),('access','Road and transit access',.20),('competition','Competitor gap',.20),('zoning','Land-use fit',.15),('risk','Environmental safety',.15)],
    'convenience_store': [('demand','Population demand',.30),('footfall','Footfall proxy',.25),('competition','Competitor gap',.20),('zoning','Land-use fit',.15),('risk','Environmental safety',.10)],
    'hospital_clinic': [('demand','Population demand',.25),('access','Road and transit access',.25),('parcel','Parcel suitability',.20),('risk','Environmental safety',.20),('competition','Competitor gap',.10)],
    'ev_charging': [('access','Road and transit access',.25),('utility','Utility readiness',.25),('gap','Coverage gap',.20),('footfall','Footfall proxy',.15),('risk','Environmental safety',.15)],
    'fuel_station': [('access','Road and transit access',.35),('parcel','Parcel suitability',.25),('demand','Population demand',.15),('competition','Competitor gap',.15),('risk','Environmental safety',.10)],
    'warehouse_logistics': [('access','Road and transit access',.35),('parcel','Parcel suitability',.25),('zoning','Land-use fit',.20),('risk','Environmental safety',.10),('demand','Population demand',.10)],
    'restaurant_cafe': [('footfall','Footfall proxy',.30),('demand','Population demand',.25),('competition','Competitor gap',.20),('access','Road and transit access',.15),('zoning','Land-use fit',.10)],
    'pharmacy': [('demand','Population demand',.30),('access','Road and transit access',.20),('competition','Competitor gap',.20),('footfall','Footfall proxy',.15),('zoning','Land-use fit',.15)],
    'bank_atm': [('footfall','Footfall proxy',.30),('demand','Population demand',.20),('gap','Coverage gap',.20),('access','Road and transit access',.15),('zoning','Land-use fit',.15)],
    'telecom_tower': [('gap','Coverage gap',.35),('demand','Population demand',.25),('access','Road and transit access',.15),('parcel','Parcel suitability',.15),('risk','Environmental safety',.10)],
    'solar_installation': [('parcel','Parcel suitability',.30),('utility','Utility readiness',.25),('risk','Environmental safety',.20),('access','Road and transit access',.15),('zoning','Land-use fit',.10)],
}

class Request(BaseModel):
    profile_id: str
    longitude: float = Field(ge=-180,le=180)
    latitude: float = Field(ge=-90,le=90)
    factor_values: dict[str,float] | None=None
    weight_overrides: dict[str,float] | None=None
    triggered_constraints: list[Constraint]=Field(default_factory=list)
    candidate_id: Optional[str]=None
    candidate_name: Optional[str]=Field(default=None, max_length=120)
    @field_validator('factor_values')
    @classmethod
    def normalized(cls,v):
        if v and any(x<0 or x>1 for x in v.values()): raise ValueError('factor values must be in [0, 1]')
        return v
    @field_validator('weight_overrides')
    @classmethod
    def weights_range(cls,v):
        if v and any(x<0 or x>1 for x in v.values()): raise ValueError('weights must be in [0,1]')
        return v

def _resolve_weights(profile_id: str, overrides: dict[str,float] | None) -> dict[str,float]:
    if profile_id not in F: raise HTTPException(404,'Profile is not yet present in the scoring kernel')
    eff = {k:w for k,_,w in F[profile_id]}
    if overrides:
        for k in overrides:
            if k not in eff: raise HTTPException(422,f'Unknown factor {k} for profile {profile_id}')
        eff.update(overrides)
        s = sum(eff.values())
        if abs(s - 1.0) > 0.0001: raise HTTPException(422, f'Weights must sum to 1.0, got {s:.4f}')
    return eff

app=FastAPI(title='GeoReady Spatial Analysis',version='0.1.0')
app.include_router(layers_router)
app.include_router(registry_router)
@app.get('/health')
def health(): return {'status':'ok','service':'geoready-analysis','db': is_db_available()}
@app.post('/api/v1/score')
def score(r:Request):
    base = F[r.profile_id] if r.profile_id in F else None
    if base is None: raise HTTPException(404,'Profile is not yet present in the scoring kernel')
    eff = _resolve_weights(r.profile_id, r.weight_overrides)
    # try DB-backed factors; fallback to provided_metric/demo_placeholder if DB unavailable or empty
    use_db = is_db_available() and not r.factor_values  # prefer DB when factor_values not forced
    values=r.factor_values or {}; factors=[]; total=0.0
    db_warning = None
    risk_blocked = False
    for key,label,_ in base:
        w = eff[key]
        lv_id = None
        method = None
        quality = 'demo_placeholder'
        val_norm = None
        raw_val = None
        unit = 'normalized_index'
        if use_db and key in fac.FACTOR_FUNCS:
            try:
                res = fac.FACTOR_FUNCS[key](r.longitude, r.latitude)
                if res is not None:
                    raw_val = res.get('raw')
                    val_norm = float(res.get('norm', 0.65))
                    unit = res.get('unit', 'normalized_index')
                    lv_id = res.get('lv')
                    method = res.get('method')
                    quality = 'postgis_layer'
                    if res.get('blocked'):
                        risk_blocked = True  # surfaced below as a warn constraint
                    # if factor_values forced, override
                    if key in values:
                        val_norm = float(values[key]); quality='provided_metric'
                else:
                    db_warning = 'some layers empty — fallback for '+key
            except Exception as e:
                db_warning = str(e)
        if val_norm is None:
            # fallback: provided metric wins, else location-sensitive synthetic demo (never a flat constant)
            if key in values:
                val_norm = float(values[key]); raw_val = val_norm
                quality = 'provided_metric'
                method = method or 'provided metric'
            else:
                val_norm = _demo_fallback_value(r.longitude, r.latitude, key)
                raw_val = val_norm
                quality = 'demo_placeholder'
                method = 'synthetic location-sensitive demo — decay from Gujarat centres (no validated layers)'
        else:
            raw_val = raw_val if raw_val is not None else val_norm
        contribution=100*w*val_norm; total+=contribution
        factors.append({'factor_id':key,'label':label,'raw_value': raw_val,'unit': unit,'normalized_value': round(float(val_norm),4),'weight':round(w,4),'contribution':round(contribution,2),'quality': quality, 'method': method, 'layer_version_id': lv_id})
    triggered = list(r.triggered_constraints)
    if risk_blocked and not any('flood' in c.id or c.id == 'risk_zone' for c in triggered):
        triggered.append(Constraint(id='flood_zone', effect='warn',
            message='Candidate intersects a documented flood-risk area — score kept with warning.'))
    eligibility='eligible'
    for c in triggered:
        if c.effect=='block': eligibility='ineligible'
        elif c.effect=='cap' and eligibility!='ineligible': total=min(total,c.cap if c.cap is not None else total);eligibility='capped'
        elif c.effect=='warn' and eligibility=='eligible':eligibility='warning'
    version = 2 if r.weight_overrides else 1
    if use_db and not db_warning:
        notice = 'PostGIS factor queries (EPSG:32643 metres) — Gujarat whole-state layers.'
    elif use_db and db_warning:
        notice = f'DB fallback — {db_warning}. Placeholder .65 for missing layers.'
    else:
        notice = 'Custom weights applied.' if r.weight_overrides else 'Synthetic location-sensitive demo factors (no validated layers loaded).'
    final_score = round(max(0,min(100,total)),2)
    constraints_out = [c.model_dump() for c in triggered]
    # persist provenance when PostGIS is up; ephemeral UUIDs otherwise (never fail a score)
    persisted = False
    candidate_id, analysis_run_id = str(uuid4()), str(uuid4())
    if is_db_available():
        cname = r.candidate_name or f"Site {r.latitude:.4f},{r.longitude:.4f}"
        candidate_id, analysis_run_id, persisted = persist_score(
            r.profile_id, version, eff, constraints_out, r.candidate_id, cname,
            r.longitude, r.latitude, final_score, eligibility, factors)
    return {'candidate_id':candidate_id,'analysis_run_id':analysis_run_id,'persisted':persisted,'profile_id':r.profile_id,'score':final_score,'eligibility':eligibility,'score_config_version':version,'weight_source': 'custom' if r.weight_overrides else 'default','factors':factors,'constraints':constraints_out,'input_manifest':{'study_area':'Gujarat','notice': notice,'weights': eff},'generated_at':datetime.now(timezone.utc).isoformat()}

class HotspotsIn(BaseModel):
    profile_id: str
    eps_km: float = Field(default=30.0, ge=1, le=100)

@app.post('/api/v1/hotspots')
def hotspots(payload: HotspotsIn):
    if payload.profile_id not in F: raise HTTPException(404,'Profile is not yet present in the scoring kernel')
    if not is_db_available(): raise HTTPException(503,'database unavailable for server hotspots')
    try:
        clusters = clu.cluster_hotspots(payload.profile_id, eps_km=payload.eps_km)
    except ImportError:
        raise HTTPException(501,'DBSCAN requires scikit-learn')
    except Exception as e:
        raise HTTPException(500, f'clustering failed: {e}')
    return {'profile_id': payload.profile_id,
            'clusters': [{'lng': c['lng'], 'lat': c['lat'], 'weight': c['weight'], 'n': c['n']} for c in clusters],
            'method': f'sklearn DBSCAN haversine eps={payload.eps_km}km over profile-relevant POIs',
            'license': 'synthetic-demo', 'generated_at': datetime.now(timezone.utc).isoformat()}

class H3In(BaseModel):
    profile_id: str
    weight_overrides: dict[str,float] | None=None
    resolution: int = Field(default=5, ge=3, le=7)
    bbox: list[float] | None = None  # [minx,miny,maxx,maxy] to limit cell count

@app.post('/api/v1/h3')
def h3_suitability(payload: H3In):
    eff = _resolve_weights(payload.profile_id, payload.weight_overrides)
    if not is_db_available(): raise HTTPException(503,'database unavailable for server H3')
    bbox = tuple(payload.bbox) if payload.bbox and len(payload.bbox) == 4 else None
    try:
        cells, meta = clu.h3_cell_scores(payload.profile_id, eff, payload.resolution, bbox)
    except ImportError:
        raise HTTPException(501,'H3 requires h3-py')
    except ValueError as e:
        raise HTTPException(422, str(e))
    except Exception as e:
        raise HTTPException(500, f'H3 failed: {e}')
    # persist run + cells for audit
    run_id = str(uuid4())
    try:
        from .db import get_conn, GUJARAT_STUDY_AREA_ID
        from .registry import ensure_score_config, ALGORITHM_VERSION
        with get_conn() as conn:
            ensure_score_config(conn, payload.profile_id, 2 if payload.weight_overrides else 1, eff, [])
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO analysis_run (id, study_area_id, score_config_id, score_config_version,
                       input_manifest, status, algorithm_version, started_at, completed_at)
                       VALUES (%s,%s,%s,%s,%s,'succeeded',%s,%s,%s)""",
                    (run_id, GUJARAT_STUDY_AREA_ID, payload.profile_id, 2 if payload.weight_overrides else 1,
                     json.dumps({'h3_resolution': payload.resolution, 'bbox': bbox, 'weights': eff}),
                     ALGORITHM_VERSION, datetime.now(timezone.utc), datetime.now(timezone.utc)))
                for c in cells:
                    ring = c['poly']['coordinates'][0]
                    wkt = 'POLYGON((' + ', '.join(f'{x} {y}' for x, y in ring) + '))'
                    cur.execute(
                        """INSERT INTO analysis_cell (id, analysis_run_id, h3_index, score, cluster_type, geom)
                           VALUES (gen_random_uuid(),%s,%s,%s,%s,ST_GeomFromText(%s,4326))
                           ON CONFLICT (analysis_run_id, h3_index) DO NOTHING""",
                        (run_id, c['h3_index'], c['score'], c['cluster_type'], wkt))
    except Exception:
        pass  # cells still returned; persistence is provenance, not the product
    features = [{'type':'Feature','geometry':c['poly'],'properties':{'h3_index':c['h3_index'],'score':c['score'],'cluster_type':c['cluster_type'],'license':'synthetic-demo',**c['breakdown']}} for c in cells]
    return {'type':'FeatureCollection','features':features,'meta':{**meta,'analysis_run_id':run_id},'generated_at':datetime.now(timezone.utc).isoformat()}

class IsochroneIn(BaseModel):
    longitude: float = Field(ge=-180,le=180)
    latitude: float = Field(ge=-90,le=90)
    minutes: List[int] = Field(default=[10,20,30], max_length=5)

@app.post('/api/v1/isochrone')
def isochrone(payload: IsochroneIn):
    for m in payload.minutes:
        if m < 1 or m > 120: raise HTTPException(400,'minutes must be 1..120')
    res = rte.isochrone_rings(payload.longitude, payload.latitude, tuple(payload.minutes))
    rings = []
    for r in res['rings']:
        pop = rte.reachable_population(r['polygon'])
        # approx radius: max haversine from origin to ring vertices
        rmax = max(_haversine_km(payload.longitude, payload.latitude, x, y) for x, y in r['polygon']) * 1000
        rings.append({'minutes': r['minutes'], 'polygon': r['polygon'], 'routed': r['routed'],
                      'radius_m': round(rmax), 'population': pop})
    return {'origin': [payload.longitude, payload.latitude], 'rings': rings,
            'routed': res['routed'], 'provider': res['provider'], 'notice': res['notice'],
            'generated_at': datetime.now(timezone.utc).isoformat()}
