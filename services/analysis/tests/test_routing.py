"""Unit tests for routing.py — geometry + fallback paths need no network."""
from app import routing as rte
from app.main import _haversine_km


def test_circle_radius_matches_request():
    ring = rte._circle_coords(72.58, 23.02, 6670)
    assert len(ring) == 65 and ring[0] == ring[-1]
    for pt in ring[::8]:
        d_km = _haversine_km(72.58, 23.02, pt[0], pt[1])
        assert abs(d_km - 6.67) < 0.05


def test_crossing_radius_interpolates():
    samples = [(2.0, 300.0), (5.0, 700.0), (10.0, 1500.0)]
    r = rte._crossing_radius(samples, 10)  # 600s target
    assert r is not None and 2.0 < r < 5.0
    assert rte._crossing_radius(samples, 60) is None  # beyond sampled range
    assert rte._crossing_radius([(2.0, 900.0)], 10) == 2.0  # already past target


def test_fetch_durations_graceful_on_bad_host(monkeypatch):
    monkeypatch.setattr(rte, "OSRM_URL", "http://127.0.0.1:9")
    assert rte.fetch_durations((72.58, 23.02), [(72.6, 23.0)]) is None


def test_isochrone_falls_back_labeled(monkeypatch):
    monkeypatch.setattr(rte, "OSRM_URL", "http://127.0.0.1:9")
    res = rte.isochrone_rings(72.58, 23.02, (10, 20, 30))
    assert res["routed"] is False
    assert res["provider"] == "geodesic-fallback"
    assert "not routed" in res["notice"]
    assert [r["minutes"] for r in res["rings"]] == [10, 20, 30]
    assert all(len(r["polygon"]) == 65 for r in res["rings"])  # geodesic fallback stays 64-gon


def test_reachable_population_none_without_db():
    # no PostGIS here → None (endpoint must tolerate it)
    assert rte.reachable_population([[72.5, 23.0], [72.6, 23.0], [72.6, 23.1], [72.5, 23.0]]) is None
