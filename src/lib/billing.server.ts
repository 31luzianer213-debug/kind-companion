import type { SupabaseClient } from "@supabase/supabase-js";

export type WhatsAppSettings = {
  api_url: string | null;
  api_key: string | null;
  instance_name: string | null;
  message_template?: string;
  reminder_days_before?: number;
  send_on_due_day?: boolean;
  overdue_reminder?: boolean;
};

function normalizeNumber(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.length <= 11 ? `55${d}` : d;
}

export async function sendViaEvolution(
  settings: WhatsAppSettings & { user_id?: string },
  phone: string,
  text: string,
  userId?: string,
) {
  const { evolutionConfig } = await import("./evolution.server");
  const owner = userId ?? settings.user_id;
  if (!owner) throw new Error("Conta sem WhatsApp conectado.");
  const { base, key, instance } = evolutionConfig(owner);
  const res = await fetch(`${base}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ number: normalizeNumber(phone), text, textMessage: { text } }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Falha no envio (${res.status}): ${raw.slice(0, 300)}`);
  return raw.slice(0, 500);
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function brl(value: number) {
  return Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function runBillingForUser(supabase: SupabaseClient<any>, userId: string) {
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

  await supabase
    .from("invoices")
    .update({ status: "overdue" })
    .eq("user_id", userId)
    .eq("status", "pending")
    .lt("due_date", todayIso);

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, clients(name, phone)")
    .eq("user_id", userId)
    .in("status", ["pending", "overdue"]);

  const daysBefore = settings?.reminder_days_before ?? 3;
  const template =
    settings?.message_template ??
    "Olá {nome}! Sua mensalidade de {valor} vence em {vencimento}.";

  for (const invoice of invoices ?? []) {
    const client = invoice.clients as { name: string; phone: string } | null;
    if (!client) continue;

    const due = new Date(`${invoice.due_date}T12:00:00`);
    const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);

    const shouldSend =
      diffDays === daysBefore ||
      (diffDays === 0 && (settings?.send_on_due_day ?? true)) ||
      (diffDays < 0 && (settings?.overdue_reminder ?? true));
    if (!shouldSend) continue;

    const lastSent = invoice.last_reminder_at ? new Date(invoice.last_reminder_at) : null;
    if (lastSent && iso(lastSent) === todayIso) continue;

    const body = template
      .replace(/\{nome\}/g, client.name)
      .replace(/\{valor\}/g, brl(invoice.amount))
      .replace(/\{vencimento\}/g, String(invoice.due_date).split("-").reverse().join("/"))
      .replace(/\{dias\}/g, String(Math.abs(diffDays)));

    try {
      await sendViaEvolution(settings ?? {}, client.phone, body, userId);
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
}
