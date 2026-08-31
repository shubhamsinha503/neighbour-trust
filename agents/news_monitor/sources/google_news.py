"""Google News RSS — locality news search.

Added when GDELT became unreachable from two independent networks (this
machine and GitHub's runners both timed out, including on the TLS handshake),
having worked earlier the same day. docs/strategy.md names Google News RSS as
the complement to GDELT for exactly the cases GDELT's event taxonomy does not
cleanly categorise, so this is the documented fallback rather than an
improvisation.

It is arguably the better source for this job anyway. GDELT's index is
English-weighted, and docs/strategy.md is explicit that most hyperlocal incident
reporting in India runs in vernacular press — so an English-only search
systematically misses exactly the coverage the agent exists to find. Google News
exposes language and edition as query parameters, so the same locality can be
searched in English, Hindi and Kannada for the cost of three requests.

Two things learned from live probing, both of which silently produce wrong
results rather than errors:

  1. **`when:12m` is not supported.** A query containing it returns *zero*
     items with HTTP 200 — no error, no warning. The date window is therefore
     applied here in code, against each item's `pubDate`.
  2. **Titles carry a trailing " - Publisher".** Google appends the source name
     to every headline. Left in place it becomes noise the classifier has to
     reason around, and the publisher is already available separately in the
     `<source>` element.
"""

from __future__ import annotations

import logging
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Iterator, Optional
from urllib.parse import quote_plus

import httpx

BASE_URL = "https://news.google.com/rss/search"
SOURCE_NAME = "Google News"
SOURCE_URL = "https://news.google.com/"

# Editions to search per city. Hyperlocal Indian reporting is heavily
# vernacular, and a locality name is usually spelled the same in the local
# script's transliteration, so the same query works across editions.
CITY_EDITIONS: dict[str, list[tuple[str, str]]] = {
    # (hl, ceid) — interface language and edition
    "Bengaluru": [("en-IN", "IN:en"), ("kn", "IN:kn")],
    "Gurugram": [("en-IN", "IN:en"), ("hi", "IN:hi")],
}
DEFAULT_EDITIONS = [("en-IN", "IN:en")]

# Search vocabulary per category. Kept aligned with the GDELT client so a
# locality searched through either source is asking the same question.
CATEGORY_TERMS: dict[str, list[str]] = {
    "crime": [
        "theft", "robbery", "snatching", "burglary",
        "assault", "murder", "molestation", "police",
    ],
    "water": [
        "water", "waterlogging", "flooding", "tanker",
        "sewage", "borewell", "contamination",
    ],
}

# Google News RSS has no published rate limit, but it is a free endpoint being
# polled on a schedule; a second between requests keeps this a good citizen.
SECONDS_BETWEEN_REQUESTS = 1.5

log = logging.getLogger(__name__)


class GoogleNewsError(RuntimeError):
    pass


class GoogleNewsClient:
    def __init__(self, timeout: float = 40.0) -> None:
        self._client = httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            headers={"User-Agent": "NeighbourTrust/0.1 (neighbourhood data for home buyers)"},
        )
        self._last_request_at = 0.0

    def __enter__(self) -> "GoogleNewsClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < SECONDS_BETWEEN_REQUESTS:
            time.sleep(SECONDS_BETWEEN_REQUESTS - elapsed)
        self._last_request_at = time.monotonic()

    def search_locality(
        self,
        *,
        locality: str,
        city: str,
        category: str,
        months: int = 12,
        now: Optional[datetime] = None,
    ) -> Iterator[dict[str, Any]]:
        """Articles naming a locality alongside a category's vocabulary.

        Searched once per edition configured for the city, so a Gurugram query
        covers Hindi as well as English. Results are deduplicated on URL, since
        a story carried by several outlets appears once per edition.
        """
        terms = CATEGORY_TERMS.get(category)
        if not terms:
            raise GoogleNewsError(f"No search terms for category {category!r}")

        now = now or datetime.now(timezone.utc)
        cutoff = now - timedelta(days=months * 31)

        # The locality is quoted so Google matches the phrase; without quotes
        # "Golf Course Road" matches any article containing "golf".
        query = f'"{locality}" ({" OR ".join(terms)})'
        editions = CITY_EDITIONS.get(city, DEFAULT_EDITIONS)

        seen: set[str] = set()
        for hl, ceid in editions:
            try:
                items = self._fetch(query, hl=hl, ceid=ceid)
            except Exception as exc:
                log.warning("Google News %s/%s failed for %s: %s", hl, category, locality, exc)
                continue

            for item in items:
                parsed = _parse(item, query_term=query, language=hl)
                if parsed is None:
                    continue
                published = parsed["published_at"]
                # `when:` is unsupported, so the window is enforced here.
                if published is not None and published < cutoff:
                    continue
                if parsed["url"] in seen:
                    continue
                seen.add(parsed["url"])
                yield parsed

    def _fetch(self, query: str, *, hl: str, ceid: str) -> list[ET.Element]:
        self._throttle()
        url = f"{BASE_URL}?q={quote_plus(query)}&hl={hl}&gl=IN&ceid={ceid}"
        response = self._client.get(url)
        response.raise_for_status()

        try:
            root = ET.fromstring(response.content)
        except ET.ParseError as exc:
            raise GoogleNewsError(f"unparseable RSS: {exc}") from exc
        return root.findall(".//item")


def _parse(
    item: ET.Element, *, query_term: str, language: str
) -> Optional[dict[str, Any]]:
    url = (item.findtext("link") or "").strip()
    raw_title = (item.findtext("title") or "").strip()
    if not url or not raw_title:
        return None

    source_el = item.find("source")
    publisher = (source_el.text or "").strip() if source_el is not None else None

    return {
        "url": url,
        "title": _strip_publisher(raw_title, publisher),
        "domain": publisher,
        "language": language,
        "source_country": "India",
        "published_at": _parse_pubdate(item.findtext("pubDate")),
        "query_term": query_term,
    }


def _strip_publisher(title: str, publisher: Optional[str]) -> str:
    """Remove Google's trailing " - Publisher" from a headline.

    Only when it actually matches the `<source>` element — headlines legitimately
    contain dashes, and cutting at the last one would truncate real titles.
    """
    if publisher and title.endswith(f" - {publisher}"):
        return title[: -len(publisher) - 3].strip()
    return title


def _parse_pubdate(raw: Optional[str]) -> Optional[datetime]:
    """RSS pubDate is RFC 2822: 'Mon, 25 Aug 2026 09:13:00 GMT'."""
    if not raw:
        return None
    try:
        parsed = parsedate_to_datetime(raw.strip())
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
