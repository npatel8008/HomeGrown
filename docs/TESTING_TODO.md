# What still needs testing

The MongoDB + Auth0 work has 30 automated tests, but they run against
`mongomock` and a stubbed JWKS. Everything that needs **real credentials, a
real browser, or a real phone** is unverified. This is that list, most
dangerous first.

Nobody should present the per-account story until items 1–4 are ticked.

---

## Already covered automatically

`cd backend && .venv/bin/python -m pytest tests/ -q` → 30 tests.

Two accounts against every door (read, overwrite, patch, delete by guessed id,
aggregate totals, naming another user in the request body), and token rejection
for: no token, wrong secret, expired, wrong audience, `alg: none`, wrong tenant,
wrong signing key. Plus: an unconfigured backend refuses rather than guessing.

What that does **not** prove is that any of it works when wired to the real
services.

---

## 1. Real MongoDB (Atlas)

Set `MONGODB_URI` in `backend/.env`, start the backend, then:

```bash
curl -s localhost:8000/api/health | python3 -m json.tool
```

`database.reachable` must be `true`. Known ways this fails:

- **Atlas IP allowlist** — add your current IP, or the demo machine's. Changing
  networks at a hackathon silently breaks this.
- **Password encoding** — `@`, `:`, `/` and `#` in the password must be
  percent-encoded in the URI, or the connection string parses wrong.
- **SRV DNS** (`mongodb+srv://`) fails on some locked-down networks.

## 2. Live Auth0 token issuance

Register the API in Auth0, set `AUTH0_API_AUDIENCE` on **both** sides, then
sign in and check `auth.mode` is `auth0-rs256` in `/api/health`.

- After changing the audience, **log out and back in**. An existing session
  holds a token minted for the old audience and will be rejected.
- Without a registered API, Auth0 issues an *opaque* token and the backend
  returns 401 `Invalid or expired access token`. That symptom means "no API
  registered", not "bad password".
- Confirm `getAccessToken()` actually returns a token — this call has never run
  against a live tenant.

## 3. Two accounts in a real browser — the decisive test

Sign in as account A, generate a layout, mark a task done on **Today**. Then in
a private window, sign in as account B.

B must see: no garden, no plantings, an empty care record. Then have B create
their own and confirm A's is untouched.

If B sees anything of A's, stop and treat it as a live data-leak bug.

## 4. Care round trip against real data

Mark a task done, confirm it appears in "Your care record", then open the Atlas
UI and check the `care_events` document carries **your** `user_id` (an Auth0
`sub` like `auth0|abc123`). An event with a missing or wrong `user_id` means
the identity plumbing is broken even if the UI looks right.

## 5. Layout regeneration must not erase care history

Regenerate the layout and confirm existing `care_events` survive and plantings
keep their original `planted_on`. The upsert path is written for this, but it
has only been exercised in memory.

## 6. Unique indexes on a real server

`mongomock`'s index emulation is not authoritative. On real Mongo, save twice
quickly and confirm you end up with exactly one `gardens` document per user and
one `plantings` document per `(user_id, plant_id)`.

## 7. Auth0 through the phone tunnel — **this will fail the first time**

Auth0 only redirects back to callback URLs it knows about. The
`trycloudflare.com` URL is different every run, so before testing on a phone,
add the current tunnel URL to the Auth0 application's **Allowed Callback URLs**
(`https://<tunnel>/auth/callback`), **Allowed Logout URLs** and **Allowed Web
Origins**, and set `APP_BASE_URL` to the same origin.

Symptom if you skip it: login bounces to an Auth0 error page rather than back
to the app.

Budget a minute for this every time the tunnel restarts, or use a stable
deployment URL instead.

## 8. The fallback path, on purpose

Unset `MONGODB_URI` (or stop the backend) and confirm the app still runs on
localStorage and *says so* — the Today page should show the "not switched on"
copy rather than an empty care record. A silent empty state here looks exactly
like data loss.

## 9. The AR view, on real phones

