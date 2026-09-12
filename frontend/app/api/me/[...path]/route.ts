/**
 * Authenticated proxy to the backend's per-user endpoints.
 *
 * `/api/*` is rewritten straight to FastAPI by next.config.mjs and is skipped
 * by the Auth0 middleware, so it carries no identity. Anything touching a
 * user's own data has to come through here instead: this handler runs on the
 * server, verifies the Auth0 session cookie, and attaches a token the backend
 * can verify. A request with no valid session never reaches the backend.
 *
 * The route handler wins over the next.config.mjs rewrite because rewrites
 * returned as a plain array are `afterFiles` — they only apply when no
 * filesystem route matched. The rewrite also excludes /api/me explicitly.
 */

import { NextResponse, type NextRequest } from "next/server";

import { backendTokenFor } from "@/lib/backend-token";
import { getSessionUser, isAuth0Configured } from "@/lib/auth0";

const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

async function proxy(request: NextRequest, path: string[]): Promise<NextResponse> {
  if (!isAuth0Configured()) {
    return NextResponse.json(
      { detail: "Auth0 is not configured, so there is no account to store data against." },
      { status: 503 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ detail: "Not signed in" }, { status: 401 });
  }

  const token = await backendTokenFor(user.sub, user.email);
  if (!token) {
    return NextResponse.json(
      {
        detail:
          "No backend credential available. Set AUTH0_API_AUDIENCE (and register that API " +
          "in Auth0), or set INTERNAL_API_SECRET on both the frontend and the backend.",
      },
      { status: 503 },
    );
  }

  const target = new URL(
    `/api/me/${path.join("/")}${request.nextUrl.search}`,
    BACKEND_ORIGIN,
  );

  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

  try {
    const response = await fetch(target, {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("content-type") ?? "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
      cache: "no-store",
    });

    // 204 and friends must not be given a body.
    if (response.status === 204 || response.status === 205) {
      return new NextResponse(null, { status: response.status });
    }

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch (error) {
    console.error("Backend proxy failed:", error);
    return NextResponse.json(
      { detail: "The backend is unreachable, so nothing was saved." },
      { status: 502 },
    );
  }
}

type Context = { params: { path: string[] } };

export async function GET(request: NextRequest, { params }: Context) {
  return proxy(request, params.path);
}
export async function POST(request: NextRequest, { params }: Context) {
  return proxy(request, params.path);
}
export async function PUT(request: NextRequest, { params }: Context) {
  return proxy(request, params.path);
}
export async function PATCH(request: NextRequest, { params }: Context) {
  return proxy(request, params.path);
}
export async function DELETE(request: NextRequest, { params }: Context) {
  return proxy(request, params.path);
}

// Session cookies must be read per request.
export const dynamic = "force-dynamic";
