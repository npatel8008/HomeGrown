"""SYSTEM 1 — Ingredient extraction.

Turns free-text food habits + a list of meals into a weighted household
food-demand profile.

Two implementations, same output contract:

  * `_extract_with_llm`  — asks K2 (IFM) to read the household's eating habits
    and map them onto the crop library. Used whenever `IFM_API_KEY` is set.
  * `_extract_with_keywords` — a deterministic keyword matcher over a
    hand-written meal->ingredient map. Always available, and the fallback
    whenever the LLM is unavailable, slow, or returns something unusable.

`extract_ingredients()` picks between them. Nothing outside this module knows
or cares which one ran.
"""

import logging
import re
from typing import Dict, List, NamedTuple, Optional

from models.schemas import AnalyzeFoodRequest, ExtractedIngredient
from services import llm_client
from services.crop_repository import all_crops

logger = logging.getLogger(__name__)

# meal keyword -> ingredients it implies, with a per-ingredient weight (0-1)
MEAL_INGREDIENTS: Dict[str, Dict[str, float]] = {
    "taco": {"Tomato": 1.0, "Cilantro": 0.9, "Jalapeño": 0.8, "Lettuce": 0.7, "Green Onion": 0.4},
    "burrito": {"Tomato": 0.9, "Cilantro": 0.9, "Jalapeño": 0.7, "Lettuce": 0.5},
    "salsa": {"Tomato": 1.0, "Cilantro": 1.0, "Jalapeño": 1.0, "Green Onion": 0.5},
    "pasta": {"Tomato": 1.0, "Basil": 0.9, "Bell Pepper": 0.3, "Spinach": 0.3},
    "pizza": {"Tomato": 1.0, "Basil": 0.8, "Bell Pepper": 0.5},
    "salad": {"Lettuce": 1.0, "Spinach": 0.9, "Cucumber": 0.8, "Cherry Tomato": 0.8, "Green Onion": 0.4},
    "omelet": {"Spinach": 0.9, "Green Onion": 0.7, "Bell Pepper": 0.6, "Tomato": 0.5},
    "eggs": {"Spinach": 0.8, "Green Onion": 0.6, "Bell Pepper": 0.5},
    "stir fry": {"Bell Pepper": 1.0, "Green Onion": 0.9, "Spinach": 0.5, "Jalapeño": 0.3},
    "curry": {"Cilantro": 0.9, "Jalapeño": 0.7, "Spinach": 0.7, "Tomato": 0.7},
    "sandwich": {"Lettuce": 0.9, "Tomato": 0.9, "Cucumber": 0.4},
    "soup": {"Tomato": 0.8, "Spinach": 0.5, "Green Onion": 0.4},
    "smoothie": {"Spinach": 0.8},
    "burger": {"Lettuce": 0.9, "Tomato": 0.9},
    "sushi": {"Cucumber": 0.9, "Green Onion": 0.4},
    "pho": {"Cilantro": 1.0, "Jalapeño": 0.8, "Green Onion": 0.9},
    "stew": {"Tomato": 0.7, "Bell Pepper": 0.5},
    "bowl": {"Spinach": 0.6, "Cherry Tomato": 0.6, "Cucumber": 0.5, "Green Onion": 0.4},
}

# ingredient names that may be mentioned directly in free text
DIRECT_MENTIONS = {
    "tomato": "Tomato",
    "tomatoes": "Tomato",
    "cherry tomato": "Cherry Tomato",
    "cherry tomatoes": "Cherry Tomato",
    "basil": "Basil",
    "cilantro": "Cilantro",
    "coriander": "Cilantro",
    "jalapeno": "Jalapeño",
    "jalapeño": "Jalapeño",
    "pepper": "Bell Pepper",
    "peppers": "Bell Pepper",
    "bell pepper": "Bell Pepper",
    "spinach": "Spinach",
    "lettuce": "Lettuce",
    "greens": "Lettuce",
    "green onion": "Green Onion",
    "scallion": "Green Onion",
    "scallions": "Green Onion",
    "cucumber": "Cucumber",
    "cucumbers": "Cucumber",
}

# Keywords that describe the same meal. The canonical keyword keeps the highest
# frequency seen, so "omelets 4x" + "eggs most mornings" counts once, not twice.
MEAL_ALIASES = {
    "eggs": "omelet",
    "burrito": "taco",
    "salsa": "taco",
    "burger": "sandwich",
    "stew": "soup",
    "pizza": "pasta",
}

