CREATE TABLE public.clients_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clients_history TO authenticated;
GRANT ALL ON public.clients_history TO service_role;
ALTER TABLE public.clients_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read own client history" ON public.clients_history FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX clients_history_user_idx ON public.clients_history(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.backup_client_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.clients_history(client_id, user_id, action, data) VALUES (OLD.id, OLD.user_id, 'delete', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  IF to_jsonb(OLD) - 'updated_at' - 'sigma_synced_at' IS DISTINCT FROM to_jsonb(NEW) - 'updated_at' - 'sigma_synced_at' THEN
    INSERT INTO public.clients_history(client_id, user_id, action, data) VALUES (OLD.id, OLD.user_id, 'update', to_jsonb(OLD));
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_backup_client_row BEFORE UPDATE OR DELETE ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.backup_client_row();

CREATE OR REPLACE FUNCTION public.restore_deleted_clients(p_since timestamptz DEFAULT now() - interval '30 days')
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer;
BEGIN
  WITH last_del AS (
    SELECT DISTINCT ON (h.client_id) h.data FROM public.clients_history h
    WHERE h.user_id = auth.uid() AND h.action = 'delete' AND h.created_at >= p_since
      AND NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = h.client_id)
    ORDER BY h.client_id, h.created_at DESC
  ), ins AS (
    INSERT INTO public.clients SELECT (jsonb_populate_record(NULL::public.clients, data)).* FROM last_del
    ON CONFLICT (id) DO NOTHING RETURNING 1
  ) SELECT count(*) INTO v_count FROM ins;
  RETURN v_count;
END; $$;
REVOKE ALL ON FUNCTION public.restore_deleted_clients(timestamptz) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_clients(timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.cleanup_old_logs()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $function$
  DELETE FROM public.whatsapp_processed_messages WHERE processed_at < now() - interval '30 days';
  DELETE FROM public.message_logs WHERE created_at < now() - interval '30 days';
  DELETE FROM public.clients_history WHERE created_at < now() - interval '90 days';
$function$;