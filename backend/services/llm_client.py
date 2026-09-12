"""Thin client for the IFM (K2) chat-completions API.

OpenAI-compatible shape, so this is easy to repoint at another provider. The
rest of the codebase never imports `urllib` or knows the wire format — it calls
`complete_json()` and gets a dict back, or `None` if anything went wrong.

Configuration (see `.env.example`):
    IFM_API_KEY          required to enable any LLM feature
    IFM_BASE_URL         default https://api.ifm.ai/v1
    IFM_MODEL_STRUCTURED default IFM/K2-Think-v2
    IFM_MODEL_PROSE      default IFM/K2-Horizon-375B-A23B
    IFM_TIMEOUT          seconds per attempt, default 25

Model choice matters here. Measured on the ingredient-extraction prompt:

    K2-Think-v2               ~6s, emits clean JSON in `content` and keeps its
                              chain-of-thought in a separate `reasoning` field.
    K2-Horizon-375B-A23B      ~70s, spilled 8k tokens of chain-of-thought into
                              `content` and never closed the JSON object; also
                              timed out when sent `response_format`.

So K2-Think-v2 is the default for anything that must parse. Horizon is kept
configurable for free-text generation, where its verbosity is not a problem.

If `IFM_API_KEY` is unset the client reports itself unavailable and every
caller falls back to its deterministic offline implementation. The demo must
never depend on a network round trip.
"""

import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

BASE_URL = os.getenv("IFM_BASE_URL", "https://api.ifm.ai/v1").rstrip("/")
MODEL_STRUCTURED = os.getenv("IFM_MODEL_STRUCTURED", "IFM/K2-Think-v2")
MODEL_PROSE = os.getenv("IFM_MODEL_PROSE", "IFM/K2-Horizon-375B-A23B")
TIMEOUT_SECONDS = float(os.getenv("IFM_TIMEOUT", "25"))

# K2-Think keeps its chain-of-thought out of `content` but still bills it to
# the completion budget — 4k-9k tokens is normal for a small extraction. The
# server default (8192) truncates mid-answer, so ask for real headroom.
#
# Raising this is not a fix for a prompt that is too big to reason about:
# measured against a 245-crop list, 32768 burned the lot just as 16384 did.
# Keep the prompt small instead (see ingredient_extraction).
DEFAULT_MAX_TOKENS = int(os.getenv("IFM_MAX_TOKENS", "16384"))


def api_key() -> Optional[str]:
    key = os.getenv("IFM_API_KEY", "").strip()
    return key or None


def is_available() -> bool:
    """Whether LLM-backed paths should even be attempted."""
    return api_key() is not None


class LLMError(RuntimeError):
    pass


def complete(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: Optional[int] = None,
    json_mode: bool = False,
) -> str:
    """Raw completion. Raises LLMError on any failure."""
    key = api_key()
    if not key:
        raise LLMError("IFM_API_KEY is not set")

    payload: Dict[str, Any] = {
        "model": model or MODEL_STRUCTURED,
        "messages": messages,
        "temperature": temperature,
    }
    payload["max_tokens"] = max_tokens or DEFAULT_MAX_TOKENS
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    request = urllib.request.Request(
        "%s/chat/completions" % BASE_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": "Bearer %s" % key,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = json.load(response)
    except urllib.error.HTTPError as error:
        detail = error.read()[:400].decode("utf-8", "replace")
        raise LLMError("HTTP %s from %s: %s" % (error.code, BASE_URL, detail))
    except Exception as error:  # timeout, DNS, connection reset, bad JSON
        raise LLMError("%s: %s" % (type(error).__name__, error))

    try:
        choice = body["choices"][0]
        content = (choice.get("message") or {}).get("content") or ""
    except (KeyError, IndexError, TypeError):
        raise LLMError("Unexpected response shape: %s" % json.dumps(body)[:300])

    if not content:
        # Almost always means the model spent its whole budget deliberating.
        raise LLMError(
            "Empty content (finish_reason=%s, %s completion tokens) — "
            "shorten the prompt or raise IFM_MAX_TOKENS"
            % (choice.get("finish_reason"), (body.get("usage") or {}).get("completion_tokens"))
        )

    logger.info(
        "LLM %s completed in %.1fs (%s tokens)",
        payload["model"],
        time.time() - started,
        (body.get("usage") or {}).get("completion_tokens", "?"),
    )
    return content.strip()


# These models emit chain-of-thought before the answer; strip it before parsing.
_THINK_BLOCK = re.compile(r"<(think|thinking|reasoning)>.*?</\1>", re.DOTALL | re.IGNORECASE)
_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def extract_json_object(text: str) -> Optional[dict]:
    """Pull the first JSON object out of a model response.

    Tolerates reasoning preambles, ```json fences, and trailing commentary.
    """
    cleaned = _THINK_BLOCK.sub("", text).strip()

    fenced = _FENCE.search(cleaned)
    if fenced:
        cleaned = fenced.group(1).strip()

    # Fast path.
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        pass

    # Otherwise scan for the outermost balanced {...}, ignoring braces in strings.
    start = cleaned.find("{")
    while start != -1:
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(cleaned)):
            char = cleaned[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    try:
                        parsed = json.loads(cleaned[start : index + 1])
                        if isinstance(parsed, dict):
                            return parsed
                    except json.JSONDecodeError:
                        break
        start = cleaned.find("{", start + 1)

    return None


# Reasoning models occasionally loop and spend their whole budget deliberating,
# or just run slow. One retry converts most of those into a good answer; more
# than one isn't worth the wait when a deterministic fallback is standing by.
MAX_ATTEMPTS = 2

# Appended on the retry to push the model straight to the answer.
_NUDGE = {
    "role": "user",
    "content": "Output only the JSON object now. No explanation, no thinking.",
}


def complete_json(
    messages: List[Dict[str, str]],
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: Optional[int] = None,
) -> Optional[dict]:
    """Completion that must parse as a JSON object. Returns None on any failure.

    Callers treat None as "fall back to the deterministic implementation" —
    an LLM hiccup degrades the answer, it never breaks the request.
    """
    for attempt in range(1, MAX_ATTEMPTS + 1):
        payload = list(messages) if attempt == 1 else list(messages) + [_NUDGE]
        try:
            raw = complete(
                payload,
                model=model or MODEL_STRUCTURED,
                temperature=temperature,
                max_tokens=max_tokens,
                json_mode=True,
            )
        except LLMError as error:
            logger.warning("LLM attempt %d/%d failed: %s", attempt, MAX_ATTEMPTS, error)
            continue

        parsed = extract_json_object(raw)
        if parsed is not None:
            return parsed
        logger.warning(
            "LLM attempt %d/%d returned unparseable JSON: %s", attempt, MAX_ATTEMPTS, raw[:200]
        )

    logger.warning("LLM gave up after %d attempts, using offline fallback", MAX_ATTEMPTS)
    return None
