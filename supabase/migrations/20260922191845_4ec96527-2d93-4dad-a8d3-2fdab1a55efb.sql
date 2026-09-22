CREATE TABLE IF NOT EXISTS public.telegram_settings (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bot_token TEXT,
  bot_username TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  connected BOOLEAN NOT NULL DEFAULT false,
  webhook_secret TEXT,
  last_error TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_settings TO authenticated;
GRANT ALL ON public.telegram_settings TO service_role;

ALTER TABLE public.telegram_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own telegram settings" ON public.telegram_settings;
CREATE POLICY "Users manage own telegram settings" ON public.telegram_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);