Verified so far: the garden composites over a camera feed, the device-orientation
camera rig anchors it in world space, both scales place correctly, and the
camera-denied and motion-denied fallbacks render. All of that was driven with a
**synthetic camera stream and synthetic orientation events** in a desktop
browser. Nothing below has run on real hardware.

- **iOS Safari.** The motion permission prompt only appears from a user gesture
  — confirm the "Start AR" tap produces it. Check Settings → Safari → Motion &
  Orientation Access when no prompt appears at all; that makes events silently
  never arrive, and the app should fall back to drag-to-look rather than freeze.
- **Android Chrome.** Orientation events arrive without a prompt; confirm the
  garden is stable and not mirrored or 90° out, especially in landscape.
- **Drift.** Compass-derived heading wanders. Stand still for a minute and see
  how far the garden creeps; "Move here" is the escape hatch.
- **Does it hold still?** The real test: place it, walk around it, turn away and
  back. It should stay where you put it.
- **Life-size scale.** Needs a few metres of room — confirm a 12x8 ft plot reads
  as believably person-sized outdoors, not toy-sized or enormous.
- **Thermals and battery.** Camera plus WebGL is the hottest thing this app
  does. Run it for five minutes and watch for throttling.
- **Landscape rotation** mid-session, and backgrounding the app and returning —
  the camera track should resume or fail with a message, not a black screen.

## 10. Voice control, with a real ElevenLabs key

> Note: with **no** key the web app uses the browser's own recogniser (Chrome
> and Safari yes, Firefox no) and works without ElevenLabs. The key upgrades
> the transcription, it does not switch the feature on.


The interpretation half has 29 tests and needs no key. The **transcription half
has never run against ElevenLabs** — there was no API key available.

- Set `ELEVENLABS_API_KEY` and confirm `/api/health` reports
  `speech_to_text: elevenlabs`, then hold the button and speak.
- **Verify the response field name.** `services/elevenlabs_stt.py` reads `text`
  and falls back to `transcription`; if the API returns something else the
  transcript comes back empty and the UI will say it heard nothing. This is the
  single most likely thing to be wrong.
- **Audio format.** Chrome records webm/opus, iOS Safari records mp4. Both are
  sent with a matching filename extension; confirm Scribe accepts each.
- Check the fallback chain by unsetting the key: browser speech recognition
  should take over (Chrome yes, Firefox no), and the text box always works.
- Try it in a **noisy room** — that is where push-to-talk earns itself, and
  where transcription quality actually gets decided.

---

## Worth testing if there is time

- **Second device adoption.** Sign in on a device with empty localStorage and
  confirm the saved garden is adopted. Then confirm it does **not** overwrite
  work in progress on a device that already has an unsaved garden.
- **Debounced writes.** Make several rapid edits and confirm the final state is
  what persists (`GardenSync` debounces at 1.2s).
- **Token expiry.** Leave a tab open past the token lifetime and confirm the
  next save still works. Internal tokens are minted per request (5 min TTL);
  the Auth0 refresh path is untested.
- **Concurrent users.** Two accounts using the app at the same time.

---

## Known gaps — built but not finished

- **No "delete my data" button.** The endpoint (`DELETE /api/me/data`) and the
  client function (`deleteMyData()` in `lib/api-me.ts`) both exist and are
  tested, but nothing on the account page calls them. Wire it up before anyone
  asks how to delete their data.
- **Voice in AR has not run on a real phone.** It was verified in a desktop
  browser with a stubbed microphone and a stubbed transcription response. On a
  phone, holding the mic button while the camera is live is the case to watch:
  confirm the press does not also swing the view, and that iOS grants camera
  and microphone in the same session.
- **No spoken replies.** Confirmations are on-screen text only; ElevenLabs
  text-to-speech is not wired up.
- **AR does not yet write to the care record.** Tapping a plant in AR shows its
  details but cannot log a watering — that link between the two features is
  still open.
- **`fallback.json` does not cover `/api/me/*`.** Offline mode has no bundled
  per-account data, by design — there is no such thing as a signed-in user
  offline. Worth knowing before testing offline behaviour.
