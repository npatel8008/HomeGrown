import { AlertIcon } from "./Icons";

/** Shown when the API client had to fall back to bundled demo data. */
export function OfflineNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-3 rounded-card border border-[#F0DDBB] bg-[#FDF7EC] px-4 py-3 text-sm text-[#7A5418]">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">Offline demo mode.</span> {message}
      </p>
    </div>
  );
}
