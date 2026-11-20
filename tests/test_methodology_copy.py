"""The published methodology must match the scoring code.

The about page states the weights, the minimum coverage and the power penalties
as plain numbers so a buyer can check them. Those numbers are copies, so this
fails the build when the code and the page disagree.
"""

from pathlib import Path

from agents.orchestrator import score

ABOUT = Path(__file__).resolve().parents[1] / "apps/web/app/about/page.tsx"
SCORE_BASIS = Path(__file__).resolve().parents[1] / "apps/web/components/ScoreBasis.tsx"

PAGE_LABELS = {
    "air_quality": "Air quality",
    "schools": "Schools (access, not quality)",
    "crime": "Safety",
    "water": "Water",
    "infrastructure": "Connectivity",
}


def test_about_page_weights_match_the_code():
    text = ABOUT.read_text()
    for category, weight in score.CATEGORY_WEIGHTS.items():
        line = f"{PAGE_LABELS[category]} — {round(weight * 100)}%"
        assert line in text, f"about page is missing or wrong: {line!r}"


def test_about_page_threshold_and_penalties_match_the_code():
    text = ABOUT.read_text()
    assert f"Below {round(score.MIN_WEIGHT_COVERAGE * 100)}% of the total weight" in text
    penalties = sorted(score.POWER_PENALTIES.values())
    assert f"{penalties[0]} or {penalties[1]}" in text


def test_report_breakdown_weights_match_the_code():
    text = SCORE_BASIS.read_text()
    w = {k: round(v * 100) for k, v in score.CATEGORY_WEIGHTS.items()}
    assert w["air_quality"] == w["schools"] == w["crime"]
    assert f"air quality, schools and safety {w['crime']}% each" in text
    assert f"water\n              {w['water']}%" in text or f"water {w['water']}%" in text
    assert f"connectivity {w['infrastructure']}%" in text


def test_press_categories_are_described_as_scored():
    # They are counted in the composite (score.SCOREABLE); the page must not
    # claim otherwise.
    assert {"crime", "water"} <= set(score.SCOREABLE)
    assert "Neither is ever turned into a score" not in ABOUT.read_text()
