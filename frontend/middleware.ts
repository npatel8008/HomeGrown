import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isAuth0Configured } from "@/lib/auth-config";
import { isProtectedPath, loginHref } from "@/lib/auth-user";

export async function middleware(request: NextRequest) {
  if (!isAuth0Configured()) {
    return NextResponse.next();
  }

  const { getAuth0Client } = await import("@/lib/auth0");
  const auth0 = getAuth0Client();
  const authResponse = await auth0.middleware(request);
  const { pathname } = request.nextUrl;

  // Let the SDK own /auth/login, /auth/callback, /auth/logout, etc.
  if (pathname.startsWith("/auth")) {
    return authResponse;
  }

  if (isProtectedPath(pathname)) {
    const session = await auth0.getSession(request);
    if (!session) {
      const returnTo = `${pathname}${request.nextUrl.search}`;
      return NextResponse.redirect(new URL(loginHref(returnTo), request.nextUrl.origin));
    }
  }

  return authResponse;
}

export const config = {
  matcher: [
    /*
     * Skip static assets and the FastAPI proxy. Auth lives at /auth/*, not
     * /api/*, so the backend rewrite in next.config.mjs is left alone.
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/).*)",
  ],
};
