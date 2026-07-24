
DROP POLICY IF EXISTS "Public can view shared plans" ON public.meal_plans;
DROP POLICY IF EXISTS "Public can view recipes of shared plans" ON public.recipes;

CREATE OR REPLACE FUNCTION public.get_shared_plan(p_token text)
RETURNS TABLE (
  id uuid,
  name text,
  summary text,
  plan_length integer,
  servings integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, summary, plan_length, servings, created_at
  FROM public.meal_plans
  WHERE share_token IS NOT NULL
    AND share_token = p_token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_shared_recipes(p_token text)
RETURNS SETOF public.recipes
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.*
  FROM public.recipes r
  JOIN public.meal_plans p ON p.id = r.plan_id
  WHERE p.share_token IS NOT NULL
    AND p.share_token = p_token
  ORDER BY r."order" ASC;
$$;

REVOKE ALL ON FUNCTION public.get_shared_plan(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shared_recipes(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shared_plan(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_shared_recipes(text) TO anon, authenticated;
