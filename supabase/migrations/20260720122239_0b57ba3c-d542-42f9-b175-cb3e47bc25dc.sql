
ALTER TABLE public.meal_plans ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS meal_plans_share_token_idx ON public.meal_plans(share_token) WHERE share_token IS NOT NULL;

GRANT SELECT ON public.meal_plans TO anon;
GRANT SELECT ON public.recipes TO anon;

CREATE POLICY "Public can view shared plans" ON public.meal_plans
  FOR SELECT TO anon
  USING (share_token IS NOT NULL);

CREATE POLICY "Public can view recipes of shared plans" ON public.recipes
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.meal_plans p WHERE p.id = recipes.plan_id AND p.share_token IS NOT NULL));
