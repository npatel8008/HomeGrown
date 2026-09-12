"""The dated garden: progress, watering intervals, harvest windows.

Two halves. First the pure arithmetic in `growth_schedule` — no database, no
network, so the dates can be pinned exactly. Then the routes, which must keep
the same per-user isolation guarantee as every other /api/me route.
"""

import datetime as dt

import pytest
from conftest import auth_headers

from models.schemas import GrowthStage, Weather
from services import growth_schedule as gs

ALICE = "auth0|alice"
BOB = "auth0|bob"

NOW = dt.datetime(2026, 9, 12, 12, 0, tzinfo=dt.timezone.utc)


def ago(days: float) -> dt.datetime:
    return NOW - dt.timedelta(days=days)


def weather(temp_f: int = 78, rain_3d: float = 0.0) -> Weather:
    return Weather(
        location="Test",
        temperature_f=temp_f,
        conditions="Clear",
        rain_probability_pct=5,
        wind_mph=5,
        forecast_note="",
        humidity_pct=45,
        rain_next_3_days_in=rain_3d,
        days=[],
        source="test",
    )


def plantings_for(crop_id: str, count: int, planted_days_ago: float):
    return [
        {
            "crop_id": crop_id,
            "plant_id": "%s-%d" % (crop_id, index),
            "planted_on": ago(planted_days_ago),
            "status": "planted",
        }
        for index in range(count)
    ]


def schedule_for(crop_id, count, days_ago, care=None, wx=None):
    result = gs.build_schedule(
        season_start=ago(days_ago),
        plantings=plantings_for(crop_id, count, days_ago),
        care_states=care or {},
        weather=wx or weather(),
        now=NOW,
    )
    return result.crops[0]


# ---------------------------------------------------------------- progress --


def test_progress_and_stage_track_the_real_calendar():
    # Spinach matures in 30 days.
    early = schedule_for("spinach", 4, 6)
    assert early.days_since_planting == 6
    assert early.stage == GrowthStage.ESTABLISHING
    assert early.progress_pct == 20

    mid = schedule_for("spinach", 4, 21)
    assert mid.stage == GrowthStage.MATURING
    assert mid.progress_pct == 70

    ready = schedule_for("spinach", 4, 33)
    assert ready.stage == GrowthStage.HARVESTING
    assert ready.harvest_open is True
    assert ready.progress_pct == 100  # capped, not 110


def test_harvest_window_closes_and_the_crop_is_finished():
    # 30 days to harvest + a 55-day leafy-green window.
    done = schedule_for("spinach", 4, 30 + 55 + 1)
    assert done.stage == GrowthStage.FINISHED
    assert done.harvest_open is False
    assert "done for the season" in done.water_note


def test_first_harvest_date_is_planting_date_plus_maturity():
    crop = schedule_for("tomato", 2, 10)  # 70 days
    assert crop.first_harvest_date.date() == ago(10).date() + dt.timedelta(days=70)
    assert crop.days_until_harvest == 60


# ---------------------------------------------------------------- watering --


def test_thirstier_crops_get_shorter_intervals():
    cucumber = schedule_for("cucumber", 1, 30)  # high
    tomato = schedule_for("tomato", 1, 30)  # medium-high
    onion = schedule_for("green-onion", 1, 30)  # low
    assert cucumber.water_interval_days < tomato.water_interval_days
    assert tomato.water_interval_days < onion.water_interval_days


def test_heat_shortens_and_cold_lengthens_the_interval():
    hot = schedule_for("tomato", 1, 30, wx=weather(temp_f=95))
    mild = schedule_for("tomato", 1, 30, wx=weather(temp_f=75))
    cold = schedule_for("tomato", 1, 30, wx=weather(temp_f=55))
    assert hot.water_interval_days < mild.water_interval_days < cold.water_interval_days


def test_watering_is_measured_from_the_last_logged_watering():
    care = {"tomato": {"last_watered": ago(0.2), "harvested_lbs": 0}}
    fresh = schedule_for("tomato", 1, 30, care=care)
    assert fresh.water_due is False
    assert fresh.last_watered is not None

    care_stale = {"tomato": {"last_watered": ago(9), "harvested_lbs": 0}}
    thirsty = schedule_for("tomato", 1, 30, care=care_stale)
    assert thirsty.water_due is True
    assert "Overdue" in thirsty.water_note


def test_expected_rain_postpones_watering():
    dry = schedule_for("tomato", 1, 30, care={"tomato": {"last_watered": ago(9)}})
    wet = schedule_for(
        "tomato", 1, 30, care={"tomato": {"last_watered": ago(9)}}, wx=weather(rain_3d=0.6)
    )
    assert dry.water_due is True
    assert wet.water_due is False
    assert "Rain expected" in wet.water_note


