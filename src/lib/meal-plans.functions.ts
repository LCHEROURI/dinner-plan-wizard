import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PlanGenerationInput } from "./meal-plan-types";

const DAILY_PLAN_LIMIT = 5;

async function assertUnderDailyLimit(supabase: any, userId: string) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("meal_plans")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", userId)
    .gte("created_at", since.toISOString());
  if (error) throw new Error(error.message);
  if ((count ?? 0) >= DAILY_PLAN_LIMIT) {
    throw new Error(`Daily limit reached (${DAILY_PLAN_LIMIT} plans/day). Try again tomorrow.`);
  }
}

// --- Create a draft plan ---
export const createPlanDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { input: PlanGenerationInput }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertUnderDailyLimit(supabase, userId);
    const { data: plan, error } = await supabase
      .from("meal_plans")
      .insert({
        owner_id: userId,
        name: `${data.input.plan_length}-day plan`,
        status: "generating",
        plan_length: data.input.plan_length,
        servings: data.input.servings,
        generation_input: data.input as unknown as never,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { planId: plan.id as string };
  });


// --- Generate the plan via AI (called after draft) ---
export const generatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { callLovableAiJSON } = await import("./ai-gateway.server");

    const { data: plan, error: planErr } = await supabase
      .from("meal_plans")
      .select("*")
      .eq("id", data.planId)
      .eq("owner_id", userId)
      .single();
    if (planErr || !plan) throw new Error("Plan not found");

    const input = plan.generation_input as unknown as PlanGenerationInput;

    const system = `You are a practical weeknight meal planner. HARD RULES:
1. Only propose RECOGNIZABLE, ESTABLISHED dishes (e.g. Chicken Piccata, Chana Masala, Oyakodon, Nasi Goreng, Shakshuka). Never invent fusion combinations.
2. Do NOT combine unrelated cuisines just to use pantry items.
3. Only label a dish "traditional" if ingredients and method match the recognized version.
4. If you modify a known dish substantially, label it "adapted_to_preferences".
5. Use common grocery-store ingredients.
6. Reuse ingredients across the week to reduce waste.
7. Vary proteins, cuisines, sauces, and cooking methods across the week.
8. Keep total time realistic and within the user's max.
9. Respect allergens strictly — never include them or their common derivatives.
10. No medical claims, no nutrition guarantees, no unsafe food-handling advice.
11. Return ONLY valid JSON matching the schema.`;

    const user = `Generate a ${input.plan_length}-day dinner plan.

Constraints:
- Servings per meal: ${input.servings}
- Max total time per meal: ${input.max_total_time_minutes} minutes
- Dietary pattern: ${input.dietary_pattern}
- Allergens to STRICTLY avoid: ${input.allergens.join(", ") || "none"}
- Excluded ingredients: ${input.excluded_ingredients.join(", ") || "none"}
- Preferred cuisines: ${input.favorite_cuisines.join(", ") || "any"}
- Preferred proteins: ${input.preferred_proteins.join(", ") || "any"}
- Pantry items already on hand: ${input.pantry_items.join(", ") || "none"}
- Budget: ${input.budget_preference}
- Plan for leftovers: ${input.leftovers ? "yes" : "no"}
- Skill level: ${input.skill_level}
- Notes from user: ${input.notes || "none"}

Return JSON in this exact shape:
{
  "summary": "one sentence describing the week",
  "recipes": [
    {
      "name": "string",
      "description": "one sentence",
      "cuisine": "string",
      "origin_country": "string",
      "authenticity_label": "traditional|widely_recognized|common_variation|adapted_to_preferences",
      "why_it_fits": "string",
      "prep_time_minutes": number,
      "cook_time_minutes": number,
      "total_time_minutes": number,
      "servings": number,
      "difficulty": "easy|medium|hard",
      "equipment": ["string"],
      "ingredients": [{"name":"string","quantity":"string","category":"produce|meat-seafood|dairy|bakery|pantry|spices|frozen|canned|other","notes":"string"}],
      "preparation_steps": ["string"],
      "cooking_steps": ["string"],
      "presentation_suggestions": "string",
      "substitutions": [{"ingredient":"string","alternatives":["string"]}],
      "leftover_instructions": "string",
      "food_safety_notes": ["string"],
      "allergen_flags": ["string"],
      "dietary_tags": ["string"],
      "side_dish_suggestion": "string"
    }
  ]
}`;

    try {
      const result = await callLovableAiJSON<{
        summary: string;
        recipes: Array<Record<string, unknown>>;
      }>({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.7,
      });

      if (!Array.isArray(result.recipes) || result.recipes.length === 0) {
        throw new Error("AI returned no recipes");
      }

      // Validation
      const recipes = result.recipes.slice(0, input.plan_length);
      const names = new Set<string>();
      for (const r of recipes) {
        const name = String(r.name ?? "");
        if (!name) throw new Error("Recipe missing name");
        if (names.has(name.toLowerCase())) throw new Error(`Duplicate recipe: ${name}`);
        names.add(name.toLowerCase());
        const total = Number(r.total_time_minutes ?? 0);
        if (total > input.max_total_time_minutes + 15) {
          // Soft ceiling; clamp instead of rejecting
          r.total_time_minutes = input.max_total_time_minutes;
        }
      }

      // Insert recipes
      const recipeRows = recipes.map((r, i) => ({
        plan_id: plan.id,
        owner_id: userId,
        order: i,
        name: String(r.name),
        description: String(r.description ?? ""),
        cuisine: String(r.cuisine ?? ""),
        origin_country: String(r.origin_country ?? ""),
        authenticity_label: String(r.authenticity_label ?? "widely_recognized"),
        why_it_fits: String(r.why_it_fits ?? ""),
        prep_time_minutes: Number(r.prep_time_minutes ?? 0),
        cook_time_minutes: Number(r.cook_time_minutes ?? 0),
        total_time_minutes: Number(r.total_time_minutes ?? 0),
        servings: Number(r.servings ?? input.servings),
        difficulty: String(r.difficulty ?? "medium"),
        equipment: Array.isArray(r.equipment) ? (r.equipment as string[]) : [],
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        preparation_steps: Array.isArray(r.preparation_steps) ? (r.preparation_steps as string[]) : [],
        cooking_steps: Array.isArray(r.cooking_steps) ? (r.cooking_steps as string[]) : [],
        presentation_suggestions: String(r.presentation_suggestions ?? ""),
        substitutions: Array.isArray(r.substitutions) ? r.substitutions : [],
        leftover_instructions: String(r.leftover_instructions ?? ""),
        food_safety_notes: Array.isArray(r.food_safety_notes) ? (r.food_safety_notes as string[]) : [],
        allergen_flags: Array.isArray(r.allergen_flags) ? (r.allergen_flags as string[]) : [],
        dietary_tags: Array.isArray(r.dietary_tags) ? (r.dietary_tags as string[]) : [],
        side_dish_suggestion: String(r.side_dish_suggestion ?? ""),
      }));

      const { error: insErr } = await supabase.from("recipes").insert(recipeRows);
      if (insErr) throw new Error(insErr.message);

      // Build consolidated shopping list
      const shoppingMap = new Map<string, { display_text: string; category: string; sort_order: number }>();
      let sort = 0;
      for (const r of recipeRows) {
        for (const ing of r.ingredients as Array<Record<string, unknown>>) {
          const name = String(ing.name ?? "").trim().toLowerCase();
          if (!name) continue;
          const category = String(ing.category ?? "other");
          const qty = String(ing.quantity ?? "");
          const key = `${category}:${name}`;
          if (!shoppingMap.has(key)) {
            shoppingMap.set(key, {
              display_text: qty ? `${qty} ${ing.name}` : String(ing.name),
              category,
              sort_order: sort++,
            });
          } else {
            const existing = shoppingMap.get(key)!;
            existing.display_text += qty ? ` + ${qty}` : "";
          }
        }
      }
      const shoppingRows = Array.from(shoppingMap.entries()).map(([key, v]) => {
        const name = key.split(":").slice(1).join(":");
        return {
          plan_id: plan.id,
          owner_id: userId,
          name,
          display_text: v.display_text,
          category: v.category,
          sort_order: v.sort_order,
        };
      });
      if (shoppingRows.length) {
        await supabase.from("shopping_items").insert(shoppingRows);
      }

      await supabase
        .from("meal_plans")
        .update({ status: "ready", summary: result.summary ?? null })
        .eq("id", plan.id);

      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("meal_plans")
        .update({ status: "failed", error_message: msg })
        .eq("id", plan.id);
      throw new Error(msg);
    }
  });

