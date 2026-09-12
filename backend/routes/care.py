"""Route layer for the garden care engine. Holds no logic of its own."""

from typing import Optional

from fastapi import APIRouter, Query

from models.schemas import CareRecommendationsResponse, GardenStatusResponse
from services import care_engine

router = APIRouter(tags=["care"])


@router.get("/garden-status", response_model=GardenStatusResponse)
def garden_status(
    day: int = Query(34, ge=0, le=400, description="Day of the growing season"),
    location: str = Query("Demo City, US"),
) -> GardenStatusResponse:
    return care_engine.garden_status(day_of_season=day, location=location)


@router.get("/care-recommendations", response_model=CareRecommendationsResponse)
def care_recommendations(
    location: str = Query("Demo City, US"),
    crops: Optional[str] = Query(
        None,
        description="Comma-separated crop_id:days_since_planting pairs, e.g. 'tomato:31,basil:24'",
    ),
) -> CareRecommendationsResponse:
    plantings = None
    if crops:
        plantings = []
        for chunk in crops.split(","):
            crop_id, _, age = chunk.partition(":")
            if not crop_id.strip():
                continue
            plantings.append(
                {
                    "crop_id": crop_id.strip(),
                    "days_since_planting": int(age) if age.strip().isdigit() else 0,
                }
            )
    return care_engine.care_recommendations(plantings=plantings, location=location)
