"""SYSTEM 5 — Growth schedule.

Turns a real planting date into day-by-day guidance: how far along each crop
is, when it next needs water, when the first harvest lands, and what to do
today.

This is the piece that makes the garden *dated* rather than hypothetical.
Everything before it reasons about a plan; this reasons about plants that are
actually in the ground, using:

  * `planted_on` per planting (falling back to the garden's `season_start`)
  * the crop dataset's `days_to_harvest` and `water_requirement`
  * the live forecast, so rain postpones watering and heat brings it forward
  * the user's own care events, so "last watered" is what they really did

Kept separate from `care_engine` on purpose. The care engine answers "given a
crop of age N and today's weather, what's the advice?" — a stateless rule
chain. This module owns dates, persistence-derived state, and the arithmetic
that turns them into an age. It calls the care engine; the care engine knows
nothing about accounts or storage.

>>> REPLACE ME <<<
Watering intervals are a lookup table nudged by temperature and rainfall. A
real version should track a soil-moisture balance: evapotranspiration from
temperature, humidity, wind and solar radiation, minus measured rainfall,
against the water-holding capacity of the bed. Open-Meteo already returns
`et0_fao_evapotranspiration`, which is the natural next step.
"""

import datetime as dt
import logging
from typing import Any, Dict, List, Optional

from models.schemas import (
    CareTask,
    CropSchedule,
    GrowthStage,
    ScheduleResponse,
    TaskCategory,
    Weather,
)
from services import care_engine
from services.crop_repository import get_crop

logger = logging.getLogger(__name__)

#: Days between waterings at a mild ~75°F with no rain.
BASE_WATER_INTERVAL_DAYS = {
    "high": 1.5,
    "medium-high": 2.0,
    "medium": 3.0,
    "low": 5.0,
}

#: How long the picking window stays open after first harvest, by crop family.
#: Cut-and-come-again crops keep producing; a root crop is pulled once.
HARVEST_WINDOW_DAYS = {
    "leafy-green": 55,
    "herb": 75,
    "fruiting-vegetable": 65,
    "vining-vegetable": 55,
    "legume": 35,
    "allium": 30,
    "brassica": 25,
    "root": 21,
    "fruit": 40,
}
DEFAULT_HARVEST_WINDOW_DAYS = 35

STAGE_LABELS = {
    GrowthStage.NOT_STARTED: "Not planted yet",
    GrowthStage.ESTABLISHING: "Settling in",
    GrowthStage.GROWING: "Growing",
    GrowthStage.MATURING: "Filling out",
    GrowthStage.HARVESTING: "Ready to harvest",
    GrowthStage.FINISHED: "Season over",
}


