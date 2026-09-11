CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT NOT NULL PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_number INTEGER NOT NULL DEFAULT 1001,
  customer_name TEXT NOT NULL DEFAULT 'Cliente',
  customer_phone TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  duration_months INTEGER NOT NULL DEFAULT 1,
  screens INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  type TEXT NOT NULL DEFAULT 'new_access',
  target_username TEXT,
  payment_method TEXT NOT NULL DEFAULT 'pix',
  gateway_payment_id TEXT,
  pix_code TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revendedor gerencia seus pedidos"
ON public.orders FOR ALL TO authenticated
USING (user_id = auth.uid()::text)
WITH CHECK (user_id = auth.uid()::text);

CREATE INDEX IF NOT EXISTS orders_user_created_idx ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_phone_idx ON public.orders (customer_phone);

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();