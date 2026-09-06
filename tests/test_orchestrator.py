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
        assert result.categories_total == len(score_mod.CATEGORY_WEIGHTS)
        # Derived rather than hardcoded: this asserted 6 and 40% until power
        # stopped being a weighted category, and a literal here means the
        # test fails for arithmetic reasons every time the table is argued
        # with — which is exactly what that table is for.
        expected = score_mod.CATEGORY_WEIGHTS['air_quality'] + score_mod.CATEGORY_WEIGHTS['schools']
        assert result.coverage_pct == round(expected * 100)

    def test_one_category_is_not_enough_for_a_composite(self):
        """A single measurement wearing the words "Trust Score" is worse than no
        score at all."""
        result = score_mod.compute({"schools": SCHOOLS_GOOD})
        assert result.score is None
        assert result.reason_unavailable is not None
        assert f"1 of {len(score_mod.CATEGORY_WEIGHTS)}" in result.reason_unavailable

    def test_no_data_at_all_yields_no_score(self):
        result = score_mod.compute({})
        assert result.score is None
        assert result.categories_counted == 0

    def test_every_category_appears_even_when_empty(self):
        """A grid that silently shows two is a different claim than one that
        shows every category and admits which are empty."""
        result = score_mod.compute({"air_quality": AQ_GOOD, "schools": SCHOOLS_GOOD})
        assert len(result.categories) == len(score_mod.CATEGORY_WEIGHTS)
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


class TestHistoricalReadingsAreShownButNotScored:
    """A reading too old to describe today is displayed with its date and kept
    out of the number.

    Added 2026-09-06, when CPCB's air quality network stopped publishing. The
    previous rule hid anything past a week, which would have blanked the air
    card for 19 localities that each had a real, dated 31 August measurement.

    The split is between what a card can say and what a score can. A card
    carries its own caveat in words — "last measured 31 August". A single 0-100
    Trust Score cannot: it either contains a fortnight-old number or it does
    not, and nothing on screen would tell the reader which. So historical values
    are shown and never counted.
    """

    STALE_AQ = envelope(
        {"current_aqi": 40.0, "aqi_band": "good", "nearest_station_km": 2.0},
        confidence="low",
    ) | {"historical": True}

    def test_a_historical_category_does_not_reach_the_score(self):
        with_fresh = score_mod.compute({"air_quality": AQ_GOOD, "schools": SCHOOLS_GOOD})
        with_stale = score_mod.compute(
            {"air_quality": self.STALE_AQ, "schools": SCHOOLS_GOOD}
        )
        assert with_stale.score != with_fresh.score
        assert [c.category for c in with_stale.categories if c.counted] == ["schools"]

    def test_the_stale_score_equals_dropping_the_category_entirely(self):
        """The whole point: a historical reading must weigh exactly nothing,
        not merely a little less."""
        stale = score_mod.compute(
            {"air_quality": self.STALE_AQ, "schools": SCHOOLS_GOOD}
        )
        absent = score_mod.compute({"schools": SCHOOLS_GOOD})
        assert stale.score == absent.score
        assert stale.weight_covered == absent.weight_covered

    def test_but_the_category_is_still_reported_as_available(self):
        """Available drives whether the card renders. Hiding it was the old
        behaviour and the reason this change exists."""
        result = score_mod.compute(
            {"air_quality": self.STALE_AQ, "schools": SCHOOLS_GOOD}
        )
        air = next(c for c in result.categories if c.category == "air_quality")
        assert air.available is True
        assert air.counted is False
        assert air.historical is True
        assert air.score is not None

    def test_a_bad_historical_reading_cannot_drag_the_score_down(self):
        """The failure that would matter most: stale data must not be able to
        make a locality look worse than the evidence supports."""
        stale_bad = envelope(
            {"current_aqi": 320.0, "aqi_band": "very_poor", "nearest_station_km": 2.0},
            confidence="low",
        ) | {"historical": True}
        result = score_mod.compute(
            {"air_quality": stale_bad, "schools": SCHOOLS_GOOD}
        )
        assert result.score == score_mod.compute({"schools": SCHOOLS_GOOD}).score

    def test_the_explanation_does_not_call_it_press_coverage(self):
        """Unscored categories were all described as press-derived, which is
        true of safety and water and false of a stale air reading. A page that
        explains itself wrongly is worse than one that stays quiet."""
        result = score_mod.compute({"air_quality": self.STALE_AQ})
        assert result.score is None
        reason = result.reason_unavailable or ""
        assert "press coverage" not in reason
        assert "stopped publishing" in reason


