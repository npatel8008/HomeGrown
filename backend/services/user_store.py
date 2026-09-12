"""MongoDB persistence for per-user garden and crop-care data.

Every document in every collection carries a `user_id`, which is the Auth0
subject claim taken from a verified token (see `services/auth.py`). The rule
this module exists to enforce:

    **No query reaches MongoDB without a user_id filter, and the user_id is
    always a function argument supplied by the route's auth dependency —
    never a value read out of the request body.**

That is why each function takes `user_id` as its first parameter rather than
accepting a filter dict, and why nothing here is exported that would let a
caller run an arbitrary query. Isolation is a property of this file; routes
cannot opt out of it.

The client is created lazily and the whole module reports itself unconfigured
when `MONGODB_URI` is unset, so the app still boots and the existing
localStorage demo path keeps working without a database.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from bson.errors import InvalidId
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import PyMongoError

logger = logging.getLogger(__name__)

MONGODB_URI = os.getenv("MONGODB_URI", "").strip()
MONGODB_DB_NAME = os.getenv("MONGODB_DB", "gardenai").strip()
# Fail fast rather than hanging a request for 30s when Atlas is unreachable.
CONNECT_TIMEOUT_MS = int(os.getenv("MONGODB_TIMEOUT_MS", "5000"))

GARDENS = "gardens"
PLANTINGS = "plantings"
CARE_EVENTS = "care_events"

CARE_EVENT_KINDS = {
    "watered",
    "fertilized",
    "pruned",
    "weeded",
    "pest-treated",
    "harvested",
    "note",
}

_client: Optional[MongoClient] = None
_indexes_ready = False


class StoreUnavailable(RuntimeError):
    """Raised when the database is not configured or cannot be reached."""


def is_configured() -> bool:
    return bool(MONGODB_URI)


def _db():
    global _client, _indexes_ready
    if not MONGODB_URI:
        raise StoreUnavailable("MONGODB_URI is not set")
    if _client is None:
        _client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=CONNECT_TIMEOUT_MS,
            connectTimeoutMS=CONNECT_TIMEOUT_MS,
            appname="gardenai-backend",
        )
    database = _client[MONGODB_DB_NAME]
    if not _indexes_ready:
        _ensure_indexes(database)
        _indexes_ready = True
    return database


def _ensure_indexes(database) -> None:
    """Indexes are per-user first — every read is scoped by user_id."""
    try:
        # One saved garden per user.
        database[GARDENS].create_index([("user_id", ASCENDING)], unique=True)
        # One planting per placed plant, per user.
        database[PLANTINGS].create_index(
            [("user_id", ASCENDING), ("plant_id", ASCENDING)], unique=True
        )
        database[CARE_EVENTS].create_index(
            [("user_id", ASCENDING), ("occurred_at", DESCENDING)]
        )
        database[CARE_EVENTS].create_index([("user_id", ASCENDING), ("crop_id", ASCENDING)])
    except PyMongoError as error:
        # An index failure must not take the app down; log it loudly instead.
        logger.warning("Could not ensure MongoDB indexes: %s", error)


def ping() -> bool:
    """Whether the database is actually reachable right now."""
    if not is_configured():
        return False
    try:
        _db().command("ping")
        return True
    except Exception as error:  # noqa: BLE001 — health must never raise
        logger.warning("MongoDB ping failed: %s", error)
        return False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _clean(document: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Strip Mongo internals before the document crosses an API boundary."""
    if document is None:
        return None
    document = dict(document)
    identifier = document.pop("_id", None)
    if identifier is not None:
        document["id"] = str(identifier)
    # user_id is an internal ownership marker; clients never need it back, and
    # not returning it keeps it out of logs and browser caches.
    document.pop("user_id", None)
    return document


# --------------------------------------------------------------------------
# Garden — the saved plan a user's care data hangs off.
# --------------------------------------------------------------------------


def get_garden(user_id: str) -> Optional[Dict[str, Any]]:
    return _clean(_db()[GARDENS].find_one({"user_id": user_id}))


def save_garden(user_id: str, garden: Dict[str, Any]) -> Dict[str, Any]:
    """Upsert this user's garden. Replaces the plan wholesale."""
    payload = dict(garden)
    payload.pop("user_id", None)  # never let the client set ownership
    payload.pop("id", None)
    payload["user_id"] = user_id
    payload["updated_at"] = _now()

    _db()[GARDENS].update_one(
        {"user_id": user_id},
        {"$set": payload, "$setOnInsert": {"created_at": _now()}},
        upsert=True,
    )
    return get_garden(user_id)


def delete_garden(user_id: str) -> int:
    return _db()[GARDENS].delete_one({"user_id": user_id}).deleted_count


# --------------------------------------------------------------------------
# Plantings — what is actually in the ground, and since when.
# --------------------------------------------------------------------------


def list_plantings(user_id: str) -> List[Dict[str, Any]]:
    cursor = _db()[PLANTINGS].find({"user_id": user_id}).sort("planted_on", ASCENDING)
    return [_clean(document) for document in cursor]


