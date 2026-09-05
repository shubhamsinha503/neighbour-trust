"""Ask each classifier one question and report exactly what happened.

Exists because "could not answer a test headline" is true of a rejected key, a
decommissioned model, an exhausted quota and a malformed response alike, and the
fix differs for each. A full ingestion run takes fifteen minutes to tell you that
much; this takes three seconds and names the cause.

Run: python -m scripts.check_classifier
"""

from __future__ import annotations

import logging
import os
import pathlib
import sys

from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

from agents.news_monitor import classify as classify_mod  # noqa: E402

# Deliberately obvious: a classifier that cannot call this a local incident has
# a problem beyond judgement.
PROBE = classify_mod.PROBE


def check(name: str, build) -> bool:
    print(f"\n{name}")

    try:
        classifier = build()
    except Exception as exc:
        # A missing key raises here, and that is a normal state rather than a
        # fault — most deployments will have one provider configured.
        print(f"  unavailable: {str(exc).splitlines()[0]}")
        return False

    print(f"  built: {classifier.name}")

    try:
        judgement = classifier.classify(**PROBE)
    except Exception as exc:
        print(f"  call raised: {type(exc).__name__}: {exc}")
        return False

    if judgement is None:
        print("  declined to answer — see the warning above for the reason")
        return False

    print(
        f"  answered: is_locality_specific={judgement.is_locality_specific}, "
        f"type={judgement.incident_type}"
    )
    if not judgement.is_locality_specific:
        print("  NOTE: the expected answer is True. The model works but disagrees,")
        print("        which is a prompt-quality question rather than a wiring one.")
    return True


def main() -> int:
    # Warnings visible: the reason a classifier declined is logged, not returned.
    logging.basicConfig(level=logging.INFO, format="  %(levelname)s %(message)s")
    for noisy in ("httpx", "httpx2", "openai"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    print(f'Probe headline: "{PROBE["title"]}"')
    print(f'  as: {PROBE["locality"]}, {PROBE["city"]} / {PROBE["category"]}')

    # Every provider, not just the two that existed when this was written. The
    # script reported "no language model is usable" during a run that was
    # classifying happily through DeepSeek, because DeepSeek was not on the list.
    results = {"Claude": check("Claude", classify_mod.ClaudeClassifier)}
    for provider in classify_mod.OpenAICompatibleClassifier.PROVIDERS:
        results[provider] = check(
            provider,
            lambda p=provider: classify_mod.OpenAICompatibleClassifier(p),
        )

    print("\n" + "-" * 60)
    chosen = classify_mod.build_classifier()
    print(f"build_classifier() would use: {chosen.name}")

    if not any(results.values()):
        print(
            "\nNo language model is usable. Ingestion still runs, but the "
            "heuristic leaves ambiguous headlines unjudged, so incident counts "
            "under-report and the cards say so."
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
