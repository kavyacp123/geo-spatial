"""Unit tests for cluster.py — pure helpers run without PostGIS."""
from app.cluster import poi_relevance, cluster_hotspots, h3_cell_scores, POI_LENS, RELEVANT_THRESHOLD
import pytest

PTS = [
    {"lng": 72.50, "lat": 23.03, "kind": "competitor", "sub": "rival", "name": "A"},
    {"lng": 72.52, "lat": 23.04, "kind": "competitor", "sub": "rival", "name": "B"},
    {"lng": 72.80, "lat": 21.17, "kind": "complementary", "sub": "mall", "name": "C"},
    {"lng": 70.79, "lat": 22.31, "kind": "competitor", "sub": "rival", "name": "D"},
]

def test_relevance_table():
    assert poi_relevance("fmcg_retail", "competitor", "rival") == 1.0
    assert poi_relevance("ev_charging", "competitor", "rival") == 0.3
    assert poi_relevance("warehouse_logistics", "complementary", "mall") == 0.4
    assert poi_relevance("restaurant_cafe", "complementary", "mall") == 1.0  # 1.0 + affinity capped
    assert poi_relevance("nope_unknown", "competitor", "rival") == 1.0  # falls back to retail lens

def test_relevance_bounded():
    for pid in POI_LENS:
        for kind, sub in [("competitor", "rival"), ("complementary", "mall"), ("complementary", "fuel")]:
            v = poi_relevance(pid, kind, sub)
            assert 0.0 <= v <= 1.0, (pid, kind, sub)

def test_cluster_deterministic_and_shaped():
    a = cluster_hotspots("fmcg_retail", points=PTS)
    b = cluster_hotspots("fmcg_retail", points=PTS)
    assert a == b
    assert len(a) >= 2  # Ahmedabad pair + Surat + Rajkot
    assert a[0]["weight"] >= a[-1]["weight"]  # sorted desc
    for c in a:
        assert set(c) == {"lng", "lat", "weight", "n"}

def test_cluster_empty_and_singleton():
    assert cluster_hotspots("fmcg_retail", points=[]) == []
    solo = [{"lng": 72.5, "lat": 23.0, "kind": "competitor", "sub": "rival", "name": "X"}]
    r = cluster_hotspots("fmcg_retail", points=solo)
    assert len(r) == 1 and r[0]["n"] == 1
    # below-threshold point correctly yields no cluster
    assert cluster_hotspots("telecom_tower", points=solo) == []

def test_cluster_profile_changes_composition():
    # ev lens drops the 3 competitors (0.3 < 0.4) → only the mall remains
    r = cluster_hotspots("ev_charging", points=PTS)
    assert all(c["n"] == 1 for c in r) or len(r) == 1
    assert sum(c["n"] for c in r) == 1

def test_h3_resolution_validated_without_db():
    with pytest.raises(ValueError):
        h3_cell_scores("fmcg_retail", {"demand": 1.0}, resolution=9)

def test_h3_cell_cap_without_db():
    # 5°x5° at res 6 polyfills thousands of cells → 422-style ValueError before any DB touch
    with pytest.raises(ValueError):
        h3_cell_scores("fmcg_retail", {"demand": 1.0}, resolution=6, bbox=(0, 0, 5, 5))
