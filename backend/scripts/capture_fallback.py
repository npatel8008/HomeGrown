"""Regenerate `frontend/lib/fallback.json` from the live services.

The frontend bundles real API responses for the demo household so the demo
still runs when the backend is down. Re-run this after changing any service:

    cd backend && python scripts/capture_fallback.py
"""

import json
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

OUTPUT = BACKEND.parent / "frontend" / "lib" / "fallback.json"

DEMO_MEALS = [
    {"name": "Tacos", "times_per_week": 2},
    {"name": "Pasta", "times_per_week": 2},
    {"name": "Salads", "times_per_week": 3},
    {"name": "Omelets", "times_per_week": 4},
]
DEMO_FREE_TEXT = (
    "We make tacos twice a week, pasta a few times a week, salads for lunch, "
    "and eggs most mornings."
)
DEMO_SPACE = {
    "location": "Demo City, US",
    "zip_code": "00000",
    "plot": {"width_ft": 12, "length_ft": 8, "unit": "ft"},
    "sunlight": "full-sun",
    "garden_type": "raised-beds",
    "experience": "beginner",
    "budget_usd": 150,
    "water_access": "hose",
    "notes": "",
}
DEMO_SEASON_DAY = 34


def main() -> None:
    client = TestClient(app)

    food = client.post(
        "/api/analyze-food",
        json={"household_size": 4, "meals": DEMO_MEALS, "free_text": DEMO_FREE_TEXT},
    ).json()

    recommendations = client.post(
        "/api/recommend-crops",
        json={"household_size": 4, "ingredients": food["ingredients"], "space": DEMO_SPACE},
    ).json()

    layout = client.post(
        "/api/generate-layout",
        json={
            "plot": DEMO_SPACE["plot"],
            "garden_type": DEMO_SPACE["garden_type"],
            "crops": [
                {"crop_id": crop["crop_id"], "plants": crop["plants_recommended"]}
                for crop in recommendations["recommendations"]
            ],
        },
    ).json()

    # Mirror the frontend's planting dates (see lib/store.tsx): the whole plot
    # goes in at the start of the season, so every crop is the same age.
    plantings = ",".join(
        "%s:%d" % (crop["crop_id"], DEMO_SEASON_DAY)
        for crop in recommendations["recommendations"]
    )

    payload = {
        "analyzeFood": food,
        "recommendCrops": recommendations,
        "layout": layout,
        "gardenStatus": client.get("/api/garden-status?day=%d" % DEMO_SEASON_DAY).json(),
        "careRecommendations": client.get(
            "/api/care-recommendations?crops=%s" % plantings
        ).json(),
        "crops": client.get("/api/crops").json(),
    }

    with OUTPUT.open("w") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print("wrote %s" % OUTPUT)


if __name__ == "__main__":
    main()
