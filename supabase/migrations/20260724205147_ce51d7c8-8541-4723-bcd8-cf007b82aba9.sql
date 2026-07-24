CREATE OR REPLACE FUNCTION public._test_seed_shared_plan_with_recipes(
  p_plan_id uuid, p_owner_id uuid, p_share_token text, p_plan_length int, p_servings int
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE i int;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, created_at, updated_at)
  VALUES (p_owner_id, '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'e2e-' || p_owner_id || '@test.local', now(), now())
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.meal_plans
    (id, owner_id, name, plan_length, servings, status, share_token, preferred_servings)
  VALUES
    (p_plan_id, p_owner_id, 'E2E len ' || p_plan_length, p_plan_length, p_servings, 'ready', p_share_token, p_servings);

  FOR i IN 1..p_plan_length LOOP
    INSERT INTO public.recipes
      (plan_id, owner_id, "order", name, description, cuisine, authenticity_label,
       total_time_minutes, servings, difficulty)
    VALUES
      (p_plan_id, p_owner_id, i, 'Night ' || i || ' dish', 'desc', 'Test',
       'traditional', 30, p_servings, 'easy');
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION public._test_seed_shared_plan_with_recipes(uuid,uuid,text,int,int) FROM PUBLIC, anon, authenticated;