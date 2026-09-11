/**
 * Motor central de processamento e resposta de mensagens de WhatsApp.
 * Unificado, à prova de duplicatas (anti-debounce de 4s e dedup por ID de mensagem)
 * e compatível com Baileys (@lid e @s.whatsapp.net).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processBotMessage, loadBotConfig } from "./bot.server";
import {
  sendWhatsAppText,
  sendWhatsAppMedia,
  sendWhatsAppButtons,
  sendWhatsAppList,
  normalizePhone,
} from "./whatsapp-connection.server";
import { resolvePhoneFromLid } from "./lid.server";
import { instanceNameFor } from "./evolution.server";

// Ações em que faz sentido enviar a imagem do QR Code PIX
const PIX_MEDIA_ACTIONS = new Set([
  "order_created_mp",
  "order_created_manual",
  "renew_pix_mp_sent",
  "renew_pix_manual_sent",
  "order_status_checked",
]);

// Cache de IDs de mensagens já processadas (evita responder à mesma mensagem mais de uma vez)
const processedMessageIds = new Set<string>();

// Cache de debounce por telefone (evita duplicatas disparadas pelo Baileys lid + phone simultâneos)
const recentPhoneTimestamps = new Map<string, number>();

function pruneIdCache() {
  if (processedMessageIds.size > 3000) {
    const list = Array.from(processedMessageIds);
    processedMessageIds.clear();
    list.slice(-1500).forEach((id) => processedMessageIds.add(id));
  }
}

/**
 * Verifica se a mensagem ou telefone já foi atendido recentemente (janela rápida de 1.2 segundos).
 */
export function isDuplicateMessage(messageId: string, phone: string): boolean {
  const now = Date.now();

  // 1. Checagem por ID único da mensagem (stanza ID)
  if (messageId) {
    if (processedMessageIds.has(messageId)) {
      return true;
    }
    processedMessageIds.add(messageId);
    pruneIdCache();
  }

  // 2. Checagem por debounce do número de telefone (1200ms - elimina delay excessivo)
  if (phone) {
    const cleanPhone = normalizePhone(phone);
    const lastTimestamp = recentPhoneTimestamps.get(cleanPhone) ?? 0;
    if (now - lastTimestamp < 1200) {
      return true;
    }
    recentPhoneTimestamps.set(cleanPhone, now);
  }

  return false;
}

/**
 * Desembrulha mensagens aninhadas do Baileys (viewOnce, ephemeral, etc.).
 */
export function unwrapMessagePayload(raw: any): any {
  if (!raw || typeof raw !== "object") return {};
  if (raw.ephemeralMessage?.message) return unwrapMessagePayload(raw.ephemeralMessage.message);
  if (raw.viewOnceMessage?.message) return unwrapMessagePayload(raw.viewOnceMessage.message);
  if (raw.viewOnceMessageV2?.message) return unwrapMessagePayload(raw.viewOnceMessageV2.message);
  if (raw.viewOnceMessageV2Extension?.message) return unwrapMessagePayload(raw.viewOnceMessageV2Extension.message);
  if (raw.documentWithCaptionMessage?.message) return unwrapMessagePayload(raw.documentWithCaptionMessage.message);
  return raw;
}

/**
 * Extrai o texto limpo da mensagem recebida em qualquer um dos formatos suportados pelo Baileys / Evolution.
 */
export function extractMessageText(messageObj: any, fallbackBody?: string): string {
  const unwrapped = unwrapMessagePayload(messageObj);

  let text = String(
    unwrapped?.conversation ||
    unwrapped?.extendedTextMessage?.text ||
    unwrapped?.buttonsResponseMessage?.selectedButtonId ||
    unwrapped?.buttonsResponseMessage?.selectedDisplayText ||
    unwrapped?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    unwrapped?.listResponseMessage?.title ||
    unwrapped?.templateButtonReplyMessage?.selectedId ||
    unwrapped?.interactiveResponseMessage?.body?.text ||
    fallbackBody ||
    ""
  ).trim();

  if (!text) {
    const nativeFlow = unwrapped?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
    if (nativeFlow) {
      try {
        const parsed = JSON.parse(nativeFlow);
        text = String(parsed.id || parsed.selectedId || parsed.rowId || nativeFlow).trim();
      } catch {
        text = String(nativeFlow).trim();
      }
    }
  }

  return text;
}

/**
 * Resolve o usuário dono da conta no sistema para carregar a configuração correta do bot.
 */
