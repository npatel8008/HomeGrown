/**
 * Auth0 server client.
 *
 * Instantiated lazily so the rest of the app still boots when the Auth0 env
 * vars are missing — the demo originally ran with no auth at all.
 */

import { Auth0Client } from "@auth0/nextjs-auth0/server";

import { isAuth0Configured } from "./auth-config";
import { type AuthUser } from "./auth-user";

export { isAuth0Configured } from "./auth-config";

let client: Auth0Client | undefined;

export function getAuth0Client(): Auth0Client {
  if (!isAuth0Configured()) {
    throw new Error("Auth0 is not configured. Set AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, and AUTH0_SECRET.");
  }
  if (!client) {
    client = new Auth0Client({
      signInReturnToPath: "/",
      authorizationParameters: {
        scope: "openid profile email",
        // Only when an API is registered in Auth0. Without it the tenant issues
        // an opaque access token, which the FastAPI backend cannot verify — see
        // lib/backend-token.ts for the fallback that covers that case.
        ...(process.env.AUTH0_API_AUDIENCE
          ? { audience: process.env.AUTH0_API_AUDIENCE }
          : {}),
      },
    });
  }
  return client;
}

export async function getSessionUser(): Promise<AuthUser | null> {
  if (!isAuth0Configured()) return null;
  try {
    const session = await getAuth0Client().getSession();
    const user = session?.user;
    if (!user?.sub) return null;
    return {
      sub: user.sub,
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      picture: user.picture,
    };
  } catch {
    return null;
  }
}
