import { onlyDigits } from "./phone";

export type IncomingWhatsAppMessage = {
  event: string;
  instance: string;
  messageId: string;
  fromMe: boolean;
  isGroup: boolean;
  senderJid: string;
  phone: string;
  pushName: string;
  text: string;
};

function unwrapMessage(raw: any): any {
  if (!raw || typeof raw !== "object") return {};
  const nested =
    raw.ephemeralMessage?.message ??
    raw.viewOnceMessage?.message ??
    raw.viewOnceMessageV2?.message ??
    raw.viewOnceMessageV2Extension?.message ??
    raw.documentWithCaptionMessage?.message;
  return nested ? unwrapMessage(nested) : raw;
}

function textFromMessage(raw: any, fallback = ""): string {
  const message = unwrapMessage(raw);
  let text = String(
    message.conversation ??
      message.extendedTextMessage?.text ??
      message.imageMessage?.caption ??
      message.videoMessage?.caption ??
      message.buttonsResponseMessage?.selectedButtonId ??
      message.buttonsResponseMessage?.selectedDisplayText ??
      message.listResponseMessage?.singleSelectReply?.selectedRowId ??
      message.templateButtonReplyMessage?.selectedId ??
      message.interactiveResponseMessage?.body?.text ??
      fallback ??
      "",
  ).trim();

  const paramsJson = message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (!text && paramsJson) {
    try {
      const parsed = JSON.parse(paramsJson);
      text = String(parsed.id ?? parsed.selectedId ?? parsed.rowId ?? "").trim();
    } catch {
      text = "";
    }
  }
  return text;
}

const lidPhoneCache = new Map<string, { phone: string; expiresAt: number }>();

function rememberLidPhone(lid: unknown, phone: string) {
  const lidDigits = onlyDigits(String(lid ?? "").replace(/@.*$/, ""));
  if (!String(lid ?? "").endsWith("@lid") || !lidDigits || !phone) return;
  lidPhoneCache.set(lidDigits, { phone, expiresAt: Date.now() + 60 * 60_000 });
}

function cachedPhoneFromLid(lid: unknown): string {
  const value = String(lid ?? "").trim();
  if (!value.endsWith("@lid")) return "";
  const cached = lidPhoneCache.get(onlyDigits(value.replace(/@.*$/, "")));
  if (!cached || cached.expiresAt <= Date.now()) return "";
  return cached.phone;
}

function phoneFromJids(...values: unknown[]): string {
  const candidates = values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  for (const value of candidates) {
    if (value.endsWith("@lid")) continue;
    let digits = onlyDigits(value.replace(/@.*$/, ""));
    if (digits.length >= 10 && digits.length <= 13) {
      if (!digits.startsWith("55") && digits.length <= 11) digits = `55${digits}`;
      return digits;
    }
  }

  // Nunca use @lid como telefone ou destino. Sem um número real, o evento
  // será ignorado em vez de abrir uma sessão Signal incompatível.
  return "";
}

/** Normaliza os formatos MESSAGES_UPSERT usados pela Evolution v1 e v2. */
export function parseEvolutionMessages(payload: any): IncomingWhatsAppMessage[] {
  if (!payload || typeof payload !== "object") return [];

  const event = String(payload.event ?? payload.type ?? "").toUpperCase().replace(/[.-]/g, "_");
  if (event && event !== "MESSAGES_UPSERT" && event !== "MESSAGE_UPSERT") return [];

  const root = payload.data ?? payload;
  const entries = Array.isArray(root) ? root : Array.isArray(root.messages) ? root.messages : [root];
  const instance = String(payload.instance ?? root.instance ?? "").trim();

  return entries.map((entry: any) => {
    const key = entry?.key ?? {};
    const originalJid = String(key.remoteJid ?? entry.remoteJid ?? "").trim();
    const previousRemoteJid = String(
      key.previousRemoteJid ?? entry.previousRemoteJid ?? key.remoteJidAlt ?? entry.remoteJidAlt ?? "",
    ).trim();

    let phone = phoneFromJids(
      key.senderPn,
      entry.senderPn,
      key.remoteJidAlt,
      entry.remoteJidAlt,
      key.participant,
      entry.participant,
      originalJid,
    );

    // Quando a Evolution entrega número + previousRemoteJid, guarda a relação
    // apenas para resolver eventos seguintes. O envio continua sempre no PN.
    if (phone) {
      rememberLidPhone(previousRemoteJid, phone);
      rememberLidPhone(originalJid, phone);
    } else {
      phone = cachedPhoneFromLid(originalJid) || cachedPhoneFromLid(previousRemoteJid);
    }

    const senderJid = phone ? `${phone}@s.whatsapp.net` : "";

    return {
      event,
      instance,
      messageId: String(key.id ?? entry.id ?? entry.messageId ?? ""),
      fromMe: Boolean(key.fromMe ?? entry.fromMe),
      isGroup: originalJid.endsWith("@g.us") || originalJid.includes("@broadcast"),
      senderJid,
      phone,
      pushName: String(entry.pushName ?? root.pushName ?? payload.pushName ?? "Cliente"),
      text: textFromMessage(entry.message ?? root.message ?? payload.message, entry.body ?? root.body ?? payload.body),
    };
  });
}