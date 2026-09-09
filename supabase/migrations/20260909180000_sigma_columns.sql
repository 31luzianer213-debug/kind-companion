ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS sigma_username text,
  ADD COLUMN IF NOT EXISTS sigma_password text,
  ADD COLUMN IF NOT EXISTS sigma_server_name text,
  ADD COLUMN IF NOT EXISTS sigma_streaming_dns text;
