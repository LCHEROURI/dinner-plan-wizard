/**
 * End-to-end permission flow: exercises the real VoiceInputButton component
 * from "permission denied" through a failed retry and a successful retry that
 * opens the transcript editor, and asserts every sink (gtag, plausible,
 * posthog) receives the exact sequence of analytics events with the correct
 * payload fields, in order.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { __resetAnalyticsDedupe } from "@/lib/analytics";

// ── Mock the voice hook so we control error / listening transitions ─────
const startMock = vi.fn();
const stopMock = vi.fn();
const clearErrorMock = vi.fn();

type HookState = {
  state: "idle" | "listening" | "processing" | "error";
  supported: boolean;
  listening: boolean;
  errorMessage: string | null;
  errorKind: "permission-denied" | "no-microphone" | "no-speech" | "busy" | "unknown" | null;
  interim: string;
  final: string;
};

let hookState: HookState;

function setState(patch: Partial<HookState>) {
  hookState = { ...hookState, ...patch };
}

vi.mock("@/hooks/use-voice-input", () => ({
  useVoiceInput: () => ({
    ...hookState,
    start: startMock,
    stop: stopMock,
    clearError: clearErrorMock,
  }),
}));

import { VoiceInputButton } from "@/components/VoiceInputButton";

type SinkCall = { sink: "gtag" | "plausible" | "posthog"; event: string; payload: Record<string, unknown> };

let calls: SinkCall[];

beforeEach(() => {
  __resetAnalyticsDedupe();
  calls = [];
  hookState = {
    state: "idle",
    supported: true,
    listening: false,
    errorMessage: null,
    errorKind: null,
    interim: "",
    final: "",
  };
  startMock.mockClear();
  stopMock.mockClear();
  clearErrorMock.mockClear();
  (window as unknown as { __lovableAnalytics?: unknown[] }).__lovableAnalytics = [];

  (window as unknown as { gtag: unknown }).gtag = (_cmd: string, event: string, payload: Record<string, unknown>) => {
    calls.push({ sink: "gtag", event, payload });
  };
  (window as unknown as { plausible: unknown }).plausible = (event: string, opts?: { props?: Record<string, unknown> }) => {
    calls.push({ sink: "plausible", event, payload: opts?.props ?? {} });
  };
  (window as unknown as { posthog: unknown }) = { };
  (window as unknown as { posthog: unknown }).posthog = {
    capture: (event: string, payload: Record<string, unknown>) => {
      calls.push({ sink: "posthog", event, payload });
    },
  };
});

afterEach(() => {
  delete (window as unknown as { gtag?: unknown }).gtag;
  delete (window as unknown as { plausible?: unknown }).plausible;
  delete (window as unknown as { posthog?: unknown }).posthog;
});

function eventsFor(sink: SinkCall["sink"]): SinkCall[] {
  return calls.filter((c) => c.sink === sink);
}

describe("E2E permission flow: analytics fan-out to gtag/plausible/posthog", () => {
  it("emits denied → clicked → failed → clicked (deduped) → succeeded → editor_opened, per sink, in order", async () => {
    // Step 1 — mount with the hook already reporting permission-denied.
    setState({ state: "error", errorKind: "permission-denied", errorMessage: "Blocked" });

    // First retry click: getUserMedia rejects with NotAllowedError → still-blocked.
    const notAllowed = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const getUserMedia = vi
      .fn()
      .mockRejectedValueOnce(notAllowed)
      .mockResolvedValueOnce({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const { rerender } = render(<VoiceInputButton value="" onChange={() => {}} preview />);

    // Denied event should have fired on mount, once per sink.
    await waitFor(() => {
      expect(eventsFor("gtag").some((c) => c.event === "voice_permission_denied")).toBe(true);
      expect(eventsFor("plausible").some((c) => c.event === "voice_permission_denied")).toBe(true);
      expect(eventsFor("posthog").some((c) => c.event === "voice_permission_denied")).toBe(true);
    });

    // Step 2 — user clicks "Allow microphone"; getUserMedia rejects.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });
    await waitFor(() => {
      expect(eventsFor("gtag").some((c) => c.event === "voice_permission_retry_failed")).toBe(true);
    });

    // Step 3 — remount to simulate the user navigating between screens while
    // the (still-denied) flow persists. The module-level flow id should keep
    // dedupe honest across the remount.
    rerender(<div />);
    rerender(<VoiceInputButton value="" onChange={() => {}} preview />);

    // Step 4 — second click; getUserMedia resolves. Hook flips to listening.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });
    await waitFor(() => {
      expect(eventsFor("gtag").some((c) => c.event === "voice_permission_retry_succeeded")).toBe(true);
    });

    setState({ state: "listening", listening: true, errorKind: null, errorMessage: null });
    rerender(<VoiceInputButton value="" onChange={() => {}} preview />);

    await waitFor(() => {
      expect(eventsFor("gtag").some((c) => c.event === "voice_auto_retry_editor_opened")).toBe(true);
    });

    // ── Assert exact sequence + parity across sinks ─────────────────────────
    const expectedSequence = [
      "voice_permission_denied",
      "voice_permission_retry_clicked",
      "voice_permission_retry_failed",
      // second click is deduped by module flow id → no second `clicked`
      "voice_permission_retry_succeeded",
      "voice_auto_retry_editor_opened",
    ];

    for (const sink of ["gtag", "plausible", "posthog"] as const) {
      const seq = eventsFor(sink).map((c) => c.event);
      expect(seq, `sink=${sink}`).toEqual(expectedSequence);
    }

    // ── Payload contract per event, verified on every sink ──────────────────
    const contract: Record<string, (p: Record<string, unknown>) => void> = {
      voice_permission_denied: (p) => {
        expect(p.preview).toBe(true);
        expect(p.errorKind).toBe("permission-denied");
        expect(typeof p.flow_id).toBe("string");
        expect(typeof p.ts).toBe("number");
      },
      voice_permission_retry_clicked: (p) => {
        expect(p.preview).toBe(true);
        expect(typeof p.flow_id).toBe("string");
        expect(typeof p.ts).toBe("number");
      },
      voice_permission_retry_failed: (p) => {
        expect(p.reason).toBe("still-blocked");
        expect(typeof p.flow_id).toBe("string");
        expect(typeof p.ts).toBe("number");
      },
      voice_permission_retry_succeeded: (p) => {
        expect(p.preview).toBe(true);
        expect(typeof p.flow_id).toBe("string");
        expect(typeof p.ts).toBe("number");
      },
      voice_auto_retry_editor_opened: (p) => {
        expect(p.preview).toBe(true);
        expect(typeof p.flow_id).toBe("string");
        expect(typeof p.ts).toBe("number");
      },
    };

    for (const sink of ["gtag", "plausible", "posthog"] as const) {
      for (const call of eventsFor(sink)) {
        contract[call.event]?.(call.payload);
      }
    }

    // Permission-flow events share one flow_id; editor_opened uses its own.
    for (const sink of ["gtag", "plausible", "posthog"] as const) {
      const byEvent = Object.fromEntries(eventsFor(sink).map((c) => [c.event, c.payload.flow_id as string]));
      const permIds = new Set([
        byEvent.voice_permission_denied,
        byEvent.voice_permission_retry_clicked,
        byEvent.voice_permission_retry_failed,
        byEvent.voice_permission_retry_succeeded,
      ]);
      expect(permIds.size, `permission flow_id parity on ${sink}`).toBe(1);
      expect(byEvent.voice_auto_retry_editor_opened, `editor flow_id distinct on ${sink}`)
        .not.toBe(byEvent.voice_permission_denied);
    }

    // Cross-sink parity: gtag/plausible/posthog observed the same events.
    expect(eventsFor("gtag").length).toBe(expectedSequence.length);
    expect(eventsFor("plausible").length).toBe(expectedSequence.length);
    expect(eventsFor("posthog").length).toBe(expectedSequence.length);
  });
});
