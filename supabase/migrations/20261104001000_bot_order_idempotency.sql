-- Atomic idempotency for WhatsApp bot order creation.
-- A per-account advisory transaction lock serializes concurrent incoming
-- messages so the same phone/plan/amount reuses the pending order.
CREATE OR REPLACE FUNCTION public.get_or_create_bot_pending_order(
  p_user_id TEXT,
  p_order_id TEXT,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_plan_name TEXT,
  p_amount NUMERIC,
  p_duration_months INTEGER,
  p_screens INTEGER,
  p_type TEXT,
  p_target_username TEXT,
  p_window_minutes INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_next_number BIGINT;
  v_phone TEXT;
  v_window INTEGER;
BEGIN
  IF COALESCE(trim(p_user_id), '') = '' OR COALESCE(trim(p_order_id), '') = '' THEN
    RAISE EXCEPTION 'Identificador da conta e do pedido são obrigatórios.';
  END IF;
  IF p_type NOT IN ('new_access', 'renewal') THEN
    RAISE EXCEPTION 'Tipo de pedido inválido.';
  END IF;
  IF COALESCE(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'Valor do pedido inválido.';
  END IF;

  v_phone := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
  IF length(v_phone) < 10 OR length(v_phone) > 15 THEN
    RAISE EXCEPTION 'Telefone inválido.';
  END IF;
  v_window := GREATEST(1, LEAST(120, COALESCE(p_window_minutes, 30)));

  -- A conta é o escopo do lock, impedindo order_number duplicado no mesmo tenant.
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id));

  SELECT *
    INTO v_order
    FROM public.orders
   WHERE user_id = p_user_id
     AND regexp_replace(COALESCE(customer_phone, ''), '[^0-9]', '', 'g') = v_phone
     AND plan_name = p_plan_name
     AND abs(amount - p_amount) < 0.01
     AND duration_months = GREATEST(1, LEAST(12, COALESCE(p_duration_months, 1)))
     AND type = p_type
     AND COALESCE(target_username, '') = COALESCE(p_target_username, '')
     AND status = 'pending'
     AND created_at >= now() - make_interval(mins => v_window)
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    RETURN to_jsonb(v_order);
  END IF;

  SELECT GREATEST(1001, COALESCE(MAX(order_number), 1000) + 1)
    INTO v_next_number
    FROM public.orders
   WHERE user_id = p_user_id;

  INSERT INTO public.orders (
    id, user_id, order_number, customer_name, customer_phone, plan_name,
    amount, duration_months, screens, status, type, target_username,
    payment_method, created_at, updated_at
  )
  VALUES (
    p_order_id, p_user_id, v_next_number, COALESCE(NULLIF(trim(p_customer_name), ''), 'Cliente'),
    v_phone, p_plan_name, p_amount,
    GREATEST(1, LEAST(12, COALESCE(p_duration_months, 1))),
    GREATEST(1, COALESCE(p_screens, 1)), 'pending', p_type, p_target_username,
    'pix', now(), now()
  )
  RETURNING * INTO v_order;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_bot_pending_order(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_or_create_bot_pending_order(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, TEXT, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_bot_pending_order(TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TEXT, TEXT, INTEGER) TO service_role;
