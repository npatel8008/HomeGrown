/**
 * Client-safe user shape. Keep this free of the Auth0 SDK so nav and other
 * client components can type the session without pulling in server code.
 */
export type AuthUser = {
  sub: string;
  name?: string;
  nickname?: string;
  email?: string;
  picture?: string;
};

export function displayName(user: AuthUser): string {
  return user.name || user.nickname || user.email || "Gardener";
}

export function userInitials(user: AuthUser): string {
  const label = displayName(user);
  const parts = label.replace(/@.*/, "").trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return (parts[0] ?? "U").slice(0, 2).toUpperCase();
}

export function loginHref(returnTo?: string, signup = false): string {
  const params = new URLSearchParams();
  if (returnTo) params.set("returnTo", returnTo);
  if (signup) params.set("screen_hint", "signup");
  const query = params.toString();
  return query ? `/auth/login?${query}` : "/auth/login";
}

export const LOGOUT_HREF = "/auth/logout";

/** Pages that require a session once Auth0 is configured. */
export const PROTECTED_PATHS = [
  "/onboarding",
  "/profile",
  "/recommendations",
  "/garden",
  "/today",
  "/account",
] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
