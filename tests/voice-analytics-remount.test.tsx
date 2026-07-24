import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React, { StrictMode } from "react";

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
  stopMock.mockClear();
  clearErrorMock.mockClear();
  (window as unknown as { __lovableAnalytics?: unknown[] }).__lovableAnalytics = [];
  __resetAnalyticsDedupe();
  setState({
    state: "error",
    listening: false,
    errorKind: "permission-denied",
    errorMessage: "blocked",
  });
  EVENT_NAMES.forEach((n) => window.addEventListener(`lovable:analytics:${n}`, listener));
});

afterEach(() => {
  EVENT_NAMES.forEach((n) => window.removeEventListener(`lovable:analytics:${n}`, listener));
  cleanup();
});

const count = (name: string) => events.filter((e) => e === name).length;

describe("voice input analytics — remount / route change / StrictMode dedupe", () => {
  it("StrictMode double-invocation does not re-emit voice_permission_denied", () => {
    render(
      <StrictMode>
        <VoiceInputButton value="" onChange={() => {}} />
      </StrictMode>,
    );
    // StrictMode mounts, unmounts, and re-mounts effects — module-level
    // dedupe on the persistent flow id must keep the count at one.
    expect(count("voice_permission_denied")).toBe(1);
  });

  it("unmounting and remounting while permission-denied persists does not re-emit denied", () => {
    const { unmount } = render(<VoiceInputButton value="" onChange={() => {}} />);
    expect(count("voice_permission_denied")).toBe(1);
    unmount();

    // Second mount — the browser is still blocking, hook still reports
    // permission-denied. Without cross-mount dedupe this would fire again.
    render(<VoiceInputButton value="" onChange={() => {}} />);
    expect(count("voice_permission_denied")).toBe(1);
  });

  it("simulated route change (many mount/unmount cycles) never re-emits denied", () => {
    for (let i = 0; i < 5; i++) {
      const { unmount } = render(<VoiceInputButton key={i} value={`v${i}`} onChange={() => {}} />);
      unmount();
    }
    expect(count("voice_permission_denied")).toBe(1);
  });

  it("clicked / outcome events dedupe across remounts within a single flow", async () => {
    let resolve!: (v: { getTracks: () => Array<{ stop: () => void }> }) => void;
    const getUserMedia = vi.fn(
      () => new Promise<{ getTracks: () => Array<{ stop: () => void }> }>((r) => (resolve = r)),
    );
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const { unmount } = render(<VoiceInputButton value="" onChange={() => {}} />);
    events.length = 0;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });
    expect(count("voice_permission_retry_clicked")).toBe(1);

    // User navigates away mid-request; the new mount reports the same
    // permission-denied state. It must not re-emit clicked or outcome.
    unmount();
    render(<VoiceInputButton value="" onChange={() => {}} />);

    await act(async () => {
      resolve({ getTracks: () => [{ stop: vi.fn() }] });
    });
    // Original in-flight promise resolves — but the outcome guard for this
    // flow was already armed on the previous mount. Trigger a click on the
    // new mount and confirm it is also deduped.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });
    await waitFor(() => expect(count("voice_permission_retry_clicked")).toBe(1));
    // The successful getUserMedia resolution on the unmounted tree still
    // emits succeeded once (via the module-level dedupe) — no duplicates.
    expect(count("voice_permission_retry_succeeded") + count("voice_permission_retry_failed")).toBe(1);
  });

  it("a fresh permission-denied flow after the previous one ended re-emits denied exactly once", () => {
    render(<VoiceInputButton value="" onChange={() => {}} />);
    expect(count("voice_permission_denied")).toBe(1);
    cleanup();

    // Flow ends between mounts (state transitions to idle).
    setState({ state: "idle", listening: false, errorKind: null, errorMessage: null });
    const { unmount } = render(<VoiceInputButton value="" onChange={() => {}} />);
    unmount();

    // New denial event later on — must count as a distinct flow.
    setState({ state: "error", errorKind: "permission-denied", errorMessage: "blocked again" });
    render(<VoiceInputButton value="" onChange={() => {}} />);
    expect(count("voice_permission_denied")).toBe(2);
  });

  it("voice_auto_retry_editor_opened dedupes across StrictMode + remount for one editor session", async () => {
    const getUserMedia = vi
      .fn()
      .mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const { rerender, unmount } = render(
      <StrictMode>
        <VoiceInputButton value="" onChange={() => {}} preview />
      </StrictMode>,
    );
    events.length = 0;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });
    await waitFor(() => expect(startMock).toHaveBeenCalled());

    // Draft opens after the successful grant; StrictMode + rerender must
    // not re-emit the editor-opened event.
    setState({ state: "listening", listening: true, errorKind: null, errorMessage: null });
    rerender(
      <StrictMode>
        <VoiceInputButton value="" onChange={() => {}} preview />
      </StrictMode>,
    );
    await waitFor(() => expect(count("voice_auto_retry_editor_opened")).toBe(1));

    // Remount entirely (simulates a route change while editor was open) —
    // the pending flow was already consumed, so it must not re-emit.
    unmount();
    render(
      <StrictMode>
        <VoiceInputButton value="" onChange={() => {}} preview />
      </StrictMode>,
    );
    expect(count("voice_auto_retry_editor_opened")).toBe(1);
  });
});
