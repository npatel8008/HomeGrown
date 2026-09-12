"""The security property this feature exists to provide.

Each test answers one question: can user B reach user A's data? The answer has
to be no through every door — read, write, patch, delete and aggregate — and no
when B tries to name A as the owner in a request body.
"""

import time

import jwt
import pytest

from conftest import auth_headers
from services import auth

ALICE = "auth0|alice-000000000000000000001"
BOB = "auth0|bob-00000000000000000000002"


def _save_alices_garden(client):
    response = client.put(
        "/api/me/garden",
        json={"name": "Alice's plot", "location": "Pittsburgh, PA", "selected_crop_ids": ["tomato"]},
        headers=auth_headers(ALICE),
    )
    assert response.status_code == 200
    return response.json()


# ---------------------------------------------------------------------------
# No token, bad token
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", "/api/me/garden"),
        ("put", "/api/me/garden"),
        ("get", "/api/me/plantings"),
        ("post", "/api/me/plantings"),
        ("get", "/api/me/care-events"),
        ("post", "/api/me/care-events"),
        ("get", "/api/me/care-summary"),
        ("delete", "/api/me/data"),
    ],
)
def test_every_user_route_requires_a_token(client, method, path):
    # httpx only accepts a body on the methods that take one.
    kwargs = {"json": {}} if method in ("put", "post", "patch") else {}
    response = getattr(client, method)(path, **kwargs)
    assert response.status_code == 401, "%s %s was reachable anonymously" % (method, path)


def test_token_signed_with_the_wrong_secret_is_rejected(client):
    forged = jwt.encode(
        {
            "sub": ALICE,
            "iss": auth.INTERNAL_ISSUER,
            "aud": auth.INTERNAL_AUDIENCE,
            "exp": int(time.time()) + 300,
        },
        "not-the-real-secret",
        algorithm="HS256",
    )
    response = client.get("/api/me/garden", headers={"Authorization": "Bearer %s" % forged})
    assert response.status_code == 401


def test_expired_token_is_rejected(client):
    stale = jwt.encode(
        {
            "sub": ALICE,
            "iss": auth.INTERNAL_ISSUER,
            "aud": auth.INTERNAL_AUDIENCE,
            "exp": int(time.time()) - 3600,
        },
        auth.INTERNAL_API_SECRET,
        algorithm="HS256",
    )
    response = client.get("/api/me/garden", headers={"Authorization": "Bearer %s" % stale})
    assert response.status_code == 401


def test_token_for_the_wrong_audience_is_rejected(client):
    """A token minted for some other service must not open this one."""
    wrong_audience = jwt.encode(
        {
            "sub": ALICE,
            "iss": auth.INTERNAL_ISSUER,
            "aud": "some-other-api",
            "exp": int(time.time()) + 300,
        },
        auth.INTERNAL_API_SECRET,
        algorithm="HS256",
    )
    response = client.get(
        "/api/me/garden", headers={"Authorization": "Bearer %s" % wrong_audience}
    )
    assert response.status_code == 401


def test_none_algorithm_token_is_rejected(client):
    """The classic JWT downgrade: an unsigned token claiming to be Alice."""
    unsigned = jwt.encode(
        {"sub": ALICE, "iss": auth.INTERNAL_ISSUER, "aud": auth.INTERNAL_AUDIENCE},
        key="",
        algorithm="none",
    )
    response = client.get("/api/me/garden", headers={"Authorization": "Bearer %s" % unsigned})
    assert response.status_code == 401


# ---------------------------------------------------------------------------
# Isolation between two real accounts
# ---------------------------------------------------------------------------


def test_bob_cannot_read_alices_garden(client):
    _save_alices_garden(client)

    alice_sees = client.get("/api/me/garden", headers=auth_headers(ALICE)).json()
    assert alice_sees["name"] == "Alice's plot"

    bob_sees = client.get("/api/me/garden", headers=auth_headers(BOB))
    assert bob_sees.status_code == 200
    assert bob_sees.json() is None, "Bob was served Alice's garden"


def test_bobs_save_does_not_overwrite_alices(client):
    _save_alices_garden(client)
    client.put("/api/me/garden", json={"name": "Bob's balcony"}, headers=auth_headers(BOB))

    assert client.get("/api/me/garden", headers=auth_headers(ALICE)).json()["name"] == "Alice's plot"
    assert client.get("/api/me/garden", headers=auth_headers(BOB)).json()["name"] == "Bob's balcony"


def test_a_user_id_in_the_request_body_is_ignored(client):
    """Ownership comes from the token. Claiming otherwise changes nothing."""
    client.put(
        "/api/me/garden",
        json={"name": "Trojan garden", "user_id": ALICE},
        headers=auth_headers(BOB),
    )

    alice = client.get("/api/me/garden", headers=auth_headers(ALICE))
    assert alice.json() is None, "Bob wrote into Alice's record by naming her in the body"
    assert client.get("/api/me/garden", headers=auth_headers(BOB)).json()["name"] == "Trojan garden"