def _utc(value: dt.datetime) -> dt.datetime:
    """Everything here compares in UTC; naive input is assumed to be UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=dt.timezone.utc)
    return value.astimezone(dt.timezone.utc)


def _days_between(later: dt.datetime, earlier: dt.datetime) -> int:
    return max(0, (_utc(later).date() - _utc(earlier).date()).days)


def _days(count: int) -> str:
    return "%d day%s" % (count, "" if abs(count) == 1 else "s")


def water_interval_days(crop: dict, weather: Optional[Weather], age_days: int) -> float:
    """How often this crop wants water, given the weather and its age."""
    interval = BASE_WATER_INTERVAL_DAYS.get(crop["water_requirement"], 3.0)

    # Seedlings have shallow roots and dry out fast.
    if age_days < 14:
        interval *= 0.7

    if weather:
        if weather.temperature_f >= 92:
            interval *= 0.6
        elif weather.temperature_f >= 84:
            interval *= 0.8
        elif weather.temperature_f <= 60:
            interval *= 1.35

    return max(1.0, round(interval, 1))


def _harvest_window(crop: dict) -> int:
    return HARVEST_WINDOW_DAYS.get(crop["category"], DEFAULT_HARVEST_WINDOW_DAYS)


def _stage(age_days: int, days_to_harvest: int, window_end_days: int) -> GrowthStage:
    if age_days <= 0:
        return GrowthStage.NOT_STARTED
    if age_days >= window_end_days:
        return GrowthStage.FINISHED
    if age_days >= days_to_harvest:
        return GrowthStage.HARVESTING
    ratio = age_days / max(1, days_to_harvest)
    if age_days < 14 and ratio < 0.45:
        return GrowthStage.ESTABLISHING
    if ratio < 0.6:
        return GrowthStage.GROWING
    return GrowthStage.MATURING


def build_crop_schedule(
    crop: dict,
    planted_on: dt.datetime,
    plants: int,
    now: dt.datetime,
    weather: Optional[Weather],
    last_watered: Optional[dt.datetime],
    harvested_lbs: float,
) -> CropSchedule:
    age = _days_between(now, planted_on)
    days_to_harvest = int(crop["days_to_harvest"])
    window = _harvest_window(crop)
    window_end_days = days_to_harvest + window

    stage = _stage(age, days_to_harvest, window_end_days)
    progress = min(100, int(round((age / max(1, days_to_harvest)) * 100)))

    first_harvest = _utc(planted_on) + dt.timedelta(days=days_to_harvest)
    window_ends = _utc(planted_on) + dt.timedelta(days=window_end_days)
    days_until_harvest = max(0, (first_harvest.date() - _utc(now).date()).days)
    harvest_open = stage == GrowthStage.HARVESTING

    # --- watering -----------------------------------------------------------
    interval = water_interval_days(crop, weather, age)
    ever_watered = last_watered is not None
    reference = _utc(last_watered) if ever_watered else _utc(planted_on)
    next_water = reference + dt.timedelta(days=interval)

    # Rain in the outlook pushes the next watering out rather than pretending
    # you still have to stand there with a hose.
    rain_soon = bool(weather and weather.rain_next_3_days_in >= 0.25)
    if rain_soon:
        next_water = max(next_water, _utc(now) + dt.timedelta(days=2))

    days_until_water = (next_water.date() - _utc(now).date()).days
    finished = stage in (GrowthStage.FINISHED, GrowthStage.NOT_STARTED)
    water_due = days_until_water <= 0 and not finished

    if finished:
        water_note = "No watering needed — this crop is done for the season."
    elif rain_soon:
        water_note = "Rain expected (%.2f in over three days) — hold off." % (
            weather.rain_next_3_days_in if weather else 0
        )
    elif not ever_watered:
        # An empty log means nothing has been *recorded*. Claiming the plant
        # has gone unwatered since planting would be inventing a fact.
        water_note = (
            "No watering logged yet — log one and we'll track roughly every %.1f days from there."
            % interval
        )
    elif days_until_water < 0:
        water_note = "Overdue by %s (last watered %s ago)." % (
            _days(abs(days_until_water)),
            _days(_days_between(now, reference)),
        )
    elif water_due:
        water_note = "Due today — last watered %s ago." % _days(_days_between(now, reference))
    else:
        water_note = "Next watering in %s (about every %.1f days in this weather)." % (
            _days(days_until_water),
            interval,
        )


    # --- what to do next ----------------------------------------------------
    if stage == GrowthStage.FINISHED:
        next_action = "Clear the bed and replant"
    elif harvest_open:
        next_action = "Harvest — picking keeps it producing"
    elif water_due:
        next_action = "Water today"
    elif days_until_harvest <= 7:
        next_action = "First harvest in about %s" % _days(days_until_harvest)
    else:
        next_action = "Water in %s" % _days(max(0, days_until_water))

    return CropSchedule(
        crop_id=crop["id"],
        crop=crop["name"],
        plants=plants,
        planted_on=_utc(planted_on),
        days_since_planting=age,
        days_to_harvest=days_to_harvest,
        progress_pct=progress,
        stage=stage,
        stage_label=STAGE_LABELS[stage],
        water_requirement=crop["water_requirement"],
        water_interval_days=interval,
        last_watered=_utc(last_watered) if last_watered else None,
        next_water_date=next_water,
        days_until_water=days_until_water,
        water_due=water_due,
        water_note=water_note,
        first_harvest_date=first_harvest,
        days_until_harvest=days_until_harvest,
        harvest_window_ends=window_ends,
        harvest_open=harvest_open,
        harvested_lbs=round(harvested_lbs, 1),
        expected_yield_lbs=round(plants * crop["estimated_yield_per_plant"], 1),
        color=crop["color"],
        next_action=next_action,
    )


def build_schedule(
    *,
    season_start: Optional[dt.datetime],
    plantings: List[Dict[str, Any]],
    care_states: Dict[str, Dict[str, Any]],
    weather: Optional[Weather],
    location_label: str = "",
    season_length_days: int = 180,
    now: Optional[dt.datetime] = None,
) -> ScheduleResponse:
    """Assemble the whole dated picture for one account.

    `plantings` are the stored per-plant records; `care_states` is
    `crop_id -> {last_watered, harvested_lbs, ...}` from the care summary.
    """
    now = _utc(now or dt.datetime.now(dt.timezone.utc))

    if not season_start and not plantings:
        return ScheduleResponse(
            started=False,
            season_length_days=season_length_days,
            location=location_label,
            weather=weather,
        )

    # Group plantings by crop: the user thinks in crops, not individual plants.
    grouped: Dict[str, Dict[str, Any]] = {}
    for planting in plantings:
        crop_id = planting.get("crop_id")
        crop = get_crop(str(crop_id or ""))
        if not crop:
            continue
        if planting.get("status") in ("removed",):
            continue
        planted_on = planting.get("planted_on") or season_start
        if not planted_on:
            continue
        entry = grouped.setdefault(
            crop_id, {"crop": crop, "plants": 0, "planted_on": _utc(planted_on)}
        )
        entry["plants"] += 1
        # If plants of one crop went in on different days, track the earliest.
        entry["planted_on"] = min(entry["planted_on"], _utc(planted_on))

    schedules: List[CropSchedule] = []
    for crop_id, entry in grouped.items():
        state = care_states.get(crop_id, {})
        schedules.append(
            build_crop_schedule(
                crop=entry["crop"],
                planted_on=entry["planted_on"],
                plants=entry["plants"],
                now=now,
                weather=weather,
                last_watered=state.get("last_watered"),
                harvested_lbs=float(state.get("harvested_lbs") or 0),
            )
        )

    # Most urgent first: ready to pick, then thirsty, then by harvest date.
    schedules.sort(
        key=lambda item: (
            0 if item.harvest_open else 1,
            0 if item.water_due else 1,
            item.days_until_harvest,
        )
    )

    tasks = _tasks_for(schedules, weather)
    counts = {category.value: 0 for category in TaskCategory}
    for task in tasks:
        counts[task.category.value] += 1

    day_of_season = _days_between(now, season_start) if season_start else 0
    harvested_lbs = sum(item.harvested_lbs for item in schedules)
    harvested_value = sum(
        float(care_states.get(item.crop_id, {}).get("harvested_value_usd") or 0)
        for item in schedules
    )
    projected = 0.0
    for item in schedules:
        crop = get_crop(item.crop_id)
        if crop:
            projected += item.expected_yield_lbs * crop["estimated_grocery_price"]

    return ScheduleResponse(
        started=True,
        season_start=_utc(season_start) if season_start else None,
        day_of_season=day_of_season,
        season_length_days=season_length_days,
        location=location_label,
        weather=weather,
        crops=schedules,
        tasks=tasks,
        counts=counts,
        harvested_lbs=round(harvested_lbs, 1),
        harvested_value_usd=round(harvested_value, 2),
        projected_value_usd=round(projected, 2),
    )


def _tasks_for(schedules: List[CropSchedule], weather: Optional[Weather]) -> List[CareTask]:
    """Today's actions.

    Dated facts (a crop is due water, a harvest window is open) are decided
    here, because only this module knows the dates. Anything that is a pure
    horticultural judgement is left to the care engine, so the two don't drift.
    """
    tasks: List[CareTask] = []
    handled: set = set()

    for item in schedules:
        if item.stage == GrowthStage.FINISHED:
            tasks.append(
                CareTask(
                    id="task-%s-clear" % item.crop_id,
                    crop_id=item.crop_id,
                    crop=item.crop,
                    title="Clear and replant",
                    reason="Past the end of its picking window (planted %d days ago)."
                    % item.days_since_planting,
                    category=TaskCategory.COMING_SOON,
                    action="clear",
                    due_in_days=0,
                    color=item.color,
                )
            )
            handled.add(item.crop_id)
            continue

        if item.harvest_open:
            tasks.append(
                CareTask(
                    id="task-%s-harvest" % item.crop_id,
                    crop_id=item.crop_id,
                    crop=item.crop,
                    title="Harvest now",
                    reason="Day %d — past its %d-day maturity. Picking keeps it producing."
                    % (item.days_since_planting, item.days_to_harvest),
                    category=TaskCategory.NEEDS_ATTENTION,
                    action="harvest",
                    due_in_days=0,
                    color=item.color,
                )
            )
            handled.add(item.crop_id)

        if item.water_due:
            if item.last_watered:
                since = _days_between(dt.datetime.now(dt.timezone.utc), item.last_watered)
                reason = "Last watered %s ago; %s wants water about every %.1f days in this weather." % (
                    _days(since),
                    item.crop.lower(),
                    item.water_interval_days,
                )
            else:
                reason = (
                    "No watering logged yet. %s wants water about every %.1f days in this "
                    "weather — log one to start tracking." % (item.crop, item.water_interval_days)
                )
            tasks.append(
                CareTask(
                    id="task-%s-water" % item.crop_id,
                    crop_id=item.crop_id,
                    crop=item.crop,
                    title="Water today",
                    reason=reason,
                    category=TaskCategory.NEEDS_ATTENTION,
                    action="water",
                    due_in_days=0,
                    color=item.color,
                )
            )
            handled.add(item.crop_id)
            continue

        if item.crop_id in handled:
            continue

        # Nothing dated is outstanding — defer to the horticultural rules.
        advice = care_engine.build_tasks(
            [{"crop_id": item.crop_id, "days_since_planting": item.days_since_planting}],
            weather,
        )
        for task in advice:
            task.id = "task-%s-care" % item.crop_id
            tasks.append(task)

    order = {
        TaskCategory.NEEDS_ATTENTION: 0,
        TaskCategory.COMING_SOON: 1,
        TaskCategory.ON_TRACK: 2,
    }
    tasks.sort(key=lambda task: order[task.category])
    return tasks
