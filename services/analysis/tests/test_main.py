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
def test_fallback_score_varies_by_location():
 # no DB in test env → synthetic fallback; distant pins must NOT share one constant score
 a=score(Request(profile_id='fmcg_retail',longitude=72.505,latitude=23.033))
 b=score(Request(profile_id='fmcg_retail',longitude=69.67,latitude=23.24))
 assert a['score'] != b['score']; assert abs(a['score']-b['score']) > 5
 assert all(f['quality']=='demo_placeholder' for f in a['factors'])
def test_fallback_score_deterministic_and_bounded():
 kw=dict(profile_id='fmcg_retail',longitude=72.602,latitude=22.998)
 r1=score(Request(**kw)); r2=score(Request(**kw))
 assert r1['score']==r2['score']
 assert 0 <= r1['score'] <= 100
 for f in r1['factors']: assert 0.05 <= f['normalized_value'] <= 0.95
def test_fallback_score_moves_smoothly_nearby():
 a=score(Request(profile_id='fmcg_retail',longitude=72.505,latitude=23.033))['score']
 b=score(Request(profile_id='fmcg_retail',longitude=72.51,latitude=23.035))['score']
 assert abs(a-b) < 5  # ~500m move must not jump
def test_flood_zone_warn_auto_triggered(monkeypatch):
 import app.main as m
 monkeypatch.setattr(m, 'is_db_available', lambda: True)
 def fake_risk(lng, lat): return {'raw':0,'norm':0.0,'unit':'risk_index','lv':'x','method':'t','blocked':True}
 def fake_other(lng, lat): return {'raw':1,'norm':1.0,'unit':'x','lv':'x','method':'t'}
 monkeypatch.setattr(m.fac, 'FACTOR_FUNCS', {'demand':fake_other,'access':fake_other,'competition':fake_other,'zoning':fake_other,'risk':fake_risk})
 r=m.score(m.Request(profile_id='fmcg_retail',longitude=72.55,latitude=23.05))
 assert r['eligibility']=='warning'
 assert any(c['id']=='flood_zone' and c['effect']=='warn' for c in r['constraints'])
