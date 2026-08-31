"""Compare the heuristic and Claude classifiers on real GDELT headlines.

The headlines below are the actual results GDELT returned for "Indiranagar" and
"Sushant Lok" during development, plus two synthetic controls. They are the cases
that motivated having a classifier at all.

Read-only: this calls the classifiers directly and touches no database.
Temporary — delete after running.
"""

from dotenv import load_dotenv

load_dotenv()

from agents.news_monitor.classify import ClaudeClassifier, HeuristicClassifier

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


def main() -> None:
    heuristic = HeuristicClassifier()
    claude = ClaudeClassifier()
    print(f"Claude classifier: {claude.name}\n")

    agree = disagree = 0
    heur_right = claude_right = 0

    for locality, city, category, headline, expected in CASES:
        kwargs = dict(title=headline, locality=locality, city=city, category=category)
        h = heuristic.classify(**kwargs)
        c = claude.classify(**kwargs)

        expected_str = "INCIDENT" if expected else "not an incident"
        h_v, c_v = verdict(h), verdict(c)

        if h is not None and h.is_locality_specific == expected:
            heur_right += 1
        if c is not None and c.is_locality_specific == expected:
            claude_right += 1
        if h_v == c_v:
            agree += 1
        else:
            disagree += 1

        print(f'  "{headline[:66]}"')
        print(f"     expected  : {expected_str}")
        print(f"     heuristic : {h_v:<16} {h.reason if h else '(declined to judge)'}")
        print(f"     claude    : {c_v:<16} {c.reason if c else '(no answer)'}")
        if c is not None and c.incident_type:
            print(f"     type      : {c.incident_type}")
        print()

    total = len(CASES)
    print(f"Correct  — heuristic {heur_right}/{total}, claude {claude_right}/{total}")
    print(f"Agreement— {agree}/{total} agree, {disagree}/{total} differ")


if __name__ == "__main__":
    main()
