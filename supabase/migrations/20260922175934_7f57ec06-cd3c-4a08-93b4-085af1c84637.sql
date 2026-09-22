ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'close',
  ADD COLUMN IF NOT EXISTS connected_number text,
  ADD COLUMN IF NOT EXISTS last_connected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_disconnected_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_connection_error text;

CREATE INDEX IF NOT EXISTS whatsapp_settings_instance_name_idx ON public.whatsapp_settings (instance_name);