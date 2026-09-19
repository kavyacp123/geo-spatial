from datetime import datetime, timezone
from uuid import uuid4
from typing import Literal
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field, field_validator

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

app=FastAPI(title='GeoReady Spatial Analysis',version='0.1.0')
@app.get('/health')
def health(): return {'status':'ok','service':'geoready-analysis'}
@app.post('/api/v1/score')
def score(r:Request):
    if r.profile_id not in F: raise HTTPException(404,'Profile is not yet present in the scoring kernel')
    base = F[r.profile_id]
    eff = {k:w for k,_,w in base}
    if r.weight_overrides:
        for k in r.weight_overrides:
            if k not in eff: raise HTTPException(422,f'Unknown factor {k} for profile {r.profile_id}')
        eff.update(r.weight_overrides)
        s = sum(eff.values())
        if abs(s - 1.0) > 0.0001: raise HTTPException(422, f'Weights must sum to 1.0, got {s:.4f}')
    values=r.factor_values or {}; factors=[]; total=0.0
    for key,label,_ in base:
        w = eff[key]
        val=values.get(key,.65); contribution=100*w*val; total+=contribution
        factors.append({'factor_id':key,'label':label,'raw_value':val,'unit':'normalized_index','normalized_value':val,'weight':round(w,4),'contribution':round(contribution,2),'quality':'provided_metric' if key in values else 'demo_placeholder'})
    eligibility='eligible'
    for c in r.triggered_constraints:
        if c.effect=='block': eligibility='ineligible'
        elif c.effect=='cap' and eligibility!='ineligible': total=min(total,c.cap if c.cap is not None else total);eligibility='capped'
        elif c.effect=='warn' and eligibility=='eligible':eligibility='warning'
    version = 2 if r.weight_overrides else 1
    notice = 'Custom weights applied.' if r.weight_overrides else 'Placeholder factor values; no validated layers loaded.'
    return {'candidate_id':str(uuid4()),'analysis_run_id':str(uuid4()),'profile_id':r.profile_id,'score':round(max(0,min(100,total)),2),'eligibility':eligibility,'score_config_version':version,'weight_source': 'custom' if r.weight_overrides else 'default','factors':factors,'constraints':[c.model_dump() for c in r.triggered_constraints],'input_manifest':{'study_area':'Gujarat','notice':notice,'weights': eff},'generated_at':datetime.now(timezone.utc).isoformat()}
