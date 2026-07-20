import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock the auth hook before importing the component so the component picks
// up the mocked module.
const useIsAuthenticatedMock = vi.fn();
vi.mock("@/hooks/use-is-authenticated", () => ({
  useIsAuthenticated: () => useIsAuthenticatedMock(),
}));

import { ServingsControl } from "@/components/ServingsControl";

function renderControl() {
  return render(
    <ServingsControl servings={4} baseServings={4} onChange={() => {}} />,
  );
}

function stepperIsPresent() {
  return (
    screen.queryByRole("button", { name: /increase servings/i }) !== null ||
    screen.queryByRole("button", { name: /decrease servings/i }) !== null
  );
}

describe("ServingsControl auth gating", () => {
  afterEach(() => {
    useIsAuthenticatedMock.mockReset();
    cleanup();
  });

  it("renders nothing while auth state is still resolving (null)", () => {
    useIsAuthenticatedMock.mockReturnValue(null);
    const { container } = renderControl();
    expect(container).toBeEmptyDOMElement();
    expect(stepperIsPresent()).toBe(false);
  });

  it("renders nothing for anonymous viewers on shared routes (false)", () => {
    // Simulates an anon viewer landing on /share/:token where the shared
    // route imports ServingsControl transitively.
    useIsAuthenticatedMock.mockReturnValue(false);
    const { container } = renderControl();
    expect(container).toBeEmptyDOMElement();
    expect(stepperIsPresent()).toBe(false);
    expect(screen.queryByText(/servings/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /^reset$/i })).toBeNull();
  });

  it("renders nothing for anonymous viewers even on protected route paths", () => {
    // Same guarantee if the component is somehow reached via a protected
    // route before the session hydrates or after sign-out.
    useIsAuthenticatedMock.mockReturnValue(false);
    const { container } = render(
      <ServingsControl servings={6} baseServings={4} onChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(stepperIsPresent()).toBe(false);
  });

  it("renders the stepper only when the user is authenticated (true)", () => {
    useIsAuthenticatedMock.mockReturnValue(true);
    renderControl();
    expect(stepperIsPresent()).toBe(true);
    expect(
      screen.getByRole("button", { name: /increase servings/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /decrease servings/i }),
    ).toBeInTheDocument();
  });
});
