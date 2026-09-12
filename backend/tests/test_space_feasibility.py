"""Recommendations must be plantable in the space they were asked about.

With 26 crops this barely mattered; the library now holds walnuts, mango trees
and 5ft-spaced pumpkins, and scoring on its own will happily rank one into a
raised bed. The packer would then drop it into `unplaced`, which reads as a bug
in the layout rather than a recommendation that was never possible.
"""

import pytest

from models.schemas import (
    ExtractedIngredient,
    GenerateLayoutRequest,
    GrowingSpace,
    PlotSpec,
    RecommendCropsRequest,
)
from services.crop_repository import get_crop
from services.crop_scoring import score_crops
from services.layout_generator import generate_layout, largest_plantable_spacing_ft


def space(width, length, max_depth=None, garden_type="raised-beds", budget=150.0):
    return GrowingSpace(
        location="Pittsburgh, PA",
        zip_code="15213",
        plot=PlotSpec(width_ft=width, length_ft=length, unit="ft"),
        garden_type=garden_type,
        experience="beginner",
        budget_usd=budget,
        water_access="hose",
        notes="",
        max_bed_depth_ft=max_depth,
    )


def wants(*crop_ids):
    return [
        ExtractedIngredient(
            ingredient=crop_id.title(),
            weekly_usage_score=100 - index * 10,
            growable=True,
            crop_id=crop_id,
            matched_meals=["Dinner"],
        )
        for index, crop_id in enumerate(crop_ids)
    ]


def recommend(the_space, ingredients=None, household=4):
    return score_crops(
        RecommendCropsRequest(
            household_size=household,
            ingredients=ingredients if ingredients is not None else wants("tomato", "lettuce"),
            space=the_space,
        )
    )


# ---------------------------------------------------------------------------
# The whole library is in play
# ---------------------------------------------------------------------------


#: The crops that existed before the library was expanded to 245.
ORIGINAL_26 = {
    "tomato", "cherry-tomato", "basil", "cilantro", "jalapeno", "bell-pepper",
    "spinach", "lettuce", "green-onion", "cucumber", "bok-choy", "kale",
    "swiss-chard", "arugula", "carrot", "radish", "beet", "zucchini",
    "green-beans", "peas", "broccoli", "garlic", "parsley", "mint",
    "strawberry", "eggplant",
}


def test_recommendations_are_drawn_from_the_whole_library():
    """A big plot must reach well beyond the original two dozen crops.

    The allocator stops once the plot is full rather than walking all 245, so
    the evidence that the whole library is in play is that the crops it picks
    include ones that did not exist before the expansion.
    """
    result = recommend(space(40, 30, budget=4000))
    picked = {item.crop_id for item in result.recommendations}
    # Variety is deliberately capped, so the evidence is composition not count.
    assert len(picked) >= 6, "only %d crops recommended" % len(picked)
    assert picked - ORIGINAL_26, "every recommendation came from the original 26"


def test_a_crop_added_in_the_expansion_can_be_recommended():
    result = recommend(space(40, 30, budget=4000), ingredients=wants("blueberry", "raspberry"))
    names = {item.crop_id for item in result.recommendations}
    assert names & {"blueberry", "raspberry"}, names


# ---------------------------------------------------------------------------
# Only what fits
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("width,length", [(12, 8), (8, 4), (20, 10), (4, 3)])
def test_nothing_recommended_needs_more_room_than_exists(width, length):
    allowed = largest_plantable_spacing_ft(width, length)
    for item in recommend(space(width, length, budget=600)).recommendations:
        spacing = get_crop(item.crop_id)["spacing_ft"]
        assert spacing <= allowed + 1e-6, "%s needs %s ft, space allows %.1f" % (
            item.name, spacing, allowed,
        )


def test_a_tree_is_refused_for_a_raised_bed_and_told_why():
    result = recommend(space(12, 8), ingredients=wants("walnut", "tomato"))
    assert "walnut" not in {item.crop_id for item in result.recommendations}
    reason = next(item for item in result.skipped if item.crop_id == "walnut")
    assert reason.kind == "space"
    assert "ft between plants" in reason.reason


