/**
 * Lightweight analytics dispatcher.
 *
 * Emits browser events on `window` (namespaced `lovable:analytics`) and
 * forwards to any globally-registered sinks (`window.gtag`, `window.plausible`,
 * `window.posthog`) when present. Fully SSR-safe: no-ops on the server.
 *
 * Keep payloads small and PII-free — we log UI intent, not user content.
 */
export type AnalyticsEvent =
  | "voice_permission_denied"
  | "voice_permission_retry_clicked"
  | "voice_permission_retry_succeeded"
  | "voice_permission_retry_failed"
  | "voice_auto_retry_editor_opened";

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

export function trackEvent(event: AnalyticsEvent, payload: AnalyticsPayload = {}): void {
  if (typeof window === "undefined") return;
  const enriched: AnalyticsPayload = { ...payload, ts: Date.now() };

  // In-memory ring buffer for tests + debugging.
  const buf = (window.__lovableAnalytics ??= []);
  buf.push({ event, payload: enriched, ts: enriched.ts as number });
  if (buf.length > 200) buf.shift();

  // Dispatch a DOM CustomEvent — tests and other listeners can subscribe.
  try {
    window.dispatchEvent(new CustomEvent(`lovable:analytics:${event}`, { detail: enriched }));
    window.dispatchEvent(new CustomEvent("lovable:analytics", { detail: { event, payload: enriched } }));
  } catch {
    /* noop */
  }

  // Best-effort forward to common analytics SDKs when present.
  try {
    window.gtag?.("event", event, enriched);
  } catch {
    /* noop */
  }
  try {
    window.plausible?.(event, { props: enriched as Record<string, unknown> });
  } catch {
    /* noop */
  }
  try {
    window.posthog?.capture?.(event, enriched);
  } catch {
    /* noop */
  }
}

// ── Session-scoped dedupe ────────────────────────────────────────────────
// Some events must fire at most once per logical "flow" even when the
// emitting component remounts (route change), is double-invoked by React
// StrictMode, or is unmounted and re-rendered elsewhere. Refs living inside
// the component reset on every mount, so we keep the dedupe set at module
// scope and expose helpers to mint / release flow keys.
const dedupeSeen = new Set<string>();
let flowCounter = 0;

function makeKey(event: string, flowId: string): string {
  return `${event}::${flowId}`;
}

/** Emit `event` only if `(event, flowId)` has not been seen. Returns true when emitted. */
export function trackEventOnce(
  event: AnalyticsEvent,
  flowId: string,
  payload: AnalyticsPayload = {},
): boolean {
  const key = makeKey(event, flowId);
  if (dedupeSeen.has(key)) return false;
  dedupeSeen.add(key);
  trackEvent(event, { ...payload, flow_id: flowId });
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
}
