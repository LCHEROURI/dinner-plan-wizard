import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

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

let hookState: HookState = {
  state: "error",
  supported: true,
  listening: false,
  errorMessage: "Microphone access is blocked in this browser.",
  errorKind: "permission-denied",
  interim: "",
  final: "",
};

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
import { __resetAnalyticsDedupe } from "@/lib/analytics";

const EVENT_NAMES = [
  "voice_permission_denied",
  "voice_permission_retry_clicked",
  "voice_permission_retry_succeeded",
  "voice_permission_retry_failed",
  "voice_auto_retry_editor_opened",
];

const events: string[] = [];
const listener = (e: Event) => events.push(e.type.replace("lovable:analytics:", ""));

beforeEach(() => {
  events.length = 0;
  startMock.mockClear();
  clearErrorMock.mockClear();
  (window as unknown as { __lovableAnalytics?: unknown[] }).__lovableAnalytics = [];
  __resetAnalyticsDedupe();
  EVENT_NAMES.forEach((n) => window.addEventListener(`lovable:analytics:${n}`, listener));
});

afterEach(() => {
  EVENT_NAMES.forEach((n) => window.removeEventListener(`lovable:analytics:${n}`, listener));
});

function count(name: string) {
  return events.filter((e) => e === name).length;
}

describe("voice input analytics — per-flow guards", () => {
  it("voice_permission_denied fires once even across many rerenders in the same flow", () => {
    setState({ state: "error", errorKind: "permission-denied" });
    const { rerender } = render(<VoiceInputButton value="" onChange={() => {}} />);
    for (let i = 0; i < 5; i++) {
      rerender(<VoiceInputButton value={`x${i}`} onChange={() => {}} />);
    }
    expect(count("voice_permission_denied")).toBe(1);
  });

  it("rapid double-clicks emit clicked + outcome exactly once per flow", async () => {
    setState({ state: "error", errorKind: "permission-denied" });
    let resolve!: (v: { getTracks: () => Array<{ stop: () => void }> }) => void;
    const getUserMedia = vi.fn(
      () => new Promise<{ getTracks: () => Array<{ stop: () => void }> }>((r) => (resolve = r)),
    );
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(<VoiceInputButton value="" onChange={() => {}} />);
    events.length = 0;

    const btn = screen.getByRole("button", { name: /allow microphone access/i });
    await act(async () => {
      fireEvent.click(btn);
      fireEvent.click(btn); // rapid re-click while first is in-flight
      fireEvent.click(btn);
    });

    // Second/third clicks were dropped by inFlightRef, so only one call.
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(count("voice_permission_retry_clicked")).toBe(1);

    await act(async () => {
      resolve({ getTracks: () => [{ stop: vi.fn() }] });
    });
    await waitFor(() => expect(count("voice_permission_retry_succeeded")).toBe(1));
    expect(count("voice_permission_retry_failed")).toBe(0);
  });

  it("clicking again after a failure within the same flow does not re-emit clicked/failed", async () => {
    setState({ state: "error", errorKind: "permission-denied" });
    const err = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const getUserMedia = vi.fn().mockRejectedValue(err);
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(<VoiceInputButton value="" onChange={() => {}} />);
    events.length = 0;
    const btn = screen.getByRole("button", { name: /allow microphone access/i });

    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(count("voice_permission_retry_failed")).toBe(1));

    // Second attempt inside the same denied flow — guards keep counts at 1.
    await act(async () => {
      fireEvent.click(btn);
    });
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(count("voice_permission_retry_clicked")).toBe(1);
    expect(count("voice_permission_retry_failed")).toBe(1);
  });

  it("a fresh permission-denied flow re-emits denied and allows a new click/outcome pair", async () => {
    setState({ state: "error", errorKind: "permission-denied" });
    const { rerender } = render(<VoiceInputButton value="" onChange={() => {}} />);
    expect(count("voice_permission_denied")).toBe(1);

    // Flow ends (user dismissed / error cleared).
    setState({ state: "idle", errorKind: null, errorMessage: null });
    rerender(<VoiceInputButton value="" onChange={() => {}} />);

    // Second denial — new flow, denied should fire again.
    setState({ state: "error", errorKind: "permission-denied", errorMessage: "blocked" });
    rerender(<VoiceInputButton value="" onChange={() => {}} />);
    expect(count("voice_permission_denied")).toBe(2);
  });

  it("voice_auto_retry_editor_opened fires once per flow even if draft toggles", async () => {
    setState({ state: "error", errorKind: "permission-denied" });
    const getUserMedia = vi
      .fn()
      .mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const { rerender } = render(<VoiceInputButton value="" onChange={() => {}} preview />);
    events.length = 0;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });
    await waitFor(() => expect(startMock).toHaveBeenCalled());

    setState({ state: "listening", listening: true, errorKind: null, errorMessage: null });
    rerender(<VoiceInputButton value="" onChange={() => {}} preview />);
    await waitFor(() => expect(count("voice_auto_retry_editor_opened")).toBe(1));

    // Extra rerenders while the editor stays open should not re-emit.
    for (let i = 0; i < 4; i++) {
      rerender(<VoiceInputButton value={`v${i}`} onChange={() => {}} preview />);
    }
    expect(count("voice_auto_retry_editor_opened")).toBe(1);
  });
});
