-- Multiple Sigma panels per reseller account.
CREATE TABLE IF NOT EXISTS public.sigma_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Servidor Sigma',
  panel_url TEXT NOT NULL,
  streaming_dns TEXT,
  username TEXT,
  password TEXT,
  token TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  auto_renew BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,
  last_sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sigma_servers_credentials_check CHECK (
    token IS NOT NULL OR (username IS NOT NULL AND password IS NOT NULL)
  )
);

ALTER TABLE public.sigma_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor gerencia seus servidores Sigma"
ON public.sigma_servers FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sigma_servers TO authenticated;
GRANT ALL ON public.sigma_servers TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS sigma_servers_user_panel_unique
  ON public.sigma_servers (user_id, lower(panel_url), lower(coalesce(username, '')));
CREATE UNIQUE INDEX IF NOT EXISTS sigma_servers_one_default
  ON public.sigma_servers (user_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS sigma_servers_user_enabled_idx
  ON public.sigma_servers (user_id, enabled);

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sigma_server_id UUID REFERENCES public.sigma_servers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS clients_sigma_server_idx
  ON public.clients (user_id, sigma_server_id);
CREATE UNIQUE INDEX IF NOT EXISTS clients_sigma_identity_unique
  ON public.clients (user_id, sigma_server_id, sigma_customer_id)
  WHERE sigma_server_id IS NOT NULL AND sigma_customer_id IS NOT NULL;

-- Preserve the existing single-panel configuration as the default server.
INSERT INTO public.sigma_servers (
  user_id, name, panel_url, streaming_dns, username, password, token,
  enabled, auto_renew, is_default, last_sync_at
)
SELECT
  user_id,
  coalesce(nullif(sigma_server_name, ''), 'Servidor Sigma'),
  sigma_url,
  nullif(sigma_streaming_dns, ''),
  nullif(sigma_username, ''),
  nullif(sigma_password, ''),
  nullif(sigma_token, ''),
  coalesce(sigma_enabled, true),
  coalesce(sigma_auto_renew, true),
  true,
  sigma_last_sync_at
FROM public.whatsapp_settings
WHERE nullif(sigma_url, '') IS NOT NULL
  AND (
    nullif(sigma_token, '') IS NOT NULL OR
    (nullif(sigma_username, '') IS NOT NULL AND nullif(sigma_password, '') IS NOT NULL)
  )
ON CONFLICT DO NOTHING;

UPDATE public.clients AS client
SET sigma_server_id = server.id
FROM public.sigma_servers AS server
WHERE client.user_id = server.user_id
  AND server.is_default
  AND client.sigma_server_id IS NULL
  AND client.sigma_customer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_sigma_server_default()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.sigma_servers
      SET is_default = false, updated_at = now()
      WHERE user_id = NEW.user_id AND id <> NEW.id AND is_default;
  ELSIF NOT EXISTS (
    SELECT 1 FROM public.sigma_servers
    WHERE user_id = NEW.user_id AND id <> NEW.id AND is_default
  ) THEN
    NEW.is_default := true;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_single_default_sigma_server ON public.sigma_servers;
CREATE TRIGGER ensure_single_default_sigma_server
BEFORE INSERT OR UPDATE ON public.sigma_servers
FOR EACH ROW EXECUTE FUNCTION public.set_sigma_server_default();
