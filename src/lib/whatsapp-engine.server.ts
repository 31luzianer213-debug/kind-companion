import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processBotMessage, loadBotConfig, type BotInteractivePayload } from "./bot.server";
import { evoSendMedia, evoSendText, isEvolutionEnabled } from "./evolution-api.server";
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

  const configured =
    rows.find((row: any) => row.auto_send_enabled && row.business_name?.trim()) ??
    rows.find((row: any) => row.business_name?.trim()) ??
    rows[0];

  if (!configured?.user_id) throw new Error("Nenhuma conta configurada para atender no WhatsApp.");
  return configured.user_id;
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

function completeReply(reply: string, interactive?: BotInteractivePayload, action?: string): string {
  // O menu principal já contém as opções no texto. Não acrescente a mesma lista
  // novamente quando a Evolution API precisar usar o fallback em texto.
  if (action === "menu_shown") return reply.trim();

  const options = interactive ? interactiveAsText(interactive) : "";
  if (!options || reply.includes(options)) return reply.trim();
  return `${reply.trim()}\n\n${options}`.trim();
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
    // A identificação da conta e a deduplicação não dependem uma da outra.
    // Executá-las em paralelo reduz a latência do webhook no primeiro acesso.
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
      // A tabela de deduplicação é uma proteção extra. Falha de schema/RLS
      // não pode impedir o bot inteiro de responder.
      console.warn("[WhatsApp Bot] Deduplicação persistente indisponível:", claimError.message);
    }

    const config = await loadBotConfig(supabaseAdmin, userId);
    if (!config.enabled) {
      lastResult = { handled: false, ignored: "bot_disabled" };
      continue;
    }

    const result = await processBotMessage(supabaseAdmin, userId, {
      phone: message.phone,
      text: message.text,
      pushName: message.pushName,
    });
    const reply = completeReply(result.reply, result.interactive, result.action);
    if (!reply) {
      lastResult = { handled: true, action: result.action, phone: message.phone };
      continue;
    }

    // senderJid já prefere o senderPn (número real) quando a Evolution alterna
    // o remoteJid para @lid. Isso mantém a mesma sessão Signal na conversa.
    const replyTarget = message.senderJid || message.phone;
    const sent = isEvolutionEnabled()
      ? await evoSendText(replyTarget, reply)
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
      if (isEvolutionEnabled()) await evoSendMedia(replyTarget, media);
      else await sendWhatsAppMedia(replyTarget, media, message.instance || undefined);
    }

    const hasCopyValue =
      result.interactive?.type === "buttons" &&
      result.interactive.buttons.some((button) => Boolean(button.copyCode));
    for (const extra of hasCopyValue ? [] : result.extraMessages ?? []) {
      if (!extra.trim()) continue;
      if (isEvolutionEnabled()) await evoSendText(replyTarget, extra);
      else await sendWhatsAppText(replyTarget, extra, message.instance || undefined);
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