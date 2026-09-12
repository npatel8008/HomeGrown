"use client";

/**
 * The rear camera feed that sits behind the garden.
 *
 * Requires a secure context: on plain http the API is simply absent, which is
 * why the phone has to reach the app over https (see docs/RUNNING_ON_A_PHONE.md).
 * The distinction matters for the error copy — "your browser blocked this
 * because the page isn't https" is actionable; "camera unavailable" is not.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type CameraState =
  | "idle"
  | "starting"
  | "live"
  | "denied"
  | "insecure"
  | "unsupported"
  | "error";

export function useCameraStream() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>("idle");
  const [message, setMessage] = useState<string>("");

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
  }, []);

  const start = useCallback(async (): Promise<CameraState> => {
    if (typeof window === "undefined") return "unsupported";

    if (!window.isSecureContext) {
      setState("insecure");
      setMessage("The camera needs a secure (https) connection.");
      return "insecure";
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      setMessage("This browser does not expose a camera API.");
      return "unsupported";
    }

    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        // iOS will not autoplay inline video without both of these.
        video.setAttribute("playsinline", "true");
        video.muted = true;
        await video.play().catch(() => undefined);
      }
      setState("live");
      return "live";
    } catch (error) {
      const name = error instanceof DOMException ? error.name : "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setState("denied");
        setMessage("Camera access was blocked.");
        return "denied";
      }
      setState("error");
      setMessage(error instanceof Error ? error.message : "The camera could not be started.");
      return "error";
    }
  }, []);

  // Release the camera when the view goes away — the indicator light staying
  // on after you navigate is alarming, and rightly so.
  useEffect(() => stop, [stop]);

  return { videoRef, state, message, start, stop };
}
