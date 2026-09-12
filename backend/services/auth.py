"""Request authentication — turns a bearer token into a verified user id.

This module is the ONLY place the backend decides who is calling. Everything
downstream receives an `Identity` it can trust, and no route is allowed to read
a user id out of a request body, query string or header: a caller who can name
their own user id can name someone else's.

Two token formats are accepted, and exactly one is active at a time:

    Auth0 access token (RS256)
        Used when AUTH0_DOMAIN and AUTH0_API_AUDIENCE are set. Verified against
        the tenant's published JWKS, with issuer and audience checked. This is
        the production path; it requires an API to be registered in the Auth0
        dashboard so the tenant mints JWTs rather than opaque tokens.

    Internal session token (HS256)
        Used when INTERNAL_API_SECRET is set instead. The Next.js server has
        already verified the Auth0 session cookie; it mints a short-lived token
        carrying that session's `sub` and signs it with a secret only it and
        this backend know. The browser never sees it.

If neither is configured, authenticated endpoints fail with 503. That is
deliberate. Everything else in this codebase degrades to an offline fallback on
failure, but "we could not identify the caller" must never degrade into "show
them somebody's data" — the failure mode of a mistake here is a data leak, not
a worse demo.
"""

import logging
import os
import time
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

logger = logging.getLogger(__name__)

AUTH0_DOMAIN = os.getenv("AUTH0_DOMAIN", "").strip().replace("https://", "").rstrip("/")
AUTH0_API_AUDIENCE = os.getenv("AUTH0_API_AUDIENCE", "").strip()
INTERNAL_API_SECRET = os.getenv("INTERNAL_API_SECRET", "").strip()

INTERNAL_ISSUER = "gardenai-frontend"
INTERNAL_AUDIENCE = "gardenai-backend"

# Clock skew tolerance between the frontend and backend hosts.
LEEWAY_SECONDS = 30


class Identity(BaseModel):
    """A caller the backend has cryptographically verified."""

    user_id: str
    email: Optional[str] = None
    #: "auth0" or "internal" — surfaced by /api/health for debugging.
    verified_by: str


def auth0_mode() -> bool:
    return bool(AUTH0_DOMAIN and AUTH0_API_AUDIENCE)


def internal_mode() -> bool:
    return bool(INTERNAL_API_SECRET)


def configured() -> bool:
    return auth0_mode() or internal_mode()


def mode() -> str:
    if auth0_mode():
        return "auth0-rs256"
    if internal_mode():
        return "internal-hs256"
    return "unconfigured"


_jwk_client: Optional["jwt.PyJWKClient"] = None


def _jwks() -> "jwt.PyJWKClient":
    """Cached JWKS client. PyJWKClient caches keys, so this is one fetch."""
    global _jwk_client
    if _jwk_client is None:
        _jwk_client = jwt.PyJWKClient(
            "https://%s/.well-known/jwks.json" % AUTH0_DOMAIN, cache_keys=True
        )
    return _jwk_client


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _verify_auth0(token: str) -> Identity:
    try:
        signing_key = _jwks().get_signing_key_from_jwt(token)
        claims = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=AUTH0_API_AUDIENCE,
            issuer="https://%s/" % AUTH0_DOMAIN,
            leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as error:
        logger.info("Rejected Auth0 token: %s: %s", type(error).__name__, error)
        raise _unauthorized("Invalid or expired access token")
    except Exception as error:  # JWKS fetch failure, network, malformed kid
        logger.warning("Could not verify token against JWKS: %s", error)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Could not reach the identity provider to verify the token",
        )

    subject = claims.get("sub")
    if not subject:
        raise _unauthorized("Token carries no subject")
    return Identity(user_id=subject, email=claims.get("email"), verified_by="auth0")


def _verify_internal(token: str) -> Identity:
    try:
        claims = jwt.decode(
            token,
            INTERNAL_API_SECRET,
            algorithms=["HS256"],
            audience=INTERNAL_AUDIENCE,
            issuer=INTERNAL_ISSUER,
            leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as error:
        logger.info("Rejected internal token: %s: %s", type(error).__name__, error)
        raise _unauthorized("Invalid or expired session token")

    subject = claims.get("sub")
    if not subject:
        raise _unauthorized("Token carries no subject")
    return Identity(user_id=subject, email=claims.get("email"), verified_by="internal")


def mint_internal_token(user_id: str, email: Optional[str] = None, ttl_seconds: int = 300) -> str:
    """Only used by tests and local tooling; the Next.js server mints its own."""
    if not INTERNAL_API_SECRET:
        raise RuntimeError("INTERNAL_API_SECRET is not set")
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iss": INTERNAL_ISSUER,
        "aud": INTERNAL_AUDIENCE,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    if email:
        payload["email"] = email
    return jwt.encode(payload, INTERNAL_API_SECRET, algorithm="HS256")


_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Identity:
    """FastAPI dependency. Every per-user route depends on this."""
    if not configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Authentication is not configured on the backend. Set "
                "AUTH0_DOMAIN + AUTH0_API_AUDIENCE, or INTERNAL_API_SECRET."
            ),
        )
    if credentials is None or not credentials.credentials:
        raise _unauthorized("Missing bearer token")

    if auth0_mode():
        return _verify_auth0(credentials.credentials)
    return _verify_internal(credentials.credentials)
