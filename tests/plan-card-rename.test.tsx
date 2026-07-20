import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the router Link so we don't need a router context.
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
}));

// Mock server-fn hook: return the function unchanged.
vi.mock("@tanstack/react-start", () => ({
  useServerFn: <T,>(fn: T) => fn,
}));

// Mock toast to keep output clean.
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock the server functions the component calls.
const renamePlanMock = vi.fn();
const deletePlanMock = vi.fn();
vi.mock("@/lib/meal-plans.functions", () => ({
  renamePlan: (args: unknown) => renamePlanMock(args),
  deletePlan: (args: unknown) => deletePlanMock(args),
}));

import { PlanCard, type PlanRow } from "@/components/PlanCard";

function renderCard(overrides: Partial<PlanRow> = {}, allNames?: string[]) {
  const plan: PlanRow = {
    id: "plan-1",
    name: "Family Week",
    status: "ready",
    plan_length: 5,
    servings: 4,
    summary: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    plan,
    ...render(
      <QueryClientProvider client={client}>
        <PlanCard plan={plan} allNames={allNames ?? [plan.name, "Grill Night"]} />
      </QueryClientProvider>,
    ),
  };
}

async function openRename(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /plan actions/i }));
  await user.click(screen.getByRole("button", { name: /rename/i }));
  return screen.getByRole("textbox", { name: /plan name/i }) as HTMLInputElement;
}

describe("PlanCard rename validation (acceptance)", () => {
  beforeEach(() => {
    renamePlanMock.mockReset();
    deletePlanMock.mockReset();
  });

  it("shows an error and blocks save when name is empty", async () => {
    const user = userEvent.setup();
    renderCard();
    const input = await openRename(user);

    await user.clear(input);
    await user.keyboard("{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/empty/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(renamePlanMock).not.toHaveBeenCalled();
  });

  it("shows an error and blocks save when name exceeds max length", async () => {
    const user = userEvent.setup();
    renderCard();
    const input = await openRename(user);

    await user.clear(input);
    // Type a name longer than 80 chars
    await user.paste("x".repeat(90));
    await user.keyboard("{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/80/);
    expect(renamePlanMock).not.toHaveBeenCalled();
  });

  it("detects case-insensitive duplicates against other plans", async () => {
    const user = userEvent.setup();
    renderCard({}, ["Family Week", "grill night"]);
    const input = await openRename(user);

    await user.clear(input);
    await user.type(input, "GRILL NIGHT");
    await user.keyboard("{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already have a plan/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(renamePlanMock).not.toHaveBeenCalled();
  });

  it("clears the error as the user fixes the name", async () => {
    const user = userEvent.setup();
    renderCard({}, ["Family Week", "Grill Night"]);
    const input = await openRename(user);

    await user.clear(input);
    await user.type(input, "Grill Night");
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await user.type(input, " Deluxe");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("calls renamePlan with a valid, trimmed name", async () => {
    renamePlanMock.mockResolvedValue({ ok: true, name: "Sunday Roast" });
    const user = userEvent.setup();
    renderCard();
    const input = await openRename(user);

    await user.clear(input);
    await user.type(input, "  Sunday Roast  ");
    await user.keyboard("{Enter}");

    await waitFor(() => expect(renamePlanMock).toHaveBeenCalledTimes(1));
    expect(renamePlanMock).toHaveBeenCalledWith({
      data: { planId: "plan-1", name: "Sunday Roast" },
    });
  });

  it("surfaces the server error message (e.g. duplicate detected on server)", async () => {
    renamePlanMock.mockRejectedValue(new Error("You already have a plan with this name"));
    const user = userEvent.setup();
    renderCard();
    const input = await openRename(user);

    await user.clear(input);
    await user.type(input, "Something Unique");
    await user.keyboard("{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already have a plan/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });
});
