import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Clock, Users, ShoppingBasket, AlertTriangle, ChefHat, Share2, RefreshCw, Copy, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ServingsControl } from "@/components/ServingsControl";
import { useServingsScale } from "@/hooks/use-servings-scale";
import { scaleQuantity } from "@/lib/scale-quantity";
import { getPlanWithRecipes, toggleShare, regenerateRecipe } from "@/lib/meal-plans.functions";
import { AUTHENTICITY_COLORS, CATEGORY_COLORS, CATEGORY_LABELS } from "@/lib/meal-plan-types";
import type { Ingredient, Recipe, AuthenticityLabel, IngredientCategory } from "@/lib/meal-plan-types";
import { useState } from "react";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/plans/$planId")({
  component: PlanDetail,
});

function PlanDetail() {
  const { planId } = Route.useParams();
  const fetchFn = useServerFn(getPlanWithRecipes);
  const { data, isLoading } = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => fetchFn({ data: { planId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.plan?.status;
      return status === "generating" ? 3000 : false;
    },
  });

  // Hooks MUST be called unconditionally and in the same order on every
  // render — read plan fields defensively so useServingsScale is stable
  // across the loading → ready transition.
  const plan = data?.plan;
  const recipes = data?.recipes;
  const baseServings = plan?.servings ?? 4;
  const preferredServings =
    (plan as { preferred_servings?: number | null } | undefined)?.preferred_servings ?? null;
  const { servings: scaledServings, setServings, factor } = useServingsScale(
    planId,
    baseServings,
    preferredServings,
  );

  if (isLoading || !data || !plan) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-coral" /> Loading…
        </div>
      </AppShell>
    );
  }

  if (plan.status === "generating") {
    return (
      <AppShell>
        <div className="mx-auto max-w-lg rounded-3xl border border-coral/30 bg-coral/5 p-10 text-center">
          <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-coral" />
          <h2 className="text-xl font-semibold text-primary">Cooking up your plan…</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The AI is picking recognizable dishes that fit your week. This usually takes 30–60 seconds.
          </p>
        </div>
      </AppShell>
    );
  }

  if (plan.status === "failed") {
    return (
      <AppShell>
        <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-8">
          <AlertTriangle className="mb-2 h-6 w-6 text-destructive" />
          <h2 className="text-xl font-semibold text-primary">Plan generation failed</h2>
          <p className="mt-2 text-sm text-muted-foreground">{plan.error_message || "Unknown error"}</p>
          <Link to="/new-plan" className="mt-4 inline-flex rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Try again
          </Link>
        </div>
      </AppShell>
    );
  }


  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">{plan.name}</h1>
          {plan.summary && <p className="mt-2 max-w-2xl text-muted-foreground">{plan.summary}</p>}
          <p className="mt-2 text-sm text-muted-foreground">
            {plan.plan_length} nights · originally {plan.servings} servings
            {scaledServings !== plan.servings && ` · scaled to ${scaledServings}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ServingsControl servings={scaledServings} baseServings={plan.servings} onChange={setServings} />
          <ShareControl planId={planId} shareToken={plan.share_token as string | null} />
          <Link
            to="/plans/$planId/shopping-list"
            params={{ planId }}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <ShoppingBasket className="h-4 w-4" /> Shopping list
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {(recipes as unknown as Recipe[]).map((r, i) => (
          <RecipeCard key={r.id} recipe={r} index={i} planId={planId} factor={factor} scaledServings={scaledServings} />
        ))}
      </div>
    </AppShell>
  );
}

function ShareControl({ planId, shareToken }: { planId: string; shareToken: string | null }) {
  const qc = useQueryClient();
  const toggle = useServerFn(toggleShare);
  const [copied, setCopied] = useState(false);
  const mut = useMutation({
    mutationFn: (enable: boolean) => toggle({ data: { planId, enable } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["plan", planId] }),
  });
  const shareUrl = shareToken ? `${typeof window !== "undefined" ? window.location.origin : ""}/share/${shareToken}` : "";
  const copy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 1500);
  };
  if (shareToken) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
        <Share2 className="h-4 w-4 text-coral" />
        <span className="max-w-[180px] truncate text-muted-foreground">{shareUrl.replace(/^https?:\/\//, "")}</span>
        <button onClick={copy} className="rounded-full p-1 hover:bg-secondary" title="Copy link">
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
        <button onClick={() => mut.mutate(false)} className="text-xs text-muted-foreground hover:text-destructive">
          Unshare
        </button>
      </div>
    );
  }
  return (
    <button
      onClick={() => mut.mutate(true)}
      disabled={mut.isPending}
      className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-secondary"
    >
      <Share2 className="h-4 w-4" /> Share link
    </button>
  );
}

function RecipeCard({ recipe, index, planId, factor, scaledServings }: { recipe: Recipe; index: number; planId: string; factor: number; scaledServings: number }) {
  const [open, setOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapReason, setSwapReason] = useState("");
  const label = recipe.authenticity_label as AuthenticityLabel;
  const qc = useQueryClient();
  const regen = useServerFn(regenerateRecipe);
  const regenMut = useMutation({
    mutationFn: (reason: string) => regen({ data: { recipeId: recipe.id, reason } }),
    onSuccess: () => {
      toast.success("Recipe regenerated");
      setSwapOpen(false);
      setSwapReason("");
      qc.invalidateQueries({ queryKey: ["plan", planId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <article className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <span>Night {index + 1}</span>
            <span>·</span>
            <span>{recipe.cuisine}{recipe.origin_country ? ` · ${recipe.origin_country}` : ""}</span>
          </div>
          <h2 className="mt-1 text-2xl font-bold text-primary">{recipe.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{recipe.description}</p>
        </div>
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${AUTHENTICITY_COLORS[label] ?? ""}`}>
          {label?.replace(/_/g, " ")}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" /> {recipe.total_time_minutes} min total</span>
        <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" /> {scaledServings} servings{scaledServings !== recipe.servings ? ` (base ${recipe.servings})` : ""}</span>
        <span className="inline-flex items-center gap-1"><ChefHat className="h-4 w-4" /> {recipe.difficulty}</span>
      </div>

      {recipe.why_it_fits && (
        <p className="mt-4 rounded-2xl bg-secondary/60 p-3 text-sm text-foreground/80">
          <span className="font-semibold text-primary">Why it fits:</span> {recipe.why_it_fits}
        </p>
      )}

      {recipe.allergen_flags?.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" />
          <span className="font-medium">Contains:</span> {recipe.allergen_flags.join(", ")}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setOpen(!open)}
          className="text-sm font-medium text-coral hover:opacity-80"
        >
          {open ? "Hide recipe" : "Show full recipe"}
        </button>
        <button
          onClick={() => setSwapOpen((v) => !v)}
          disabled={regenMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-secondary disabled:opacity-50"
        >
          {regenMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Swap this dish
        </button>
      </div>

      {swapOpen && (
        <div className="mt-4 rounded-2xl border border-dashed border-coral/40 bg-coral/5 p-3">
          <label className="mb-1 block text-xs font-semibold text-primary">
            Meal preferences for the replacement (optional)
          </label>
          <div className="relative">
            <textarea
              value={swapReason}
              onChange={(e) => setSwapReason(e.target.value.slice(0, 1000))}
              rows={3}
              placeholder="Something lighter, no dairy, ready in under 30 min…"
              className="w-full rounded-xl border border-input bg-card px-3 py-2 pr-11 text-sm outline-none focus:border-coral"
            />
            <div className="absolute right-2 top-2">
              <VoiceInputButton
                value={swapReason}
                onChange={(v) => setSwapReason(v.slice(0, 1000))}
                maxLength={1000}
                continuous
                idleLabel="Speak your preferences for the swap"
              />
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">{swapReason.length}/1000</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setSwapOpen(false); setSwapReason(""); }}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium hover:bg-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => regenMut.mutate(swapReason.trim())}
                disabled={regenMut.isPending}
                className="inline-flex items-center gap-1.5 rounded-full bg-coral px-3 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {regenMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Regenerate dish
              </button>
            </div>
          </div>
        </div>
      )}


      {open && (
        <div className="mt-5 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold text-primary">Ingredients</h3>
            <IngredientList ingredients={recipe.ingredients as Ingredient[]} factor={factor} />
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-primary">Steps</h3>
            <ol className="space-y-2">
              {recipe.preparation_steps?.length > 0 && (
                <>
                  <li className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Prep</li>
                  {recipe.preparation_steps.map((s, i) => (
                    <li key={`p-${i}`} className="rounded-xl bg-secondary/50 p-3 text-sm">
                      <span className="mr-2 font-semibold text-coral">{i + 1}.</span>{s}
                    </li>
                  ))}
                </>
              )}
              <li className="pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Cook</li>
              {(recipe.cooking_steps ?? []).map((s, i) => (
                <li key={`c-${i}`} className="rounded-xl bg-gold/10 p-3 text-sm">
                  <span className="mr-2 font-semibold text-terracotta">{i + 1}.</span>{s}
                </li>
              ))}
            </ol>
          </div>
          {recipe.side_dish_suggestion && (
            <div className="md:col-span-2 rounded-2xl border border-border p-3 text-sm">
              <span className="font-semibold text-primary">Side:</span> {recipe.side_dish_suggestion}
            </div>
          )}
          {recipe.leftover_instructions && (
            <div className="md:col-span-2 rounded-2xl border border-border p-3 text-sm">
              <span className="font-semibold text-primary">Leftovers:</span> {recipe.leftover_instructions}
            </div>
          )}
        </div>
      )}
    </article>
  );
}

function IngredientList({ ingredients, factor }: { ingredients: Ingredient[]; factor: number }) {
  const grouped = ingredients.reduce<Record<string, Ingredient[]>>((acc, ing) => {
    const cat = (ing.category as IngredientCategory) ?? "other";
    (acc[cat] ??= []).push(ing);
    return acc;
  }, {});
  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div className={`mb-1.5 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${CATEGORY_COLORS[cat as IngredientCategory] ?? ""}`}>
            {CATEGORY_LABELS[cat as IngredientCategory] ?? cat}
          </div>
          <ul className="space-y-1 text-sm">
            {items.map((ing, i) => (
              <li key={i} className="text-foreground">
                <span className="font-medium">{scaleQuantity(ing.quantity, factor)}</span> {ing.name}
                {ing.notes && <span className="text-muted-foreground"> — {ing.notes}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
