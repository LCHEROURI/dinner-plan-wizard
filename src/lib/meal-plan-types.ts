// Client-safe types shared across UI and server functions.

export type AuthenticityLabel =
  | "traditional"
  | "widely_recognized"
  | "common_variation"
  | "adapted_to_preferences";

export type IngredientCategory =
  | "produce"
  | "meat-seafood"
  | "dairy"
  | "bakery"
  | "pantry"
  | "spices"
  | "frozen"
  | "canned"
  | "other";

export interface Ingredient {
  name: string;
  quantity: string;
  category: IngredientCategory;
  notes?: string;
}

export interface Recipe {
  id: string;
  plan_id: string;
  order: number;
  name: string;
  description: string;
  cuisine: string;
  origin_country: string;
  authenticity_label: AuthenticityLabel;
  why_it_fits: string;
  prep_time_minutes: number;
  cook_time_minutes: number;
  total_time_minutes: number;
  servings: number;
  difficulty: string;
  equipment: string[];
  ingredients: Ingredient[];
  preparation_steps: string[];
  cooking_steps: string[];
  presentation_suggestions: string;
  substitutions: Array<{ ingredient: string; alternatives: string[] }>;
  leftover_instructions: string;
  food_safety_notes: string[];
  allergen_flags: string[];
  dietary_tags: string[];
  side_dish_suggestion: string;
}

export interface MealPlan {
  id: string;
  owner_id: string;
  name: string;
  status: "draft" | "generating" | "ready" | "failed";
  plan_length: number;
  servings: number;
  summary: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanGenerationInput {
  plan_length: 3 | 5 | 7;
  servings: number;
  max_total_time_minutes: number;
  dietary_pattern: string;
  allergens: string[];
  excluded_ingredients: string[];
  favorite_cuisines: string[];
  preferred_proteins: string[];
  pantry_items: string[];
  budget_preference: string;
  leftovers: boolean;
  notes: string;
  skill_level: string;
}

export const AUTHENTICITY_COLORS: Record<AuthenticityLabel, string> = {
  traditional: "bg-sage/15 text-sage border-sage/30",
  widely_recognized: "bg-primary/10 text-primary border-primary/25",
  common_variation: "bg-gold/20 text-terracotta border-gold/40",
  adapted_to_preferences: "bg-coral/15 text-coral border-coral/30",
};

export const CATEGORY_COLORS: Record<IngredientCategory, string> = {
  produce: "bg-produce/15 text-produce border-produce/30",
  "meat-seafood": "bg-meat/15 text-meat border-meat/30",
  dairy: "bg-dairy/15 text-dairy border-dairy/30",
  bakery: "bg-pantry/15 text-pantry border-pantry/30",
  pantry: "bg-pantry/15 text-pantry border-pantry/30",
  spices: "bg-spices/15 text-spices border-spices/30",
  frozen: "bg-dairy/10 text-dairy border-dairy/25",
  canned: "bg-pantry/10 text-pantry border-pantry/25",
  other: "bg-muted text-muted-foreground border-border",
};

export const CATEGORY_LABELS: Record<IngredientCategory, string> = {
  produce: "Produce",
  "meat-seafood": "Meat & Seafood",
  dairy: "Dairy",
  bakery: "Bakery",
  pantry: "Pantry",
  spices: "Spices",
  frozen: "Frozen",
  canned: "Canned",
  other: "Other",
};
