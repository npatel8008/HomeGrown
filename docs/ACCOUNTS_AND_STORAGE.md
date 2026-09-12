# Accounts and per-user storage

Every gardener's plan and care record lives in MongoDB, scoped to their Auth0
account. This document covers the security model, the setup, and — importantly
— what has and has not been tested.

## The security model

The rule the whole design turns on:

> The backend derives the user id from a **cryptographically verified token**,
> and never from anything the caller can choose.

Concretely:

- `backend/services/auth.py` is the only place identity is established. It
  returns an `Identity` or raises; there is no third outcome.
- `backend/services/user_store.py` takes `user_id` as the first argument of
  every function, and every Mongo filter includes it. Nothing is exported that
  would let a caller run an unscoped query, so a route *cannot* opt out of
  isolation.
- Routes in `backend/routes/me.py` pass `identity.user_id` from the auth
  dependency. A `user_id` in a request body is stripped and ignored.
- Reaching for somebody else's record returns **404, not 403** — from that
  caller's perspective it does not exist, and that is all they learn.

### Why `/api/me/*` is not proxied like everything else

`next.config.mjs` rewrites `/api/*` straight to FastAPI, and `middleware.ts`
deliberately skips `/api/`. That combination is fine for the stateless
endpoints, and fatal for per-user ones: the backend would receive an anonymous
request. So `/api/me/*` is excluded from the rewrite and served by
`frontend/app/api/me/[...path]/route.ts`, which runs on the server, checks the
Auth0 session, and attaches a token. **Removing that exclusion silently turns
off authentication** — the requests would still succeed, just without an
identity.

### Failing closed

Everything else in this codebase degrades to an offline fallback. Auth does
not. With no auth configured, `/api/me/*` returns 503 rather than assuming a
user, because the failure mode of guessing is showing one person another
person's data. The frontend treats 503 as "keep using localStorage and say so
in the UI".

## Setup

### 1. MongoDB

Any MongoDB will do; Atlas' free tier is easiest. In `backend/.env`:

```
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DB=gardenai
```

Collections (`gardens`, `plantings`, `care_events`) and their indexes are
created on first use. No migration step.

### 2. Telling the backend who is calling — pick one

**A. Auth0 API (recommended).** Auth0 Dashboard → Applications → APIs → Create
API. Use its *Identifier* as the audience in both places:

```
# backend/.env
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_API_AUDIENCE=https://api.gardenai.example.com

# frontend/.env.local
AUTH0_API_AUDIENCE=https://api.gardenai.example.com
```

Auth0 then issues real JWTs, and the backend verifies each one against your
tenant's published JWKS, checking signature, issuer, audience and expiry.
Without a registered API, Auth0 issues an *opaque* token that no third party
can verify — which is why this cannot be skipped.

**B. Shared secret.** If you would rather not register an API, the Next.js
server mints a short-lived HS256 token for the session it has already verified:

```
# both backend/.env and frontend/.env.local, same value
INTERNAL_API_SECRET=<openssl rand -hex 32>
```

The browser never sees this token. Keep the backend on localhost or a private
network when using this mode, and never commit the secret.

Set neither and per-account features stay switched off.

## What the tests cover

```bash
cd backend && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/python -m pytest tests/ -q
```

30 tests, split in two:

- `tests/test_user_data_isolation.py` — two accounts, every door. Reading,
  overwriting, patching, deleting by guessed id, aggregate totals, and naming
  another user in the request body. Plus: no token, wrong secret, expired,
  wrong audience, and an `alg: none` downgrade.
- `tests/test_auth0_tokens.py` — the RS256 path with a throwaway keypair and a
  stubbed JWKS: valid token accepted, isolation holds, and tokens from another
  tenant, for another audience, expired, or signed by the wrong key are all
  rejected. Also asserts an internal token is not a backdoor while in Auth0
  mode, and that an unconfigured backend refuses rather than guessing.

## What is NOT tested

Be aware of these before demoing:

- **No real MongoDB.** Tests run against `mongomock` in memory. Connection
  handling, Atlas auth/IP allowlisting, and real unique-index enforcement have
  not been exercised.
- **No live Auth0 tenant.** Token verification is tested with a local keypair
  and a stubbed JWKS. The `getAccessToken()` call and the audience round trip
  through a real tenant are unverified.
- **No browser end-to-end run**, because that needs both of the above.

The first real run should be: sign in, generate a layout, mark a task done,
then sign in as a second account and confirm the first account's garden is not
visible.

The full hand-testing checklist, in priority order, is in
**[TESTING_TODO.md](TESTING_TODO.md)**.
