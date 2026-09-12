"""SYSTEM 4 — Ongoing garden care.

Produces "what should I do today" tasks from crop type, days since planting,
water requirement and the weather.

Weather is now real: `get_weather` resolves the household's location and pulls
the current conditions and 7-day outlook from Open-Meteo (free, no API key).
It falls back to a fixed placeholder forecast when the network is unavailable,
and `Weather.source` says which you got.

>>> REPLACE ME <<<
The rules in `build_tasks` are still heuristics. They should eventually
consider soil moisture, growing-degree-days accumulated since planting, and
per-plant observation history rather than just days-since-planting.
"""

from typing import Dict, List, Optional

from models.schemas import (
    CareRecommendationsResponse,
    CareTask,
    DailyForecastOut,
    GardenProgress,
    GardenStatusResponse,
    TaskCategory,
    Weather,
)
from services import climate as climate_service
from services.crop_repository import get_crop
from services.location import resolve as resolve_location

#: Only a fallback — the real season length comes from the local climate.
SEASON_LENGTH_DAYS = 150

# Deterministic mock forecast so demos look the same every run.
def get_weather(location: str = "", zip_code: str = "") -> Weather:
    """Live conditions for the household's location, via Open-Meteo.

    Falls back to a fixed placeholder forecast when the network is
    unavailable; `Weather.source` says which you got.
    """
    resolved = resolve_location(location, zip_code)
    bundle = climate_service.forecast(resolved.latitude, resolved.longitude, resolved.label)
    return Weather(
        location=bundle.location,
        temperature_f=bundle.temperature_f,
        conditions=bundle.conditions,
        rain_probability_pct=bundle.rain_probability_pct,
        wind_mph=bundle.wind_mph,
        forecast_note=bundle.forecast_note,
        humidity_pct=bundle.humidity_pct,
        rain_next_3_days_in=bundle.rain_next_3_days_in,
        days=[DailyForecastOut(**day.model_dump()) for day in bundle.days],
        source=bundle.source,
    )


def _default_planting() -> List[Dict[str, object]]:
    """Fallback garden used when the client sends no planting state."""
    return [
        # One planting date for the whole plot — crops differ by maturity, not
        # by when they went in.
        {"crop_id": "tomato", "days_since_planting": 34, "count": 4},
        {"crop_id": "spinach", "days_since_planting": 34, "count": 23},
        {"crop_id": "cherry-tomato", "days_since_planting": 34, "count": 5},
        {"crop_id": "green-onion", "days_since_planting": 34, "count": 24},
        {"crop_id": "lettuce", "days_since_planting": 34, "count": 14},
        {"crop_id": "basil", "days_since_planting": 34, "count": 8},
    ]



