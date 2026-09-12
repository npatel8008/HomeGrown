/**
 * Mints the bearer token the FastAPI backend will accept for the signed-in user.
 *
 * Server-only. The browser never sees these tokens: it sends its Auth0 session
 * cookie to our own route handlers, and those attach a token on the way out.
 *
 * Two modes, matching `backend/services/auth.py`:
 *
 *   AUTH0_API_AUDIENCE set — ask Auth0 for a real access token for that API.
 *     The backend verifies it against the tenant's JWKS. Requires an API to be
 *     registered in the Auth0 dashboard.
 *
 *   otherwise — mint a short-lived HS256 token carrying the session's `sub`,
 *     signed with INTERNAL_API_SECRET, which only this server and the backend
 *     know. Useful when you do not want to configure an Auth0 API.
 */

import { createHmac } from "node:crypto";

import { getAuth0Client } from "./auth0";

const INTERNAL_ISSUER = "gardenai-frontend";
const INTERNAL_AUDIENCE = "gardenai-backend";
const INTERNAL_TTL_SECONDS = 300;

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Minimal HS256 JWT. Hand-rolled to avoid a dependency for ~15 lines. */
function signInternalToken(subject: string, secret: string, email?: string): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload: Record<string, unknown> = {
    sub: subject,
    iss: INTERNAL_ISSUER,
    aud: INTERNAL_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + INTERNAL_TTL_SECONDS,
  };
  if (email) payload.email = email;

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = base64url(createHmac("sha256", secret).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

export function backendAuthMode(): "auth0" | "internal" | "unconfigured" {
  if (process.env.AUTH0_API_AUDIENCE) return "auth0";
  if (process.env.INTERNAL_API_SECRET) return "internal";
  return "unconfigured";
}

/**
 * @returns a bearer token for `subject`, or null when the backend has no way to
 *          verify one — in which case the caller must not pretend it saved.
 */
export async function backendTokenFor(subject: string, email?: string): Promise<string | null> {
  if (process.env.AUTH0_API_AUDIENCE) {
    try {
      const { token } = await getAuth0Client().getAccessToken();
      return token ?? null;
    } catch (error) {
      console.error("Could not get an Auth0 access token for the backend:", error);
      return null;
    }
  }

  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return null;
  return signInternalToken(subject, secret, email);
}
