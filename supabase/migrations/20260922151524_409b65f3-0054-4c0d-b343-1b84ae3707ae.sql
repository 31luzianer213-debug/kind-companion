
CREATE TABLE IF NOT EXISTS public.billing_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offset_days integer not null,
  enabled boolean not null default true,
  message_template text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, offset_days)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_rules TO authenticated;
GRANT ALL ON public.billing_rules TO service_role;
ALTER TABLE public.billing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own billing rules" ON public.billing_rules;
CREATE POLICY "own billing rules" ON public.billing_rules FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS billing_rules_updated ON public.billing_rules;
CREATE TRIGGER billing_rules_updated BEFORE UPDATE ON public.billing_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.billing_rule_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid not null references public.billing_rules(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  due_date date not null,
  status text not null default 'processing',
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rule_id, client_id, due_date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_rule_sends TO authenticated;
GRANT ALL ON public.billing_rule_sends TO service_role;
ALTER TABLE public.billing_rule_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own billing rule sends" ON public.billing_rule_sends;
CREATE POLICY "own billing rule sends" ON public.billing_rule_sends FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_billing_rule_sends_user ON public.billing_rule_sends(user_id, due_date);

CREATE TABLE IF NOT EXISTS public.sale_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  screens integer not null default 1,
  months integer not null default 1,
  price numeric(10,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_plans TO authenticated;
GRANT ALL ON public.sale_plans TO service_role;
ALTER TABLE public.sale_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own sale plans" ON public.sale_plans;
CREATE POLICY "own sale plans" ON public.sale_plans FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP TRIGGER IF EXISTS sale_plans_updated ON public.sale_plans;
CREATE TRIGGER sale_plans_updated BEFORE UPDATE ON public.sale_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS idx_sale_plans_user ON public.sale_plans(user_id);

CREATE TABLE IF NOT EXISTS public.client_trials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  phone text not null,
  username text,
  password text,
  expires_at timestamptz not null,
  notified_at timestamptz,
  converted boolean not null default false,
  created_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_trials TO authenticated;
GRANT ALL ON public.client_trials TO service_role;
ALTER TABLE public.client_trials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own client trials" ON public.client_trials;
CREATE POLICY "own client trials" ON public.client_trials FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_client_trials_user ON public.client_trials(user_id, expires_at);

ALTER TABLE public.whatsapp_settings ADD COLUMN IF NOT EXISTS trial_reminder_enabled boolean not null default true;
