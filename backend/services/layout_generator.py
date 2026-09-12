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
from typing import List, Optional

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


def largest_plantable_spacing_ft(
    width: float,
    length: float,
    max_bed_depth_ft: Optional[float] = None,
) -> float:
    """The widest spacing this plot can actually hold a plant at.

    A plant needs its spacing in both directions: across the bed, and into it.
    The best case is a single bed running the full plot, so the limit is the
    smaller of the two inner dimensions — tightened further when the gardener
    has said how far they can reach into a bed.

    `crop_scoring` uses this to refuse to recommend a crop the packer would
    then have to drop, which is the difference between "we did not suggest a
    walnut for your 12x8 bed" and "we suggested one and it vanished".
    """
    inner_w = max(0.0, width - 2 * MARGIN_FT)
    inner_l = max(0.0, length - 2 * MARGIN_FT)
    depth = inner_l if not max_bed_depth_ft else min(inner_l, max_bed_depth_ft)
    return max(0.0, min(inner_w, depth))


def plantable_bed_area_ft2(
    width: float,
    length: float,
    garden_type: GardenType,
    max_bed_depth_ft: Optional[float] = None,
) -> float:
    """Square feet of actual bed, once margins and walking paths are taken out.

    `crop_scoring` allocates against this rather than a flat percentage of the
    plot. The two systems stay deliberately separate, but they should at least
    agree on how much ground there is: a flat 22% overhead assumed 187 sq ft on
    a 20x12 plot where the packer builds 152, and the crops at the end of the
    list were promised space that did not exist.
    """
    beds, _paths = _build_beds(width, length, garden_type, 0.0, max_bed_depth_ft)
    return sum(bed.width * bed.length for bed in beds)


def _build_beds(
    width: float,
    length: float,
    garden_type: GardenType,
    deepest_crop_ft: float = 0.0,
    max_bed_depth_ft: Optional[float] = None,
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

    # An explicit cap wins over the crop's wishes: if you can only reach two
    # feet into a bed against a wall, a bed three feet deep is useless to you
    # however much the squash would like it.
    cap = max_bed_depth_ft if max_bed_depth_ft and max_bed_depth_ft > 0 else None
    if cap:
        target_depth = min(target_depth, cap)

    reachable_depth = max(MAX_REACHABLE_DEPTH_FT, target_depth)
    if cap:
        reachable_depth = min(reachable_depth, cap)

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
    # can: one usable bed beats four that fit nothing. A depth cap stops this.
    while bed_count > 1 and depth + EPS < deepest_crop_ft:
        fewer = bed_count - 1
        fewer_paths = (fewer - 1) * PATH_WIDTH_FT
        fewer_depth = (inner_l - fewer_paths) / fewer
        if cap and fewer_depth > cap + EPS:
            break
        bed_count, path_total, depth = fewer, fewer_paths, fewer_depth

    # And with a cap in force, add beds until no bed is deeper than allowed.
    if cap:
        while depth > cap + EPS:
            more = bed_count + 1
            more_paths = (more - 1) * PATH_WIDTH_FT
            if more_paths >= inner_l:
                break  # no room left for another path
            bed_count, path_total = more, more_paths
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
        request.plot.width_ft,
        request.plot.length_ft,
        request.garden_type,
        deepest,
        request.max_bed_depth_ft,
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
