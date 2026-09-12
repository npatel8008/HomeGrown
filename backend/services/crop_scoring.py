"""SYSTEM 2 — Crop recommendation / scoring.

crop_score = household_demand
           + climate_fit
           + space_efficiency
           + financial_value
           + ease_of_growing

Each component is normalised to 0-100 and combined with the weights in
`WEIGHTS`. Plant counts are then allocated greedily by score until the plot
area (or budget) runs out.

>>> REPLACE ME <<<
This is a transparent heuristic, not an optimiser. The real version should be
a constrained optimisation (knapsack over square-footage and budget, with
companion-planting and succession constraints) and should pull climate data
from a hardiness-zone / frost-date source instead of `SUNLIGHT_HOURS`.
"""

from typing import Dict, List, Tuple

from models.schemas import (
    CropRecommendation,
    Difficulty,
    ExperienceLevel,
    GardenSummary,
    GardenType,
    RecommendCropsRequest,
    RecommendCropsResponse,
    ScoreBreakdown,
    SunlightLevel,
)
from services import crop_reasons
from services.crop_repository import all_crops

WEIGHTS = {
    "household_demand": 0.35,
    "climate_fit": 0.20,
    "space_efficiency": 0.15,
    "financial_value": 0.20,
    "ease_of_growing": 0.10,
}

# Usable sunlight hours implied by each self-reported sunlight level.
SUNLIGHT_HOURS = {
    SunlightLevel.FULL_SUN: 8.0,
    SunlightLevel.PARTIAL_SUN: 5.0,
    SunlightLevel.MOSTLY_SHADE: 3.0,
}

DIFFICULTY_SCORE = {"easy": 100.0, "medium": 65.0, "hard": 35.0}
WATER_LOAD = {"low": 0.2, "medium": 0.5, "medium-high": 0.75, "high": 1.0}

# Fraction of the plot that is walkways / bed edges rather than planting area.
PATH_OVERHEAD = 0.35

# Rough pounds of produce one person eats per week during the season.
PRODUCE_LBS_PER_PERSON_PER_WEEK = 7.0
SEASON_WEEKS = 20


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _demand_lookup(request: RecommendCropsRequest) -> Dict[str, float]:
    """crop_id -> 0-100 household demand, from the extracted ingredients."""
    demand: Dict[str, float] = {}
    for item in request.ingredients:
        if not item.growable:
            continue
        key = item.crop_id
        if not key:
            continue
        demand[key] = max(demand.get(key, 0.0), float(item.weekly_usage_score))
    return demand


def _climate_fit(crop: dict, request: RecommendCropsRequest) -> float:
    available = SUNLIGHT_HOURS[request.space.sunlight]
    needed = float(crop["sunlight_hours"])
    ratio = available / needed if needed else 1.0
    score = _clamp(ratio * 100.0)
    if request.space.garden_type in (GardenType.CONTAINERS, GardenType.BALCONY):
        if not crop["container_compatible"]:
            score *= 0.35
        else:
            score *= 0.95
    water_load = WATER_LOAD.get(crop["water_requirement"], 0.5)
    if request.space.water_access.value == "limited":
        score *= 1.0 - 0.4 * water_load
    return _clamp(score)


def _space_efficiency(crop: dict) -> float:
    """Pounds of produce per square foot, normalised against the dataset."""
    footprint = max(0.1, crop["spacing_ft"] ** 2)
    return crop["estimated_yield_per_plant"] / footprint


def _financial_value(crop: dict) -> float:
    """Net dollars saved per square foot."""
    footprint = max(0.1, crop["spacing_ft"] ** 2)
    gross = crop["estimated_yield_per_plant"] * crop["estimated_grocery_price"]
    return (gross - crop["estimated_cost_per_plant"]) / footprint


def _ease(crop: dict, experience: ExperienceLevel) -> float:
    base = DIFFICULTY_SCORE.get(crop["difficulty"], 60.0)
    if experience == ExperienceLevel.BEGINNER:
        return base
    if experience == ExperienceLevel.INTERMEDIATE:
        return _clamp(base + (100 - base) * 0.4)
    return _clamp(base + (100 - base) * 0.75)


