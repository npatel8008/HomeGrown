"use client";

/**
 * The voice-editing pipeline, shared by the planner panel and the AR overlay.
 *
 * Speech -> transcript -> validated commands -> crop selection -> the ordinary
 * layout call. One place decides what "remove the kale" means; both surfaces
 * are chrome around it.
 *
 * Pressing the button is a tap OR a hold, deliberately. Push-to-talk alone
 * looked broken to anyone who clicked it and then started talking: the
 * recording began and ended inside the click, and every attempt came back "too
 * short to hear". So a quick tap latches recording on until the next tap, and
 * a real press-and-hold records for as long as it is held.
 *
 * Which recogniser runs is decided up front from /api/health rather than by
 * failing over mid-attempt. Asking someone to say it a second time because the
 * first recording could not be transcribed is a worse experience than simply
 * using the recogniser that is actually available.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { generateLayout, getHealth } from "./api";
import { applyCommands, layoutCropsFor, type GardenSelection } from "./garden-commands";
import { useGardenStore } from "./store";
import {
  browserSpeechSupported,
  interpret,
  startBrowserRecognition,
  transcribeAudio,
  type BrowserListener,
} from "./voice";

export type VoicePhase = "idle" | "listening" | "thinking" | "planting";

/** "make it bigger" changes how the garden is drawn, not what is planted. */
export interface ScaleChange {
  factor?: number | null;
  percent?: number | null;
}

export interface VoiceGardenOptions {
  /**
   * Handles resize commands, returning the line to show. Only the AR view can
   * honour these; without a handler they are reported as such rather than
   * silently ignored.
   */
  onScale?: (change: ScaleChange) => string | null;
}

/** Which recogniser this session will use. */
type Engine = "unknown" | "elevenlabs" | "browser" | "none";

/** A press shorter than this latches recording on instead of ending it. */
const TAP_MS = 400;
/** Chunk interval. Without one, a short recording can yield a header and nothing else. */
const CHUNK_MS = 250;
/** A latched recording stops itself rather than holding the mic open forever. */
const MAX_RECORDING_MS = 20000;
/** Below this there is no speech in the buffer, only container overhead. */
const MIN_AUDIO_BYTES = 900;
const UNDO_DEPTH = 10;