export async function resolveTargetUserId(
  explicitUserId?: string | null,
  instanceName?: string | null,
): Promise<string> {
  let target = explicitUserId?.trim() || "";

  // Se foi passado prefixo curto (hexadecimal da instância)
  if (target && target.length < 32) {
    try {
      const { data: accounts } = await supabaseAdmin.from("whatsapp_settings").select("user_id");
      for (const acc of accounts ?? []) {
        if (acc.user_id.replace(/[^a-zA-Z0-9]/g, "").startsWith(target)) {
          return acc.user_id;
        }
      }
    } catch {}

    try {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id");
      for (const p of profs ?? []) {
        if (p.id.replace(/[^a-zA-Z0-9]/g, "").startsWith(target)) {
          return p.id;
        }
      }
    } catch {}
  }

  if (target && target.length >= 32) {
    return target;
  }

  // Tenta localizar pela instância registrada
  if (instanceName) {
    try {
      const { data: accounts } = await supabaseAdmin.from("whatsapp_settings").select("user_id");
      for (const acc of accounts ?? []) {
        if (instanceNameFor(acc.user_id) === instanceName) {
          return acc.user_id;
        }
      }
    } catch {}

    try {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id");
      for (const p of profs ?? []) {
        if (instanceNameFor(p.id) === instanceName) {
          return p.id;
        }
      }
    } catch {}
  }

  // Fallback: primeira conta de usuário no banco
  try {
    const { data: firstAccount } = await supabaseAdmin
      .from("whatsapp_settings")
      .select("user_id")
      .limit(1)
      .maybeSingle();
    if (firstAccount?.user_id) return firstAccount.user_id;
  } catch {}

  try {
    const { data: firstProf } = await supabaseAdmin.from("profiles").select("id").limit(1).maybeSingle();
    if (firstProf?.id) return firstProf.id;
  } catch {}

  return "00000000-0000-0000-0000-000000000000";
}

/**
 * Processa um payload completo da Evolution API v1 / v2.
 */
