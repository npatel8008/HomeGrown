"""SYSTEM 1 — how extraction degrades when the model runs out of budget.

K2-Think emits chain-of-thought before its answer, and the length of that
deliberation is not predictable from the prompt. A long, multi-cuisine meal
list ("Borscht, Tacos, Fruit salad, Pav bhaji") sometimes spends the entire
token budget thinking and returns no JSON at all — intermittently, so the same
input can succeed on the next call.

Asking again with the same prompt is not a fix; asking one question per meal
is, because a single dish is a short enough question to answer reliably. These
tests pin that fallback with a stubbed client, so they never touch the network.
"""

from typing import Dict, List, Optional

import pytest

from models.schemas import AnalyzeFoodRequest, Meal
from services import ingredient_extraction as ie
from services import llm_client

BORSCHT_WEEK = [
    Meal(name="Borscht", times_per_week=1),
    Meal(name="Tacos", times_per_week=2),
    Meal(name="Fruit salad", times_per_week=2),
    Meal(name="Pav bhaji", times_per_week=1),
]


def rows(*pairs) -> dict:
    return {
        "ingredients": [
            {"ingredient": name, "weekly_usage_score": score} for name, score in pairs
        ]
    }


class FakeLLM:
    """Stands in for `llm_client.complete_json`.

    `answers` maps the meal named in the user prompt to a reply. A meal with no
    entry gets None, which is what a real budget overrun looks like to callers.
    """

    def __init__(self, answers: Dict[str, Optional[dict]], combined: Optional[dict] = None):
        self.answers = answers
        self.combined = combined
        self.prompts: List[str] = []

    def __call__(self, messages, **kwargs):
        prompt = messages[-1]["content"]
        self.prompts.append(prompt)
        named = [name for name in self.answers if name in prompt]
        # More than one meal named means this is the combined call.
        if len(named) != 1:
            return self.combined
        return self.answers[named[0]]


@pytest.fixture(autouse=True)
def _no_cooldown_leaks():
    """A model marked unreachable in one test must not affect the next."""
    llm_client.reset_unreachable()
    yield
    llm_client.reset_unreachable()


@pytest.fixture
def live_llm(monkeypatch):
    """Make the module think a model is configured, without one being."""
    monkeypatch.setattr(llm_client, "is_available", lambda: True)
    monkeypatch.setattr(ie, "PER_MEAL_STAGGER_SECONDS", 0)

    def install(fake: FakeLLM) -> FakeLLM:
        monkeypatch.setattr(llm_client, "complete_json", fake)
        return fake

    return install


def test_combined_answer_is_used_when_the_model_replies(live_llm):
    fake = live_llm(FakeLLM({}, combined=rows(("Tomato", 100), ("Cabbage", 60))))
    result = ie.extract_ingredients(AnalyzeFoodRequest(household_size=4, meals=BORSCHT_WEEK))

    assert result.source == llm_client.MODEL_STRUCTURED
    assert [item.ingredient for item in result.ingredients] == ["Tomato", "Cabbage"]
    # One call only: no reason to split a request that answered.
    assert len(fake.prompts) == 1


def test_budget_overrun_falls_back_to_one_call_per_meal(live_llm):
    fake = live_llm(
        FakeLLM(
            {
                "Borscht": rows(("Beet", 100), ("Cabbage", 90)),
                "Tacos": rows(("Tomato", 100), ("Cilantro", 80)),
                "Fruit salad": rows(("Strawberry", 100)),
                "Pav bhaji": rows(("Potato", 100), ("Cilantro", 70)),
            },
            combined=None,  # the model deliberated past its budget
        )
    )
    result = ie.extract_ingredients(AnalyzeFoodRequest(household_size=4, meals=BORSCHT_WEEK))

    assert result.source == llm_client.MODEL_STRUCTURED
    names = [item.ingredient for item in result.ingredients]
    # The dishes the keyword matcher knows nothing about are represented.
    assert "Beet" in names and "Potato" in names
    # One combined attempt, then one per meal.
    assert len(fake.prompts) == 1 + len(BORSCHT_WEEK)


def test_per_meal_scores_are_weighted_by_how_often_the_meal_is_eaten(live_llm):
    live_llm(
        FakeLLM(
            {
                # Same score within its own meal; Tacos is eaten twice as often.
                "Borscht": rows(("Beet", 100)),
                "Tacos": rows(("Tomato", 100)),
            },
            combined=None,
        )
    )
    result = ie.extract_ingredients(
        AnalyzeFoodRequest(
            household_size=4,
            meals=[Meal(name="Borscht", times_per_week=1), Meal(name="Tacos", times_per_week=2)],
        )
    )

    by_name = {item.ingredient: item.weekly_usage_score for item in result.ingredients}
    assert by_name["Tomato"] == 100
    assert by_name["Beet"] == 50


def test_an_ingredient_in_several_meals_outranks_one_in_a_single_meal(live_llm):
    live_llm(
        FakeLLM(
            {
                "Tacos": rows(("Cilantro", 100), ("Tomato", 100)),
                "Pav bhaji": rows(("Cilantro", 100), ("Potato", 100)),
            },
            combined=None,
        )
    )
    result = ie.extract_ingredients(
        AnalyzeFoodRequest(
            household_size=4,
            meals=[Meal(name="Tacos", times_per_week=1), Meal(name="Pav bhaji", times_per_week=1)],
        )
    )

    assert result.ingredients[0].ingredient == "Cilantro"
    assert result.ingredients[0].weekly_usage_score == 100