export function useVoiceGarden({ onScale }: VoiceGardenOptions = {}) {
  const { state, update } = useGardenStore();
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [problem, setProblem] = useState("");
  const [micUnavailable, setMicUnavailable] = useState(false);
  const [engine, setEngine] = useState<Engine>("unknown");
  /** True while a tap has latched recording on, so the UI can say "Tap to stop". */
  const [latched, setLatched] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const listener = useRef<BrowserListener | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const history = useRef<GardenSelection[]>([]);

  const pressedAt = useRef(0);
  const isLatched = useRef(false);
  const ignoreNextRelease = useRef(false);
  /** Set when the button is released before getUserMedia has resolved. */
  const stopWhenReady = useRef(false);
  const maxTimer = useRef<ReturnType<typeof setTimeout>>();

  // Decide the recogniser once. A 503 from /api/voice/transcribe would tell us
  // the same thing, but only after the user had already spoken.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const health = await getHealth();
      if (cancelled) return;
      const backendHasStt = health.data.systems?.speech_to_text === "elevenlabs";
      if (backendHasStt) return setEngine("elevenlabs");
      setEngine(browserSpeechSupported() ? "browser" : "none");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const releaseMic = useCallback(() => {
    clearTimeout(maxTimer.current);
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
    listener.current = null;
    isLatched.current = false;
    setLatched(false);
  }, []);

  useEffect(() => releaseMic, [releaseMic]);

  const regenerate = useCallback(
    async (selection: GardenSelection) => {
      const crops = layoutCropsFor(selection, state.recommendations);
      if (crops.length === 0) {
        update({ ...selection, layout: null });
        return;
      }
      const result = await generateLayout({
        plot: state.space.plot,
        garden_type: state.space.garden_type,
      max_bed_depth_ft: state.space.max_bed_depth_ft ?? null,
        crops,
      });
      update({ ...selection, layout: result.data, layoutOffline: result.usedFallback });
    },
    [state.recommendations, state.space, update],
  );

  /** The one path every input method funnels into. */
  const run = useCallback(
    async (text: string) => {
      setTranscript(text);
      setProblem("");
      setPhase("thinking");

      const result = await interpret(text);
      if (!result || !result.understood) {
        setPhase("idle");
        setProblem(
          result && result.transcript
            ? `Didn't catch a garden change in "${result.transcript}". Try "add basil" or "remove the kale".`
            : "That didn't reach the backend. Is it running?",
        );
        return;
      }

      // Resize commands never reach the layout — they change the view. Split
      // them out first so "add basil and make it bigger" does both.
      const resizes = result.commands.filter(
        (command) => command.kind === "scale_garden" || command.kind === "set_garden_scale",
      );
      const gardenCommands = result.commands.filter(
        (command) => command.kind !== "scale_garden" && command.kind !== "set_garden_scale",
      );

      const resizeLines: string[] = [];
      for (const command of resizes) {
        if (!onScale) {
          setProblem("Resizing only works in the AR view.");
          continue;
        }
        const line = onScale({ factor: command.factor, percent: command.percent });
        if (line) resizeLines.push(line);
      }

      if (gardenCommands.length === 0) {
        if (resizeLines.length > 0) setLog((lines) => [...resizeLines, ...lines].slice(0, 8));
        setPhase("idle");
        return;
      }

      const current: GardenSelection = {
        selectedCropIds: state.selectedCropIds,
        plantCounts: state.plantCounts,
      };

      // Undo lives here rather than in the reducer: only this hook knows what
      // the garden looked like before.
      if (gardenCommands.some((command) => command.kind === "undo")) {
        const previous = history.current.shift();
        if (!previous) {
          setPhase("idle");
          setProblem("Nothing to undo yet.");
          return;
        }
        setPhase("planting");
        await regenerate(previous);
        setLog((lines) => ["Undid the last change", ...lines].slice(0, 8));
        setPhase("idle");
        return;
      }

      const applied = applyCommands(gardenCommands, current, state.recommendations);
      if (applied.applied.length === 0) {
        if (resizeLines.length > 0) setLog((lines) => [...resizeLines, ...lines].slice(0, 8));
        setPhase("idle");
        if (resizeLines.length === 0) setProblem(applied.skipped[0] ?? "Nothing changed.");
        return;
      }

      history.current = [current, ...history.current].slice(0, UNDO_DEPTH);
      setPhase("planting");
      await regenerate({
        selectedCropIds: applied.selectedCropIds,
        plantCounts: applied.plantCounts,
      });
      setLog((lines) => [...resizeLines, ...applied.applied, ...lines].slice(0, 8));
      if (applied.skipped.length > 0) setProblem(applied.skipped[0]);
      setPhase("idle");
    },
    [onScale, regenerate, state.plantCounts, state.recommendations, state.selectedCropIds],
  );

  /* ---------------- recording ---------------- */

  const finishRecording = useCallback(() => {
    if (listener.current) {
      listener.current.stop();
      return;
    }
    const media = recorder.current;
    if (media && media.state === "recording") {
      media.stop();
      return;
    }
    // Released before the stream arrived — stop as soon as it does.
    stopWhenReady.current = true;
  }, []);

  const beginBrowserRecognition = useCallback(() => {
    const handle = startBrowserRecognition();
    listener.current = handle;
    setPhase("listening");

    void handle.result.then(async (heard) => {
      releaseMic();
      if (!heard) {
        setPhase("idle");
        setProblem("Didn't catch that. Try again, or type the change.");
        return;
      }
      await run(heard);
    });
  }, [releaseMic, run]);

  const beginRecording = useCallback(async () => {
    setProblem("");
    stopWhenReady.current = false;

    if (engine === "browser") {
      beginBrowserRecognition();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicUnavailable(true);
      setProblem("This browser has no microphone API — type the request instead.");
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = mediaStream;
      const media = new MediaRecorder(mediaStream);
      chunks.current = [];

      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };

      media.onstop = async () => {
        const blob = new Blob(chunks.current, { type: media.mimeType || "audio/webm" });
        releaseMic();

        if (blob.size < MIN_AUDIO_BYTES) {
          setPhase("idle");
          setProblem("Didn't hear anything. Tap once to start, speak, then tap again.");
          return;
        }

        setPhase("thinking");
        const result = await transcribeAudio(blob);
        if (result.text) {
          await run(result.text);
          return;
        }
        setPhase("idle");
        if (browserSpeechSupported()) {
          // Use it for the NEXT attempt rather than asking them to repeat now.
          setEngine("browser");
          setProblem("Transcription is unavailable — switched to this browser's recogniser, try again.");
          return;
        }
        setMicUnavailable(true);
        setProblem(result.error ?? "Couldn't transcribe that — type it instead.");
      };

      // A timeslice means data accumulates as we go; without one a short
      // recording can end before any is emitted.
      media.start(CHUNK_MS);
      recorder.current = media;
      setPhase("listening");

      maxTimer.current = setTimeout(() => {
        if (recorder.current?.state === "recording") recorder.current.stop();
      }, MAX_RECORDING_MS);

      // The button was already released while the permission prompt was up.
      if (stopWhenReady.current) {
        stopWhenReady.current = false;
        media.stop();
      }
    } catch {
      releaseMic();
      setMicUnavailable(true);
      setPhase("idle");
      setProblem("Microphone access was blocked — type the request instead.");
    }
  }, [beginBrowserRecognition, engine, releaseMic, run]);

  /* ---------------- press handling ---------------- */

  const onPressStart = useCallback(() => {
    // Second tap of a latched recording: stop and submit.
    if (isLatched.current && phase === "listening") {
      ignoreNextRelease.current = true;
      finishRecording();
      return;
    }
    pressedAt.current = Date.now();
    void beginRecording();
  }, [beginRecording, finishRecording, phase]);

  const onPressEnd = useCallback(() => {
    if (ignoreNextRelease.current) {
      ignoreNextRelease.current = false;
      return;
    }
    const held = Date.now() - pressedAt.current;
    if (held < TAP_MS) {
      // A tap, not a hold: keep listening until they tap again.
      isLatched.current = true;
      setLatched(true);
      return;
    }
    finishRecording();
  }, [finishRecording]);

  return {
    phase,
    transcript,
    log,
    problem,
    micUnavailable,
    /** True once a tap has latched recording on. */
    latched,
    /** Which recogniser is in play, for honest UI copy. */
    engine,
    busy: phase === "thinking" || phase === "planting",
    run,
    onPressStart,
    onPressEnd,
    clearProblem: () => setProblem(""),
  };
}
