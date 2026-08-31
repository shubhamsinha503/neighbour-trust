"""Compare the heuristic and Claude classifiers on real GDELT headlines.

    python scripts/compare_classifiers.py

The headlines below are the actual results GDELT returned for "Indiranagar" and
"Sushant Lok" during development, plus two unambiguous controls. They are the
cases that motivated having a classifier at all: a keyword search cannot tell
"chain snatching in Indiranagar" from a Maharashtra stabbing that merely mentions
the word, or from a planning-policy story.

Read-only — calls the classifiers directly and touches no database. Runs without
an API key, showing heuristic results only.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Python puts this file's directory (scripts/) on sys.path, not the repo root,
# so `agents` is not importable without this.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from agents.news_monitor.classify import (  # noqa: E402
    ClaudeClassifier,
    HeuristicClassifier,
)

# (locality, city, category, headline, what a careful human would say)
CASES = [
    # Real GDELT results for "Indiranagar"
    ("Indiranagar", "Bengaluru", "crime",
     "Indiranagar footpaths shrink under enchroachments", False),
    ("Indiranagar", "Bengaluru", "crime",
     "Engaged woman stabbed to death by ex - live - in partner in Ma", False),
    ("Indiranagar", "Bengaluru", "crime",
     "Man stabs estranged live - in partner to death , ends own life", False),
    # Real GDELT result for "Sushant Lok"
    ("Sushant Lok", "Gurugram", "water",
     "Regularise minor building violations: plea seeks one-time relief policy "
     "for Sushant Lok 1, 2 and 3", False),
    # Controls: unambiguous true positives
    ("Indiranagar", "Bengaluru", "crime",
     "Chain snatching reported near Indiranagar metro station", True),
    ("Sushant Lok", "Gurugram", "water",
     "Sushant Lok residents face water shortage for third day", True),
]


def verdict(judgement) -> str:
    if judgement is None:
        return "undecided"
    return "INCIDENT" if judgement.is_locality_specific else "not an incident"


def main() -> int:
    heuristic = HeuristicClassifier()

    # Without a key there is still something worth seeing. Better than a
    # traceback for a reader who just wants to run this.
    claude = None
    try:
        claude = ClaudeClassifier()
        print(f"Claude classifier : {claude.name}")
    except Exception as exc:
        print(f"Claude classifier : unavailable\n  {exc}")
    print(f"Heuristic         : always available, no credentials\n")

    heur_right = heur_wrong = heur_declined = 0
    claude_right = claude_wrong = claude_declined = 0

    for locality, city, category, headline, expected in CASES:
        kwargs = dict(title=headline, locality=locality, city=city, category=category)
        h = heuristic.classify(**kwargs)
        c = claude.classify(**kwargs) if claude is not None else None

        if h is None:
            heur_declined += 1
        elif h.is_locality_specific == expected:
            heur_right += 1
        else:
            heur_wrong += 1

        if claude is not None:
            if c is None:
                claude_declined += 1
            elif c.is_locality_specific == expected:
                claude_right += 1
            else:
                claude_wrong += 1

        print(f'  "{headline[:68]}"')
        print(f"     expected  : {'INCIDENT' if expected else 'not an incident'}")
        print(f"     heuristic : {verdict(h):<16} "
              f"{h.reason if h else '(declined to judge)'}")
        if claude is not None:
            print(f"     claude    : {verdict(c):<16} "
                  f"{c.reason if c else '(no answer)'}")
            if c is not None and c.incident_type:
                print(f"     type      : {c.incident_type}")
        print()

    total = len(CASES)
    print(f"heuristic : {heur_right} right, {heur_wrong} wrong, {heur_declined} declined "
          f"(of {total})")
    if claude is not None:
        print(f"claude    : {claude_right} right, {claude_wrong} wrong, "
              f"{claude_declined} declined (of {total})")
    else:
        print("claude    : not run — set ANTHROPIC_API_KEY in .env to compare")

    # A wrong answer is the only real failure here. Declining costs recall;
    # guessing costs correctness, and correctness is the product.
    print("\nA declined headline is excluded from incident counts, so it costs "
          "recall but never accuracy.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