class TestHistoricalTilesCarryTheirDate:
    """The report tile is small: a number, a bar, one line of text.

    Nothing else is guaranteed to be read alongside it, so "PM2.5 index 42
    (moderate)" reads as today's air no matter what border is drawn around it.
    The date has to be inside the sentence.
    """

    from datetime import datetime, timezone as _tz

    VINTAGE = datetime(2026, 8, 31, 16, 0, tzinfo=_tz.utc)

    def test_a_historical_summary_leads_with_the_measurement_date(self):
        from agents.orchestrator.agent import _dated_if_historical

        line = _dated_if_historical(
            "PM2.5 index 42 (moderate)",
            {"historical": True, "data_vintage": self.VINTAGE},
        )
        assert line.startswith("Last measured 31 Aug")
        assert "PM2.5 index 42" in line

    def test_a_current_summary_is_left_alone(self):
        from agents.orchestrator.agent import _dated_if_historical

        line = _dated_if_historical(
            "PM2.5 index 42 (moderate)", {"data_vintage": self.VINTAGE}
        )
        assert line == "PM2.5 index 42 (moderate)"

    def test_an_empty_summary_does_not_become_a_bare_date(self):
        """A tile reading only "Last measured 31 Aug" would state a date for a
        measurement it never shows."""
        from agents.orchestrator.agent import _dated_if_historical

        assert _dated_if_historical("", {"historical": True, "data_vintage": self.VINTAGE}) == ""

    def test_it_survives_a_missing_vintage(self):
        from agents.orchestrator.agent import _dated_if_historical

        line = _dated_if_historical("something", {"historical": True})
        assert "Last known reading" in line


class TestPowerPenalty:
    """Power subtracts, never adds, and never silently.

    Power lost its card on 2026-09-06 because the live site rendered a dash for
    42 of 44 localities. It still moves the Trust Score — downward only — so the
    flag is now the *only* thing on the page explaining a deduction. These tests
    exist to keep that link unbreakable.
    """

    @staticmethod
    def power(*types: str) -> dict:
        counts: dict[str, int] = {}
        for t in types:
            counts[t] = counts.get(t, 0) + 1
        return envelope({"news": {"incident_type_counts": counts}})

    BASE = {"air_quality": AQ_GOOD, "schools": SCHOOLS_GOOD}

    def test_repeated_equipment_failures_cost_the_most(self):
        clean = score_mod.compute(self.BASE)
        faulty = score_mod.compute(
            self.BASE | {"power": self.power("transformer_failure", "transformer_failure")}
        )
        assert faulty.score < clean.score
        assert faulty.power_penalty == score_mod.POWER_PENALTIES["serious"]

    def test_unplanned_outages_cost_less_than_equipment_failure(self):
        """A recurring transformer fault is a fact about the infrastructure; a
        couple of unplanned cuts is a worse week."""
        equipment = score_mod.compute(
            self.BASE | {"power": self.power("transformer_failure", "transformer_failure")}
        )
        unplanned = score_mod.compute(
            self.BASE | {"power": self.power("power_outage", "power_outage")}
        )
        assert 0 < unplanned.power_penalty < equipment.power_penalty

    def test_good_power_news_can_never_raise_the_score(self):
        """The bug this replaced. Under the weighted average a locality with a
        few mild outages scored 86 and pulled its composite *up* — it was being
        rewarded for having had power cuts written about."""
        clean = score_mod.compute(self.BASE)
        mild = score_mod.compute(self.BASE | {"power": self.power("scheduled_maintenance")})
        assert mild.score <= clean.score

    def test_a_single_incident_does_not_move_the_score(self):
        """One report is an anecdote. Both thresholds require repetition, because
        press counts track how much a place is written about."""
        one = score_mod.compute(self.BASE | {"power": self.power("transformer_failure")})
        assert one.power_penalty == 0
        assert one.score == score_mod.compute(self.BASE).score

    def test_the_penalty_never_moves_without_a_flag_to_explain_it(self):
        """The invariant that makes removing the card acceptable. Power has no
        card, so if the score can drop with nothing on the page saying why, the
        product has broken its one promise.
        """
        from agents.orchestrator import flags as flags_mod

        cases = [
            (), ("transformer_failure",), ("transformer_failure", "transformer_failure"),
            ("power_outage", "power_outage"), ("scheduled_maintenance",) * 4,
            ("power_outage", "transformer_failure", "scheduled_maintenance"),
        ]
        for types in cases:
            envelopes = self.BASE | ({"power": self.power(*types)} if types else {})
            result = score_mod.compute(envelopes)
            explained = bool(
                flags_mod.power_flags((envelopes.get("power") or {}).get("payload") or {})
            )
            assert (result.power_penalty > 0) == explained, types

    def test_the_penalty_states_its_own_size(self):
        result = score_mod.compute(
            self.BASE | {"power": self.power("transformer_failure", "transformer_failure")}
        )
        assert result.power_penalty_reason is not None
        assert str(result.power_penalty) in result.power_penalty_reason

    def test_press_counts_cannot_sink_a_locality(self):
        """Coverage bias: these counts measure media attention, not incidence.
        A well-covered area must not be destroyed by being written about."""
        heavy = score_mod.compute(
            self.BASE | {"power": self.power(*(["transformer_failure"] * 40))}
        )
        clean = score_mod.compute(self.BASE)
        assert clean.score - heavy.score <= max(score_mod.POWER_PENALTIES.values())

    def test_the_score_never_goes_below_the_floor(self):
        result = score_mod.compute(
            {"air_quality": AQ_BAD,
             "power": self.power("transformer_failure", "transformer_failure")}
        )
        assert result.score is None or result.score >= 5


