/**
 * Asserts the exact analytics event names and payload fields dispatched by
 * VoiceInputButton across every permission-flow outcome:
 *
 *   - voice_permission_denied              → { preview, errorKind, flow_id, ts }
 *   - voice_permission_retry_clicked       → { preview, flow_id, ts }
 *   - voice_permission_retry_succeeded     → { preview, flow_id, ts }
 *   - voice_permission_retry_failed        → { reason, flow_id, ts }
 *   - voice_auto_retry_editor_opened       → { preview: true, flow_id, ts }
 *
 * Every assertion pins the event name AND the payload shape so drift in
 * either surface is caught immediately.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { __resetAnalyticsDedupe } from "@/lib/analytics";

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
  state: "idle",
  supported: true,
  listening: false,
  errorMessage: null,
  errorKind: null,
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

type Captured = { event: string; detail: Record<string, unknown> };
const events: Captured[] = [];
const ALL_EVENTS = [
  "voice_permission_denied",
  "voice_permission_retry_clicked",
  "voice_permission_retry_succeeded",
  "voice_permission_retry_failed",
  "voice_auto_retry_editor_opened",
] as const;

const listener = (e: Event) => {
  const ce = e as CustomEvent;
  events.push({
    event: ce.type.replace("lovable:analytics:", ""),
    detail: (ce.detail ?? {}) as Record<string, unknown>,
  });
};

beforeEach(() => {
  events.length = 0;
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
  __resetAnalyticsDedupe();
  (window as unknown as { __lovableAnalytics?: unknown[] }).__lovableAnalytics = [];
  ALL_EVENTS.forEach((n) => window.addEventListener(`lovable:analytics:${n}`, listener));
});

afterEach(() => {
  ALL_EVENTS.forEach((n) => window.removeEventListener(`lovable:analytics:${n}`, listener));
});

function only(name: (typeof ALL_EVENTS)[number]): Captured[] {
  return events.filter((e) => e.event === name);
}

function expectFlowMetadata(detail: Record<string, unknown>) {
  expect(typeof detail.flow_id).toBe("string");
  expect((detail.flow_id as string).length).toBeGreaterThan(0);
  expect(typeof detail.ts).toBe("number");
}

describe("voice analytics — exact event names and payload fields", () => {
  it("voice_permission_denied carries { preview:false, errorKind:'permission-denied' }", () => {
    setState({ state: "error", errorKind: "permission-denied", errorMessage: "blocked" });
    render(<VoiceInputButton value="" onChange={() => {}} />);

    const emitted = only("voice_permission_denied");
    expect(emitted).toHaveLength(1);
    const { detail } = emitted[0];
    expect(detail.preview).toBe(false);
    expect(detail.errorKind).toBe("permission-denied");
    expectFlowMetadata(detail);
    // No stray fields for other events.
    expect(only("voice_permission_retry_clicked")).toHaveLength(0);
    expect(only("voice_permission_retry_succeeded")).toHaveLength(0);
    expect(only("voice_permission_retry_failed")).toHaveLength(0);
    expect(only("voice_auto_retry_editor_opened")).toHaveLength(0);
  });

  it("voice_permission_denied reflects preview:true when the button is in preview mode", () => {
    setState({ state: "error", errorKind: "permission-denied", errorMessage: "blocked" });
    render(<VoiceInputButton value="" onChange={() => {}} preview />);
    const emitted = only("voice_permission_denied");
    expect(emitted).toHaveLength(1);
    expect(emitted[0].detail).toMatchObject({ preview: true, errorKind: "permission-denied" });
  });

  it("clicked + succeeded + editor_opened share the same permission flow_id and expose preview flag", async () => {
    setState({ state: "error", errorKind: "permission-denied", errorMessage: "blocked" });
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const { rerender } = render(<VoiceInputButton value="" onChange={() => {}} preview />);
    const denied = only("voice_permission_denied")[0];
    expect(denied.detail.preview).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });
    await waitFor(() => expect(startMock).toHaveBeenCalled());

    const clicked = only("voice_permission_retry_clicked");
    const succeeded = only("voice_permission_retry_succeeded");
    expect(clicked).toHaveLength(1);
    expect(succeeded).toHaveLength(1);

    expect(clicked[0].detail).toMatchObject({ preview: true });
    expect(succeeded[0].detail).toMatchObject({ preview: true });
    expectFlowMetadata(clicked[0].detail);
    expectFlowMetadata(succeeded[0].detail);

    // clicked + succeeded + denied all belong to the same permission flow.
    expect(clicked[0].detail.flow_id).toBe(denied.detail.flow_id);
    expect(succeeded[0].detail.flow_id).toBe(denied.detail.flow_id);
    // Failed must NOT have fired on success.
    expect(only("voice_permission_retry_failed")).toHaveLength(0);

    // Flip to listening → editor opens with its own (editor-scoped) flow id.
    setState({
      state: "listening",
      listening: true,
      errorKind: null,
      errorMessage: null,
    });
    rerender(<VoiceInputButton value="" onChange={() => {}} preview />);

    await waitFor(() => expect(only("voice_auto_retry_editor_opened")).toHaveLength(1));
    const editor = only("voice_auto_retry_editor_opened")[0];
    expect(editor.detail).toMatchObject({ preview: true });
    expectFlowMetadata(editor.detail);
    // Editor flow id is minted separately from the permission flow.
    expect(editor.detail.flow_id).not.toBe(denied.detail.flow_id);
    expect((editor.detail.flow_id as string).startsWith("editor-autoretry-")).toBe(true);
    expect((denied.detail.flow_id as string).startsWith("perm-")).toBe(true);
  });

  it.each([
    ["NotAllowedError", "still-blocked"],
    ["SecurityError", "still-blocked"],
    ["NotFoundError", "no-microphone"],
    ["OverconstrainedError", "no-microphone"],
    ["AbortError", "AbortError"],
  ])("voice_permission_retry_failed carries reason=%s → %s", async (errName, expectedReason) => {
    setState({ state: "error", errorKind: "permission-denied", errorMessage: "blocked" });
    const err = Object.assign(new Error(errName), { name: errName });
    const getUserMedia = vi.fn().mockRejectedValue(err);
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(<VoiceInputButton value="" onChange={() => {}} />);
    const denied = only("voice_permission_denied")[0];

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });

    await waitFor(() => expect(only("voice_permission_retry_failed")).toHaveLength(1));
    const failed = only("voice_permission_retry_failed")[0];
    expect(failed.detail).toMatchObject({ reason: expectedReason });
    expectFlowMetadata(failed.detail);
    // Failed shares the permission flow id with denied + clicked.
    expect(failed.detail.flow_id).toBe(denied.detail.flow_id);
    // Succeeded must NOT have fired.
    expect(only("voice_permission_retry_succeeded")).toHaveLength(0);
  });

  it("voice_permission_retry_failed reason='unsupported' when mediaDevices is missing", async () => {
    setState({ state: "error", errorKind: "permission-denied", errorMessage: "blocked" });
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });

    render(<VoiceInputButton value="" onChange={() => {}} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));
    });

    await waitFor(() => expect(only("voice_permission_retry_failed")).toHaveLength(1));
    const failed = only("voice_permission_retry_failed")[0];
    expect(failed.detail).toMatchObject({ reason: "unsupported" });
    expectFlowMetadata(failed.detail);
  });

  it("does not emit any permission-flow events for non-permission errors", () => {
    setState({ state: "error", errorKind: "no-speech", errorMessage: "no speech" });
    render(<VoiceInputButton value="" onChange={() => {}} />);
    expect(events).toHaveLength(0);
  });
});
