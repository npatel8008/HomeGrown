"""Natural-language "why this crop" rationales.

A helper for SYSTEM 2 (crop scoring), kept in its own module so the wording
layer can change without touching the maths. `crop_scoring` calls this once,
with every recommended crop in a single batched request, and keeps its own
template-written reasons if anything goes wrong.

Off unless `IFM_API_KEY` is set. Disable explicitly with GARDENAI_LLM_REASONS=0.
"""

import logging
import os
from typing import Dict, List, Optional

from services import llm_client

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You write one-sentence explanations for garden crop picks.

Reply with ONLY this JSON, nothing else:
{"reasons":{"tomato":"...","basil":"..."}}

- One entry per crop id given, using that exact id as the key.
- One sentence, under 28 words, plain language, second person ("your").
- Say why THIS household should grow it: name the meals or the score that
  drives it, plus the space, light, or money angle when it's the real reason.
- No emoji, no marketing voice, no repeating the crop name twice.
Answer immediately. Do not deliberate."""


def enabled() -> bool:
    if os.getenv("GARDENAI_LLM_REASONS", "1").strip() in ("0", "false", "no"):
        return False
    return llm_client.is_available()


def _build_user_prompt(
    crops: List[dict], household_size: int, sunlight: str, plot_sqft: float, experience: str
) -> str:
    lines = []
    for crop in crops:
        lines.append(
            "%s | %s | %d plants | demand %d/100 | light fit %d/100 | "
            "space %d/100 | value %d/100 | ease %d/100 | %s to grow | "
            "%.0f lbs, saves $%.0f, %d days"
            % (
                crop["crop_id"],
                crop["name"],
                crop["plants"],
                crop["demand"],
                crop["climate"],
                crop["space"],
                crop["value"],
                crop["ease"],
                crop["difficulty"],
                crop["yield_lbs"],
                crop["savings"],
                crop["days"],
            )
        )
    meals = ", ".join(crop["meals"] for crop in crops if crop.get("meals")) or "not given"
    return (
        "Household: %d people, %s, %.0f sq ft, %s gardener\n"
        "Their meals mention: %s\n\n"
        "Crops:\n%s"
        % (household_size, sunlight, plot_sqft, experience, meals, "\n".join(lines))
    )


def write_reasons(
    crops: List[dict],
    household_size: int,
    sunlight: str,
    plot_sqft: float,
    experience: str,
) -> Optional[Dict[str, str]]:
    """crop_id -> sentence. Returns None if unavailable or unusable."""
    if not crops or not enabled():
        return None

    payload = llm_client.complete_json(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": _build_user_prompt(
                    crops, household_size, sunlight, plot_sqft, experience
                ),
            },
        ],
        model=llm_client.MODEL_STRUCTURED,
        temperature=0.4,
    )
    if not payload:
        return None

    raw = payload.get("reasons")
    if not isinstance(raw, dict):
        logger.warning("Reason writer returned no 'reasons' object")
        return None

    wanted = {crop["crop_id"] for crop in crops}
    reasons: Dict[str, str] = {}
    for crop_id, sentence in raw.items():
        key = str(crop_id).strip()
        if key not in wanted or not isinstance(sentence, str):
            continue
        text = " ".join(sentence.split())[:260].strip()
        if len(text) < 15:
            continue
        if not text.endswith((".", "!", "?")):
            text += "."
        reasons[key] = text

    # A partial answer is fine — crop_scoring keeps its template for the rest.
    if not reasons:
        return None
    logger.info("Reason writer covered %d/%d crops", len(reasons), len(crops))
    return reasons