class TestNoReportsBaseline:
    """Nothing reported in 12 months shows a baseline, not a blank and not a
    measurement.

    A product decision taken on 2026-09-06: an empty card with a dash above an
    empty meter reads as a broken component, and a buyer learns nothing from it.

    The constraint that shapes the implementation is the one at the top of
    press_score.py — no press coverage is evidence of no journalists, not of
    safety. So the baseline appears on the card, labelled, and is kept out of the
    Trust Score, which stays made only of things that were measured. Otherwise
    the neighbourhoods nobody writes about would outrank the ones that get
    covered, which is the coverage bias inverted into a feature.
    """

    QUIET = envelope({"news": {"incidents_12m": 0, "mentions_fetched": 20,
                               "mentions_classified": 20}})

    def result(self, envelopes, category="water"):
        return next(
            c for c in score_mod.compute(envelopes).categories
            if c.category == category
        )

    def test_a_quiet_locality_gets_the_baseline(self):
        water = self.result({"water": self.QUIET, "schools": SCHOOLS_GOOD})
        assert water.score == score_mod.press_score.BASELINE_NO_REPORTS
        assert water.is_baseline is True

    def test_the_baseline_never_reaches_the_trust_score(self):
        with_baseline = score_mod.compute({"water": self.QUIET, "schools": SCHOOLS_GOOD,
                                           "air_quality": AQ_GOOD})
        without = score_mod.compute({"schools": SCHOOLS_GOOD, "air_quality": AQ_GOOD})
        assert with_baseline.score == without.score
        assert with_baseline.weight_covered == without.weight_covered
        assert self.result(
            {"water": self.QUIET, "schools": SCHOOLS_GOOD}
        ).counted is False

    def test_a_half_classified_locality_gets_no_baseline(self):
        """Zero incidents can mean "we stopped looking". A run that hits its
        classification cap leaves mentions unjudged, so the count reads zero for
        a reason that has nothing to do with the neighbourhood — and a good
        baseline for a queue we never finished is invented reassurance."""
        partial = envelope({"news": {"incidents_12m": 0, "mentions_fetched": 40,
                                     "mentions_classified": 12}})
        water = self.result({"water": partial, "schools": SCHOOLS_GOOD})
        assert water.score is None
        assert water.is_baseline is False

    def test_a_locality_with_reports_is_not_given_the_baseline(self):
        """One incident is still an incident. The baseline is for silence, not
        for "too few to score" — those are different statements."""
        thin = envelope({"news": {"incidents_12m": 1, "mentions_fetched": 10,
                                  "mentions_classified": 10,
                                  "incident_type_counts": {"waterlogging": 1}}})
        water = self.result({"water": thin, "schools": SCHOOLS_GOOD})
        assert water.is_baseline is False

    def test_a_measured_score_is_never_marked_baseline(self):
        loud = envelope({"news": {"incidents_12m": 5, "mentions_fetched": 10,
                                  "mentions_classified": 10,
                                  "incident_type_counts": {"waterlogging": 5}}})
        water = self.result({"water": loud, "schools": SCHOOLS_GOOD})
        assert water.score is not None
        assert water.is_baseline is False
        assert water.counted is True

    def test_the_card_says_it_is_a_baseline(self):
        water = self.result({"water": self.QUIET, "schools": SCHOOLS_GOOD})
        assert "baseline" in water.status.lower()

    def test_a_quiet_locality_cannot_outrank_a_reported_one_on_the_composite(self):
        """The bias check. If silence raised the headline number, the locality
        nobody covers would beat the one that gets reported on."""
        loud = envelope({"news": {"incidents_12m": 6, "mentions_fetched": 10,
                                  "mentions_classified": 10,
                                  "incident_type_counts": {"waterlogging": 6}}})
        quiet = score_mod.compute({"water": self.QUIET, "schools": SCHOOLS_GOOD,
                                   "air_quality": AQ_GOOD})
        covered = score_mod.compute({"water": loud, "schools": SCHOOLS_GOOD,
                                     "air_quality": AQ_GOOD})
        assert covered.weight_covered > quiet.weight_covered
