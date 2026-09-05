"""Every API response model must be fully resolvable, not merely importable.

ReportResponse declared `flags: list[Flag]` while Flag was never defined. The
edit that added the annotation landed; the edit meant to add the class anchored
on a name that does not exist in that file and silently did nothing.

Nothing caught it. `from __future__ import annotations` makes the annotation a
string, so the module imports, the app starts, and every other endpoint serves
normally — the failure appears only when Pydantic resolves the model to
serialise a response. All 44 locality reports returned 500 while /healthz,
/stats and the category endpoints were green.
"""

import pytest
from pydantic import BaseModel

from apps.api.app import main


def response_models():
    return [
        (name, obj)
        for name, obj in vars(main).items()
        if isinstance(obj, type) and issubclass(obj, BaseModel) and obj is not BaseModel
    ]


@pytest.mark.parametrize(
    "name,model", response_models(), ids=[n for n, _ in response_models()]
)
def test_model_resolves(name, model):
    """model_rebuild raises if any annotation names something undefined."""
    model.model_rebuild()
    assert model.model_fields is not None


def test_every_route_response_model_resolves():
    """The same check reached through the routes, so a model that is only
    referenced by a decorator is covered too."""
    for route in main.app.routes:
        model = getattr(route, "response_model", None)
        if model is None:
            continue
        if isinstance(model, type) and issubclass(model, BaseModel):
            model.model_rebuild()


def test_report_response_accepts_a_flag():
    """The shape the orchestrator actually produces."""
    main.ReportResponse(
        locality={
            "slug": "koramangala", "name": "Koramangala", "city": "Bengaluru",
            "state": "Karnataka", "h3_cell": "8961...", "lat": 12.9, "lon": 77.6,
        },
        trust_score={
            "score": 80, "coverage_pct": 40,
            "categories_counted": 2, "categories_total": 6,
        },
        verdict="ok",
        flags=[
            {
                "category": "crime",
                "severity": "serious",
                "headline": "Violence reported in local press",
                "detail": "Press coverage is not a crime rate.",
            }
        ],
        disagreements=[],
        categories=[],
        sources_used=[],
        generated_at="2026-09-03T00:00:00",
    )
