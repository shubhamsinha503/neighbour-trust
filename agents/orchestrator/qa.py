"""Answering a buyer's question against what this database actually holds.

docs/build-roadmap.md, Phase 3: "the retrieval-grounded Q&A agent answering
buyer questions against the stored dataset with citations". This is that agent.

**Retrieval here is not search.** The usual shape — embed the corpus, embed the
question, fetch the nearest chunks — solves a problem this project does not
have. A question is always about one locality, and everything held about one
locality is a few dozen structured rows that fit in a prompt whole. Vector
search would add a dependency, a failure mode and an index to keep fresh, in
exchange for discarding some of the little context there is. So retrieval is
deterministic: assemble every fact on record for this locality, number it, and
hand the model the lot.

That has a second benefit worth more than the first. Because the context is
assembled rather than searched, the citation ids are *known in advance*, so a
citation can be checked. `validate` drops any id the model invented, and an
answer claiming to be grounded that cites nothing survivable is demoted to a
refusal. A fabricated citation cannot reach a reader.

**Refusing is the common case, not the error case.** Most localities here run on
two of five categories. A buyer asking "is the water supply reliable in Kodati?"
must be told we do not know, because we do not — and an LLM handed a report and
a question will otherwise reach for the nearest adjacent fact and answer from
it. The prompt is written to make silence the default and the schema makes it
cheap: `answerable` is a field, not an inference from the prose.

**No numbers the sources do not contain.** The model may quote a score, a count
or a date that appears in a source, and may not compute a new one. "3 of 18
incidents involved violence" is repeatable; "about 17%" is a claim this project
cannot stand behind when the denominator is press coverage rather than reality.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional, Protocol

from agents.common import db
from agents.orchestrator import agent as orchestrator

log = logging.getLogger(__name__)


# How many confirmed headlines per category reach the prompt. The cap exists
# because a well-covered locality has hundreds and a thin one has none, and an
# answer should not get better simply because a neighbourhood is written about
# more — the same volume-vs-composition rule the scoring applies everywhere.
HEADLINES_PER_CATEGORY = 6

# Reports are the scarcest and most specific evidence here, so the cap is
# higher and ordering is newest-first.
REPORTS_LIMIT = 12

# A question longer than this is not a question.
MAX_QUESTION_CHARS = 400


@dataclass
class Source:
    """One checkable fact, with where it came from.

    `text` is what the model reads. `label` and `url` are what the reader sees
    next to the answer — the citation has to be followable by a person, or it
    is decoration.
    """

    id: int
    kind: str
    text: str
    label: Optional[str] = None
    url: Optional[str] = None
    vintage: Optional[str] = None

    def as_prompt_line(self) -> str:
        provenance = " · ".join(p for p in (self.label, self.vintage) if p)
        return f"[{self.id}] {self.text}" + (f"  ({provenance})" if provenance else "")

    def as_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "text": self.text,
            "label": self.label,
            "url": self.url,
            "vintage": self.vintage,
        }


@dataclass
class Answer:
    """What the agent decided, after validation.

    `answerable` false means the sources do not cover the question. That is a
    complete, correct outcome and the API returns it with a 200 — "we do not
    hold this" is the single most useful thing this product can say about the
    categories India does not publish.
    """

    answerable: bool
    text: str
    citations: list[Source] = field(default_factory=list)
    model: Optional[str] = None
    dropped_citations: list[int] = field(default_factory=list)

    def as_dict(self) -> dict[str, Any]:
        return {
            "answerable": self.answerable,
            "answer": self.text,
            "citations": [c.as_dict() for c in self.citations],
            "model": self.model,
        }


def _iso_day(value: Any) -> Optional[str]:
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, str) and value:
        return value[:10]
    return None


def assemble(conn, locality: dict[str, Any]) -> list[Source]:
    """Every fact on record for one locality, numbered.

    Ordering is by kind rather than by relevance, and is stable: the same
    locality produces the same ids until its data changes. That is what makes a
    citation quotable in a bug report.
    """
    report = orchestrator.build_report(conn, locality)
    sources: list[Source] = []

    def add(kind: str, text: str, **kw: Any) -> None:
        sources.append(Source(id=len(sources) + 1, kind=kind, text=text, **kw))

    city = locality.get("city") or ""
    name = locality.get("name") or locality.get("slug") or ""
    add("locality", f"{name} is a locality in {city}.")

    trust = report.trust_score
    add(
        "trust_score",
        f"{name}'s Trust Score is {trust.score} out of 100, built from "
        f"{trust.categories_counted} of {trust.categories_total} categories. "
        "Categories with no data are excluded and the rest re-weighted, so the "
        "score never silently treats an absence as a good result.",
    )

    for category in report.categories:
        label = category["label"]
        if not category.get("available"):
            add(
                "category_absent",
                f"There is no {label.lower()} data on record for {name}. "
                "Nothing has been measured, which is not the same as nothing "
                "being wrong.",
                label=label,
            )
            continue
        detail = category.get("summary") or ""
        if category.get("category") == "infrastructure":
            # The card's shorthand says "nearest station", which a reader of the
            # page understands and a model does not reliably connect to a
            # question about the metro. Live, "Is there a metro nearby?" on
            # Hebbal was refused with "nearest station 1.39 km" in the sources.
            detail = (
                f"{detail} Measured from OpenStreetMap: \"station\" means the "
                "nearest railway or metro station, and distances are straight-line "
                "from the locality centre."
            ).strip()
        baseline = (
            " This is the no-reports baseline rather than a measurement: it "
            "means nothing has been reported, not that conditions were checked."
            if category.get("is_baseline")
            else ""
        )
        add(
            "category",
            " ".join(
                part for part in (
                    f"{label} scores {category['score']} out of 100 for {name}.",
                    detail.strip(),
                    baseline.strip(),
                ) if part
            ),
            label=category.get("source_name") or label,
            vintage=_iso_day(category.get("data_vintage")),
        )

    for flag in report.flags:
        text = " ".join(p for p in (flag.get("headline"), flag.get("detail")) if p)
        if text:
            add("flag", text, label=f"{flag.get('severity', '')} flag".strip())

    for disagreement in report.disagreements:
        text = " ".join(
            p for p in (disagreement.headline, disagreement.detail) if p
        )
        if text:
            add("disagreement", f"Sources disagree: {text}")

    for item in report.upcoming:
        add(
            "upcoming",
            f"Local press reported: \"{item.get('headline')}\". This is a press "
            "report about work near the locality, not a commitment, and it "
            "counts toward no score.",
            label=item.get("source"),
            url=item.get("url"),
            vintage=_iso_day(item.get("publishedAt") or item.get("published_at")),
        )

    # Confirmed incident headlines, which are the evidence behind the safety and
    # water numbers. Quoted verbatim for the same reason `_upcoming` quotes:
    # a summary of a crime headline is a claim about a neighbourhood that no
    # source here supports.
    for category in ("crime", "water", "power"):
        try:
            incidents = db.confirmed_incidents(
                conn, h3_cell=locality["h3_cell"], category=category
            )
        except Exception:  # pragma: no cover - a missing enum value, not a bug
            continue
        for incident in incidents[:HEADLINES_PER_CATEGORY]:
            add(
                "headline",
                f"Headline confirmed as a {category} incident in {name}: "
                f"\"{incident['title']}\".",
                label=incident.get("domain"),
                url=incident.get("url"),
                vintage=_iso_day(incident.get("published_at")),
            )

    for report_row in db.accepted_reports(conn, h3_cell=locality["h3_cell"])[:REPORTS_LIMIT]:
        add(
            "resident_report",
            f"A resident reported, about {report_row.get('category')}: "
            f"\"{report_row.get('body')}\". They said this is "
            f"{report_row.get('basis', 'unstated')} and that they are "
            f"{report_row.get('tie_to_area', 'unstated')} to the area. One "
            "accepted report is evidence, not a measurement.",
            label="Resident report",
            vintage=_iso_day(report_row.get("submitted_at")),
        )

    return sources


SYSTEM_PROMPT = """You answer questions about Indian neighbourhoods for people \
deciding where to rent or buy. You are given a numbered list of sources — \
everything one database holds about one locality — and a question.

