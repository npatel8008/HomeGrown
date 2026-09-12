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
    ClimateOut,
    CropRecommendation,
    Difficulty,
    ExperienceLevel,
    GardenSummary,
    GardenType,
    RecommendCropsRequest,
    RecommendCropsResponse,
    ResolvedLocationOut,
    ScoreBreakdown,
    SkippedCrop,
)
from services import crop_reasons
from services.climate import ClimateProfile, climate_profile
from services.crop_repository import all_crops
from services.location import resolve as resolve_location

# Climate carries real weight now that it is measured data rather than a guess.
# Whether a crop suits the local season is second only to whether the household
# actually eats it.
WEIGHTS = {
    "household_demand": 0.32,
    "climate_fit": 0.30,
    "space_efficiency": 0.12,
    "financial_value": 0.16,
    "ease_of_growing": 0.10,
}

DIFFICULTY_SCORE = {"easy": 100.0, "medium": 65.0, "hard": 35.0}
WATER_LOAD = {"low": 0.2, "medium": 0.5, "medium-high": 0.75, "high": 1.0}

# Fraction of the plot that is walkways / bed edges rather than planting area.
PATH_OVERHEAD = 0.35

# Rough pounds of produce one person eats per week during the season. The
# number of weeks now comes from the location's real frost-free window.
PRODUCE_LBS_PER_PERSON_PER_WEEK = 7.0


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


def _season_fit(crop: dict, climate: ClimateProfile) -> Tuple[float, bool, str]:
    """Can this crop actually finish before frost here?

    This is the single most decisive piece of local information: a 120-day
    eggplant in a 100-day season will not produce, no matter how much the
    household likes eggplant.
    """
    season = max(1, climate.frost_free_days)
    needed = crop["days_to_harvest"]

    # Garlic overwinters on purpose, so the frost window doesn't apply.
    overwinters = needed > 200
    if overwinters:
        return 78.0, True, "Overwinters in the ground — planted in autumn, harvested next summer."

    headroom = season / needed
    if headroom >= 2.2:
        score = 100.0
        note = "Comfortably fits your ~%d-day season, with room for a second sowing." % season
        fits = True
    elif headroom >= 1.35:
        score = 88.0
        note = "Matures in ~%d days, well inside your ~%d-day season." % (needed, season)
        fits = True
    elif headroom >= 1.0:
        score = 62.0
        note = "Needs ~%d of your ~%d frost-free days — start it early." % (needed, season)
        fits = True
    elif headroom >= 0.82:
        score = 30.0
        note = "Tight: ~%d days to harvest against a ~%d-day season. Start indoors." % (needed, season)
        fits = False
    else:
        score = 8.0
        note = "Won't finish — ~%d days needed, only ~%d frost-free." % (needed, season)
        fits = False

    return score, fits, note


def _temperature_fit(crop: dict, climate: ClimateProfile) -> float:
    """Does the crop want the kind of summer this place actually gets?

    Warm-season crops are scored on accumulated growing-degree-days, which
    captures both how warm and how long the summer is — a tomato needs roughly
    2000 GDD (base 50°F) to crop well. Cool-season crops are scored on how many
    days break 90°F, because that is what makes them bolt.
    """
    season_type = crop.get("season", "all")
    high = climate.avg_summer_high_f or 82.0
    hot_days = climate.hot_days
    gdd = climate.growing_degree_days or 2500

    if season_type == "warm":
        score = _clamp((gdd / 2000.0) * 100.0)
        # Heat units alone aren't enough — fruit set needs warm days.
        if high < 65:
            score *= 0.35
        elif high < 72:
            score *= 0.5
        elif high < 78:
            score *= 0.8
        # And too much heat makes blossoms drop.
        if high >= 100:
            score *= 0.7
        elif high >= 95:
            score *= 0.85
        return _clamp(score)

    if season_type == "cool":
        # A long hot summer doesn't rule these out — you grow them in the
        # shoulder seasons instead — but it does narrow the window.
        if hot_days >= 110:
            return 40.0
        if hot_days >= 60:
            return 62.0
        if hot_days >= 25:
            return 82.0
        return 100.0

    return 88.0


