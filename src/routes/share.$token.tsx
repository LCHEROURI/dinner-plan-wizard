import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Clock, Users, ChefHat, ChefHat as Logo, Loader2 } from "lucide-react";
import { getSharedPlan } from "@/lib/meal-plans.functions";
import type { Recipe, AuthenticityLabel } from "@/lib/meal-plan-types";
import { AUTHENTICITY_COLORS } from "@/lib/meal-plan-types";

export const Route = createFileRoute("/share/$token")({
  head: ({ params }) => ({
    meta: [
      { title: "Shared meal plan" },
      { name: "description", content: "A weeknight meal plan shared from Lovable Meals." },
      { property: "og:title", content: "Shared meal plan" },
      { property: "og:description", content: "A recognizable, allergen-aware weeknight dinner plan." },
      { name: "robots", content: "noindex" },
      { property: "og:url", content: `/share/${params.token}` },
    ],
  }),
  component: SharedPlan,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-lg p-10 text-center">
      <h1 className="text-2xl font-bold text-primary">Link unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
    </main>
  ),
});

function SharedPlan() {
  const { token } = Route.useParams();
  const fetchFn = useServerFn(getSharedPlan);
  const { data, isLoading, error } = useQuery({
    queryKey: ["share", token],
    queryFn: () => fetchFn({ data: { token } }),
  });

  if (isLoading) {
    return (
      <main className="p-10 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-coral" />
      </main>
    );
  }
  if (error || !data) {
    return (
      <main className="mx-auto max-w-lg p-10 text-center">
        <h1 className="text-2xl font-bold text-primary">Link unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">This shared plan may have been made private.</p>
      </main>
    );
  }
  const { plan, recipes } = data;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2 font-bold text-primary">
            <Logo className="h-5 w-5 text-coral" /> Lovable Meals
          </Link>
          <Link to="/auth" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            Make your own
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 py-8">
        <div className="mb-6">
          <span className="inline-flex rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
            Shared plan · read-only
          </span>
          <h1 className="mt-3 text-3xl font-bold text-primary">{plan.name}</h1>
          {plan.summary && <p className="mt-2 max-w-2xl text-muted-foreground">{plan.summary}</p>}
          <p className="mt-1 text-sm text-muted-foreground">{plan.plan_length} nights · {plan.servings} servings</p>
        </div>
        <div className="space-y-4">
          {(recipes as unknown as Recipe[]).map((r, i) => {
            const label = r.authenticity_label as AuthenticityLabel;
            return (
              <article key={r.id} className="rounded-3xl border border-border bg-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Night {i + 1} · {r.cuisine}</div>
                    <h2 className="mt-1 text-2xl font-bold text-primary">{r.name}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                  </div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${AUTHENTICITY_COLORS[label] ?? ""}`}>
                    {label?.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> {r.total_time_minutes} min</span>
                  <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {r.servings} servings</span>
                  <span className="inline-flex items-center gap-1"><ChefHat className="h-4 w-4" /> {r.difficulty}</span>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
