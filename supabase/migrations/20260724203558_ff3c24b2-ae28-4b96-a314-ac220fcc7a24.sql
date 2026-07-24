
-- Revoke EXECUTE from PUBLIC/anon/authenticated on all SECURITY DEFINER functions.
-- Service role retains access (it bypasses grants where needed for admin ops).

REVOKE ALL ON FUNCTION public.get_shared_plan(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_shared_recipes(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_seed_shared_plan(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_cleanup_shared_plan(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_delete_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_confirm_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._test_seed_authed_user(text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_shared_plan(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_shared_recipes(text) TO service_role;
