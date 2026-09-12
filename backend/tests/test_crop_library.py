"""Every crop in the library must be drawable, and the numbers must be sane.

The point of these is the drift that a 245-crop dataset invites. The frontend
picks a 3D model from the `model` field; before this existed an unmapped crop
fell through to `bush` and nobody found out, because a bush is a perfectly
plausible-looking wrong answer. So the archetype list is read out of the
TypeScript source and compared against the data — if someone adds a crop with
a new silhouette and forgets the component, this fails here rather than looking
slightly off in AR.
"""

import json
import re
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parent.parent
CROPS_JSON = BACKEND / "data" / "crops.json"
PLANT_MODELS_TSX = BACKEND.parent / "frontend" / "components" / "garden" / "PlantModels.tsx"

SEASONS = {"all", "cool", "warm"}
WATER_LEVELS = {"low", "medium", "medium-high", "high"}
DIFFICULTIES = {"easy", "medium", "hard"}
REQUIRED_FIELDS = (
    "id", "name", "category", "sunlight_hours", "spacing_ft", "mature_height_ft",
    "days_to_harvest", "water_requirement", "difficulty", "estimated_yield_per_plant",
    "estimated_cost_per_plant", "estimated_grocery_price", "container_compatible",
    "season", "image", "color", "description", "model", "popularity",
)


@pytest.fixture(scope="module")
def crops():
    return json.loads(CROPS_JSON.read_text(encoding="utf-8"))["crops"]


@pytest.fixture(scope="module")
def frontend_archetypes():
    """The archetypes the 3D scene can actually render, read from its source."""
    source = PLANT_MODELS_TSX.read_text(encoding="utf-8")
    block = re.search(r"export const ARCHETYPES = \[(.*?)\] as const;", source, re.DOTALL)
    assert block, "could not find ARCHETYPES in PlantModels.tsx"
    names = set(re.findall(r'"([a-z-]+)"', block.group(1)))
    assert names, "ARCHETYPES parsed as empty"
    return names


def test_the_library_is_actually_large(crops):
    assert len(crops) >= 200, "only %d crops" % len(crops)


def test_ids_are_unique(crops):
    ids = [crop["id"] for crop in crops]
    assert len(ids) == len(set(ids))


def test_every_crop_can_be_drawn(crops, frontend_archetypes):
    """The headline guarantee: no crop renders as a silent fallback."""
    missing = sorted(
        {crop["model"] for crop in crops if crop["model"] not in frontend_archetypes}
    )
    assert not missing, "crops.json names archetypes the scene cannot draw: %s" % missing


def test_every_archetype_is_used(crops, frontend_archetypes):
    """An archetype nobody uses is dead code, and probably a typo somewhere."""
    used = {crop["model"] for crop in crops}
    unused = sorted(frontend_archetypes - used)
    assert not unused, "archetypes with no crops: %s" % unused


@pytest.mark.parametrize("field", REQUIRED_FIELDS)
def test_no_crop_is_missing_a_field(crops, field):
    missing = [crop.get("id", "?") for crop in crops if crop.get(field) in (None, "")]
    assert not missing, "%s missing on: %s" % (field, missing[:10])


def test_vocabularies_are_the_ones_the_services_branch_on(crops):
    """crop_scoring and care_engine switch on these strings; a typo is silent."""
    for crop in crops:
        assert crop["season"] in SEASONS, (crop["id"], crop["season"])
        assert crop["water_requirement"] in WATER_LEVELS, (crop["id"], crop["water_requirement"])
        assert crop["difficulty"] in DIFFICULTIES, (crop["id"], crop["difficulty"])


def test_numbers_are_physically_plausible(crops):
    for crop in crops:
        assert 0.1 <= crop["spacing_ft"] <= 40, (crop["id"], "spacing")
        assert 0.2 <= crop["mature_height_ft"] <= 45, (crop["id"], "height")
        assert 20 <= crop["days_to_harvest"] <= 2600, (crop["id"], "days")
        assert 0 < crop["estimated_yield_per_plant"] <= 70, (crop["id"], "yield")
        assert 0 < crop["estimated_cost_per_plant"] <= 60, (crop["id"], "cost")
        assert 0 < crop["estimated_grocery_price"] <= 45, (crop["id"], "price")
        assert 2 <= crop["sunlight_hours"] <= 12, (crop["id"], "sun")


def test_colours_are_hex(crops):
    for crop in crops:
        assert re.fullmatch(r"#[0-9A-Fa-f]{6}", crop["color"]), (crop["id"], crop["color"])


def test_a_container_crop_is_not_a_forest_tree(crops):
    """Balcony gardeners get filtered on this flag, so it has to mean something."""
    for crop in crops:
        if crop["container_compatible"]:
            assert crop["spacing_ft"] <= 8, (crop["id"], crop["spacing_ft"])


def test_the_generator_is_the_source_of_truth(crops):
    """Re-running the builder must reproduce the committed file exactly."""
    import sys

    sys.path.insert(0, str(BACKEND))
    from scripts.build_crops import build

    assert build()["crops"] == crops, "data/crops.json is out of step with build_crops.py"


def test_popularity_tiers_are_sane(crops):
    """1 = in almost every garden, 3 = niche. The scorer will not suggest a
    tier-3 crop unprompted, so the tiers have to mean something."""
    tiers = {crop["popularity"] for crop in crops}
    assert tiers <= {1, 2, 3}, tiers

    counts = {tier: sum(1 for c in crops if c["popularity"] == tier) for tier in (1, 2, 3)}
    # None of the three may be a rounding error, or the distinction is fake.
    for tier, count in counts.items():
        assert count >= 20, "tier %d has only %d crops: %s" % (tier, count, counts)


def test_the_staples_are_tier_one(crops):
    """If these are not the common ones, the tiers are wired up wrong."""
    by_id = {crop["id"]: crop for crop in crops}
    for crop_id in ("tomato", "lettuce", "carrot", "basil", "zucchini", "strawberry"):
        assert by_id[crop_id]["popularity"] == 1, crop_id
    for crop_id in ("watercress", "chervil", "sunchoke", "luffa"):
        assert by_id[crop_id]["popularity"] == 3, crop_id
