-- Assinatura do sistema (SaaS): planos, assinaturas dos revendedores e pagamentos Pix
CREATE TABLE IF NOT EXISTS public.saas_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price_monthly NUMERIC(10,2) NOT NULL,
  max_clients INTEGER, -- NULL = ilimitado
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  highlighted BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.saas_plans TO anon, authenticated;
GRANT ALL ON public.saas_plans TO service_role;
ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "planos publicos" ON public.saas_plans;
CREATE POLICY "planos publicos" ON public.saas_plans FOR SELECT TO anon, authenticated USING (active = true);

INSERT INTO public.saas_plans (id, name, description, price_monthly, max_clients, features, highlighted, sort_order) VALUES
  ('basico', 'Básico', 'Para quem está começando a organizar a revenda.', 29.90, 100,
   '["Até 100 clientes","Cobranças e lembretes no WhatsApp","Painel Sigma integrado","Pedidos com Pix automático","Suporte por e-mail"]'::jsonb, false, 1),
  ('profissional', 'Profissional', 'Para revendas em crescimento que precisam de automação total.', 59.90, 500,
   '["Até 500 clientes","Robô de atendimento 24h no WhatsApp","Cobrança automática diária","Relatórios e indicadores","Múltiplos painéis Sigma","Suporte prioritário"]'::jsonb, true, 2),
  ('ilimitado', 'Ilimitado', 'Para operações grandes, sem limite de clientes.', 99.90, NULL,
   '["Clientes ilimitados","Tudo do Profissional","Importação em massa (CSV)","Prioridade em novos recursos","Suporte via WhatsApp"]'::jsonb, false, 3)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description, price_monthly = EXCLUDED.price_monthly,
  max_clients = EXCLUDED.max_clients, features = EXCLUDED.features, highlighted = EXCLUDED.highlighted,
  sort_order = EXCLUDED.sort_order, updated_at = now();

CREATE TABLE IF NOT EXISTS public.saas_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.saas_plans(id),
  status TEXT NOT NULL DEFAULT 'trialing', -- trialing | active | canceled
  trial_ends_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.saas_subscriptions TO authenticated;
GRANT ALL ON public.saas_subscriptions TO service_role;
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "assinatura propria" ON public.saas_subscriptions;
CREATE POLICY "assinatura propria" ON public.saas_subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP TRIGGER IF EXISTS saas_subscriptions_updated ON public.saas_subscriptions;
CREATE TRIGGER saas_subscriptions_updated BEFORE UPDATE ON public.saas_subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.saas_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.saas_plans(id),
  amount NUMERIC(10,2) NOT NULL,
  months INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | cancelled | expired
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  provider_payment_id TEXT,
  pix_code TEXT,
  pix_qr_base64 TEXT,
  ticket_url TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.saas_payments TO authenticated;
GRANT ALL ON public.saas_payments TO service_role;
ALTER TABLE public.saas_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pagamentos proprios" ON public.saas_payments;
CREATE POLICY "pagamentos proprios" ON public.saas_payments FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS saas_payments_user_idx ON public.saas_payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS saas_payments_provider_idx ON public.saas_payments (provider_payment_id);
DROP TRIGGER IF EXISTS saas_payments_updated ON public.saas_payments;
CREATE TRIGGER saas_payments_updated BEFORE UPDATE ON public.saas_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Toda conta nova ganha 7 dias de teste no plano Ilimitado.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.saas_subscriptions (user_id, plan_id, status, trial_ends_at)
  VALUES (NEW.id, 'ilimitado', 'trialing', now() + interval '7 days')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- Contas já existentes recebem 14 dias de teste para migrar sem interrupção.
INSERT INTO public.saas_subscriptions (user_id, plan_id, status, trial_ends_at)
SELECT u.id, 'ilimitado', 'trialing', now() + interval '14 days'
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- Situação da assinatura: active | trialing | grace (3 dias de tolerância, somente leitura) | blocked
CREATE OR REPLACE FUNCTION public.subscription_state(p_user UUID) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT CASE
      WHEN s.status = 'active' AND s.current_period_end > now() THEN 'active'
      WHEN s.status = 'trialing' AND s.trial_ends_at > now() THEN 'trialing'
      WHEN COALESCE(s.current_period_end, s.trial_ends_at) > now() - interval '3 days' THEN 'grace'
      ELSE 'blocked'
    END
    FROM public.saas_subscriptions s WHERE s.user_id = p_user
  ), 'blocked');
$$;
GRANT EXECUTE ON FUNCTION public.subscription_state(UUID) TO authenticated, service_role;

-- Limite de clientes por plano e bloqueio de cadastro com assinatura vencida.
CREATE OR REPLACE FUNCTION public.enforce_client_limit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_state TEXT;
  v_max INTEGER;
  v_count INTEGER;
BEGIN
  v_state := public.subscription_state(NEW.user_id);
  IF v_state = 'blocked' THEN
    RAISE EXCEPTION 'ASSINATURA_INATIVA: sua assinatura do Sigma Control está vencida. Renove em Assinatura para continuar cadastrando clientes.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.max_clients INTO v_max
  FROM public.saas_subscriptions s JOIN public.saas_plans p ON p.id = s.plan_id
  WHERE s.user_id = NEW.user_id;

  IF v_max IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.clients WHERE user_id = NEW.user_id;
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'LIMITE_PLANO: seu plano permite até % clientes. Faça upgrade em Assinatura para cadastrar mais.', v_max
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS clients_enforce_plan_limit ON public.clients;
CREATE TRIGGER clients_enforce_plan_limit BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.enforce_client_limit();
