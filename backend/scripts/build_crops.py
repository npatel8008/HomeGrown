"""Builds `data/crops.json` — the crop library the whole app draws from.

WHY A GENERATOR AND NOT HAND-WRITTEN JSON
Two hundred crops times seventeen fields is 3,400 values. Written by hand they
drift: two cabbages disagree about sunlight, a tree gets a container flag, a
new crop lands with no 3D archetype and silently renders as a bush. Here the
shared facts live once per botanical group and each row states only what makes
that crop itself, so the whole library is reviewable on a screen.

HONESTY ABOUT THE NUMBERS
Yields, costs and retail prices are informed estimates, not measured data, and
they are the numbers the savings figures are built on. Spacing, height and
days-to-harvest are close to seed-packet norms; the money is rougher. This is
recorded in the file's own `_meta` block and should stay there until a real
horticultural dataset replaces it.

    python3 scripts/build_crops.py
"""

import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data" / "crops.json"

# Every silhouette the 3D scene can draw. Mirrors ARCHETYPES in
# frontend/components/garden/PlantModels.tsx; a test asserts they agree.
ARCHETYPES = {
    "vine", "bush", "herb", "rosette", "spike", "sprawl", "root", "climber",
    "tree", "shrub", "cane", "grass", "mound", "stalk", "head",
}

# A crop needing more room than this between plants is not going on a balcony,
# whatever its group default says. Derived rather than hand-set: the group
# defaults had citrus and tropicals flagged container-friendly, which is true
# of a kumquat in a pot and nonsense for a 15ft avocado.
CONTAINER_MAX_SPACING_FT = 8.0

# `season` must stay one of these three: services/crop_scoring.py branches on
# it, and an unrecognised value silently takes the "all" path. Perennials are
# therefore "all" rather than a fourth value.
SEASONS = {"all", "cool", "warm"}

# group -> shared facts. (category, model, colour, sun hours, water, difficulty,
# season, container-friendly, cost per plant)
GROUPS = {
    "tomato":     ("fruiting-vegetable", "vine",    "#E2543F", 8, "medium-high", "medium", "warm", True,  4.50),
    "pepper":     ("fruiting-vegetable", "bush",    "#E0A32E", 8, "medium",      "medium", "warm", True,  4.00),
    "chilli":     ("fruiting-vegetable", "bush",    "#C3342B", 8, "medium",      "medium", "warm", True,  4.00),
    "eggplant":   ("fruiting-vegetable", "bush",    "#6B4A8C", 8, "medium",      "medium", "warm", True,  4.25),
    "squash":     ("vining-vegetable",   "sprawl",  "#5F9E48", 8, "medium-high", "easy",   "warm", False, 2.75),
    "wintersquash": ("vining-vegetable", "sprawl",  "#C87F35", 8, "medium",      "easy",   "warm", False, 2.75),
    "melon":      ("vining-vegetable",   "sprawl",  "#7FB069", 8, "medium-high", "medium", "warm", False, 3.00),
    "cucumber":   ("vining-vegetable",   "sprawl",  "#4F8F3C", 8, "high",        "easy",   "warm", True,  2.50),
    "beanbush":   ("legume",             "bush",    "#6DAA4E", 7, "medium",      "easy",   "warm", True,  1.20),
    "beanpole":   ("legume",             "climber", "#6DAA4E", 7, "medium",      "easy",   "warm", True,  1.20),
    "pea":        ("legume",             "climber", "#8CBF63", 6, "medium",      "easy",   "cool", True,  1.20),
    "brassica":   ("brassica",           "bush",    "#4E8C4A", 7, "medium-high", "medium", "cool", True,  2.60),
    "head":       ("brassica",           "head",    "#8FBF7A", 7, "medium-high", "medium", "cool", False, 2.60),
    "greens":     ("leafy-green",        "rosette", "#6FAE54", 5, "medium",      "easy",   "cool", True,  1.60),
    "lettuce":    ("leafy-green",        "rosette", "#8CC152", 5, "medium",      "easy",   "cool", True,  1.40),
    "allium":     ("allium",             "spike",   "#C9B47A", 7, "medium",      "easy",   "cool", True,  1.10),
    "root":       ("root",               "root",    "#D97B3F", 6, "medium",      "easy",   "cool", True,  1.00),
    "tuber":      ("root",               "mound",   "#C9A06B", 7, "medium",      "easy",   "warm", True,  1.80),
    "stalk":      ("stalk-vegetable",    "stalk",   "#9EBE6A", 6, "high",        "medium", "cool", False, 2.40),
    "perennialstalk": ("stalk-vegetable","stalk",   "#B4534B", 6, "medium",      "easy",   "all",  False, 9.00),
    "herb":       ("herb",               "herb",    "#4F7F45", 6, "medium",      "easy",   "all",  True,  3.20),
    "woodyherb":  ("herb",               "shrub",   "#6C7F5B", 7, "low",         "easy",   "all",  True,  5.50),
    "berrylow":   ("fruit",              "rosette", "#D33B4E", 7, "medium",      "easy",   "all",  True,  1.80),
    "berrybush":  ("fruit",              "shrub",   "#4B6FA8", 7, "medium",      "medium", "all",  True, 16.00),
    "bramble":    ("fruit",              "cane",    "#8C2F4A", 7, "medium",      "easy",   "all",  False, 12.00),
    "fruitvine":  ("fruit",              "climber", "#6E4B8C", 8, "medium",      "medium", "all",  False, 14.00),
    "fruittree":  ("fruit",              "tree",    "#C5473C", 8, "medium",      "medium", "all",  False, 38.00),
    "citrus":     ("fruit",              "tree",    "#E8A33D", 8, "medium",      "medium", "all",  True,  42.00),
    "nuttree":    ("fruit",              "tree",    "#9C7B4E", 8, "medium",      "hard",   "all",  False, 45.00),
    "tropical":   ("fruit",              "tree",    "#E4B84C", 8, "high",        "hard",   "warm", True,  35.00),
    "cereal":     ("grain",              "grass",   "#D9B45B", 8, "medium",      "easy",   "warm", False, 0.60),
    "flower":     ("edible-flower",      "bush",    "#E0713C", 6, "medium",      "easy",   "warm", True,  1.60),
}


