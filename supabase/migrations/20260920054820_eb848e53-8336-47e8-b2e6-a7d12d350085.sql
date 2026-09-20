do $$
declare t text;
begin
  foreach t in array array['bot_settings','clients','invoices','iptv_lists','message_logs','orders','profiles','sigma_panels','whatsapp_settings','saas_subscriptions','saas_payments']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon', t);
      execute format('grant select, insert, update, delete on public.%I to authenticated', t);
      execute format('grant all on public.%I to service_role', t);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.saas_plans') is not null then
    execute 'grant select on public.saas_plans to anon';
    execute 'grant select on public.saas_plans to authenticated';
    execute 'grant all on public.saas_plans to service_role';
  end if;
end $$;

create index if not exists idx_invoices_client_id on public.invoices (client_id);
create index if not exists idx_invoices_user_status on public.invoices (user_id, status);
create index if not exists idx_message_logs_client_id on public.message_logs (client_id);
create index if not exists idx_message_logs_invoice_id on public.message_logs (invoice_id);
create index if not exists idx_iptv_lists_user_id on public.iptv_lists (user_id);
create index if not exists idx_orders_user_id on public.orders (user_id);