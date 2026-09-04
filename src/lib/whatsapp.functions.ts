import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type SendInput = {
  phone: string;
  body: string;
  clientId?: string | null;
  invoiceId?: string | null;
};

function digits(phone: string) {
  return phone.replace(/\D/g, "");
}

function normalizeNumber(phone: string) {
  const d = digits(phone);
  if (d.length <= 11) return `55${d}`;
  return d;
}

async function sendViaEvolution(
  settings: { api_url: string | null; api_key: string | null; instance_name: string | null },
  phone: string,
  text: string,
) {
  const base = (settings.api_url ?? "").replace(/\/+$/, "");
  if (!base || !settings.api_key || !settings.instance_name) {
    throw new Error("Configure o endereço, a chave e a instância do WhatsApp antes de enviar.");
  }
  const res = await fetch(`${base}/message/sendText/${settings.instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: settings.api_key },
    body: JSON.stringify({ number: normalizeNumber(phone), text, textMessage: { text } }),
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Falha no envio (${res.status}): ${raw.slice(0, 300)}`);
  }
  return raw.slice(0, 500);
}

export const sendWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SendInput) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("api_url, api_key, instance_name")
      .eq("user_id", userId)
      .maybeSingle();

    if (!settings) {
      throw new Error("Configure o WhatsApp antes de enviar mensagens.");
    }

    try {
      await sendViaEvolution(settings, data.phone, data.body);
      await supabase.from("message_logs").insert({
        user_id: userId,
        client_id: data.clientId ?? null,
        invoice_id: data.invoiceId ?? null,
        phone: data.phone,
        body: data.body,
        status: "sent",
      });
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro desconhecido";
      await supabase.from("message_logs").insert({
        user_id: userId,
        client_id: data.clientId ?? null,
        invoice_id: data.invoiceId ?? null,
        phone: data.phone,
        body: data.body,
        status: "failed",
        error: message,
      });
      return { ok: false as const, error: message };
    }
  });

export const testWhatsAppConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: settings } = await supabase
      .from("whatsapp_settings")
      .select("api_url, api_key, instance_name")
      .eq("user_id", userId)
      .maybeSingle();

    const base = (settings?.api_url ?? "").replace(/\/+$/, "");
    if (!base || !settings?.api_key || !settings?.instance_name) {
      return { ok: false as const, error: "Preencha endereço, chave e instância." };
    }
    try {
      const res = await fetch(`${base}/instance/connectionState/${settings.instance_name}`, {
        headers: { apikey: settings.api_key },
      });
      const raw = await res.text();
      if (!res.ok) return { ok: false as const, error: `Erro ${res.status}: ${raw.slice(0, 200)}` };
      return { ok: true as const, state: raw.slice(0, 200) };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "Não foi possível conectar.",
      };
    }
  });

function addMonths(date: Date, months: number) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Gera as cobranças do mês para clientes ativos e envia os lembretes pendentes. */
export const runAutoBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date();
    const todayIso = iso(today);

    const [{ data: settings }, { data: clients }] = await Promise.all([
      supabase.from("whatsapp_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("clients").select("*").eq("user_id", userId).eq("status", "active"),
    ]);

    let created = 0;
    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    // 1. Criar cobranças que ainda não existem
    for (const client of clients ?? []) {
      const dueDate =
        client.next_due_date ??
        iso(new Date(today.getFullYear(), today.getMonth(), Math.min(client.due_day || 10, 28)));

      const { data: existing } = await supabase
        .from("invoices")
        .select("id")
        .eq("client_id", client.id)
        .eq("due_date", dueDate)
        .maybeSingle();

      if (!existing) {
        const { error } = await supabase.from("invoices").insert({
          user_id: userId,
          client_id: client.id,
          amount: client.monthly_fee,
          due_date: dueDate,
          status: "pending",
        });
        if (!error) created += 1;
      }
    }

    // 2. Marcar vencidas
    await supabase
      .from("invoices")
      .update({ status: "overdue" })
      .eq("user_id", userId)
      .eq("status", "pending")
      .lt("due_date", todayIso);

    // 3. Enviar lembretes
    const { data: invoices } = await supabase
      .from("invoices")
      .select("*, clients(*)")
      .eq("user_id", userId)
      .in("status", ["pending", "overdue"]);

    const daysBefore = settings?.reminder_days_before ?? 3;
    const template =
      settings?.message_template ??
      "Olá {nome}! Sua mensalidade de {valor} vence em {vencimento}.";

    for (const invoice of invoices ?? []) {
      const client = (invoice as unknown as { clients: { name: string; phone: string } | null })
        .clients;
      if (!client) continue;

      const due = new Date(`${invoice.due_date}T12:00:00`);
      const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

      const shouldSend =
        (diffDays === daysBefore) ||
        (diffDays === 0 && (settings?.send_on_due_day ?? true)) ||
        (diffDays < 0 && (settings?.overdue_reminder ?? true));

      if (!shouldSend) continue;

      const lastSent = invoice.last_reminder_at ? new Date(invoice.last_reminder_at) : null;
      if (lastSent && iso(lastSent) === todayIso) continue;

      const body = template
        .replace(/\{nome\}/g, client.name)
        .replace(/\{valor\}/g, Number(invoice.amount).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
        .replace(/\{vencimento\}/g, invoice.due_date.split("-").reverse().join("/"))
        .replace(/\{dias\}/g, String(Math.abs(diffDays)));

      try {
        if (!settings) throw new Error("WhatsApp não configurado.");
        await sendViaEvolution(settings, client.phone, body);
        sent += 1;
        await supabase.from("message_logs").insert({
          user_id: userId,
          client_id: invoice.client_id,
          invoice_id: invoice.id,
          phone: client.phone,
          body,
          status: "sent",
        });
        await supabase
          .from("invoices")
          .update({
            reminders_sent: (invoice.reminders_sent ?? 0) + 1,
            last_reminder_at: new Date().toISOString(),
          })
          .eq("id", invoice.id);
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Erro desconhecido";
        if (errors.length < 3) errors.push(message);
        await supabase.from("message_logs").insert({
          user_id: userId,
          client_id: invoice.client_id,
          invoice_id: invoice.id,
          phone: client.phone,
          body,
          status: "failed",
          error: message,
        });
      }
    }

    return { created, sent, failed, errors };
  });

/** Marca uma cobrança como paga e agenda o próximo vencimento do cliente. */
export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { invoiceId: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: invoice, error } = await supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", data.invoiceId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const next = addMonths(new Date(`${invoice.due_date}T12:00:00`), 1);
    await supabase
      .from("clients")
      .update({ next_due_date: iso(next) })
      .eq("id", invoice.client_id)
      .eq("user_id", userId);

    return { ok: true as const, nextDueDate: iso(next) };
  });
