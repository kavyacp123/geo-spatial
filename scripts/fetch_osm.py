#!/usr/bin/env python3
"""Fetch OpenStreetMap transport + amenity extracts around Gujarat cities (ODbL).

Queries the public Overpass API with small per-city bboxes (keeps responses
small and polite), converts OSM JSON to GeoJSON, and optionally POSTs each
layer to the running stack (POST /api/v1/layers). Nothing is committed —
run on demand and upload, or save to data/ (git-ignored) for inspection.

Usage:
  python scripts/fetch_osm.py --out data/osm [--upload http://localhost:3000]
Requires: nothing beyond the standard library.
"""
from __future__ import annotations
import argparse
import json
import sys
import time
import urllib.parse
import urllib.request

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
# (name, lng, lat, half-degree window) — city-scale windows, not the whole state
CITIES = [
    ("ahmedabad", 72.58, 23.02, 0.35),
    ("surat", 72.83, 21.17, 0.30),
    ("vadodara", 73.18, 22.31, 0.30),
    ("rajkot", 70.80, 22.30, 0.30),
    ("bhavnagar", 72.15, 21.76, 0.25),
]
AMENITIES = "hospital|school|fuel|atm|bank|pharmacy|college|university|marketplace|restaurant"


def bbox(lng: float, lat: float, half: float) -> str:
    return f"{lat - half},{lng - half},{lat + half},{lng + half}"


def overpass(query: str, retries: int = 3) -> dict:
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                OVERPASS_URL,
                data=urllib.parse.urlencode({"data": query}).encode(),
                headers={"User-Agent": "GeoReady-Hackathon/0.1", "Content-Type": "application/x-www-form-urlencoded"},
            )
            with urllib.request.urlopen(req, timeout=120) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:  # rate-limited or offline → back off, then give up honestly
            last = e
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(f"Overpass failed after {retries} tries: {last}")


def to_geojson(osm: dict, name: str) -> dict:
    nodes = {el["id"]: el for el in osm.get("elements", []) if el["type"] == "node"}
    feats = []
    for el in osm.get("elements", []):
        tags = el.get("tags", {})
        if el["type"] == "node":
            geom = {"type": "Point", "coordinates": [el["lon"], el["lat"]]}
        elif el["type"] == "way":
            coords = [[nodes[n]["lon"], nodes[n]["lat"]] for n in el.get("nodes", []) if n in nodes]
            if len(coords) < 2:
                continue
            geom = {"type": "LineString", "coordinates": coords}
        else:
            continue
        props = {"name": tags.get("name", f"osm-{el['type']}-{el['id']}"), "source": "osm", "license": "ODbL"}
        for k in ("highway", "amenity", "shop", "route"):
            if k in tags:
                props[k] = tags[k]
        feats.append({"type": "Feature", "geometry": geom, "properties": props})
    return {"type": "FeatureCollection", "features": feats, "properties": {"source": name}}


def upload(api: str, kind: str, name: str, fc: dict) -> None:
    body = json.dumps({"kind": kind, "name": name, "source_name": "OpenStreetMap extract", "source_license": "ODbL-1.0", "geojson": fc}).encode()
    req = urllib.request.Request(f"{api}/api/v1/layers", data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        print("uploaded", kind, name, resp.status, resp.read()[:120].decode())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/osm")
    ap.add_argument("--upload", default="", help="API base URL to POST layers to (empty = save files only)")
    ap.add_argument("--kind-filter", default="transport,poi", help="comma subset to fetch")
    args = ap.parse_args()
    import os

    kinds = {k.strip() for k in args.kind_filter.split(",")}
    os.makedirs(args.out, exist_ok=True)
    for city, lng, lat, half in CITIES:
        bb = bbox(lng, lat, half)
        if "transport" in kinds:
            q = f'[out:json][timeout:90];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary)"]({bb});node["public_transport"="stop_position"]({bb}););out geom;'
            fc = to_geojson(overpass(q), f"osm-transport-{city}")
            path = os.path.join(args.out, f"transport-{city}.geojson")
            json.dump(fc, open(path, "w"))
            print(f"{city}: transport {len(fc['features'])} features → {path}")
            if args.upload:
                upload(args.upload, "transport", f"OSM transport {city}", fc)
        if "poi" in kinds:
            q = f'[out:json][timeout:90];(node["amenity"~"^({AMENITIES})$"]({bb});node["shop"]({bb}););out geom;'
            fc = to_geojson(overpass(q), f"osm-poi-{city}")
            path = os.path.join(args.out, f"poi-{city}.geojson")
            json.dump(fc, open(path, "w"))
            print(f"{city}: poi {len(fc['features'])} features → {path}")
            if args.upload:
                upload(args.upload, "poi", f"OSM POI {city}", fc)
    print("Done. License: ODbL-1.0 — keep attribution visible (already in map footer).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
