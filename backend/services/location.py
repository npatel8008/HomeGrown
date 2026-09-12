"""Resolve a free-text place (city, "Austin, TX", or a US ZIP) to coordinates.

Uses Open-Meteo's geocoding API: free, no API key, no rate-limit registration,
and it resolves US postal codes as well as place names. That matters for this
project — the demo has to work for anyone who clones it without signing up for
anything.

Everything degrades to a neutral fallback location so the app still runs with
no network at all.
"""

import json
import logging
import os
import urllib.parse
import urllib.request
from typing import Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
TIMEOUT = float(os.getenv("GEO_TIMEOUT", "8"))

#: Used when geocoding is unavailable. Deliberately mid-latitude and temperate
#: so the fallback numbers aren't wildly wrong for a US demo.
FALLBACK = {
    "query": "",
    "name": "Demo City",
    "region": "",
    "country": "United States",
    "country_code": "US",
    "latitude": 39.83,
    "longitude": -98.58,
    "timezone": "America/Chicago",
    "elevation_ft": 1500.0,
    "resolved": False,
}


class ResolvedLocation(BaseModel):
    query: str
    name: str
    region: str
    country: str
    country_code: str
    latitude: float
    longitude: float
    timezone: str
    elevation_ft: float
    #: False when we fell back instead of actually resolving the query.
    resolved: bool

    @property
    def label(self) -> str:
        parts = [self.name]
        if self.region:
            parts.append(self.region)
        if self.country_code and self.country_code != "US":
            parts.append(self.country_code)
        elif self.country_code == "US":
            parts.append("US")
        return ", ".join(parts)


_cache: dict = {}


def geocode(query: str, country_code: str = "") -> ResolvedLocation:
    """Resolve a place name or postal code. Never raises."""
    key = (query.strip().lower(), country_code)
    if key in _cache:
        return _cache[key]

    if not query.strip():
        return ResolvedLocation(**FALLBACK)

    params = {"name": query.strip(), "count": "1", "language": "en", "format": "json"}
    if country_code:
        params["countryCode"] = country_code

    try:
        url = "%s?%s" % (GEOCODE_URL, urllib.parse.urlencode(params))
        with urllib.request.urlopen(url, timeout=TIMEOUT) as response:
            payload = json.load(response)
        results = payload.get("results") or []
        if not results:
            raise ValueError("no match for %r" % query)
        top = results[0]
        location = ResolvedLocation(
            query=query,
            name=top.get("name") or query,
            region=top.get("admin1") or "",
            country=top.get("country") or "",
            country_code=top.get("country_code") or "",
            latitude=float(top["latitude"]),
            longitude=float(top["longitude"]),
            timezone=top.get("timezone") or "auto",
            # metres -> feet, which is what a US gardener expects to see.
            elevation_ft=round(float(top.get("elevation") or 0) * 3.28084, 0),
            resolved=True,
        )
    except Exception as error:
        logger.warning("Geocoding failed for %r (%s); using fallback", query, error)
        location = ResolvedLocation(**{**FALLBACK, "query": query})

    _cache[key] = location
    return location


def resolve(city: str = "", zip_code: str = "") -> ResolvedLocation:
    """Prefer the ZIP (more precise), fall back to the city name."""
    zip_code = (zip_code or "").strip()
    city = (city or "").strip()

    if zip_code and zip_code not in ("00000",):
        found = geocode(zip_code, country_code="US" if zip_code.isdigit() else "")
        if found.resolved:
            return found
    if city:
        return geocode(city)
    return ResolvedLocation(**{**FALLBACK, "query": zip_code or city})