export async function processIncomingWhatsAppEvent(
  payload: any,
  queryUserId?: string | null,
): Promise<{
  handled: boolean;
  ignored?: string;
  action?: string;
  reply?: string;
  phone?: string;
}> {
  if (!payload || typeof payload !== "object") {
    return { handled: false, ignored: "invalid_payload" };
  }

  const rawData = payload.data ?? payload;
  const item = Array.isArray(rawData?.messages)
    ? rawData.messages[0]
    : (rawData?.message ? rawData : (payload?.message ? payload : rawData));

  const instance = String(payload?.instance ?? item?.instance ?? rawData?.instance ?? "").trim();
  const key = item?.key ?? rawData?.key ?? payload?.key ?? {};

  // 1. Filtra mensagens próprias (fromMe)
  const fromMe = Boolean(key?.fromMe ?? item?.fromMe ?? rawData?.fromMe);
  if (fromMe) {
    return { handled: false, ignored: "from_me" };
  }

  // 2. Filtra grupos e transmissões
  const rawRemoteJid = String(
    key?.remoteJid ||
    key?.participant ||
    item?.remoteJid ||
    rawData?.remoteJid ||
    payload?.sender ||
    ""
  ).trim();

  if (!rawRemoteJid || rawRemoteJid.includes("@g.us") || rawRemoteJid.includes("@broadcast")) {
    return { handled: false, ignored: "group_or_broadcast" };
  }

  const senderDigits = rawRemoteJid.replace(/@.+$/, "").replace(/\D/g, "");
  if (!senderDigits || senderDigits.length < 8) {
    return { handled: false, ignored: "invalid_sender" };
  }

  const isLid = rawRemoteJid.endsWith("@lid") || (senderDigits.length >= 14 && !senderDigits.startsWith("55"));

  // 3. Resolve telefone real caso seja LID (para banco, Mercado Pago e Sigma)
  let realPhone = "";
  const candidates = [
    payload?.sender,
    item?.sender,
    rawData?.sender,
    key?.participant,
    item?.participant,
  ].filter(Boolean);

  for (const c of candidates) {
    const d = String(c).replace(/@.*$/, "").replace(/\D/g, "");
    if (d.length >= 10 && d.length <= 13) {
      realPhone = d;
      break;
    }
  }

  if (!realPhone) {
    realPhone = senderDigits;
  }

  if (isLid) {
    try {
      const resolved = await resolvePhoneFromLid(instance, rawRemoteJid);
      if (resolved) {
        realPhone = resolved;
        console.log(`[WhatsApp Engine] 🔗 LID ${rawRemoteJid} resolvido para número real: ${realPhone}`);
      }
    } catch {}
  }

  // Número limpo com DDD apenas dígitos (usado em consultas ao Sigma, PIX e BD)
  let customerDigits = realPhone.replace(/\D/g, "");
  if (!customerDigits.startsWith("55") && customerDigits.length >= 10 && customerDigits.length <= 11) {
    customerDigits = `55${customerDigits}`;
  }

  // Destino exato de envio no WhatsApp: mantém @lid ou @s.whatsapp.net para evitar 'Aguardando mensagem'
  const destinationJid = isLid
    ? (rawRemoteJid.endsWith("@lid") ? rawRemoteJid : `${senderDigits}@lid`)
    : (rawRemoteJid.endsWith("@s.whatsapp.net") ? rawRemoteJid : `${customerDigits}@s.whatsapp.net`);

  // 4. Extrai texto da mensagem
  const rawMsg = item?.message ?? rawData?.message ?? payload?.message ?? {};
  const incomingText = extractMessageText(rawMsg, item?.body || rawData?.body || payload?.body);

  if (!incomingText) {
    return { handled: false, ignored: "empty_text" };
  }

  // 5. Anti-Duplicação rápida (1.2s debounce por telefone + dedup por ID)
  const messageId = String(key?.id || item?.id || "");
  if (isDuplicateMessage(messageId, customerDigits)) {
    console.log(`[WhatsApp Engine] 🛡️ Mensagem duplicada ignorada para ${customerDigits} (ID: ${messageId}).`);
    return { handled: false, ignored: "duplicate_suppressed" };
  }

  const pushName = item?.pushName || rawData?.pushName || payload?.pushName || "Cliente";
  console.log(`[WhatsApp Engine] 📩 Mensagem de ${customerDigits} [${destinationJid}] (${pushName}): "${incomingText}"`);

  // 6. Carrega usuário do sistema e configurações
  const targetUserId = await resolveTargetUserId(queryUserId, instance);
  const botConfig = await loadBotConfig(supabaseAdmin, targetUserId);

  if (!botConfig.enabled) {
    console.log(`[WhatsApp Engine] Robô desativado no painel para usuário ${targetUserId}.`);
    return { handled: false, ignored: "bot_disabled" };
  }

  // 7. Processa a mensagem e gera a resposta oficial
  const botResult = await processBotMessage(supabaseAdmin, targetUserId, {
    phone: customerDigits,
    text: incomingText,
    pushName,
  });

  if (!botResult?.reply && !botResult?.interactive) {
    return { handled: true, action: "no_reply_needed" };
  }

  // 8. Envia mensagem interativa (Botões ou Lista) ou mensagem de texto oficial
  if (botResult.interactive) {
    if (botResult.interactive.type === "buttons") {
      console.log(`[WhatsApp Engine] 🔘 Enviando botões interativos para ${destinationJid}...`);
      const btns = botResult.interactive.buttons.map((b) => ({
        id: b.id,
        displayText: b.displayText,
        type: (b.type || (b.copyCode ? "copy" : b.url ? "url" : "reply")) as "reply" | "copy" | "url",
        copyCode: b.copyCode,
        url: b.url,
      }));
      await sendWhatsAppButtons(
        destinationJid,
        {
          title: botResult.interactive.title,
          description: botResult.reply,
          footer: botResult.interactive.footer,
          buttons: btns,
        },
        instance || undefined,
      );
    } else if (botResult.interactive.type === "list") {
      console.log(`[WhatsApp Engine] 📋 Enviando lista interativa para ${destinationJid}...`);
      await sendWhatsAppList(
        destinationJid,
        {
          title: botResult.interactive.title,
          description: botResult.reply,
          buttonText: botResult.interactive.buttonText,
          footerText: botResult.interactive.footerText,
          sections: botResult.interactive.sections,
        },
        instance || undefined,
      );
    }
  } else if (botResult.reply) {
    console.log(`[WhatsApp Engine] 📤 Enviando resposta texto para ${destinationJid} (${customerDigits})...`);
    const sendRes = await sendWhatsAppText(destinationJid, botResult.reply, instance || undefined, key);
    if (!sendRes.ok) {
      console.warn(`[WhatsApp Engine] ⚠️ Aviso ao enviar texto:`, sendRes.error);
    }
  }

  // 9. Envia imagem do QR Code PIX separada da mensagem de botão
  if (botResult.media?.base64 && PIX_MEDIA_ACTIONS.has(String(botResult.action))) {
    try {
      console.log(`[WhatsApp Engine] 📸 Enviando QR Code PIX separado para ${destinationJid}...`);
      await sendWhatsAppMedia(
        destinationJid,
        {
          base64: botResult.media.base64,
          caption: botResult.media.caption || "📱 *QR Code PIX*\nAponte a câmera do app do seu banco para pagar!",
          mimetype: "image/png",
          fileName: "qrcode-pix.png",
        },
        instance || undefined,
      );
    } catch (mediaErr) {
      console.warn(`[WhatsApp Engine] Aviso ao enviar mídia:`, mediaErr);
    }
  }

  // 10. Envia mensagens adicionais (apenas se estritamente configurado e sem botão de cópia)
  const interactiveButtons =
    botResult.interactive && botResult.interactive.type === "buttons" ? botResult.interactive.buttons : [];
  const hasCopyButton = interactiveButtons.some((b) => b.type === "copy" || b.copyCode);
  if (!hasCopyButton && Array.isArray(botResult.extraMessages)) {
    for (const extra of botResult.extraMessages) {
      if (extra && extra.trim()) {
        await sendWhatsAppText(destinationJid, extra, instance || undefined);
      }
    }
  }

  // 11. Registra no banco de dados para auditoria do revendedor
  try {
    await supabaseAdmin.from("message_logs").insert({
      user_id: targetUserId,
      phone: customerDigits,
      body: botResult.reply,
      status: "sent",
    });
  } catch {}

  return {
    handled: true,
    action: botResult.action,
    reply: botResult.reply,
    phone: customerDigits,
  };
}