def test_no_watering_logged_never_claims_the_plant_went_unwatered():
    """An empty log means nothing was *recorded* — a different fact."""
    crop = schedule_for("basil", 1, 26, care={})
    assert crop.last_watered is None
    assert "No watering logged yet" in crop.water_note
    assert "Overdue" not in crop.water_note


def test_day_counts_are_pluralised():
    crop = schedule_for("tomato", 1, 30, care={"tomato": {"last_watered": ago(1.2)}})
    assert "1 days" not in crop.water_note
    assert "1 day" in crop.water_note or "Due today" in crop.water_note


# ------------------------------------------------------------------ tasks --


def test_a_ready_crop_is_flagged_for_harvest():
    result = gs.build_schedule(
        season_start=ago(33),
        plantings=plantings_for("spinach", 4, 33),
        care_states={"spinach": {"last_watered": ago(0.1)}},
        weather=weather(),
        now=NOW,
    )
    titles = [task.title for task in result.tasks]
    assert "Harvest now" in titles
    assert result.counts["needs-attention"] >= 1


def test_nothing_started_returns_an_unstarted_schedule():
    result = gs.build_schedule(
        season_start=None, plantings=[], care_states={}, weather=weather(), now=NOW
    )
    assert result.started is False
    assert result.crops == []


def test_plants_of_one_crop_are_grouped_and_counted():
    result = gs.build_schedule(
        season_start=ago(20),
        plantings=plantings_for("tomato", 5, 20) + plantings_for("basil", 3, 20),
        care_states={},
        weather=weather(),
        now=NOW,
    )
    counts = {crop.crop_id: crop.plants for crop in result.crops}
    assert counts == {"tomato": 5, "basil": 3}


def test_removed_plantings_are_excluded():
    plantings = plantings_for("tomato", 3, 20)
    plantings[0]["status"] = "removed"
    result = gs.build_schedule(
        season_start=ago(20),
        plantings=plantings,
        care_states={},
        weather=weather(),
        now=NOW,
    )
    assert result.crops[0].plants == 2


# ------------------------------------------------------------- the routes --


def _start_alices_garden(client):
    client.put(
        "/api/me/garden",
        json={
            "name": "Alice's plot",
            "selected_crop_ids": ["tomato"],
            "layout": {
                "plants": [
                    {"id": "tomato-1", "crop_id": "tomato", "crop": "Tomato"},
                    {"id": "tomato-2", "crop_id": "tomato", "crop": "Tomato"},
                ]
            },
        },
        headers=auth_headers(ALICE),
    )
    return client.post("/api/me/garden/start", json={}, headers=auth_headers(ALICE))


@pytest.mark.parametrize(
    "method,path",
    [("get", "/api/me/schedule"), ("post", "/api/me/garden/start")],
)
def test_schedule_routes_require_a_token(client, method, path):
    kwargs = {"json": {}} if method == "post" else {}
    assert getattr(client, method)(path, **kwargs).status_code == 401


def test_starting_creates_a_dated_planting_per_placed_plant(client):
    response = _start_alices_garden(client)
    assert response.status_code == 200
    body = response.json()
    assert body["started"] is True
    assert body["crops"][0]["plants"] == 2
    assert body["season_start"] is not None

    plantings = client.get("/api/me/plantings", headers=auth_headers(ALICE)).json()
    assert len(plantings) == 2
    assert all(row["planted_on"] for row in plantings)


def test_starting_without_a_saved_garden_is_a_clear_error(client):
    response = client.post("/api/me/garden/start", json={}, headers=auth_headers(BOB))
    assert response.status_code == 400
    assert "Save a garden plan" in response.json()["detail"]


def test_a_future_start_date_is_rejected(client):
    client.put(
        "/api/me/garden",
        json={"layout": {"plants": [{"id": "t-1", "crop_id": "tomato", "crop": "Tomato"}]}},
        headers=auth_headers(ALICE),
    )
    future = (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=30)).isoformat()
    response = client.post(
        "/api/me/garden/start", json={"season_start": future}, headers=auth_headers(ALICE)
    )
    assert response.status_code == 400


def test_restarting_re_dates_rather_than_duplicating(client):
    _start_alices_garden(client)
    _start_alices_garden(client)
    plantings = client.get("/api/me/plantings", headers=auth_headers(ALICE)).json()
    assert len(plantings) == 2  # not 4


def test_bob_cannot_see_alices_schedule(client):
    _start_alices_garden(client)
    alice = client.get("/api/me/schedule", headers=auth_headers(ALICE)).json()
    bob = client.get("/api/me/schedule", headers=auth_headers(BOB)).json()
    assert alice["started"] is True
    assert bob["started"] is False
    assert bob["crops"] == []
