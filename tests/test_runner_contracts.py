"""Every agent runner must call the shared ingest-run helpers correctly.

The connectivity agent shipped calling start_ingest_run without its required
`sources` argument and finish_ingest_run with `localities_ok` instead of `ok`.
Both raise TypeError, and neither is reachable by importing the module — they
sit inside main(), behind a database connection — so a full workflow run was the
first thing to notice, after the job had already been queued and paid for in
minutes.

Binding the arguments against the real signature costs nothing and catches the
whole class.
"""

import ast
import inspect
import pathlib

import pytest

from agents.common import db

RUNNERS = sorted(pathlib.Path("agents").glob("*/run.py"))
HELPERS = {"start_ingest_run", "finish_ingest_run"}


def calls_in(path: pathlib.Path):
    """Every db.<helper>(...) call in a runner, with its keyword names."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if not (isinstance(func, ast.Attribute) and func.attr in HELPERS):
            continue
        if not (isinstance(func.value, ast.Name) and func.value.id == "db"):
            continue
        yield func.attr, len(node.args), {kw.arg for kw in node.keywords if kw.arg}


def test_there_are_runners_to_check():
    """A glob that silently matches nothing would make every test below pass."""
    assert RUNNERS, "no agent runners found"


@pytest.mark.parametrize("path", RUNNERS, ids=[p.parent.name for p in RUNNERS])
def test_ingest_run_helpers_are_called_correctly(path):
    for name, positional, keywords in calls_in(path):
        signature = inspect.signature(getattr(db, name))
        # `conn` is always positional; bind placeholders for the rest.
        args = [None] * positional
        kwargs = {key: None for key in keywords}
        try:
            signature.bind(*args, **kwargs)
        except TypeError as exc:
            pytest.fail(f"{path}: db.{name}({', '.join(sorted(keywords))}) — {exc}")
