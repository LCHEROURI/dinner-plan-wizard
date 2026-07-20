import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Mock server-fn hook: return the function unchanged.
vi.mock("@tanstack/react-start", () => ({
  useServerFn: <T,>(fn: T) => fn,
}));

const setPreferredServingsMock = vi.fn(() => Promise.resolve({ ok: true }));
vi.mock("@/lib/meal-plans.functions", () => ({
  setPreferredServings: (args: unknown) => setPreferredServingsMock(args),
}));

import { useServingsScale } from "@/hooks/use-servings-scale";

const KEY = (planId: string) => `mp:servings:${planId}`;

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  setPreferredServingsMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useServingsScale — persistence + restore", () => {
  it("initializes from baseServings when no preferred value exists", () => {
    const { result } = renderHook(() => useServingsScale("plan-1", 4, null));
    expect(result.current.servings).toBe(4);
    expect(result.current.factor).toBe(1);
  });

  it("restores the previously chosen servings from the server (preferredServings) after reload", () => {
    // Simulates a fresh page load: the loader passes preferredServings from DB.
    const { result } = renderHook(() =>
      useServingsScale("plan-1", 4, 6),
    );
    expect(result.current.servings).toBe(6);
    expect(result.current.factor).toBe(1.5);
    // localStorage is also seeded so the next render is instant.
    expect(window.localStorage.getItem(KEY("plan-1"))).toBe("6");
  });

  it("persists to the server (debounced) when the user changes servings", async () => {
    const { result } = renderHook(() => useServingsScale("plan-1", 4, null));

    act(() => result.current.setServings(8));
    expect(result.current.servings).toBe(8);
    expect(window.localStorage.getItem(KEY("plan-1"))).toBe("8");

    // Not yet — debounced.
    expect(setPreferredServingsMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(setPreferredServingsMock).toHaveBeenCalledTimes(1);
    expect(setPreferredServingsMock).toHaveBeenCalledWith({
      data: { planId: "plan-1", servings: 8 },
    });
  });

  it("collapses rapid clicks into a single write with the latest value", async () => {
    const { result } = renderHook(() => useServingsScale("plan-1", 4, null));

    act(() => result.current.setServings(5));
    act(() => result.current.setServings(6));
    act(() => result.current.setServings(7));

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(setPreferredServingsMock).toHaveBeenCalledTimes(1);
    expect(setPreferredServingsMock).toHaveBeenCalledWith({
      data: { planId: "plan-1", servings: 7 },
    });
  });

  it("writes null when the user resets back to base servings", async () => {
    const { result } = renderHook(() => useServingsScale("plan-1", 4, 6));

    act(() => result.current.setServings(4));

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(setPreferredServingsMock).toHaveBeenCalledWith({
      data: { planId: "plan-1", servings: null },
    });
  });

  it("clamps out-of-range values to 1..24", async () => {
    const { result } = renderHook(() => useServingsScale("plan-1", 4, null));

    act(() => result.current.setServings(0));
    expect(result.current.servings).toBe(1);

    act(() => result.current.setServings(999));
    expect(result.current.servings).toBe(24);
  });

  it("simulates a page reload: after persisting, a fresh hook restores the same factor", async () => {
    // 1) First mount: user bumps servings to 6.
    const first = renderHook(() => useServingsScale("plan-1", 4, null));
    act(() => first.result.current.setServings(6));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(setPreferredServingsMock).toHaveBeenCalledWith({
      data: { planId: "plan-1", servings: 6 },
    });
    first.unmount();

    // 2) "Reload": a fresh hook mounts with the value the loader read back from DB.
    const second = renderHook(() => useServingsScale("plan-1", 4, 6));
    expect(second.result.current.servings).toBe(6);
    expect(second.result.current.factor).toBe(1.5);
  });
});
