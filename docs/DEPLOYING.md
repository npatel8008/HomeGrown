# Deploying HomeGrown

Two hosts, on purpose:

| Piece | Host | Why |
|---|---|---|
| Next.js frontend | Vercel | It's a Next app. Nothing exotic. |
| FastAPI backend | Render | Needs a **persistent process** — see below. |
| MongoDB | Atlas | Already provisioned. |

**Why the backend isn't on Vercel.** Serverless functions have a wall-clock cap
per invocation, and two of these endpoints don't fit inside a small one:
`/api/analyze-food` and `/api/recommend-crops` measure 7–15s typically, and up
to ~50s in the worst case (`IFM_TIMEOUT=25` × 2 attempts). The backend also
leans on in-process caches — a climate lookup is ~950ms cold and ~3ms cached —
which only pay off if the process stays alive between requests. A long-lived
MongoDB connection pool matters for the same reason.

Nothing about the code prevents a serverless deploy; it would just be slower and
time out more. If you ever want to try it, cut `IFM_TIMEOUT` to ~12 and
`MAX_ATTEMPTS` to 1 first.

---

## Who talks to whom

```
Browser ──▶ Vercel (Next.js) ──▶ Render (FastAPI) ──▶ MongoDB Atlas
                              ▲
                   BACKEND_ORIGIN points here
```

The browser **never** calls Render directly. Vercel proxies:

* `/api/*` — server-side rewrite in `next.config.mjs`
* `/api/me/*` — `app/api/me/[...path]/route.ts`, which checks the Auth0 session
  and attaches a token the backend verifies

Two consequences worth internalising:

1. **Leave `NEXT_PUBLIC_API_URL` empty on Vercel.** Empty means same-origin,
   which routes through the proxy. Setting it makes the browser call Render
   directly, which needs CORS and loses the session on `/api/me/*`.
2. **The IP Atlas sees is Render's, not Vercel's.** Allowlisting Vercel does
   nothing.

---

## Steps

### 1. Rotate the database password first

If the current password has ever been pasted into a chat, a ticket or a shared
doc, change it in Atlas → Database Access before step 2. Once the allowlist is
open, that password is the only thing protecting the data.

### 2. Atlas → Network Access

Render's free tier has **dynamic egress IPs**, so there is no single address to
allow. Add `0.0.0.0/0` (allow from anywhere).

This is normal for a hackathon and it is also exactly why step 1 matters: with
the allowlist open, the credential is the entire security boundary. Static
egress IPs need Render's paid tier or an Atlas Private Endpoint (M10+).

### 3. Render → New → Blueprint

Point it at this repo. It reads `render.yaml` from the root and creates a web
service rooted at `backend/`. You'll be prompted for the four secrets marked
`sync: false`:

| Variable | Value |
|---|---|
| `MONGODB_URI` | your Atlas connection string (the rotated one) |
| `INTERNAL_API_SECRET` | `openssl rand -hex 32` — keep it, you need it again in step 5 |
| `IFM_API_KEY` | your IFM key. Optional: without it, extraction falls back to the keyword matcher and the UI says so |
| `ALLOWED_ORIGINS` | your Vercel URL, e.g. `https://homegrown.vercel.app` |

Everything else (`PYTHON_VERSION`, model names, timeouts) is preset in
`render.yaml`.

### 4. Check the backend came up

```bash
curl https://<your-service>.onrender.com/api/health
```

The response reports every subsystem, so a bad deploy is obvious:

```json
{
  "auth":     { "configured": true, "mode": "internal-hs256" },
  "database": { "configured": true, "reachable": true },
  "systems":  { "ingredient_extraction": "llm", ... }
}
```

`"reachable": false` means Atlas is refusing the connection — go back to step 2.
`"configured": false` under `auth` means `INTERNAL_API_SECRET` didn't get set.

### 5. Vercel → Settings → Environment Variables

| Variable | Value |
|---|---|
| `BACKEND_ORIGIN` | `https://<your-service>.onrender.com` — no trailing slash |
| `INTERNAL_API_SECRET` | **byte-identical** to step 3 |
| `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET` | from your Auth0 app |
| `APP_BASE_URL` | your Vercel URL |
| `NEXT_PUBLIC_API_URL` | **leave unset** (see above) |

Redeploy after adding them — Vercel does not apply env changes to an existing
build.

### 6. Auth0 → Applications → your app → Settings

Add the Vercel URL to both lists, or login fails in production:

* **Allowed Callback URLs**: `https://<your-app>.vercel.app/auth/callback`
* **Allowed Logout URLs**: `https://<your-app>.vercel.app`

---

## Verifying end to end

1. Open the Vercel URL. No "Offline demo mode" banner → Vercel is reaching Render.
2. Sign in. The account page loads → Auth0 and the internal token both work.
3. Build a plan, then press **Start growing** on the garden page.
4. Reload. The season is still there → MongoDB is persisting per account.
5. Open **Today**. Crop progress with real dates → the schedule engine is live.

If step 1 shows the offline banner, `BACKEND_ORIGIN` is wrong or Render is
asleep. If step 4 loses the garden, check `/api/health` for
`database.reachable`.

---

## Known rough edges

* **Render free tier sleeps** after ~15 minutes idle, and the next request pays
  a ~50s cold start. Hit the URL a few minutes before demoing. A paid instance
  or an external uptime pinger both fix it.
* **`cryptography` is pinned** in `requirements.txt`. `pyjwt[crypto]` only asks
  for `>=3.4.0`, so an unpinned resolve can pick a source-only release and then
  need a Rust toolchain — which fails the build. Don't unpin it without testing
  a clean install.
* **The demo works without any of this.** With no backend reachable the app
  falls back to bundled data and says so; with no database, planning works and
  only per-account saving is off.
