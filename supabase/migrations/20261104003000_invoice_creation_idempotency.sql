-- Idempotent invoice creation for concurrent daily billing runs.
-- Keeps existing rows intact; it only serializes future create-or-reuse operations.
CREATE OR REPLACE FUNCTION public.create_invoice_if_absent(
  p_user_id UUID,
  p_client_id UUID,
  p_due_date DATE,
  p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client public.clients%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_client_id IS NULL OR p_due_date IS NULL OR COALESCE(p_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Dados da fatura inválidos.';
  END IF;

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Não autorizado a criar fatura para esta conta.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_client_id::TEXT), hashtext(p_due_date::TEXT));

  SELECT *
    INTO v_client
    FROM public.clients
   WHERE id = p_client_id
     AND user_id = p_user_id
     AND status = 'active'
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'created', false, 'error', 'Cliente não encontrado ou inativo.');
  END IF;

  SELECT *
    INTO v_invoice
    FROM public.invoices
   WHERE user_id = p_user_id
     AND client_id = p_client_id
     AND due_date = p_due_date
     AND status IN ('pending', 'overdue', 'paid')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'created', false, 'invoice', to_jsonb(v_invoice));
  END IF;

  INSERT INTO public.invoices (
    user_id, client_id, amount, due_date, status
  )
  VALUES (
    p_user_id, p_client_id, p_amount, p_due_date, 'pending'
  )
  RETURNING * INTO v_invoice;

  RETURN jsonb_build_object('ok', true, 'created', true, 'invoice', to_jsonb(v_invoice));
END;
$$;

REVOKE ALL ON FUNCTION public.create_invoice_if_absent(UUID, UUID, DATE, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice_if_absent(UUID, UUID, DATE, NUMERIC) TO authenticated, service_role;