// --- List plans ---
export const listMyPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("meal_plans")
      .select("*")
      .eq("owner_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// --- Get plan with recipes ---
export const getPlanWithRecipes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: plan }, { data: recipes }] = await Promise.all([
      supabase.from("meal_plans").select("*").eq("id", data.planId).eq("owner_id", userId).single(),
      supabase
        .from("recipes")
        .select("*")
        .eq("plan_id", data.planId)
        .eq("owner_id", userId)
        .order("order", { ascending: true }),
    ]);
    if (!plan) throw new Error("Plan not found");
    return { plan, recipes: recipes ?? [] };
  });

// --- Get shopping list ---
export const getShoppingList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: items, error } = await context.supabase
      .from("shopping_items")
      .select("*")
      .eq("plan_id", data.planId)
      .eq("owner_id", context.userId)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return items ?? [];
  });

// --- Toggle shopping item ---
export const toggleShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string; checked: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("shopping_items")
      .update({ is_checked: data.checked })
      .eq("id", data.itemId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Profile ---
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    return data;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, unknown>) => input)
  .handler(async ({ data, context }) => {
    const allowed = [
      "display_name",
      "household_size",
      "default_servings",
      "default_plan_length",
      "max_total_time_minutes",
      "dietary_pattern",
      "allergens",
      "excluded_ingredients",
      "favorite_cuisines",
      "preferred_proteins",
      "available_equipment",
      "skill_level",
      "budget_preference",
      "leftover_preference",
      "measurement_system",
      "onboarding_completed",
    ];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in data) patch[k] = data[k];
    const { error } = await context.supabase
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update(patch as any)
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Delete a plan ---
export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("meal_plans")
      .delete()
      .eq("id", data.planId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// --- Rename a plan ---
export const renamePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; name: string }) => input)
  .handler(async ({ data, context }) => {
    const { planNameSchema } = await import("./plan-name");
    const parsed = planNameSchema.safeParse(data.name);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid name");
    const name = parsed.data;
    // duplicate check (case-insensitive) among this user's other plans
    const { data: dupes } = await context.supabase
      .from("meal_plans")
      .select("id")
      .eq("owner_id", context.userId)
      .neq("id", data.planId)
      .ilike("name", name)
      .limit(1);
    if (dupes && dupes.length > 0) throw new Error("You already have a plan with this name");
    const { error } = await context.supabase
      .from("meal_plans")
      .update({ name })
      .eq("id", data.planId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, name };
  });

