DROP TRIGGER IF EXISTS clients_enforce_plan_limit ON public.clients;
DROP FUNCTION IF EXISTS public.enforce_client_limit();

CREATE OR REPLACE FUNCTION public.cleanup_old_logs() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.whatsapp_processed_messages WHERE processed_at < now() - interval '30 days';
  DELETE FROM public.message_logs WHERE created_at < now() - interval '30 days';
$$;
REVOKE ALL ON FUNCTION public.cleanup_old_logs() FROM PUBLIC, anon, authenticated;

SELECT cron.unschedule('limpeza-registros-antigos') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'limpeza-registros-antigos');
SELECT cron.schedule('limpeza-registros-antigos', '30 4 * * *', $$ SELECT public.cleanup_old_logs(); $$);