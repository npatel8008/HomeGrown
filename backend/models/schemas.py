"""Pydantic request/response contracts shared by every route.

These mirror `frontend/lib/types.ts` one-for-one. If you change a field here,
change it there too — there is no codegen step in the scaffold.
"""

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Enums / shared vocabulary
# ---------------------------------------------------------------------------

class GardenType(str, Enum):
    IN_GROUND = "in-ground"
    RAISED_BEDS = "raised-beds"
    CONTAINERS = "containers"
    BALCONY = "balcony"


class ExperienceLevel(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"


class WaterAccess(str, Enum):
    HOSE = "hose"
    WATERING_CAN = "watering-can"
    IRRIGATION = "irrigation"
    LIMITED = "limited"


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class TaskCategory(str, Enum):
    NEEDS_ATTENTION = "needs-attention"
    COMING_SOON = "coming-soon"
    ON_TRACK = "on-track"


# ---------------------------------------------------------------------------
# 1. Ingredient extraction  —  POST /api/analyze-food
# ---------------------------------------------------------------------------

class Meal(BaseModel):
    name: str
    times_per_week: float = Field(default=1, ge=0, le=21)


class AnalyzeFoodRequest(BaseModel):
    household_size: int = Field(default=1, ge=1, le=20)
    meals: List[Meal] = Field(default_factory=list)
    free_text: str = ""


class ExtractedIngredient(BaseModel):
    ingredient: str
    weekly_usage_score: int = Field(ge=0, le=100)
    growable: bool
    crop_id: Optional[str] = None
    matched_meals: List[str] = Field(default_factory=list)


class AnalyzeFoodResponse(BaseModel):
    household_size: int
    ingredients: List[ExtractedIngredient]
    # Marks output produced by the placeholder extractor rather than a real LLM.
    generated_by: str = "mock-ingredient-extractor"


# ---------------------------------------------------------------------------
# 2. Crop scoring  —  POST /api/recommend-crops
# ---------------------------------------------------------------------------

class PlotSpec(BaseModel):
    width_ft: float = Field(default=12, gt=0, le=200)
    length_ft: float = Field(default=8, gt=0, le=200)
    unit: str = "ft"


class GrowingSpace(BaseModel):
    location: str = "Demo City, US"
    zip_code: str = "00000"
    plot: PlotSpec = Field(default_factory=PlotSpec)
    garden_type: GardenType = GardenType.RAISED_BEDS
    experience: ExperienceLevel = ExperienceLevel.BEGINNER
    budget_usd: float = Field(default=150, ge=0)
    water_access: WaterAccess = WaterAccess.HOSE
    notes: str = ""


class ResolvedLocationOut(BaseModel):
    """Where we decided the user actually is."""

    query: str = ""
    name: str = ""
    region: str = ""
    country: str = ""
    country_code: str = ""
    latitude: float = 0
    longitude: float = 0
    timezone: str = ""
    elevation_ft: float = 0
    label: str = ""
    resolved: bool = False


class ClimateOut(BaseModel):
    """Growing conditions derived from the last full year of local weather."""

    last_spring_frost: Optional[str] = None
    first_fall_frost: Optional[str] = None
    frost_free_days: int = 0
    growing_degree_days: int = 0
    avg_summer_high_f: float = 0
    avg_summer_low_f: float = 0
    annual_precip_in: float = 0
    hot_days: int = 0
    hardiness_zone: str = ""
    coldest_night_f: float = 0
    summary: str = ""
    source: str = ""


class LocationLookupResponse(BaseModel):
    location: ResolvedLocationOut
    climate: ClimateOut


class RecommendCropsRequest(BaseModel):
    household_size: int = Field(default=4, ge=1, le=20)
    ingredients: List[ExtractedIngredient] = Field(default_factory=list)
    space: GrowingSpace = Field(default_factory=GrowingSpace)


class ScoreBreakdown(BaseModel):
    """The five additive components of `crop_score`. Each is 0-100."""

    household_demand: float
    climate_fit: float
    space_efficiency: float
    financial_value: float
    ease_of_growing: float


class CropRecommendation(BaseModel):
    crop_id: str
    name: str
    category: str
    rank: int
    score: int = Field(ge=0, le=100)
    score_breakdown: ScoreBreakdown
    reason: str
    plants_recommended: int
    expected_yield_lbs: float
    grocery_value_usd: float
    growing_cost_usd: float
    savings_usd: float
    days_to_harvest: int
    difficulty: Difficulty
    water_requirement: str
    space_required_sqft: float
    #: True when the crop can reach harvest inside the local frost-free window.
    fits_season: bool = True
    season_note: str = ""
    color: str
    image: str
    description: str


class GardenSummary(BaseModel):
    total_area_sqft: float
    used_area_sqft: float
    crop_count: int
    total_plants: int
    estimated_yield_lbs: float
    estimated_grocery_value_usd: float
    estimated_cost_usd: float
    estimated_savings_usd: float
    homegrown_coverage_pct: int
    coverage_explainer: str
    within_budget: bool
    #: Pounds of produce the household plausibly eats in a season. Exposed so
    #: the client can recompute coverage when the user deselects crops,
    #: instead of duplicating the constant.
    produce_need_lbs: float = 0


class SkippedCrop(BaseModel):
    """A crop that was considered and left out, and why."""

    name: str
    crop_id: str
    reason: str
    #: "climate" | "demand" | "space" — lets the UI group them.
    kind: str = "space"


class RecommendCropsResponse(BaseModel):
    summary: GardenSummary
    recommendations: List[CropRecommendation]
    skipped: List[SkippedCrop] = Field(default_factory=list)
    location: Optional[ResolvedLocationOut] = None
    climate: Optional[ClimateOut] = None
    generated_by: str = "mock-crop-scoring-v0"


# ---------------------------------------------------------------------------
# 3. Layout generation  —  POST /api/generate-layout
# ---------------------------------------------------------------------------

class LayoutPlantRequest(BaseModel):
    crop_id: str
    plants: int = Field(ge=0, le=500)


class GenerateLayoutRequest(BaseModel):
    plot: PlotSpec = Field(default_factory=PlotSpec)
    garden_type: GardenType = GardenType.RAISED_BEDS
    crops: List[LayoutPlantRequest] = Field(default_factory=list)


class PlacedPlant(BaseModel):
    id: str
    crop: str
    crop_id: str
    x: float
    z: float
    height: float
    spacing_ft: float
    color: str
    days_to_harvest: int
    expected_yield_lbs: float
    water_requirement: str
    estimated_value_usd: float
    status: str = "planned"


class LayoutPath(BaseModel):
    x: float
    z: float
    width: float
    length: float


class LayoutBed(BaseModel):
    id: str
    x: float
    z: float
    width: float
    length: float
    label: str


class LayoutLegendEntry(BaseModel):
    crop_id: str
    crop: str
    color: str
    count: int


class GenerateLayoutResponse(BaseModel):
    plot: PlotSpec
    garden_type: GardenType
    plants: List[PlacedPlant]
    beds: List[LayoutBed] = Field(default_factory=list)
    paths: List[LayoutPath] = Field(default_factory=list)
    legend: List[LayoutLegendEntry] = Field(default_factory=list)
    unplaced: List[LayoutLegendEntry] = Field(default_factory=list)
    generated_by: str = "mock-layout-generator-v0"


# ---------------------------------------------------------------------------
# 4. Care engine  —  GET /api/garden-status, GET /api/care-recommendations
# ---------------------------------------------------------------------------

class DailyForecastOut(BaseModel):
    date: str
    high_f: int
    low_f: int
    precip_in: float
    precip_chance_pct: int
    conditions: str


class Weather(BaseModel):
    location: str
    temperature_f: int
    conditions: str
    rain_probability_pct: int
    wind_mph: int
    forecast_note: str
    humidity_pct: int = 0
    rain_next_3_days_in: float = 0
    days: List[DailyForecastOut] = Field(default_factory=list)
    source: str = "mock-weather"


class GardenProgress(BaseModel):
    day_of_season: int
    season_length_days: int
    harvest_value_to_date_usd: float
    projected_seasonal_value_usd: float
    crops_planted: int
    next_harvest_crop: Optional[str] = None
    next_harvest_in_days: Optional[int] = None


class GardenStatusResponse(BaseModel):
    weather: Weather
    progress: GardenProgress
    generated_by: str = "mock-care-engine-v0"


class CareTask(BaseModel):
    id: str
    crop_id: str
    crop: str
    title: str
    reason: str
    category: TaskCategory
    action: str
    due_in_days: int
    color: str


class CareRecommendationsResponse(BaseModel):
    weather: Weather
    tasks: List[CareTask]
    counts: Dict[str, int]
    generated_by: str = "mock-care-engine-v0"
