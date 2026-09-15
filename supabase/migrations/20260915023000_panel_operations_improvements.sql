-- Operational observability, activity audit and billing automation foundations.

alter table if exists public.sigma_panels
  add column if not exists last_sync_started_at timestamptz,
  add column if not exists last_sync_success_at timestamptz,
  add column if not exists last_sync_status text,
  add column if not exists last_sync_error text,
  add column if not exists last_sync_imported integer not null default 0,
  add column if not exists last_sync_updated integer not null default 0,
  add column if not exists last_sync_skipped integer not null default 0,
  add column if not exists last_sync_errors integer not null default 0;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id text,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_user_created_idx
  on public.activity_logs(user_id, created_at desc);

alter table public.activity_logs enable row level security;

drop policy if exists "Users can read own activity logs" on public.activity_logs;
create policy "Users can read own activity logs"
  on public.activity_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own activity logs" on public.activity_logs;
create policy "Users can insert own activity logs"
  on public.activity_logs for insert
  with check (auth.uid() = user_id);

create table if not exists public.billing_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  offset_days integer not null,
  enabled boolean not null default true,
  message_template text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, offset_days)
);

alter table public.billing_rules enable row level security;

drop policy if exists "Users can manage own billing rules" on public.billing_rules;
create policy "Users can manage own billing rules"
  on public.billing_rules for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.billing_rule_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_id uuid not null references public.billing_rules(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  due_date date not null,
  sent_at timestamptz not null default now(),
  status text not null default 'sent',
  error text,
  unique(user_id, rule_id, client_id, due_date)
);

create index if not exists billing_rule_sends_user_due_idx
  on public.billing_rule_sends(user_id, due_date desc);

alter table public.billing_rule_sends enable row level security;

drop policy if exists "Users can manage own billing sends" on public.billing_rule_sends;
create policy "Users can manage own billing sends"
  on public.billing_rule_sends for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
