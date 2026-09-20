-- Correções de consistência e segurança
-- 1) A tabela orders passou por duas migrações conflitantes (id UUID x id TEXT).
--    O código usa ids no formato "ord_..." e user_id como texto, então garantimos esse formato.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.orders ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE public.orders ALTER COLUMN id TYPE TEXT USING id::text;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'user_id' AND data_type = 'uuid'
  ) THEN
    ALTER TABLE public.orders ALTER COLUMN user_id TYPE TEXT USING user_id::text;
  END IF;
END $$;

DROP POLICY IF EXISTS "own orders" ON public.orders;
DROP POLICY IF EXISTS "Revendedor gerencia seus pedidos" ON public.orders;
CREATE POLICY "Revendedor gerencia seus pedidos"
ON public.orders FOR ALL TO authenticated
USING (user_id = auth.uid()::text)
WITH CHECK (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS orders_user_created_idx ON public.orders (user_id, created_at DESC);

-- 2) Remove o agendamento antigo que apontava para um domínio fixo com segredo exposto.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('whatsapp-poll-minuto')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp-poll-minuto');
  END IF;
END $$;

-- 3) Token opcional de autenticação do webhook do Asaas (header asaas-access-token).
ALTER TABLE public.whatsapp_settings ADD COLUMN IF NOT EXISTS asaas_webhook_token TEXT;

-- 4) Mensagens processadas do WhatsApp: apenas o servidor (service_role) acessa.
DROP POLICY IF EXISTS "service role only" ON public.whatsapp_processed_messages;
