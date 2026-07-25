import { createServerFn } from "@tanstack/react-start";
import { requireFirebaseAuth } from "@/integrations/firebase/auth-middleware";
import { adminDb } from "@/integrations/firebase/admin.server";
import type { PlanGenerationInput } from "./meal-plan-types";

const DAILY_PLAN_LIMIT = 5;

async function assertUnderDailyLimit(db: typeof adminDb, userId: string) {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  const snap = await db
    .collection("meal_plans")
    .where("owner_id", "==", userId)
    .where("created_at", ">=", since.toISOString())
    .get();
  if (snap.size >= DAILY_PLAN_LIMIT) {
    throw new Error(`Daily limit reached (${DAILY_PLAN_LIMIT} plans/day). Try again tomorrow.`);
  }
}

// --- Create a draft plan ---
export const createPlanDraft = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: any) => {
    const rawInput = input?.data?.input ?? input?.input ?? input;
    const pl = rawInput?.plan_length;
    if (typeof pl !== "number" || !Number.isInteger(pl) || pl < 1 || pl > 7) {
      throw new Error("plan_length must be an integer between 1 and 7");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const { db, userId } = context;
    await assertUnderDailyLimit(db, userId);
    const genInput = (data as any)?.input ?? data;
    const docRef = db.collection("meal_plans").doc();
    const planData = {
      id: docRef.id,
      owner_id: userId,
      name: `${genInput.plan_length}-day plan`,
      status: "generating",
      plan_length: genInput.plan_length,
      servings: genInput.servings,
      generation_input: genInput,
      created_at: new Date().toISOString(),
    };
    await docRef.set(planData);
    return { planId: docRef.id };
  });

// --- Generate the plan via AI (called after draft) ---
export const generatePlan = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }) => {
    const { db, userId } = context;
    const { callLovableAiJSON } = await import("./ai-gateway.server");

    const planDoc = await db.collection("meal_plans").doc(data.planId).get();
    if (!planDoc.exists || planDoc.data()?.owner_id !== userId) {
      throw new Error("Plan not found");
    }
    const plan = planDoc.data()!;
    const input = plan.generation_input as PlanGenerationInput;

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
- Allergens to STRICTLY avoid: ${(input.allergens ?? []).join(", ") || "none"}
- Excluded ingredients: ${(input.excluded_ingredients ?? []).join(", ") || "none"}
- Preferred cuisines: ${(input.favorite_cuisines ?? []).join(", ") || "any"}
- Preferred proteins: ${(input.preferred_proteins ?? []).join(", ") || "any"}
- Pantry items already on hand: ${(input.pantry_items ?? []).join(", ") || "none"}
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

      const recipes = result.recipes.slice(0, input.plan_length);
      const names = new Set<string>();
      for (const r of recipes) {
        const name = String(r.name ?? "");
        if (!name) throw new Error("Recipe missing name");
        if (names.has(name.toLowerCase())) throw new Error(`Duplicate recipe: ${name}`);
        names.add(name.toLowerCase());
        const total = Number(r.total_time_minutes ?? 0);
        if (total > input.max_total_time_minutes + 15) {
          r.total_time_minutes = input.max_total_time_minutes;
        }
      }

      const batch = db.batch();

      const recipeRows = recipes.map((r, i) => {
        const rRef = db.collection("recipes").doc();
        const rData = {
          id: rRef.id,
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
        };
        batch.set(rRef, rData);
        return rData;
      });

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

      for (const [key, v] of shoppingMap.entries()) {
        const name = key.split(":").slice(1).join(":");
        const sRef = db.collection("shopping_items").doc();
        batch.set(sRef, {
          id: sRef.id,
          plan_id: plan.id,
          owner_id: userId,
          name,
          display_text: v.display_text,
          category: v.category,
          sort_order: v.sort_order,
          is_checked: false,
        });
      }

      batch.update(db.collection("meal_plans").doc(plan.id), {
        status: "ready",
        summary: result.summary ?? null,
      });

      await batch.commit();
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.collection("meal_plans").doc(plan.id).update({
        status: "failed",
        error_message: msg,
      });
      throw new Error(msg);
    }
  });

// --- List plans ---
export const listMyPlans = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const snap = await context.db
      .collection("meal_plans")
      .where("owner_id", "==", context.userId)
      .get();
    const plans = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    plans.sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
    return plans.slice(0, 20);
  });

// --- Get plan with recipes ---
export const getPlanWithRecipes = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }) => {
    const { db, userId } = context;
    const planDoc = await db.collection("meal_plans").doc(data.planId).get();
    if (!planDoc.exists || planDoc.data()?.owner_id !== userId) {
      throw new Error("Plan not found");
    }
    const plan = { id: planDoc.id, ...planDoc.data() };

    const recipesSnap = await db
      .collection("recipes")
      .where("plan_id", "==", data.planId)
      .where("owner_id", "==", userId)
      .get();
    const recipes = recipesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    recipes.sort((a: any, b: any) => Number(a.order ?? 0) - Number(b.order ?? 0));

    return { plan, recipes };
  });

// --- Get shopping list ---
export const getShoppingList = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }) => {
    const snap = await context.db
      .collection("shopping_items")
      .where("plan_id", "==", data.planId)
      .where("owner_id", "==", context.userId)
      .get();
    const items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    items.sort((a: any, b: any) => {
      const catCompare = String(a.category || "").localeCompare(String(b.category || ""));
      if (catCompare !== 0) return catCompare;
      return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0);
    });
    return items;
  });