// --- Set preferred servings (persisted scaling) ---
export const setPreferredServings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; servings: number | null }) => input)
  .handler(async ({ data, context }) => {
    let value: number | null = null;
    if (data.servings !== null && data.servings !== undefined) {
      const n = Math.round(Number(data.servings));
      if (!Number.isFinite(n) || n < 1 || n > 24) throw new Error("Servings must be between 1 and 24");
      value = n;
    }
    const { error } = await context.supabase
      .from("meal_plans")
      .update({ preferred_servings: value })
      .eq("id", data.planId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, preferred_servings: value };
  });


// --- Toggle public share ---
export const toggleShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; enable: boolean }) => input)
  .handler(async ({ data, context }) => {
    const token = data.enable
      ? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
      : null;
    const { error } = await context.supabase
      .from("meal_plans")
      .update({ share_token: token })
      .eq("id", data.planId)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { share_token: token };
  });

// --- Public: get shared plan by token (no auth) ---
export const getSharedPlan = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const client = createClient<import("@/integrations/supabase/types").Database>(process.env.SUPABASE_URL!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: plan } = await client
      .rpc("get_shared_plan", { p_token: data.token })
      .maybeSingle();
    if (!plan) throw new Error("Shared plan not found");
    const { data: recipes } = await client
      .rpc("get_shared_recipes", { p_token: data.token });
    return { plan, recipes: recipes ?? [] };
  });

