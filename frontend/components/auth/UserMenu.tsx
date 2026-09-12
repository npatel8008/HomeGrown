"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { AuthUser } from "@/lib/auth-user";
import { displayName, LOGOUT_HREF, userInitials } from "@/lib/auth-user";
import { cx } from "@/lib/format";

export function UserMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const name = displayName(user);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-pill border border-line bg-white py-1 pl-1 pr-3 text-sm font-medium text-forest transition-colors hover:border-moss/50 hover:bg-sage-tint"
      >
        <UserAvatar user={user} size="sm" />
        <span className="hidden max-w-[7rem] truncate whitespace-nowrap lg:inline">{name}</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-white py-1.5 shadow-lift"
        >
          <div className="border-b border-line px-3.5 py-2.5">
            <p className="truncate text-sm font-semibold text-forest">{name}</p>
            {user.email ? (
              <p className="truncate text-xs text-ink-faint">{user.email}</p>
            ) : null}
          </div>
          <a
            href="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3.5 py-2.5 text-sm text-ink-muted hover:bg-sage-tint hover:text-forest"
          >
            Account
          </a>
          <a
            href={LOGOUT_HREF}
            role="menuitem"
            className="block px-3.5 py-2.5 text-sm text-ink-muted hover:bg-sage-tint hover:text-forest"
          >
            Log out
          </a>
        </div>
      ) : null}
    </div>
  );
}

export function UserAvatar({
  user,
  size = "md",
}: {
  user: AuthUser;
  size?: "sm" | "md" | "lg";
}) {
  const box = size === "sm" ? "h-8 w-8 text-[11px]" : size === "lg" ? "h-16 w-16 text-lg" : "h-10 w-10 text-sm";
  const initials = userInitials(user);

  if (user.picture) {
    return (
      // Auth0 picture URLs come from Google/GitHub/etc.; a plain img avoids
      // configuring every identity provider in next.config images.domains.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.picture}
        alt=""
        referrerPolicy="no-referrer"
        className={cx(box, "rounded-full object-cover")}
      />
    );
  }

  return (
    <span
      className={cx(
        box,
        "inline-flex items-center justify-center rounded-full bg-forest font-semibold text-cream",
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
