import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ChefHat, Loader2, MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { deletePlan, renamePlan } from "@/lib/meal-plans.functions";
import { PLAN_NAME_MAX, validatePlanName } from "@/lib/plan-name";

export type PlanRow = {
  id: string;
  name: string;
  status: string;
  plan_length: number;
  servings: number;
  summary: string | null;
  created_at: string;
};

export function PlanCard({ plan, allNames }: { plan: PlanRow; allNames: string[] }) {
  const qc = useQueryClient();
  const delFn = useServerFn(deletePlan);
  const renameFn = useServerFn(renamePlan);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(plan.name);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputId = `rename-${plan.id}`;
  const errorId = `rename-err-${plan.id}`;

  const otherNames = useMemo(() => allNames.filter((n) => n !== plan.name), [allNames, plan.name]);

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
      setError(null);
      qc.invalidateQueries({ queryKey: ["plans"] });
    },
    onError: (e: Error) => {
      setError(e.message);
      toast.error(e.message);
    },
  });

  const trySubmit = () => {
    const trimmed = name.trim();
    if (trimmed === plan.name) { setRenaming(false); setError(null); return; }
    const err = validatePlanName(trimmed, { existing: otherNames });
    if (err) { setError(err); return; }
    setError(null);
    renameMut.mutate(trimmed);
  };

  const cancel = () => { setRenaming(false); setName(plan.name); setError(null); };

  return (
    <div className="relative rounded-2xl border border-border bg-card p-5 transition hover:border-coral hover:shadow-sm">
      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <div className="flex-1">
            <input
              id={inputId}
              autoFocus
              value={name}
              maxLength={PLAN_NAME_MAX + 20}
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
              aria-label="Plan name"
              onChange={(e) => {
                setName(e.target.value);
                if (error) {
                  const next = validatePlanName(e.target.value, { existing: otherNames });
                  setError(next);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); trySubmit(); }
                if (e.key === "Escape") { e.preventDefault(); cancel(); }
              }}
              onBlur={() => { if (!error && !renameMut.isPending) trySubmit(); }}
              className={`w-full rounded-lg border bg-background px-2 py-1 text-sm font-semibold outline-none ${
                error ? "border-destructive focus:ring-1 focus:ring-destructive" : "border-coral"
              }`}
            />
            <div className="mt-1 flex items-center justify-between text-xs">
              {error ? (
                <span id={errorId} role="alert" className="text-destructive">{error}</span>
              ) : (
                <span className="text-muted-foreground">Enter to save · Esc to cancel</span>
              )}
              <span className={`tabular-nums ${name.trim().length > PLAN_NAME_MAX ? "text-destructive" : "text-muted-foreground"}`}>
                {name.trim().length}/{PLAN_NAME_MAX}
              </span>
            </div>
          </div>
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
