import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processBotMessage, loadBotConfig, type BotInteractivePayload } from "./bot.server";
import {
  isTenantEvolutionEnabled,
  tenantInstanceName,
  tenantSendMedia,
  tenantSendText,
} from "./evolution-tenant.server";
import { sendWhatsAppMedia, sendWhatsAppText } from "./whatsapp-connection.server";
import { instanceNameFor } from "./evolution.server";
import { parseEvolutionMessages } from "./whatsapp-event.server";

const PIX_MEDIA_ACTIONS = new Set([
  "order_created_mp",
  "order_created_manual",
  "renew_pix_mp_sent",
  "renew_pix_manual_sent",
  "order_status_checked",
]);

const processedMessages = new Map<string, number>();

function pruneProcessedMessages(now: number) {
  for (const [key, timestamp] of processedMessages) {
    if (now - timestamp > 10 * 60_000) processedMessages.delete(key);
  }
}

export function isDuplicateMessage(messageId: string, phone: string): boolean {
  const key = messageId || `${phone}:${Math.floor(Date.now() / 2000)}`;
  const now = Date.now();
  pruneProcessedMessages(now);
  if (processedMessages.has(key)) return true;
  processedMessages.set(key, now);
  return false;
}

export async function resolveTargetUserId(
  explicitUserId?: string | null,
  instanceName?: string | null,
): Promise<string> {
  const explicit = String(explicitUserId ?? "").trim();
  if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(explicit)) return explicit;

  const { data: settings, error } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("user_id, instance_name, auto_send_enabled, business_name, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Não foi possível carregar a conta do WhatsApp: ${error.message}`);
  const rows = settings ?? [];

  if (instanceName) {
    const exact = rows.find(
      (row: any) => row.instance_name === instanceName || instanceNameFor(row.user_id) === instanceName,
    );
    if (exact?.user_id) return exact.user_id;
  }

  // Sem instância identificada, só é seguro atender quando existe uma única conta.
  // Nunca roteia a conversa de um revendedor para outro.
  if (rows.length === 1 && rows[0]?.user_id) return rows[0].user_id;

  throw new Error(
    "Não foi possível identificar a conta dona desta instância do WhatsApp. Reconecte o WhatsApp pelo painel para registrar o webhook com o identificador correto.",
  );
}

function interactiveAsText(interactive: BotInteractivePayload): string {
  if (interactive.type === "buttons") {
    const options = interactive.buttons.map((button) => {
      const value = button.copyCode || button.url;
      const command = button.type === "reply" || (!button.copyCode && !button.url) ? `${button.id}. ` : "";
      return `${command}${button.displayText}${value ? `\n${value}` : ""}`;
    });
    return options.length ? options.join("\n\n") : "";
  }

  const rows = interactive.sections.flatMap((section) =>
    section.rows.map((row) => `${row.rowId}. ${row.title}${row.description ? ` — ${row.description}` : ""}`),
  );
  return rows.join("\n");
}

function completeReply(reply: string, _interactive?: BotInteractivePayload, _action?: string): string {
  return reply.trim();
}

async function recordMessage(params: {
  userId: string;
  phone: string;
  body: string;
  status: "sent" | "failed";
  error?: string;
}) {
  const { error } = await supabaseAdmin.from("message_logs").insert({
    user_id: params.userId,
    phone: params.phone,
    body: params.body,
    status: params.status,
    error: params.error ?? null,
  });
  if (error) console.error("[WhatsApp] Falha ao registrar mensagem:", error.message);
}

async function recoverRenewalConversationInput(userId: string, phone: string, incomingText: string) {
  const raw = String(incomingText || "").trim();
  if (!raw) return raw;

  const normalized = raw.toLowerCase().trim();
  if (["0", "menu", "inicio", "início", "cancelar", "sair", "voltar"].includes(normalized)) {
    return raw;
  }

  try {
    const { data: lastLog } = await supabaseAdmin
      .from("message_logs")
      .select("body, created_at")
      .eq("user_id", userId)
      .eq("phone", phone)
      .eq("status", "sent")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!lastLog?.body || !lastLog?.created_at) return raw;

    const createdAt = new Date(lastLog.created_at).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 15 * 60_000) return raw;

    const body = String(lastLog.body);
    const lowerBody = body.toLowerCase();
    const awaitingRenewUsername =
      lowerBody.includes("digite o seu usuário") ||
      lowerBody.includes("digite o usuario") ||
      lowerBody.includes("digite o usuário") ||
      lowerBody.includes("digite o outro usuário") ||
      lowerBody.includes("digite o outro usuario") ||
      lowerBody.includes("qual você deseja renovar") ||
      lowerBody.includes("qual deseja renovar");

    if (!awaitingRenewUsername) return raw;

    const isConfirmation = ["sim", "s", "ok", "confirmo", "quero", "renovar"].includes(normalized);
    if (isConfirmation) {
      const candidate = body.match(/Usuário:\*?\s*\*([^*\n]+)\*/i)?.[1]?.trim();
      if (candidate) return `2 ${candidate}`;
    }

    // Torna a etapa de renovação stateless: mesmo se a próxima mensagem cair em
    // outra instância serverless, o login informado continua no fluxo da opção 2.
    return `2 ${raw}`;
  } catch (error) {
    console.warn("[WhatsApp Bot] Não foi possível reconstruir o contexto da renovação:", error);
    return raw;
  }
}