# Produce colour, where the botanical group's default is wrong or too crowded.
#
# This drives the legend swatch, the 2D planner dot and the fruit/head colour
# in 3D, so a golden beet drawn carrot-orange or a red cabbage drawn green is
# a visible error rather than a detail. Crops whose group default is already
# right are not listed.
COLORS = {
    # roots: the group is carrot-orange, which most roots are not
    "golden-beet": "#D9A93C", "purple-carrot": "#6B3E7A", "turnip": "#E4DCCB",
    "rutabaga": "#C9A24E", "parsnip": "#E6DBBE", "celeriac": "#D8CBB0",
    "daikon": "#EDE7D8", "horseradish": "#E8E0CE", "watermelon-radish": "#C2426B",
    # tubers
    "sweet-potato": "#C4622E", "jicama": "#DCCFAE", "ginger": "#D9B87A",
    "turmeric": "#E09A33", "sunchoke": "#C2A878", "yacon": "#C98F55",
    "peanuts": "#CBB089",
    # brassica heads
    "red-cabbage": "#7A4A80", "napa-cabbage": "#C6D68C", "savoy-cabbage": "#6FA05C",
    "cauliflower": "#EDE6CF", "romanesco": "#A8C356", "kohlrabi": "#9BBF6F",
    "radicchio": "#A32F4E", "brussels-sprouts": "#5E8C4A",
    # leafy greens, pulled apart so fourteen of them are not one swatch
    "collard-greens": "#5E9B4C", "lacinato-kale": "#3F6B4F", "mustard-greens": "#7FB94A",
    "mizuna": "#86C25A", "komatsuna": "#6BB255", "tatsoi": "#4E8C48",
    "amaranth-greens": "#9C4A6B", "malabar-spinach": "#4C7F5E",
    "new-zealand-spinach": "#74A85C", "purslane": "#8CC46A", "orach": "#A8456B",
    "watercress": "#5CA86E", "turnip-greens": "#6BA84F", "sorrel": "#8CB84A",
    "endive": "#BFD98C", "escarole": "#A8C46B", "mache": "#7FB06A",
    "romaine": "#7FB84A", "butterhead": "#A8CF7A", "oakleaf": "#9C7A4A",
    "iceberg": "#C6DCA0", "celtuce": "#9EBE6A",
    # herbs
    "dill": "#7FA858", "chives": "#5E9B58", "garlic-chives": "#6BA05C",
    "chervil": "#86B06A", "epazote": "#5A8C4A", "lemon-balm": "#7FB25C",
    "holy-basil": "#486F42", "thai-basil": "#6B5A7A", "flat-leaf-parsley": "#4C8C4A",
    "stevia": "#6FA85C", "savory": "#7A9B5A", "lovage": "#5C8C4A",
    "rosemary": "#5E7A66", "sage": "#9EAE94", "thyme": "#7A8C63",
    "oregano": "#6F8C55", "marjoram": "#86A06F", "tarragon": "#7FA05C",
    "lavender": "#8C7FB5", "bay-laurel": "#46664A", "curry-leaf": "#4E7A45",
    "lemongrass": "#A8B884",
    # legumes
    "fava-beans": "#A8B86F", "edamame": "#8CBF5C", "lima-beans": "#C6CFA0",
    "chickpeas": "#D6C48C", "lentils": "#C4874A", "black-eyed-peas": "#E0D6BC",
    "runner-beans": "#C23A3A", "yardlong-beans": "#5E9B45", "snap-peas": "#8CBF63",
    "snow-peas": "#A8CF7A",
    # squash & melons
    "yellow-squash": "#E0C24A", "pattypan": "#DCD9A8", "butternut-squash": "#C9A05E",
    "acorn-squash": "#4E6B3C", "spaghetti-squash": "#D9C46B", "delicata-squash": "#E0C88C",
    "kabocha": "#3F5E3A", "pumpkin": "#D9772E", "sugar-pumpkin": "#D9822E",
    "watermelon": "#D9425C", "cantaloupe": "#E0A05C", "honeydew": "#CFD98C",
    "bitter-melon": "#7FA84A", "luffa": "#8CA85C", "lemon-cucumber": "#E0D45C",
    "armenian-cucumber": "#7FA84A", "pickling-cucumber": "#46803A",
    # grains
    "popcorn": "#E0C24A", "flour-corn": "#C9A85E", "sorghum": "#B5623A",
    "quinoa": "#C4707A", "buckwheat": "#E4DCC6", "wheat": "#D9BE72",
    "barley": "#CFB56A", "oats": "#DCC583", "rye": "#C4AE72", "millet": "#D9C06B",
    "sesame": "#E6DCC4",
    # fruit that would otherwise share the generic apple red
    "fig": "#6B4A6B", "dwarf-apple": "#C94A3F", "sweet-corn": "#E8C247",
    # tomato relatives
    "roma-tomato": "#C4402F", "beefsteak-tomato": "#D14434", "grape-tomato": "#E0603F",
    "tomatillo": "#8CA84A", "ground-cherry": "#D9B04A",
    # peppers
    "mini-sweet-pepper": "#D9452E", "banana-pepper": "#E8D14A", "poblano": "#3F6B3A",
    "serrano": "#4E8C3A", "cayenne": "#C22E22", "habanero": "#E0762A",
    "shishito": "#5E9B45", "thai-chilli": "#C4231C", "padron": "#4E8C42",
    "japanese-eggplant": "#5A3A73",
}

# The crops that existed before this library was expanded, pinned to the values
# they shipped with.
#
# Those numbers were tuned by hand, their colours were chosen deliberately
# (chard has red stems; a jalapeño is picked green), and other things are built
# on them: tests/test_growth_schedule.py documents "spinach matures in 30
# days", and frontend/lib/fallback.json is a captured response using these
# figures. Group defaults are a reasonable way to fill in 200 new crops and a
# bad reason to silently re-tune 26 working ones.
PINNED = {
    "arugula": dict(spacing=0.5, height=0.8, days=30, yield_lb=0.35, cost=0.35, price=9.0, sun=4, water='medium', difficulty='easy', season='cool', color='#6BA368', container=True, category='leafy-green'),
    "basil": dict(spacing=1.0, height=1.5, days=40, yield_lb=1.2, cost=1.5, price=16.0, sun=6, water='medium', difficulty='easy', season='warm', color='#4F9D5B', container=True, category='herb'),
    "beet": dict(spacing=0.4, height=1.2, days=55, yield_lb=0.4, cost=0.2, price=2.6, sun=6, water='medium', difficulty='easy', season='cool', color='#8E3B58', container=True, category='root'),
    "bell-pepper": dict(spacing=1.5, height=2.5, days=80, yield_lb=4.0, cost=4.0, price=3.2, sun=8, water='medium', difficulty='medium', season='warm', color='#D9A441', container=True, category='fruiting-vegetable'),
    "bok-choy": dict(spacing=0.75, height=1.0, days=45, yield_lb=0.9, cost=0.6, price=3.5, sun=5, water='medium', difficulty='easy', season='cool', color='#7FB069', container=True, category='leafy-green'),
    "broccoli": dict(spacing=1.5, height=2.0, days=75, yield_lb=1.2, cost=1.2, price=2.8, sun=6, water='medium', difficulty='medium', season='cool', color='#4A7C4E', container=True, category='brassica'),
    "carrot": dict(spacing=0.35, height=1.0, days=70, yield_lb=0.25, cost=0.15, price=1.6, sun=6, water='medium', difficulty='medium', season='cool', color='#D97B29', container=True, category='root'),
    "cherry-tomato": dict(spacing=1.75, height=4.5, days=60, yield_lb=9.0, cost=4.0, price=4.0, sun=8, water='medium-high', difficulty='easy', season='warm', color='#EF7A5C', container=True, category='fruiting-vegetable'),
    "cilantro": dict(spacing=0.75, height=1.5, days=35, yield_lb=0.6, cost=0.75, price=12.0, sun=5, water='medium', difficulty='easy', season='cool', color='#6FBF73', container=True, category='herb'),
    "cucumber": dict(spacing=2.0, height=2.0, days=58, yield_lb=8.0, cost=2.5, price=2.0, sun=7, water='high', difficulty='medium', season='warm', color='#4C8F52', container=False, category='vining-vegetable'),
    "eggplant": dict(spacing=2.0, height=3.0, days=80, yield_lb=4.0, cost=4.0, price=2.8, sun=8, water='medium', difficulty='medium', season='warm', color='#6B4A83', container=True, category='fruiting-vegetable'),
    "garlic": dict(spacing=0.5, height=2.0, days=240, yield_lb=0.15, cost=0.3, price=6.0, sun=6, water='low', difficulty='easy', season='cool', color='#CFC6A8', container=True, category='allium'),
    "green-beans": dict(spacing=0.5, height=5.0, days=55, yield_lb=0.9, cost=0.2, price=3.0, sun=6, water='medium', difficulty='easy', season='warm', color='#5C9B4A', container=True, category='legume'),
    "green-onion": dict(spacing=0.33, height=1.2, days=55, yield_lb=0.15, cost=0.25, price=8.0, sun=5, water='low', difficulty='easy', season='all', color='#5BA86B', container=True, category='allium'),
    "jalapeno": dict(spacing=1.5, height=3.0, days=75, yield_lb=3.5, cost=3.5, price=3.5, sun=8, water='medium', difficulty='easy', season='warm', color='#3F7D45', container=True, category='fruiting-vegetable'),
    "kale": dict(spacing=1.25, height=2.0, days=55, yield_lb=2.5, cost=1.0, price=5.0, sun=5, water='medium', difficulty='easy', season='cool', color='#3D6B48', container=True, category='leafy-green'),
    "lettuce": dict(spacing=0.75, height=0.8, days=45, yield_lb=0.8, cost=0.5, price=4.5, sun=4, water='medium', difficulty='easy', season='cool', color='#7CC47F', container=True, category='leafy-green'),
    "mint": dict(spacing=1.0, height=1.5, days=40, yield_lb=1.0, cost=1.5, price=14.0, sun=4, water='medium', difficulty='easy', season='all', color='#5FBF8A', container=True, category='herb'),
    "parsley": dict(spacing=0.75, height=1.2, days=45, yield_lb=0.8, cost=1.0, price=11.0, sun=5, water='medium', difficulty='easy', season='all', color='#4C9152', container=True, category='herb'),
    "peas": dict(spacing=0.4, height=4.0, days=60, yield_lb=0.5, cost=0.2, price=4.0, sun=5, water='medium', difficulty='easy', season='cool', color='#83B85C', container=True, category='legume'),
    "radish": dict(spacing=0.25, height=0.7, days=25, yield_lb=0.12, cost=0.1, price=3.0, sun=5, water='medium', difficulty='easy', season='cool', color='#D14B60', container=True, category='root'),
    "spinach": dict(spacing=0.5, height=0.8, days=30, yield_lb=0.4, cost=0.4, price=6.0, sun=4, water='medium', difficulty='easy', season='cool', color='#2F6B3A', container=True, category='leafy-green'),
    "strawberry": dict(spacing=1.0, height=0.8, days=90, yield_lb=1.0, cost=2.5, price=4.5, sun=7, water='medium', difficulty='medium', season='warm', color='#D8434F', container=True, category='fruit'),
    "swiss-chard": dict(spacing=1.0, height=1.8, days=50, yield_lb=2.0, cost=0.8, price=4.5, sun=5, water='medium', difficulty='easy', season='all', color='#C4553B', container=True, category='leafy-green'),
    "tomato": dict(spacing=2.0, height=5.0, days=70, yield_lb=12.0, cost=4.5, price=2.5, sun=8, water='medium-high', difficulty='medium', season='warm', color='#E2543F', container=True, category='fruiting-vegetable'),
    "zucchini": dict(spacing=2.5, height=2.5, days=50, yield_lb=9.0, cost=2.0, price=2.2, sun=7, water='high', difficulty='easy', season='warm', color='#3F7A3D', container=False, category='vining-vegetable'),
}

