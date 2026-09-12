import type { AuthUser } from "@/lib/auth-user";
import { loginHref } from "@/lib/auth-user";

/** Plain <a> tags — Auth0 warns against next/link prefetch on /auth/login. */
export function AuthButtons({
  returnTo = "/onboarding/food",
  compact = false,
  showSignup = true,
}: {
  returnTo?: string;
  compact?: boolean;
  showSignup?: boolean;
}) {
  const loginClass = compact
    ? "btn-secondary !px-3.5 !py-2.5 !text-[13px]"
    : "btn-secondary";
  const signupClass = compact
    ? "btn-primary !px-3.5 !py-2.5 !text-[13px]"
    : "btn-primary";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={loginHref(returnTo)} className={loginClass}>
        Log in
      </a>
      {showSignup ? (
        <a href={loginHref(returnTo, true)} className={signupClass}>
          Sign up
        </a>
      ) : null}
    </div>
  );
}

export function AuthStatusLine({
  authEnabled,
  user,
}: {
  authEnabled: boolean;
  user: AuthUser | null;
}) {
  if (!authEnabled) {
    return <>No account needed. Demo data is bundled — nothing leaves your machine.</>;
  }
  if (user) {
    return <>Signed in as {user.name || user.email || "you"}.</>;
  }
  return <>Sign in to start building your garden.</>;
}
