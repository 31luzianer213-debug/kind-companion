-- Atomic SaaS payment settlement.
-- The row lock on the payment and an advisory lock per account prevent two
-- duplicate provider notifications from extending the same subscription twice.
-- Atomically reuse or create one pending SaaS Pix per reseller/plan/period/provider.
CREATE OR REPLACE FUNCTION public.get_or_create_saas_pending_payment(
  p_user_id UUID,
  p_plan_id TEXT,
  p_months INTEGER,
  p_provider TEXT,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.saas_payments%ROWTYPE;
  v_months INTEGER := GREATEST(1, LEAST(12, COALESCE(p_months, 1)));
BEGIN
  IF p_user_id IS NULL OR COALESCE(trim(p_plan_id), '') = '' THEN
    RAISE EXCEPTION 'Conta e plano são obrigatórios.';
  END IF;
  IF p_provider NOT IN ('mercadopago', 'misticpay') THEN
    RAISE EXCEPTION 'Provedor de pagamento inválido.';
  END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Valor do pagamento inválido.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::TEXT));

  SELECT *
    INTO v_payment
    FROM public.saas_payments
   WHERE user_id = p_user_id
     AND plan_id = p_plan_id
     AND months = v_months
     AND provider = p_provider
     AND amount = p_amount
     AND status = 'pending'
     AND created_at >= now() - interval '30 minutes'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    RETURN to_jsonb(v_payment);
  END IF;

  INSERT INTO public.saas_payments (user_id, plan_id, amount, months, status, provider)
  VALUES (p_user_id, p_plan_id, p_amount, v_months, 'pending', p_provider)
  RETURNING * INTO v_payment;

  RETURN to_jsonb(v_payment);
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_saas_pending_payment(UUID, TEXT, INTEGER, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_saas_pending_payment(UUID, TEXT, INTEGER, TEXT, NUMERIC) TO service_role;

CREATE OR REPLACE FUNCTION public.activate_saas_payment_from_payment(p_payment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.saas_payments%ROWTYPE;
  v_subscription public.saas_subscriptions%ROWTYPE;
  v_plan_id TEXT;
  v_base TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_months INTEGER;
BEGIN
  SELECT *
    INTO v_payment
    FROM public.saas_payments
   WHERE id = p_payment_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pagamento não encontrado.');
  END IF;

  IF v_payment.status = 'approved' THEN
    SELECT current_period_end
      INTO v_period_end
      FROM public.saas_subscriptions
     WHERE user_id = v_payment.user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'alreadyApproved', true,
      'periodEnd', v_period_end
    );
  END IF;

  IF v_payment.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Pagamento não está pendente.');
  END IF;

  -- Serializa pagamentos diferentes do mesmo revendedor, inclusive quando a
  -- conta ainda não possui uma linha em saas_subscriptions para bloquear.
  PERFORM pg_advisory_xact_lock(hashtext(v_payment.user_id::TEXT));

  SELECT *
    INTO v_subscription
    FROM public.saas_subscriptions
   WHERE user_id = v_payment.user_id
   FOR UPDATE;

  SELECT id
    INTO v_plan_id
    FROM public.saas_plans
   WHERE id = v_payment.plan_id;

  IF v_plan_id IS NULL AND v_subscription.plan_id IS NOT NULL THEN
    SELECT id
      INTO v_plan_id
      FROM public.saas_plans
     WHERE id = v_subscription.plan_id;
  END IF;

  IF v_plan_id IS NULL THEN
    SELECT id
      INTO v_plan_id
      FROM public.saas_plans
     WHERE active = true
     ORDER BY sort_order
     LIMIT 1;
  END IF;

  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nenhum plano ativo para vincular ao pagamento.');
  END IF;

  v_months := GREATEST(1, LEAST(12, COALESCE(v_payment.months, 1)));

  IF v_subscription.status = 'active'
     AND v_subscription.current_period_end > now()
     AND v_subscription.plan_id = v_plan_id THEN
    v_base := v_subscription.current_period_end;
  ELSE
    v_base := now();
  END IF;

  v_period_end := v_base + (v_months * INTERVAL '30 days');

  INSERT INTO public.saas_subscriptions (
    user_id, plan_id, status, current_period_end, updated_at
  )
  VALUES (
    v_payment.user_id, v_plan_id, 'active', v_period_end, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_end = EXCLUDED.current_period_end,
    updated_at = now();

  UPDATE public.saas_payments
     SET status = 'approved',
         approved_at = now(),
         updated_at = now()
   WHERE id = v_payment.id
     AND status = 'pending';

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyApproved', false,
    'periodEnd', v_period_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_saas_payment_from_payment(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_saas_payment_from_payment(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_saas_payment_from_payment(UUID) TO service_role;
