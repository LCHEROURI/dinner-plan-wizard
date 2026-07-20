-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,
  household_size INT DEFAULT 2,
  default_servings INT DEFAULT 4,
  default_plan_length INT DEFAULT 5,
  max_total_time_minutes INT DEFAULT 45,
  dietary_pattern TEXT DEFAULT 'omnivore',
  allergens TEXT[] DEFAULT '{}',
  excluded_ingredients TEXT[] DEFAULT '{}',
  favorite_cuisines TEXT[] DEFAULT '{}',
  disliked_cuisines TEXT[] DEFAULT '{}',
  preferred_proteins TEXT[] DEFAULT '{}',
  available_equipment TEXT[] DEFAULT '{}',
  skill_level TEXT DEFAULT 'intermediate',
  budget_preference TEXT DEFAULT 'moderate',
  leftover_preference BOOLEAN DEFAULT true,
  measurement_system TEXT DEFAULT 'us',
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_profile_all" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Meal Plans
CREATE TABLE public.meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Weekly plan',
  status TEXT NOT NULL DEFAULT 'draft',
  plan_length INT NOT NULL DEFAULT 5,
  servings INT NOT NULL DEFAULT 4,
  generation_input JSONB,
  summary TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plans TO authenticated;
GRANT ALL ON public.meal_plans TO service_role;
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_plans_all" ON public.meal_plans FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_meal_plans_owner ON public.meal_plans(owner_id, created_at DESC);

-- Recipes
CREATE TABLE public.recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  "order" INT NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  description TEXT,
  cuisine TEXT,
  origin_country TEXT,
  authenticity_label TEXT,
  why_it_fits TEXT,
  prep_time_minutes INT DEFAULT 0,
  cook_time_minutes INT DEFAULT 0,
  total_time_minutes INT DEFAULT 0,
  servings INT DEFAULT 4,
  difficulty TEXT,
  equipment TEXT[] DEFAULT '{}',
  ingredients JSONB DEFAULT '[]',
  preparation_steps JSONB DEFAULT '[]',
  cooking_steps JSONB DEFAULT '[]',
  presentation_suggestions TEXT,
  substitutions JSONB DEFAULT '[]',
  leftover_instructions TEXT,
  food_safety_notes TEXT[] DEFAULT '{}',
  allergen_flags TEXT[] DEFAULT '{}',
  dietary_tags TEXT[] DEFAULT '{}',
  side_dish_suggestion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recipes TO authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_recipes_all" ON public.recipes FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_recipes_plan ON public.recipes(plan_id, "order");

-- Shopping Items
CREATE TABLE public.shopping_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.meal_plans(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_text TEXT,
  category TEXT DEFAULT 'other',
  is_pantry_item BOOLEAN DEFAULT false,
  is_checked BOOLEAN DEFAULT false,
  is_custom BOOLEAN DEFAULT false,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopping_items TO authenticated;
GRANT ALL ON public.shopping_items TO service_role;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_shopping_all" ON public.shopping_items FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_shopping_plan ON public.shopping_items(plan_id, category, sort_order);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_plans_updated BEFORE UPDATE ON public.meal_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_recipes_updated BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_shopping_updated BEFORE UPDATE ON public.shopping_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();