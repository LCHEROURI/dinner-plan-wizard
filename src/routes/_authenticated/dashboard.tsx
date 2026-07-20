import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, ChefHat, Loader2, AlertCircle, CheckCircle2, MoreVertical, Trash2, Pencil } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { listMyPlans, getMyProfile, deletePlan, renamePlan } from "@/lib/meal-plans.functions";

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
            <PlanCard key={p.id} plan={p} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

type PlanRow = {
  id: string;
  name: string;
  status: string;
  plan_length: number;
  servings: number;
  summary: string | null;
  created_at: string;
};

function PlanCard({ plan }: { plan: PlanRow }) {
  const qc = useQueryClient();
  const delFn = useServerFn(deletePlan);
  const renameFn = useServerFn(renamePlan);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(plan.name);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menu]);

  const delMut = useMutation({
    mutationFn: () => delFn({ data: { planId: plan.id } }),
    onSuccess: () => {
      toast.success("Plan deleted");
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const renameMut = useMutation({
    mutationFn: (n: string) => renameFn({ data: { planId: plan.id, name: n } }),
    onSuccess: () => {
      toast.success("Renamed");
      setRenaming(false);
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="relative rounded-2xl border border-border bg-card p-5 transition hover:border-coral hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") renameMut.mutate(name);
              if (e.key === "Escape") { setRenaming(false); setName(plan.name); }
            }}
            onBlur={() => name !== plan.name ? renameMut.mutate(name) : setRenaming(false)}
            className="flex-1 rounded-lg border border-coral bg-background px-2 py-1 text-sm font-semibold outline-none"
          />
        ) : (
          <Link to="/plans/$planId" params={{ planId: plan.id }} className="flex-1 font-semibold text-primary hover:underline">
            {plan.name}
          </Link>
        )}
        <div ref={menuRef} className="relative">
          <button
            onClick={(e) => { e.preventDefault(); setMenu(!menu); }}
            className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-primary"
            aria-label="Plan actions"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menu && (
            <div className="absolute right-0 top-full z-10 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-card shadow-lg">
              <button
                onClick={() => { setMenu(false); setRenaming(true); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <Pencil className="h-4 w-4" /> Rename
              </button>
              <button
                onClick={() => {
                  setMenu(false);
                  if (window.confirm(`Delete "${plan.name}"? This cannot be undone.`)) delMut.mutate();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StatusBadge status={plan.status} />
      </div>
      <Link to="/plans/$planId" params={{ planId: plan.id }} className="block">
        <p className="mt-2 text-sm text-muted-foreground">
          {plan.plan_length} nights · {plan.servings} servings
        </p>
        {plan.summary && (
          <p className="mt-3 line-clamp-2 text-sm text-foreground/80">{plan.summary}</p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {new Date(plan.created_at).toLocaleDateString()}
        </p>
      </Link>
    </div>
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
