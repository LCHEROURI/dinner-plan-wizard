-- Owner-only column: revoke anon access to preferred_servings, keep other columns visible to shared-link viewers.
REVOKE SELECT ON public.meal_plans FROM anon;
GRANT SELECT (id, name, summary, plan_length, servings, share_token, status, created_at, updated_at, plan_length, generation_input, error_message)
  ON public.meal_plans TO anon;

-- Ensure authenticated owners still have full column access (RLS still scopes rows to auth.uid() = owner_id).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meal_plans TO authenticated;
GRANT ALL ON public.meal_plans TO service_role;