ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS sigma_username text,
  ADD COLUMN IF NOT EXISTS sigma_password text;

-- sigma_token passa a guardar o token obtido automaticamente via login
-- (mantido para compatibilidade com quem já usava token manual).