Answer ONLY from those sources.

Rules, in order of importance:

1. If the sources do not answer the question, set answerable to false and say \
plainly what is missing, in one sentence. This is the correct answer far more \
often than not: most localities here have data for two of five categories. Do \
not reach for an adjacent fact. A question about water is not answered by an \
air quality reading, and a question about schools is not answered by the number \
of parks.

2. Cite every claim. Each sentence that states a fact must carry the id of the \
source it came from, written as [3] or [3][7]. An uncited sentence is a \
sentence you invented.

3. Never state a number that is not written in a source. Do not add, average, \
convert to a percentage, or compare two numbers to produce a third. Quoting a \
score, a count or a date from a source is right; deriving anything from it is \
not.

4. Absence is not a finding. If a source says nothing is on record, say that we \
have no data — never that the neighbourhood is safe, clean, quiet or good. The \
absence of a reported incident is not evidence there was none, and saying \
otherwise would mislead someone about the thing they asked.

5. A press report is what was reported, not what is true, and an accepted \
resident report is one person's account. Say which you are relying on when it \
matters to the answer. For planned projects especially, write "local press has \
reported" — never that something "is under development", "is coming" or "will \
open". Indian projects are announced years before they happen, and many never \
do; turning a headline into a promise is what a builder's brochure does.

