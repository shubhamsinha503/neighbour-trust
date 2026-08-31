"""GDELT DOC 2.0 client.

Free, no API key, and it indexes non-English press — which matters more than it
sounds. docs/strategy.md notes that most hyperlocal incident reporting in India
runs in vernacular papers, so an English-only search would systematically miss
exactly the coverage this agent exists to find. A probe for "Indiranagar" during
development returned Marathi results alongside English ones, so the multilingual
coverage is real.

Two operational facts shape everything here:

**One request per 5 seconds.** GDELT says so in the body of a 200 response —
a rate-limited call returns plain text, not JSON, and json.loads() on it fails
with a confusing "Expecting value: line 1 column 1". So the client paces itself
and treats a non-JSON body as throttling rather than as a parse bug.

**Precision is roughly 50%.** The same "Indiranagar" probe returned four
articles: one genuinely about Indiranagar's footpaths, one Bengaluru stabbing
that may or may not be local, one stabbing in Maharashtra, and one Marathi story
about Paithan. Keyword matching alone cannot tell those apart, which is why
nothing here decides whether a mention is an incident — see classify.py.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any, Iterator, Optional

import httpx

BASE_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
SOURCE_NAME = "GDELT"
SOURCE_URL = "https://www.gdeltproject.org/"

# GDELT's stated limit is one request every 5 seconds. 6 gives headroom without
# meaningfully lengthening a weekly job.
MIN_SECONDS_BETWEEN_REQUESTS = 6.0

# Terms that, combined with a locality name, surface the incident types each
# category cares about. Kept deliberately broad — recall matters more than
# precision at this stage, because the classifier downstream can reject a
# false positive but cannot recover an article that was never fetched.
CATEGORY_TERMS: dict[str, list[str]] = {
    "crime": [
        "theft", "robbery", "snatching", "burglary", "assault",
        "murder", "molestation", "harassment", "police",
    ],
    "water": [
        "water", "tanker", "sewage", "borewell",
        "waterlogging", "flooding", "contamination", "pipeline",
    ],
}

log = logging.getLogger(__name__)


class GdeltError(RuntimeError):
    pass


class GdeltClient:
    def __init__(self, timeout: float = 60.0) -> None:
        self._client = httpx.Client(
            timeout=timeout,
            headers={"User-Agent": "NeighbourTrust/0.1 (neighbourhood data for home buyers)"},
        )
        self._last_request_at = 0.0

    def __enter__(self) -> "GdeltClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < MIN_SECONDS_BETWEEN_REQUESTS:
            time.sleep(MIN_SECONDS_BETWEEN_REQUESTS - elapsed)
        self._last_request_at = time.monotonic()

    def _get(self, params: dict[str, Any], *, attempt: int = 0) -> dict[str, Any]:
        self._throttle()
        response = self._client.get(BASE_URL, params=params)
        response.raise_for_status()

        body = response.text.strip()
        if not body:
            return {}
        if not body.startswith("{"):
            # GDELT reports throttling and query errors as plain text with a 200.
            if "limit requests" in body.lower() and attempt < 2:
                log.info("GDELT throttling; backing off")
                time.sleep(MIN_SECONDS_BETWEEN_REQUESTS * 2)
                return self._get(params, attempt=attempt + 1)
            raise GdeltError(f"GDELT returned a non-JSON body: {body[:160]}")

        return response.json()

    def search_locality(
        self,
        *,
        locality: str,
        city: str,
        category: str,
        months: int = 12,
        max_records: int = 60,
    ) -> Iterator[dict[str, Any]]:
        """Articles mentioning a locality alongside that category's vocabulary.

        The locality name is quoted so GDELT matches the phrase rather than its
        words separately — without quotes "Golf Course Road" matches any article
        containing "golf". The city name is deliberately *not* required in the
        query: Indian local reporting frequently names only the locality, and
        requiring both cost more recall than it bought precision in testing.
        The city is passed to the classifier instead, which can weigh it.
        """
        terms = CATEGORY_TERMS.get(category)
        if not terms:
            raise GdeltError(f"No search terms defined for category {category!r}")

        query = f'"{locality}" ({" OR ".join(terms)})'
        payload = self._get(
            {
                "query": query,
                "mode": "artlist",
                "format": "json",
                "maxrecords": max_records,
                "timespan": f"{months}m",
                "sort": "datedesc",
            }
        )

        for article in payload.get("articles", []):
            parsed = _parse(article, query_term=query)
            if parsed is not None:
                yield parsed


def _parse(article: dict[str, Any], *, query_term: str) -> Optional[dict[str, Any]]:
    url = (article.get("url") or "").strip()
    title = (article.get("title") or "").strip()
    if not url or not title:
        return None

    return {
        "url": url,
        "title": title,
        "domain": (article.get("domain") or "").strip() or None,
        "language": (article.get("language") or "").strip() or None,
        "source_country": (article.get("sourcecountry") or "").strip() or None,
        "published_at": _parse_seendate(article.get("seendate")),
        "query_term": query_term,
    }


def _parse_seendate(raw: Any) -> Optional[datetime]:
    """GDELT stamps are UTC, formatted YYYYMMDDTHHMMSSZ."""
    if not raw:
        return None
    try:
        return datetime.strptime(str(raw).strip(), "%Y%m%dT%H%M%SZ").replace(
            tzinfo=timezone.utc
        )
    except ValueError:
        return None
