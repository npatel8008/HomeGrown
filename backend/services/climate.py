"""Real climate and weather for a location, from Open-Meteo (free, no key).

Two very different things live here, and they feed different systems:

  * `climate_profile()` — a *retrospective* look at the last full year of
    daily weather (Open-Meteo's archive/reanalysis API). This is where the
    frost dates, season length and growing-degree-days come from, and it feeds
    SYSTEM 2 (crop scoring): whether a crop can finish before frost is the
    single biggest determinant of whether it's worth planting.

  * `forecast()` — the next week. Feeds SYSTEM 4 (care), which needs to know
    whether to tell you to water today.

Both cache in-process and both fall back to neutral placeholder data, so the
app still runs offline. `source` on each result says which you got.

>>> REPLACE ME (partially) <<<
Frost dates here are derived from a single recent year, which is noisy — a mild
winter shifts them. A real version should use a 10-30 year normal (Open-Meteo's
climate API, or NOAA/PRISM normals) and report a probability, e.g. "last frost
after Apr 12 in 9 years out of 10".
"""

import datetime as dt
import json
import logging
import os
import urllib.parse
import urllib.request
from typing import Dict, List, Optional, Tuple

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
TIMEOUT = float(os.getenv("WEATHER_TIMEOUT", "12"))

#: Base temperature for growing-degree-days, °F. 50 is the usual figure for
#: warm-season vegetables.
GDD_BASE_F = 50.0
FROST_F = 32.0
#: Below this, warm-season crops stall even though nothing freezes.
CHILL_F = 50.0

WMO_DESCRIPTIONS = {
    0: "Clear", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Freezing fog", 51: "Light drizzle", 53: "Drizzle",
    55: "Heavy drizzle", 56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 66: "Freezing rain",
    67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow",
    77: "Snow grains", 80: "Rain showers", 81: "Rain showers",
    82: "Heavy showers", 85: "Snow showers", 86: "Snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Severe thunderstorm",
}


class ClimateProfile(BaseModel):
    """What the last full year of weather says about growing here."""

    latitude: float
    longitude: float
    #: Month-day strings, e.g. "04-12". None where the year had no frost.
    last_spring_frost: Optional[str] = None
    first_fall_frost: Optional[str] = None
    #: Days between those two. 365 in a frost-free climate.
    frost_free_days: int = 200
    growing_degree_days: int = 0
    avg_summer_high_f: float = 0
    avg_summer_low_f: float = 0
    annual_precip_in: float = 0
    #: Days over 90°F — heat that makes cool-season crops bolt.
    hot_days: int = 0
    #: Rough USDA-style zone derived from the coldest night seen.
    hardiness_zone: str = "unknown"
    coldest_night_f: float = 0
    summary: str = ""
    source: str = "open-meteo-archive"


class DailyForecast(BaseModel):
    date: str
    high_f: int
    low_f: int
    precip_in: float
    precip_chance_pct: int
    conditions: str


class ForecastBundle(BaseModel):
    location: str
    temperature_f: int
    conditions: str
    rain_probability_pct: int
    wind_mph: int
    humidity_pct: int = 0
    forecast_note: str = ""
    #: Total rain expected over the next 3 days, inches.
    rain_next_3_days_in: float = 0
    days: List[DailyForecast] = Field(default_factory=list)
    source: str = "open-meteo-forecast"


# ---------------------------------------------------------------------------
# Fallbacks, used when the network is unavailable
# ---------------------------------------------------------------------------

FALLBACK_CLIMATE = {
    "latitude": 39.83,
    "longitude": -98.58,
    "last_spring_frost": "04-20",
    "first_fall_frost": "10-15",
    "frost_free_days": 178,
    "growing_degree_days": 2900,
    "avg_summer_high_f": 86.0,
    "avg_summer_low_f": 63.0,
    "annual_precip_in": 30.0,
    "hot_days": 28,
    "hardiness_zone": "6",
    "coldest_night_f": 2.0,
    "summary": "Placeholder climate — a temperate mid-continent season of about 178 frost-free days.",
    "source": "fallback",
}

