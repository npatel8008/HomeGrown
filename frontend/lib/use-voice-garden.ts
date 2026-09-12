"use client";

/**
 * The voice-editing pipeline, shared by the planner panel and the AR overlay.
 *
 * Audio -> transcript -> validated commands -> crop selection -> the ordinary
 * layout call. Extracted from the planner's panel so the AR view drives the
 * identical path: there is one place that decides what "remove the kale"
 * means, and both surfaces are just different chrome around it.
 *
 * Three ways in, in order of preference, because a demo cannot hinge on one
 * API being reachable:
 *   1. ElevenLabs Scribe, when the backend has a key.
 *   2. The browser's own speech recognition, when it has one.
 *   3. Typed text, which always works and runs the same interpretation.
 */

import { useCallback, useRef, useState } from "react";

import { generateLayout } from "./api";
import { applyCommands, layoutCropsFor, type GardenSelection } from "./garden-commands";
import { useGardenStore } from "./store";
import { browserSpeechSupported, interpret, listenWithBrowser, transcribeAudio } from "./voice";

export type VoicePhase = "idle" | "listening" | "thinking" | "planting";

/** Below this, the recording is a stray tap rather than speech. */
const MIN_AUDIO_BYTES = 1200;
const UNDO_DEPTH = 10;

export function useVoiceGarden() {
  const { state, update } = useGardenStore();
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [transcript, setTranscript] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [problem, setProblem] = useState("");
  const [micUnavailable, setMicUnavailable] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const history = useRef<GardenSelection[]>([]);

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
        crops,
      });
      update({ ...selection, layout: result.data, offlineMode: result.usedFallback });
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

      const current: GardenSelection = {
        selectedCropIds: state.selectedCropIds,
        plantCounts: state.plantCounts,
      };

      // Undo lives here rather than in the reducer: only this hook knows what
      // the garden looked like before.
      if (result.commands.some((command) => command.kind === "undo")) {
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

      const applied = applyCommands(result.commands, current, state.recommendations);
      if (applied.applied.length === 0) {
        setPhase("idle");
        setProblem(applied.skipped[0] ?? "Nothing changed.");
        return;
      }

      history.current = [current, ...history.current].slice(0, UNDO_DEPTH);
      setPhase("planting");
      await regenerate({
        selectedCropIds: applied.selectedCropIds,
        plantCounts: applied.plantCounts,
      });
      setLog((lines) => [...applied.applied, ...lines].slice(0, 8));
      if (applied.skipped.length > 0) setProblem(applied.skipped[0]);
      setPhase("idle");
    },
    [regenerate, state.plantCounts, state.recommendations, state.selectedCropIds],
  );

  const startListening = useCallback(async () => {
    setProblem("");
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMicUnavailable(true);
      setProblem("This browser has no microphone API — type the request instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream);
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };
      media.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: media.mimeType || "audio/webm" });
        if (blob.size < MIN_AUDIO_BYTES) {
          setPhase("idle");
          setProblem("That was too short to hear. Hold the button while you speak.");
          return;
        }
        setPhase("thinking");
        const result = await transcribeAudio(blob);
        if (result.text) {
          await run(result.text);
          return;
        }
        // ElevenLabs unavailable — try the browser's recogniser before giving up.
        if (browserSpeechSupported()) {
          setProblem("Using this browser's speech recognition instead. Speak now.");
          setPhase("listening");
          const heard = await listenWithBrowser();
          if (heard) {
            await run(heard);
            return;
          }
        }
        setPhase("idle");
        setMicUnavailable(true);
        setProblem(result.error ?? "Couldn't transcribe that — type it instead.");
      };
      media.start();
      recorder.current = media;
      setPhase("listening");
    } catch {
      setMicUnavailable(true);
      setPhase("idle");
      setProblem("Microphone access was blocked — type the request instead.");
    }
  }, [run]);

  const stopListening = useCallback(() => {
    if (recorder.current && recorder.current.state === "recording") {
      recorder.current.stop();
      recorder.current = null;
    }
  }, []);

  return {
    phase,
    transcript,
    log,
    problem,
    micUnavailable,
    busy: phase === "thinking" || phase === "planting",
    run,
    startListening,
    stopListening,
    clearProblem: () => setProblem(""),
  };
}
