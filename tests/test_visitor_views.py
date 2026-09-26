"""The opt-in view history (apps/api/app/prefs.py, migration 015).

The SQL runs against a real database in deployment; these check the parts that
decide *whether* anything is written and the schema guarantee that "forget me"
erases the history with the preference row.
"""

from pathlib import Path

import pytest
from fastapi import HTTPException

import apps.api.app.prefs as prefs

MIGRATION = (
    Path(__file__).resolve().parent.parent / "infra" / "migrations" / "015_visitor_view.sql"
)


def test_history_is_erased_by_the_existing_forget_me():
    """DELETE FROM visitor_pref must take the history with it."""
    sql = MIGRATION.read_text(encoding="utf-8")
    assert "REFERENCES visitor_pref(visitor_id) ON DELETE CASCADE" in sql


@pytest.mark.parametrize("slug", ["koramangala", "sector-14-gurugram", "  Indiranagar "])
def test_valid_slugs_are_normalised(slug):
    assert prefs._require_slug(slug) == slug.strip().lower()


@pytest.mark.parametrize("slug", ["", "../etc", "a b", "x" * 81, "drop;table"])
def test_malformed_slugs_are_rejected_before_any_query(slug):
    with pytest.raises(HTTPException) as exc:
        prefs._require_slug(slug)
    assert exc.value.status_code == 404


def test_recording_requires_a_visitor_id():
    with pytest.raises(HTTPException) as exc:
        prefs.record_view(prefs.ViewBody(slug="koramangala"), x_visitor_id=None)
    assert exc.value.status_code == 400


def test_listing_requires_a_well_formed_visitor_id():
    with pytest.raises(HTTPException) as exc:
        prefs.list_views(x_visitor_id="not-a-uuid")
    assert exc.value.status_code == 400


def test_history_is_bounded():
    assert prefs.VIEW_RETENTION_DAYS <= 180
    assert prefs.MAX_VIEWS_PER_VISITOR <= 500


def test_routes_are_registered():
    paths = {(r.path, m) for r in prefs.router.routes for m in r.methods}
    assert ("/api/v1/prefs/views", "POST") in paths
    assert ("/api/v1/prefs/views", "GET") in paths