FALLBACK_FORECAST = {
    "location": "Demo City, US",
    "temperature_f": 78,
    "conditions": "Partly cloudy",
    "rain_probability_pct": 80,
    "wind_mph": 6,
    "humidity_pct": 64,
    "forecast_note": "Rain expected tonight, around 0.4 in.",
    "rain_next_3_days_in": 0.4,
    "days": [],
    "source": "fallback",
}

_climate_cache: Dict[Tuple[float, float], ClimateProfile] = {}
_forecast_cache: Dict[Tuple[float, float], Tuple[float, ForecastBundle]] = {}
FORECAST_TTL_SECONDS = 900


def _get(url: str, params: dict) -> dict:
    full = "%s?%s" % (url, urllib.parse.urlencode(params))
    with urllib.request.urlopen(full, timeout=TIMEOUT) as response:
        return json.load(response)


def _archive_year() -> Tuple[str, str]:
    """The last complete calendar year — the archive lags a few days."""
    year = dt.date.today().year - 1
    return "%d-01-01" % year, "%d-12-31" % year


def _hardiness_zone(coldest_f: float) -> str:
    """USDA zones step every 10°F from -60. Good enough for a label."""
    zone = int((coldest_f + 60) // 10) + 1
    zone = max(1, min(13, zone))
    half = "b" if ((coldest_f + 60) % 10) >= 5 else "a"
    return "%d%s" % (zone, half)


def climate_profile(latitude: float, longitude: float) -> ClimateProfile:
    """Derive growing conditions from the last full year of daily weather."""
    key = (round(latitude, 2), round(longitude, 2))
    if key in _climate_cache:
        return _climate_cache[key]

    start, end = _archive_year()
    try:
        payload = _get(
            ARCHIVE_URL,
            {
                "latitude": latitude,
                "longitude": longitude,
                "start_date": start,
                "end_date": end,
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
                "temperature_unit": "fahrenheit",
                "precipitation_unit": "inch",
                "timezone": "auto",
            },
        )
        daily = payload["daily"]
        dates: List[str] = daily["time"]
        highs = daily["temperature_2m_max"]
        lows = daily["temperature_2m_min"]
        rain = daily["precipitation_sum"]

        profile = _derive(latitude, longitude, dates, highs, lows, rain)
    except Exception as error:
        logger.warning("Climate lookup failed for %.2f,%.2f (%s); using fallback", latitude, longitude, error)
        profile = ClimateProfile(**{**FALLBACK_CLIMATE, "latitude": latitude, "longitude": longitude})

    _climate_cache[key] = profile
    return profile


def _derive(
    latitude: float,
    longitude: float,
    dates: List[str],
    highs: List[Optional[float]],
    lows: List[Optional[float]],
    rain: List[Optional[float]],
) -> ClimateProfile:
    northern = latitude >= 0
    mid_year = 182

    last_spring: Optional[int] = None
    first_fall: Optional[int] = None
    gdd = 0.0
    hot_days = 0
    coldest = 999.0
    summer_highs: List[float] = []
    summer_lows: List[float] = []
    total_rain = 0.0

    # In the southern hemisphere the growing season straddles New Year, so the
    # "spring frost / fall frost" split is mirrored.
    for index, day in enumerate(dates):
        high = highs[index]
        low = lows[index]
        if rain[index] is not None:
            total_rain += rain[index]
        if high is None or low is None:
            continue

        coldest = min(coldest, low)
        if high >= 90:
            hot_days += 1

        mean = (high + low) / 2
        if mean > GDD_BASE_F:
            gdd += mean - GDD_BASE_F

        month = int(day[5:7])
        summer_months = (6, 7, 8) if northern else (12, 1, 2)
        if month in summer_months:
            summer_highs.append(high)
            summer_lows.append(low)

        if low <= FROST_F:
            in_first_half = index < mid_year
            if northern:
                if in_first_half:
                    last_spring = index
                elif first_fall is None:
                    first_fall = index
            else:
                if not in_first_half:
                    last_spring = index
                elif first_fall is None or index > first_fall:
                    first_fall = index

    def label(index: Optional[int]) -> Optional[str]:
        return dates[index][5:] if index is not None else None

    if last_spring is not None and first_fall is not None:
        frost_free = max(0, first_fall - last_spring)
    elif last_spring is None and first_fall is None:
        frost_free = 365  # never froze
    else:
        # Frost only at one end of the year.
        frost_free = (first_fall or len(dates)) if last_spring is None else len(dates) - last_spring

    avg_high = round(sum(summer_highs) / len(summer_highs), 1) if summer_highs else 0.0
    avg_low = round(sum(summer_lows) / len(summer_lows), 1) if summer_lows else 0.0
    zone = _hardiness_zone(coldest if coldest < 999 else 20)

    if frost_free >= 330:
        season = "a nearly frost-free, year-round growing season"
    elif frost_free >= 240:
        season = "a long season with room for two or three plantings"
    elif frost_free >= 170:
        season = "a full standard season"
    elif frost_free >= 110:
        season = "a short season — quick-maturing varieties matter here"
    else:
        season = "a very short season; long-maturing crops need starting indoors"

    summary = "About %d frost-free days (%s), zone %s, %.0f″ of rain a year." % (
        frost_free,
        season,
        zone,
        total_rain,
    )

    return ClimateProfile(
        latitude=latitude,
        longitude=longitude,
        last_spring_frost=label(last_spring),
        first_fall_frost=label(first_fall),
        frost_free_days=frost_free,
        growing_degree_days=int(gdd),
        avg_summer_high_f=avg_high,
        avg_summer_low_f=avg_low,
        annual_precip_in=round(total_rain, 1),
        hot_days=hot_days,
        hardiness_zone=zone,
        coldest_night_f=round(coldest, 1) if coldest < 999 else 0.0,
        summary=summary,
    )


def forecast(latitude: float, longitude: float, label: str = "") -> ForecastBundle:
    """Current conditions plus a 7-day outlook."""
    import time

    key = (round(latitude, 2), round(longitude, 2))
    cached = _forecast_cache.get(key)
    if cached and time.time() - cached[0] < FORECAST_TTL_SECONDS:
        bundle = cached[1]
        return bundle.model_copy(update={"location": label or bundle.location})

    try:
        payload = _get(
            FORECAST_URL,
            {
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
                "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code",
                "forecast_days": 7,
                "temperature_unit": "fahrenheit",
                "wind_speed_unit": "mph",
                "precipitation_unit": "inch",
                "timezone": "auto",
            },
        )
        current = payload["current"]
        daily = payload["daily"]

        days = [
            DailyForecast(
                date=daily["time"][index],
                high_f=int(round(daily["temperature_2m_max"][index] or 0)),
                low_f=int(round(daily["temperature_2m_min"][index] or 0)),
                precip_in=round(daily["precipitation_sum"][index] or 0, 2),
                precip_chance_pct=int(daily["precipitation_probability_max"][index] or 0),
                conditions=WMO_DESCRIPTIONS.get(daily["weather_code"][index], "Mixed"),
            )
            for index in range(len(daily["time"]))
        ]

        today = days[0] if days else None
        rain_3 = round(sum(day.precip_in for day in days[:3]), 2)

        if today and today.precip_chance_pct >= 60:
            note = "Rain likely today — about %.2f″ expected." % today.precip_in
        elif rain_3 >= 0.2:
            note = "About %.2f″ of rain expected over the next three days." % rain_3
        elif today and today.high_f >= 90:
            note = "Hot and dry — beds will need water."
        else:
            note = "Dry stretch ahead; check soil moisture before watering."

        bundle = ForecastBundle(
            location=label or "%.2f, %.2f" % (latitude, longitude),
            temperature_f=int(round(current["temperature_2m"])),
            conditions=WMO_DESCRIPTIONS.get(current.get("weather_code"), "Mixed"),
            rain_probability_pct=today.precip_chance_pct if today else 0,
            wind_mph=int(round(current.get("wind_speed_10m") or 0)),
            humidity_pct=int(round(current.get("relative_humidity_2m") or 0)),
            forecast_note=note,
            rain_next_3_days_in=rain_3,
            days=days,
        )
        _forecast_cache[key] = (time.time(), bundle)
        return bundle
    except Exception as error:
        logger.warning("Forecast failed for %.2f,%.2f (%s); using fallback", latitude, longitude, error)
        return ForecastBundle(**{**FALLBACK_FORECAST, "location": label or FALLBACK_FORECAST["location"]})
