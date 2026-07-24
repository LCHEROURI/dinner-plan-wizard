import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { createPlanDraft, generatePlan, getMyProfile } from "@/lib/meal-plans.functions";
import { VoiceInputButton } from "@/components/VoiceInputButton";
import type { PlanGenerationInput } from "@/lib/meal-plan-types";

export const Route = createFileRoute("/_authenticated/new-plan")({
  component: NewPlan,
});

const DIETARY = ["omnivore", "vegetarian", "vegan", "pescatarian", "gluten-free", "dairy-free", "keto", "low-carb"];
const ALLERGENS = ["peanut", "tree nut", "dairy", "egg", "soy", "wheat/gluten", "shellfish", "fish", "sesame"];
const CUISINES = ["Italian", "Mexican", "Indian", "Chinese", "Japanese", "Thai", "Mediterranean", "American", "French", "Middle Eastern", "Korean", "Vietnamese"];
const PROTEINS = ["chicken", "beef", "pork", "fish", "shrimp", "tofu", "beans", "eggs", "lentils"];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        active
          ? "border-coral bg-coral text-primary-foreground"
          : "border-input bg-card text-primary hover:border-coral/50"
      }`}
    >
      {children}
    </button>
  );
}

function NewPlan() {
  const navigate = useNavigate();
  const profileFn = useServerFn(getMyProfile);
  const createFn = useServerFn(createPlanDraft);
  const generateFn = useServerFn(generatePlan);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });

  const [planLength, setPlanLength] = useState<1 | 2 | 3 | 4 | 5 | 6 | 7>(5);
  const [servings, setServings] = useState(4);
  const [maxTime, setMaxTime] = useState(45);
  const [dietary, setDietary] = useState("omnivore");
  const [allergens, setAllergens] = useState<string[]>([]);
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [proteins, setProteins] = useState<string[]>([]);
  const [pantry, setPantry] = useState("");
  const [budget, setBudget] = useState("moderate");
  const [leftovers, setLeftovers] = useState(true);
  const [notes, setNotes] = useState("");
  const [excluded, setExcluded] = useState("");
  const [mealPrefs, setMealPrefs] = useState("");
  const [busy, setBusy] = useState(false);

  // Hydrate from profile once
  useState(() => {
    if (profile) {
      setPlanLength((profile.default_plan_length as 1 | 2 | 3 | 4 | 5 | 6 | 7) ?? 5);
      setServings(profile.default_servings ?? 4);
      setMaxTime(profile.max_total_time_minutes ?? 45);
      setDietary(profile.dietary_pattern ?? "omnivore");
      setAllergens(profile.allergens ?? []);
      setCuisines(profile.favorite_cuisines ?? []);
      setProteins(profile.preferred_proteins ?? []);
      setBudget(profile.budget_preference ?? "moderate");
      setLeftovers(profile.leftover_preference ?? true);
      setMealPrefs((profile as { meal_preferences?: string | null }).meal_preferences ?? "");
    }
  });

  const toggle = (list: string[], setList: (v: string[]) => void, v: string) =>
    setList(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const input: PlanGenerationInput = {
      plan_length: planLength,
      servings,
      max_total_time_minutes: maxTime,
      dietary_pattern: dietary,
      allergens,
      excluded_ingredients: excluded.split(",").map((s) => s.trim()).filter(Boolean),
      favorite_cuisines: cuisines,
      preferred_proteins: proteins,
      pantry_items: pantry.split(",").map((s) => s.trim()).filter(Boolean),
      budget_preference: budget,
      leftovers,
      notes: notes.slice(0, 2000),
      skill_level: profile?.skill_level ?? "intermediate",
    };
    try {
      const { planId } = await createFn({ data: { input } });
      toast.success("Cooking up your plan…");
      navigate({ to: "/plans/$planId", params: { planId } });
      // Fire generation in the background (page will poll)
      generateFn({ data: { planId } }).catch((err) => {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start plan");
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold text-primary">New meal plan</h1>
        <p className="mt-1 text-muted-foreground">Tell Lovable Meals about your week.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <Section title="How many nights?">
            <div className="flex gap-2">
              {([1, 2, 3, 4, 5, 6, 7] as const).map((n) => (
                <Chip key={n} active={planLength === n} onClick={() => setPlanLength(n)}>
                  {n} {n === 1 ? "night" : "nights"}
                </Chip>
              ))}
            </div>
          </Section>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title={`Servings per meal: ${servings}`}>
              <input
                type="range"
                min={1}
                max={8}
                value={servings}
                onChange={(e) => setServings(Number(e.target.value))}
                className="w-full accent-coral"
              />
            </Section>
            <Section title={`Max time per meal: ${maxTime} min`}>
              <input
                type="range"
                min={15}
                max={120}
                step={5}
                value={maxTime}
                onChange={(e) => setMaxTime(Number(e.target.value))}
                className="w-full accent-coral"
              />
            </Section>
          </div>

          <Section title="Dietary pattern">
            <div className="flex flex-wrap gap-2">
              {DIETARY.map((d) => (
                <Chip key={d} active={dietary === d} onClick={() => setDietary(d)}>
                  {d}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Allergens to strictly avoid">
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((a) => (
                <Chip key={a} active={allergens.includes(a)} onClick={() => toggle(allergens, setAllergens, a)}>
                  {a}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Favorite cuisines (optional)">
            <div className="flex flex-wrap gap-2">
              {CUISINES.map((c) => (
                <Chip key={c} active={cuisines.includes(c)} onClick={() => toggle(cuisines, setCuisines, c)}>
                  {c}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="Preferred proteins (optional)">
            <div className="flex flex-wrap gap-2">
              {PROTEINS.map((p) => (
                <Chip key={p} active={proteins.includes(p)} onClick={() => toggle(proteins, setProteins, p)}>
                  {p}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title="What's in your pantry? (comma-separated, optional)">
            <div className="relative">
              <input
                type="text"
                value={pantry}
                onChange={(e) => setPantry(e.target.value)}
                placeholder="rice, canned tomatoes, olive oil, garlic"
                className="w-full rounded-xl border border-input bg-card px-4 py-2.5 pr-12 text-sm outline-none focus:border-coral"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton
                  value={pantry}
                  onChange={setPantry}
                  idleLabel="Add pantry items by voice"
                />
              </div>
            </div>
          </Section>

          <Section title="Foods to avoid (comma-separated, optional)">
            <div className="relative">
              <input
                type="text"
                value={excluded}
                onChange={(e) => setExcluded(e.target.value)}
                placeholder="cilantro, mushrooms, olives"
                className="w-full rounded-xl border border-input bg-card px-4 py-2.5 pr-12 text-sm outline-none focus:border-coral"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2">
                <VoiceInputButton
                  value={excluded}
                  onChange={setExcluded}
                  idleLabel="Add foods to avoid by voice"
                />
              </div>
            </div>
          </Section>

          <div className="grid gap-6 md:grid-cols-2">
            <Section title="Budget">
              <div className="flex flex-wrap gap-2">
                {["budget-friendly", "moderate", "no-limit"].map((b) => (
                  <Chip key={b} active={budget === b} onClick={() => setBudget(b)}>
                    {b}
                  </Chip>
                ))}
              </div>
            </Section>
            <Section title="Plan for leftovers?">
              <div className="flex gap-2">
                <Chip active={leftovers} onClick={() => setLeftovers(true)}>Yes</Chip>
                <Chip active={!leftovers} onClick={() => setLeftovers(false)}>No</Chip>
              </div>
            </Section>
          </div>

          <Section title="Anything else? (optional)">
            <NotesField value={notes} onChange={setNotes} />
            <p className="mt-1 text-right text-xs text-muted-foreground">{notes.length}/2000</p>
          </Section>


          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-coral px-6 py-3.5 text-base font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            Generate my plan
          </button>
        </form>
      </div>
    </AppShell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-primary">{title}</label>
      {children}
    </div>
  );
}

function NotesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const set = (v: string) => onChange(v.slice(0, 2000));
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 rounded-2xl border border-dashed border-coral/40 bg-coral/5 p-3">
        <VoiceInputButton
          value={value}
          onChange={set}
          maxLength={2000}
          continuous
          size="md"
          idleLabel="Describe your meal plan by voice"
        />
        <div className="text-xs text-muted-foreground">
          <span className="block font-medium text-primary">Describe your meal plan by voice</span>
          Speech is streamed live and appended below — review and edit before generating.
        </div>
      </div>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => set(e.target.value)}
          rows={4}
          placeholder="Kids are picky, one busy night on Wednesday, trying to use up cabbage…"
          className="w-full rounded-xl border border-input bg-card px-4 py-2.5 pr-12 text-sm outline-none focus:border-coral"
        />
        <div className="absolute right-2 top-2">
          <VoiceInputButton value={value} onChange={set} maxLength={2000} />
        </div>
      </div>
    </div>
  );
}