# Frequency words we understand in free text, as times per week.
FREQUENCY_WORDS = {
    "every day": 7.0,
    "daily": 7.0,
    "most mornings": 5.0,
    "most days": 5.0,
    "a few times": 3.0,
    "twice": 2.0,
    "two times": 2.0,
    "three times": 3.0,
    "four times": 4.0,
    "once": 1.0,
    "occasionally": 0.5,
    "rarely": 0.25,
}

_GROWABLE_BY_NAME = {crop["name"].lower(): crop for crop in all_crops()}


def _free_text_meals(text: str) -> Dict[str, float]:
    """Very rough NL pass: find meal keywords and guess a weekly frequency."""
    lowered = text.lower()
    found: Dict[str, float] = {}
    for keyword in MEAL_INGREDIENTS:
        for match in re.finditer(re.escape(keyword), lowered):
            window = lowered[match.end(): match.end() + 40]
            frequency = 2.0
            for phrase, value in FREQUENCY_WORDS.items():
                if phrase in window:
                    frequency = value
                    break
            number = re.search(r"(\d+)\s*(?:x|times)", window)
            if number:
                frequency = float(number.group(1))
            found[keyword] = max(found.get(keyword, 0.0), frequency)
    return found


def _extract_with_keywords(request: AnalyzeFoodRequest) -> List[ExtractedIngredient]:
    # ingredient -> accumulated raw weight, plus the meals that contributed
    weights: Dict[str, float] = {}
    sources: Dict[str, List[str]] = {}

    def add(ingredient: str, amount: float, meal_label: str) -> None:
        weights[ingredient] = weights.get(ingredient, 0.0) + amount
        bucket = sources.setdefault(ingredient, [])
        if meal_label and meal_label not in bucket:
            bucket.append(meal_label)

    structured = {meal.name: meal.times_per_week for meal in request.meals}
    structured_lowered = {name.lower(): freq for name, freq in structured.items()}
    combined = dict(_free_text_meals(request.free_text))

    for name, freq in structured_lowered.items():
        for keyword in MEAL_INGREDIENTS:
            if keyword in name:
                combined[keyword] = max(combined.get(keyword, 0.0), freq)

    collapsed: Dict[str, float] = {}
    for keyword, freq in combined.items():
        canonical = MEAL_ALIASES.get(keyword, keyword)
        collapsed[canonical] = max(collapsed.get(canonical, 0.0), freq)

    for keyword, freq in collapsed.items():
        label = keyword.title()
        for ingredient, weight in MEAL_INGREDIENTS[keyword].items():
            add(ingredient, weight * freq, label)

    # Direct ingredient mentions in free text count for a little on their own.
    lowered_text = request.free_text.lower()
    for phrase, ingredient in DIRECT_MENTIONS.items():
        if re.search(rf"\b{re.escape(phrase)}\b", lowered_text):
            add(ingredient, 1.5, "Mentioned directly")

    # Household size nudges everything up slightly — more people, more volume.
    household_factor = 1.0 + max(0, request.household_size - 1) * 0.06

    if not weights:
        return []

    top = max(weights.values())
    results: List[ExtractedIngredient] = []
    for ingredient, raw in sorted(weights.items(), key=lambda kv: -kv[1]):
        score = int(round(min(100.0, (raw / top) * 92 * household_factor + 8)))
        crop = _GROWABLE_BY_NAME.get(ingredient.lower())
        results.append(
            ExtractedIngredient(
                ingredient=ingredient,
                weekly_usage_score=score,
                growable=crop is not None,
                crop_id=crop["id"] if crop else None,
                matched_meals=sources.get(ingredient, []),
            )
        )
    return results


# ---------------------------------------------------------------------------
# LLM-backed extraction
# ---------------------------------------------------------------------------

_CROP_LIBRARY = [(crop["id"], crop["name"]) for crop in all_crops()]

# Kept deliberately terse. K2-Think's deliberation length scales with prompt
# complexity, and a long rule list made it burn its whole token budget on
# reasoning and return nothing. Short prompt = ~5s and a clean answer.
SYSTEM_PROMPT = """Extract the produce a household eats, mapped to a crop library.

Reply with ONLY this JSON, nothing else:
{"ingredients":[{"ingredient":"Tomato","weekly_usage_score":100,"crop_id":"tomato","matched_meals":["Tacos"]}]}

- crop_id: one of the given ids, or null if not in the library.
- weekly_usage_score: 0-100, relative to each other; the top one is 100.
- Weight by how often the meal is eaten and how central the ingredient is.
- Don't count the same habit twice if the meal list and the notes both mention it.
- 6-12 rows, most-used first, produce only. No meat, dairy, grains or pantry staples.
Answer immediately. Do not deliberate."""