// --- Toggle shopping item ---
export const toggleShoppingItem = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: { itemId: string; checked: boolean }) => input)
  .handler(async ({ data, context }) => {
    const itemRef = context.db.collection("shopping_items").doc(data.itemId);
    const doc = await itemRef.get();
    if (!doc.exists || doc.data()?.owner_id !== context.userId) {
      throw new Error("Item not found");
    }
    await itemRef.update({ is_checked: data.checked });
    return { ok: true };
  });

// --- Profile ---
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    const doc = await context.db.collection("profiles").doc(context.userId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
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
      "meal_preferences",
    ];
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in data) patch[k] = data[k];

    await context.db.collection("profiles").doc(context.userId).set(patch, { merge: true });
    return { ok: true };
  });

// --- Delete a plan ---
export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }) => {
    const { db, userId } = context;
    const planRef = db.collection("meal_plans").doc(data.planId);
    const doc = await planRef.get();
    if (!doc.exists || doc.data()?.owner_id !== userId) {
      throw new Error("Plan not found");
    }
    await planRef.delete();
    const recipesSnap = await db.collection("recipes").where("plan_id", "==", data.planId).get();
    const shoppingSnap = await db.collection("shopping_items").where("plan_id", "==", data.planId).get();
    const batch = db.batch();
    recipesSnap.docs.forEach((d) => batch.delete(d.ref));
    shoppingSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return { ok: true };
  });

// --- Rename a plan ---
export const renamePlan = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: { planId: string; name: string }) => input)
  .handler(async ({ data, context }) => {
    const { planNameSchema } = await import("./plan-name");
    const parsed = planNameSchema.safeParse(data.name);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid name");
    const name = parsed.data;

    const dupesSnap = await context.db
      .collection("meal_plans")
      .where("owner_id", "==", context.userId)
      .get();

    const hasDupe = dupesSnap.docs.some(
      (doc) => doc.id !== data.planId && String(doc.data().name || "").toLowerCase() === name.toLowerCase()
    );
    if (hasDupe) throw new Error("You already have a plan with this name");

    await context.db.collection("meal_plans").doc(data.planId).update({ name });
    return { ok: true, name };
  });

// --- Set preferred servings ---
export const setPreferredServings = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: { planId: string; servings: number | null }) => input)
  .handler(async ({ data, context }) => {
    let value: number | null = null;
    if (data.servings !== null && data.servings !== undefined) {
      const n = Math.round(Number(data.servings));
      if (!Number.isFinite(n) || n < 1 || n > 24) throw new Error("Servings must be between 1 and 24");
      value = n;
    }
    await context.db.collection("meal_plans").doc(data.planId).update({ preferred_servings: value });
    return { ok: true, preferred_servings: value };
  });

// --- Toggle public share ---
export const toggleShare = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: { planId: string; enable: boolean }) => input)
  .handler(async ({ data, context }) => {
    const token = data.enable
      ? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
      : null;
    await context.db.collection("meal_plans").doc(data.planId).update({ share_token: token });
    return { share_token: token };
  });

// --- Public: get shared plan by token ---
export const getSharedPlan = createServerFn({ method: "GET" })
  .inputValidator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const { adminDb } = await import("@/integrations/firebase/admin.server");
    const planSnap = await adminDb
      .collection("meal_plans")
      .where("share_token", "==", data.token)
      .limit(1)
      .get();

    if (planSnap.empty) throw new Error("Shared plan not found");
    const planDoc = planSnap.docs[0]!;
    const plan = { id: planDoc.id, ...planDoc.data() };

    const recipesSnap = await adminDb
      .collection("recipes")
      .where("plan_id", "==", plan.id)
      .get();
    const recipes = recipesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    recipes.sort((a: any, b: any) => Number(a.order ?? 0) - Number(b.order ?? 0));

    return { plan, recipes };
  });

// --- Regenerate a single recipe ---
export const regenerateRecipe = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((input: { recipeId: string; reason?: string }) => input)
  .handler(async ({ data, context }) => {
    const { db, userId } = context;
    const { callLovableAiJSON } = await import("./ai-gateway.server");

    const recipeDoc = await db.collection("recipes").doc(data.recipeId).get();
    if (!recipeDoc.exists || recipeDoc.data()?.owner_id !== userId) {
      throw new Error("Recipe not found");
    }
    const recipe = { id: recipeDoc.id, ...recipeDoc.data() };

    const planDoc = await db.collection("meal_plans").doc(recipe.plan_id).get();
    const input = (planDoc.data()?.generation_input ?? {}) as PlanGenerationInput;

    const siblingsSnap = await db
      .collection("recipes")
      .where("plan_id", "==", recipe.plan_id)
      .get();

    const avoid = siblingsSnap.docs.map((d) => d.data().name).concat(recipe.name);

    const system = `You are a practical weeknight meal planner. Only propose RECOGNIZABLE, established dishes. Respect allergens strictly. Return ONLY valid JSON.`;
    const user = `Replace this recipe with a different recognizable dinner.
Do NOT use any of these names: ${avoid.join(", ")}.
Constraints:
- Servings: ${input.servings}
- Max total time: ${input.max_total_time_minutes} minutes
- Dietary pattern: ${input.dietary_pattern}
- Allergens to avoid: ${(input.allergens ?? []).join(", ") || "none"}
- Excluded: ${(input.excluded_ingredients ?? []).join(", ") || "none"}
- Preferred cuisines: ${(input.favorite_cuisines ?? []).join(", ") || "any"}
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

    await db.collection("recipes").doc(data.recipeId).update({
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
    });
    return { ok: true };
  });