# (id, name, group, spacing_ft, height_ft, days, yield_lb, price_per_lb, description, *overrides)
# `overrides` is an optional dict for the rare crop that breaks its group.
ROWS = [
    # --- tomatoes & relatives ------------------------------------------
    ("tomato", "Tomato", "tomato", 2.0, 5.0, 70, 12.0, 2.50, "High-value staple that anchors most household gardens. Needs staking and steady water."),
    ("cherry-tomato", "Cherry Tomato", "tomato", 1.75, 4.5, 60, 9.0, 4.00, "Earlier and far more forgiving than a slicer, and it keeps cropping until frost.", {"difficulty": "easy"}),
    ("roma-tomato", "Roma Tomato", "tomato", 1.75, 4.0, 75, 11.0, 2.30, "Dense, low-seed paste tomato — the one to grow if you cook sauce."),
    ("beefsteak-tomato", "Beefsteak Tomato", "tomato", 2.5, 6.0, 85, 14.0, 2.90, "Big slicing fruit on a heavy vine. Wants the longest, warmest season you have."),
    ("grape-tomato", "Grape Tomato", "tomato", 1.75, 4.5, 62, 8.5, 4.40, "Sweet, firm and almost unkillable in a container."),
    ("tomatillo", "Tomatillo", "tomato", 2.5, 4.0, 75, 8.0, 3.20, "Husked fruit for salsa verde. Plant two — a lone plant sets almost nothing."),
    ("ground-cherry", "Ground Cherry", "tomato", 2.0, 2.0, 70, 3.5, 6.00, "Sweet husked berries that drop when ripe. Sprawls more than it stands.", {"model": "sprawl"}),
    # --- peppers --------------------------------------------------------
    ("bell-pepper", "Bell Pepper", "pepper", 1.5, 2.5, 75, 4.0, 3.50, "Sweet peppers ripen from green to red and get sweeter as they do."),
    ("mini-sweet-pepper", "Mini Sweet Pepper", "pepper", 1.25, 2.0, 70, 3.0, 4.60, "Small sweet peppers in quantity — heavy croppers for their size."),
    ("banana-pepper", "Banana Pepper", "pepper", 1.25, 2.0, 70, 3.5, 3.40, "Mild, tangy and productive; good pickled."),
    ("poblano", "Poblano", "chilli", 1.5, 2.5, 78, 3.5, 3.60, "Mild chilli with walls thick enough to stuff and roast."),
    ("jalapeno", "Jalapeño", "chilli", 1.25, 2.5, 70, 3.0, 4.00, "Reliable, compact and hot. One plant covers most households."),
    ("serrano", "Serrano", "chilli", 1.25, 2.5, 75, 2.5, 5.00, "Hotter and thinner-walled than a jalapeño, and just as easy."),
    ("cayenne", "Cayenne", "chilli", 1.25, 2.5, 75, 2.0, 6.00, "Long thin chillies that dry well for flakes and powder."),
    ("habanero", "Habanero", "chilli", 1.5, 2.5, 95, 2.0, 9.00, "Fiercely hot and slow to ripen; needs a long warm season.", {"difficulty": "hard"}),
    ("shishito", "Shishito", "chilli", 1.25, 2.0, 65, 2.5, 8.00, "Blister them whole. Mostly mild, with the occasional hot surprise."),
    ("thai-chilli", "Thai Chilli", "chilli", 1.25, 2.0, 85, 1.5, 10.00, "Tiny, very hot, and ornamental enough for a patio pot."),
    ("padron", "Padrón", "chilli", 1.25, 2.0, 68, 2.5, 9.00, "Picked small and fried; left on the plant they turn fiery."),
    # --- aubergines -----------------------------------------------------
    ("eggplant", "Eggplant", "eggplant", 2.0, 3.0, 80, 6.0, 2.80, "Glossy fruit on a sturdy bush. Wants heat and hates wet feet."),
    ("japanese-eggplant", "Japanese Eggplant", "eggplant", 1.75, 3.0, 70, 5.0, 3.40, "Slender, thin-skinned and quicker than a globe type."),
    # --- cucurbits: summer squash --------------------------------------
    ("zucchini", "Zucchini", "squash", 2.5, 2.5, 50, 14.0, 1.80, "Absurdly productive. Two plants will feed a street."),
    ("yellow-squash", "Yellow Squash", "squash", 2.5, 2.5, 50, 12.0, 1.90, "Crookneck summer squash, as prolific as zucchini."),
    ("pattypan", "Pattypan Squash", "squash", 2.5, 2.0, 52, 10.0, 2.40, "Scalloped little squash; pick them small."),
    ("cucumber", "Cucumber", "cucumber", 1.5, 6.0, 55, 8.0, 1.80, "Climbs happily on a trellis, which keeps the fruit clean and straight.", {"model": "climber"}),
    ("pickling-cucumber", "Pickling Cucumber", "cucumber", 1.5, 5.0, 52, 9.0, 1.90, "Short, bumpy fruit bred for jars. Pick every other day.", {"model": "climber"}),
    ("lemon-cucumber", "Lemon Cucumber", "cucumber", 1.5, 5.0, 58, 6.0, 2.60, "Round, pale and mild — easier on the stomach than a slicer.", {"model": "climber"}),
    ("armenian-cucumber", "Armenian Cucumber", "cucumber", 2.0, 6.0, 60, 8.0, 2.40, "Actually a melon; long ribbed fruit that shrugs off heat.", {"model": "climber"}),
    # --- cucurbits: winter squash & pumpkins ---------------------------
    ("butternut-squash", "Butternut Squash", "wintersquash", 4.0, 2.0, 105, 12.0, 1.40, "Stores for months and tastes better for it."),
    ("acorn-squash", "Acorn Squash", "wintersquash", 4.0, 2.0, 90, 9.0, 1.50, "Compact winter squash; one fruit is a dinner for two."),
    ("spaghetti-squash", "Spaghetti Squash", "wintersquash", 4.0, 2.0, 95, 11.0, 1.40, "Flesh pulls into strands when roasted."),
    ("delicata-squash", "Delicata Squash", "wintersquash", 3.5, 2.0, 90, 8.0, 2.00, "Thin edible skin, sweet flesh, shorter storage than most."),
    ("kabocha", "Kabocha Squash", "wintersquash", 4.5, 2.0, 100, 12.0, 1.70, "Dense and chestnut-sweet; a sprawling vine."),
    ("pumpkin", "Pumpkin", "wintersquash", 5.0, 2.0, 110, 20.0, 0.80, "Needs real room. Grow it for the season rather than the savings."),
    ("sugar-pumpkin", "Sugar Pumpkin", "wintersquash", 4.0, 2.0, 100, 12.0, 1.20, "Small pie pumpkin — actually worth cooking, unlike the big carving sort."),
    # --- cucurbits: melons ---------------------------------------------
    ("watermelon", "Watermelon", "melon", 5.0, 1.5, 85, 22.0, 0.60, "Wants heat, room and patience. Thin to two fruit per vine."),
    ("cantaloupe", "Cantaloupe", "melon", 4.0, 1.5, 80, 12.0, 1.10, "Ready when it slips from the stem and smells like itself."),
    ("honeydew", "Honeydew", "melon", 4.0, 1.5, 90, 12.0, 1.30, "Longer season than a cantaloupe and less forgiving."),
    ("bitter-melon", "Bitter Melon", "melon", 2.0, 7.0, 75, 7.0, 2.60, "Vigorous trellis vine; harvest young for less bitterness.", {"model": "climber"}),
    ("luffa", "Luffa", "melon", 2.5, 10.0, 120, 6.0, 3.00, "Eat it young or dry it into a sponge. Needs a very long season.", {"model": "climber", "difficulty": "hard"}),
    # --- legumes --------------------------------------------------------
    ("green-beans", "Green Beans", "beanpole", 0.5, 7.0, 55, 1.4, 3.20, "Pole beans crop for weeks from a small footprint. The best use of vertical space."),
    ("bush-beans", "Bush Beans", "beanbush", 0.5, 2.0, 52, 0.8, 3.20, "One concentrated flush, no trellis. Sow a second batch three weeks later."),
    ("runner-beans", "Runner Beans", "beanpole", 0.75, 8.0, 70, 1.6, 3.40, "Tall, scarlet-flowered and edible — the prettiest way to screen a fence."),
    ("yardlong-beans", "Yardlong Beans", "beanpole", 0.75, 9.0, 70, 1.8, 3.60, "Thrives in heat that stops ordinary beans."),
    ("lima-beans", "Lima Beans", "beanpole", 0.75, 8.0, 80, 1.2, 4.00, "Needs a long warm season to fill its pods."),
    ("fava-beans", "Fava Beans", "beanbush", 0.75, 3.5, 80, 1.2, 4.20, "Sown in cold soil; also fixes nitrogen for whatever follows.", {"season": "cool"}),
    ("edamame", "Edamame", "beanbush", 0.5, 2.5, 80, 1.0, 4.40, "Soybeans picked green. Harvest the whole plant at once."),
    ("snap-peas", "Snap Peas", "pea", 0.5, 5.0, 60, 1.0, 4.00, "Eat pod and all. The first thing worth picking each spring."),
    ("snow-peas", "Snow Peas", "pea", 0.5, 5.0, 58, 0.9, 4.20, "Flat pods for stir-fries; pick before the peas swell."),
    ("peas", "Shelling Peas", "pea", 0.5, 4.0, 62, 0.6, 3.80, "Sweetest within minutes of picking, which is the whole argument for growing them."),
    ("black-eyed-peas", "Black-Eyed Peas", "beanbush", 0.75, 2.5, 80, 1.0, 3.00, "Heat- and drought-tolerant southern pea.", {"water": "low"}),
    ("peanuts", "Peanuts", "tuber", 1.0, 1.5, 130, 1.0, 3.80, "Pegs down into the soil and ripens underground. Needs a long warm season."),
    ("lentils", "Lentils", "beanbush", 0.4, 1.5, 100, 0.3, 2.40, "Low yield for the space, but drought-hardy and easy.", {"water": "low"}),
    ("chickpeas", "Chickpeas", "beanbush", 0.75, 2.0, 100, 0.5, 2.60, "Two seeds a pod, so plant more than feels sensible.", {"water": "low"}),
    # --- brassicas: heads ----------------------------------------------
    ("cabbage", "Cabbage", "head", 1.5, 1.2, 80, 4.0, 1.20, "One big head per plant; stores for weeks in the cold."),
    ("red-cabbage", "Red Cabbage", "head", 1.5, 1.2, 90, 4.0, 1.60, "Slower than green cabbage and holds its colour when cooked with acid."),
    ("napa-cabbage", "Napa Cabbage", "head", 1.25, 1.5, 70, 4.0, 1.50, "Upright barrel-shaped head; the one for kimchi."),
    ("savoy-cabbage", "Savoy Cabbage", "head", 1.5, 1.2, 90, 4.0, 1.70, "Crinkled leaves, sweeter after a frost."),
    ("cauliflower", "Cauliflower", "head", 1.5, 1.5, 80, 2.5, 2.40, "The fussiest brassica — it wants steady moisture and cool weather throughout.", {"difficulty": "hard"}),
    ("romanesco", "Romanesco", "head", 1.75, 1.5, 90, 2.5, 3.40, "Fractal lime-green head; grows like a slow cauliflower."),
    ("kohlrabi", "Kohlrabi", "head", 0.75, 1.0, 55, 1.5, 2.20, "Swollen stem above ground, crisp and mild. Pick before it turns woody."),
    ("broccoli", "Broccoli", "brassica", 1.5, 2.0, 70, 1.5, 2.60, "One main head, then weeks of side shoots if you keep cutting."),
    ("broccolini", "Broccolini", "brassica", 1.25, 2.0, 60, 1.2, 4.00, "All side shoots, no big head. Longer picking window than broccoli."),
    ("brussels-sprouts", "Brussels Sprouts", "brassica", 2.0, 3.0, 100, 2.0, 3.00, "A long season crop that only gets sweet after frost.", {"model": "stalk"}),
    ("chinese-broccoli", "Chinese Broccoli", "brassica", 1.0, 1.5, 55, 1.2, 3.20, "Gai lan — stems and leaves both, slightly bitter."),
    # --- brassicas: greens ---------------------------------------------
    ("kale", "Kale", "greens", 1.5, 2.0, 55, 2.5, 3.20, "Pick the lower leaves and it keeps going for months, right through frost."),
    ("lacinato-kale", "Lacinato Kale", "greens", 1.5, 2.5, 60, 2.5, 3.60, "Dark strappy leaves, better texture than curly kale."),
    ("collard-greens", "Collard Greens", "greens", 1.75, 2.5, 65, 3.5, 2.40, "Tougher and more heat-tolerant than kale."),
    ("mustard-greens", "Mustard Greens", "greens", 1.0, 1.5, 45, 1.5, 2.80, "Peppery and fast. Bolts the moment it gets warm."),
    ("bok-choy", "Bok Choy", "greens", 0.75, 1.0, 45, 1.2, 2.60, "Fast, compact and shade-tolerant — good for a second crop."),
    ("tatsoi", "Tatsoi", "greens", 0.75, 0.5, 45, 0.8, 3.40, "Flat spoon-leaved rosette; very cold hardy."),
    ("mizuna", "Mizuna", "greens", 0.75, 1.0, 40, 1.0, 3.60, "Feathery mild mustard, cuts and regrows."),
    ("komatsuna", "Komatsuna", "greens", 0.75, 1.0, 40, 1.2, 3.20, "Japanese mustard spinach — quick and unfussy."),
    ("arugula", "Arugula", "greens", 0.5, 1.0, 35, 0.6, 6.00, "Ready in a month, expensive in shops, and peppery enough to matter."),
    ("watercress", "Watercress", "greens", 0.5, 0.75, 50, 0.8, 7.00, "Wants constantly wet roots; happiest in a tray of water.", {"water": "high"}),
    ("turnip-greens", "Turnip Greens", "greens", 0.75, 1.2, 40, 1.2, 2.60, "Grown for the tops rather than the root."),
    # --- leafy greens ---------------------------------------------------
    ("lettuce", "Lettuce", "lettuce", 0.75, 0.8, 45, 1.2, 3.00, "Cut-and-come-again leaves for weeks. The easiest win in a small bed."),
    ("romaine", "Romaine", "lettuce", 0.9, 1.0, 55, 1.5, 2.80, "Upright crisp hearts; more heat-tolerant than butterhead."),
    ("butterhead", "Butterhead Lettuce", "lettuce", 0.8, 0.7, 50, 1.0, 3.60, "Soft loose heads, quick to bolt in heat."),
    ("oakleaf", "Oakleaf Lettuce", "lettuce", 0.75, 0.7, 45, 1.0, 3.80, "Lobed tender leaves that stand picking over and over."),
    ("iceberg", "Iceberg Lettuce", "lettuce", 1.0, 0.8, 70, 1.8, 1.80, "Slow and thirsty for what it gives back, but it is what a wedge salad needs.", {"water": "medium-high"}),
    ("spinach", "Spinach", "greens", 0.5, 0.8, 40, 0.8, 4.00, "Fast, cold-hardy and expensive to buy — one of the best value crops there is."),
    ("swiss-chard", "Swiss Chard", "greens", 1.0, 2.0, 55, 3.0, 3.20, "Harvest outer stalks all season. Handles both heat and frost.", {"season": "all"}),
    ("endive", "Endive", "lettuce", 1.0, 1.0, 60, 1.2, 3.40, "Bitter frilly heads; blanch the centre to soften the flavour."),
    ("escarole", "Escarole", "lettuce", 1.0, 1.0, 60, 1.4, 3.20, "Broad-leaved endive, better cooked than raw."),
    ("radicchio", "Radicchio", "head", 1.0, 0.8, 75, 1.0, 4.40, "Red chicory that only colours up properly in the cold."),
    ("sorrel", "Sorrel", "greens", 1.0, 1.5, 60, 1.2, 5.00, "Sharp lemony leaves from a plant that comes back each year.", {"season": "all"}),
    ("malabar-spinach", "Malabar Spinach", "greens", 1.0, 8.0, 70, 3.0, 4.00, "A climbing heat-lover for when real spinach has bolted.", {"model": "climber", "season": "warm"}),
    ("new-zealand-spinach", "New Zealand Spinach", "greens", 1.5, 1.0, 60, 2.5, 4.00, "Sprawling, salty-sweet and unbothered by summer.", {"model": "sprawl", "season": "warm"}),
    ("amaranth-greens", "Amaranth Greens", "greens", 1.0, 3.0, 45, 2.0, 3.40, "Grown for tender leaves in the heat; the grain type gets much taller.", {"season": "warm"}),
    ("purslane", "Purslane", "greens", 0.75, 0.5, 40, 0.8, 4.60, "Succulent, lemony and drought-proof. Often pulled up as a weed.", {"model": "sprawl", "water": "low"}),
    ("orach", "Orach", "greens", 1.0, 4.0, 50, 1.5, 4.00, "Magenta mountain spinach; holds longer than spinach before bolting."),
    ("mache", "Mâche", "lettuce", 0.4, 0.4, 50, 0.4, 8.00, "Corn salad — tiny nutty rosettes that survive real winter."),
    # --- alliums --------------------------------------------------------
    ("onion", "Onion", "allium", 0.5, 1.5, 100, 0.7, 1.40, "Cheap to buy, but homegrown keeps far longer. Day length decides the variety."),
    ("red-onion", "Red Onion", "allium", 0.5, 1.5, 100, 0.7, 1.80, "Milder than a yellow onion and stores nearly as well."),
    ("sweet-onion", "Sweet Onion", "allium", 0.6, 1.5, 110, 0.9, 2.00, "Low-sulphur and juicy; poor keeper, eat it first."),
    ("shallot", "Shallot", "allium", 0.5, 1.2, 100, 0.5, 4.00, "One planted bulb becomes a cluster. Expensive in shops."),
    ("garlic", "Garlic", "allium", 0.5, 2.0, 240, 0.3, 8.00, "In the ground almost a year, but it asks nothing of you for most of it."),
    ("elephant-garlic", "Elephant Garlic", "allium", 0.75, 3.0, 240, 0.6, 6.00, "Huge mild cloves; botanically closer to a leek."),
    ("green-onion", "Green Onion", "allium", 0.25, 1.5, 60, 0.2, 6.00, "Regrows from the base after cutting, so one sowing lasts months."),
    ("chives", "Chives", "herb", 0.5, 1.0, 80, 0.4, 12.00, "Perennial, ignores neglect, and flowers are edible too.", {"season": "all"}),
    ("garlic-chives", "Garlic Chives", "herb", 0.5, 1.2, 80, 0.4, 12.00, "Flat leaves with a mild garlic flavour; spreads if you let it.", {"season": "all"}),
    ("leek", "Leek", "stalk", 0.5, 2.5, 120, 0.8, 2.80, "Long season, but it sits happily in frozen ground until you want it."),
    ("walking-onion", "Egyptian Walking Onion", "allium", 0.75, 3.0, 90, 0.4, 5.00, "Sets bulbils on top that flop over and replant themselves.", {"season": "all"}),
    ("ramps", "Ramps", "allium", 0.5, 0.8, 730, 0.2, 20.00, "Wild leeks. Years to establish, and shade is a requirement not a tolerance.", {"difficulty": "hard", "sun": 3, "season": "all"}),
    # --- roots ----------------------------------------------------------
    ("carrot", "Carrot", "root", 0.25, 1.0, 70, 0.25, 1.60, "Wants loose stone-free soil; a raised bed is close to ideal."),
    ("purple-carrot", "Purple Carrot", "root", 0.25, 1.0, 75, 0.25, 3.00, "Same growing, more money per pound, and it keeps its colour raw."),
    ("beet", "Beet", "root", 0.35, 1.2, 55, 0.4, 2.20, "Two crops in one — roots and the leaves, which are as good as chard."),
    ("golden-beet", "Golden Beet", "root", 0.35, 1.2, 55, 0.4, 3.00, "Sweeter and milder than red, and it does not stain everything."),
    ("radish", "Radish", "root", 0.2, 0.6, 28, 0.1, 2.80, "Four weeks from seed to plate. The fastest thing in the garden."),
    ("daikon", "Daikon", "root", 0.5, 2.0, 60, 1.5, 1.60, "Large mild winter radish; needs deep soil."),
    ("watermelon-radish", "Watermelon Radish", "root", 0.4, 1.0, 60, 0.5, 4.40, "Green outside, magenta in. Slower and milder than a breakfast radish."),
    ("turnip", "Turnip", "root", 0.5, 1.2, 50, 0.6, 1.60, "Roots and tops both usable; best picked small."),
    ("rutabaga", "Rutabaga", "root", 0.75, 1.5, 90, 1.5, 1.40, "Sweet dense winter keeper. Slower than a turnip."),
    ("parsnip", "Parsnip", "root", 0.4, 1.5, 120, 0.6, 2.40, "Slow to germinate, slow to grow, and much sweeter after a frost."),
    ("celeriac", "Celeriac", "root", 0.75, 1.5, 110, 1.2, 3.00, "Knobbly celery root; long season, worth it for winter soups."),
    ("horseradish", "Horseradish", "root", 1.5, 3.0, 180, 1.5, 6.00, "Plant it once and you have it forever, whether you want it or not.", {"season": "all"}),
    ("sunchoke", "Sunchoke", "tuber", 1.5, 8.0, 130, 3.0, 4.00, "Jerusalem artichoke — enormous, unkillable, and it will spread.", {"season": "all", "model": "grass"}),
    ("ginger", "Ginger", "tuber", 1.0, 2.5, 240, 1.0, 4.00, "Needs warmth, humidity and patience; grows well in a big pot.", {"difficulty": "hard"}),
    ("turmeric", "Turmeric", "tuber", 1.0, 3.0, 270, 1.0, 7.00, "Same conditions as ginger, and the same very long wait.", {"difficulty": "hard"}),
    ("jicama", "Jicama", "tuber", 1.0, 8.0, 150, 3.0, 2.20, "Crisp sweet root on a long vine. Only the root is edible.", {"difficulty": "hard"}),
    ("potato", "Potato", "tuber", 1.0, 2.0, 90, 4.0, 1.00, "Cheap to buy, but a good crop in poor soil and forgiving of neglect."),
    ("sweet-potato", "Sweet Potato", "tuber", 1.25, 1.0, 110, 4.0, 1.40, "Sprawling vines, heat-loving, and the leaves are edible too."),
    ("yacon", "Yacon", "tuber", 2.0, 6.0, 180, 6.0, 3.50, "Sweet crunchy tubers that taste closer to fruit than potato.", {"difficulty": "hard"}),
    # --- stalks & perennial vegetables ---------------------------------
    ("celery", "Celery", "stalk", 0.75, 2.0, 100, 1.5, 1.60, "Thirsty and slow. Homegrown is darker, stronger and never stringy if watered."),
    ("celtuce", "Celtuce", "stalk", 0.75, 2.5, 80, 1.2, 4.00, "Grown for a thick crisp stem rather than its leaves."),
    ("fennel", "Fennel", "stalk", 1.0, 2.5, 90, 1.2, 3.00, "Sweet aniseed bulb; bolts if it dries out or gets warm."),
    ("rhubarb", "Rhubarb", "perennialstalk", 3.0, 3.0, 365, 4.0, 3.40, "Crops for decades from one crown. Leaves are poisonous, stalks are not."),
    ("asparagus", "Asparagus", "perennialstalk", 1.25, 4.0, 730, 0.6, 5.00, "Three years before a real harvest, then twenty more. The longest game here."),
    ("cardoon", "Cardoon", "perennialstalk", 3.0, 5.0, 150, 3.0, 4.00, "Artichoke relative grown for blanched stalks. Architectural and huge."),
    ("artichoke", "Globe Artichoke", "perennialstalk", 3.0, 4.0, 180, 3.0, 3.20, "Edible flower buds from a silver thistle. Perennial in mild winters.", {"model": "head", "color": "#7C8F6B"}),
    ("lemongrass", "Lemongrass", "stalk", 1.5, 4.0, 120, 2.0, 5.00, "A clumping grass; cut stalks as you need them.", {"model": "grass", "season": "warm"}),
    # --- herbs ----------------------------------------------------------
    ("basil", "Basil", "herb", 1.0, 2.0, 60, 0.8, 20.00, "Absurd value per square foot — supermarket packets are tiny and expensive."),
    ("thai-basil", "Thai Basil", "herb", 1.0, 2.0, 60, 0.8, 22.00, "Anise-scented and sturdier in heat than sweet basil."),
    ("holy-basil", "Holy Basil", "herb", 1.0, 2.0, 65, 0.7, 24.00, "Tulsi — grown as much for tea as for cooking."),
    ("cilantro", "Cilantro", "herb", 0.5, 1.5, 45, 0.4, 18.00, "Bolts fast in heat, so sow a little every few weeks rather than all at once.", {"season": "cool"}),
    ("parsley", "Parsley", "herb", 0.75, 1.2, 70, 0.8, 14.00, "Slow to start, then productive for a full year in mild climates."),
    ("flat-leaf-parsley", "Flat-Leaf Parsley", "herb", 0.75, 1.5, 70, 0.9, 14.00, "Stronger flavour than curly, and easier to chop."),
    ("dill", "Dill", "herb", 0.75, 3.0, 55, 0.6, 16.00, "Self-seeds readily and draws in beneficial insects."),
    ("mint", "Mint", "herb", 1.0, 2.0, 60, 1.2, 16.00, "Vigorous to the point of invasive. Keep it in a pot, always.", {"season": "all"}),
    ("peppermint", "Peppermint", "herb", 1.0, 2.0, 60, 1.2, 16.00, "Stronger and cooler than spearmint; spreads just as aggressively.", {"season": "all"}),
    ("spearmint", "Spearmint", "herb", 1.0, 2.0, 60, 1.2, 15.00, "The mint for tea and tabbouleh. Contain the roots.", {"season": "all"}),
    ("oregano", "Oregano", "woodyherb", 1.0, 1.5, 80, 0.6, 22.00, "Drought-tolerant perennial that gets stronger in poor soil."),
    ("marjoram", "Marjoram", "woodyherb", 0.75, 1.0, 70, 0.5, 24.00, "Sweeter and gentler than oregano; tender in hard winters."),
    ("thyme", "Thyme", "woodyherb", 0.75, 1.0, 90, 0.4, 30.00, "Tiny leaves, huge shelf price, and it thrives on being ignored."),
    ("rosemary", "Rosemary", "woodyherb", 2.0, 4.0, 120, 1.5, 24.00, "Woody evergreen shrub in mild climates; hates wet roots."),
    ("sage", "Sage", "woodyherb", 1.5, 2.0, 90, 0.8, 24.00, "Silvery perennial; one plant is more than any kitchen needs."),
    ("tarragon", "Tarragon", "woodyherb", 1.5, 2.0, 90, 0.5, 34.00, "French tarragon has to be grown from division, not seed."),
    ("lavender", "Lavender", "woodyherb", 2.0, 2.5, 120, 0.6, 26.00, "Culinary as well as ornamental. Needs sharp drainage and sun."),
    ("chervil", "Chervil", "herb", 0.5, 1.2, 50, 0.4, 26.00, "Delicate anise notes; prefers shade and cool weather.", {"sun": 4, "season": "cool"}),
    ("savory", "Summer Savory", "herb", 0.75, 1.5, 60, 0.5, 24.00, "Peppery and traditional with beans."),
    ("lovage", "Lovage", "herb", 2.0, 5.0, 90, 1.5, 18.00, "Tastes like intense celery and returns every year, taller each time.", {"season": "all"}),
    ("borage", "Borage", "flower", 1.5, 3.0, 55, 0.8, 12.00, "Cucumber-flavoured leaves and blue flowers bees cannot leave alone.", {"color": "#5C7FC4"}),
    ("lemon-balm", "Lemon Balm", "herb", 1.5, 2.0, 70, 1.0, 16.00, "Lemony and perennial; self-seeds everywhere if allowed.", {"season": "all"}),
    ("shiso", "Shiso", "herb", 1.0, 2.5, 70, 0.8, 22.00, "Perilla — minty, anise-like, and it self-sows freely.", {"color": "#7A4A6B"}),
    ("epazote", "Epazote", "herb", 1.0, 3.0, 70, 0.6, 20.00, "Pungent Mexican herb cooked with beans."),
    ("stevia", "Stevia", "herb", 1.0, 2.0, 90, 0.5, 30.00, "Leaves are intensely sweet fresh or dried."),
    ("chamomile", "Chamomile", "flower", 0.75, 1.5, 65, 0.4, 30.00, "Daisy flowers for tea; German chamomile is the annual one.", {"color": "#EDE3B8"}),
    ("anise-hyssop", "Anise Hyssop", "flower", 1.5, 3.0, 80, 0.6, 22.00, "Liquorice-scented leaves, purple spikes, adored by pollinators.", {"color": "#8C6FB5", "season": "all"}),
    ("bay-laurel", "Bay Laurel", "woodyherb", 3.0, 8.0, 365, 0.5, 40.00, "A slow evergreen tree in a pot; a handful of leaves lasts a year.", {"model": "tree"}),
    ("curry-leaf", "Curry Leaf", "woodyherb", 2.5, 7.0, 365, 0.8, 40.00, "Tender tree, container-grown outside the tropics.", {"model": "tree", "difficulty": "hard"}),
    ("kaffir-lime-leaf", "Makrut Lime", "citrus", 4.0, 8.0, 365, 1.0, 30.00, "Grown for its double leaves more than its fruit."),
    # --- berries --------------------------------------------------------
    ("strawberry", "Strawberry", "berrylow", 1.0, 0.7, 90, 1.0, 4.00, "Everbearing types fruit through the season. Runners give you free plants."),
    ("alpine-strawberry", "Alpine Strawberry", "berrylow", 0.75, 0.6, 100, 0.4, 9.00, "Tiny intense berries, non-stop, and tolerant of part shade.", {"sun": 4}),
    ("blueberry", "Blueberry", "berrybush", 4.0, 5.0, 730, 5.0, 5.50, "Needs genuinely acid soil — test first, or grow it in a container."),
    ("raspberry", "Raspberry", "bramble", 2.0, 5.0, 365, 2.0, 7.00, "Spreads by suckers and fruits on canes. Expensive to buy, easy to grow."),
    ("blackberry", "Blackberry", "bramble", 3.0, 6.0, 365, 4.0, 6.00, "Thornless varieties exist and are worth seeking out."),
    ("boysenberry", "Boysenberry", "bramble", 3.0, 6.0, 365, 3.5, 7.00, "Blackberry-raspberry cross; large soft fruit on trailing canes."),
    ("tayberry", "Tayberry", "bramble", 3.0, 6.0, 365, 3.0, 8.00, "Aromatic and sharp; too soft to travel, which is why shops rarely have it."),
    ("gooseberry", "Gooseberry", "berrybush", 3.5, 4.0, 730, 4.0, 6.00, "Tart early fruit on a thorny bush; tolerates some shade.", {"sun": 5, "color": "#9FBF5C"}),
    ("red-currant", "Red Currant", "berrybush", 3.5, 4.0, 730, 4.0, 7.00, "Translucent strings of fruit, heavy crops, very cold hardy.", {"color": "#C43A3A"}),
    ("black-currant", "Black Currant", "berrybush", 4.0, 5.0, 730, 5.0, 7.50, "Intense flavour and enormous vitamin C.", {"color": "#3B2340"}),
    ("white-currant", "White Currant", "berrybush", 3.5, 4.0, 730, 3.5, 8.00, "Sweeter and milder than red; the same plant otherwise.", {"color": "#E4DCC0"}),
    ("jostaberry", "Jostaberry", "berrybush", 4.0, 5.0, 730, 5.0, 7.00, "Gooseberry-currant cross, thornless and vigorous.", {"color": "#42304A"}),
    ("honeyberry", "Honeyberry", "berrybush", 4.0, 4.0, 730, 3.0, 9.00, "Haskap — the earliest fruit of the year and extremely cold hardy.", {"color": "#4A5B9E"}),
    ("elderberry", "Elderberry", "berrybush", 6.0, 10.0, 730, 8.0, 6.00, "Big shrub, big crops, and the raw berries must be cooked.", {"color": "#2E2440"}),
    ("aronia", "Aronia", "berrybush", 4.0, 6.0, 730, 6.0, 7.00, "Chokeberry — astringent fresh, excellent cooked, and trouble-free.", {"color": "#2B2233"}),
    ("goji", "Goji Berry", "berrybush", 4.0, 7.0, 730, 3.0, 12.00, "Arching shrub; needs pruning or it becomes a thicket.", {"color": "#C7452E"}),
    ("cranberry", "Cranberry", "berrylow", 1.0, 0.5, 730, 0.8, 4.50, "A low acid-loving mat; wants bog conditions, not standing water.", {"water": "high", "color": "#A61E2E"}),
    ("lingonberry", "Lingonberry", "berrylow", 1.0, 0.8, 730, 0.5, 14.00, "Evergreen ground cover with tart red fruit; happy in part shade.", {"sun": 4, "color": "#B8232F"}),
    ("mulberry", "Mulberry", "fruittree", 15.0, 20.0, 1095, 30.0, 8.00, "Fruits heavily and young. Plant it well away from paths and cars.", {"color": "#3B1F33"}),
    ("grape", "Grape", "fruitvine", 8.0, 8.0, 1095, 15.0, 2.80, "Needs a real trellis and annual pruning; then decades of fruit."),
    ("kiwi", "Kiwi", "fruitvine", 10.0, 12.0, 1460, 20.0, 3.20, "Vigorous and heavy — the structure matters more than the plant.", {"color": "#8FA35C"}),
    ("hardy-kiwi", "Hardy Kiwi", "fruitvine", 8.0, 10.0, 1095, 12.0, 5.00, "Smooth grape-sized fruit, eaten skin and all, and far more cold tolerant.", {"color": "#9AB06A"}),
    ("passionfruit", "Passionfruit", "fruitvine", 6.0, 12.0, 550, 10.0, 5.00, "Fast tender vine with extraordinary flowers.", {"season": "warm", "color": "#5B3A6E"}),
    ("hops", "Hops", "fruitvine", 3.0, 18.0, 365, 1.5, 12.00, "Climbs twenty feet a season and dies back to the crown each winter.", {"color": "#9DB35E"}),
    # --- tree fruit -----------------------------------------------------
    ("apple", "Apple", "fruittree", 15.0, 15.0, 1460, 60.0, 2.20, "Most varieties need a second tree nearby to set fruit."),
    ("dwarf-apple", "Dwarf Apple", "fruittree", 8.0, 8.0, 1095, 25.0, 2.20, "Fruits years earlier than a standard tree and stays pickable from the ground."),
    ("crabapple", "Crabapple", "fruittree", 12.0, 15.0, 1095, 20.0, 3.00, "Grown as a pollinator for other apples; the fruit makes excellent jelly.", {"color": "#B8342C"}),
    ("pear", "Pear", "fruittree", 15.0, 18.0, 1460, 50.0, 2.40, "Longer-lived than apple and just as dependent on a pollinator.", {"color": "#C9BE5E"}),
    ("asian-pear", "Asian Pear", "fruittree", 12.0, 15.0, 1460, 40.0, 3.40, "Crisp and round, closer to an apple in texture.", {"color": "#D6C77A"}),
    ("peach", "Peach", "fruittree", 12.0, 12.0, 1095, 40.0, 2.60, "Fast to fruit, short-lived, and needs annual pruning to stay productive.", {"color": "#E58B52"}),
    ("nectarine", "Nectarine", "fruittree", 12.0, 12.0, 1095, 35.0, 3.00, "A fuzzless peach, with the same habits and the same diseases.", {"color": "#E07A4A"}),
    ("plum", "Plum", "fruittree", 12.0, 14.0, 1095, 35.0, 2.80, "Reliable and heavy-cropping; thin the fruit or branches break.", {"color": "#5A3550"}),
    ("apricot", "Apricot", "fruittree", 12.0, 14.0, 1095, 30.0, 3.60, "Flowers very early, so a late frost can take the whole crop.", {"color": "#E0913F"}),
    ("cherry", "Sweet Cherry", "fruittree", 15.0, 18.0, 1460, 30.0, 5.00, "You will be sharing it with birds unless you net it.", {"color": "#9E2135"}),
    ("sour-cherry", "Sour Cherry", "fruittree", 12.0, 12.0, 1095, 25.0, 4.60, "Smaller, self-fertile and far easier than a sweet cherry.", {"color": "#B22B34"}),
    ("fig", "Fig", "fruittree", 10.0, 12.0, 730, 20.0, 6.00, "Two crops a year in warm climates; cuts back hard and forgives it."),
    ("persimmon", "Persimmon", "fruittree", 12.0, 15.0, 1460, 30.0, 4.00, "Astringent types must go completely soft; fuyu types can be eaten crisp.", {"color": "#DB7A2E"}),
    ("pomegranate", "Pomegranate", "fruittree", 10.0, 10.0, 1095, 20.0, 3.40, "Drought-tolerant and happiest with a long hot summer.", {"water": "low", "color": "#B33040"}),
    ("quince", "Quince", "fruittree", 12.0, 12.0, 1095, 25.0, 4.00, "Hard and aromatic; inedible raw, remarkable cooked.", {"color": "#D4C15C"}),
    ("lemon", "Lemon", "citrus", 8.0, 10.0, 730, 30.0, 2.60, "Crops almost year-round in mild climates and takes to a pot well.", {"color": "#E8D14A"}),
    ("lime", "Lime", "citrus", 8.0, 9.0, 730, 25.0, 3.20, "More cold-tender than lemon; bring it inside where winters bite.", {"color": "#9BC24A"}),
    ("orange", "Orange", "citrus", 12.0, 14.0, 1095, 45.0, 1.80, "Sweet oranges need real summer heat to develop sugar."),
    ("mandarin", "Mandarin", "citrus", 10.0, 10.0, 1095, 35.0, 2.60, "Easy-peel, cold-hardiest of the sweet citrus.", {"color": "#E58A2A"}),
    ("grapefruit", "Grapefruit", "citrus", 14.0, 15.0, 1460, 50.0, 1.60, "Big tree, long ripening, and it wants heat.", {"color": "#E5A06B"}),
    ("kumquat", "Kumquat", "citrus", 6.0, 8.0, 730, 12.0, 6.00, "Eaten whole, skin and all. The most container-friendly citrus.", {"color": "#E98E2B"}),
    ("calamondin", "Calamondin", "citrus", 5.0, 7.0, 730, 10.0, 7.00, "Sour ornamental citrus that fruits almost continuously indoors.", {"color": "#E8912F"}),
    ("olive", "Olive", "fruittree", 12.0, 15.0, 1460, 20.0, 5.00, "Needs curing before it is edible, and a mild winter to survive.", {"water": "low", "color": "#6B7350"}),
    ("loquat", "Loquat", "tropical", 12.0, 15.0, 1095, 25.0, 5.00, "Flowers in winter, fruits in spring; evergreen and handsome.", {"color": "#E2A93F"}),
    ("pawpaw", "Pawpaw", "fruittree", 10.0, 15.0, 1825, 20.0, 8.00, "North America's largest native fruit — custardy, and it needs shade when young.", {"sun": 5, "color": "#B7B463"}),
    ("jujube", "Jujube", "fruittree", 12.0, 15.0, 1095, 20.0, 6.00, "Drought-proof and productive where little else fruits.", {"water": "low", "color": "#A5502F"}),
    ("guava", "Guava", "tropical", 10.0, 12.0, 730, 25.0, 4.00, "Fast-growing and heavy-cropping in frost-free gardens.", {"color": "#C9D66B"}),
    ("banana", "Banana", "tropical", 8.0, 12.0, 400, 40.0, 1.20, "A giant herb, not a tree. Each stem fruits once and is then cut down.", {"model": "stalk", "color": "#E4CE4A"}),
    ("papaya", "Papaya", "tropical", 8.0, 12.0, 330, 40.0, 2.20, "Fruits within a year from seed, and dies young.", {"color": "#E79B3F"}),
    ("mango", "Mango", "tropical", 15.0, 20.0, 1460, 50.0, 2.40, "Needs a genuinely tropical climate or a very large greenhouse.", {"color": "#E5853A"}),
    ("avocado", "Avocado", "tropical", 15.0, 20.0, 1460, 40.0, 4.00, "Slow, large and frost-sensitive; grafted trees fruit far sooner than seedlings.", {"color": "#6E7F3E"}),
    ("pineapple", "Pineapple", "tropical", 2.0, 3.0, 640, 4.0, 2.00, "One fruit per plant after two years, from a rosette of spiny leaves.", {"model": "rosette", "color": "#D9B23F"}),
    ("almond", "Almond", "nuttree", 18.0, 18.0, 1460, 15.0, 8.00, "Close relative of the peach, with the same early-flowering risk."),
    ("walnut", "Walnut", "nuttree", 30.0, 40.0, 2190, 40.0, 9.00, "Huge, long-lived, and it poisons many plants beneath it."),
    ("pecan", "Pecan", "nuttree", 30.0, 40.0, 2555, 40.0, 10.00, "Needs a long hot summer and decades of patience."),
    ("hazelnut", "Hazelnut", "nuttree", 12.0, 12.0, 1460, 10.0, 9.00, "More a large shrub than a tree; plant two for pollination.", {"model": "shrub", "difficulty": "medium"}),
    ("chestnut", "Chestnut", "nuttree", 25.0, 40.0, 2190, 35.0, 7.00, "Productive and enormous. Blight-resistant hybrids are the ones to plant."),
    # --- grains & seeds -------------------------------------------------
    ("sweet-corn", "Sweet Corn", "cereal", 1.0, 7.0, 80, 1.0, 2.40, "Plant in a block, not a row, or the ears fill unevenly. Sweetest straight off the stalk."),
    ("popcorn", "Popcorn", "cereal", 1.0, 7.0, 100, 0.6, 3.00, "Left on the stalk to dry hard; stores for years."),
    ("flour-corn", "Flour Corn", "cereal", 1.0, 8.0, 110, 0.7, 2.60, "Grown to grind, not to eat fresh."),
    ("sorghum", "Sorghum", "cereal", 0.75, 8.0, 110, 0.8, 2.00, "Drought-hardy grain, or a syrup crop from the sweet types.", {"water": "low"}),
    ("amaranth-grain", "Grain Amaranth", "cereal", 1.0, 6.0, 110, 0.5, 4.00, "Spectacular seed heads, and the young leaves are edible too.", {"color": "#A8365C"}),
    ("quinoa", "Quinoa", "cereal", 1.0, 5.0, 110, 0.4, 5.00, "Needs cool nights to set seed properly.", {"season": "cool"}),
    ("buckwheat", "Buckwheat", "cereal", 0.5, 3.0, 75, 0.3, 3.00, "Fast cover crop that also makes flour and feeds bees."),
    ("wheat", "Wheat", "cereal", 0.25, 4.0, 120, 0.15, 1.20, "A garden-scale patch yields a loaf or two — grown for interest more than value."),
    ("barley", "Barley", "cereal", 0.25, 3.5, 100, 0.15, 1.30, "Hardier than wheat and quicker off the ground."),
    ("oats", "Oats", "cereal", 0.25, 4.0, 110, 0.15, 1.40, "Easy to grow, tedious to hull."),
    ("rye", "Rye", "cereal", 0.25, 5.0, 120, 0.15, 1.50, "The toughest cereal; often sown to hold soil over winter.", {"season": "cool"}),
    ("millet", "Millet", "cereal", 0.5, 4.0, 90, 0.3, 2.20, "Fast, heat- and drought-tolerant small grain.", {"water": "low"}),
    ("sunflower", "Sunflower", "cereal", 1.5, 8.0, 100, 0.5, 4.00, "Seeds for you or the birds, and shade for whatever needs it.", {"color": "#E8B93C"}),
    ("sesame", "Sesame", "cereal", 0.75, 4.0, 110, 0.3, 8.00, "Heat-loving; pods shatter the moment they are ripe.", {"water": "low"}),
    ("flax", "Flax", "cereal", 0.4, 3.0, 100, 0.2, 5.00, "Blue-flowered, grown for seed or fibre.", {"color": "#7C9BC9"}),
    ("chia", "Chia", "cereal", 0.75, 4.0, 120, 0.25, 9.00, "Needs a long frost-free season to ripen seed.", {"color": "#8C7FB5"}),
    # --- edible flowers -------------------------------------------------
    ("nasturtium", "Nasturtium", "flower", 1.5, 1.0, 55, 0.8, 14.00, "Leaves, flowers and seed pods all edible and peppery. Trails anywhere.", {"model": "sprawl"}),
    ("calendula", "Calendula", "flower", 1.0, 2.0, 55, 0.5, 18.00, "Petals for salads and salves; flowers until hard frost.", {"color": "#E8952E"}),
    ("marigold", "Marigold", "flower", 0.75, 1.5, 50, 0.3, 14.00, "Planted as much for pest confusion as for the petals.", {"color": "#E0761F"}),
    ("viola", "Viola", "flower", 0.5, 0.6, 60, 0.2, 24.00, "Candied or scattered on a plate; happiest in cool weather.", {"color": "#7A5CA8", "season": "cool"}),
    ("squash-blossom", "Squash Blossom", "flower", 2.5, 2.0, 45, 0.6, 20.00, "The male flowers of any summer squash, picked before they set fruit.", {"model": "sprawl", "color": "#E8C247"}),
    ("bee-balm", "Bee Balm", "flower", 1.5, 3.0, 90, 0.5, 20.00, "Minty perennial for tea, and hummingbirds find it first.", {"color": "#C2405C", "season": "all"}),
    ("hibiscus-roselle", "Roselle", "flower", 2.5, 5.0, 120, 2.0, 9.00, "Grown for the tart red calyces that make hibiscus tea.", {"color": "#B52F42"}),
]


