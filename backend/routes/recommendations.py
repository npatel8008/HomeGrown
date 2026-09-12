"""Route layer for crop recommendations. Holds no logic of its own."""

from typing import List

from fastapi import APIRouter

from models.schemas import RecommendCropsRequest, RecommendCropsResponse
from services.crop_repository import all_crops
from services.crop_scoring import score_crops

router = APIRouter(tags=["recommendations"])


@router.post("/recommend-crops", response_model=RecommendCropsResponse)
def recommend_crops(request: RecommendCropsRequest) -> RecommendCropsResponse:
    return score_crops(request)


@router.get("/crops")
def list_crops() -> List[dict]:
    """The raw demo crop dataset — useful for debugging and the crop library."""
    return all_crops()
