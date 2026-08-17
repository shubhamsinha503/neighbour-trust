"""OpenAQ v3 client.

OpenAQ re-publishes the CPCB/state-pollution-board feeds for India, which makes
it the same underlying official data as data.gov.in arriving through a different
pipe — and, unlike data.gov.in, it keeps 90 days of history. That history is the
only reason the 30-day trend chart can render on day one instead of 30 days from
now.

Two traps this client exists to handle, both found against live responses:

  1. **Dead stations outnumber live ones.** A radius query around Indiranagar
     returns 25 stations, of which 12 last reported in 2018. Filtering on
     `datetimeLast` is mandatory, not defensive.
  2. **Duplicate sensors per pollutant, in different units.** A single station
     exposes e.g. `co` twice — once in µg/m³ and once in ppb — and often a live
     sensor alongside a decommissioned one. We prefer native µg/m³ and the most
     recently reporting sensor.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import logging
import time

import httpx

from agents.air_quality.aqi import PARTICULATES, MIN_POLLUTANTS_FOR_AQI, PPB_TO_UGM3
from agents.common.config import OPENAQ

log = logging.getLogger(__name__)

BASE_URL = "https://api.openaq.org/v3"
SOURCE_NAME = "CPCB via OpenAQ"
SOURCE_URL = "https://openaq.org/"

# OpenAQ parameter name -> our column name. Anything not listed (temperature,
# relativehumidity, wind_*, no, nox) is weather or a precursor, not an AQI input.
PARAMETER_MAP = {
    "pm25": "pm2_5",
    "pm10": "pm10",
    "no2": "no2",
    "so2": "so2",
    "co": "co",
    "o3": "o3",
    "nh3": "nh3",
}

# How recently a station must have reported to count as live. Six hours tolerates
# an ordinary upstream hiccup without letting a station that quietly died last
# spring present itself as current.
LIVE_WITHIN = timedelta(hours=6)


class OpenAqError(RuntimeError):
    pass


class OpenAqClient:
    """Rate-limit-aware OpenAQ client.

    OpenAQ allows **60 requests per minute** on a free key. That is a real
    constraint here rather than a theoretical one: a full run touches ~10
    localities, each considering several stations, each station needing one
    sensor-listing call plus one call per pollutant for the 24-hour window. Left
    unmanaged, a single run exhausts the minute's budget within the first two
    localities and every subsequent one reports "no station in range" — a failure
    that looks exactly like missing data rather than like throttling.

    So: the client reads the rate-limit headers and pauses before it would run
    out, retries on 429, and caches per-station responses for the run, since
    neighbouring localities routinely resolve to the same station.
    """

    def __init__(self, timeout: float = 30.0) -> None:
        self._client = httpx.Client(
            base_url=BASE_URL,
            headers={"X-API-Key": OPENAQ.require()},
            timeout=timeout,
        )
        self._remaining: Optional[int] = None
        self._reset_seconds: int = 60
        self._sensor_cache: dict[int, dict[str, Any]] = {}
        self._station_cache: dict[tuple[float, float, int], list[dict[str, Any]]] = {}

    def __enter__(self) -> "OpenAqClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _get(self, path: str, _attempt: int = 0, **params: Any) -> dict[str, Any]:
        # Pause *before* spending the last of the budget rather than after being
        # refused — a 429 costs the same wait plus a wasted request.
        if self._remaining is not None and self._remaining <= 2:
            wait = max(1, self._reset_seconds) + 1
            log.info("OpenAQ budget nearly spent; pausing %ss for the window to reset", wait)
            time.sleep(wait)
            self._remaining = None

        response = self._client.get(path, params=params)

        remaining = response.headers.get("X-Ratelimit-Remaining")
        reset = response.headers.get("X-Ratelimit-Reset")
        if remaining is not None and remaining.isdigit():
            self._remaining = int(remaining)
        if reset is not None and reset.isdigit():
            self._reset_seconds = int(reset)

        if response.status_code == 401:
            raise OpenAqError(
                "OpenAQ rejected the API key (401). Check OPENAQ_API_KEY in .env — "
                "get a free one at https://explore.openaq.org/register"
            )
        if response.status_code == 429:
            if _attempt >= 2:
                raise OpenAqError("OpenAQ rate limit hit (429) and retries exhausted.")
            wait = max(1, self._reset_seconds) + 1
            log.info("OpenAQ returned 429; retrying in %ss", wait)
            time.sleep(wait)
            self._remaining = None
            return self._get(path, _attempt=_attempt + 1, **params)

        response.raise_for_status()
        return response.json()

    # -- stations ---------------------------------------------------------

    def live_stations_near(
        self, lat: float, lon: float, *, radius_m: int = 25_000, now: Optional[datetime] = None
    ) -> list[dict[str, Any]]:
        """Stations within radius that are actually reporting, nearest first.

        OpenAQ caps `radius` at 25 km, so a locality with no live station inside
        that ring simply has none — the agent degrades confidence rather than
        widening the search until it finds another city's air.
        """
        now = now or datetime.now(timezone.utc)
        cutoff = now - LIVE_WITHIN

        # Neighbouring localities produce near-identical queries; rounding to ~1 km
        # lets them share one response instead of each spending a request.
        cache_key = (round(lat, 2), round(lon, 2), min(radius_m, 25_000))
        if cache_key in self._station_cache:
            return self._station_cache[cache_key]

        payload = self._get(
            "/locations",
            coordinates=f"{lat},{lon}",
            radius=min(radius_m, 25_000),
            limit=100,
        )

        live: list[dict[str, Any]] = []
        for result in payload.get("results", []):
            last_seen = _parse_dt((result.get("datetimeLast") or {}).get("utc"))
            if last_seen is None or last_seen < cutoff:
                continue
            coords = result.get("coordinates") or {}
            if coords.get("latitude") is None or coords.get("longitude") is None:
                continue
            live.append(
                {
                    "id": result["id"],
                    "name": result.get("name") or f"OpenAQ {result['id']}",
                    "lat": coords["latitude"],
                    "lon": coords["longitude"],
                    "provider": (result.get("provider") or {}).get("name"),
                    "last_seen": last_seen,
                }
            )
        self._station_cache[cache_key] = live
        return live

    # -- current values ---------------------------------------------------

    def rolling_24h_concentrations(
        self, sensor_ids: dict[str, int], *, now: Optional[datetime] = None
    ) -> tuple[dict[str, float], dict[str, int]]:
        """24-hour mean concentration per pollutant, in CPCB units.

        **This, not the latest hour, is what a CPCB AQI is computed from.** The
        National AQI breakpoint table is defined on 24-hour averages (8-hour for
        CO and O3), so indexing a single instantaneous reading against it
        overstates the number badly: Vikas Sadan, Gurugram read 140.5 µg/m³ of
        PM2.5 at 19:15 on 2026-08-17 — AQI 316, "Very Poor" — against a 24-hour
        mean of 89.6, which is AQI 199. Publishing the former would have told a
        buyer the air was in a crisis band on an ordinary evening.

        Returns (means, hours contributing per pollutant).
        """
        now = now or datetime.now(timezone.utc)
        window_start = now - timedelta(hours=24)

        means: dict[str, float] = {}
        counts: dict[str, int] = {}

        for column, sensor_id in sensor_ids.items():
            try:
                payload = self._get(
                    f"/sensors/{sensor_id}/measurements/hourly",
                    datetime_from=window_start.strftime("%Y-%m-%dT%H:00:00Z"),
                    limit=24,
                )
            except Exception:
                continue  # one sensor's outage shouldn't lose the whole reading

            values: list[float] = []
            for result in payload.get("results", []):
                value = result.get("value")
                if value is None:
                    continue
                units = (result.get("parameter") or {}).get("units") or ""
                converted = _to_cpcb_units(column, value, units)
                if converted is not None and converted >= 0:
                    values.append(converted)

            if values:
                means[column] = sum(values) / len(values)
                counts[column] = len(values)

        return means, counts

    def latest_concentrations(
        self, location_id: int
    ) -> tuple[dict[str, float], Optional[datetime], dict[str, int]]:
        """Latest single-hour concentration per pollutant for one station.

        Used for the "as of" timestamp and the latest-hour figure shown beside the
        headline AQI — never for the headline AQI itself, which comes from
        rolling_24h_concentrations above.

        Returns (concentrations in CPCB units, observed_at, sensor_id per
        pollutant). The sensor ids are handed back so the 24-hour and history
        fetches reuse exactly the sensors the current reading came from.
        """
        if location_id in self._sensor_cache:
            payload = self._sensor_cache[location_id]
        else:
            payload = self._get(f"/locations/{location_id}/sensors")
            self._sensor_cache[location_id] = payload

        # Keep the best sensor per pollutant: native unit first, then most recent.
        best: dict[str, dict[str, Any]] = {}
        for sensor in payload.get("results", []):
            parameter = (sensor.get("parameter") or {}).get("name")
            column = PARAMETER_MAP.get(parameter)
            if column is None:
                continue

            latest = sensor.get("latest") or {}
            value = latest.get("value")
            observed = _parse_dt((latest.get("datetime") or {}).get("utc"))
            if value is None or observed is None:
                continue

            units = (sensor.get("parameter") or {}).get("units") or ""
            candidate = {
                "sensor_id": sensor["id"],
                "value": value,
                "units": units,
                "observed_at": observed,
            }
            incumbent = best.get(column)
            if incumbent is None or _sensor_rank(candidate) > _sensor_rank(incumbent):
                best[column] = candidate

        concentrations: dict[str, float] = {}
        sensor_ids: dict[str, int] = {}
        observed_times: list[datetime] = []

        for column, sensor in best.items():
            converted = _to_cpcb_units(column, sensor["value"], sensor["units"])
            if converted is None:
                continue
            concentrations[column] = converted
            sensor_ids[column] = sensor["sensor_id"]
            observed_times.append(sensor["observed_at"])

        observed_at = max(observed_times) if observed_times else None
        return concentrations, observed_at, sensor_ids

    # -- history ----------------------------------------------------------

    def daily_history(
        self, sensor_id: int, *, column: str, days: int = 30, now: Optional[datetime] = None
    ) -> dict[date, tuple[float, int]]:
        """Daily means for one sensor, as {day: (value in CPCB units, n hours)}.

        `observedCount` is carried through because a day averaged from four
        readings is not the same claim as one averaged from ninety-six, and the
        chart dims the thin ones rather than hiding the difference.
        """
        now = now or datetime.now(timezone.utc)
        start = (now - timedelta(days=days)).date()

        payload = self._get(
            f"/sensors/{sensor_id}/measurements/daily",
            datetime_from=start.isoformat(),
            datetime_to=now.date().isoformat(),
            limit=days + 5,
        )

        history: dict[date, tuple[float, int]] = {}
        for result in payload.get("results", []):
            period = result.get("period") or {}
            stamp = (period.get("datetimeFrom") or {}).get("local")
            value = result.get("value")
            if stamp is None or value is None:
                continue
            units = (result.get("parameter") or {}).get("units") or ""
            converted = _to_cpcb_units(column, value, units)
            if converted is None:
                continue
            day = date.fromisoformat(stamp[:10])
            count = (result.get("coverage") or {}).get("observedCount") or 0
            history[day] = (converted, count)
        return history


# ---------------------------------------------------------------------------


def could_meet_cpcb_minimum(columns: Iterable[str]) -> bool:
    """Cheap pre-check: could this pollutant set ever produce a CPCB AQI?

    Answered from the sensor listing alone, before spending one request per
    pollutant on the 24-hour window. Low-cost PM-only sensors — common in
    OpenAQ's Indian coverage and often nearer than the regulatory station — fail
    here for the cost of nothing.
    """
    columns = set(columns)
    return len(columns) >= MIN_POLLUTANTS_FOR_AQI and any(p in columns for p in PARTICULATES)


def _sensor_rank(sensor: dict[str, Any]) -> tuple[int, datetime]:
    """Prefer a native-unit sensor, then the most recently reporting one."""
    native = 1 if sensor["units"] in ("µg/m³", "ug/m3", "mg/m³") else 0
    return native, sensor["observed_at"]


def _to_cpcb_units(column: str, value: float, units: str) -> Optional[float]:
    """Convert an OpenAQ reading into the units the CPCB AQI table expects.

    CPCB indexes CO in mg/m³ and everything else in µg/m³. ppb readings are
    converted with standard-temperature factors, which is an approximation — see
    PPB_TO_UGM3 — and is why native µg/m³ sensors are preferred when a station
    exposes both.
    """
    units = (units or "").strip()

    if units in ("µg/m³", "ug/m3"):
        micrograms = value
    elif units == "mg/m³":
        micrograms = value * 1000.0
    elif units == "ppb":
        factor = PPB_TO_UGM3.get(column)
        if factor is None:
            return None
        micrograms = value * factor
    elif units == "ppm":
        factor = PPB_TO_UGM3.get(column)
        if factor is None:
            return None
        micrograms = value * 1000.0 * factor
    else:
        return None  # unknown unit: drop rather than guess

    return micrograms / 1000.0 if column == "co" else micrograms


def _parse_dt(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
