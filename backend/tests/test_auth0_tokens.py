"""The production auth path: real RS256 Auth0 access tokens.

Auth0 is not called here. A throwaway RSA keypair stands in for the tenant's
signing key and the JWKS lookup is stubbed, which leaves the part worth testing
— issuer, audience, expiry and signature checking — running for real.
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from services import auth

DOMAIN = "gardenai-test.us.auth0.com"
AUDIENCE = "https://api.gardenai.test"
ALICE = "auth0|alice-000000000000000000001"
BOB = "auth0|bob-00000000000000000000002"


@pytest.fixture
def auth0_mode(monkeypatch):
    """Put the backend in Auth0 mode with a signing key we control."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    class _StubKey:
        key = private_key.public_key()

    class _StubJWKS:
        def get_signing_key_from_jwt(self, token):
            return _StubKey()

    monkeypatch.setattr(auth, "AUTH0_DOMAIN", DOMAIN)
    monkeypatch.setattr(auth, "AUTH0_API_AUDIENCE", AUDIENCE)
    monkeypatch.setattr(auth, "INTERNAL_API_SECRET", "")  # Auth0 path only
    monkeypatch.setattr(auth, "_jwks", lambda: _StubJWKS())
    return private_key


def mint(private_key, subject=ALICE, audience=AUDIENCE, issuer=None, expires_in=300, **extra):
    claims = {
        "sub": subject,
        "aud": audience,
        "iss": issuer or "https://%s/" % DOMAIN,
        "iat": int(time.time()),
        "exp": int(time.time()) + expires_in,
    }
    claims.update(extra)
    return jwt.encode(claims, private_key, algorithm="RS256")


def bearer(token):
    return {"Authorization": "Bearer %s" % token}


def test_a_valid_auth0_token_is_accepted(client, auth0_mode):
    response = client.put(
        "/api/me/garden", json={"name": "From Auth0"}, headers=bearer(mint(auth0_mode))
    )
    assert response.status_code == 200
    assert response.json()["name"] == "From Auth0"


def test_auth0_accounts_are_isolated_from_each_other(client, auth0_mode):
    client.put("/api/me/garden", json={"name": "Alice"}, headers=bearer(mint(auth0_mode, ALICE)))
    assert client.get("/api/me/garden", headers=bearer(mint(auth0_mode, BOB))).json() is None


def test_token_from_another_tenant_is_rejected(client, auth0_mode):
    token = mint(auth0_mode, issuer="https://attacker.us.auth0.com/")
    assert client.get("/api/me/garden", headers=bearer(token)).status_code == 401


def test_token_for_another_api_is_rejected(client, auth0_mode):
    """An access token minted for a different audience must not open this API."""
    token = mint(auth0_mode, audience="https://some-other-api.example.com")
    assert client.get("/api/me/garden", headers=bearer(token)).status_code == 401


def test_expired_auth0_token_is_rejected(client, auth0_mode):
    assert client.get(
        "/api/me/garden", headers=bearer(mint(auth0_mode, expires_in=-60))
    ).status_code == 401


def test_token_signed_by_the_wrong_key_is_rejected(client, auth0_mode):
    impostor = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    assert client.get("/api/me/garden", headers=bearer(mint(impostor))).status_code == 401


def test_internal_token_does_not_work_while_in_auth0_mode(client, auth0_mode):
    """Only one verifier is live at a time; the other format is not a backdoor."""
    hs256 = jwt.encode(
        {
            "sub": ALICE,
            "iss": auth.INTERNAL_ISSUER,
            "aud": auth.INTERNAL_AUDIENCE,
            "exp": int(time.time()) + 300,
        },
        "test-secret-not-used-anywhere-real",
        algorithm="HS256",
    )
    assert client.get("/api/me/garden", headers=bearer(hs256)).status_code == 401


def test_unconfigured_backend_refuses_rather_than_guessing(client, monkeypatch):
    """No auth configured must fail closed, never fall back to a shared user."""
    monkeypatch.setattr(auth, "AUTH0_DOMAIN", "")
    monkeypatch.setattr(auth, "AUTH0_API_AUDIENCE", "")
    monkeypatch.setattr(auth, "INTERNAL_API_SECRET", "")
    assert client.get("/api/me/garden").status_code == 503
