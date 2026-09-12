"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { AuthButtons } from "@/components/auth/AuthButtons";
import { UserMenu } from "@/components/auth/UserMenu";
import { LeafIcon } from "@/components/ui/Icons";
import type { AuthUser } from "@/lib/auth-user";
import { LOGOUT_HREF, loginHref } from "@/lib/auth-user";
import { cx } from "@/lib/format";
import { useGardenStore } from "@/lib/store";

/**
 * `label` is the compact form used in the top bar, which has to fit six links
 * plus a CTA and the account menu. `longLabel` is the unambiguous version used
 * in the mobile sheet, where there is room.
 */
const LINKS = [
  { href: "/", label: "Home", longLabel: "Home" },
  { href: "/profile", label: "Food Profile", longLabel: "My Food Profile" },
  { href: "/recommendations", label: "Crops", longLabel: "Crop Recommendations" },
  { href: "/garden", label: "Garden Plan", longLabel: "Garden Plan" },
  { href: "/garden/3d", label: "3D", longLabel: "3D Garden" },
  { href: "/garden/ar", label: "AR", longLabel: "AR Garden" },
  { href: "/today", label: "Today", longLabel: "Today" },
];

export function AppNav({
  authEnabled = false,
  user = null,
}: {
  authEnabled?: boolean;
  user?: AuthUser | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { progress } = useGardenStore();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/85 backdrop-blur-md">
      <nav className="section flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5"
          onClick={() => setOpen(false)}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest text-cream">
            <LeafIcon className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-forest whitespace-nowrap">
            GardenAI
          </span>
        </Link>

        <ul className="hidden items-center gap-0.5 xl:flex">
          {LINKS.slice(1).map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cx(
                  "block whitespace-nowrap rounded-pill px-3 py-2 text-sm font-medium transition-colors",
                  isActive(link.href)
                    ? "bg-sage text-forest"
                    : "text-ink-muted hover:bg-sage-tint hover:text-forest",
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={progress.recommendations ? "/recommendations" : "/onboarding/food"}
            className="btn-primary hidden whitespace-nowrap !py-2.5 !text-[13px] sm:inline-flex"
          >
            {progress.recommendations ? "My garden" : "Build my garden"}
          </Link>
          {authEnabled ? (
            user ? (
              <UserMenu user={user} />
            ) : (
              <div className="hidden sm:flex">
                <AuthButtons compact showSignup={false} returnTo={pathname || "/onboarding/food"} />
              </div>
            )
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            aria-expanded={open}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-forest xl:hidden"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path
                d={open ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"}
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </nav>

      {open ? (
        <div className="border-t border-line bg-cream xl:hidden">
          <ul className="section flex flex-col py-3">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "block rounded-xl px-3 py-2.5 text-sm font-medium",
                    isActive(link.href) ? "bg-sage text-forest" : "text-ink-muted",
                  )}
                >
                  {link.longLabel}
                </Link>
              </li>
            ))}
            {authEnabled ? (
              <li className="mt-2 border-t border-line pt-2">
                {user ? (
                  <>
                    <Link
                      href="/account"
                      onClick={() => setOpen(false)}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted"
                    >
                      Account
                    </Link>
                    <a
                      href={LOGOUT_HREF}
                      className="block rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted"
                    >
                      Log out
                    </a>
                  </>
                ) : (
                  <div className="flex flex-col gap-1 px-3 py-2">
                    <a href={loginHref(pathname || "/onboarding/food")} className="btn-secondary w-full">
                      Log in
                    </a>
                    <a href={loginHref(pathname || "/onboarding/food", true)} className="btn-primary w-full">
                      Sign up
                    </a>
                  </div>
                )}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </header>
  );
}
