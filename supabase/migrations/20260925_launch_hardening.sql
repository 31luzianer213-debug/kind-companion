-- =====================================================================
-- Robustez para venda de assinaturas (pré-lançamento)
--
-- 1) O trigger de cadastro dependia do plano fixo 'ilimitado'. Se o
--    administrador excluísse esse plano, TODO cadastro novo falhava
--    (violação de chave estrangeira em saas_subscriptions.plan_id).
--    Agora escolhe um plano ativo válido e nunca derruba o signup.
-- 2) O limite de clientes bloqueava quem não tinha linha em
--    saas_subscriptions, mesmo a conta sendo nova e legítima.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan TEXT;
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;

  -- Plano de referência: o 'ilimitado' se existir; senão o primeiro à venda.
  SELECT id INTO v_plan FROM public.saas_plans WHERE id = 'ilimitado' LIMIT 1;
  IF v_plan IS NULL THEN
    SELECT id INTO v_plan FROM public.saas_plans WHERE active = true ORDER BY sort_order LIMIT 1;
  END IF;
  IF v_plan IS NULL THEN
    SELECT id INTO v_plan FROM public.saas_plans ORDER BY sort_order LIMIT 1;
  END IF;

  BEGIN
    IF v_plan IS NOT NULL THEN
      INSERT INTO public.saas_subscriptions (user_id, plan_id, status, trial_ends_at)
      VALUES (NEW.id, v_plan, 'trialing', now() + interval '7 days')
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Nunca impedir o cadastro por causa da assinatura: o registro é criado
    -- na primeira abertura da tela de Assinatura.
    NULL;
  END;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Limite de clientes: só bloqueia quando existe assinatura registrada e ela
-- está de fato vencida. Conta sem linha de assinatura não é tratada como
-- inadimplente (era isso que impedia o primeiro cadastro de clientes).
CREATE OR REPLACE FUNCTION public.enforce_client_limit() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_has_sub BOOLEAN;
  v_state TEXT;
  v_max INTEGER;
  v_count INTEGER;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.saas_subscriptions s WHERE s.user_id = NEW.user_id)
    INTO v_has_sub;

  IF v_has_sub THEN
    v_state := public.subscription_state(NEW.user_id);
    IF v_state = 'blocked' THEN
      RAISE EXCEPTION 'ASSINATURA_INATIVA: sua assinatura do Sigma Control está vencida. Renove em Assinatura para continuar cadastrando clientes.'
        USING ERRCODE = 'check_violation';
    END IF;
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
CREATE TRIGGER clients_enforce_plan_limit BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.enforce_client_limit();

-- Índice que acelera a reconciliação dos Pix pendentes por conta/status.
CREATE INDEX IF NOT EXISTS saas_payments_status_created_idx
  ON public.saas_payments (status, created_at DESC);