def upsert_plantings(user_id: str, plantings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Add or update plantings without disturbing care history.

    Used when a layout is generated or regenerated: existing plants keep their
    planting date and status, new ones are inserted.
    """
    collection = _db()[PLANTINGS]
    for planting in plantings:
        payload = dict(planting)
        payload.pop("user_id", None)
        payload.pop("id", None)
        plant_id = payload.get("plant_id")
        if not plant_id:
            continue
        payload["user_id"] = user_id
        payload["updated_at"] = _now()
        collection.update_one(
            {"user_id": user_id, "plant_id": plant_id},
            {
                "$set": payload,
                "$setOnInsert": {"created_at": _now()},
            },
            upsert=True,
        )
    return list_plantings(user_id)


def update_planting(
    user_id: str, plant_id: str, patch: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    payload = {key: value for key, value in patch.items() if value is not None}
    payload.pop("user_id", None)
    payload.pop("plant_id", None)
    if not payload:
        return _clean(_db()[PLANTINGS].find_one({"user_id": user_id, "plant_id": plant_id}))
    payload["updated_at"] = _now()
    _db()[PLANTINGS].update_one(
        {"user_id": user_id, "plant_id": plant_id}, {"$set": payload}
    )
    return _clean(_db()[PLANTINGS].find_one({"user_id": user_id, "plant_id": plant_id}))


def delete_plantings(user_id: str) -> int:
    return _db()[PLANTINGS].delete_many({"user_id": user_id}).deleted_count


# --------------------------------------------------------------------------
# Care events — the actual record of looking after the crops.
# --------------------------------------------------------------------------


def list_care_events(
    user_id: str,
    crop_id: Optional[str] = None,
    since: Optional[datetime] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    query: Dict[str, Any] = {"user_id": user_id}
    if crop_id:
        query["crop_id"] = crop_id
    if since:
        query["occurred_at"] = {"$gte": since}
    cursor = (
        _db()[CARE_EVENTS]
        .find(query)
        .sort("occurred_at", DESCENDING)
        .limit(max(1, min(limit, 1000)))
    )
    return [_clean(document) for document in cursor]


def add_care_event(user_id: str, event: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(event)
    payload.pop("user_id", None)
    payload.pop("id", None)
    payload["user_id"] = user_id
    payload.setdefault("occurred_at", _now())
    payload["created_at"] = _now()

    result = _db()[CARE_EVENTS].insert_one(payload)
    return _clean(_db()[CARE_EVENTS].find_one({"_id": result.inserted_id, "user_id": user_id}))


def delete_care_event(user_id: str, event_id: str) -> bool:
    try:
        object_id = ObjectId(event_id)
    except (InvalidId, TypeError):
        return False
    # The user_id in the filter is what stops one user deleting another's row
    # by guessing an id.
    result = _db()[CARE_EVENTS].delete_one({"_id": object_id, "user_id": user_id})
    return result.deleted_count == 1


def care_summary(user_id: str) -> Dict[str, Any]:
    """Per-crop care state: last watered / fed, and harvest totals."""
    summary: Dict[str, Dict[str, Any]] = {}
    total_harvest_lbs = 0.0
    total_harvest_value = 0.0

    for event in _db()[CARE_EVENTS].find({"user_id": user_id}).sort("occurred_at", DESCENDING):
        crop_id = event.get("crop_id") or "_garden"
        entry = summary.setdefault(
            crop_id,
            {
                "crop_id": crop_id,
                "crop": event.get("crop"),
                "last_watered": None,
                "last_fertilized": None,
                "harvested_lbs": 0.0,
                "harvested_value_usd": 0.0,
                "event_count": 0,
            },
        )
        entry["event_count"] += 1
        kind = event.get("kind")
        occurred = event.get("occurred_at")
        if kind == "watered" and entry["last_watered"] is None:
            entry["last_watered"] = occurred
        elif kind == "fertilized" and entry["last_fertilized"] is None:
            entry["last_fertilized"] = occurred
        elif kind == "harvested":
            pounds = float(event.get("quantity_lbs") or 0)
            value = float(event.get("value_usd") or 0)
            entry["harvested_lbs"] = round(entry["harvested_lbs"] + pounds, 2)
            entry["harvested_value_usd"] = round(entry["harvested_value_usd"] + value, 2)
            total_harvest_lbs += pounds
            total_harvest_value += value

    return {
        "crops": sorted(summary.values(), key=lambda row: row["crop_id"]),
        "total_harvested_lbs": round(total_harvest_lbs, 2),
        "total_harvested_value_usd": round(total_harvest_value, 2),
    }


def delete_all_user_data(user_id: str) -> Dict[str, int]:
    """Everything this user owns. Used by the account page."""
    database = _db()
    return {
        "gardens": database[GARDENS].delete_many({"user_id": user_id}).deleted_count,
        "plantings": database[PLANTINGS].delete_many({"user_id": user_id}).deleted_count,
        "care_events": database[CARE_EVENTS].delete_many({"user_id": user_id}).deleted_count,
    }
