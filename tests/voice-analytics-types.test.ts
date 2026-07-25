/**
 * Runtime validation for the discriminated-union analytics payload map.
 * Compile-time enforcement lives in the types themselves (see
 * `EventPayloadMap` in `src/lib/analytics.ts`); this file pins the
 * runtime validator that guards against drift when payloads are built
 * dynamically or received from external sources.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  validateEventPayload,
  trackEvent,
  __resetAnalyticsDedupe,
  __setAnalyticsStrict,
  type EventPayloadMap,
} from "@/lib/analytics";

beforeEach(() => {
  __resetAnalyticsDedupe();
  (window as unknown as { __lovableAnalytics?: unknown[] }).__lovableAnalytics = [];
  __setAnalyticsStrict(false);
});
afterEach(() => {
  __setAnalyticsStrict(false);
});

describe("validateEventPayload — required fields per event", () => {
  it("voice_permission_denied requires preview:boolean AND a known errorKind", () => {
    expect(
      validateEventPayload("voice_permission_denied", { preview: false, errorKind: "permission-denied" }),
    ).toBe(true);
    expect(validateEventPayload("voice_permission_denied", { preview: false })).toBe(false);
    expect(
      validateEventPayload("voice_permission_denied", { preview: false, errorKind: "bogus" }),
    ).toBe(false);
    expect(
      validateEventPayload("voice_permission_denied", { errorKind: "permission-denied" }),
    ).toBe(false);
  });

  it("voice_permission_retry_clicked / succeeded / auto_retry_editor_opened require preview:boolean", () => {
    for (const ev of [
      "voice_permission_retry_clicked",
      "voice_permission_retry_succeeded",
      "voice_auto_retry_editor_opened",
    ] as const) {
      expect(validateEventPayload(ev, { preview: true })).toBe(true);
      expect(validateEventPayload(ev, {})).toBe(false);
      expect(validateEventPayload(ev, { preview: "yes" })).toBe(false);
    }
  });

  it("voice_permission_retry_failed requires a non-empty reason string", () => {
    expect(validateEventPayload("voice_permission_retry_failed", { reason: "still-blocked" })).toBe(true);
    expect(validateEventPayload("voice_permission_retry_failed", { reason: "" })).toBe(false);
    expect(validateEventPayload("voice_permission_retry_failed", {})).toBe(false);
  });
});

describe("trackEvent + validation", () => {
  it("warns (does not throw) in non-strict mode when payload is invalid", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // @ts-expect-error — deliberately violating the discriminated union at runtime.
    trackEvent("voice_permission_denied", { preview: false });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("throws in strict mode when payload is invalid", () => {
    __setAnalyticsStrict(true);
    expect(() =>
      // @ts-expect-error — missing errorKind.
      trackEvent("voice_permission_denied", { preview: true }),
    ).toThrow(/invalid payload/);
  });

  it("passes valid payloads through cleanly (no warn, no throw)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    __setAnalyticsStrict(true);
    const payload: EventPayloadMap["voice_permission_retry_failed"] = { reason: "no-microphone" };
    expect(() => trackEvent("voice_permission_retry_failed", payload)).not.toThrow();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