def test_a_big_plot_does_allow_a_tree():
    result = recommend(space(60, 40, budget=5000), ingredients=wants("dwarf-apple"))
    assert "dwarf-apple" in {item.crop_id for item in result.recommendations}


# ---------------------------------------------------------------------------
# The depth cap
# ---------------------------------------------------------------------------


def test_max_depth_narrows_what_can_be_recommended():
    """A deep plot you can only reach 2ft into cannot hold a 2.5ft squash.

    Asked for by name, so the assertion does not depend on what the scorer
    happens to rank into a list of fourteen.
    """
    assert get_crop("zucchini")["spacing_ft"] > 2.0  # the premise
    asked = wants("zucchini", "lettuce")

    roomy = recommend(space(30, 20, budget=2000), ingredients=asked)
    assert "zucchini" in {item.crop_id for item in roomy.recommendations}

    shallow = recommend(space(30, 20, max_depth=2.0, budget=2000), ingredients=asked)
    assert "zucchini" not in {item.crop_id for item in shallow.recommendations}

    excluded = next(item for item in shallow.skipped if item.crop_id == "zucchini")
    assert excluded.kind == "space"
    assert "2.0 ft" in excluded.reason

    assert largest_plantable_spacing_ft(30, 20, 2.0) == pytest.approx(2.0)
    for item in shallow.recommendations:
        assert get_crop(item.crop_id)["spacing_ft"] <= 2.0 + 1e-6, item.name


def test_max_depth_caps_the_beds_the_packer_builds():
    layout = generate_layout(
        GenerateLayoutRequest(
            plot=PlotSpec(width_ft=30, length_ft=20, unit="ft"),
            garden_type="raised-beds",
            crops=[{"crop_id": "lettuce", "plants": 20}],
            max_bed_depth_ft=2.0,
        )
    )
    assert layout.beds, "no beds built"
    for bed in layout.beds:
        assert bed.length <= 2.0 + 1e-6, "bed %s is %.2f ft deep" % (bed.id, bed.length)


def test_without_a_cap_a_deep_bed_is_still_allowed_for_a_big_crop():
    """The cap is opt-in; pumpkins still get the depth they need without one."""
    layout = generate_layout(
        GenerateLayoutRequest(
            plot=PlotSpec(width_ft=30, length_ft=20, unit="ft"),
            garden_type="in-ground",
            crops=[{"crop_id": "pumpkin", "plants": 2}],
        )
    )
    assert not layout.unplaced, [(u.crop, u.count) for u in layout.unplaced]


# ---------------------------------------------------------------------------
# The two systems agree
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "width,length,max_depth",
    [(12, 8, None), (20, 12, None), (30, 20, 2.0), (40, 30, None), (8, 6, 3.0)],
)
def test_no_recommendation_disappears_without_being_accounted_for(width, length, max_depth):
    """Recommend it, and then either plant it or say you could not.

    The allocator and the packer are deliberately separate systems, and shelf
    packing cannot fill a bed exactly, so the honest promise is not "every
    plant lands" — it is that nothing vanishes silently. Anything the packer
    could not fit comes back in `unplaced`, which the UI shows.
    """
    the_space = space(width, length, max_depth, budget=3000)
    recommended = recommend(the_space)

    layout = generate_layout(
        GenerateLayoutRequest(
            plot=the_space.plot,
            garden_type=the_space.garden_type,
            crops=[
                {"crop_id": item.crop_id, "plants": item.plants_recommended}
                for item in recommended.recommendations
            ],
            max_bed_depth_ft=max_depth,
        )
    )

    planted = {plant.crop_id for plant in layout.plants}
    reported = {entry.crop_id for entry in layout.unplaced}
    promised = {item.crop_id for item in recommended.recommendations}

    unaccounted = promised - planted - reported
    assert not unaccounted, "recommended, not planted, not reported: %s" % sorted(unaccounted)

    # And the overflow should be the exception, not the rule.
    missing = promised - planted
    assert len(missing) <= max(1, len(promised) // 5), (
        "%d of %d recommended crops could not be placed: %s"
        % (len(missing), len(promised), sorted(missing))
    )


