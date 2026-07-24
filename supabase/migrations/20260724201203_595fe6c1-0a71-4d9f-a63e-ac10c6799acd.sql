
CREATE OR REPLACE FUNCTION public._test_confirm_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  UPDATE auth.users
     SET email_confirmed_at = now(), updated_at = now()
   WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public._test_confirm_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._test_confirm_user(uuid) TO service_role;

-- Companion cleanup so tests can remove their user via a permitted path.
CREATE OR REPLACE FUNCTION public._test_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  DELETE FROM public.meal_plans WHERE owner_id = p_user_id;
  DELETE FROM auth.identities WHERE user_id = p_user_id;
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public._test_delete_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._test_delete_user(uuid) TO service_role;
