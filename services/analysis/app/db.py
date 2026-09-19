import os
from contextlib import contextmanager
from typing import Generator

try:
    import psycopg
    from psycopg.rows import dict_row
except Exception:  # keep import safe for local tests without DB driver
    psycopg = None  # type: ignore
    dict_row = None  # type: ignore

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://geoready:geoready@db:5432/geoready")

@contextmanager
def get_conn() -> Generator:
    if psycopg is None:
        raise RuntimeError("psycopg not installed")
    conn = psycopg.connect(DATABASE_URL, row_factory=dict_row)  # type: ignore
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def is_db_available() -> bool:
    if psycopg is None:
        return False
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        return True
    except Exception:
        return False

GUJARAT_STUDY_AREA_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
ANALYSIS_SRID = 32643  # UTM 43N for Gujarat metre math per GEOSPATIAL_STANDARDS
