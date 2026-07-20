
-- Test helper: SECURITY DEFINER functions to seed/cleanup an isolated shared
-- meal plan for end-to-end tests that verify anon column-level restrictions
-- on meal_plans.preferred_servings. Execute is restricted to service_role so
-- these cannot be called via the Data API by anon or authenticated clients.

CREATE OR REPLACE FUNCTION public._test_seed_shared_plan(
  p_plan_id UUID,
  p_owner_id UUID,
  p_share_token TEXT,
  p_preferred_servings INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  VALUES (p_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'e2e-' || p_owner_id || '@test.local', now(), now());
  INSERT INTO public.meal_plans
    (id, owner_id, name, plan_length, servings, status, share_token, preferred_servings)
  VALUES
    (p_plan_id, p_owner_id, 'E2E share test', 5, 4, 'ready', p_share_token, p_preferred_servings);
END;
$$;

CREATE OR REPLACE FUNCTION public._test_cleanup_shared_plan(
  p_plan_id UUID,
  p_owner_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM public.meal_plans WHERE id = p_plan_id;
  DELETE FROM auth.users WHERE id = p_owner_id;
END;
$$;

REVOKE ALL ON FUNCTION public._test_seed_shared_plan(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_cleanup_shared_plan(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._test_seed_shared_plan(UUID, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public._test_cleanup_shared_plan(UUID, UUID) TO service_role;
