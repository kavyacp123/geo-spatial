"""Candidates, analysis runs, and reports — the persistence behind provenance.

Every score persists (when PostGIS is up): score_config row (v1 seeded, v2+
created on demand for custom weights), candidate_site, analysis_run
(status=succeeded, synchronous demo worker), and site_score with the full
factor breakdown. Frontend pins carry candidate_id + analysis_run_id, so
POST /api/v1/reports can reassemble an auditable cross-run report.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .db import get_conn, GUJARAT_STUDY_AREA_ID

router = APIRouter(tags=["registry"])
ALGORITHM_VERSION = "analysis-0.1.0"


class CandidateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    longitude: float = Field(ge=-180, le=180)
    latitude: float = Field(ge=-90, le=90)


class ReportItem(BaseModel):
    analysis_run_id: str
    candidate_site_id: str


class ReportIn(BaseModel):
    items: List[ReportItem] = Field(min_length=1, max_length=10)


def _now():
    return datetime.now(timezone.utc)


def ensure_score_config(conn, profile_id: str, version: int, weights: dict, constraints: list) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO score_config (id, version, target_use_case, factors, constraints, active)
               VALUES (%s,%s,%s,%s,%s,TRUE) ON CONFLICT (id, version) DO NOTHING""",
            (
                profile_id,
                version,
                profile_id,
                json.dumps([{"id": k, "weight": w} for k, w in weights.items()]),
                json.dumps(constraints),
            ),
        )


def get_or_create_candidate(conn, candidate_id: Optional[str], name: str, lng: float, lat: float) -> str:
    with conn.cursor() as cur:
        if candidate_id:
            cur.execute("SELECT id FROM candidate_site WHERE id = %s", (candidate_id,))
            if cur.fetchone():
                return candidate_id
            raise HTTPException(404, "candidate_site not found")
        # keep pins inside the Gujarat study boundary — honest containment, not silent clipping
        cur.execute(
            "SELECT ST_Within(ST_SetSRID(ST_MakePoint(%s,%s),4326), boundary) AS inside FROM study_area WHERE id = %s",
            (lng, lat, GUJARAT_STUDY_AREA_ID),
        )
        row = cur.fetchone()
        if not row or not row["inside"]:
            raise HTTPException(422, "candidate lies outside the Gujarat study_area boundary")
        new_id = str(uuid4())
        cur.execute(
            "INSERT INTO candidate_site (id, study_area_id, name, geom) VALUES (%s,%s,%s,ST_SetSRID(ST_MakePoint(%s,%s),4326))",
            (new_id, GUJARAT_STUDY_AREA_ID, name, lng, lat),
        )
        return new_id