def test_one_failed_meal_does_not_lose_the_others(live_llm):
    live_llm(
        FakeLLM(
            {
                "Borscht": rows(("Beet", 100)),
                "Tacos": None,  # this one overran too
            },
            combined=None,
        )
    )
    result = ie.extract_ingredients(
        AnalyzeFoodRequest(
            household_size=4,
            meals=[Meal(name="Borscht", times_per_week=1), Meal(name="Tacos", times_per_week=2)],
        )
    )

    assert result.source == llm_client.MODEL_STRUCTURED
    assert [item.ingredient for item in result.ingredients] == ["Beet"]


def test_a_single_meal_does_not_get_split(live_llm):
    """Splitting one meal is the same question again — go to the matcher."""
    fake = live_llm(FakeLLM({}, combined=None))
    result = ie.extract_ingredients(
        AnalyzeFoodRequest(household_size=4, meals=[Meal(name="Banana cake", times_per_week=1)])
    )

    assert result.source == "mock-keyword-matcher"
    assert len(fake.prompts) == 1


def test_total_model_failure_still_returns_a_profile(live_llm):
    live_llm(FakeLLM({name.name: None for name in BORSCHT_WEEK}, combined=None))
    result = ie.extract_ingredients(AnalyzeFoodRequest(household_size=4, meals=BORSCHT_WEEK))

    assert result.source == "mock-keyword-matcher"
    assert result.ingredients  # never empty — the demo must not show a blank page


# --- when the provider does not answer at all -------------------------------
#
# Distinct from a budget overrun, and the remedy is the opposite. An overrun
# means the model answered too slowly, so a smaller question helps. Silence
# means it did not answer, so every further question costs a full timeout and
# buys nothing. Getting this wrong cost 100s of spinner against a frontend that
# gives up at 60s, which the user sees as "offline demo mode".


class HangingLLM:
    """Every call times out, the way an unresponsive endpoint behaves."""

    def __init__(self):
        self.calls = 0

    def __call__(self, messages, failures=None, **kwargs):
        self.calls += 1
        if failures is not None:
            failures.append(llm_client.LLMTimeout("no response within 20s"))
        return None


def test_an_unresponsive_endpoint_is_not_asked_twice(live_llm, monkeypatch):
    hanging = HangingLLM()
    monkeypatch.setattr(llm_client, "complete_json", hanging)
    monkeypatch.setattr(ie, "PER_MEAL_STAGGER_SECONDS", 0)

    result = ie.extract_ingredients(AnalyzeFoodRequest(household_size=4, meals=BORSCHT_WEEK))

    assert result.source == "mock-keyword-matcher"
    # One combined call and no per-meal split: four more timeouts would have
    # blown the frontend's budget to learn what the first one already said.
    assert hanging.calls == 1


def test_a_budget_overrun_still_splits(live_llm):
    """The overrun path must not be collateral damage of the timeout fix."""
    fake = live_llm(
        FakeLLM(
            # Both meals present, so the combined prompt matches two names and
            # is answered by `combined` -- None here, but without a timeout.
            {"Tacos": rows(("Tomato", 100)), "Pasta": rows(("Basil", 100))},
            combined=None,
        )
    )
    result = ie.extract_ingredients(
        AnalyzeFoodRequest(
            household_size=4,
            meals=[Meal(name="Tacos", times_per_week=2), Meal(name="Pasta", times_per_week=1)],
        )
    )

    assert result.source == llm_client.MODEL_STRUCTURED
    assert len(fake.prompts) > 1


def test_extraction_cannot_outrun_the_frontend_timeout():
    """The budget must stay under the 60s the frontend waits."""
    assert ie.EXTRACTION_BUDGET_SECONDS < 60


# --- failing over to the model that is actually up --------------------------
#
# One model can be unreachable while the provider is otherwise healthy: we have
# watched K2-Think-v2 hang on a one-token request while the gateway returned
# 200s, auth returned 401s, and K2-Horizon answered in 1.5s. Falling back to the
# keyword matcher in that situation throws away a perfectly good model.


class OneModelDown:
    """`down` never answers; every other model answers normally."""

    def __init__(self, down: str, reply: dict):
        self.down = down
        self.reply = reply
        self.asked: List[str] = []

    def __call__(self, messages, model=None, fallback_model=None, failures=None,
                 used=None, **kwargs):
        for candidate in [model, fallback_model]:
            if candidate is None:
                continue
            self.asked.append(candidate)
            if candidate == self.down:
                if failures is not None:
                    failures.append(llm_client.LLMTimeout("no response within 20s"))
                continue
            if used is not None:
                used.append(candidate)
            return self.reply
        return None


def test_a_silent_model_fails_over_to_one_that_answers(live_llm, monkeypatch):
    stub = OneModelDown(llm_client.MODEL_STRUCTURED, rows(("Tomato", 100), ("Basil", 60)))
    monkeypatch.setattr(llm_client, "complete_json", stub)

    result = ie.extract_ingredients(
        AnalyzeFoodRequest(household_size=3, meals=[Meal(name="Pasta", times_per_week=2)])
    )

    assert [item.ingredient for item in result.ingredients] == ["Tomato", "Basil"]
    assert llm_client.MODEL_PROSE in stub.asked


def test_the_answering_model_gets_the_credit(live_llm, monkeypatch):
    """The UI shows this label; it must not credit a model that was silent."""
    stub = OneModelDown(llm_client.MODEL_STRUCTURED, rows(("Tomato", 100)))
    monkeypatch.setattr(llm_client, "complete_json", stub)

    result = ie.extract_ingredients(
        AnalyzeFoodRequest(household_size=3, meals=[Meal(name="Pasta", times_per_week=2)])
    )

    assert result.source == llm_client.MODEL_PROSE
    assert result.source != llm_client.MODEL_STRUCTURED