# ---------------------------------------------------------------------------
# Plausible in the environment, and properly spaced
# ---------------------------------------------------------------------------


def test_a_container_garden_only_gets_container_crops():
    result = recommend(space(8, 4, garden_type="containers", budget=200))
    for item in result.recommendations:
        assert get_crop(item.crop_id)["container_compatible"], item.name


def test_niche_crops_are_not_suggested_unprompted():
    """Watercress wants a bog. It should never turn up uninvited."""
    result = recommend(space(30, 20, budget=2000), ingredients=wants("tomato", "lettuce"))
    for item in result.recommendations:
        crop = get_crop(item.crop_id)
        if crop["id"] in {"tomato", "lettuce"}:
            continue
        assert crop["popularity"] <= 2, "%s (tier %d) was suggested unprompted" % (
            item.name, crop["popularity"],
        )


def test_a_niche_crop_asked_for_by_name_is_still_recommended():
    """The filter is about unprompted suggestions, not about refusing requests."""
    result = recommend(space(20, 12, budget=600), ingredients=wants("watercress", "sorrel"))
    picked = {item.crop_id for item in result.recommendations}
    assert "watercress" in picked and "sorrel" in picked


def test_leftover_ground_is_not_filled_with_one_category():
    result = recommend(space(40, 30, budget=4000), ingredients=wants("tomato"))
    counts: dict = {}
    for item in result.recommendations:
        if item.crop_id == "tomato":
            continue
        counts[item.category] = counts.get(item.category, 0) + 1
    worst = max(counts.values(), default=0)
    assert worst <= 2, "leftover space went to %d crops of one category: %s" % (worst, counts)


def test_variety_stays_in_the_range_a_household_would_manage():
    small = recommend(space(8, 6, budget=200))
    big = recommend(space(60, 40, budget=8000))
    assert len(small.recommendations) <= 8
    assert len(big.recommendations) <= 14, len(big.recommendations)


@pytest.mark.parametrize("width,length,max_depth", [(12, 8, None), (20, 12, None), (30, 20, 2.0)])
def test_planted_crops_keep_their_spacing(width, length, max_depth):
    """No two plants closer than the average of what they each need.

    The tolerance is 0.02 ft: positions are rounded to two decimals for the
    UI, which can shave a hundredth of a foot — three millimetres — off a gap.
    Anything larger than that is a packing bug.
    """
    import math

    the_space = space(width, length, max_depth, budget=3000)
    recommended = recommend(the_space)
    layout = generate_layout(
        GenerateLayoutRequest(
            plot=the_space.plot,
            garden_type=the_space.garden_type,
            crops=[
                {"crop_id": item.crop_id, "plants": item.plants_recommended}
                for item in recommended.recommendations
            ],
            max_bed_depth_ft=max_depth,
        )
    )

    plants = layout.plants
    assert plants
    for index, a in enumerate(plants):
        for b in plants[index + 1 :]:
            needed = (a.spacing_ft + b.spacing_ft) / 2.0
            gap = math.hypot(a.x - b.x, a.z - b.z)
            assert gap >= needed - 0.02, "%s and %s are %.2f ft apart, need %.2f" % (
                a.crop, b.crop, gap, needed,
            )


@pytest.mark.parametrize("width,length", [(12, 8), (20, 12), (30, 20)])
def test_every_plant_lands_inside_a_bed(width, length):
    the_space = space(width, length, budget=3000)
    recommended = recommend(the_space)
    layout = generate_layout(
        GenerateLayoutRequest(
            plot=the_space.plot,
            garden_type=the_space.garden_type,
            crops=[
                {"crop_id": item.crop_id, "plants": item.plants_recommended}
                for item in recommended.recommendations
            ],
        )
    )
    for plant in layout.plants:
        assert any(
            bed.x - 0.01 <= plant.x <= bed.x + bed.width + 0.01
            and bed.z - 0.01 <= plant.z <= bed.z + bed.length + 0.01
            for bed in layout.beds
        ), "%s at (%.1f, %.1f) is outside every bed" % (plant.crop, plant.x, plant.z)