export async function processIncomingWhatsAppEvent(
  payload: unknown,
  queryUserId?: string | null,
): Promise<{ handled: boolean; ignored?: string; action?: string; reply?: string; phone?: string }> {
  const messages = parseEvolutionMessages(payload);
  if (!messages.length) return { handled: false, ignored: "unsupported_event" };

  let lastResult: { handled: boolean; ignored?: string; action?: string; reply?: string; phone?: string } = {
    handled: false,
    ignored: "no_eligible_message",
  };

  for (const message of messages) {
    if (message.fromMe) {
      lastResult = { handled: false, ignored: "from_me" };
      continue;
    }
    if (message.isGroup) {
      lastResult = { handled: false, ignored: "group_or_broadcast" };
      continue;
    }
    if (!message.phone || message.phone.length < 12) {
      lastResult = { handled: false, ignored: "phone_not_resolved" };
      continue;
    }
    if (!message.text) {
      lastResult = { handled: false, ignored: "empty_text" };
      continue;
    }
    if (isDuplicateMessage(message.messageId, message.phone)) {
      lastResult = { handled: false, ignored: "duplicate" };
      continue;
    }

    const userPromise = resolveTargetUserId(queryUserId, message.instance);
    const claimPromise = message.messageId
      ? supabaseAdmin.from("whatsapp_processed_messages").insert({ message_id: message.messageId })
      : Promise.resolve({ error: null } as any);

    const [userId, claimResult] = await Promise.all([userPromise, claimPromise]);
    const claimError = claimResult?.error;
    if (claimError?.code === "23505") {
      lastResult = { handled: false, ignored: "duplicate" };
      continue;
    }
    if (claimError) {
      console.warn("[WhatsApp Bot] Deduplicação persistente indisponível:", claimError.message);
    }

    const config = await loadBotConfig(supabaseAdmin, userId);
    if (!config.enabled) {
      lastResult = { handled: false, ignored: "bot_disabled" };
      continue;
    }

    const contextualText = await recoverRenewalConversationInput(userId, message.phone, message.text);
    const result = await processBotMessage(supabaseAdmin, userId, {
      phone: message.phone,
      text: contextualText,
      pushName: message.pushName,
    });
    const reply = completeReply(result.reply, result.interactive, result.action);
    if (!reply) {
      lastResult = { handled: true, action: result.action, phone: message.phone };
      continue;
    }

    const replyTarget = message.senderJid || message.phone;
    const evolutionInstance = message.instance || tenantInstanceName(userId);
    const sent = isTenantEvolutionEnabled()
      ? await tenantSendText(evolutionInstance, replyTarget, reply, true)
      : await sendWhatsAppText(replyTarget, reply, message.instance || undefined);

    if (!sent.ok) {
      await recordMessage({
        userId,
        phone: message.phone,
        body: reply,
        status: "failed",
        error: sent.error,
      });
      throw new Error(`A resposta foi gerada, mas o WhatsApp recusou o envio: ${sent.error}`);
    }

    await recordMessage({ userId, phone: message.phone, body: reply, status: "sent" });

    if (result.media?.base64 && PIX_MEDIA_ACTIONS.has(result.action)) {
      const media = {
        base64: result.media.base64,
        caption: result.media.caption || "QR Code PIX",
        mimetype: "image/png",
        fileName: "qrcode-pix.png",
      };
      if (isTenantEvolutionEnabled()) {
        await tenantSendMedia(evolutionInstance, replyTarget, media, true);
      } else {
        await sendWhatsAppMedia(replyTarget, media, message.instance || undefined);
      }
    }

    const hasCopyValue =
      result.interactive?.type === "buttons" &&
      result.interactive.buttons.some((button) => Boolean(button.copyCode));
    for (const extra of hasCopyValue ? [] : result.extraMessages ?? []) {
      if (!extra.trim()) continue;
      if (isTenantEvolutionEnabled()) {
        await tenantSendText(evolutionInstance, replyTarget, extra, true);
      } else {
        await sendWhatsAppText(replyTarget, extra, message.instance || undefined);
      }
    }

    lastResult = {
      handled: true,
      action: result.action,
      reply,
      phone: message.phone,
    };
  }

  return lastResult;
}