def _reason(crop: dict, parts: ScoreBreakdown, request: RecommendCropsRequest) -> str:
    bits: List[str] = []
    if parts.household_demand >= 70:
        bits.append("your household uses %s frequently" % crop["name"].lower())
    elif parts.household_demand >= 35:
        bits.append("%s shows up regularly in your meals" % crop["name"].lower())
    else:
        bits.append("%s rounds out what your garden can supply" % crop["name"].lower())

    if parts.climate_fit >= 75:
        bits.append("your space gets enough sunlight for it")
    elif parts.climate_fit >= 45:
        bits.append("it tolerates the light your space gets")
    else:
        bits.append("it will be light-limited but still productive")

    if parts.financial_value >= 70:
        bits.append("it returns strong value per square foot")
    elif parts.space_efficiency >= 70:
        bits.append("it yields well for the space it takes")

    if crop["difficulty"] == "easy" and request.space.experience == ExperienceLevel.BEGINNER:
        bits.append("and it is forgiving for a first season")

    return ", ".join(bits[:-1]) + (", " + bits[-1] if len(bits) > 1 else bits[0]) + "."


def _normalise(values: Dict[str, float]) -> Dict[str, float]:
    if not values:
        return {}
    top = max(values.values())
    bottom = min(values.values())
    span = top - bottom
    if span <= 0:
        return {key: 80.0 for key in values}
    return {key: 15.0 + 85.0 * (value - bottom) / span for key, value in values.items()}


