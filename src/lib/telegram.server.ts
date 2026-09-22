/**
 * Integração do robô de atendimento com o Telegram.
 * Reaproveita exatamente o mesmo cérebro usado no WhatsApp (processBotMessage).
 */

const TG_API = "https://api.telegram.org";

export type TelegramStatus = {
  configured: boolean;
  connected: boolean;
  enabled: boolean;
  botUsername: string | null;
  lastError: string | null;
  webhookUrl: string | null;
};

export function publicAppUrl(): string {
  const raw = (process.env["PUBLIC_APP_URL"] || "https://embrace-essence-app.lovable.app").trim();
  return raw.replace(/\/+$/, "");
}

export function telegramWebhookUrl(userId: string): string {
  return `${publicAppUrl()}/api/public/hooks/telegram?userId=${encodeURIComponent(userId)}`;
}

async function tgCall(token: string, method: string, body?: any): Promise<any> {
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.ok === false) {
    throw new Error(json?.description || `Falha ao falar com o Telegram (${res.status})`);
  }
  return json.result;
}

export async function sendTelegramMessage(token: string, chatId: string | number, text: string) {
  if (!text?.trim()) return;
  return tgCall(token, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

export async function sendTelegramPhotoBase64(
  token: string,
  chatId: string | number,
  base64: string,
  caption?: string,
) {
  const clean = base64.replace(/^data:image\/\w+;base64,/, "");
  const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (caption) form.append("caption", caption);
  form.append("photo", new Blob([bytes], { type: "image/png" }), "qrcode-pix.png");

  const res = await fetch(`${TG_API}/bot${token}/sendPhoto`, { method: "POST", body: form });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Falha ao enviar imagem no Telegram: ${txt.slice(0, 120)}`);
  }
}

export async function getTelegramRow(userId: string): Promise<any | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("telegram_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return data ?? null;
}

export async function getTelegramStatus(userId: string): Promise<TelegramStatus> {
  const row = await getTelegramRow(userId);
  return {
    configured: Boolean(row?.bot_token),
    connected: Boolean(row?.connected),
    enabled: row?.enabled !== false,
    botUsername: row?.bot_username ?? null,
    lastError: row?.last_error ?? null,
    webhookUrl: row?.bot_token ? telegramWebhookUrl(userId) : null,
  };
}

/** Salva o token, valida no Telegram e registra o webhook do sistema. */
export async function connectTelegram(userId: string, token: string): Promise<TelegramStatus> {
  const clean = token.trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(clean)) {
    throw new Error("Token inválido. Copie o token que o @BotFather envia, no formato 123456:ABC...");
  }

  const me = await tgCall(clean, "getMe");
  const secret = crypto.randomUUID().replace(/-/g, "");

  await tgCall(clean, "setWebhook", {
    url: telegramWebhookUrl(userId),
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("telegram_settings").upsert(
    {
      user_id: userId,
      bot_token: clean,
      bot_username: me?.username ?? null,
      enabled: true,
      connected: true,
      webhook_secret: secret,
      last_error: null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return getTelegramStatus(userId);
}

export async function disconnectTelegram(userId: string): Promise<TelegramStatus> {
  const row = await getTelegramRow(userId);
  if (row?.bot_token) {
    try {
      await tgCall(row.bot_token, "deleteWebhook", { drop_pending_updates: true });
    } catch {}
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("telegram_settings")
    .update({
      bot_token: null,
      bot_username: null,
      connected: false,
      webhook_secret: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return getTelegramStatus(userId);
}

export async function setTelegramEnabled(userId: string, enabled: boolean): Promise<TelegramStatus> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("telegram_settings")
    .upsert(
      { user_id: userId, enabled, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  return getTelegramStatus(userId);
}

function onlyDigits(v: string): string {
  return String(v || "").replace(/\D/g, "");
}

/** Descobre/memoriza o telefone informado pelo cliente para casar com o cadastro. */
async function resolveChatPhone(
  userId: string,
  chatId: string,
  displayName: string,
  contactPhone?: string,
  text?: string,
): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let phone = onlyDigits(contactPhone || "");
  if (!phone) {
    const inText = onlyDigits(text || "");
    if (inText.length >= 10 && inText.length <= 13) phone = inText;
  }

  const { data: existing } = await supabaseAdmin
    .from("telegram_chats")
    .select("*")
    .eq("user_id", userId)
    .eq("chat_id", chatId)
    .maybeSingle();

  const finalPhone = phone || existing?.phone || "";

  await supabaseAdmin.from("telegram_chats").upsert(
    {
      user_id: userId,
      chat_id: chatId,
      phone: finalPhone || null,
      display_name: displayName || null,
      last_message_at: new Date().toISOString(),
    },
    { onConflict: "user_id,chat_id" },
  );

  // Sem telefone conhecido, usamos o próprio id da conversa como identificador.
  return finalPhone || chatId.replace(/\D/g, "") || chatId;
}

/** Processa um update recebido do Telegram e responde com o mesmo robô do WhatsApp. */
export async function processTelegramUpdate(userId: string, update: any): Promise<{ handled: boolean }> {
  const row = await getTelegramRow(userId);
  if (!row?.bot_token || row.enabled === false) return { handled: false };

  const msg = update?.message ?? update?.edited_message ?? null;
  const callback = update?.callback_query ?? null;

  const chatId = String(msg?.chat?.id ?? callback?.message?.chat?.id ?? "");
  if (!chatId) return { handled: false };

  const rawText = String(callback?.data ?? msg?.text ?? msg?.caption ?? "").trim();
  if (!rawText) return { handled: false };

  const from = msg?.from ?? callback?.from ?? {};
  const displayName = [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Cliente";

  const phone = await resolveChatPhone(
    userId,
    chatId,
    displayName,
    msg?.contact?.phone_number,
    rawText,
  );

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { processBotMessage } = await import("./bot.server");

  const text = rawText === "/start" ? "oi" : rawText;
  const result = await processBotMessage(supabaseAdmin, userId, {
    phone,
    text,
    pushName: displayName,
  });

  if (!result?.reply) return { handled: false };

  await sendTelegramMessage(row.bot_token, chatId, result.reply);

  if (result.media?.base64) {
    try {
      await sendTelegramPhotoBase64(row.bot_token, chatId, result.media.base64, result.media.caption);
    } catch {}
  }

  if (Array.isArray(result.extraMessages)) {
    for (const extra of result.extraMessages) {
      if (extra?.trim()) await sendTelegramMessage(row.bot_token, chatId, extra);
    }
  }

  try {
    await supabaseAdmin.from("message_logs").insert({
      user_id: userId,
      phone,
      body: `[Telegram] ${result.reply}`,
      status: "sent",
    });
  } catch {}

  return { handled: true };
}

/** Envia uma mensagem de teste para uma conversa já existente. */
export async function sendTelegramTest(userId: string, chatId?: string): Promise<{ ok: boolean; message: string }> {
  const row = await getTelegramRow(userId);
  if (!row?.bot_token) return { ok: false, message: "Conecte o robô do Telegram primeiro." };

  let target = (chatId || "").trim();
  if (!target) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("telegram_chats")
      .select("chat_id")
      .eq("user_id", userId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    target = data?.chat_id || "";
  }
  if (!target) {
    return { ok: false, message: "Nenhuma conversa ainda. Mande um /start para o seu robô no Telegram." };
  }

  await sendTelegramMessage(row.bot_token, target, "Tudo certo! O atendimento pelo Telegram está funcionando ✅");
  return { ok: true, message: "Mensagem de teste enviada." };
}
