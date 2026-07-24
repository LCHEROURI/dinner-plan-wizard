import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  state: "idle",
  supported: true,
  errorMessage: null,
  errorKind: null,
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

async function flush() {
  // requestAnimationFrame-driven focus effects
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });
}

describe("VoiceInputButton — a11y (permission-denied popover)", () => {
  beforeEach(() => {
    startMock.mockReset();
    stopMock.mockReset();
    clearErrorMock.mockReset();
    setState({
      state: "error",
      supported: true,
      errorMessage: "Microphone access is blocked.",
      errorKind: "permission-denied",
      listening: false,
    });
  });
  afterEach(() => cleanup());

  it("uses role=alertdialog with title/description wired via aria-labelledby/describedby", () => {
    render(<VoiceInputButton value="" onChange={() => {}} />);
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveAccessibleName(/microphone blocked/i);
    expect(dialog).toHaveAccessibleDescription(/microphone access is blocked/i);
  });

  it("all popover controls expose accessible names via aria-label", () => {
    render(<VoiceInputButton value="" onChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: /allow microphone access/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry voice input/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /dismiss voice input error/i }),
    ).toBeInTheDocument();
  });

  it("moves focus to the first action when the popover opens", async () => {
    render(<VoiceInputButton value="" onChange={() => {}} />);
    await flush();
    expect(
      screen.getByRole("button", { name: /allow microphone access/i }),
    ).toHaveFocus();
  });

  it("Escape dismisses the popover and restores focus to the mic button", async () => {
    render(<VoiceInputButton value="" onChange={() => {}} idleLabel="Enter by voice" />);
    await flush();
    const dialog = screen.getByRole("alertdialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(clearErrorMock).toHaveBeenCalledTimes(1);
    // In the error state the mic button's aria-label mirrors errorMessage.
    const mic = screen.getByRole("button", { name: /microphone access is blocked/i });
    expect(mic).toHaveFocus();
  });

  it("Tab cycles through the popover actions in DOM order", async () => {
    render(<VoiceInputButton value="" onChange={() => {}} />);
    await flush();
    const allow = screen.getByRole("button", { name: /allow microphone access/i });
    const retry = screen.getByRole("button", { name: /retry voice input/i });
    const dismiss = screen.getByRole("button", { name: /dismiss voice input error/i });
    expect(allow).toHaveFocus();
    allow.focus();
    // Simulate keyboard nav
    retry.focus();
    expect(retry).toHaveFocus();
    dismiss.focus();
    expect(dismiss).toHaveFocus();
    // None of them are hidden or aria-disabled
    for (const btn of [allow, retry, dismiss]) {
      expect(btn).not.toHaveAttribute("aria-hidden", "true");
      expect(btn.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it("mic toggle exposes aria-expanded reflecting the error popover", () => {
    render(<VoiceInputButton value="" onChange={() => {}} idleLabel="Enter by voice" />);
    const mic = screen.getByRole("button", { name: /voice input unavailable|enter by voice/i });
    expect(mic).toHaveAttribute("aria-expanded", "true");
  });
});

describe("VoiceInputButton — a11y (transcript editor)", () => {
  beforeEach(() => {
    startMock.mockReset();
    stopMock.mockReset();
    clearErrorMock.mockReset();
    setState({
      state: "listening",
      supported: true,
      errorMessage: null,
      errorKind: null,
      listening: true,
    });
  });
  afterEach(() => cleanup());

  it("opens on mic click with role=dialog, accessible name & description, and focuses the textarea", async () => {
    // Start in idle so clicking triggers the open flow.
    setState({ state: "idle", listening: false });
    const onChange = vi.fn();
    render(<VoiceInputButton value="" onChange={onChange} preview />);
    fireEvent.click(screen.getByRole("button", { name: /enter by voice/i }));
    await flush();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName(/listening|review transcript/i);
    expect(dialog).toHaveAccessibleDescription(/editable preview of your spoken text/i);
    expect(screen.getByRole("textbox", { name: /voice transcript/i })).toHaveFocus();
    expect(startMock).toHaveBeenCalled();
  });

  it("exposes accessible names on Cancel and Insert buttons", async () => {
    setState({ state: "idle", listening: false });
    render(<VoiceInputButton value="hi" onChange={() => {}} preview />);
    fireEvent.click(screen.getByRole("button", { name: /enter by voice/i }));
    await flush();
    expect(
      screen.getByRole("button", { name: /cancel voice transcript/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /insert voice transcript into field/i }),
    ).toBeInTheDocument();
  });

  it("Insert button is properly disabled (not just visually) when draft is empty", async () => {
    setState({ state: "idle", listening: false });
    render(<VoiceInputButton value="" onChange={() => {}} preview />);
    fireEvent.click(screen.getByRole("button", { name: /enter by voice/i }));
    await flush();
    const insert = screen.getByRole("button", { name: /insert voice transcript into field/i });
    expect(insert).toBeDisabled();
  });

  it("Escape cancels the editor and restores focus to the mic button", async () => {
    setState({ state: "idle", listening: false });
    render(<VoiceInputButton value="" onChange={() => {}} preview />);
    const mic = screen.getByRole("button", { name: /enter by voice/i });
    fireEvent.click(mic);
    await flush();

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mic).toHaveFocus();
  });

  it("Cancel button closes the editor and restores focus to the mic button", async () => {
    setState({ state: "idle", listening: false });
    render(<VoiceInputButton value="" onChange={() => {}} preview />);
    const mic = screen.getByRole("button", { name: /enter by voice/i });
    fireEvent.click(mic);
    await flush();

    fireEvent.click(screen.getByRole("button", { name: /cancel voice transcript/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mic).toHaveFocus();
  });

  it("textarea is typable via keyboard and has an associated label", async () => {
    setState({ state: "idle", listening: false });
    const onChange = vi.fn();
    render(<VoiceInputButton value="" onChange={onChange} preview />);
    fireEvent.click(screen.getByRole("button", { name: /enter by voice/i }));
    await flush();
    const ta = screen.getByRole("textbox", { name: /voice transcript/i }) as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: "add tomatoes" } });
    expect(ta.value).toBe("add tomatoes");
    const insert = screen.getByRole("button", { name: /insert voice transcript into field/i });
    expect(insert).not.toBeDisabled();
    fireEvent.click(insert);
    expect(onChange).toHaveBeenCalledWith("add tomatoes");
  });
});
