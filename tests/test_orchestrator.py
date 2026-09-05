"""Tests for the composite Trust Score and reconciliation.

The scoring is a product judgement rather than a measurement, so these tests pin
the *properties* that must hold rather than specific numbers — above all that
missing data never becomes a bad score, and that a thin score is never published
as if it were a full one.
"""

import pytest

from agents.orchestrator import reconcile, score as score_mod


def envelope(payload: dict, confidence: str = "high", source: str = "Test") -> dict:
    return {"payload": payload, "confidence": confidence, "source_name": source}


AQ_GOOD = envelope({"current_aqi": 40.0, "aqi_band": "good", "nearest_station_km": 2.0})
AQ_BAD = envelope({"current_aqi": 320.0, "aqi_band": "very_poor", "nearest_station_km": 2.0})
SCHOOLS_GOOD = envelope(
    {"schools_within_2km": 40, "median_pupil_teacher_ratio": 20.0,
     "schools_with_staffing_data": 30}
)


class TestAqiScore:
    def test_clean_air_scores_high(self):
        assert score_mod.score_from_aqi(30) >= 88

    def test_severe_air_scores_low(self):
        assert score_mod.score_from_aqi(420) <= 15

    def test_monotonic(self):
        """Worse air must never score better."""
        scores = [score_mod.score_from_aqi(a) for a in (0, 50, 100, 200, 300, 400, 500)]
        assert scores == sorted(scores, reverse=True)

    def test_curve_is_steepest_across_the_decision_range(self):
        """AQI 100-200 is the Moderate-to-Poor stretch where a buyer's decision
        actually changes, so a 50-point rise there must cost more of the score
        than the same rise among already-clean or already-hazardous air."""
        clean = score_mod.score_from_aqi(0) - score_mod.score_from_aqi(50)
        decision = score_mod.score_from_aqi(100) - score_mod.score_from_aqi(150)
        hazardous = score_mod.score_from_aqi(350) - score_mod.score_from_aqi(400)
        assert decision > clean
        assert decision > hazardous


class TestSchoolsScore:
    def test_access_alone_is_capped(self):
        """61 schools nearby with staffing known for one has not earned 100."""
        assert score_mod.score_from_schools(61, None) <= 75

    def test_staffing_improves_the_score(self):
        assert score_mod.score_from_schools(40, 20.0) > score_mod.score_from_schools(40, None)

    def test_crowded_schools_score_worse(self):
        assert score_mod.score_from_schools(40, 50.0) < score_mod.score_from_schools(40, 20.0)


class TestCategoryScore:
    def test_a_bare_incident_count_never_becomes_a_score(self):
        """Volume alone is what coverage bias distorts most, so a count with no
        composition behind it produces nothing. Scoring these categories reads
        the mix of incident types instead — see press_score.py."""
        payload = {"news": {"incidents_12m": 12}}
        assert score_mod.category_score("crime", payload) is None
        assert score_mod.category_score("water", payload) is None

    def test_composition_does_produce_a_score(self):
        counts = {"news": {"incident_type_counts": {"theft": 6, "assault": 2}}}
        assert score_mod.category_score("crime", counts) is not None

    def test_unbuilt_categories_never_score(self):
        assert score_mod.category_score("power", {}) is None
        assert score_mod.category_score("infrastructure", {}) is None