6. Be short. Two or three sentences. A buyer reading on a phone wants the \
answer, not the reasoning.

Do not recommend, advise or reassure. Do not tell anyone a neighbourhood is a \
good or bad place to live. Report what is on record and let them decide."""


class QaClient(Protocol):
    name: str

    def ask(self, *, question: str, sources: list[Source]) -> Optional[dict[str, Any]]:
        """Return {"answerable": bool, "answer": str, "citations": [int]} or None."""
        ...


class ClaudeQaClient:
    """Claude with a structured response, so citations are parsed not scraped.

    The system prompt is identical on every call and the source block is not,
    so only the prompt is cached — the opposite of the classifier, where the
    per-item text is a single headline.
    """

    def __init__(self, model: Optional[str] = None) -> None:
        try:
            import anthropic  # lazy, so the rest of the agent runs without it
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "The anthropic package is not installed. Run: pip install anthropic"
            ) from exc

        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not set — needed to answer questions.\n"
                "Get one at: https://console.anthropic.com/settings/keys\n"
                "Then add it to .env at the repo root."
            )

        self._model = model or os.environ.get("QA_MODEL") or "claude-opus-5"
        workspace = os.environ.get("ANTHROPIC_WORKSPACE_ID", "").strip()
        headers = {"anthropic-workspace-id": workspace} if workspace else None
        self._client = anthropic.Anthropic(default_headers=headers)
        self.name = f"claude:{self._model}"

    def ask(self, *, question: str, sources: list[Source]) -> Optional[dict[str, Any]]:
        block = "\n".join(source.as_prompt_line() for source in sources)
        prompt = f"Sources:\n{block}\n\nQuestion: {question}"

        try:
            response = self._client.messages.create(
                model=self._model,
                max_tokens=512,
                system=SYSTEM_PROMPT,
                cache_control={"type": "ephemeral"},
                output_config={
                    "format": {
                        "type": "json_schema",
                        "schema": {
                            "type": "object",
                            "properties": {
                                "answerable": {
                                    "type": "boolean",
                                    "description": (
                                        "False when the sources do not cover the "
                                        "question. Prefer false over a stretch."
                                    ),
                                },
                                "answer": {
                                    "type": "string",
                                    "description": (
                                        "Two or three sentences, every factual "
                                        "sentence carrying a [n] citation."
                                    ),
                                },
                                "citations": {
                                    "type": "array",
                                    "items": {"type": "integer"},
                                    "description": "Source ids used, in order.",
                                },
                            },
                            "required": ["answerable", "answer", "citations"],
                            "additionalProperties": False,
                        },
                    }
                },
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as exc:  # pragma: no cover - network
            log.warning("question not answered: %s", exc)
            return None

        text = "".join(
            part.text for part in response.content if getattr(part, "type", "") == "text"
        )
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            log.warning("unparseable answer: %r", text[:200])
            return None


class OpenAICompatibleQaClient:
    """The same question through any OpenAI-protocol provider.

    Exists because this deployment classifies news on Groq and holds no
    Anthropic credit, and a Q&A feature that needs a second paid account before
    it can answer anything is not finished. It reuses the classifier's provider
    presets rather than keeping its own table, so a key that works for one works
    for the other.

    JSON mode rather than a schema: not every provider here supports structured
    outputs, and `validate` does not trust the shape of what comes back anyway.
    """

    def __init__(self, provider: Optional[str] = None, model: Optional[str] = None) -> None:
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError("The openai package is not installed. Run: pip install openai") from exc

        from agents.news_monitor.classify import OpenAICompatibleClassifier

        provider = (
            provider or os.environ.get("QA_PROVIDER")
            or os.environ.get("CLASSIFIER_PROVIDER") or "groq"
        )
        preset = OpenAICompatibleClassifier.PROVIDERS.get(provider)
        if preset is None:
            raise RuntimeError(f"Unknown QA provider {provider!r}.")
        base_url, default_model, key_env, _rate = preset
        key = os.environ.get(key_env)
        if not key and provider != "ollama":
            raise RuntimeError(f"{key_env} is not set — needed to answer questions with {provider}.")

        self._model = (
            model or os.environ.get("QA_MODEL") or os.environ.get("CLASSIFIER_MODEL")
            or os.environ.get("GROQ_MODEL") or default_model
        )
        if not self._model:
            raise RuntimeError(f"No model for {provider}. Set QA_MODEL.")
        self._client = OpenAI(api_key=key or "not-needed", base_url=base_url)
        self.name = f"{provider}:{self._model}"

    # One retry, after a short pause. Groq's free tier meters tokens per minute
    # and shares that budget with the news classifier, so a question can be
    # refused for arriving a few seconds too soon. The first live question after
    # deploy failed exactly that way and the next four succeeded. A visitor
    # should not have to be the retry.
    RETRY_AFTER_SECONDS = 3.0

    def ask(self, *, question: str, sources: list[Source]) -> Optional[dict[str, Any]]:
        import time

        result = self._ask_once(question=question, sources=sources)
        if result is None:
            time.sleep(self.RETRY_AFTER_SECONDS)
            result = self._ask_once(question=question, sources=sources)
        return result

    def _ask_once(self, *, question: str, sources: list[Source]) -> Optional[dict[str, Any]]:
        block = "\n".join(source.as_prompt_line() for source in sources)
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                # Reasoning models spend tokens before answering; an answer is
                # three sentences, so this is headroom for thinking, not prose.
                max_tokens=1500,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {
                        "role": "system",
                        "content": SYSTEM_PROMPT
                        + "\n\nRespond with JSON only, in exactly this shape:\n"
                        '{"answerable": true|false, "answer": "two or three sentences '
                        'with [n] citations", "citations": [n, ...]}',
                    },
                    {"role": "user", "content": f"Sources:\n{block}\n\nQuestion: {question}"},
                ],
            )
        except Exception as exc:
            log.warning("question not answered (%s): %s", self.name, exc)
            return None

        raw = (response.choices[0].message.content or "").strip()
        # Some models wrap JSON in a fence even in JSON mode, and some emit
        # their reasoning in <think> tags first. Neither is a reason to fail.
        raw = re.sub(r"<think>.*?</think>", "", raw, flags=re.S).strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?|```$", "", raw.strip()).strip()
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            log.warning("unparseable answer from %s: %r", self.name, raw[:200])
            return None


def build_client() -> QaClient:
    """Claude when an Anthropic key is present, otherwise the classifier's provider.

    The order is a preference, not a fallback chain: whichever is chosen is
    used for every question, so answers from one deployment are not a mix of
    two models' judgement.
    """
    if os.environ.get("ANTHROPIC_API_KEY"):
        return ClaudeQaClient()
    return OpenAICompatibleQaClient()


CITATION_RE = re.compile(r"\[(\d+)\]")


def validate(raw: Optional[dict[str, Any]], sources: list[Source], model: str) -> Answer:
    """Turn a model response into an answer that cannot cite what does not exist.

    Three things are enforced, and each has a failure it is there to prevent:

      * **Every cited id must be a real source.** An invented [12] looks exactly
        as authoritative as a real one to a reader, and is the single worst
        thing this feature could do.
      * **A grounded answer must cite something.** A confident paragraph with no
        citation is the model answering from its own knowledge of Bengaluru,
        which is precisely what this product exists as an alternative to.
      * **Prose citations and the citation list must agree.** The list is what
        the UI renders; ids that appear only in the text would render as
        unfollowable brackets.
    """
    if not raw or not isinstance(raw, dict):
        return Answer(
            answerable=False,
            text="Something went wrong answering that. Please try again.",
            model=model,
        )

    by_id = {source.id: source for source in sources}
    text = (raw.get("answer") or "").strip()

    claimed = [int(n) for n in raw.get("citations") or [] if isinstance(n, (int, str)) and str(n).isdigit()]
    claimed += [int(n) for n in CITATION_RE.findall(text)]

    kept: list[Source] = []
    dropped: list[int] = []
    seen: set[int] = set()
    for cid in claimed:
        if cid in seen:
            continue
        seen.add(cid)
        if cid in by_id:
            kept.append(by_id[cid])
        else:
            dropped.append(cid)

    if dropped:
        # Strip the invented brackets from the prose too, so the reader is not
        # left with a marker pointing at nothing.
        text = CITATION_RE.sub(
            lambda m: "" if int(m.group(1)) in dropped else m.group(0), text
        )
        text = re.sub(r"\s+([.,])", r"\1", text).strip()
        log.warning("dropped invented citations: %s", dropped)

    answerable = bool(raw.get("answerable")) and bool(text)
    if answerable and not kept:
        # Claimed to be grounded, grounded in nothing.
        return Answer(
            answerable=False,
            text=(
                "That is not something the data here can answer for this "
                "locality."
            ),
            model=model,
            dropped_citations=dropped,
        )

    if not text:
        text = "That is not something the data here can answer for this locality."

    if not answerable:
        # A refusal carries no citations, so any markers left in its prose would
        # render as brackets pointing at nothing.
        text = CITATION_RE.sub("", text)
        text = re.sub(r"\s+([.,;])", r"\1", text)
        text = re.sub(r"\s{2,}", " ", text).strip()

    return Answer(
        answerable=answerable,
        text=text,
        citations=kept if answerable else [],
        model=model,
        dropped_citations=dropped,
    )


def ask(
    conn,
    locality: dict[str, Any],
    question: str,
    client: QaClient,
) -> Answer:
    """One question about one locality, answered from that locality's record."""
    question = (question or "").strip()
    if not question:
        return Answer(answerable=False, text="Ask a question first.", model=client.name)
    if len(question) > MAX_QUESTION_CHARS:
        question = question[:MAX_QUESTION_CHARS]

    sources = assemble(conn, locality)
    raw = client.ask(question=question, sources=sources)
    return validate(raw, sources, client.name)
