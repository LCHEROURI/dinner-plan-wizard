import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mock useVoiceInput so we can drive state from the test ----
type MockState = {
  state: "idle" | "listening" | "processing" | "error";
  supported: boolean;
  errorMessage: string | null;
  errorKind: null | "permission-denied" | "no-microphone" | "no-speech" | "busy" | "unknown";
  listening: boolean;
};

const startMock = vi.fn();
const stopMock = vi.fn();
const clearErrorMock = vi.fn();
let currentState: MockState = {
  state: "error",
  supported: true,
  errorMessage: "Microphone access is blocked. Allow mic access in your browser to use voice input.",
  errorKind: "permission-denied",
  listening: false,
};

vi.mock("@/hooks/use-voice-input", () => ({
  useVoiceInput: () => ({
    ...currentState,
    start: startMock,
    stop: stopMock,
    clearError: clearErrorMock,
  }),
}));

import { VoiceInputButton } from "@/components/VoiceInputButton";

function setState(next: Partial<MockState>) {
  currentState = { ...currentState, ...next };
}

describe("VoiceInputButton — permission-denied popover", () => {
  beforeEach(() => {
    startMock.mockReset();
    stopMock.mockReset();
    clearErrorMock.mockReset();
    setState({
      state: "error",
      supported: true,
      errorMessage: "Microphone access is blocked. Allow mic access in your browser to use voice input.",
      errorKind: "permission-denied",
      listening: false,
    });
    // Reset navigator.mediaDevices between tests
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
  });

  afterEach(() => cleanup());

  it("shows the popover with title, message, Retry, Dismiss, and Allow microphone", () => {
    render(<VoiceInputButton value="" onChange={() => {}} />);
    const alert = screen.getByRole("alertdialog");
    expect(alert).toHaveTextContent(/microphone blocked/i);
    expect(alert).toHaveTextContent(/microphone access is blocked/i);
    expect(screen.getByRole("button", { name: /allow microphone access/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry voice input/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /dismiss voice input error/i })).toBeInTheDocument();
  });

  it("does not show Allow microphone for non-permission errors", () => {
    setState({
      errorKind: "no-speech",
      errorMessage: "Didn't catch that — try again.",
    });
    render(<VoiceInputButton value="" onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /allow microphone access/i })).toBeNull();
    expect(screen.getByRole("button", { name: /retry voice input/i })).toBeInTheDocument();
  });

  it("Dismiss clears the error", () => {
    render(<VoiceInputButton value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss voice input error/i }));
    expect(clearErrorMock).toHaveBeenCalledTimes(1);
  });

  it("Retry clears the error and re-invokes start()", () => {
    render(<VoiceInputButton value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /retry voice input/i }));
    expect(clearErrorMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledTimes(1);
  });

  it("Allow microphone triggers getUserMedia, then clearError + start on success", async () => {
    const stopTrack = vi.fn();
    const getUserMedia = vi
      .fn()
      .mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(<VoiceInputButton value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledWith({ audio: true }));
    // Mic track released immediately after the prompt.
    await waitFor(() => expect(stopTrack).toHaveBeenCalledTimes(1));
    // Auto-retry into voice recognition.
    await waitFor(() => {
      expect(clearErrorMock).toHaveBeenCalled();
      expect(startMock).toHaveBeenCalled();
    });
  });

  it("Allow microphone shows a site-settings hint when the browser still blocks", async () => {
    const err = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const getUserMedia = vi.fn().mockRejectedValue(err);
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    render(<VoiceInputButton value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /allow microphone access/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/still blocking the mic|open site settings/i),
      ).toBeInTheDocument(),
    );
    // Should NOT auto-retry into recognition on failure.
    expect(startMock).not.toHaveBeenCalled();
    expect(clearErrorMock).not.toHaveBeenCalled();
  });

  it("Successful Allow microphone opens the editable transcript preview panel", async () => {
    const getUserMedia = vi
      .fn()
      .mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(global.navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });

    const { rerender } = render(
      <VoiceInputButton value="" onChange={() => {}} preview />,
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /allow microphone/i }));
    });

    await waitFor(() => expect(startMock).toHaveBeenCalled());

    // After auto-retry, simulate the hook transitioning to listening.
    setState({ state: "listening", listening: true, errorMessage: null, errorKind: null });
    rerender(<VoiceInputButton value="" onChange={() => {}} preview />);

    // Transcript editor dialog is now open and error panel is gone.
    expect(screen.getByRole("dialog", { name: /voice transcript preview/i })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByPlaceholderText(/your spoken text will appear here/i),
    ).toBeInTheDocument();
  });
});