// --- Regenerate a single recipe ---
export const regenerateRecipe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { recipeId: string; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { callLovableAiJSON } = await import("./ai-gateway.server");

    const { data: recipe } = await supabase
      .from("recipes")
      .select("*, meal_plans!inner(generation_input, owner_id)")
      .eq("id", data.recipeId)
      .eq("owner_id", userId)
      .single();
    if (!recipe) throw new Error("Recipe not found");

    const { data: siblings } = await supabase
      .from("recipes")
      .select("name")
      .eq("plan_id", recipe.plan_id)
      .neq("id", data.recipeId);
    const input = (recipe as unknown as { meal_plans: { generation_input: PlanGenerationInput } }).meal_plans.generation_input as PlanGenerationInput;
    const avoid = (siblings ?? []).map((s) => s.name).concat(recipe.name);

    const system = `You are a practical weeknight meal planner. Only propose RECOGNIZABLE, established dishes. Respect allergens strictly. Return ONLY valid JSON.`;
    const user = `Replace this recipe with a different recognizable dinner.
Do NOT use any of these names: ${avoid.join(", ")}.
Constraints:
- Servings: ${input.servings}
- Max total time: ${input.max_total_time_minutes} minutes
- Dietary pattern: ${input.dietary_pattern}
- Allergens to avoid: ${input.allergens.join(", ") || "none"}
- Excluded: ${input.excluded_ingredients.join(", ") || "none"}
- Preferred cuisines: ${input.favorite_cuisines.join(", ") || "any"}
- Reason for replacement: ${data.reason || "user requested a different dish"}

Return JSON: { "recipe": { name, description, cuisine, origin_country, authenticity_label, why_it_fits, prep_time_minutes, cook_time_minutes, total_time_minutes, servings, difficulty, equipment:[], ingredients:[{name,quantity,category,notes}], preparation_steps:[], cooking_steps:[], presentation_suggestions, substitutions:[], leftover_instructions, food_safety_notes:[], allergen_flags:[], dietary_tags:[], side_dish_suggestion } }`;

    const result = await callLovableAiJSON<{ recipe: Record<string, unknown> }>({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.8,
    });
    const r = result.recipe;
    if (!r?.name) throw new Error("AI returned no recipe");

    const { error } = await supabase
      .from("recipes")
      .update({
        name: String(r.name),
        description: String(r.description ?? ""),
        cuisine: String(r.cuisine ?? ""),
        origin_country: String(r.origin_country ?? ""),
        authenticity_label: String(r.authenticity_label ?? "widely_recognized"),
        why_it_fits: String(r.why_it_fits ?? ""),
        prep_time_minutes: Number(r.prep_time_minutes ?? 0),
        cook_time_minutes: Number(r.cook_time_minutes ?? 0),
        total_time_minutes: Number(r.total_time_minutes ?? 0),
        servings: Number(r.servings ?? input.servings),
        difficulty: String(r.difficulty ?? "medium"),
        equipment: Array.isArray(r.equipment) ? r.equipment : [],
        ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
        preparation_steps: Array.isArray(r.preparation_steps) ? r.preparation_steps : [],
        cooking_steps: Array.isArray(r.cooking_steps) ? r.cooking_steps : [],
        presentation_suggestions: String(r.presentation_suggestions ?? ""),
        substitutions: Array.isArray(r.substitutions) ? r.substitutions : [],
        leftover_instructions: String(r.leftover_instructions ?? ""),
        food_safety_notes: Array.isArray(r.food_safety_notes) ? r.food_safety_notes : [],
        allergen_flags: Array.isArray(r.allergen_flags) ? r.allergen_flags : [],
        dietary_tags: Array.isArray(r.dietary_tags) ? r.dietary_tags : [],
        side_dish_suggestion: String(r.side_dish_suggestion ?? ""),
      } as never)
      .eq("id", data.recipeId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