class TestComposite:
    def test_missing_categories_do_not_drag_the_score_down(self):
        """The central rule: absent data must not read as a bad neighbourhood.
        Two categories at ~96 must produce ~96, not 96 * 2/6."""
        result = score_mod.compute({"air_quality": AQ_GOOD, "schools": SCHOOLS_GOOD})
        assert result.score is not None
        assert result.score >= 85

    def test_coverage_is_reported(self):
        result = score_mod.compute({"air_quality": AQ_GOOD, "schools": SCHOOLS_GOOD})
        assert result.categories_counted == 2
        assert result.categories_total == 6
        assert result.coverage_pct == 40  # 0.20 + 0.20 of total weight

    def test_one_category_is_not_enough_for_a_composite(self):
        """A single measurement wearing the words "Trust Score" is worse than no
        score at all."""
        result = score_mod.compute({"schools": SCHOOLS_GOOD})
        assert result.score is None
        assert result.reason_unavailable is not None
        assert "1 of 6" in result.reason_unavailable

    def test_no_data_at_all_yields_no_score(self):
        result = score_mod.compute({})
        assert result.score is None
        assert result.categories_counted == 0

    def test_every_category_appears_even_when_empty(self):
        """A grid of six that silently shows two is a different claim than one
        that shows six and admits four are empty."""
        result = score_mod.compute({"air_quality": AQ_GOOD, "schools": SCHOOLS_GOOD})
        assert len(result.categories) == 6
        assert {c.category for c in result.categories} == set(score_mod.CATEGORY_WEIGHTS)

    def test_bad_air_lowers_the_composite(self):
        good = score_mod.compute({"air_quality": AQ_GOOD, "schools": SCHOOLS_GOOD})
        bad = score_mod.compute({"air_quality": AQ_BAD, "schools": SCHOOLS_GOOD})
        assert bad.score < good.score

    def test_weights_sum_to_one(self):
        assert sum(score_mod.CATEGORY_WEIGHTS.values()) == pytest.approx(1.0)

    def test_crime_envelope_present_but_uncounted(self):
        """Crime can have an envelope and still contribute nothing."""
        result = score_mod.compute({
            "air_quality": AQ_GOOD,
            "schools": SCHOOLS_GOOD,
            "crime": envelope({"news": {"incidents_12m": 5}}, "community_estimated"),
        })
        crime = next(c for c in result.categories if c.category == "crime")
        assert crime.available is True
        assert crime.counted is False
        assert result.categories_counted == 2


class TestReconcile:
    def test_surfaces_two_aqi_scales(self):
        found = reconcile.find({
            "air_quality": envelope({"current_aqi": 96.0}),
            "air_quality_aqicn": envelope({"epa_aqi": 134.0}),
        })
        assert any("96" in d.headline and "134" in d.headline for d in found)

    def test_no_aqi_conflict_when_only_one_source(self):
        found = reconcile.find({"air_quality": envelope({"current_aqi": 96.0})})
        assert not any(d.category == "air_quality" for d in found)

    def test_surfaces_the_schools_coverage_gap(self):
        """The Indiranagar case: 61 schools mapped, staffing known for one."""
        found = reconcile.find({
            "schools": envelope({
                "schools_within_2km": 61,
                "schools_with_staffing_data": 1,
                "presence_source": "OpenStreetMap",
            })
        })
        assert any(d.category == "schools" for d in found)

    def test_no_schools_conflict_when_coverage_is_good(self):
        found = reconcile.find({
            "schools": envelope({
                "schools_within_2km": 40,
                "schools_with_staffing_data": 35,
                "presence_source": "UDISE",
            })
        })
        assert not any(d.category == "schools" for d in found)

    def test_press_coverage_is_flagged_as_uncounted(self):
        found = reconcile.find({
            "crime": envelope({"news": {"incidents_12m": 7}}, "community_estimated")
        })
        assert any("not counted in the score" in d.headline for d in found)

    def test_notable_conflicts_sort_first(self):
        found = reconcile.find({
            "air_quality": envelope({"current_aqi": 96.0}),
            "air_quality_aqicn": envelope({"epa_aqi": 134.0}),
            "schools": envelope({
                "schools_within_2km": 61,
                "schools_with_staffing_data": 1,
                "presence_source": "OpenStreetMap",
            }),
        })
        assert found[0].severity == "notable"


class TestAirQualitySummary:
    """A number's meaning depends on what produced it.

    Since India's regulatory network stopped publishing on 2026-08-27, every
    reading we serve comes from a community low-cost sensor measuring PM2.5
    alone, and one Bengaluru sensor is standing in for a dozen localities that
    consequently all display the same figure. The card has to say so, or that
    figure reads as a measurement taken in the reader's neighbourhood.
    """

    def test_regulatory_reading_is_called_an_aqi(self):
        from agents.orchestrator.agent import _category_summary

        summary = _category_summary("air_quality", envelope({
            "current_aqi": 96.0, "aqi_band": "moderate",
            "nearest_station_km": 2.0, "aqi_basis": "24h_rolling",
        }))
        assert summary.startswith("AQI 96")
        assert "low-cost" not in summary

    def test_low_cost_reading_is_not_presented_as_an_aqi(self):
        from agents.orchestrator.agent import _category_summary

        summary = _category_summary("air_quality", envelope({
            "current_aqi": 24.5, "aqi_band": "good",
            "nearest_station_km": 7.97, "aqi_basis": "pm2_5_only",
        }))
        assert "low-cost sensor" in summary
        assert "no regulatory station" in summary
        # It is a PM2.5 index, not the CPCB National AQI, and must not claim to be.
        assert not summary.startswith("AQI")

    def test_distance_is_always_shown(self):
        from agents.orchestrator.agent import _category_summary

        for basis in ("24h_rolling", "pm2_5_only"):
            summary = _category_summary("air_quality", envelope({
                "current_aqi": 50.0, "aqi_band": "good",
                "nearest_station_km": 3.4, "aqi_basis": basis,
            }))
            assert "3.4 km" in summary


