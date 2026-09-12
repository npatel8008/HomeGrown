"""SYSTEM 4 — Ongoing garden care.

Produces "what should I do today" tasks from crop type, days since planting,
water requirement and the weather.

>>> REPLACE ME <<<
`get_weather` is the only place weather is fabricated. Point it at a real
provider (OpenWeather / NWS / Open-Meteo) and everything downstream keeps
working. The rules in `build_tasks` should eventually consider soil moisture,
growing-degree-days and per-plant observation history.
"""

from typing import Dict, List, Optional

from models.schemas import (
    CareRecommendationsResponse,
    CareTask,
    GardenProgress,
    GardenStatusResponse,
    TaskCategory,
    Weather,
)
from services.crop_repository import get_crop

SEASON_LENGTH_DAYS = 150

# Deterministic mock forecast so demos look the same every run.
MOCK_FORECAST = {
    "temperature_f": 78,
    "conditions": "Partly cloudy",
    "rain_probability_pct": 80,
    "wind_mph": 6,
    "forecast_note": "Rain expected tonight, around 0.4 in.",
}


def get_weather(location: str = "Demo City, US") -> Weather:
    """>>> REPLACE ME <<< with a real forecast call."""
    return Weather(location=location, **MOCK_FORECAST)


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
    rain_likely = weather.rain_probability_pct >= 60
    hot = weather.temperature_f >= 88

    tasks: List[CareTask] = []
    for planting in plantings:
        crop = get_crop(str(planting.get("crop_id", "")))
        if not crop:
            continue
        age = int(planting.get("days_since_planting", 0) or 0)
        days_left = max(0, crop["days_to_harvest"] - age)
        thirsty = crop["water_requirement"] in ("high", "medium-high")

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
                "Rain is expected tonight (%d%% chance)." % weather.rain_probability_pct,
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
    location: str = "Demo City, US",
) -> CareRecommendationsResponse:
    weather = get_weather(location)
    tasks = build_tasks(plantings, weather)
    counts = {category.value: 0 for category in TaskCategory}
    for task in tasks:
        counts[task.category.value] += 1
    return CareRecommendationsResponse(weather=weather, tasks=tasks, counts=counts)


def garden_status(
    day_of_season: int = 34,
    plantings: Optional[List[Dict[str, object]]] = None,
    location: str = "Demo City, US",
) -> GardenStatusResponse:
    plantings = plantings or _default_planting()

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
    ratio = min(1.0, max(0.0, day_of_season / float(SEASON_LENGTH_DAYS)))
    realised = projected * (ratio ** 2)

    return GardenStatusResponse(
        weather=get_weather(location),
        progress=GardenProgress(
            day_of_season=day_of_season,
            season_length_days=SEASON_LENGTH_DAYS,
            harvest_value_to_date_usd=round(realised, 2),
            projected_seasonal_value_usd=round(projected, 2),
            crops_planted=len(plantings),
            next_harvest_crop=next_crop,
            next_harvest_in_days=next_days,
        ),
    )
