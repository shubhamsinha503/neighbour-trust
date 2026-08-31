"""UDISE school records via the India Data Portal CKAN datastore.

No API key. The datastore is fully open for reads, which makes this the only
source in the project so far that needs no credential — worth knowing before
anyone goes hunting for a UDISE+ login.

Three things about this source shape the code:

**It is a snapshot, not a feed.** `data_retreival_date` on the resource is
2022-01-12, and the dataset has exactly one resource. There is no newer cycle
here and no incremental endpoint, so the agent's job is a periodic full reload of
two cities rather than a poll for changes. The vintage is read from the resource
metadata rather than hardcoded, so a refresh upstream flows through to the
confidence tag on its own.

**There is no official UDISE+ bulk API.** udiseplus.gov.in serves per-school
report cards behind a school-code lookup, so the alternative to this mirror is
scraping ~3,000 pages per refresh. That is a real option if freshness becomes the
blocker, but it is not free.

**Bengaluru is split into UDISE *education* districts**, which are not the
administrative ones: "Bengaluru U South", "Bengaluru U North", "Bengaluru Rural".
There is no "Bengaluru Urban". A lookup by the obvious name returns zero rows,
silently, which is exactly the kind of empty result that looks like a code bug
for an hour.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

import httpx

BASE_URL = "https://ckandev.indiadataportal.com/api/3/action"
RESOURCE_ID = "457fddf1-982f-4c85-855d-5095578accc1"
SOURCE_NAME = "UDISE via India Data Portal"
SOURCE_URL = "https://ckandev.indiadataportal.com/dataset/udise"

# City -> the UDISE education districts that make it up. See the module docstring:
# these are not administrative district names and cannot be derived from them.
CITY_DISTRICTS: dict[str, list[str]] = {
    "Bengaluru": ["Bengaluru U South", "Bengaluru U North", "Bengaluru Rural"],
    "Gurugram": ["Gurugram"],
}

# Rough city centres, used only to reject records whose coordinates are plainly
# wrong. UDISE contains schools filed under a Bengaluru district but sitting
# 400 km away in Dharwad — a small tail, but one bad coordinate becomes a school
# that appears in the wrong buyer's search results.
CITY_CENTRES: dict[str, tuple[float, float]] = {
    "Bengaluru": (12.9716, 77.5946),
    "Gurugram": (28.4595, 77.0266),
}
MAX_KM_FROM_CITY_CENTRE = 60.0

PAGE_SIZE = 1000

log = logging.getLogger(__name__)

# UDISE marks closed and merged schools rather than removing them.
DEAD_STATUSES = ("closed", "merged", "not functional")


class UdiseError(RuntimeError):
    pass


class UdiseClient:
    def __init__(self, timeout: float = 60.0) -> None:
        self._client = httpx.Client(base_url=BASE_URL, timeout=timeout)

    def __enter__(self) -> "UdiseClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _get(self, action: str, **params: Any) -> dict[str, Any]:
        response = self._client.get(f"/{action}", params=params)
        response.raise_for_status()
        body = response.json()
        if not body.get("success"):
            raise UdiseError(f"{action} failed: {str(body.get('error'))[:300]}")
        return body["result"]

    def data_vintage(self) -> datetime:
        """When the underlying UDISE snapshot was taken.

        Read from resource metadata rather than hardcoded so that if the portal
        publishes a fresher cycle, the confidence tag improves without a code
        change. Falls back to the known 2022 date rather than to "now" — assuming
        today would silently turn four-year-old data into fresh data, which is
        the single worst failure this field exists to prevent.
        """
        try:
            resource = self._get("resource_show", id=RESOURCE_ID)
            raw = str(resource.get("data_retreival_date") or "").strip()
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                try:
                    return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
                except ValueError:
                    continue
            log.warning("UDISE: unparseable data_retreival_date %r; using known snapshot date", raw)
        except Exception as exc:
            log.warning("UDISE: could not read resource metadata (%s); using known snapshot date", exc)
        return datetime(2022, 1, 12, tzinfo=timezone.utc)

    def schools_for_city(self, city: str) -> Iterator[dict[str, Any]]:
        """Every UDISE record for a city, paged, with obvious junk dropped."""
        districts = CITY_DISTRICTS.get(city)
        if not districts:
            raise UdiseError(
                f"No UDISE education districts mapped for {city!r}. "
                f"Known: {sorted(CITY_DISTRICTS)}. These are education districts, "
                "not administrative ones — see CITY_DISTRICTS."
            )

        centre = CITY_CENTRES.get(city)
        for district in districts:
            yield from self._schools_for_district(district, centre=centre)

    def _schools_for_district(
        self, district: str, *, centre: Optional[tuple[float, float]]
    ) -> Iterator[dict[str, Any]]:
        offset = 0
        kept = dropped = 0

        while True:
            result = self._get(
                "datastore_search",
                resource_id=RESOURCE_ID,
                filters=json.dumps({"district_name": district}),
                limit=PAGE_SIZE,
                offset=offset,
            )
            records = result.get("records", [])
            if not records:
                break

            for record in records:
                parsed = _parse(record, centre=centre)
                if parsed is None:
                    dropped += 1
                    continue
                kept += 1
                yield parsed

            offset += len(records)
            if offset >= (result.get("total") or 0):
                break

        log.info("UDISE %s: %d schools kept, %d dropped", district, kept, dropped)


def _parse(
    record: dict[str, Any], *, centre: Optional[tuple[float, float]]
) -> Optional[dict[str, Any]]:
    """Normalize one UDISE row, or None if it cannot be trusted."""
    from agents.common.geo import haversine_km

    code = str(record.get("udise_school_code") or "").strip()
    name = str(record.get("school_name") or "").strip()
    if not code or not name:
        return None

    lat, lon = _number(record.get("latitude")), _number(record.get("longitude"))
    if lat is None or lon is None:
        return None
    # 0,0 is the Gulf of Guinea, and it is what an unfilled coordinate looks like.
    if lat == 0 and lon == 0:
        return None
    if centre is not None and haversine_km(centre[0], centre[1], lat, lon) > MAX_KM_FROM_CITY_CENTRE:
        return None

    if str(record.get("status") or "").strip().lower() in DEAD_STATUSES:
        return None

    return {
        "udise_code": code,
        "name": _titleish(name),
        "state": _text(record.get("state_name")),
        "district": _text(record.get("district_name")),
        "pincode": _text(record.get("pincode")),
        "lat": lat,
        "lon": lon,
        "school_category": _text(record.get("school_category")),
        "school_type": _text(record.get("school_type")),
        "management": _text(record.get("management")),
        "board_secondary": _board(record.get("aff_board_sec")),
        "board_higher_sec": _board(record.get("aff_board_h_sec")),
        "year_established": _int(record.get("year_of_establishment")),
        "class_from": _text(record.get("class_from")),
        "class_to": _text(record.get("class_to")),
        "total_teachers": _int(record.get("total_teachers")),
        "total_students": _int(record.get("class_students")),
        "class_rooms": _int(record.get("class_rooms")),
        "other_rooms": _int(record.get("other_rooms")),
    }


def _text(raw: Any) -> Optional[str]:
    text = str(raw or "").strip()
    return text or None


def _number(raw: Any) -> Optional[float]:
    if raw is None:
        return None
    try:
        return float(str(raw).strip())
    except (ValueError, TypeError):
        return None


def _int(raw: Any) -> Optional[int]:
    value = _number(raw)
    if value is None or value < 0:
        return None
    return int(value)


def _board(raw: Any) -> Optional[str]:
    text = str(raw or "").strip()
    if not text or text.lower() in ("nan", "none", "na", "n/a", "0", "others"):
        return None
    return text


# Genuine acronyms in Indian school names, kept upper-case. An explicit list
# rather than a "short and upper-case" heuristic: that heuristic leaves "SRI" and
# "GOVT" shouting on the card, since they are short and capitalised in the source
# like everything else. UDISE stores every name in caps, so the source gives no
# signal about which tokens are acronyms — only a list can.
NAME_ACRONYMS = frozenset({
    "CBSE", "ICSE", "IB", "IGCSE", "NIOS", "SSLC",
    "KV", "JNV", "BBMP", "BEO",
    "GHS", "GLPS", "GHPS", "GMPS", "GUPS", "GPS", "UPS", "LPS", "HPS", "MPS",
    "PU", "EM", "TMS", "MGM", "SDMC",
})


def _titleish(name: str) -> str:
    """UDISE stores names in caps; title-case reads better on a card.

    Only tokens in NAME_ACRONYMS stay upper-case. Everything else is
    title-cased, including short words like SRI and GOVT that a length-based
    rule would wrongly preserve.
    """
    words = []
    for word in name.split():
        stripped = word.strip(".,()").upper()
        words.append(word.upper() if stripped in NAME_ACRONYMS else word.capitalize())
    return " ".join(words)
