"""Route layer for garden layout generation. Holds no logic of its own."""

from fastapi import APIRouter

from models.schemas import GenerateLayoutRequest, GenerateLayoutResponse
from services.layout_generator import generate_layout

router = APIRouter(tags=["garden"])


@router.post("/generate-layout", response_model=GenerateLayoutResponse)
def create_layout(request: GenerateLayoutRequest) -> GenerateLayoutResponse:
    return generate_layout(request)
