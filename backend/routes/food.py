"""Route layer for ingredient extraction. Holds no logic of its own."""

from fastapi import APIRouter

from models.schemas import AnalyzeFoodRequest, AnalyzeFoodResponse
from services.ingredient_extraction import extract_ingredients

router = APIRouter(tags=["food"])


@router.post("/analyze-food", response_model=AnalyzeFoodResponse)
def analyze_food(request: AnalyzeFoodRequest) -> AnalyzeFoodResponse:
    """Turn household meals + free text into a food-demand profile."""
    result = extract_ingredients(request)
    return AnalyzeFoodResponse(
        household_size=request.household_size,
        ingredients=result.ingredients,
        generated_by=result.source,
    )
