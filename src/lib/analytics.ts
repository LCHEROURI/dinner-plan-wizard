/**
 * Lightweight analytics dispatcher.
 *
 * Emits browser events on `window` (namespaced `lovable:analytics`) and
 * forwards to any globally-registered sinks (`window.gtag`, `window.plausible`,
 * `window.posthog`) when present. Fully SSR-safe: no-ops on the server.
 *
 * Keep payloads small and PII-free — we log UI intent, not user content.
 */
// ── Event → payload discriminated-union map ──────────────────────────────
// Each analytics event has a fixed required-field shape. `EventPayloadMap`
// gives us compile-time enforcement (missing `errorKind`/`reason` fails
// typecheck) and drives the runtime validator below.

/** Reasons the "Allow microphone" retry can fail. */
export type VoiceRetryFailedReason =
  | "still-blocked"
  | "no-microphone"
  | "unsupported"
  | "AbortError"
  | "unknown"
  // Any browser-supplied DOMException name we don't specifically map.
  | (string & {});

/** All voice-related error categories emitted with `voice_permission_denied`. */
export type VoiceErrorKind =
  | "permission-denied"
  | "no-microphone"
  | "no-speech"
  | "busy"
  | "unknown";

export interface EventPayloadMap {
  voice_permission_denied: { preview: boolean; errorKind: VoiceErrorKind };
  voice_permission_retry_clicked: { preview: boolean };
  voice_permission_retry_succeeded: { preview: boolean };
  voice_permission_retry_failed: { reason: VoiceRetryFailedReason };
  voice_auto_retry_editor_opened: { preview: boolean };
}

export type AnalyticsEvent = keyof EventPayloadMap;

/** Discriminated union of every legal (event, payload) pair. */
export type AnalyticsEventUnion = {
  [E in AnalyticsEvent]: { event: E; payload: EventPayloadMap[E] };
}[AnalyticsEvent];

/** Legacy loose payload — kept for the module's transport layer. */
export interface AnalyticsPayload {
  [key: string]: string | number | boolean | null | undefined;
}

declare global {
  interface Window {
    gtag?: (command: string, event: string, params?: Record<string, unknown>) => void;
    plausible?: (event: string, opts?: { props?: Record<string, unknown> }) => void;
    posthog?: { capture?: (event: string, props?: Record<string, unknown>) => void };
    __lovableAnalytics?: Array<{ event: string; payload: AnalyticsPayload; ts: number }>;
  }
}

// ── Runtime validation ───────────────────────────────────────────────────
// Cheap structural checks per event. On failure we log a console.warn (or
// throw in strict mode) so drift between the emitter and the schema is
// caught immediately in dev/test. Production keeps emitting to avoid
// silently dropping analytics when a new field is added.

const VOICE_ERROR_KINDS = new Set<VoiceErrorKind>([
  "permission-denied",
  "no-microphone",
  "no-speech",
  "busy",
  "unknown",
]);

type ValidatorMap = {
  [E in AnalyticsEvent]: (payload: unknown) => payload is EventPayloadMap[E];
};

function isBool(v: unknown): v is boolean {
  return typeof v === "boolean";
}
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

const VALIDATORS: ValidatorMap = {
  voice_permission_denied: (p): p is EventPayloadMap["voice_permission_denied"] => {
    const o = p as Record<string, unknown>;
    return !!o && isBool(o.preview) && VOICE_ERROR_KINDS.has(o.errorKind as VoiceErrorKind);
  },
  voice_permission_retry_clicked: (p): p is EventPayloadMap["voice_permission_retry_clicked"] => {
    const o = p as Record<string, unknown>;
    return !!o && isBool(o.preview);
  },
  voice_permission_retry_succeeded: (p): p is EventPayloadMap["voice_permission_retry_succeeded"] => {
    const o = p as Record<string, unknown>;
    return !!o && isBool(o.preview);
  },
  voice_permission_retry_failed: (p): p is EventPayloadMap["voice_permission_retry_failed"] => {
    const o = p as Record<string, unknown>;
    return !!o && isNonEmptyString(o.reason);
  },
  voice_auto_retry_editor_opened: (p): p is EventPayloadMap["voice_auto_retry_editor_opened"] => {
    const o = p as Record<string, unknown>;
    return !!o && isBool(o.preview);
  },
};

