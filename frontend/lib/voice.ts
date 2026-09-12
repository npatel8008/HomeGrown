/**
 * Speech in, garden edits out.
 *
 * Two steps on purpose (see backend/routes/voice.py): audio is transcribed,
 * then the text is interpreted. Anything that can produce a string — ElevenLabs,
 * the browser's own recogniser, or the text box — goes through the identical
 * interpretation path, so a typed instruction behaves exactly like a spoken one.
 */

import { API_BASE_URL } from "./api";
import type { InterpretResponse, TranscribeResponse } from "./types";

export type TranscriptionSource = "elevenlabs" | "browser" | "typed";

export interface TranscribeResult {
  text: string | null;
  /** Set when ElevenLabs is not configured or failed — caller should fall back. */
  unavailable: boolean;
  error?: string;
}

/** Audio -> text, via the backend so the ElevenLabs key stays server-side. */
export async function transcribeAudio(audio: Blob): Promise<TranscribeResult> {
  const form = new FormData();
  // The filename matters: the API infers the container from the extension.
  const extension = audio.type.includes("mp4") ? "mp4" : audio.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", audio, `speech.${extension}`);

  try {
    const response = await fetch(`${API_BASE_URL}/api/voice/transcribe`, {
      method: "POST",
      body: form,
      cache: "no-store",
    });
    if (response.status === 503) {
      return { text: null, unavailable: true, error: "Speech-to-text is not configured." };
    }
    if (!response.ok) {
      return {
        text: null,
        unavailable: true,
        error: `Transcription failed (${response.status}).`,
      };
    }
    const data = (await response.json()) as TranscribeResponse;
    return { text: data.text, unavailable: false };
  } catch (error) {
    return {
      text: null,
      unavailable: true,
      error: error instanceof Error ? error.message : "Transcription failed.",
    };
  }
}

/** Text -> validated garden commands. */
export async function interpret(transcript: string): Promise<InterpretResponse | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/voice/interpret`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
      cache: "no-store",
    });
    if (!response.ok) return null;
    return (await response.json()) as InterpretResponse;
  } catch {
    return null;
  }
}

/* ---- browser speech recognition, the fallback when ElevenLabs is off ---- */

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: { [i: number]: { [j: number]: { transcript: string } } } }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

export function browserSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface BrowserListener {
  /** Resolves with the transcript, or null if it heard nothing usable. */
  result: Promise<string | null>;
  /** Ends the recognition early — what the button release calls. */
  stop: () => void;
}

/**
 * Start the browser's own recogniser, under the caller's control.
 *
 * Returns a handle rather than a bare promise so push-to-talk can end it on
 * release. Recognition also stops itself on a pause, which is why `result` can
 * settle before `stop()` is ever called.
 */
export function startBrowserRecognition(): BrowserListener {
  const w = window as unknown as Record<string, unknown>;
  const Recognition = (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;

  if (!Recognition) {
    return { result: Promise.resolve(null), stop: () => undefined };
  }

  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let settle: (value: string | null) => void = () => undefined;
  let settled = false;
  const result = new Promise<string | null>((resolve) => {
    settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
  });

  recognition.onresult = (event) => settle(event.results[0][0].transcript);
  recognition.onerror = () => settle(null);
  recognition.onend = () => settle(null);

  try {
    recognition.start();
  } catch {
    settle(null);
  }

  return {
    result,
    stop: () => {
      try {
        recognition.stop();
      } catch {
        settle(null);
      }
    },
  };
}

/** One-shot convenience wrapper. */
export function listenWithBrowser(): Promise<string | null> {
  return startBrowserRecognition().result;
}
