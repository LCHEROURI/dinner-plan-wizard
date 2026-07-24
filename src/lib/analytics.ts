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
