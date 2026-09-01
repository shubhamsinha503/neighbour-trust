"""Regression cases for the headline classifier, from real production errors.

These run only when ANTHROPIC_API_KEY is present, so they are skipped locally
and in CI without a key. They exist because the failure they cover is not
detectable by reading the prompt: the only way to know whether the classifier
tells a person from a place is to ask it.

The Manesar case is the motivating one. "Monu Manesar" is a man — a figure in
the nationally covered Junaid-Nasir lynching case, whose events happened in
Rajasthan. Because Indian news routinely identifies people by their town, that
one story pushed Manesar's page to "25 murder" for a locality of a few thousand
people. Alongside it, the NSG training academy and the IMT industrial estate
generate statewide coverage that says nothing about the streets there.
"""

import os

import pytest

pytestmark = pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="needs ANTHROPIC_API_KEY; the prompt can only be tested against the model",
)

# (headline, locality, city, category, should_count_as_a_local_incident)
CASES = [
    # A person named after the place.
    ("Bail for Monu Manesar rekindles fear and grief in Junaid-Nasir lynching case",
     "Manesar", "Gurugram", "crime", False),
    ("Cow vigilante Monu Manesar alleges death threat from Pakistan-based gang",
     "Manesar", "Gurugram", "crime", False),
    # A national institution that happens to sit there.
    ("Rajasthan's 25 Women Police Personnel Join First NSG Mahila Commando "
     "Conversion Course at Manesar", "Manesar", "Gurugram", "crime", False),
    ("55 workers, including 20 women, arrested for Manesar violence over wage hike",
     "Manesar", "Gurugram", "crime", False),
    # Genuine local incidents, which must survive the tightening.
    ("Woman strangled by husband after argument in Manesar",
     "Manesar", "Gurugram", "crime", True),
    ("Revenge killing in Manesar: Sarpanch's son guns down father's killer",
     "Manesar", "Gurugram", "crime", True),
    ("Chain snatching reported near Koramangala 5th Block, two held",
     "Koramangala", "Bengaluru", "crime", True),
    # Coverage that is about the city, not the locality.
    ("Karnataka announces new water policy for all urban local bodies",
     "Indiranagar", "Bengaluru", "water", False),
]


@pytest.fixture(scope="module")
def classifier():
    from agents.news_monitor import classify as classify_mod

    built = classify_mod.build_classifier()
    if built.name.startswith("heuristic"):
        pytest.skip("Claude classifier unavailable; heuristic makes no such judgement")
    return built


@pytest.mark.parametrize(
    "title,locality,city,category,expected",
    CASES,
    ids=[c[0][:45] for c in CASES],
)
def test_classification(classifier, title, locality, city, category, expected):
    judgement = classifier.classify(
        title=title, locality=locality, city=city, category=category
    )
    assert judgement is not None, "classifier declined to decide"
    assert judgement.is_locality_specific is expected, (
        f"{title!r} -> {judgement.is_locality_specific} "
        f"(reason: {getattr(judgement, 'reason', None)})"
    )
