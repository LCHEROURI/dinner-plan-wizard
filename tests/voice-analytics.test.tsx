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

const events: Array<{ name: string; detail: unknown }> = [];
const listener = (e: Event) => {
  const ce = e as CustomEvent;
  events.push({ name: ce.type, detail: ce.detail });
};

beforeEach(() => {
  events.length = 0;
  startMock.mockClear();
  clearErrorMock.mockClear();
  (window as unknown as { __lovableAnalytics?: unknown[] }).__lovableAnalytics = [];
  ["voice_permission_denied", "voice_permission_retry_clicked", "voice_permission_retry_succeeded", "voice_permission_retry_failed", "voice_auto_retry_editor_opened"].forEach(
    (n) => window.addEventListener(`lovable:analytics:${n}`, listener),
  );
});

afterEach(() => {
  ["voice_permission_denied", "voice_permission_retry_clicked", "voice_permission_retry_succeeded", "voice_permission_retry_failed", "voice_auto_retry_editor_opened"].forEach(
    (n) => window.removeEventListener(`lovable:analytics:${n}`, listener),
  );
});

function names() {
  return events.map((e) => e.name.replace("lovable:analytics:", ""));
}

describe("voice input analytics", () => {
  it("emits voice_permission_denied when the hook enters that error", () => {
    setState({ state: "error", errorKind: "permission-denied" });
    render(<VoiceInputButton value="" onChange={() => {}} />);
    expect(names()).toContain("voice_permission_denied");
  });

  it("emits click + succeeded events and auto-retry editor opened on grant", async () => {
    setState({ state: "error", errorKind: "permission-denied" });
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const { rerender } = render(<VoiceInputButton value="" onChange={() => {}} preview />);
    events.length = 0; // ignore the initial permission_denied event

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });
    await waitFor(() => expect(startMock).toHaveBeenCalled());

    expect(names()).toContain("voice_permission_retry_clicked");
    expect(names()).toContain("voice_permission_retry_succeeded");

    // Simulate the hook flipping to listening — draft editor opens.
    setState({ state: "listening", listening: true, errorMessage: null, errorKind: null });
    rerender(<VoiceInputButton value="" onChange={() => {}} preview />);

    await waitFor(() => expect(names()).toContain("voice_auto_retry_editor_opened"));
  });

  it("emits voice_permission_retry_failed with a reason when still blocked", async () => {
    setState({ state: "error", errorKind: "permission-denied" });
    const err = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const getUserMedia = vi.fn().mockRejectedValue(err);
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(<VoiceInputButton value="" onChange={() => {}} />);
    events.length = 0;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });

    await waitFor(() => expect(names()).toContain("voice_permission_retry_failed"));
    const failed = events.find((e) => e.name.endsWith("voice_permission_retry_failed"));
    expect((failed?.detail as { reason?: string })?.reason).toBe("still-blocked");
  });

  it("does not emit auto_retry_editor_opened on regular mic taps (no pending grant)", () => {
    setState({ state: "listening", listening: true, errorKind: null, errorMessage: null });
    render(<VoiceInputButton value="" onChange={() => {}} preview />);
    expect(names()).not.toContain("voice_auto_retry_editor_opened");
  });
});