class TestPartialClassification:
    """A half-assessed locality must not present its count as complete.

    When a run hits the classification cap the unjudged mentions are whichever
    the query happened to return last, so one locality can be fully assessed and
    the next only half. Comparing their incident counts then compares how far a
    batch job got rather than the two places — and the page gave no sign. A real
    run left 1,439 of 3,439 mentions unjudged exactly this way.
    """

    def _summary(self, fetched, classified, incidents=5):
        from agents.orchestrator.agent import _category_summary

        return _category_summary("crime", envelope({
            "news": {
                "incidents_12m": incidents,
                "mentions_fetched": fetched,
                "mentions_classified": classified,
                "characterisation": "Mostly property crime — 4 theft.",
            }
        }))

    def test_partial_pass_says_it_undercounts(self):
        summary = self._summary(fetched=100, classified=58)
        assert "undercounts" in summary
        assert "58%" in summary

    def test_partial_pass_does_not_show_a_characterisation(self):
        """Describing the character of incidents from half the evidence claims
        more than the data supports."""
        summary = self._summary(fetched=100, classified=58)
        assert "property crime" not in summary

    def test_complete_pass_is_unaffected(self):
        summary = self._summary(fetched=100, classified=100)
        assert "undercounts" not in summary
        assert "property crime" in summary

    def test_small_shortfall_is_tolerated(self):
        """A couple of undecided headlines is not a coverage problem."""
        summary = self._summary(fetched=100, classified=95)
        assert "undercounts" not in summary

    def test_missing_counts_do_not_trigger_the_warning(self):
        """Older envelopes predate these fields."""
        from agents.orchestrator.agent import _category_summary

        summary = _category_summary("crime", envelope({
            "news": {"incidents_12m": 3, "characterisation": "Mostly property crime."}
        }))
        assert "undercounts" not in summary


class TestEnvelopeSelection:
    """Which stored envelope gets served.

    This one reached production. `latest_envelope` ordered by data_vintage, and
    a crime envelope written during a failed run had found no incidents — so it
    stamped its vintage as `now`, there being no other date available. The next
    day's run found 90 real incidents and stamped the newest of those, an
    earlier date. The empty envelope sorted first, and every safety card on the
    site read zero while the correct data sat one row below it in the table.

    The two rows coexist because data_envelope is keyed by
    (category, source_name, h3_cell) and the runs recorded different sources.
    """

    def _query(self) -> str:
        from pathlib import Path

        source = Path("agents/common/db.py").read_text(encoding="utf-8")
        start = source.index("def latest_envelope(")
        return source[start : source.index("def ", start + 10)]

    def test_orders_by_write_time_not_vintage(self):
        """Which row is current is a question about the latest write. How old the
        underlying data is governs confidence instead, and freshness.py reads
        data_vintage for exactly that."""
        assert "ORDER BY fetched_at DESC" in self._query()

    def test_vintage_is_still_a_tiebreak(self):
        assert "fetched_at DESC, data_vintage DESC" in self._query()


class TestEmptyEnvelopeVintage:
    def test_no_incidents_does_not_claim_todays_data(self):
        """An envelope reporting nothing must not stamp itself with today's
        vintage — that made a finding of nothing look like the freshest thing on
        the site, which is how it outranked real data."""
        from pathlib import Path

        source = Path("agents/news_monitor/agent.py").read_text(encoding="utf-8")
        assert "vintage = max(dated) if dated else now" in source
        # The old form took incidents[0] and fell through to `now` unguarded.
        assert 'incidents[0]["published_at"]\n        if incidents' not in source


