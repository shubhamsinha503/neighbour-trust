#!/usr/bin/env python3
"""Prime the Q&A answer cache before a demo.

The API caches each grounded answer (see apps/api/app/main.py), so the second
and later asks of a question return in milliseconds. This primes that cache: it
asks the app's suggested questions — plus a couple of common ones — for the
localities you name, against a running API, so the first visitor tap is already
a cache hit.

Run once, pointed at the deployed API, shortly before presenting:

    python scripts/warm_qa.py --base https://<your-api-host> btm-layout ameerpet

The cache lives in the API process, so point this at the same deployment the
demo uses, and keep that instance warm (Cloud Run: --min-instances 1 for the
demo). A cache hit skips the per-client rate limit, so the second round below
does not count against it; only the first (warming) round does.
"""
from __future__ import annotations

import argparse
import json
import time
import urllib.request

# The app's three suggested questions (apps/web/lib/i18n.ts: ask.s1..s3), plus
# two a judge is likely to type. Keep these in sync if the suggestions change.
QUESTIONS = [
    "Is there a metro nearby or coming?",
    "Has flooding or waterlogging been reported?",
    "What has been reported about safety?",
    "How is the air quality here?",
    "Are there good schools nearby?",
]


def ask(base: str, slug: str, question: str, timeout: float = 60.0):
    url = f"{base.rstrip('/')}/api/v1/localities/{slug}/ask"
    payload = json.dumps({"question": question}).encode()
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/json"}
    )
    started = time.time()
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = json.loads(resp.read())
    return time.time() - started, body


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--base", required=True, help="API base URL, e.g. https://nestra-api-...run.app")
    ap.add_argument("slugs", nargs="+", help="Locality slugs to warm, e.g. btm-layout")
    ap.add_argument("--rounds", type=int, default=2, help="2 = warm, then prove it is cached")
    args = ap.parse_args()

    for slug in args.slugs:
        for question in QUESTIONS:
            for rnd in range(args.rounds):
                try:
                    elapsed, _ = ask(args.base, slug, question)
                except Exception as exc:  # noqa: BLE001 - a demo helper, report and move on
                    print(f"[err ] {slug} :: {question[:40]:40}  {exc}")
                    break
                tag = "warm  " if rnd == 0 else "cached"
                print(f"[{tag}] {elapsed:5.2f}s  {slug} :: {question[:40]}")
                time.sleep(1)


if __name__ == "__main__":
    main()
