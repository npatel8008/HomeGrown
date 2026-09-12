"""Loads the demo crop dataset.

Replace with a Supabase/Postgres query when the database is connected — every
caller goes through `all_crops()` / `get_crop()` so nothing else has to change.
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "crops.json"


@lru_cache(maxsize=1)
def _load() -> Dict[str, dict]:
    with DATA_FILE.open() as fh:
        payload = json.load(fh)
    return {crop["id"]: crop for crop in payload["crops"]}


def all_crops() -> List[dict]:
    return list(_load().values())


def get_crop(crop_id: str) -> Optional[dict]:
    return _load().get(crop_id)


def find_by_name(name: str) -> Optional[dict]:
    needle = name.strip().lower()
    for crop in all_crops():
        if crop["name"].lower() == needle or crop["id"] == needle:
            return crop
    return None