class TestFlags:
    """Flags exist because the watch-out mechanism could not reach the two
    categories a buyer most wants flagged.

    It considered only *scored* categories, and crime and water are deliberately
    never scored — so a locality with violent incidents in the press showed a
    grey dash where a score would be, and the incidents sat in a tile among six.
    """

    def _find(self, envelopes, categories=None):
        from agents.orchestrator import flags as flags_mod

        return flags_mod.find(envelopes, categories or [])

    def _news(self, types):
        return envelope({"news": {"recent": [{"incident_type": t} for t in types]}})

    def test_violence_is_flagged(self):
        found = self._find({"crime": self._news(["assault", "theft", "murder"])})
        assert any(f["category"] == "crime" and f["severity"] == "serious" for f in found)

    def test_recurrent_waterlogging_is_flagged(self):
        found = self._find({"water": self._news(["waterlogging", "waterlogging"])})
        flag = next(f for f in found if f["category"] == "water")
        assert flag["severity"] == "serious"
        assert "2 times" in flag["headline"]

    def test_contamination_is_flagged(self):
        found = self._find({"water": self._news(["contamination"])})
        assert any("Contamination" in f["headline"] for f in found)

    def test_absence_never_produces_a_reassuring_flag(self):
        """The rule that keeps this honest. An under-reported locality must not
        be awarded a clean bill of health for being ignored, so nothing fires on
        the absence of incidents."""
        assert self._find({"crime": self._news([])}) == []
        assert self._find({}) == []

    def test_property_crime_flag_does_not_claim_safety(self):
        found = self._find({"crime": self._news(["theft", "snatching"])})
        flag = next(f for f in found if f["category"] == "crime")
        assert flag["severity"] == "notable"
        assert "not the same as none having happened" in flag["detail"]

    def test_excluded_incident_types_do_not_raise_flags(self):
        """Self-harm and policing complaints are excluded from safety cards, and
        must not reappear as a flag."""
        assert self._find({"crime": self._news(["suicide", "illegal arrest"])}) == []

    def test_poor_air_is_flagged(self):
        found = self._find({
            "air_quality": envelope({"aqi_band": "very_poor", "current_aqi": 312.0})
        })
        assert any(f["category"] == "air_quality" for f in found)

    def test_good_air_is_not_flagged(self):
        found = self._find({
            "air_quality": envelope({"aqi_band": "good", "current_aqi": 24.0})
        })
        assert not any(f["category"] == "air_quality" for f in found)

    def test_serious_flags_sort_first(self):
        found = self._find({
            "crime": self._news(["theft", "snatching"]),
            "water": self._news(["contamination"]),
        })
        assert found[0]["severity"] == "serious"

    def test_headline_flag_is_the_first(self):
        from agents.orchestrator import flags as flags_mod

        found = self._find({"crime": self._news(["assault", "murder"])})
        assert flags_mod.headline_flag(found) is found[0]
        assert flags_mod.headline_flag([]) is None


class TestFlagsAgreeWithCards:
    """A flag and the card beside it must describe the same evidence.

    They did not. Flags read payload.news.recent, which is a five-item display
    sample, so Indiranagar showed "Violence reported in local press (1 of 5
    incidents shown)" directly above "a notable share involve violence (9 of
    18)" — two numbers about the same locality, disagreeing, on one screen.
    """

    def _find(self, payload):
        from agents.orchestrator import flags as flags_mod

        return flags_mod.find({"crime": envelope(payload)}, [])

    def test_counts_come_from_the_whole_year_not_the_sample(self):
        found = self._find({
            "news": {
                "incident_type_counts": {"assault": 5, "harassment": 4, "theft": 9},
                "recent": [{"incident_type": "theft"}],  # the display sample
            }
        })
        headline = found[0]["headline"]
        assert "9 of 18" in headline, headline
        # The display sample holds a single theft; a flag derived from it
        # would have read "of 1".
        assert not headline.endswith("of 1 incidents)")

    def test_excluded_types_leave_the_denominator(self):
        """Self-harm and policing complaints are excluded from safety cards, so
        they must not swell the total a flag reports either."""
        found = self._find({
            "news": {"incident_type_counts": {"assault": 2, "suicide": 10}}
        })
        assert "2 of 2" in found[0]["headline"]

    def test_older_envelopes_still_produce_flags(self):
        """Envelopes written before the counts existed carry only `recent`.
        They age out within a day, but must not blank the page meanwhile."""
        found = self._find({"news": {"recent": [{"incident_type": "assault"}]}})
        assert found and found[0]["category"] == "crime"

    def test_no_incident_data_produces_no_flag(self):
        assert self._find({"news": {}}) == []