def build_tasks(
    plantings: Optional[List[Dict[str, object]]] = None,
    weather: Optional[Weather] = None,
) -> List[CareTask]:
    plantings = plantings or _default_planting()
    weather = weather or get_weather()
    rain_likely = weather.rain_probability_pct >= 55 or weather.rain_next_3_days_in >= 0.25
    hot = weather.temperature_f >= 86
    # Nothing meaningful falling in the next three days.
    dry_spell = weather.rain_next_3_days_in < 0.15 and weather.rain_probability_pct < 40

    tasks: List[CareTask] = []
    for planting in plantings:
        crop = get_crop(str(planting.get("crop_id", "")))
        if not crop:
            continue
        age = int(planting.get("days_since_planting", 0) or 0)
        days_left = max(0, crop["days_to_harvest"] - age)
        thirsty = crop["water_requirement"] in ("high", "medium-high")
        drought_tolerant = crop["water_requirement"] == "low"

        # Rules in priority order — the first one that matches wins. Harvesting
        # beats watering, watering beats maintenance, maintenance beats "fine".
        if days_left <= 0:
            title, reason, category, action = (
                "Harvest now",
                "%s has passed its %d-day maturity window."
                % (crop["name"], crop["days_to_harvest"]),
                TaskCategory.NEEDS_ATTENTION,
                "harvest",
            )
        elif days_left <= 5:
            title, reason, category, action = (
                "Harvest window approaching",
                "First harvest in about %d days — check size and colour daily." % days_left,
                TaskCategory.COMING_SOON,
                "harvest-soon",
            )
        elif thirsty and rain_likely:
            title, reason, category, action = (
                "Skip watering today",
                "%d%% chance of rain, about %.2f\u2033 expected over the next three days."
                % (weather.rain_probability_pct, weather.rain_next_3_days_in),
                TaskCategory.ON_TRACK,
                "skip-watering",
            )
        elif thirsty and hot:
            title, reason, category, action = (
                "Water deeply this morning",
                "%d°F with no rain in the forecast, and %s is a heavy drinker."
                % (weather.temperature_f, crop["name"].lower()),
                TaskCategory.NEEDS_ATTENTION,
                "water",
            )
        elif thirsty:
            title, reason, category, action = (
                "Water today",
                "No rain expected and %s needs consistent moisture." % crop["name"].lower(),
                TaskCategory.NEEDS_ATTENTION,
                "water",
            )
        elif dry_spell and not drought_tolerant:
            # Even average drinkers need help through a genuinely dry stretch —
            # this is the whole point of reading a real forecast.
            title, reason, category, action = (
                "Check soil moisture",
                "Only %.2f\u2033 of rain expected in the next three days. Water if the top inch is dry."
                % weather.rain_next_3_days_in,
                TaskCategory.COMING_SOON,
                "check-moisture",
            )
        elif crop["category"] == "herb" and age >= 21:
            title, reason, category, action = (
                "Prune this week",
                "Pinching flower buds keeps %s producing leaves." % crop["name"].lower(),
                TaskCategory.COMING_SOON,
                "prune",
            )
        elif crop["mature_height_ft"] >= 3 and 20 <= age <= 45:
            title, reason, category, action = (
                "Stake or tie up",
                "%s reaches about %.1f ft — support it before it leans."
                % (crop["name"], crop["mature_height_ft"]),
                TaskCategory.COMING_SOON,
                "support",
            )
        else:
            title, reason, category, action = (
                "Growth is on schedule",
                "Day %d of roughly %d to first harvest." % (age, crop["days_to_harvest"]),
                TaskCategory.ON_TRACK,
                "observe",
            )

        tasks.append(
            CareTask(
                id="task-%s" % crop["id"],
                crop_id=crop["id"],
                crop=crop["name"],
                title=title,
                reason=reason,
                category=category,
                action=action,
                due_in_days=0 if category == TaskCategory.NEEDS_ATTENTION else min(days_left, 7),
                color=crop["color"],
            )
        )

    order = {
        TaskCategory.NEEDS_ATTENTION: 0,
        TaskCategory.COMING_SOON: 1,
        TaskCategory.ON_TRACK: 2,
    }
    tasks.sort(key=lambda task: order[task.category])
    return tasks


def care_recommendations(
    plantings: Optional[List[Dict[str, object]]] = None,
    location: str = "",
    zip_code: str = "",
) -> CareRecommendationsResponse:
    weather = get_weather(location, zip_code)
    tasks = build_tasks(plantings, weather)
    counts = {category.value: 0 for category in TaskCategory}
    for task in tasks:
        counts[task.category.value] += 1
    return CareRecommendationsResponse(weather=weather, tasks=tasks, counts=counts)


def garden_status(
    day_of_season: int = 34,
    plantings: Optional[List[Dict[str, object]]] = None,
    location: str = "",
    zip_code: str = "",
) -> GardenStatusResponse:
    plantings = plantings or _default_planting()
    resolved = resolve_location(location, zip_code)
    local = climate_service.climate_profile(resolved.latitude, resolved.longitude)
    # Season length is the real local frost-free window, not a fixed constant.
    season_length = max(60, min(365, local.frost_free_days))

    projected = 0.0
    next_crop = None
    next_days = None
    for planting in plantings:
        crop = get_crop(str(planting.get("crop_id", "")))
        if not crop:
            continue
        count = int(planting.get("count", 1) or 1)
        projected += (
            count * crop["estimated_yield_per_plant"] * crop["estimated_grocery_price"]
        )
        remaining = max(0, crop["days_to_harvest"] - int(planting.get("days_since_planting", 0) or 0))
        if next_days is None or remaining < next_days:
            next_days, next_crop = remaining, crop["name"]

    # Value realised so far scales with how far into the season we are, with a
    # slow start (nothing is ripe in week one).
    ratio = min(1.0, max(0.0, day_of_season / float(season_length)))
    realised = projected * (ratio ** 2)

    return GardenStatusResponse(
        weather=get_weather(location, zip_code),
        progress=GardenProgress(
            day_of_season=day_of_season,
            season_length_days=season_length,
            harvest_value_to_date_usd=round(realised, 2),
            projected_seasonal_value_usd=round(projected, 2),
            crops_planted=len(plantings),
            next_harvest_crop=next_crop,
            next_harvest_in_days=next_days,
        ),
    )
