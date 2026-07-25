import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Mock the router Link & useNavigate & createFileRoute
const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (opts: any) => opts,
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useNavigate: () => navigateMock,
}));

// Mock server-fn hook: return the function unchanged.
vi.mock("@tanstack/react-start", () => ({
  useServerFn: <T,>(fn: T) => fn,
}));

// Mock toast
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock server functions
const getMyProfileMock = vi.fn();
const createPlanDraftMock = vi.fn();
const generatePlanMock = vi.fn();

vi.mock("@/lib/meal-plans.functions", () => ({
  getMyProfile: () => getMyProfileMock(),
  createPlanDraft: (args: unknown) => createPlanDraftMock(args),
  generatePlan: (args: unknown) => generatePlanMock(args),
}));

// Mock Firebase config
vi.mock("@/integrations/firebase/config", () => ({
  auth: {},
  db: {},
  googleProvider: {},
}));

import { Route } from "@/routes/_authenticated/new-plan";

function renderNewPlan() {
  const Component = (Route as any).component;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>
  );
}

describe("NewPlan Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crashing when profile is empty", async () => {
    getMyProfileMock.mockResolvedValue(null);
    renderNewPlan();
    expect(await screen.findByText("New meal plan")).toBeInTheDocument();
    expect(screen.getByText("Generate my plan")).toBeInTheDocument();
  });

  it("hydrates profile preferences correctly without re-render loop or crash", async () => {
    getMyProfileMock.mockResolvedValue({
      default_plan_length: 7,
      default_servings: 6,
      max_total_time_minutes: 30,
      dietary_pattern: "vegan",
      allergens: ["peanut"],
      favorite_cuisines: ["Italian"],
      preferred_proteins: ["tofu"],
      budget_preference: "budget-friendly",
      leftover_preference: true,
      meal_preferences: "Quick & easy",
    });

    renderNewPlan();

    // Verify initial render header exists
    expect(await screen.findByText("New meal plan")).toBeInTheDocument();

    // Wait for profile hydration
    await waitFor(() => {
      expect(screen.getByText("7 nights")).toBeInTheDocument();
    });
  });
});