def build() -> dict:
    crops = []
    seen = set()

    for row in ROWS:
        crop_id, name, group, spacing, height, days, yield_lb, price, description = row[:9]
        overrides = row[9] if len(row) > 9 else {}

        assert crop_id not in seen, "duplicate crop id: %s" % crop_id
        seen.add(crop_id)
        assert group in GROUPS, "%s: unknown group %r" % (crop_id, group)

        category, model, color, sun, water, difficulty, season, container, cost = GROUPS[group]

        model = overrides.get("model", model)
        color = COLORS.get(crop_id, color)
        color = overrides.get("color", color)
        sun = overrides.get("sun", sun)
        water = overrides.get("water", water)
        difficulty = overrides.get("difficulty", difficulty)
        season = overrides.get("season", season)
        container = overrides.get("container", container)
        cost = overrides.get("cost", cost)
        category = overrides.get("category", category)

        # Pinned crops win over both group defaults and row values.
        pin = PINNED.get(crop_id, {})
        spacing = pin.get("spacing", spacing)
        height = pin.get("height", height)
        days = pin.get("days", days)
        yield_lb = pin.get("yield_lb", yield_lb)
        cost = pin.get("cost", cost)
        price = pin.get("price", price)
        sun = pin.get("sun", sun)
        water = pin.get("water", water)
        difficulty = pin.get("difficulty", difficulty)
        season = pin.get("season", season)
        color = pin.get("color", color)
        category = pin.get("category", category)

        container = bool(pin.get("container", container)) and spacing <= CONTAINER_MAX_SPACING_FT

        assert model in ARCHETYPES, "%s: no 3D archetype %r" % (crop_id, model)
        assert season in SEASONS, "%s: unknown season %r" % (crop_id, season)

        crops.append(
            {
                "id": crop_id,
                "name": name,
                "category": category,
                "sunlight_hours": sun,
                "spacing_ft": spacing,
                "mature_height_ft": height,
                "days_to_harvest": days,
                "water_requirement": water,
                "difficulty": difficulty,
                "estimated_yield_per_plant": yield_lb,
                "estimated_cost_per_plant": cost,
                "estimated_grocery_price": price,
                "container_compatible": bool(container),
                "season": season,
                "image": "/crops/%s.svg" % crop_id,
                "color": color,
                "description": description,
                # Which silhouette the 3D/AR scene draws for this crop.
                "model": model,
            }
        )

    crops.sort(key=lambda crop: crop["name"])

    return {
        "_meta": {
            "source": "Hand-curated list of common home-garden crops, generated by scripts/build_crops.py.",
            "count": len(crops),
            "warning": (
                "Yields, costs and retail prices are informed estimates, NOT measured data, and "
                "they are what the savings figures are computed from. Spacing, height and "
                "days-to-harvest are close to seed-packet norms; the money is rougher. Replace "
                "with a real horticultural dataset (USDA / extension service) before presenting "
                "any figure here as fact."
            ),
            "editing": "Edit scripts/build_crops.py and re-run it. Do not hand-edit this file.",
            "units": {
                "spacing_ft": "feet between plant centers",
                "estimated_yield_per_plant": "pounds per plant per season",
                "estimated_cost_per_plant": "USD, seed/seedling + soil amendment share",
                "estimated_grocery_price": "USD per pound at retail",
            },
            "model": "3D archetype; must be one of ARCHETYPES in frontend/components/garden/PlantModels.tsx",
        },
        "crops": crops,
    }


if __name__ == "__main__":
    payload = build()
    DATA.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print("wrote %d crops to %s" % (len(payload["crops"]), DATA))
