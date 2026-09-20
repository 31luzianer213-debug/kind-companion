-- Plano único de R$20 + Access Token do Mercado Pago (assinatura do sistema)

-- 1) Deixa apenas UM plano ativo: "Plano Mensal" por R$ 20,00 (clientes ilimitados).
--    Reaproveita o id 'ilimitado' (já usado como padrão do trial e nas FKs) e
--    desativa os demais para não aparecerem na landing nem na tela de Assinatura.
UPDATE public.saas_plans
SET active = false, highlighted = false, updated_at = now()
WHERE id IN ('basico', 'profissional');

UPDATE public.saas_plans SET
  name = 'Plano Mensal',
  description = 'Acesso completo ao Sigma Control.',
  price_monthly = 20.00,
  max_clients = NULL,
  features = '["Clientes ilimitados","Cobranças e lembretes no WhatsApp","Painel Sigma integrado","Pedidos com Pix automático","Robô de atendimento 24h no WhatsApp","Suporte via WhatsApp"]'::jsonb,
  highlighted = true,
  sort_order = 1,
  active = true,
  updated_at = now()
WHERE id = 'ilimitado';

-- Garante que o plano exista mesmo em bancos sem o seed anterior.
INSERT INTO public.saas_plans (id, name, description, price_monthly, max_clients, features, highlighted, sort_order, active)
VALUES ('ilimitado', 'Plano Mensal', 'Acesso completo ao Sigma Control.', 20.00, NULL,
  '["Clientes ilimitados","Cobranças e lembretes no WhatsApp","Painel Sigma integrado","Pedidos com Pix automático","Robô de atendimento 24h no WhatsApp","Suporte via WhatsApp"]'::jsonb,
  true, 1, true)
ON CONFLICT (id) DO NOTHING;

-- 2) Configurações globais do sistema (somente o dono/admin acessa via server functions).
--    Guarda o Access Token do Mercado Pago para gerar/receber os Pix das assinaturas.
CREATE TABLE IF NOT EXISTS public.system_settings (
  id TEXT PRIMARY KEY DEFAULT 'global',
  saas_provider TEXT NOT NULL DEFAULT 'mercadopago',
  mercadopago_token TEXT,
  admin_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT system_settings_singleton CHECK (id = 'global')
);

-- RLS ligado sem políticas para anon/authenticated: só o service_role (backend) lê/grava,
-- de modo que o token nunca é exposto ao navegador.
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.system_settings FROM anon, authenticated;
GRANT ALL ON public.system_settings TO service_role;

INSERT INTO public.system_settings (id, saas_provider, admin_email)
VALUES ('global', 'mercadopago', 'frfrfrfrfr@gmail.com')
ON CONFLICT (id) DO UPDATE
  SET admin_email = COALESCE(public.system_settings.admin_email, EXCLUDED.admin_email),
      updated_at = now();

DROP TRIGGER IF EXISTS system_settings_updated ON public.system_settings;
CREATE TRIGGER system_settings_updated BEFORE UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
