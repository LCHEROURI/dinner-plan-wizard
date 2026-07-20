import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { getShoppingList, toggleShoppingItem } from "@/lib/meal-plans.functions";
import { CATEGORY_LABELS, type IngredientCategory } from "@/lib/meal-plan-types";

export const Route = createFileRoute("/_authenticated/plans/$planId/shopping-list")({
  component: ShoppingList,
});

function ShoppingList() {
  const { planId } = Route.useParams();
  const fetchFn = useServerFn(getShoppingList);
  const toggleFn = useServerFn(toggleShoppingItem);
  const qc = useQueryClient();
  const { data: items, isLoading } = useQuery({
    queryKey: ["shopping", planId],
    queryFn: () => fetchFn({ data: { planId } }),
  });
  const mut = useMutation({
    mutationFn: (v: { itemId: string; checked: boolean }) => toggleFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["shopping", planId] });
      const prev = qc.getQueryData<any[]>(["shopping", planId]);
      qc.setQueryData<any[]>(["shopping", planId], (old) =>
        old?.map((i) => (i.id === v.itemId ? { ...i, is_checked: v.checked } : i)) ?? []
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["shopping", planId], ctx.prev);
      toast.error("Couldn't update item");
    },
  });

  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!items) return;
    const text = items.map((i) => `${i.is_checked ? "✓" : "•"} ${i.display_text}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-coral" /> Loading…
        </div>
      </AppShell>
    );
  }

  const grouped = (items ?? []).reduce<Record<string, typeof items>>((acc: Record<string, typeof items>, i: any) => {
    const cat = i.category ?? "other";
    (acc[cat] ??= [] as any).push(i);
    return acc;
  }, {});

  const total = items?.length ?? 0;
  const checked = items?.filter((i) => i.is_checked).length ?? 0;

  return (
    <AppShell>
      <Link to="/plans/$planId" params={{ planId }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Back to plan
      </Link>

      <div className="mt-4 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary">Shopping list</h1>
          <p className="mt-1 text-sm text-muted-foreground">{checked} of {total} items</p>
        </div>
        <button
          onClick={copy}
          className="flex items-center gap-2 rounded-full border border-input bg-card px-4 py-2 text-sm hover:bg-accent/10"
        >
          {copied ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />}
          Copy
        </button>
      </div>

      {total === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          No items yet.
        </p>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([cat, list]) => (
            <div key={cat} className="rounded-3xl border border-border bg-card p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[cat as IngredientCategory] ?? cat}
              </h2>
              <ul className="space-y-1">
                {list!.map((item) => (
                  <li key={item.id}>
                    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 hover:bg-secondary/50">
                      <input
                        type="checkbox"
                        checked={!!item.is_checked}
                        onChange={(e) => mut.mutate({ itemId: item.id, checked: e.target.checked })}
                        className="h-4 w-4 accent-coral"
                      />
                      <span className={item.is_checked ? "text-muted-foreground line-through" : "text-foreground"}>
                        {item.display_text}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
