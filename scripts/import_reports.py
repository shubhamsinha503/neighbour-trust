"""Import resident reports from the Google Form's response sheet.

    python -m scripts.import_reports --file responses.csv
    python -m scripts.import_reports --file responses.csv --dry-run
    python -m scripts.import_reports --url "https://docs.google.com/.../pub?output=csv"

**Why a CSV and not the Sheets API.** The API needs a Google Cloud project, a
service account and a key file on every machine that runs this. The form already
writes a sheet, and a sheet already exports CSV. Nothing here is worth a
credential yet — and the day it is, this file changes and nothing else does.

**A warning about --url.** Publishing a response sheet to the web makes it
readable by anyone with the link, and the form has an optional email field. Do
not publish a sheet that still contains that column. Download the file and use
--file, or publish a filtered sheet with the email column removed. The importer
cannot tell the difference and will not warn you.

**Idempotency without a response id.** Google's CSV export carries a timestamp
but no stable identifier, so this derives one: a hash of the submission time and
what was written. Re-importing the same export inserts nothing. Two different
people who submit identical text in the same second would collide, which is a
trade accepted deliberately — the alternative is duplicating every report on
every import, which is the failure that actually happens.

**Nothing is imported as accepted.** Every row lands in the moderation queue, by
way of a helper that has no way to say otherwise.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import pathlib
import re
import sys
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

import httpx
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

from agents.common import db  # noqa: E402

# Columns are matched on a distinctive fragment of the question rather than the
# whole string, so rewording a question in the form does not silently stop the
# import. A required column that goes missing raises instead.
COLUMN_HINTS: dict[str, str] = {
    "submitted_at":    "timestamp",
    "locality":        "which locality",
    "category":        "what is this about",
    "body":            "what did you see",
    "occurred_window": "when did this happen",
    "basis":           "how do you know",
    "tie_to_area":     "how long have you been",
    "evidence_url":    "link or photo",
    "contact_email":   "email",
}
REQUIRED = ("locality", "category", "body")

# The form's own answer text, mapped to what the database stores. Written out in
# full rather than normalised, because these strings are a contract with a form
# a human edits: an unrecognised answer must be reported, never guessed at.
CATEGORY_MAP: dict[str, str] = {
    "safety or crime": "crime",
    "water (supply, flooding, quality)": "water",
    "power cuts": "power",
    "schools": "schools",
    "air quality or pollution": "air_quality",
    "roads, transport or nearby construction": "infrastructure",
}

WINDOW_MAP: dict[str, str] = {
    "in the last week": "last_week",
    "in the last month": "last_month",
    "in the last 6 months": "last_6_months",
    "longer ago than that": "older",
    "it's ongoing": "ongoing",
    "its ongoing": "ongoing",
}

BASIS_MAP: dict[str, str] = {
    "it happened to me": "happened_to_me",
    "i saw it myself": "witnessed",
    "a neighbour or family member told me": "second_hand",
    "i read it in the news or a local group": "read_it",
    "something else": "unstated",
}

TIE_MAP: dict[str, str] = {
    "i live here now": "lives_here",
    "i used to live here": "lived_here",
    "i work here": "works_here",
    "i was considering moving here": "considering",
    "just visiting or passing through": "visiting",
}

# Answers that are real but unstorable. Reported by name so they can be handled
# by hand — dropping them silently would lose the reports most likely to be
# telling us something the form's own options did not anticipate.
UNMAPPABLE = {
    "something else": "category not one we model",
    "my locality isn't listed": "locality outside the launch set",
    "my locality isnt listed": "locality outside the launch set",
}


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "")).strip().lower()


def resolve_columns(header: Iterable[str]) -> dict[str, Optional[str]]:
    """Map our field names onto whatever the sheet's columns are called."""
    columns = list(header)
    found: dict[str, Optional[str]] = {}
    for field, hint in COLUMN_HINTS.items():
        found[field] = next(
            (c for c in columns if hint in _norm(c)), None
        )
    missing = [f for f in REQUIRED if found[f] is None]
    if missing:
        raise SystemExit(
            f"The sheet has no column for: {', '.join(missing)}.\n"
            f"Columns seen: {', '.join(columns)}\n"
            "If a question was reworded, update COLUMN_HINTS in this file."
        )
    return found


