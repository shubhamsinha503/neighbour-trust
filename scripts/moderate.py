"""Review resident reports. Nothing they say counts until it goes through here.

    python -m scripts.moderate                     # walk the queue
    python -m scripts.moderate --list
    python -m scripts.moderate --show 12
    python -m scripts.moderate --accept 12 --type waterlogging --note "photo checks out"
    python -m scripts.moderate --reject 13 --note "about a different neighbourhood"
    python -m scripts.moderate --spam 14
    python -m scripts.moderate --forget 12         # erase the contact, keep the report

A command line rather than a web page, on purpose. A moderation interface on the
public site needs authentication, and authentication needs accounts — which this
product does not have and should not grow just to let one person approve a
queue. A terminal already knows who you are.

**Accepting is the only thing here that changes what a stranger sees.** A report
becomes a flag on a real neighbourhood's card, and can displace the no-reports
baseline, the moment it is accepted. Rejecting costs nothing by comparison. When
in doubt the cheap mistake is to leave it pending.

**Who reviewed it is recorded.** Not for blame — because a card can be traced
back to a decision, and a decision nobody's name is on is one nobody has to
defend.
"""

from __future__ import annotations

import argparse
import getpass
import os
import pathlib
import sys
from typing import Optional

from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

from agents.common import db  # noqa: E402
from agents.news_monitor.characterise import is_excluded  # noqa: E402
from agents.orchestrator import reports as reports_mod  # noqa: E402

# What this prints is text a resident wrote, and Bengaluru and Gurugram are not
# ASCII places — a report in Kannada, Hindi or Devanagari is the normal case,
# not the exotic one. A Windows console defaults to cp1252, where printing any
# of it raises UnicodeEncodeError.
#
# That failure is worse than it looks: the crash happens *after* the review is
# committed, so the moderator sees a traceback and cannot tell whether their
# decision applied. Fixed at the stream rather than by sanitising each string,
# because the text passing through here is not ours to mangle.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # already wrapped, or not a real tty
        pass

# Types a moderator is likely to want, per category. Suggestions rather than a
# closed list: the classifier that reads news produces free text, and a report
# describing something these do not cover is exactly the report worth keeping.
SUGGESTED_TYPES: dict[str, tuple[str, ...]] = {
    "crime": ("theft", "snatching", "burglary", "assault", "robbery",
              "harassment", "vehicle_break_in"),
    "water": ("waterlogging", "water_shortage", "tanker_dependence",
              "contamination", "sewage_overflow"),
    "power": ("power_outage", "transformer_failure", "voltage_fluctuation",
              "scheduled_maintenance"),
    "schools": ("safety_concern", "admission_practice", "infrastructure"),
    "air_quality": ("dust", "burning", "industrial_emission", "construction_dust"),
    "infrastructure": ("road_condition", "construction", "traffic", "encroachment"),
}


def moderator_name(explicit: Optional[str]) -> str:
    """Whoever is making the decision, in order of how deliberate it is."""
    if explicit:
        return explicit
    from_env = os.environ.get("MODERATOR")
    if from_env:
        return from_env
    try:
        return getpass.getuser()
    except Exception:
        return "unknown"


def render(report: dict, full: bool = False) -> str:
    where = f"{report.get('name') or report.get('slug') or '?'}"
    head = (f"[{report['id']:>4}] {where} | {report['category']}"
            f" | submitted {report['submitted_at']:%d %b %Y}")
    if not full:
        body = (report["body"] or "").replace("\n", " ")
        return f"{head}\n       {body[:100]}{'...' if len(body) > 100 else ''}"

    weight = reports_mod.credibility(report)
    lines = [
        head,
        "",
        report["body"],
        "",
        f"  when       {report.get('occurred_window') or 'not said'}",
        f"  basis      {report.get('basis')}",
        f"  ties       {report.get('tie_to_area')}",
        f"  weight     {weight:.2f}   (1.00 = a first-hand account from a resident)",
    ]
    if report.get("evidence_url"):
        lines.append(f"  evidence   {report['evidence_url']}")
    return "\n".join(lines)


def check_type(category: str, incident_type: Optional[str]) -> Optional[str]:
    """Refuse a type that the cards deliberately never show.

    Self-harm, custody deaths and complaints about policing are excluded from
    safety cards by design — they are not risks to a resident, and reporting
    suicides by neighbourhood is what press guidelines specifically caution
    against. Accepting a report under one of those types would store something
    that can never be displayed, which is worse than refusing it here.
    """
    if not incident_type:
        return None
    if is_excluded(incident_type):
        return (
            f"'{incident_type}' is excluded from the cards by design and would "
            f"never be shown. See agents/news_monitor/characterise.py. If the "
            f"report describes something else as well, tag it as that instead."
        )
    return None