def _climate_fit(crop: dict, request: RecommendCropsRequest, climate: ClimateProfile) -> Tuple[float, bool, str]:
    """Season length + temperature + practical constraints.

    There is deliberately no "how sunny is your yard" input. Self-reported
    sunlight was a guess dressed up as data, and the crop dataset's
    `sunlight_hours` is only meaningful against a real measurement or a
    shade analysis of the actual plot — neither of which we have. When photo
    analysis lands (see the growing-space form's upload placeholder), a
    measured exposure figure belongs right here.
    """
    season_score, fits, note = _season_fit(crop, climate)
    temperature = _temperature_fit(crop, climate)

    # Temperature carries the most weight: season length is already enforced
    # as a hard gate elsewhere, so what's left is whether the crop will
    # actually thrive in this summer, not merely survive it.
    score = season_score * 0.42 + temperature * 0.58

    if request.space.garden_type in (GardenType.CONTAINERS, GardenType.BALCONY):
        if not crop["container_compatible"]:
            score *= 0.35
        else:
            score *= 0.95

    water_load = WATER_LOAD.get(crop["water_requirement"], 0.5)
    if request.space.water_access.value == "limited":
        score *= 1.0 - 0.4 * water_load
    # A dry climate makes a thirsty crop more work regardless of tap access.
    if climate.annual_precip_in and climate.annual_precip_in < 15:
        score *= 1.0 - 0.18 * water_load

    return _clamp(score), fits, note


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
        bits.append("your local season and summer temperatures suit it well")
    elif parts.climate_fit >= 45:
        bits.append("it will cope with your local season")
    else:
        bits.append("your season is marginal for it, but it can still produce")

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

    # Resolve where the household actually is, and what growing there is like.
    # Both fall back to neutral placeholders offline, so this never fails.
    location = resolve_location(request.space.location, request.space.zip_code)
    climate = climate_profile(location.latitude, location.longitude)

    raw_space = {crop["id"]: _space_efficiency(crop) for crop in crops}
    raw_money = {crop["id"]: _financial_value(crop) for crop in crops}
    space_scores = _normalise(raw_space)
    money_scores = _normalise(raw_money)

    season_notes: Dict[str, Tuple[bool, str]] = {}
    scored: List[Tuple[float, dict, ScoreBreakdown]] = []
    for crop in crops:
        fit_score, fits_season, season_note = _climate_fit(crop, request, climate)
        season_notes[crop["id"]] = (fits_season, season_note)
        breakdown = ScoreBreakdown(
            household_demand=round(demand.get(crop["id"], 0.0), 1),
            climate_fit=round(fit_score, 1),
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

    # Weeks this climate can actually supply produce — used for both the
    # appetite cap below and the coverage figure in the summary.
    season_weeks = max(6, min(40, climate.frost_free_days / 7))

    # How many pounds of produce the household plausibly wants, split across
    # crops in proportion to demand. Stops one high-scoring crop from being
    # recommended in quantities nobody will eat.
    total_need_lbs = PRODUCE_LBS_PER_PERSON_PER_WEEK * request.household_size * season_weeks
    demand_total = sum(demand.values()) or 1.0

    recommendations: List[CropRecommendation] = []
    skipped: List[SkippedCrop] = []
    area_left = plantable_area
    budget_left = budget
    rank = 1

    for total, crop, breakdown in scored:
        fits_season, season_note = season_notes[crop["id"]]

        if not fits_season:
            # Hard constraint: it cannot reach harvest before frost here.
            skipped.append(
                SkippedCrop(
                    name=crop["name"], crop_id=crop["id"], reason=season_note, kind="climate"
                )
            )
            continue
        if total < 25:
            skipped.append(
                SkippedCrop(
                    name=crop["name"],
                    crop_id=crop["id"],
                    reason="Scored too low for your household and conditions.",
                    kind="demand",
                )
            )
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
            skipped.append(
                SkippedCrop(
                    name=crop["name"],
                    crop_id=crop["id"],
                    reason="Ran out of plot space or budget before this one.",
                    kind="space",
                )
            )
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
                fits_season=fits_season,
                season_note=season_note,
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
    _apply_llm_reasons(recommendations, request, climate)

    used_area = sum(item.space_required_sqft for item in recommendations)
    total_yield = sum(item.expected_yield_lbs for item in recommendations)
    total_value = sum(item.grocery_value_usd for item in recommendations)
    total_cost = sum(item.growing_cost_usd for item in recommendations)

    household_need_lbs = (
        PRODUCE_LBS_PER_PERSON_PER_WEEK * request.household_size * season_weeks
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
        produce_need_lbs=round(household_need_lbs, 1),
    )

    return RecommendCropsResponse(
        summary=summary,
        recommendations=recommendations,
        skipped=skipped,
        location=ResolvedLocationOut(**location.model_dump(), label=location.label),
        climate=ClimateOut(**climate.model_dump(exclude={"latitude", "longitude"})),
        generated_by=(
            "mock-crop-scoring-v0+llm-reasons"
            if crop_reasons.enabled()
            else "mock-crop-scoring-v0"
        ),
    )


def _apply_llm_reasons(
    recommendations: List[CropRecommendation],
    request: RecommendCropsRequest,
    climate: ClimateProfile,
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
        climate="zone %s, ~%d frost-free days, summer highs around %.0f\u00b0F"
        % (climate.hardiness_zone, climate.frost_free_days, climate.avg_summer_high_f),
        plot_sqft=request.space.plot.width_ft * request.space.plot.length_ft,
        experience=request.space.experience.value,
    )
    if not written:
        return

    for crop in recommendations:
        sentence = written.get(crop.crop_id)
        if sentence:
            crop.reason = sentence
