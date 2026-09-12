import type { ReactNode } from "react";

import { AlertIcon } from "./Icons";

/**
 * Shown when the data on screen came from bundled fallback rather than the
 * backend.
 *
 * Takes an optional `action` so the notice can offer a way out. Telling
 * someone their data is stale without giving them a way to refresh it just
 * leaves them stuck redoing the whole flow.
 */
export function OfflineNotice({
  message,
  action,
}: {
  message?: string;
  action?: ReactNode;
}) {
  if (!message) return null;
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-card border border-[#F0DDBB] bg-[#FDF7EC] px-4 py-3 text-sm text-[#7A5418]">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <p className="min-w-[16rem] flex-1">
        <span className="font-semibold">Offline demo mode.</span> {message}
      </p>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
