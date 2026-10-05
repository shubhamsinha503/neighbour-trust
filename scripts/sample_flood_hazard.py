"""Sample a modeled flood-hazard depth for every seeded locality, once.

Why this is an offline script and not an ingest agent. Flood *hazard* (as
opposed to a live flood *forecast*) is static: it is a model of how deep a
1-in-100-year river flood would be, and it changes only when the model is
re-published, every few years. So it is sampled once here and committed as a
plain table (agents/common/flood_hazard.py), exactly like the locality seed —
the production pipeline then reads that table and never touches a raster or GDAL.

Source. WRI Aqueduct Floods v2, riverine, historical baseline, 100-year return
period (`inunriver_historical_000000000WATCH_1980_rp00100`). A global GeoTIFF at
~1 km (30 arc-second) resolution, in metres of inundation depth. It is a *model*,
not an observation, and coarse — "regional screening, not parcel-level
certainty" — and every surface that shows it must say so.

Honesty bar. A locality is sampled at the maximum depth within ~1 km of its
centroid (a 3x3 cell window), because a 1 km grid cannot pin a flood to a street
and the centroid may sit just outside a cell the locality clearly overlaps.
Taking the max over that small window is the conservative, legible rule: it says
"modeled flooding reaches this depth within about a kilometre", which is exactly
what a ~1 km model can honestly support.

    python -m scripts.sample_flood_hazard            # dry, prints a summary
    python -m scripts.sample_flood_hazard --write    # write the committed table

Needs rasterio (an offline/dev dependency only — never imported by the agents).
Reads the raster remotely via /vsicurl, pulling just the India window, so no
multi-gigabyte download. If the host is unreachable from where this runs, run it
somewhere with plain internet; the output is a committed file reviewed in a diff.
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import pathlib
import sys
from typing import Optional

load_env = pathlib.Path(__file__).resolve().parents[1] / ".env"
try:
    from dotenv import load_dotenv

    load_dotenv(load_env)
except Exception:
    pass

from agents.common.seed_localities import LOCALITIES  # noqa: E402

# WRI Aqueduct Floods v2 — riverine, historical baseline, 100-year return period.
RASTER = (
    "/vsicurl/https://aqueduct.wridata.org/AqueductFloods20/"
    "inunriver_historical_000000000WATCH_1980_rp00100.tif"
)
SOURCE_NAME = "WRI Aqueduct Floods v2 (modeled, ~1 km)"
SOURCE_URL = "https://www.wri.org/data/aqueduct-floods"
RETURN_PERIOD_YEARS = 100
# The model's data vintage, not today — the baseline WATCH climatology.
DATA_VINTAGE = "2020"  # WRI Aqueduct v2 release

# India bounding box, read once into memory so 1,600+ localities sample from one
# windowed fetch rather than one HTTP range request each.
INDIA = (67.0, 6.0, 98.5, 37.5)  # min_lon, min_lat, max_lon, max_lat

# A depth below this (metres) is treated as "not in a modeled flood zone": a few
# centimetres from a 1 km model is noise, not a finding.
MIN_DEPTH_M = 0.1


def _gdal_proxy_env() -> None:
    """Let GDAL's curl use the same outbound proxy and CA bundle as everything
    else here, when they are configured. A no-op with plain internet."""
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        os.environ.setdefault("GDAL_HTTP_PROXY", proxy)
    ca = "/root/.ccr/ca-bundle.crt"
    if os.path.exists(ca):
        os.environ.setdefault("CURL_CA_BUNDLE", ca)
    os.environ.setdefault("CPL_VSIL_CURL_ALLOWED_EXTENSIONS", ".tif")
    os.environ.setdefault("GDAL_DISABLE_READDIR_ON_OPEN", "YES")


def sample() -> tuple[dict[str, float], dict[str, int]]:
    """Return {slug: depth_m} for localities in a modeled flood zone, and counts."""
    import numpy as np
    import rasterio
    from rasterio.windows import Window, from_bounds

    _gdal_proxy_env()
    with rasterio.open(RASTER) as ds:
        nodata = ds.nodata
        win = from_bounds(*INDIA, ds.transform).round_offsets().round_lengths()
        # Clamp to the raster so an edge-of-world box cannot ask for negative
        # offsets or over-wide reads.
        col_off = max(0, int(win.col_off))
        row_off = max(0, int(win.row_off))
        width = min(ds.width - col_off, int(win.width))
        height = min(ds.height - row_off, int(win.height))
        window = Window(col_off, row_off, width, height)
        arr = ds.read(1, window=window).astype("float64")
        wt = ds.window_transform(window)
        inv = ~wt
        rows, cols = arr.shape

    if nodata is not None:
        arr[arr == nodata] = 0.0
    arr[arr < 0] = 0.0  # some tiles use a large negative fill

    kept: dict[str, float] = {}
    counts = {"in_zone": 0, "clear": 0, "outside_raster": 0}
    for slug, _name, _city, _state, _pin, lat, lon in LOCALITIES:
        fcol, frow = inv * (lon, lat)
        c, r = int(fcol), int(frow)
        if not (0 <= r < rows and 0 <= c < cols):
            counts["outside_raster"] += 1
            continue
        # Max depth within ~1 km (a 3x3 cell neighbourhood), clamped to bounds.
        block = arr[max(0, r - 1):r + 2, max(0, c - 1):c + 2]
        depth = float(block.max()) if block.size else 0.0
        if depth >= MIN_DEPTH_M:
            kept[slug] = round(depth, 2)
            counts["in_zone"] += 1
        else:
            counts["clear"] += 1
    return kept, counts


def write_table(depths: dict[str, float]) -> None:
    out = pathlib.Path("agents/common/flood_hazard.py")
    today = dt.date.today().isoformat()
    lines = [
        '"""Modeled flood-hazard depth per locality — GENERATED, do not edit by hand.',
        "",
        "Produced by scripts/sample_flood_hazard from WRI Aqueduct Floods v2 (riverine,",
        "historical baseline, 100-year return period), a ~1 km global model in metres of",
        "inundation depth. Re-run that script to refresh. Only localities that fall in a",
        "modeled flood zone are listed; a slug that is absent is not in one.",
        "",
        f"Source: {SOURCE_NAME} <{SOURCE_URL}>",
        f"Sampled: {today}. Model vintage: {DATA_VINTAGE}.",
        '"""',
        "",
        "from __future__ import annotations",
        "",
        f'SOURCE_NAME = "{SOURCE_NAME}"',
        f'SOURCE_URL = "{SOURCE_URL}"',
        f"RETURN_PERIOD_YEARS = {RETURN_PERIOD_YEARS}",
        f'DATA_VINTAGE = "{DATA_VINTAGE}"',
        "",
        "# slug -> modeled 100-year river-flood depth in metres, max within ~1 km.",
        "FLOOD_DEPTH_M: dict[str, float] = {",
    ]
    for slug in sorted(depths):
        lines.append(f'    "{slug}": {depths[slug]},')
    lines.append("}")
    out.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Sample modeled flood hazard per locality.")
    parser.add_argument("--write", action="store_true", help="Write agents/common/flood_hazard.py")
    args = parser.parse_args(argv)

    print(f"Sampling {len(LOCALITIES)} localities from {RASTER.split('/')[-1]} ...")
    depths, counts = sample()
    print(f"\nin a modeled flood zone: {counts['in_zone']}")
    print(f"not in a zone:           {counts['clear']}")
    if counts["outside_raster"]:
        print(f"outside the raster:      {counts['outside_raster']}")
    if depths:
        worst = sorted(depths.items(), key=lambda kv: -kv[1])[:8]
        print("\ndeepest modeled:")
        for slug, d in worst:
            print(f"  {d:5.2f} m  {slug}")

    if args.write:
        if not depths:
            print("\nNothing to write.", file=sys.stderr)
            return 1
        write_table(depths)
        print(f"\nWrote agents/common/flood_hazard.py ({len(depths)} localities). Review the diff.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
