"use client";

/**
 * Voice editing from inside the AR view — change the garden while looking at it.
 *
 * Same pipeline as the planner panel (`useVoiceGarden`), different chrome: one
 * mic button sized for a thumb, and a caption strip instead of a log, because
 * there is a camera feed underneath that should stay visible.
 *
 * Two things matter here that do not on the planner:
 *
 *   Pointer events are stopped at this component. The AR container listens for
 *   drags to look around when motion sensors are unavailable, and without this
 *   holding the mic button would also swing the camera.
 *
 *   Confirmation is on screen, never spoken. Talking back over a live mic
 *   invites feedback loops, and in a noisy room a caption is what actually
 *   gets read.
 */

import { useEffect, useRef, useState } from "react";

import { cx } from "@/lib/format";
import { useVoiceGarden, type ScaleChange } from "@/lib/use-voice-garden";

/** How long a confirmation stays up before the view is handed back. */
const CAPTION_MS = 4000;

export function ARVoiceControl({
  onScale,
}: {
  /** Lets "make it bigger" resize the view rather than the planting. */
  onScale: (change: ScaleChange) => string | null;
}) {
  const voice = useVoiceGarden({ onScale });
  const [caption, setCaption] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const latest = voice.log[0];
  useEffect(() => {
    const line = voice.problem || latest;
    if (!line) return;
    setCaption(line);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCaption(null), CAPTION_MS);
    return () => clearTimeout(timer.current);
  }, [latest, voice.problem]);

  // Keep the press from reaching the container's drag-to-look handler.
  const swallow = (event: React.PointerEvent) => event.stopPropagation();

  const label =
    voice.phase === "listening"
      ? voice.latched
        ? "Listening — tap to send"
        : "Listening…"
      : voice.phase === "thinking"
        ? "Thinking…"
        : voice.phase === "planting"
          ? "Replanting…"
          : "Tap to change the garden";

  return (
    <div className="pointer-events-none flex flex-col items-center gap-2">
      {voice.transcript && voice.phase !== "idle" ? (
        <p className="max-w-[85vw] truncate rounded-pill bg-black/60 px-4 py-1.5 text-xs italic text-white backdrop-blur">
          &ldquo;{voice.transcript}&rdquo;
        </p>
      ) : null}

      {caption ? (
        <p
          className={cx(
            "max-w-[85vw] rounded-pill px-4 py-1.5 text-xs font-semibold backdrop-blur",
            voice.problem ? "bg-[#8A3A12]/85 text-white" : "bg-white/90 text-forest",
          )}
        >
          {caption}
        </p>
      ) : null}

      {!voice.micUnavailable ? (
        <button
          type="button"
          disabled={voice.busy}
          onPointerDown={(event) => {
            swallow(event);
            voice.onPressStart();
          }}
          onPointerUp={(event) => {
            swallow(event);
            voice.onPressEnd();
          }}
          onPointerCancel={voice.onPressEnd}
          onPointerMove={swallow}
          className={cx(
            "pointer-events-auto flex items-center gap-2 rounded-pill px-5 py-2.5 text-sm font-semibold shadow-lift transition-colors",
            voice.phase === "listening"
              ? "bg-[#C9622F] text-white"
              : voice.busy
                ? "bg-white/80 text-forest"
                : "bg-forest text-cream",
          )}
        >
          <span
            className={cx(
              "h-2.5 w-2.5 rounded-full",
              voice.phase === "listening" ? "animate-pulse bg-white" : "bg-cream/70",
            )}
            aria-hidden="true"
          />
          {label}
        </button>
      ) : (
        <p className="pointer-events-none rounded-pill bg-black/60 px-4 py-1.5 text-[11px] text-white/90 backdrop-blur">
          Mic unavailable — edit from the garden plan
        </p>
      )}
    </div>
  );
}