def test_plantings_are_per_user(client):
    client.post(
        "/api/me/plantings",
        json={"plantings": [{"plant_id": "p-1", "crop_id": "tomato", "crop": "Tomato"}]},
        headers=auth_headers(ALICE),
    )

    assert len(client.get("/api/me/plantings", headers=auth_headers(ALICE)).json()) == 1
    assert client.get("/api/me/plantings", headers=auth_headers(BOB)).json() == []


def test_bob_cannot_patch_alices_planting(client):
    client.post(
        "/api/me/plantings",
        json={"plantings": [{"plant_id": "p-1", "crop_id": "tomato", "crop": "Tomato"}]},
        headers=auth_headers(ALICE),
    )

    response = client.patch(
        "/api/me/plantings/p-1", json={"status": "removed"}, headers=auth_headers(BOB)
    )
    assert response.status_code == 404

    alice_planting = client.get("/api/me/plantings", headers=auth_headers(ALICE)).json()[0]
    assert alice_planting["status"] == "planted", "Bob mutated Alice's planting"


def test_two_users_can_hold_the_same_plant_id(client):
    """Ids come from the layout generator, so collisions across users are normal."""
    body = {"plantings": [{"plant_id": "p-1", "crop_id": "tomato", "crop": "Tomato"}]}
    assert client.post("/api/me/plantings", json=body, headers=auth_headers(ALICE)).status_code == 200
    assert client.post("/api/me/plantings", json=body, headers=auth_headers(BOB)).status_code == 200

    client.patch("/api/me/plantings/p-1", json={"status": "removed"}, headers=auth_headers(BOB))
    assert client.get("/api/me/plantings", headers=auth_headers(ALICE)).json()[0]["status"] == "planted"
    assert client.get("/api/me/plantings", headers=auth_headers(BOB)).json()[0]["status"] == "removed"


def test_care_events_are_per_user(client):
    client.post(
        "/api/me/care-events",
        json={"kind": "watered", "crop_id": "tomato", "crop": "Tomato"},
        headers=auth_headers(ALICE),
    )

    assert len(client.get("/api/me/care-events", headers=auth_headers(ALICE)).json()) == 1
    assert client.get("/api/me/care-events", headers=auth_headers(BOB)).json() == []


def test_bob_cannot_delete_alices_care_event_even_with_its_id(client):
    created = client.post(
        "/api/me/care-events",
        json={"kind": "watered", "crop_id": "tomato"},
        headers=auth_headers(ALICE),
    ).json()
    event_id = created["id"]

    assert client.delete("/api/me/care-events/%s" % event_id, headers=auth_headers(BOB)).status_code == 404
    assert len(client.get("/api/me/care-events", headers=auth_headers(ALICE)).json()) == 1

    assert client.delete("/api/me/care-events/%s" % event_id, headers=auth_headers(ALICE)).status_code == 204
    assert client.get("/api/me/care-events", headers=auth_headers(ALICE)).json() == []


def test_care_summary_only_counts_your_own_harvest(client):
    client.post(
        "/api/me/care-events",
        json={"kind": "harvested", "crop_id": "tomato", "quantity_lbs": 4.5, "value_usd": 11.25},
        headers=auth_headers(ALICE),
    )
    client.post(
        "/api/me/care-events",
        json={"kind": "harvested", "crop_id": "tomato", "quantity_lbs": 99, "value_usd": 200},
        headers=auth_headers(BOB),
    )

    alice = client.get("/api/me/care-summary", headers=auth_headers(ALICE)).json()
    assert alice["total_harvested_lbs"] == 4.5
    assert alice["total_harvested_value_usd"] == 11.25

    bob = client.get("/api/me/care-summary", headers=auth_headers(BOB)).json()
    assert bob["total_harvested_lbs"] == 99


def test_deleting_my_data_leaves_everyone_elses_alone(client):
    _save_alices_garden(client)
    client.put("/api/me/garden", json={"name": "Bob's balcony"}, headers=auth_headers(BOB))
    client.post(
        "/api/me/care-events", json={"kind": "watered"}, headers=auth_headers(BOB)
    )

    deleted = client.delete("/api/me/data", headers=auth_headers(BOB)).json()["deleted"]
    assert deleted["gardens"] == 1 and deleted["care_events"] == 1

    assert client.get("/api/me/garden", headers=auth_headers(BOB)).json() is None
    assert client.get("/api/me/garden", headers=auth_headers(ALICE)).json()["name"] == "Alice's plot"
