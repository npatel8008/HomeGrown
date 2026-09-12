"""Route layer for location + climate lookup. Holds no logic of its own."""

from fastapi import APIRouter, Query

from models.schemas import ClimateOut, LocationLookupResponse, ResolvedLocationOut
from services.climate import climate_profile
from services.location import resolve

router = APIRouter(tags=["location"])


@router.get("/location", response_model=LocationLookupResponse)
def lookup_location(
    city: str = Query("", description="City or place name"),
    zip_code: str = Query("", alias="zip", description="Postal code"),
) -> LocationLookupResponse:
    """Resolve a place and describe what growing there is like.

    Used by the growing-space form so the user can see their frost dates and
    season length before committing to a plan.
    """
    location = resolve(city, zip_code)
    climate = climate_profile(location.latitude, location.longitude)
    return LocationLookupResponse(
        location=ResolvedLocationOut(**location.model_dump(), label=location.label),
        climate=ClimateOut(**climate.model_dump(exclude={"latitude", "longitude"})),
    )