def persist_score(
    profile_id: str,
    version: int,
    weights: dict,
    constraints: list,
    candidate_id: Optional[str],
    candidate_name: str,
    lng: float,
    lat: float,
    score_val: float,
    eligibility: str,
    factors: list,
) -> tuple[str, str, bool]:
    """Returns (candidate_id, analysis_run_id, persisted). Never raises: provenance
    must never 500 a score — falls back to ephemeral UUIDs."""
    try:
        with get_conn() as conn:
            ensure_score_config(conn, profile_id, version, weights, constraints)
            cid = get_or_create_candidate(conn, candidate_id, candidate_name, lng, lat)
            run_id = str(uuid4())
            manifest = {"study_area": "Gujarat", "weights": weights, "algorithm": ALGORITHM_VERSION}
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO analysis_run (id, study_area_id, score_config_id, score_config_version,
                       input_manifest, status, algorithm_version, started_at, completed_at)
                       VALUES (%s,%s,%s,%s,%s,'succeeded',%s,%s,%s)""",
                    (run_id, GUJARAT_STUDY_AREA_ID, profile_id, version, json.dumps(manifest), ALGORITHM_VERSION, _now(), _now()),
                )
                cur.execute(
                    """INSERT INTO site_score (id, analysis_run_id, candidate_site_id, score, eligibility, breakdown)
                       VALUES (gen_random_uuid(),%s,%s,%s,%s,%s)""",
                    (run_id, cid, score_val, eligibility, json.dumps({"factors": factors, "constraints": constraints})),
                )
            return cid, run_id, True
    except Exception:
        # never fail a score for provenance (e.g. pin outside Gujarat):
        # fall back to ephemeral ids, frontend keeps the DEMO badge
        return str(uuid4()), str(uuid4()), False


@router.post("/api/v1/candidates")
def create_candidate(payload: CandidateIn):
    try:
        with get_conn() as conn:
            cid = get_or_create_candidate(conn, None, payload.name, payload.longitude, payload.latitude)
            with conn.cursor() as cur:
                cur.execute("SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM candidate_site WHERE id=%s", (cid,))
                row = cur.fetchone()
            return {"id": row["id"], "name": row["name"], "longitude": row["lng"], "latitude": row["lat"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"database unavailable: {e}")


@router.get("/api/v1/candidates")
def list_candidates(limit: int = 100):
    if limit < 1 or limit > 500:
        raise HTTPException(400, "limit must be 1..500")
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at FROM candidate_site WHERE study_area_id=%s ORDER BY created_at DESC LIMIT %s",
                    (GUJARAT_STUDY_AREA_ID, limit),
                )
                return {"data": [dict(r) for r in (cur.fetchall() or [])]}
    except Exception as e:
        raise HTTPException(503, f"database unavailable: {e}")


@router.get("/api/v1/analysis-runs/{run_id}")
def get_run(run_id: str):
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM analysis_run WHERE id=%s", (run_id,))
                run = cur.fetchone()
                if not run:
                    raise HTTPException(404, "analysis_run not found")
                cur.execute(
                    """SELECT ss.score, ss.eligibility, ss.breakdown, cs.id AS candidate_id, cs.name,
                              ST_X(cs.geom) AS lng, ST_Y(cs.geom) AS lat
                       FROM site_score ss JOIN candidate_site cs ON cs.id = ss.candidate_site_id
                       WHERE ss.analysis_run_id=%s""",
                    (run_id,),
                )
                return {"run": dict(run), "scores": [dict(r) for r in (cur.fetchall() or [])]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"database unavailable: {e}")


@router.post("/api/v1/reports")
def build_report(payload: ReportIn):
    """Assemble an auditable report from persisted site_scores (cross-run merge allowed).
    Mirrors the client report.ts sections: sites + provenance + caveats."""
    sites = []
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                for item in payload.items:
                    cur.execute(
                        """SELECT ss.score, ss.eligibility, ss.breakdown, ar.score_config_id, ar.score_config_version,
                                  ar.input_manifest, ar.algorithm_version, ar.completed_at,
                                  cs.id AS candidate_id, cs.name, ST_X(cs.geom) AS lng, ST_Y(cs.geom) AS lat
                           FROM site_score ss
                           JOIN analysis_run ar ON ar.id = ss.analysis_run_id
                           JOIN candidate_site cs ON cs.id = ss.candidate_site_id
                           WHERE ss.analysis_run_id=%s AND ss.candidate_site_id=%s""",
                        (item.analysis_run_id, item.candidate_site_id),
                    )
                    row = cur.fetchone()
                    if not row:
                        raise HTTPException(404, f"site_score not found for run {item.analysis_run_id}")
                    bd = row["breakdown"] or {}
                    sites.append({
                        "label": row["name"],
                        "coords": [row["lng"], row["lat"]],
                        "score": float(row["score"]),
                        "eligibility": row["eligibility"],
                        "config_version": row["score_config_version"],
                        "profile_id": row["score_config_id"],
                        "factors": bd.get("factors", []),
                        "constraints": bd.get("constraints", []),
                        "candidate_id": str(row["candidate_id"]),
                        "analysis_run_id": item.analysis_run_id,
                        "algorithm_version": row["algorithm_version"],
                    })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(503, f"database unavailable: {e}")
    best = max(s["score"] for s in sites)
    return {
        "study_area": "Gujarat",
        "crs": "EPSG:4326",
        "generated_at": _now().isoformat(),
        "leader_score": best,
        "sites": [{**s, "delta_vs_best": round(s["score"] - best, 2)} for s in sites],
        "notice": "Decision support only until validated layers replace synthetic-demo sources. Scores bounded [0,100], deterministic per (config, layers, code).",
    }
