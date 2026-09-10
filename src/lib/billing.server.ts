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
  let digits = trimmed.replace(/\D/g, "").replace(/^0+/, "");
  // Se for LID (14 ou 15 dígitos sem código do país 55)
  if (trimmed.includes("@lid") || (digits.length >= 14 && !digits.startsWith("55"))) {
    return `${digits}@lid`;
  }
  // remove DDI duplicado / prefixo de operadora
  if (digits.length > 13 && digits.startsWith("55")) digits = digits.slice(-13);
  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
    digits = `55${digits}`;
  }
  return digits;
}

const BAILEYS_PORT = process.env.BAILEYS_PORT ? Number(process.env.BAILEYS_PORT) : 3001;
const BAILEYS_URL = process.env.BAILEYS_API_URL || `http://127.0.0.1:${BAILEYS_PORT}`;

export async function sendViaBaileys(
  phone: string,
  text: string,
  options?: {
    type?: "text" | "buttons" | "list" | "pix_copy";
    buttons?: any[];
    sections?: any[];
    pixCode?: string;
  },
) {
  const res = await fetch(`${BAILEYS_URL}/api/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: normalizeNumber(phone),
      text,
      type: options?.type || "text",
      buttons: options?.buttons,
      sections: options?.sections,
      pixCode: options?.pixCode,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Falha no envio Baileys [${res.status}]`);
  }
  return data;
}

export async function sendViaEvolution(
  _settings: WhatsAppSettings & { user_id?: string },
  phone: string,
  text: string,
  _userId?: string,
) {
  return await sendViaBaileys(phone, text);
}

export async function sendMediaViaBaileys(
  phone: string,
  mediaOptions: {
    base64: string;
    caption?: string;
    mimetype?: string;
    fileName?: string;
  },
) {
  const res = await fetch(`${BAILEYS_URL}/api/send-message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: normalizeNumber(phone),
      text: mediaOptions.caption || "",
      media: {
        base64: mediaOptions.base64,
        mimetype: mediaOptions.mimetype || "image/png",
        caption: mediaOptions.caption || "",
        fileName: mediaOptions.fileName || "qrcode-pix.png",
      },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `Falha no envio de mídia Baileys [${res.status}]`);
  }
  return data;
}

export async function sendMediaViaEvolution(
  _settings: WhatsAppSettings & { user_id?: string },
  phone: string,
  mediaOptions: {
    base64: string;
    caption?: string;
    mimetype?: string;
    fileName?: string;
  },
  _userId?: string,
) {
  return await sendMediaViaBaileys(phone, mediaOptions);
}

export interface ButtonItem {
  id: string;
  displayText: string;
  type?: "reply" | "copy" | "url" | "call" | "pix";
  copyCode?: string;
  url?: string;
  phoneNumber?: string;
}

export async function sendButtonsViaBaileys(
  phone: string,
  options: {
    title?: string;
    description: string;
    buttons: ButtonItem[];
    footer?: string;
    fallbackText?: string;
  },
) {
  const formattedButtons = options.buttons.map((b) => {
    if (b.type === "copy" || b.copyCode) {
      return {
        name: "cta_copy",
        buttonParamsJson: JSON.stringify({
          display_text: b.displayText,
          copy_code: b.copyCode || "",
        }),
      };
    }
    if (b.type === "url" || b.url) {
      return {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
          display_text: b.displayText,
          url: b.url || "",
        }),
      };
    }
    return {
      buttonId: String(b.id),
      buttonText: { displayText: b.displayText },
      type: 1,
    };
  });

  try {
    const res = await fetch(`${BAILEYS_URL}/api/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: normalizeNumber(phone),
        text: options.description,
        footer: options.footer || "IPTV Bot",
        type: "buttons",
        buttons: formattedButtons,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok !== false) {
      return data;
    }
  } catch {}

  // Fallback para texto simples
  return await sendViaBaileys(phone, options.fallbackText || options.description);
}

export async function sendButtonsViaEvolution(
  _settings: WhatsAppSettings & { user_id?: string },
  phone: string,
  options: {
    title?: string;
    description: string;
    buttons: ButtonItem[];
    footer?: string;
    fallbackText?: string;
  },
  _userId?: string,
) {
  return await sendButtonsViaBaileys(phone, options);
}

export interface ListSection {
  title: string;
  rows: Array<{
    title: string;
    description?: string;
    rowId: string;
  }>;
}

export async function sendListViaBaileys(
  phone: string,
  options: {
    title: string;
    description: string;
    buttonText: string;
    footerText?: string;
    sections: ListSection[];
    fallbackText?: string;
  },
) {
  try {
    const res = await fetch(`${BAILEYS_URL}/api/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: normalizeNumber(phone),
        title: options.title,
        text: options.description,
        buttonText: options.buttonText,
        footer: options.footerText || "Selecione uma opção",
        type: "list",
        sections: options.sections,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok !== false) {
      return data;
    }
  } catch {}

  return await sendViaBaileys(phone, options.fallbackText || options.description);
}

export async function sendListViaEvolution(
  _settings: WhatsAppSettings & { user_id?: string },
  phone: string,
  options: {
    title: string;
    description: string;
    buttonText: string;
    footerText?: string;
    sections: ListSection[];
    fallbackText?: string;
  },
  _userId?: string,
) {
  return await sendListViaBaileys(phone, options);
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