def score_crops(request: RecommendCropsRequest) -> RecommendCropsResponse:
    crops = all_crops()
    demand = _demand_lookup(request)

    raw_space = {crop["id"]: _space_efficiency(crop) for crop in crops}
    raw_money = {crop["id"]: _financial_value(crop) for crop in crops}
    space_scores = _normalise(raw_space)
    money_scores = _normalise(raw_money)

    scored: List[Tuple[float, dict, ScoreBreakdown]] = []
    for crop in crops:
        breakdown = ScoreBreakdown(
            household_demand=round(demand.get(crop["id"], 0.0), 1),
            climate_fit=round(_climate_fit(crop, request), 1),
            space_efficiency=round(space_scores[crop["id"]], 1),
            financial_value=round(money_scores[crop["id"]], 1),
            ease_of_growing=round(_ease(crop, request.space.experience), 1),
        )
        total = (
            breakdown.household_demand * WEIGHTS["household_demand"]
            + breakdown.climate_fit * WEIGHTS["climate_fit"]
            + breakdown.space_efficiency * WEIGHTS["space_efficiency"]
            + breakdown.financial_value * WEIGHTS["financial_value"]
            + breakdown.ease_of_growing * WEIGHTS["ease_of_growing"]
        )
        scored.append((total, crop, breakdown))

    scored.sort(key=lambda row: -row[0])

    total_area = request.space.plot.width_ft * request.space.plot.length_ft
    plantable_area = total_area * (1 - PATH_OVERHEAD)
    budget = request.space.budget_usd

    # How many pounds of produce the household plausibly wants, split across
    # crops in proportion to demand. Stops one high-scoring crop from being
    # recommended in quantities nobody will eat.
    total_need_lbs = PRODUCE_LBS_PER_PERSON_PER_WEEK * request.household_size * SEASON_WEEKS
    demand_total = sum(demand.values()) or 1.0

    recommendations: List[CropRecommendation] = []
    skipped: List[str] = []
    area_left = plantable_area
    budget_left = budget
    rank = 1

    for total, crop, breakdown in scored:
        if total < 25:
            skipped.append(crop["name"])
            continue

        footprint = crop["spacing_ft"] ** 2
        cost_each = crop["estimated_cost_per_plant"]

        # Allocate a share of the remaining plot proportional to the score,
        # capped so no single crop eats the whole garden.
        share = min(0.35, max(0.06, total / 260.0))
        area_budget = min(area_left, plantable_area * share)
        count = int(area_budget // footprint)
        if cost_each > 0:
            count = min(count, int(budget_left // cost_each))
        appetite_share = demand.get(crop["id"], 10.0) / demand_total
        appetite_lbs = total_need_lbs * appetite_share
        appetite_cap = int(round(appetite_lbs / max(0.05, crop["estimated_yield_per_plant"])))
        count = max(0, min(count, appetite_cap, 24))

        if count == 0:
            skipped.append(crop["name"])
            continue

        used_area = count * footprint
        yield_lbs = count * crop["estimated_yield_per_plant"]
        grocery_value = yield_lbs * crop["estimated_grocery_price"]
        cost = count * cost_each

        recommendations.append(
            CropRecommendation(
                crop_id=crop["id"],
                name=crop["name"],
                category=crop["category"],
                rank=rank,
                score=int(round(_clamp(total))),
                score_breakdown=breakdown,
                reason=_reason(crop, breakdown, request),
                plants_recommended=count,
                expected_yield_lbs=round(yield_lbs, 1),
                grocery_value_usd=round(grocery_value, 2),
                growing_cost_usd=round(cost, 2),
                savings_usd=round(grocery_value - cost, 2),
                days_to_harvest=crop["days_to_harvest"],
                difficulty=Difficulty(crop["difficulty"]),
                water_requirement=crop["water_requirement"],
                space_required_sqft=round(used_area, 1),
                color=crop["color"],
                image=crop["image"],
                description=crop["description"],
            )
        )
        rank += 1
        area_left -= used_area
        budget_left -= cost
        if area_left < 1 or budget_left < 1:
            break

    # Optional pass: replace the template rationales with model-written ones.
    # One batched call for the whole list; failures leave the templates alone.
    _apply_llm_reasons(recommendations, request)

    used_area = sum(item.space_required_sqft for item in recommendations)
    total_yield = sum(item.expected_yield_lbs for item in recommendations)
    total_value = sum(item.grocery_value_usd for item in recommendations)
    total_cost = sum(item.growing_cost_usd for item in recommendations)

    household_need_lbs = (
        PRODUCE_LBS_PER_PERSON_PER_WEEK * request.household_size * SEASON_WEEKS
    )
    coverage = int(round(_clamp((total_yield / household_need_lbs) * 100 if household_need_lbs else 0)))

    summary = GardenSummary(
        total_area_sqft=round(total_area, 1),
        used_area_sqft=round(used_area, 1),
        crop_count=len(recommendations),
        total_plants=sum(item.plants_recommended for item in recommendations),
        estimated_yield_lbs=round(total_yield, 1),
        estimated_grocery_value_usd=round(total_value, 2),
        estimated_cost_usd=round(total_cost, 2),
        estimated_savings_usd=round(total_value - total_cost, 2),
        homegrown_coverage_pct=coverage,
        coverage_explainer=(
            "Your garden could provide approximately %d%% of the produce a "
            "household of %d regularly consumes during the growing season."
            % (coverage, request.household_size)
        ),
        within_budget=total_cost <= budget,
    )

    return RecommendCropsResponse(
        summary=summary,
        recommendations=recommendations,
        skipped=skipped,
        generated_by=(
            "mock-crop-scoring-v0+llm-reasons"
            if crop_reasons.enabled()
            else "mock-crop-scoring-v0"
        ),
    )


def _apply_llm_reasons(
    recommendations: List[CropRecommendation], request: RecommendCropsRequest
) -> None:
    """Overwrite `reason` in place where the model produced a better sentence."""
    if not recommendations or not crop_reasons.enabled():
        return

    meals_by_crop = {
        item.crop_id: ", ".join(item.matched_meals)
        for item in request.ingredients
        if item.crop_id and item.matched_meals
    }

    written = crop_reasons.write_reasons(
        crops=[
            {
                "crop_id": crop.crop_id,
                "name": crop.name,
                "plants": crop.plants_recommended,
                "demand": int(crop.score_breakdown.household_demand),
                "climate": int(crop.score_breakdown.climate_fit),
                "space": int(crop.score_breakdown.space_efficiency),
                "value": int(crop.score_breakdown.financial_value),
                "ease": int(crop.score_breakdown.ease_of_growing),
                "difficulty": crop.difficulty.value,
                "yield_lbs": crop.expected_yield_lbs,
                "savings": crop.savings_usd,
                "days": crop.days_to_harvest,
                "meals": meals_by_crop.get(crop.crop_id, ""),
            }
            for crop in recommendations
        ],
        household_size=request.household_size,
        sunlight=request.space.sunlight.value.replace("-", " "),
        plot_sqft=request.space.plot.width_ft * request.space.plot.length_ft,
        experience=request.space.experience.value,
    )
    if not written:
        return

    for crop in recommendations:
        sentence = written.get(crop.crop_id)
        if sentence:
            crop.reason = sentence
