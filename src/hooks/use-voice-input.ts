import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Speech API wrapper.
 * - Singleton guard: only one recognition session runs app-wide at a time.
 *   Starting a new one aborts the previous session (fulfils "only one field
 *   listens at a time").
 * - Cleans up on unmount and reports errors.
 * - Feature-detects and reports `supported === false` on browsers without
 *   SpeechRecognition (Firefox, most in-app webviews); callers hide the mic.
 * - No audio is recorded or stored — the browser streams speech straight to
 *   its recognizer and returns text.
 */

type RecognitionAlternative = { transcript: string };
type RecognitionResult = ArrayLike<RecognitionAlternative> & { isFinal: boolean };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string; message?: string };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: (e: RecognitionEvent) => void;
  onend: () => void;
  onerror: (e: RecognitionErrorEvent) => void;
  onstart: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

// App-wide active recognizer — stopping it before a new one starts guarantees
// only one field listens at a time.
let activeStop: (() => void) | null = null;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceInputState = "idle" | "listening" | "processing" | "error";
export type VoiceErrorKind =
  | "permission-denied"
  | "no-microphone"
  | "no-speech"
  | "busy"
  | "unknown";

export interface UseVoiceInputOptions {
  lang?: string;
  continuous?: boolean;
  interimResults?: boolean;
  /** Called with each interim / final transcript chunk. `isFinal` marks committed text. */
  onTranscript: (text: string, isFinal: boolean) => void;
}

export function useVoiceInput({
  onTranscript,
  lang = "en-US",
  continuous = false,
  interimResults = true,
}: UseVoiceInputOptions) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [supported, setSupported] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  // Keep latest callback in a ref so start() doesn't need to be rebuilt.
  const cbRef = useRef(onTranscript);
  cbRef.current = onTranscript;

  useEffect(() => {
    setSupported(!!getCtor());
  }, []);

  const stop = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    // Enforce singleton: stop any other listening session first.
    if (activeStop) {
      const prev = activeStop;
      activeStop = null;
      try { prev(); } catch { /* noop */ }
    }
    setErrorMessage(null);
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = continuous;
    rec.interimResults = interimResults;
    rec.onstart = () => setState("listening");
    rec.onresult = (e) => {
      let interim = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const chunk = r[0]?.transcript ?? "";
        if (r.isFinal) finalText += chunk;
        else interim += chunk;
      }
      if (finalText) cbRef.current(finalText, true);
      else if (interim) cbRef.current(interim, false);
    };
    rec.onerror = (e) => {
      const msg =
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone permission denied. You can still type."
          : e.error === "no-speech"
          ? "Didn't catch that — try again."
          : e.error === "audio-capture"
          ? "No microphone detected."
          : "Voice input error. You can still type.";
      setErrorMessage(msg);
      setState("error");
    };
    rec.onend = () => {
      if (activeStop === stopFn) activeStop = null;
      recRef.current = null;
      setState((s) => (s === "error" ? s : "idle"));
    };
    const stopFn = () => {
      try { rec.abort(); } catch { /* noop */ }
    };
    recRef.current = rec;
    activeStop = stopFn;
    try {
      rec.start();
    } catch {
      // Some browsers throw if start() is called too soon after a prior stop().
      setState("error");
      setErrorMessage("Voice input is busy — try again.");
    }
  }, [lang, continuous, interimResults]);

  // Cleanup on unmount: never leak an active recognizer past the component.
  useEffect(() => {
    return () => {
      try { recRef.current?.abort(); } catch { /* noop */ }
      if (activeStop) {
        activeStop = null;
      }
    };
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setState("idle");
  }, []);

  return {
    state,
    supported,
    errorMessage,
    listening: state === "listening",
    start,
    stop,
    clearError,
  };
}
