import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getMyProfile, updateMyProfile } from "@/lib/meal-plans.functions";
import { VoiceInputButton } from "@/components/VoiceInputButton";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
});

const DIETARY = ["omnivore", "vegetarian", "vegan", "pescatarian", "gluten-free", "dairy-free", "keto", "low-carb"];
const ALLERGENS = ["peanut", "tree nut", "dairy", "egg", "soy", "wheat/gluten", "shellfish", "fish", "sesame"];
const CUISINES = ["Italian", "Mexican", "Indian", "Chinese", "Japanese", "Thai", "Mediterranean", "American", "French", "Middle Eastern", "Korean", "Vietnamese"];
const PROTEINS = ["chicken", "beef", "pork", "fish", "shrimp", "tofu", "beans", "eggs", "lentils"];
const EQUIPMENT = ["oven", "stovetop", "instant pot", "slow cooker", "air fryer", "grill", "microwave", "food processor", "blender"];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active ? "border-coral bg-coral text-primary-foreground" : "border-input bg-card text-primary hover:border-coral/50"
      }`}
    >
      {children}
    </button>
  );
}

function Settings() {
  const qc = useQueryClient();
  const profileFn = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const { data: profile, isLoading } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const [state, setState] = useState<Record<string, any>>({});
  useEffect(() => {
    if (profile) setState({ ...profile });
  }, [profile]);

  const mut = useMutation({
    mutationFn: (patch: Record<string, unknown>) => updateFn({ data: patch }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const save = () => {
    mut.mutate({ ...state, onboarding_completed: true });
  };

  const toggle = (key: string, v: string) => {
    const list: string[] = state[key] ?? [];
    setState({ ...state, [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] });
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold text-primary">Settings</h1>

        <Card title="About you">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-primary">Display name</span>
            <div className="relative">
              <input
                type="text"
                value={state.display_name ?? ""}
                onChange={(e) => setState({ ...state, display_name: e.target.value })}
                className="w-full rounded-xl border border-input bg-card px-4 py-2.5 pr-12 text-sm outline-none focus:border-coral"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton
                  value={state.display_name ?? ""}
                  onChange={(v) => setState({ ...state, display_name: v })}
                  mode="replace"
                  idleLabel="Set display name by voice"
                />
              </div>
            </div>
          </label>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block font-medium text-primary">Household size</span>
            <input
              type="number"
              min={1}
              max={12}
              value={state.household_size ?? 2}
              onChange={(e) => setState({ ...state, household_size: Number(e.target.value) })}
              className="w-32 rounded-xl border border-input bg-card px-4 py-2.5 text-sm outline-none focus:border-coral"
            />
          </label>
        </Card>

        <Card title="Defaults for new plans">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium text-primary">Servings</span>
              <input type="number" min={1} max={8} value={state.default_servings ?? 4}
                onChange={(e) => setState({ ...state, default_servings: Number(e.target.value) })}
                className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-primary">Plan length (nights)</span>
              <select value={state.default_plan_length ?? 5}
                onChange={(e) => setState({ ...state, default_plan_length: Number(e.target.value) })}
                className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (<option key={n} value={n}>{n}</option>))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium text-primary">Max time (min)</span>
              <input type="number" min={15} max={180} value={state.max_total_time_minutes ?? 45}
                onChange={(e) => setState({ ...state, max_total_time_minutes: Number(e.target.value) })}
                className="w-full rounded-xl border border-input bg-card px-4 py-2.5 text-sm" />
            </label>
          </div>
        </Card>

        <Card title="Dietary pattern">
          <div className="flex flex-wrap gap-2">
            {DIETARY.map((d) => (
              <Chip key={d} active={state.dietary_pattern === d} onClick={() => setState({ ...state, dietary_pattern: d })}>{d}</Chip>
            ))}
          </div>
        </Card>

        <Card title="Allergens to strictly avoid">
          <div className="flex flex-wrap gap-2">
            {ALLERGENS.map((a) => (
              <Chip key={a} active={(state.allergens ?? []).includes(a)} onClick={() => toggle("allergens", a)}>{a}</Chip>
            ))}
          </div>
        </Card>

        <Card title="Favorite cuisines">
          <div className="flex flex-wrap gap-2">
            {CUISINES.map((c) => (
              <Chip key={c} active={(state.favorite_cuisines ?? []).includes(c)} onClick={() => toggle("favorite_cuisines", c)}>{c}</Chip>
            ))}
          </div>
        </Card>

        <Card title="Preferred proteins">
          <div className="flex flex-wrap gap-2">
            {PROTEINS.map((p) => (
              <Chip key={p} active={(state.preferred_proteins ?? []).includes(p)} onClick={() => toggle("preferred_proteins", p)}>{p}</Chip>
            ))}
          </div>
        </Card>

        <Card title="Available equipment">
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((e) => (
              <Chip key={e} active={(state.available_equipment ?? []).includes(e)} onClick={() => toggle("available_equipment", e)}>{e}</Chip>
            ))}
          </div>
        </Card>

        <Card title="Skill & budget">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <span className="mb-1 block text-sm font-medium text-primary">Skill level</span>
              <div className="flex gap-2">
                {["beginner", "intermediate", "advanced"].map((s) => (
                  <Chip key={s} active={state.skill_level === s} onClick={() => setState({ ...state, skill_level: s })}>{s}</Chip>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-sm font-medium text-primary">Budget</span>
              <div className="flex gap-2">
                {["budget-friendly", "moderate", "no-limit"].map((b) => (
                  <Chip key={b} active={state.budget_preference === b} onClick={() => setState({ ...state, budget_preference: b })}>{b}</Chip>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card title="Meal preferences (free-form)">
          <p className="mb-2 text-xs text-muted-foreground">
            Anything the AI should know — favorite flavors, disliked textures, cooking style, family quirks. Applied to every new plan.
          </p>
          <div className="relative">
            <textarea
              value={state.meal_preferences ?? ""}
              onChange={(e) => setState({ ...state, meal_preferences: e.target.value.slice(0, 2000) })}
              rows={4}
              placeholder="We love bold spices, hate mushy vegetables, and try to keep Fridays vegetarian…"
              className="w-full rounded-xl border border-input bg-card px-4 py-2.5 pr-12 text-sm outline-none focus:border-coral"
            />
            <div className="absolute right-2 top-2">
              <VoiceInputButton
                value={state.meal_preferences ?? ""}
                onChange={(v) => setState({ ...state, meal_preferences: v.slice(0, 2000) })}
                maxLength={2000}
                continuous
                idleLabel="Add meal preferences by voice"
              />
            </div>
          </div>
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {(state.meal_preferences ?? "").length}/2000
          </p>
        </Card>

        <button
          onClick={save}
          disabled={mut.isPending}
          className="w-full rounded-full bg-coral px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
        >
          {mut.isPending ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </AppShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <h2 className="mb-4 font-semibold text-primary">{title}</h2>
      {children}
    </section>
  );
}
