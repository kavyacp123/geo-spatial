from app.main import Request, Constraint, score, F
import pytest

def test_full_score_is_bounded():
 r=score(Request(profile_id='fmcg_retail',longitude=72.57,latitude=23.02,factor_values={'demand':1,'access':1,'competition':1,'zoning':1,'risk':1}));assert r['score']==100
def test_block_is_visible():
 r=score(Request(profile_id='ev_charging',longitude=72.57,latitude=23.02,triggered_constraints=[Constraint(id='grid',effect='block',message='No grid')]));assert r['eligibility']=='ineligible'
def test_all_eleven_profiles_score():
 for pid in F:
  r=score(Request(profile_id=pid, longitude=72.57, latitude=23.02)); assert 0 <= r['score'] <= 100; assert r['eligibility']=='eligible'
def test_weight_override_applied():
 overrides={'demand':0.5,'access':0.1,'competition':0.1,'zoning':0.15,'risk':0.15}
 r=score(Request(profile_id='fmcg_retail', longitude=72.57, latitude=23.02, factor_values={'demand':1,'access':0,'competition':0,'zoning':0,'risk':0}, weight_overrides=overrides))
 # demand dominates: 50 pts + rest 0 = 50
 assert r['score']==50; assert r['weight_source']=='custom'; assert r['score_config_version']==2
def test_weight_sum_must_be_one():
 import fastapi
 try:
  score(Request(profile_id='fmcg_retail', longitude=72.57, latitude=23.02, weight_overrides={'demand':0.9,'access':0.9,'competition':0,'zoning':0,'risk':0}))
  assert False, 'should have raised'
 except fastapi.HTTPException as e:
  assert e.status_code==422
def test_weights_sum_to_one_per_profile():
 for pid, facs in F.items():
  s=sum(w for _,_,w in facs); assert abs(s-1.0) < 0.0001, pid
