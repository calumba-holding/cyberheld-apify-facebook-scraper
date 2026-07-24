"""Classifiers for triage.

A classifier scores one piece of content 0..1 for how plausibly it crosses a
configured legal threshold, with a short rationale. This is **prioritization
only** — it never makes a legal determination, and its output is derived metadata
kept separate from sealed evidence.

`FakeClassifier` is deterministic (keyword-based) for tests/dev. `ClaudeClassifier`
uses the Anthropic SDK (claude-opus-4-8, structured output); it's kept behind this
interface so the pipeline runs offline without an API key.
"""

from __future__ import annotations

from typing import Protocol

DEFAULT_MODEL = "claude-opus-4-8"


class Verdict:
    __slots__ = ("score", "rationale")

    def __init__(self, score: float, rationale: str) -> None:
        self.score = score
        self.rationale = rationale


class Classifier(Protocol):
    name: str

    def classify(self, text: str) -> Verdict: ...


class FakeClassifier:
    """Deterministic keyword-based scorer for tests and offline dev."""

    def __init__(self, flag_terms: list[str], name: str = "fake") -> None:
        self.name = name
        self._terms = [t.lower() for t in flag_terms]

    def classify(self, text: str) -> Verdict:
        low = (text or "").lower()
        hits = [t for t in self._terms if t in low]
        # one flagged term reaches the 0.5 cutoff; more terms score higher.
        score = 0.0 if not hits else min(1.0, 0.5 + 0.25 * (len(hits) - 1))
        rationale = (
            f"matched flagged terms: {', '.join(hits)}" if hits else "no flagged terms found"
        )
        return Verdict(score=score, rationale=rationale)


class ClaudeClassifier:
    """Real classifier — claude-opus-4-8 via the Anthropic SDK, structured output.

    Needs ANTHROPIC_API_KEY (or an `ant auth login` profile) at call time; the SDK
    import is lazy so importing this module never requires `anthropic`.
    """

    def __init__(self, threshold_description: str, model: str = DEFAULT_MODEL, client=None) -> None:
        self.name = model
        self._model = model
        self._threshold = threshold_description
        self._client = client

    def _get_client(self):
        if self._client is None:
            import anthropic  # lazy

            self._client = anthropic.Anthropic()
        return self._client

    def classify(self, text: str) -> Verdict:
        from pydantic import BaseModel

        class _V(BaseModel):
            score: float
            rationale: str

        system = (
            "You are a legal-review TRIAGE assistant. You do NOT make legal "
            "determinations; you PRIORITIZE which items a human reviewer should look at "
            "first. Return a score from 0 to 1 for how plausibly the content crosses the "
            "stated threshold, and a one-sentence rationale. Prioritization only."
        )
        prompt = (
            f"Threshold to screen for: {self._threshold}\n\n"
            f"Content:\n{text}\n\n"
            "Return {score: 0..1, rationale: one sentence}."
        )
        resp = self._get_client().messages.parse(
            model=self._model,
            max_tokens=512,
            system=system,
            messages=[{"role": "user", "content": prompt}],
            output_format=_V,
        )
        v = resp.parsed_output
        return Verdict(score=float(max(0.0, min(1.0, v.score))), rationale=v.rationale)
