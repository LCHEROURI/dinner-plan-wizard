/**
 * Contract tests: analytics.ts must forward every voice analytics event to
 * the globally-registered SDK sinks (gtag, plausible, posthog) using the
 * exact event name and enriched payload (caller fields + ts).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  trackEvent,
  __resetAnalyticsDedupe,
  __setAnalyticsStrict,
  type AnalyticsEvent,
  type EventPayloadMap,
} from "@/lib/analytics";

type Sinks = {
  gtag: ReturnType<typeof vi.fn>;
  plausible: ReturnType<typeof vi.fn>;
  posthogCapture: ReturnType<typeof vi.fn>;
};

let sinks: Sinks;

beforeEach(() => {
  __resetAnalyticsDedupe();
  __setAnalyticsStrict(true);
  (window as unknown as { __lovableAnalytics?: unknown[] }).__lovableAnalytics = [];
  sinks = {
    gtag: vi.fn(),
    plausible: vi.fn(),
    posthogCapture: vi.fn(),
  };
  (window as unknown as { gtag: unknown }).gtag = sinks.gtag;
  (window as unknown as { plausible: unknown }).plausible = sinks.plausible;
  (window as unknown as { posthog: unknown }).posthog = { capture: sinks.posthogCapture };
});

afterEach(() => {
  __setAnalyticsStrict(false);
  delete (window as unknown as { gtag?: unknown }).gtag;
  delete (window as unknown as { plausible?: unknown }).plausible;
  delete (window as unknown as { posthog?: unknown }).posthog;
});

type Case = {
  event: AnalyticsEvent;
  payload: EventPayloadMap[AnalyticsEvent];
  required: string[];
};

const CASES: Case[] = [
  {
    event: "voice_permission_denied",
    payload: { preview: true, errorKind: "permission-denied" },
    required: ["preview", "errorKind"],
  },
  {
    event: "voice_permission_retry_clicked",
    payload: { preview: false },
    required: ["preview"],
  },
  {
    event: "voice_permission_retry_succeeded",
    payload: { preview: true },
    required: ["preview"],
  },
  {
    event: "voice_permission_retry_failed",
    payload: { reason: "still-blocked" },
    required: ["reason"],
  },
  {
    event: "voice_auto_retry_editor_opened",
    payload: { preview: true },
    required: ["preview"],
  },
];

describe("analytics.ts forwards voice events to gtag/plausible/posthog", () => {
  for (const c of CASES) {
    it(`forwards ${c.event} with exact name + payload fields`, () => {
      trackEvent(c.event, c.payload as never);

      // gtag: ("event", <name>, <enrichedPayload>)
      expect(sinks.gtag).toHaveBeenCalledTimes(1);
      const [gCmd, gName, gPayload] = sinks.gtag.mock.calls[0];
      expect(gCmd).toBe("event");
      expect(gName).toBe(c.event);
      for (const k of c.required) {
        expect(gPayload).toHaveProperty(k, (c.payload as Record<string, unknown>)[k]);
      }
      expect(typeof gPayload.ts).toBe("number");

      // plausible: (<name>, { props: enrichedPayload })
      expect(sinks.plausible).toHaveBeenCalledTimes(1);
      const [pName, pOpts] = sinks.plausible.mock.calls[0];
      expect(pName).toBe(c.event);
      expect(pOpts).toHaveProperty("props");
      for (const k of c.required) {
        expect(pOpts.props).toHaveProperty(k, (c.payload as Record<string, unknown>)[k]);
      }
      expect(typeof pOpts.props.ts).toBe("number");

      // posthog.capture: (<name>, enrichedPayload)
      expect(sinks.posthogCapture).toHaveBeenCalledTimes(1);
      const [phName, phPayload] = sinks.posthogCapture.mock.calls[0];
      expect(phName).toBe(c.event);
      for (const k of c.required) {
        expect(phPayload).toHaveProperty(k, (c.payload as Record<string, unknown>)[k]);
      }
      expect(typeof phPayload.ts).toBe("number");
    });
  }

  it("does not leak fields not present on the caller payload (only enriches ts)", () => {
    trackEvent("voice_permission_retry_failed", { reason: "no-microphone" });
    const [, , gPayload] = sinks.gtag.mock.calls[0];
    expect(Object.keys(gPayload).sort()).toEqual(["reason", "ts"]);
  });

  it("survives when a sink throws — other sinks still receive the event", () => {
    sinks.gtag.mockImplementation(() => {
      throw new Error("gtag boom");
    });
    expect(() =>
      trackEvent("voice_permission_retry_clicked", { preview: true }),
    ).not.toThrow();
    expect(sinks.plausible).toHaveBeenCalledTimes(1);
    expect(sinks.posthogCapture).toHaveBeenCalledTimes(1);
  });

  it("no-ops silently when a sink is missing (no throw, others still called)", () => {
    delete (window as unknown as { gtag?: unknown }).gtag;
    trackEvent("voice_permission_retry_clicked", { preview: false });
    expect(sinks.plausible).toHaveBeenCalledTimes(1);
    expect(sinks.posthogCapture).toHaveBeenCalledTimes(1);
  });
});
