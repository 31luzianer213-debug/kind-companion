-- Best-effort database audit for core multi-tenant actions.

create or replace function public.audit_core_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  event_name text;
  event_title text;
  event_description text;
  entity_kind text := TG_TABLE_NAME;
  entity_key text;
begin
  uid := coalesce(NEW.user_id, OLD.user_id);
  if uid is null then
    return coalesce(NEW, OLD);
  end if;

  entity_key := coalesce(NEW.id::text, OLD.id::text);

  if TG_TABLE_NAME = 'clients' then
    if TG_OP = 'INSERT' then
      event_name := 'client.created';
      event_title := 'Cliente criado';
      event_description := coalesce(NEW.name, 'Cliente') || ' foi adicionado ao painel.';
    elsif TG_OP = 'DELETE' then
      event_name := 'client.deleted';
      event_title := 'Cliente removido';
      event_description := coalesce(OLD.name, 'Cliente') || ' foi removido do painel.';
    elsif OLD.status is distinct from NEW.status then
      event_name := case when NEW.status = 'blocked' then 'client.blocked' else 'client.status_changed' end;
      event_title := case when NEW.status = 'blocked' then 'Cliente bloqueado' else 'Status do cliente alterado' end;
      event_description := coalesce(NEW.name, 'Cliente') || ': ' || coalesce(OLD.status, '—') || ' → ' || coalesce(NEW.status, '—') || '.';
    elsif OLD.next_due_date is distinct from NEW.next_due_date then
      event_name := 'client.renewed';
      event_title := 'Vencimento do cliente atualizado';
      event_description := coalesce(NEW.name, 'Cliente') || ' agora vence em ' || coalesce(NEW.next_due_date::text, 'data não informada') || '.';
    else
      event_name := 'client.updated';
      event_title := 'Cliente atualizado';
      event_description := coalesce(NEW.name, 'Cliente') || ' teve seus dados atualizados.';
    end if;
  elsif TG_TABLE_NAME = 'sigma_panels' then
    if TG_OP = 'INSERT' then
      event_name := 'sigma.server_added';
      event_title := 'Servidor Sigma adicionado';
      event_description := coalesce(NEW.name, 'Servidor Sigma') || ' foi configurado.';
    elsif TG_OP = 'DELETE' then
      event_name := 'sigma.server_removed';
      event_title := 'Servidor Sigma removido';
      event_description := coalesce(OLD.name, 'Servidor Sigma') || ' foi removido.';
    elsif OLD.last_sync_at is distinct from NEW.last_sync_at then
      event_name := 'sigma.synced';
      event_title := 'Servidor Sigma sincronizado';
      event_description := coalesce(NEW.name, 'Servidor Sigma') || ' concluiu uma sincronização.';
    else
      return NEW;
    end if;
  elsif TG_TABLE_NAME = 'message_logs' then
    if TG_OP <> 'INSERT' then return NEW; end if;
    event_name := case when NEW.status = 'sent' then 'whatsapp.message_sent' else 'whatsapp.message_failed' end;
    event_title := case when NEW.status = 'sent' then 'Mensagem enviada' else 'Falha no envio de mensagem' end;
    event_description := case when NEW.status = 'sent'
      then 'Uma mensagem de WhatsApp foi enviada para ' || coalesce(NEW.phone, 'um cliente') || '.'
      else 'Não foi possível enviar uma mensagem para ' || coalesce(NEW.phone, 'um cliente') || '.'
    end;
  else
    return coalesce(NEW, OLD);
  end if;

  insert into public.activity_logs(user_id, event_type, entity_type, entity_id, title, description, metadata)
  values (
    uid,
    event_name,
    entity_kind,
    entity_key,
    event_title,
    event_description,
    jsonb_build_object('operation', TG_OP)
  );

  return coalesce(NEW, OLD);
exception when others then
  -- Auditing must never block the business operation.
  raise warning 'activity audit failed for %.%: %', TG_TABLE_NAME, TG_OP, sqlerrm;
  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists clients_activity_audit on public.clients;
create trigger clients_activity_audit
after insert or update or delete on public.clients
for each row execute function public.audit_core_activity();

drop trigger if exists sigma_panels_activity_audit on public.sigma_panels;
create trigger sigma_panels_activity_audit
after insert or update or delete on public.sigma_panels
for each row execute function public.audit_core_activity();

drop trigger if exists message_logs_activity_audit on public.message_logs;
create trigger message_logs_activity_audit
after insert on public.message_logs
for each row execute function public.audit_core_activity();
