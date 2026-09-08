import type { SupabaseClient } from "@supabase/supabase-js";
import { buildTemplateVars, renderTemplate } from "./format";

export type WhatsAppSettings = {
  api_url?: string | null;
  api_key?: string | null;
  instance_name?: string | null;
  message_template?: string;
  reminder_days_before?: number;
  send_on_due_day?: boolean;
  overdue_reminder?: boolean;
  overdue_template?: string | null;
  welcome_template?: string | null;
  business_name?: string | null;
  pix_key?: string | null;
  pix_holder?: string | null;
  payment_link?: string | null;
};

export function normalizeNumber(phone: string) {
  if (!phone) return "";
  const trimmed = phone.trim();
  if (trimmed.endsWith("@lid") || trimmed.endsWith("@s.whatsapp.net")) {
    return trimmed;
  }
  const digits = trimmed.replace(/\D/g, "");
  // Se for LID (14 ou 15 dígitos sem código do país 55) ou explicitamente contiver @lid
  if (trimmed.includes("@lid") || (digits.length >= 14 && !digits.startsWith("55"))) {
    return `${digits}@lid`;
  }
  return digits.length <= 11 ? `55${digits}` : digits;
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
  const { base, key, instance } = evolutionConfig(
    owner,
    settings.api_url ?? undefined,
    settings.api_key ?? undefined,
  );
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["apikey"] = key;

  const res = await fetch(`${base}/message/sendText/${instance}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ number: normalizeNumber(phone), text, textMessage: { text } }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`Falha no envio (${res.status}): ${raw.slice(0, 300)}`);
  return raw.slice(0, 500);
}

export interface ButtonItem {
  id: string;
  displayText: string;
  type?: "reply" | "copy" | "url" | "call" | "pix";
  copyCode?: string;
  url?: string;
  phoneNumber?: string;
}

/**
 * Envia botões interativos via Evolution API v2 (/message/sendButtons/:instance).
 * Se a API ou WhatsApp rejeitar, faz fallback automático para mensagem de texto normal.
 */
export async function sendButtonsViaEvolution(
  settings: WhatsAppSettings & { user_id?: string },
  phone: string,
  options: {
    title?: string;
    description: string;
    buttons: ButtonItem[];
    footer?: string;
    fallbackText?: string;
  },
  userId?: string,
) {
  const { evolutionConfig } = await import("./evolution.server");
  const owner = userId ?? settings.user_id;
  if (!owner) throw new Error("Conta sem WhatsApp conectado.");
  const { base, key, instance } = evolutionConfig(
    owner,
    settings.api_url ?? undefined,
    settings.api_key ?? undefined,
  );
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["apikey"] = key;

  try {
    const formattedButtons = options.buttons.map((b) => ({
      id: String(b.id),
      displayText: b.displayText,
      type: b.type || "reply",
      ...(b.copyCode ? { copyCode: b.copyCode } : {}),
      ...(b.url ? { url: b.url } : {}),
      ...(b.phoneNumber ? { phoneNumber: b.phoneNumber } : {}),
    }));

    const payload: any = {
      number: normalizeNumber(phone),
      description: options.description,
      buttons: formattedButtons,
    };
    if (options.title) payload.title = options.title;
    if (options.footer) payload.footer = options.footer;

    const res = await fetch(`${base}/message/sendButtons/${instance}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return await res.text();
    }

    console.warn(`Evolution sendButtons retornado status ${res.status}. Usando fallback para texto.`);
  } catch (btnErr) {
    console.warn("Exceção no sendButtons, caindo para fallback de texto:", btnErr);
  }

  // Fallback para texto normal
  const fallback = options.fallbackText || options.description;
  return await sendViaEvolution(settings, phone, fallback, userId);
}

export interface ListSection {
  title: string;
  rows: Array<{
    title: string;
    description?: string;
    rowId: string;
  }>;
}

/**
 * Envia Menu de Lista Interativa via Evolution API v2 (/message/sendList/:instance).
 * Se o dispositivo do cliente não suportar ou a API falhar, cai para fallback de texto limpo.
 */
export async function sendListViaEvolution(
  settings: WhatsAppSettings & { user_id?: string },
  phone: string,
  options: {
    title: string;
    description: string;
    buttonText: string;
    footerText?: string;
    sections: ListSection[];
    fallbackText?: string;
  },
  userId?: string,
) {
  const { evolutionConfig } = await import("./evolution.server");
  const owner = userId ?? settings.user_id;
  if (!owner) throw new Error("Conta sem WhatsApp conectado.");
  const { base, key, instance } = evolutionConfig(
    owner,
    settings.api_url ?? undefined,
    settings.api_key ?? undefined,
  );
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["apikey"] = key;

  try {
    const payload = {
      number: normalizeNumber(phone),
      title: options.title,
      description: options.description,
      buttonText: options.buttonText,
      footerText: options.footerText || "Selecione uma opção acima",
      sections: options.sections,
    };

    const res = await fetch(`${base}/message/sendList/${instance}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      return await res.text();
    }

    console.warn(`Evolution sendList retornado status ${res.status}. Usando fallback para texto.`);
  } catch (listErr) {
    console.warn("Exceção no sendList, caindo para fallback de texto:", listErr);
  }

  // Fallback para texto normal
  const fallback = options.fallbackText || options.description;
  return await sendViaEvolution(settings, phone, fallback, userId);
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
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
    .select("*, clients(*, iptv_lists(name, server_url, username, password))")
    .eq("user_id", userId)
    .in("status", ["pending", "overdue"]);

  const daysBefore = settings?.reminder_days_before ?? 3;
  const template =
    settings?.message_template ??
    "Olá {nome}! Sua mensalidade de {valor} vence em {vencimento}.";

  for (const invoice of invoices ?? []) {
    const client = invoice.clients as
      | (Record<string, any> & { name: string; phone: string; iptv_lists?: any })
      | null;
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

    const chosen =
      diffDays < 0 && settings?.overdue_template ? settings.overdue_template : template;
    const body = renderTemplate(
      chosen,
      buildTemplateVars({
        client,
        list: client.iptv_lists ?? null,
        settings,
        amount: invoice.amount,
        dueDate: invoice.due_date,
        days: diffDays,
      }),
    );

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
