ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS sigma_username text,
  ADD COLUMN IF NOT EXISTS sigma_password text;