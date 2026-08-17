"""AQICN / WAQI client — corroboration only, deliberately not an AQI contributor.

Live testing during Phase 1 turned up two problems that decide how this source is
allowed to be used:

  1. **Its India station data can be badly stale.** Every Bengaluru station
     queried on 2026-08-17 returned readings timestamped 2026-06-23 — roughly
     eight weeks old — served through the same fields as current data, with no
     staleness marker beyond the timestamp itself.

  2. **`feed/geo:` cannot be trusted for "nearest station".** A query for
     Indiranagar, Bengaluru (12.9784, 77.6408) returned "Dr. Karni Singh Shooting
     Range, Delhi" at (28.4997, 77.2671) — about 1,700 km away, and a different
     regulatory jurisdiction entirely. This client therefore uses `/search/` and
     ranks candidates by our own haversine distance, never the endpoint's opinion.

There is a third, quieter issue: AQICN reports on the **US EPA** scale, and the
values in `iaqi` are already EPA sub-indices rather than concentrations. They
cannot be fed into the CPCB index without inverting the EPA breakpoints first —
an inversion whose accuracy depends on which revision of the EPA table AQICN is
using, which isn't published per-response. Rather than invent a conversion that
can't be validated, this module records AQICN's number **on its own scale, so
labelled**, and the displayed CPCB AQI is never derived from it. That keeps AQICN
useful for the Phase 3 orchestrator's disagreement-disclosure job without letting
an unvalidated conversion reach the buyer-facing card.

Free-tier terms note: AQICN prohibits use in paid applications and redistribution
of the data. If Neighbour Trust ever licenses a trust-score API (see the B2B
angle in docs/strategy.md), this source needs a written agreement first.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

import httpx

from agents.common.config import AQICN
from agents.common.geo import haversine_km

BASE_URL = "https://api.waqi.info"
SOURCE_NAME = "AQICN"
SOURCE_URL = "https://aqicn.org/"

# Hard ceiling on how far a "nearby" station may be. See the Delhi-for-Bengaluru
# failure above — without this, a bad upstream match becomes a wrong AQI.
MAX_STATION_KM = 25.0


class AqicnError(RuntimeError):
    pass


class AqicnClient:
    def __init__(self, timeout: float = 30.0) -> None:
        self._token = AQICN.require()
        self._client = httpx.Client(base_url=BASE_URL, timeout=timeout)

    def __enter__(self) -> "AqicnClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _get(self, path: str, **params: Any) -> Any:
        params["token"] = self._token
        response = self._client.get(path, params=params)
        response.raise_for_status()
        body = response.json()
        if body.get("status") != "ok":
            raise AqicnError(f"AQICN returned status={body.get('status')!r} for {path}")
        return body.get("data")

    def search_stations(self, keyword: str) -> list[dict[str, Any]]:
        """Stations matching a keyword, with coordinates.

        Note the AQI in search results is frequently "-" or stale even when the
        per-station feed has a value; treat this purely as a directory lookup.
        """
        stations = []
        for entry in self._get("/search/", keyword=keyword) or []:
            station = entry.get("station") or {}
            geo = station.get("geo") or []
            if len(geo) != 2:
                continue
            stations.append(
                {
                    "uid": entry.get("uid"),
                    "name": station.get("name") or f"AQICN {entry.get('uid')}",
                    "lat": geo[0],
                    "lon": geo[1],
                }
            )
        return stations

    def nearest_station(
        self, keyword: str, lat: float, lon: float, *, max_km: float = MAX_STATION_KM
    ) -> Optional[dict[str, Any]]:
        """Closest station to a point, ranked by our own distance maths.

        Returns None rather than a far-away station when nothing is in range —
        "no data" is an acceptable answer, another city's air is not.
        """
        candidates = []
        for station in self.search_stations(keyword):
            distance = haversine_km(lat, lon, station["lat"], station["lon"])
            if distance <= max_km:
                candidates.append({**station, "distance_km": distance})
        if not candidates:
            return None
        return min(candidates, key=lambda s: s["distance_km"])

    def station_feed(self, uid: int) -> Optional[dict[str, Any]]:
        """Current AQICN reading for a station, on the US EPA scale.

        `epa_aqi` is explicitly named for the scale it is on so no caller can
        mistake it for the CPCB number the rest of the pipeline uses.
        """
        data = self._get(f"/feed/@{uid}/")
        if not data:
            return None

        aqi = data.get("aqi")
        if not isinstance(aqi, (int, float)):
            return None  # "-" means no current value

        city = data.get("city") or {}
        geo = city.get("geo") or []
        observed_at = _parse_iso((data.get("time") or {}).get("iso"))

        return {
            "uid": uid,
            "name": city.get("name"),
            "lat": geo[0] if len(geo) == 2 else None,
            "lon": geo[1] if len(geo) == 2 else None,
            "epa_aqi": float(aqi),
            "scale": "us_epa",
            "dominant_pollutant": data.get("dominentpol"),
            "observed_at": observed_at,
            # iaqi values are EPA sub-indices, not concentrations. Kept raw and
            # unconverted; see the module docstring.
            "epa_sub_indices": {
                key: entry.get("v")
                for key, entry in (data.get("iaqi") or {}).items()
                if key in ("pm25", "pm10", "no2", "so2", "co", "o3")
            },
            "attributions": [a.get("name") for a in (data.get("attributions") or [])],
        }


def _parse_iso(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
