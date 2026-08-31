"""The two locality helpers must return the same columns.

They diverged once: list_localities omitted `id`, and agents/news_monitor
raised KeyError('id') only when run over all localities. A single-locality run
used get_locality, which had the column, so local testing passed and CI caught
it instead.

This reads the SQL rather than hitting a database, so it runs anywhere.
"""

import re
from pathlib import Path

SOURCE = Path(__file__).resolve().parent.parent / "agents" / "common" / "db.py"


def _selected_columns(function_name: str) -> set[str]:
    text = SOURCE.read_text(encoding="utf-8")
    start = text.index(f"def {function_name}(")
    body = text[start : text.index("\ndef ", start + 1)]
    select = re.search(r"SELECT (.+?)\s+FROM locality", body, re.S)
    assert select, f"no SELECT ... FROM locality found in {function_name}"

    columns = set()
    for part in select.group(1).split(","):
        part = part.strip()
        alias = re.search(r"\bAS\s+(\w+)", part, re.I)
        columns.add((alias.group(1) if alias else part).strip())
    return columns


def test_locality_helpers_return_the_same_columns():
    assert _selected_columns("list_localities") == _selected_columns("get_locality")


def test_both_include_id():
    """news_monitor uses it as a foreign key; its absence is the original bug."""
    for fn in ("list_localities", "get_locality"):
        assert "id" in _selected_columns(fn), f"{fn} must select id"
