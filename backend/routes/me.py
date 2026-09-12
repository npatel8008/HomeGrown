"""Per-user data: the saved garden, what is planted, and the care record.

Every route here depends on `get_current_user`, and every call into the store
passes `identity.user_id`. No handler accepts a user id from the caller — the
only identity in play is the one the token proved. Route handlers stay thin;
the isolation guarantee lives in `services/user_store.py`.
"""

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from models.schemas import (
    CareEvent,
    CareEventOut,
    CareSummaryResponse,
    DeleteResult,
    PlantingOut,
    PlantingPatch,
    SavedGarden,
    SavedGardenOut,
    UpsertPlantingsRequest,
)
from services import user_store
from services.auth import Identity, get_current_user

router = APIRouter(prefix="/me", tags=["user-data"])


def _require_store() -> None:
    """Turn a missing/unreachable database into an honest 503.

    The frontend treats this as "keep using local storage and say so", which
    keeps the demo alive without pretending the save succeeded.
    """
    if not user_store.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="MONGODB_URI is not set — per-account storage is disabled.",
        )


@router.get("/garden", response_model=Optional[SavedGardenOut])
def read_garden(identity: Identity = Depends(get_current_user)):
    _require_store()
    return user_store.get_garden(identity.user_id)


@router.put("/garden", response_model=SavedGardenOut)
def write_garden(
    garden: SavedGarden,
    identity: Identity = Depends(get_current_user),
):
    _require_store()
    return user_store.save_garden(identity.user_id, garden.model_dump(mode="python"))


@router.get("/plantings", response_model=List[PlantingOut])
def read_plantings(identity: Identity = Depends(get_current_user)):
    _require_store()
    return user_store.list_plantings(identity.user_id)


@router.post("/plantings", response_model=List[PlantingOut])
def write_plantings(
    request: UpsertPlantingsRequest,
    identity: Identity = Depends(get_current_user),
):
    """Upsert, so regenerating a layout never erases care history."""
    _require_store()
    return user_store.upsert_plantings(
        identity.user_id,
        [planting.model_dump(mode="python") for planting in request.plantings],
    )


@router.patch("/plantings/{plant_id}", response_model=PlantingOut)
def patch_planting(
    plant_id: str,
    patch: PlantingPatch,
    identity: Identity = Depends(get_current_user),
):
    _require_store()
    updated = user_store.update_planting(
        identity.user_id, plant_id, patch.model_dump(mode="python", exclude_none=True)
    )
    if updated is None:
        # Also the answer when the planting belongs to somebody else: from this
        # caller's perspective it does not exist, and saying so is all they get.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such planting")
    return updated


@router.get("/care-events", response_model=List[CareEventOut])
def read_care_events(
    crop_id: Optional[str] = Query(default=None),
    since: Optional[datetime] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    identity: Identity = Depends(get_current_user),
):
    _require_store()
    return user_store.list_care_events(identity.user_id, crop_id=crop_id, since=since, limit=limit)


@router.post("/care-events", response_model=CareEventOut, status_code=status.HTTP_201_CREATED)
def create_care_event(
    event: CareEvent,
    identity: Identity = Depends(get_current_user),
):
    _require_store()
    return user_store.add_care_event(identity.user_id, event.model_dump(mode="python"))


@router.delete("/care-events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_care_event(
    event_id: str,
    identity: Identity = Depends(get_current_user),
):
    _require_store()
    if not user_store.delete_care_event(identity.user_id, event_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No such care event")
    return None


@router.get("/care-summary", response_model=CareSummaryResponse)
def read_care_summary(identity: Identity = Depends(get_current_user)):
    """Last watered / fed per crop and harvest totals — drives the Today page."""
    _require_store()
    return user_store.care_summary(identity.user_id)


@router.delete("/data", response_model=DeleteResult)
def delete_my_data(identity: Identity = Depends(get_current_user)):
    """Erase everything this account owns."""
    _require_store()
    return DeleteResult(deleted=user_store.delete_all_user_data(identity.user_id))
