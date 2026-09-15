alter table public.whatsapp_settings
  add column if not exists test_server_id uuid null references public.sigma_panels(id) on delete set null;

create index if not exists whatsapp_settings_test_server_id_idx
  on public.whatsapp_settings(test_server_id);
