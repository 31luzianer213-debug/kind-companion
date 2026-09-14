CREATE TABLE IF NOT EXISTS public.sigma_panels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Servidor Sigma',
  url TEXT NOT NULL DEFAULT '',
  streaming_dns TEXT DEFAULT '',
  username TEXT DEFAULT '',
  password TEXT DEFAULT '',
  token TEXT,
  enabled BOOLEAN DEFAULT true,
  auto_renew BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sigma_panels TO authenticated;
GRANT ALL ON public.sigma_panels TO service_role;

ALTER TABLE public.sigma_panels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own sigma panels" ON public.sigma_panels;
CREATE POLICY "Users can manage their own sigma panels"
  ON public.sigma_panels FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sigma_panels_user_id ON public.sigma_panels(user_id);

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS panel_id UUID REFERENCES public.sigma_panels(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_clients_panel_id ON public.clients(panel_id);