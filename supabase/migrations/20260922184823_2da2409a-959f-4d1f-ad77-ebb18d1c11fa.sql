CREATE OR REPLACE FUNCTION public.enforce_client_plan_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  SELECT p.max_clients INTO v_limit
  FROM public.saas_subscriptions s
  JOIN public.saas_plans p ON p.id = s.plan_id
  WHERE s.user_id = NEW.user_id
    AND s.status IN ('active', 'trialing')
  LIMIT 1;

  IF v_limit IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_count FROM public.clients WHERE user_id = NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'Limite de % clientes do seu plano foi atingido. Faça upgrade para cadastrar mais.', v_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_client_plan_limit ON public.clients;
CREATE TRIGGER trg_enforce_client_plan_limit
BEFORE INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.enforce_client_plan_limit();