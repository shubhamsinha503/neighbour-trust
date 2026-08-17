"""CPCB real-time AQI via the data.gov.in Open Government Data platform.

This is the source of record: CPCB is the Indian regulator, the data carries no
commercial-use restriction (unlike AQICN's free tier), and it is what a buyer
would see quoted in a bulletin or on the news.

Shape of the resource, which drives everything below: it returns **one row per
station per pollutant**, not one row per station. A station reporting six
pollutants is six rows sharing a station name and coordinates. Reassembling those
into a per-station concentration dict is this module's main job; computing an AQI
from them is agents/air_quality/aqi.py's, because the feed carries raw
concentrations and no index.

Untested against a live response as of this commit — DATA_GOV_IN_API_KEY was not
yet available. The parsing is deliberately tolerant of both the older
(`pollutant_min`/`pollutant_max`/`pollutant_avg`) and newer
(`min_value`/`max_value`/`avg_value`) field spellings, which the resource has used
at different times, and of the string "NA" that appears in place of a number when
a station's sensor is down.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from agents.common.config import DATA_GOV_IN

RESOURCE_ID = "3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69"
BASE_URL = "https://api.data.gov.in/resource"
SOURCE_NAME = "CPCB via data.gov.in"
SOURCE_URL = "https://www.data.gov.in/catalog/real-time-air-quality-index"

IST = timezone(timedelta(hours=5, minutes=30))

# CPCB's pollutant_id spellings -> our column names.
POLLUTANT_MAP = {
    "PM2.5": "pm2_5",
    "PM10": "pm10",
    "NO2": "no2",
    "SO2": "so2",
    "CO": "co",
    "OZONE": "o3",
    "O3": "o3",
    "NH3": "nh3",
}

_AVG_FIELDS = ("pollutant_avg", "avg_value", "pollutant_average")
_MIN_FIELDS = ("pollutant_min", "min_value")
_MAX_FIELDS = ("pollutant_max", "max_value")


class CpcbError(RuntimeError):
    pass


class CpcbClient:
    def __init__(self, timeout: float = 30.0) -> None:
        self._api_key = DATA_GOV_IN.require()
        self._client = httpx.Client(base_url=BASE_URL, timeout=timeout)

    def __enter__(self) -> "CpcbClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def stations_for_city(self, city: str, *, limit: int = 500) -> list[dict[str, Any]]:
        """All stations reporting in a city, with concentrations reassembled.

        Returns one dict per station:
            {external_id, name, city, state, lat, lon, observed_at,
             concentrations: {pm2_5: .., pm10: .., ...}}
        """
        params = {
            "api-key": self._api_key,
            "format": "json",
            "limit": limit,
            "filters[city]": city,
        }
        response = self._client.get(f"/{RESOURCE_ID}", params=params)
        if response.status_code in (401, 403):
            raise CpcbError(
                "data.gov.in rejected the API key. Check DATA_GOV_IN_API_KEY in .env — "
                "register at https://www.data.gov.in/ and copy the key from My Account."
            )
        response.raise_for_status()
        records = response.json().get("records", [])
        return _group_by_station(records)


def _group_by_station(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    stations: dict[str, dict[str, Any]] = {}

    for record in records:
        name = (record.get("station") or "").strip()
        if not name:
            continue

        lat = _number(record.get("latitude"))
        lon = _number(record.get("longitude"))
        if lat is None or lon is None:
            continue  # cannot key to an H3 cell without coordinates

        station = stations.setdefault(
            name,
            {
                "external_id": name,   # CPCB has no stable station id; the name is it
                "name": name,
                "city": (record.get("city") or "").strip() or None,
                "state": (record.get("state") or "").strip() or None,
                "lat": lat,
                "lon": lon,
                "observed_at": None,
                "concentrations": {},
            },
        )

        observed_at = _parse_last_update(record.get("last_update"))
        if observed_at and (station["observed_at"] is None or observed_at > station["observed_at"]):
            station["observed_at"] = observed_at

        column = POLLUTANT_MAP.get((record.get("pollutant_id") or "").strip().upper())
        if column is None:
            continue

        value = _first_number(record, _AVG_FIELDS)
        if value is None:
            # Some rows carry only min/max. Their midpoint is a fair stand-in for
            # a missing average and is better than dropping the pollutant, which
            # could push the station under CPCB's three-pollutant AQI minimum.
            low, high = _first_number(record, _MIN_FIELDS), _first_number(record, _MAX_FIELDS)
            if low is not None and high is not None:
                value = (low + high) / 2

        if value is None:
            continue

        # CPCB publishes CO in mg/m³ already, matching the AQI table; the rest are µg/m³.
        station["concentrations"][column] = value

    return [s for s in stations.values() if s["concentrations"]]


def _number(raw: Any) -> Optional[float]:
    """Parse a value that may legitimately be the string 'NA'."""
    if raw is None:
        return None
    text = str(raw).strip()
    if text == "" or text.upper() in ("NA", "N/A", "NULL", "-"):
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _first_number(record: dict[str, Any], fields: tuple[str, ...]) -> Optional[float]:
    for field in fields:
        value = _number(record.get(field))
        if value is not None:
            return value
    return None


def _parse_last_update(raw: Any) -> Optional[datetime]:
    """CPCB stamps are IST, formatted DD-MM-YYYY HH:MM:SS with no timezone marker.

    Attaching IST explicitly matters: read as UTC, every reading would appear
    5.5 hours old, which is enough to trip the staleness rule in the agent and
    silently downgrade confidence on perfectly current data.
    """
    if not raw:
        return None
    text = str(raw).strip()
    for fmt in ("%d-%m-%Y %H:%M:%S", "%d-%m-%Y %H:%M", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=IST)
        except ValueError:
            continue
    return None
