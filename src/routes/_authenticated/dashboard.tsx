import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Plus, ChefHat, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { listMyPlans, getMyProfile } from "@/lib/meal-plans.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  const listFn = useServerFn(listMyPlans);
  const profileFn = useServerFn(getMyProfile);
  const { data: plans, isLoading } = useQuery({ queryKey: ["plans"], queryFn: () => listFn() });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const name = profile?.display_name ?? "chef";

  return (
    <AppShell>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Hi, {name} 👋</h1>
          <p className="mt-1 text-muted-foreground">What's for dinner this week?</p>
        </div>
        <Link
          to="/new-plan"
          className="flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New meal plan
        </Link>
      </div>

      {!profile?.onboarding_completed && (
        <Link to="/settings" className="mb-6 flex items-center justify-between rounded-2xl border border-gold/40 bg-gold/10 p-4 hover:bg-gold/15">
          <div>
            <p className="font-semibold text-primary">Set your preferences</p>
            <p className="text-sm text-muted-foreground">Tell us about allergies, cuisines, and your kitchen. Takes 2 minutes.</p>
          </div>
          <span className="text-sm font-medium text-coral">Open settings →</span>
        </Link>
      )}

      <h2 className="mb-4 text-lg font-semibold text-primary">Your plans</h2>
      {isLoading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : !plans || plans.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border bg-card p-12 text-center">
          <ChefHat className="mx-auto mb-3 h-10 w-10 text-coral" />
          <p className="font-semibold text-primary">No plans yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Create your first weekly dinner plan.</p>
          <Link to="/new-plan" className="mt-4 inline-flex rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
            Create a plan
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => (
            <Link
              key={p.id}
              to="/plans/$planId"
              params={{ planId: p.id }}
              className="rounded-2xl border border-border bg-card p-5 transition hover:border-coral hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-primary">{p.name}</h3>
                <StatusBadge status={p.status} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {p.plan_length} nights · {p.servings} servings
              </p>
              {p.summary && (
                <p className="mt-3 line-clamp-2 text-sm text-foreground/80">{p.summary}</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                {new Date(p.created_at).toLocaleDateString()}
              </p>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
    ready: { label: "Ready", cls: "bg-sage/15 text-sage border-sage/30", icon: CheckCircle2 },
    generating: { label: "Cooking…", cls: "bg-coral/15 text-coral border-coral/30", icon: Loader2 },
    failed: { label: "Failed", cls: "bg-destructive/15 text-destructive border-destructive/30", icon: AlertCircle },
    draft: { label: "Draft", cls: "bg-muted text-muted-foreground border-border", icon: ChefHat },
  };
  const cfg = map[status] ?? map.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <Icon className={`h-3 w-3 ${status === "generating" ? "animate-spin" : ""}`} /> {cfg.label}
    </span>
  );
}
