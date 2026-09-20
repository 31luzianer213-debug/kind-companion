REVOKE ALL ON FUNCTION public.subscription_state(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.subscription_state(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_client_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;