def parse_timestamp(raw: str) -> Optional[datetime]:
    """Google exports local time in the form owner's timezone, unlabelled.

    Read as-is and stamped UTC. It is used for ordering and for ageing a report
    over months, so a few hours of offset changes nothing; inventing a timezone
    we were not told would be the worse error.
    """
    raw = (raw or "").strip()
    for fmt in ("%d/%m/%Y %H:%M:%S", "%m/%d/%Y %H:%M:%S",
                "%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M", "%Y/%m/%d %H:%M:%S"):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def external_id(submitted: str, body: str) -> str:
    digest = hashlib.sha256(f"{submitted}\x00{body}".encode("utf-8")).hexdigest()
    return f"gform:{digest[:24]}"


def read_rows(args) -> list[dict[str, str]]:
    if args.file:
        text = pathlib.Path(args.file).read_text(encoding="utf-8-sig")
    else:
        response = httpx.get(args.url, follow_redirects=True, timeout=60.0)
        response.raise_for_status()
        text = response.text
    return list(csv.DictReader(io.StringIO(text)))


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Import resident reports from the form.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--file", help="Downloaded CSV export of the response sheet.")
    source.add_argument("--url", help="Published-to-web CSV URL. Read the warning above.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Parse and report, write nothing.")
    args = parser.parse_args(argv)

    rows = read_rows(args)
    if not rows:
        print("No rows in the export.")
        return 0

    columns = resolve_columns(rows[0].keys())
    if columns["contact_email"] and args.url:
        print("WARNING: this sheet still has an email column and you are reading it\n"
              "         over the web. If it is published publicly, those addresses are\n"
              "         public too. See the note at the top of this file.\n",
              file=sys.stderr)

    imported = duplicate = 0
    skipped: list[tuple[str, str]] = []

    with db.connect() as conn:
        localities = {
            _norm(row["name"]): row for row in db.list_localities(conn)
        }

        for index, row in enumerate(rows, start=2):  # row 1 is the header
            def value(field: str) -> str:
                column = columns[field]
                return (row.get(column) or "").strip() if column else ""

            body = value("body")
            locality_answer = _norm(value("locality"))
            category_answer = _norm(value("category"))

            if not body:
                skipped.append((f"row {index}", "no description given"))
                continue

            reason = UNMAPPABLE.get(locality_answer) or UNMAPPABLE.get(category_answer)
            if reason:
                skipped.append((f"row {index}", f"{reason} — needs handling by hand"))
                continue

            locality = localities.get(locality_answer)
            if locality is None:
                skipped.append((f"row {index}", f"unknown locality {value('locality')!r}"))
                continue

            category = CATEGORY_MAP.get(category_answer)
            if category is None:
                skipped.append((f"row {index}", f"unknown category {value('category')!r}"))
                continue

            submitted_raw = value("submitted_at")
            report_id = db.insert_resident_report(
                conn,
                locality_id=locality["id"],
                h3_cell=locality["h3_cell"],
                category=category,
                body=body,
                occurred_window=WINDOW_MAP.get(_norm(value("occurred_window"))),
                basis=BASIS_MAP.get(_norm(value("basis")), "unstated"),
                tie_to_area=TIE_MAP.get(_norm(value("tie_to_area")), "unstated"),
                evidence_url=value("evidence_url") or None,
                contact_email=value("contact_email") or None,
                source="google_form",
                external_id=external_id(submitted_raw, body),
                submitted_at=parse_timestamp(submitted_raw),
            )
            if report_id is None:
                duplicate += 1
            else:
                imported += 1
                print(f"  + {locality['slug']:18s} {category:14s} {body[:52]}")

        if args.dry_run:
            conn.rollback()
            print("\nDry run — nothing written.")
        else:
            conn.commit()

        pending = len(db.pending_reports(conn, limit=500))

    print(f"\n{imported} imported, {duplicate} already present, {len(skipped)} skipped.")
    if skipped:
        print("\nSkipped, and why — these are not lost, only unimported:")
        for where, why in skipped:
            print(f"  {where:10s} {why}")

    print(f"\n{pending} report(s) waiting for review. Nothing counts until accepted.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