def _build_user_prompt(request: AnalyzeFoodRequest) -> str:
    library = ", ".join(crop_id for crop_id, _ in _CROP_LIBRARY)
    meals = (
        ", ".join("%s %gx/wk" % (meal.name, meal.times_per_week) for meal in request.meals)
        or "(none listed)"
    )
    return (
        "Library: %s\n"
        "Household: %d people\n"
        "Meals: %s\n"
        "Notes: %s"
        % (
            library,
            request.household_size,
            meals,
            request.free_text.strip() or "(none)",
        )
    )


def _coerce_ingredient(row: object) -> Optional[ExtractedIngredient]:
    """Validate one row from the model. Returns None if it can't be trusted."""
    if not isinstance(row, dict):
        return None

    name = str(row.get("ingredient") or "").strip()
    if not name or len(name) > 60:
        return None

    try:
        score = int(round(float(row.get("weekly_usage_score", 0))))
    except (TypeError, ValueError):
        return None
    score = max(0, min(100, score))

    # Trust our own library over whatever the model said about growability.
    crop_id = row.get("crop_id")
    crop_id = str(crop_id).strip() if crop_id else ""
    known = {cid: cname for cid, cname in _CROP_LIBRARY}
    if crop_id not in known:
        # The model may have given a good name but a bad/absent id.
        by_name = {cname.lower(): cid for cid, cname in _CROP_LIBRARY}
        crop_id = by_name.get(name.lower(), "")

    meals = row.get("matched_meals")
    if isinstance(meals, list):
        matched = [str(meal)[:40] for meal in meals[:6] if str(meal).strip()]
    else:
        matched = []

    return ExtractedIngredient(
        ingredient=known.get(crop_id, name),
        weekly_usage_score=score,
        growable=bool(crop_id),
        crop_id=crop_id or None,
        matched_meals=matched,
    )


def _extract_with_llm(request: AnalyzeFoodRequest) -> Optional[List[ExtractedIngredient]]:
    """Returns None if the model is unavailable or its answer is unusable."""
    payload = llm_client.complete_json(
        [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(request)},
        ],
        model=llm_client.MODEL_STRUCTURED,
        temperature=0.1,
    )
    if not payload:
        return None

    rows = payload.get("ingredients")
    if not isinstance(rows, list):
        logger.warning("LLM response had no 'ingredients' list")
        return None

    results: List[ExtractedIngredient] = []
    seen = set()
    for row in rows[:20]:
        item = _coerce_ingredient(row)
        if item is None:
            continue
        # Models sometimes pad the list with every remaining library crop at
        # score 0. Those aren't household demand, so drop them.
        if item.weekly_usage_score <= 0:
            continue
        key = item.ingredient.lower()
        if key in seen:
            continue
        seen.add(key)
        results.append(item)

    if len(results) < 3:
        logger.warning("LLM returned only %d usable ingredients", len(results))
        return None

    results.sort(key=lambda item: -item.weekly_usage_score)

    # Models are inconsistent about the "relative to each other" instruction —
    # one run returns 100/82/64, another 19.3/15.8/8.8. Rescale so the top
    # ingredient always sits at 100 and downstream scoring sees one scale.
    top = results[0].weekly_usage_score
    if 0 < top < 100:
        for item in results:
            item.weekly_usage_score = int(round(item.weekly_usage_score * 100.0 / top))

    return results


class ExtractionResult(NamedTuple):
    ingredients: List[ExtractedIngredient]
    #: Which implementation actually ran — surfaced to the UI so a demo never
    #: claims to be AI-powered when it silently fell back.
    source: str


def extract_ingredients(request: AnalyzeFoodRequest) -> ExtractionResult:
    """Public entrypoint. Prefers the LLM, always returns something."""
    if llm_client.is_available():
        extracted = _extract_with_llm(request)
        if extracted:
            return ExtractionResult(extracted, llm_client.MODEL_STRUCTURED)
        logger.info("Falling back to keyword ingredient extraction")
    return ExtractionResult(_extract_with_keywords(request), "mock-keyword-matcher")
