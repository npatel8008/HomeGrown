"""The shared client: what it does when a model stops answering.

The important distinction is between a model that answers badly and one that
does not answer at all. The first is worth a retry with a nudge; the second is
worth a full timeout to discover and nothing more, because the retry asks the
same silent endpoint the same question.
"""

import pytest

from services import llm_client


@pytest.fixture(autouse=True)
def _clean_cooldowns():
    llm_client.reset_unreachable()
    yield
    llm_client.reset_unreachable()


def test_a_timing_out_model_is_not_retried(monkeypatch):
    calls = []

    def hang(messages, model=None, **kwargs):
        calls.append(model)
        raise llm_client.LLMTimeout("no response within 20s")

    monkeypatch.setattr(llm_client, "complete", hang)
    monkeypatch.setattr(llm_client, "api_key", lambda: "test-key")

    assert llm_client.complete_json([{"role": "user", "content": "hi"}]) is None
    # One attempt, not MAX_ATTEMPTS: the second would cost another full timeout.
    assert len(calls) == 1


def test_a_bad_answer_is_retried(monkeypatch):
    calls = []

    def garbage(messages, model=None, **kwargs):
        calls.append(model)
        return "not json at all"

    monkeypatch.setattr(llm_client, "complete", garbage)
    monkeypatch.setattr(llm_client, "api_key", lambda: "test-key")

    assert llm_client.complete_json([{"role": "user", "content": "hi"}]) is None
    # It answered, so the nudge has something to correct — retry is worthwhile.
    assert len(calls) == llm_client.MAX_ATTEMPTS


def test_it_fails_over_to_the_model_that_answers(monkeypatch):
    def only_prose_works(messages, model=None, **kwargs):
        if model == llm_client.MODEL_STRUCTURED:
            raise llm_client.LLMTimeout("no response within 20s")
        return '{"ok": true}'

    monkeypatch.setattr(llm_client, "complete", only_prose_works)
    monkeypatch.setattr(llm_client, "api_key", lambda: "test-key")

    used = []
    result = llm_client.complete_json(
        [{"role": "user", "content": "hi"}],
        fallback_model=llm_client.MODEL_PROSE,
        used=used,
    )
    assert result == {"ok": True}
    assert used == [llm_client.MODEL_PROSE]


def test_a_silent_model_is_skipped_by_the_calls_behind_it(monkeypatch):
    calls = []

    def only_prose_works(messages, model=None, **kwargs):
        calls.append(model)
        if model == llm_client.MODEL_STRUCTURED:
            raise llm_client.LLMTimeout("no response within 20s")
        return '{"ok": true}'

    monkeypatch.setattr(llm_client, "complete", only_prose_works)
    monkeypatch.setattr(llm_client, "api_key", lambda: "test-key")

    for _ in range(3):
        llm_client.complete_json(
            [{"role": "user", "content": "hi"}], fallback_model=llm_client.MODEL_PROSE
        )

    # Discovered once; the two requests behind it went straight to the model
    # that works instead of each paying the timeout again.
    assert calls.count(llm_client.MODEL_STRUCTURED) == 1
    assert calls.count(llm_client.MODEL_PROSE) == 3


def test_a_recovered_model_is_used_again(monkeypatch):
    state = {"down": True}

    def flaky(messages, model=None, **kwargs):
        if model == llm_client.MODEL_STRUCTURED and state["down"]:
            raise llm_client.LLMTimeout("no response within 20s")
        return '{"ok": true}'

    monkeypatch.setattr(llm_client, "complete", flaky)
    monkeypatch.setattr(llm_client, "api_key", lambda: "test-key")

    llm_client.complete_json([{"role": "user", "content": "hi"}],
                             fallback_model=llm_client.MODEL_PROSE)
    state["down"] = False
    llm_client.reset_unreachable()  # stands in for the cooldown expiring

    used = []
    llm_client.complete_json([{"role": "user", "content": "hi"}],
                             fallback_model=llm_client.MODEL_PROSE, used=used)
    assert used == [llm_client.MODEL_STRUCTURED]
