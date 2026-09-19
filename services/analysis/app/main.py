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
class Request(BaseModel):
    profile_id: str
    longitude: float = Field(ge=-180,le=180)
    latitude: float = Field(ge=-90,le=90)
    factor_values: dict[str,float] | None=None
    triggered_constraints: list[Constraint]=Field(default_factory=list)
    @field_validator('factor_values')
    @classmethod
    def normalized(cls,v):
        if v and any(x<0 or x>1 for x in v.values()): raise ValueError('factor values must be in [0, 1]')
        return v
F={'fmcg_retail':[('demand','Population demand',.30),('access','Road access',.20),('competition','Competitor gap',.20),('zoning','Land-use fit',.15),('risk','Environmental safety',.15)],'ev_charging':[('access','Road access',.25),('utility','Utility readiness',.25),('gap','Coverage gap',.20),('footfall','Footfall proxy',.15),('risk','Environmental safety',.15)],'warehouse_logistics':[('access','Road access',.35),('parcel','Parcel suitability',.25),('zoning','Land-use fit',.20),('risk','Environmental safety',.10),('demand','Population demand',.10)]}
app=FastAPI(title='GeoReady Spatial Analysis',version='0.1.0')
@app.get('/health')
def health(): return {'status':'ok','service':'geoready-analysis'}
@app.post('/api/v1/score')
def score(r:Request):
    if r.profile_id not in F: raise HTTPException(404,'Profile is not yet present in the scoring kernel')
    values=r.factor_values or {}; factors=[]; total=0.0
    for key,label,w in F[r.profile_id]:
        val=values.get(key,.65); contribution=100*w*val; total+=contribution
        factors.append({'factor_id':key,'label':label,'raw_value':val,'unit':'normalized_index','normalized_value':val,'weight':w,'contribution':round(contribution,2),'quality':'provided_metric' if key in values else 'demo_placeholder'})
    eligibility='eligible'
    for c in r.triggered_constraints:
        if c.effect=='block': eligibility='ineligible'
        elif c.effect=='cap' and eligibility!='ineligible': total=min(total,c.cap if c.cap is not None else total);eligibility='capped'
        elif c.effect=='warn' and eligibility=='eligible':eligibility='warning'
    return {'candidate_id':str(uuid4()),'analysis_run_id':str(uuid4()),'profile_id':r.profile_id,'score':round(max(0,min(100,total)),2),'eligibility':eligibility,'score_config_version':1,'factors':factors,'constraints':[c.model_dump() for c in r.triggered_constraints],'input_manifest':{'study_area':'Gujarat','notice':'Placeholder factor values; no validated layers loaded.'},'generated_at':datetime.now(timezone.utc).isoformat()}
