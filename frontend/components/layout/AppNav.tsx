"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cx } from "@/lib/format";
import { useGardenStore } from "@/lib/store";
import { LeafIcon } from "@/components/ui/Icons";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/profile", label: "My Food Profile" },
  { href: "/recommendations", label: "Recommendations" },
  { href: "/garden", label: "Garden Plan" },
  { href: "/garden/3d", label: "3D Garden" },
  { href: "/today", label: "Today" },
];

export function AppNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { progress } = useGardenStore();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-cream/85 backdrop-blur-md">
      <nav className="section flex h-16 items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest text-cream">
            <LeafIcon className="h-5 w-5" />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight text-forest">
            GardenAI
          </span>
        </Link>

        <ul className="hidden items-center gap-1 lg:flex">
          {LINKS.slice(1).map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className={cx(
                  "rounded-pill px-3.5 py-2 text-sm font-medium transition-colors",
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

        <div className="flex items-center gap-2">
          <Link
            href={progress.recommendations ? "/recommendations" : "/onboarding/food"}
            className="btn-primary hidden !py-2.5 !text-[13px] sm:inline-flex"
          >
            {progress.recommendations ? "My garden plan" : "Build my garden"}
          </Link>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-label="Toggle navigation"
            aria-expanded={open}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-white text-forest lg:hidden"
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
        <div className="border-t border-line bg-cream lg:hidden">
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
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </header>
  );
}
