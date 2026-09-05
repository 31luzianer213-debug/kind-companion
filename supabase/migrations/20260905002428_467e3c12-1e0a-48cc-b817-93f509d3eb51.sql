ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS sigma_url text,
  ADD COLUMN IF NOT EXISTS sigma_token text,
  ADD COLUMN IF NOT EXISTS sigma_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sigma_auto_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sigma_last_sync_at timestamp with time zone;

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS sigma_customer_id text,
  ADD COLUMN IF NOT EXISTS sigma_username text,
  ADD COLUMN IF NOT EXISTS sigma_synced_at timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS clients_user_sigma_customer_idx
  ON public.clients (user_id, sigma_customer_id)
  WHERE sigma_customer_id IS NOT NULL;