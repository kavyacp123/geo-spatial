from app.main import Request, Constraint, score
def test_full_score_is_bounded():
 r=score(Request(profile_id='fmcg_retail',longitude=72.57,latitude=23.02,factor_values={'demand':1,'access':1,'competition':1,'zoning':1,'risk':1}));assert r['score']==100
def test_block_is_visible():
 r=score(Request(profile_id='ev_charging',longitude=72.57,latitude=23.02,triggered_constraints=[Constraint(id='grid',effect='block',message='No grid')]));assert r['eligibility']=='ineligible'