def do_review(conn, report_id: int, state: str, *, by: str,
              incident_type: Optional[str], note: Optional[str]) -> int:
    if state == "accepted":
        row = conn.execute(
            "SELECT category FROM resident_report WHERE id = %s", (report_id,)
        ).fetchone()
        if row is None:
            print(f"No report with id {report_id}.", file=sys.stderr)
            return 1
        problem = check_type(row["category"], incident_type)
        if problem:
            print(f"Refused: {problem}", file=sys.stderr)
            return 1

    ok = db.review_resident_report(
        conn, report_id=report_id, state=state, reviewed_by=by,
        incident_type=incident_type, note=note,
    )
    if not ok:
        print(f"No report with id {report_id}.", file=sys.stderr)
        return 1
    conn.commit()
    print(f"{report_id} -> {state} (by {by})")
    return 0


def walk_queue(conn, by: str) -> int:
    """One at a time, with the full text in front of you."""
    pending = db.pending_reports(conn, limit=200)
    if not pending:
        print("Nothing waiting for review.")
        return 0

    print(f"{len(pending)} report(s) waiting. "
          "a=accept  r=reject  s=spam  <enter>=skip  q=quit\n")
    for report in pending:
        print("-" * 72)
        print(render(report, full=True))
        suggestions = SUGGESTED_TYPES.get(report["category"], ())
        print()
        try:
            choice = input("  decision: ").strip().lower()
        except EOFError:
            print("\nStopped — everything not decided stays pending.")
            return 0

        if choice == "q":
            print("Stopped — everything not decided stays pending.")
            return 0
        if choice == "a":
            if suggestions:
                print(f"  suggested: {', '.join(suggestions)}")
            incident_type = input("  what kind of incident: ").strip() or None
            problem = check_type(report["category"], incident_type)
            if problem:
                print(f"  refused: {problem}\n  left pending.")
                continue
            note = input("  note (optional): ").strip() or None
            do_review(conn, report["id"], "accepted", by=by,
                      incident_type=incident_type, note=note)
        elif choice in ("r", "s"):
            note = input("  reason (optional): ").strip() or None
            do_review(conn, report["id"], "rejected" if choice == "r" else "spam",
                      by=by, incident_type=None, note=note)
        else:
            print("  left pending.")
        print()
    return 0


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Review resident reports.")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--list", action="store_true", help="Show the queue.")
    action.add_argument("--show", type=int, metavar="ID")
    action.add_argument("--accept", type=int, metavar="ID")
    action.add_argument("--reject", type=int, metavar="ID")
    action.add_argument("--spam", type=int, metavar="ID")
    action.add_argument("--forget", type=int, metavar="ID",
                        help="Erase the contact address, keeping the report.")
    parser.add_argument("--type", dest="incident_type",
                        help="What kind of incident, when accepting.")
    parser.add_argument("--note")
    parser.add_argument("--by", help="Who is reviewing. Defaults to $MODERATOR, then your login.")
    args = parser.parse_args(argv)

    by = moderator_name(args.by)

    with db.connect() as conn:
        if args.forget:
            if db.forget_report_contact(conn, report_id=args.forget):
                conn.commit()
                print(f"{args.forget}: contact erased, report kept.")
                return 0
            print(f"{args.forget}: no contact address to erase.", file=sys.stderr)
            return 1

        if args.accept:
            return do_review(conn, args.accept, "accepted", by=by,
                             incident_type=args.incident_type, note=args.note)
        if args.reject:
            return do_review(conn, args.reject, "rejected", by=by,
                             incident_type=None, note=args.note)
        if args.spam:
            return do_review(conn, args.spam, "spam", by=by,
                             incident_type=None, note=args.note)

        if args.show:
            row = conn.execute(
                """SELECT r.*, l.slug, l.name FROM resident_report r
                     JOIN locality l ON l.id = r.locality_id WHERE r.id = %s""",
                (args.show,),
            ).fetchone()
            if row is None:
                print(f"No report with id {args.show}.", file=sys.stderr)
                return 1
            print(render(row, full=True))
            print(f"  state      {row['state']}")
            return 0

        pending = db.pending_reports(conn, limit=200)
        if args.list:
            if not pending:
                print("Nothing waiting for review.")
                return 0
            for report in pending:
                print(render(report))
            print(f"\n{len(pending)} waiting. Nothing counts until accepted.")
            return 0

        # No flags: walk the queue, which is the thing this exists for.
        if not sys.stdin.isatty():
            print("Not a terminal — use --list, or --accept/--reject with an id.",
                  file=sys.stderr)
            return 1
        return walk_queue(conn, by)


if __name__ == "__main__":
    sys.exit(main())
