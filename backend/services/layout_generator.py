"""SYSTEM 3 — Garden layout generation.

Splits the plot into reachable beds separated by walking paths, then fills each
bed with single-crop rows using a shelf-packing heuristic: for every new row,
take the tallest crop still waiting that fits the depth left in the bed. Tall
crops therefore land at the back of the garden and short crops slot into the
shallow leftovers instead of wasting them.

The output of this module is the single source of truth for BOTH the 2D
planner and the 3D scene on the frontend — they render the same JSON.

>>> REPLACE ME <<<
A real version should do proper bin-packing with companion-planting rules,
succession slots, trellised/vertical space and sun-path shading.
"""

import math
from typing import List

from models.schemas import (
    GardenType,
    GenerateLayoutRequest,
    GenerateLayoutResponse,
    LayoutBed,
    LayoutLegendEntry,
    LayoutPath,
    PlacedPlant,
)
from services.crop_repository import get_crop

MARGIN_FT = 0.5
# Beyond this depth you can no longer reach the middle of a bed from the edge,
# so a walking path is inserted.
MAX_REACHABLE_DEPTH_FT = 6.5
TARGET_BED_DEPTH_FT = 3.5
PATH_WIDTH_FT = 1.0
EPS = 0.001


def _build_beds(
    width: float,
    length: float,
    garden_type: GardenType,
    deepest_crop_ft: float = 0.0,
):
    """Split the plot into bed strips separated by walking paths."""
    beds: List[LayoutBed] = []
    paths: List[LayoutPath] = []

    inner_w = max(0.5, width - 2 * MARGIN_FT)
    inner_l = max(0.5, length - 2 * MARGIN_FT)
    label = "Container group" if garden_type == GardenType.CONTAINERS else "Bed"

    # A bed shallower than the crop's own spacing can never hold it, and the
    # packer would drop every tree, cane and big shrub into `unplaced` with no
    # explanation. Reachability is why beds are narrow, and it is an argument
    # about salad: you need to reach the middle of a lettuce bed from the path,
    # and you do not need to reach the middle of an apple tree. So the target
    # depth grows to fit whatever is actually being planted.
    target_depth = max(TARGET_BED_DEPTH_FT, deepest_crop_ft + 2 * MARGIN_FT)
    reachable_depth = max(MAX_REACHABLE_DEPTH_FT, target_depth)

    bed_count = 1
    if inner_l > reachable_depth:
        bed_count = max(2, int(math.ceil(inner_l / target_depth)))

    path_total = (bed_count - 1) * PATH_WIDTH_FT
    # Never spend more than a third of the depth on paths.
    while bed_count > 1 and path_total > inner_l * 0.34:
        bed_count -= 1
        path_total = (bed_count - 1) * PATH_WIDTH_FT

    depth = (inner_l - path_total) / bed_count

    # If the result still cannot hold the deepest crop, drop paths until it
    # can: one usable bed beats four that fit nothing.
    while bed_count > 1 and depth + EPS < deepest_crop_ft:
        bed_count -= 1
        path_total = (bed_count - 1) * PATH_WIDTH_FT
        depth = (inner_l - path_total) / bed_count
    z = MARGIN_FT
    for index in range(bed_count):
        beds.append(
            LayoutBed(
                id="bed-%d" % (index + 1),
                x=round(MARGIN_FT, 2),
                z=round(z, 2),
                width=round(inner_w, 2),
                length=round(depth, 2),
                label="%s %d" % (label, index + 1),
            )
        )
        z += depth
        if index < bed_count - 1:
            paths.append(
                LayoutPath(x=round(MARGIN_FT, 2), z=round(z, 2), width=round(inner_w, 2), length=PATH_WIDTH_FT)
            )
            z += PATH_WIDTH_FT

    return beds, paths


def generate_layout(request: GenerateLayoutRequest) -> GenerateLayoutResponse:
    requested = [get_crop(entry.crop_id) for entry in request.crops if entry.plants > 0]
    deepest = max(
        (crop["spacing_ft"] for crop in requested if crop),
        default=0.0,
    )

    beds, paths = _build_beds(
        request.plot.width_ft, request.plot.length_ft, request.garden_type, deepest
    )

    # crop -> plants still waiting for a home
    pending = []
    for entry in request.crops:
        crop = get_crop(entry.crop_id)
        if crop and entry.plants > 0:
            pending.append({"crop": crop, "left": entry.plants, "requested": entry.plants, "placed": 0})

    plants: List[PlacedPlant] = []

    for bed in beds:
        z = bed.z
        while True:
            depth_left = bed.z + bed.length - z
            fits = [
                item
                for item in pending
                if item["left"] > 0 and item["crop"]["spacing_ft"] <= depth_left + EPS
            ]
            if not fits:
                break
            # Tallest first so the back of the bed doesn't shade the front.
            fits.sort(key=lambda item: (-item["crop"]["mature_height_ft"], -item["crop"]["spacing_ft"]))
            primary = fits[0]
            row_depth = float(primary["crop"]["spacing_ft"])
            x = bed.x

            # Fill the row left to right: the primary crop first, then any
            # shorter crop still waiting that fits in the width that is left.
            # Everything in a row shares the row's centre line so mixed-spacing
            # rows still read as rows.
            row_queue = [primary] + [
                item for item in fits[1:] if item["crop"]["spacing_ft"] <= row_depth + EPS
            ]
            for item in row_queue:
                crop = item["crop"]
                spacing = float(crop["spacing_ft"])
                width_left = bed.x + bed.width - x
                count = min(int((width_left + EPS) // spacing), item["left"])
                if count <= 0:
                    continue
                for _ in range(count):
                    item["placed"] += 1
                    plants.append(
                        PlacedPlant(
                            id="%s-%d" % (crop["id"], item["placed"]),
                            crop=crop["name"],
                            crop_id=crop["id"],
                            x=round(x + spacing / 2, 2),
                            z=round(z + row_depth / 2, 2),
                            height=crop["mature_height_ft"],
                            spacing_ft=spacing,
                            color=crop["color"],
                            days_to_harvest=crop["days_to_harvest"],
                            expected_yield_lbs=crop["estimated_yield_per_plant"],
                            water_requirement=crop["water_requirement"],
                            model=crop.get("model", "bush"),
                            estimated_value_usd=round(
                                crop["estimated_yield_per_plant"] * crop["estimated_grocery_price"], 2
                            ),
                            status="planned",
                        )
                    )
                    x += spacing
                item["left"] -= count

            z += row_depth

    legend = [
        LayoutLegendEntry(
            crop_id=item["crop"]["id"],
            crop=item["crop"]["name"],
            color=item["crop"]["color"],
            count=item["placed"],
        )
        for item in pending
        if item["placed"] > 0
    ]
    legend.sort(key=lambda entry: -entry.count)

    unplaced = [
        LayoutLegendEntry(
            crop_id=item["crop"]["id"],
            crop=item["crop"]["name"],
            color=item["crop"]["color"],
            count=item["left"],
        )
        for item in pending
        if item["left"] > 0
    ]

    return GenerateLayoutResponse(
        plot=request.plot,
        garden_type=request.garden_type,
        plants=plants,
        beds=beds,
        paths=paths,
        legend=legend,
        unplaced=unplaced,
    )