let strictValidation = false;
/** Enable throw-on-invalid-payload for tests. */
export function __setAnalyticsStrict(on: boolean): void {
  strictValidation = on;
}

/**
 * Validate a payload against the schema for `event`. Returns true when
 * valid; on failure warns (or throws in strict mode) and returns false.
 */
export function validateEventPayload<E extends AnalyticsEvent>(
  event: E,
  payload: unknown,
): payload is EventPayloadMap[E] {
  const validator = VALIDATORS[event];
  if (!validator) return false;
  if (validator(payload)) return true;
  const msg = `[analytics] invalid payload for "${event}": ${JSON.stringify(payload)}`;
  if (strictValidation) throw new Error(msg);
  if (typeof console !== "undefined") console.warn(msg);
  return false;
}

export function trackEvent<E extends AnalyticsEvent>(
  event: E,
  payload: EventPayloadMap[E],
): void {
  if (typeof window === "undefined") return;
  // Validate the caller-supplied fields BEFORE we enrich with ts/flow_id.
  validateEventPayload(event, payload);
  const enriched: AnalyticsPayload = {
    ...(payload as unknown as AnalyticsPayload),
    ts: Date.now(),
  };
...
  trackEvent(event, { ...(payload as EventPayloadMap[E]), flow_id: flowId } as EventPayloadMap[E]);
  return true;
}

/** Mint a unique flow id for a new logical flow (e.g. a fresh permission-denied session). */
export function beginAnalyticsFlow(prefix: string): string {
  flowCounter += 1;
  return `${prefix}-${flowCounter}-${Date.now().toString(36)}`;
}

/** Drop all dedupe entries for a flow so its events can fire again in future flows. */
export function releaseAnalyticsFlow(flowId: string): void {
  const suffix = `::${flowId}`;
  for (const key of Array.from(dedupeSeen)) {
    if (key.endsWith(suffix)) dedupeSeen.delete(key);
  }
}

/** Test-only: clear all dedupe state and reset the flow counter. */
export function __resetAnalyticsDedupe(): void {
  dedupeSeen.clear();
  flowCounter = 0;
  activePermissionFlowId = null;
  pendingEditorFlowId = null;
}

// ── Cross-mount singletons for voice permission flows ────────────────────
// The permission state lives on the browser, not the component. When the
// user navigates between routes the VoiceInputButton unmounts and remounts;
// without a module-level anchor each mount would re-emit "denied". These
// singletons keep the flow id stable across mounts and StrictMode
// double-invocation, so `trackEventOnce` dedupe holds.
let activePermissionFlowId: string | null = null;
let pendingEditorFlowId: string | null = null;

/** Return the current permission-denied flow id, creating one on first call. */
export function getOrStartPermissionFlow(): string {
  if (!activePermissionFlowId) activePermissionFlowId = beginAnalyticsFlow("perm");
  return activePermissionFlowId;
}

/** End the current permission-denied flow and release its dedupe entries. */
export function endPermissionFlow(): void {
  if (activePermissionFlowId) {
    releaseAnalyticsFlow(activePermissionFlowId);
    activePermissionFlowId = null;
  }
}

/** After a successful permission grant, arm the "editor opened" event for the next open. */
export function armEditorAutoRetryFlow(): string {
  pendingEditorFlowId = beginAnalyticsFlow("editor-autoretry");
  return pendingEditorFlowId;
}

/** Consume the pending "editor opened" flow id (returns null if none armed). */
export function consumeEditorAutoRetryFlow(): string | null {
  const id = pendingEditorFlowId;
  pendingEditorFlowId = null;
  return id;
}
