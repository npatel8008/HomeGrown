"use client";

/**
 * Talk to the garden, from the planner.
 *
 * Chrome around `useVoiceGarden`, which owns the actual pipeline and is shared
 * with the AR overlay. Push-to-talk rather than always-listening: a hackathon
 * room is loud, and a mic that opens itself will pick up the person demoing at
 * the next table.
 */

import { useState } from "react";

import { cx } from "@/lib/format";
import { useVoiceGarden, type VoicePhase } from "@/lib/use-voice-garden";

function buttonLabel(phase: VoicePhase, latched: boolean): string {
  if (phase === "listening") return latched ? "Listening — tap to send" : "Listening…";
  if (phase === "thinking") return "Working out what you meant…";
  if (phase === "planting") return "Replanting…";
  return "Tap or hold to talk";
}

export function VoiceGardenControl() {
  const voice = useVoiceGarden();
  const [typed, setTyped] = useState("");

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg text-forest">Change it by voice</h2>
        <span className="text-[11px] text-ink-faint">Tap, speak, tap</span>
      </div>

      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
        Try &ldquo;add basil and mint&rdquo;, &ldquo;remove the kale&rdquo;, &ldquo;six
        tomatoes&rdquo;, &ldquo;double the lettuce&rdquo;, or &ldquo;undo&rdquo;.
      </p>
      {voice.engine === "browser" ? (
        <p className="mt-1 text-[11px] text-ink-faint">
          Using this browser&apos;s speech recognition — set{" "}
          <code className="rounded bg-cream-deep px-1 py-0.5">ELEVENLABS_API_KEY</code> on the
          backend for ElevenLabs.
        </p>
      ) : null}

      {!voice.micUnavailable ? (
        <button
          type="button"
          disabled={voice.busy}
          onPointerDown={voice.onPressStart}
          onPointerUp={voice.onPressEnd}
          onPointerCancel={voice.onPressEnd}
          className={cx(
            "mt-4 flex w-full items-center justify-center gap-2 rounded-pill px-5 py-3.5 text-sm font-semibold transition-colors",
            voice.phase === "listening"
              ? "bg-[#C9622F] text-white"
              : voice.busy
                ? "bg-sage text-forest"
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
          {buttonLabel(voice.phase, voice.latched)}
        </button>
      ) : null}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = typed.trim();
          if (!text || voice.busy) return;
          setTyped("");
          void voice.run(text);
        }}
      >
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder={voice.micUnavailable ? "Type a change…" : "…or type it"}
          className="min-w-0 flex-1 rounded-xl border border-line bg-white px-3 py-2.5 text-sm text-forest placeholder:text-ink-faint"
        />
        <button type="submit" className="btn-secondary !py-2.5" disabled={voice.busy}>
          Apply
        </button>
      </form>

      {voice.transcript ? (
        <p className="mt-3 rounded-xl bg-sage-tint px-3.5 py-2.5 text-sm italic text-forest">
          &ldquo;{voice.transcript}&rdquo;
        </p>
      ) : null}

      {voice.problem ? <p className="mt-2 text-xs text-[#A0522A]">{voice.problem}</p> : null}

      {voice.log.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {voice.log.map((line, index) => (
            <li
              key={`${line}-${index}`}
              className={cx("text-xs", index === 0 ? "font-semibold text-forest" : "text-ink-muted")}
            >
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
