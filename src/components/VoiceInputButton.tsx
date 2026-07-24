import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Loader2, AlertCircle, Check, X } from "lucide-react";
import { useVoiceInput, type VoiceInputState } from "@/hooks/use-voice-input";
import { cleanupMealPlanningTranscript, appendWithSpacing } from "@/lib/voice-transcript";

export interface VoiceInputButtonProps {
  /** Current value of the field being dictated into. */
  value: string;
  /** Called with the new full value after appending / replacing the transcript. */
  onChange: (next: string) => void;
  /** Replace the field's contents instead of appending. Defaults to append. */
  mode?: "append" | "replace";
  /** Max length to enforce on onChange (matches the field's own limit). */
  maxLength?: number;
  /** Language tag; default `en-US`. */
  lang?: string;
  /** Show interim (non-final) transcript in the field while listening. Default true. */
  showInterim?: boolean;
  /** Continuous recognition — keeps listening across long pauses. Default false. */
  continuous?: boolean;
  /** Visual size — `sm` fits inside inputs, `md` for prominent standalone buttons. */
  size?: "sm" | "md";
  /** Extra classes for the button. */
  className?: string;
  /** Accessible label override for the idle state. */
  idleLabel?: string;
}

const STATE_LABEL: Record<VoiceInputState, string> = {
  idle: "Enter by voice",
  listening: "Listening — tap to stop",
  processing: "Processing speech",
  error: "Voice input unavailable — tap to retry",
};

/**
 * Global voice-to-text button for any free-text field.
 *
 * - Wraps `useVoiceInput` (Web Speech API) with feature detection, so on
 *   unsupported browsers the button renders `null` and typing keeps working.
 * - States: idle, listening (pulse), processing, error (with retry), completed
 *   (transcript inserted into the field via the parent's onChange).
 * - Appends by default with correct spacing; opt in to `mode="replace"` when a
 *   specific field should overwrite existing content.
 * - Never records audio — the browser streams speech to its recognizer.
 */
export function VoiceInputButton({
  value,
  onChange,
  mode = "append",
  maxLength,
  lang,
  showInterim = true,
  continuous = false,
  size = "sm",
  className = "",
  idleLabel,
}: VoiceInputButtonProps) {
  // Snapshot of `value` at the moment the user started speaking, so interim
  // updates don't clobber edits made mid-dictation.
  const baseRef = useRef(value);
  const [committed, setCommitted] = useState(false);

  const handleTranscript = useCallback(
    (chunk: string, isFinal: boolean) => {
      const cleaned = cleanupMealPlanningTranscript(chunk);
      if (!cleaned) return;
      const base = mode === "replace" ? "" : baseRef.current;
      const merged = mode === "replace" ? cleaned : appendWithSpacing(base, cleaned);
      const next = maxLength ? merged.slice(0, maxLength) : merged;
      onChange(next);
      if (isFinal) {
        baseRef.current = next;
        setCommitted(true);
      } else if (!showInterim) {
        return;
      }
    },
    [mode, maxLength, onChange, showInterim],
  );

  const { state, supported, errorMessage, listening, start, stop, clearError } = useVoiceInput({
    onTranscript: handleTranscript,
    lang,
    continuous,
    interimResults: showInterim,
  });

  // Reset the "completed" pulse after a moment.
  useEffect(() => {
    if (!committed) return;
    const t = setTimeout(() => setCommitted(false), 1500);
    return () => clearTimeout(t);
  }, [committed]);

  const sizeCls = size === "md" ? "h-10 w-10" : "h-8 w-8";
  const iconCls = size === "md" ? "h-5 w-5" : "h-4 w-4";

  const label = useMemo(() => {
    if (state === "error" && errorMessage) return errorMessage;
    if (state === "idle" && idleLabel) return idleLabel;
    return STATE_LABEL[state];
  }, [state, errorMessage, idleLabel]);

  if (!supported) return null;

  const onClick = () => {
    if (listening) {
      stop();
      return;
    }
    if (state === "error") clearError();
    baseRef.current = value;
    start();
  };

  const tone =
    state === "listening"
      ? "bg-coral text-primary-foreground animate-pulse ring-2 ring-coral/40"
      : state === "processing"
      ? "bg-secondary text-primary"
      : state === "error"
      ? "bg-destructive/10 text-destructive"
      : committed
      ? "bg-sage/20 text-sage"
      : "bg-secondary text-muted-foreground hover:text-primary";

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={listening}
      aria-live="polite"
      data-voice-state={state}
      className={`inline-flex ${sizeCls} items-center justify-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral ${tone} ${className}`}
    >
      {state === "processing" ? (
        <Loader2 className={`${iconCls} animate-spin`} />
      ) : state === "error" ? (
        <AlertCircle className={iconCls} />
      ) : listening ? (
        <MicOff className={iconCls} />
      ) : (
        <Mic className={iconCls} />
      )}
      <span className="sr-only">{label}</span>
    </button>
  );
}
