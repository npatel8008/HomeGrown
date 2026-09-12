import { redirect } from "next/navigation";

import { UserAvatar } from "@/components/auth/UserMenu";
import { PageHeader } from "@/components/layout/PageHeader";
import { displayName, LOGOUT_HREF } from "@/lib/auth-user";
import { getSessionUser, isAuth0Configured } from "@/lib/auth0";

export default async function AccountPage() {
  if (!isAuth0Configured()) {
    redirect("/");
  }

  const user = await getSessionUser();
  if (!user) {
    redirect("/auth/login?returnTo=/account");
  }

  const name = displayName(user);

  return (
    <div className="section pt-10">
      <PageHeader
        eyebrow="Account"
        title="Your HomeGrown account"
        description="You're signed in with Auth0. Your garden plan and care record are saved to your account."
      />

      <section className="card mt-8 max-w-xl p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <UserAvatar user={user} size="lg" />
          <div className="min-w-0">
            <h2 className="font-display text-xl text-forest">{name}</h2>
            {user.email ? <p className="mt-0.5 truncate text-sm text-ink-muted">{user.email}</p> : null}
          </div>
        </div>

        <dl className="mt-8 grid gap-4 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Name</dt>
            <dd className="mt-1 text-forest">{user.name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Email</dt>
            <dd className="mt-1 text-forest">{user.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Auth0 user id</dt>
            <dd className="mt-1 break-all font-mono text-xs text-ink-muted">{user.sub}</dd>
          </div>
        </dl>

        <div className="mt-8 flex flex-wrap gap-2">
          <a href={LOGOUT_HREF} className="btn-secondary">
            Log out
          </a>
        </div>
      </section>
    </div>
  );
}
