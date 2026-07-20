import { useCallback, useEffect, useRef, useState } from "react";

type SR = {
  new (): {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    onresult: (e: { results: { transcript: string }[][] }) => void;
    onend: () => void;
    onerror: (e: unknown) => void;
    start: () => void;
    stop: () => void;
  };
};

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const Ctor: SR | undefined = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setSupported(!!Ctor);
  }, []);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    const Ctor: SR | undefined = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join(" ");
      onTranscript(text);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    recRef.current = rec;
    setListening(true);
  }, [onTranscript]);

  const stop = useCallback(() => {
    recRef.current?.stop?.();
    setListening(false);
  }, []);

  return { listening, supported, start, stop };
}
