#!/usr/bin/env python3
"""WorldPop demographics pipeline: clip a population raster to Gujarat and upload it.

WorldPop publishes India 100m UN-adjusted population as GeoTIFF (CC-BY-4.0,
https://www.worldpop.org — download the "India 100m Population" product for
your target year; the filename varies by release, so this script takes a local
--input path instead of hard-coding a URL that will rot). Steps:

  1. Download the India 100m GeoTIFF from worldpop.org (CC-BY-4.0, cite it).
  2. python scripts/fetch_worldpop.py --input ind_ppp_2020_UNadj.tif --out data/worldpop [--upload http://localhost:3000]
  3. The script clips to the Gujarat bbox with rasterio, writes a Cloud-Optimized
     clip, and (with --upload) POSTs it to POST /api/v1/layers/upload as the
     demographics layer — exercising the GeoTIFF path end to end.

Without --input the script prints these instructions and exits 2 (no fake data
is ever written — synthetic fallback lives in 003-gujarat-features.sql instead).

Requires: rasterio (pip install rasterio, needs GDAL).
"""
from __future__ import annotations
import argparse
import sys

GUJARAT_BBOX = (68.2, 19.6, 74.7, 24.9)  # minx, miny, maxx, maxy (EPSG:4326)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="", help="local WorldPop India 100m GeoTIFF path")
    ap.add_argument("--out", default="data/worldpop")
    ap.add_argument("--upload", default="", help="API base URL for POST /api/v1/layers/upload")
    args = ap.parse_args()
    if not args.input:
        print(__doc__)
        return 2
    try:
        import rasterio
        from rasterio.mask import mask
        from rasterio.windows import from_bounds
    except ImportError:
        print("rasterio is required (pip install rasterio, needs GDAL).", file=sys.stderr)
        return 3
    import os

    os.makedirs(args.out, exist_ok=True)
    with rasterio.open(args.input) as src:
        win = from_bounds(*GUJARAT_BBOX, transform=src.transform)
        win = win.round_offsets().round_lengths()
        clip = src.read(1, window=win)
        profile = src.profile.copy()
        profile.update({"height": win.height, "width": win.width, "transform": src.window_transform(win), "compress": "deflate", "tiled": True})
        total = float(clip[clip > 0].sum())
        out_path = os.path.join(args.out, "gujarat-population-100m.tif")
        with rasterio.open(out_path, "w", **profile) as dst:
            dst.write(clip, 1)
    print(f"clipped {args.input} → {out_path} ({win.width}x{win.height}, ~{total:,.0f} people, CC-BY-4.0 WorldPop)")
    if args.upload:
        import urllib.request

        boundary = f"--------------------------{os.getpid()}"
        with open(out_path, "rb") as f:
            raster_bytes = f.read()
        fields = [("kind", "demographics"), ("name", "WorldPop Gujarat 100m"), ("source_name", "WorldPop India 100m UN-adjusted"), ("source_license", "CC-BY-4.0")]
        body = b""
        for k, v in fields:
            body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"gujarat-population-100m.tif\"\r\nContent-Type: image/tiff\r\n\r\n".encode() + raster_bytes + f"\r\n--{boundary}--\r\n".encode()
        req = urllib.request.Request(
            f"{args.upload}/api/v1/layers/upload", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
        )
        with urllib.request.urlopen(req, timeout=300) as resp:
            print("upload:", resp.status, resp.read()[:200].decode())
    return 0


if __name__ == "__main__":
    sys.exit(main())
