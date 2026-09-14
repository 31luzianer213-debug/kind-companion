-- Multi-panel Sigma support
-- Cria tabela sigma_panels para armazenar múltiplas configurações de painel por usuário
CREATE TABLE IF NOT EXISTS sigma_panels (
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

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sigma_panels_user_id ON sigma_panels(user_id);

-- RLS policies
ALTER TABLE sigma_panels ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can manage their own sigma panels" ON sigma_panels;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Users can manage their own sigma panels"
  ON sigma_panels
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Adiciona coluna panel_id na tabela clients para rastrear de qual painel o cliente veio
DO $$ BEGIN
  ALTER TABLE clients ADD COLUMN panel_id UUID REFERENCES sigma_panels(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_clients_panel_id ON clients(panel_id);

-- Migra dados existentes do whatsapp_settings.sigma_url para sigma_panels (se existir configuração)
-- Isso roda apenas 1 vez e é idempotente via WHERE
DO $$
DECLARE
  existing_config RECORD;
BEGIN
  FOR existing_config IN
    SELECT user_id, sigma_url, sigma_server_name, sigma_streaming_dns,
           sigma_username, sigma_password, sigma_token, sigma_enabled, sigma_auto_renew
    FROM whatsapp_settings
    WHERE sigma_url IS NOT NULL AND sigma_url != ''
      AND NOT EXISTS (
        SELECT 1 FROM sigma_panels sp WHERE sp.user_id = whatsapp_settings.user_id
      )
  LOOP
    INSERT INTO sigma_panels (user_id, name, url, streaming_dns, username, password, token, enabled, auto_renew)
    VALUES (
      existing_config.user_id,
      COALESCE(existing_config.sigma_server_name, 'Servidor Sigma'),
      existing_config.sigma_url,
      COALESCE(existing_config.sigma_streaming_dns, ''),
      COALESCE(existing_config.sigma_username, ''),
      COALESCE(existing_config.sigma_password, ''),
      existing_config.sigma_token,
      COALESCE(existing_config.sigma_enabled, true),
      COALESCE(existing_config.sigma_auto_renew, true)
    );
  END LOOP;
END $$;
